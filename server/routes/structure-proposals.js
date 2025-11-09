const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { metricsCollector } = require('../middleware/monitoring');

const router = express.Router({ mergeParams: true });

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// Middleware to check document access (owner or collaborator)
const requireDocumentAccess = (req, res, next) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const userId = req.user.id;

  const query = `
    SELECT d.id FROM documents d
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id
    WHERE d.id = ? AND (d.owner_id = ? OR dc.user_id = ?)
  `;

  db.get(query, [documentId, userId, userId], (err, document) => {
    if (err) {
      console.error('Error checking document access:', err);
      return res.status(500).json({ error: 'Access check failed' });
    }

    if (!document) {
      return res.status(403).json({ error: 'Access denied to this document' });
    }

    next();
  });
};

// Get all structure proposals for a document
router.get('/', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;

  const query = `
    SELECT sp.*,
           u.name as user_name,
           u.email as user_email
    FROM structure_proposals sp
    JOIN users u ON sp.user_id = u.id
    WHERE sp.document_id = ?
    ORDER BY sp.created_at DESC
  `;

  db.all(query, [documentId], (err, structureProposals) => {
    if (err) {
      console.error('Error fetching structure proposals:', err);
      return res.status(500).json({ error: 'Failed to fetch structure proposals' });
    }

    // Enrich each structure proposal with operations, votes, and comments
    const enrichStructureProposal = (sp) => {
      return new Promise((resolve) => {
        const operationsQuery = `
          SELECT * FROM structure_operations
          WHERE structure_proposal_id = ?
          ORDER BY created_at ASC
        `;

        const votesQuery = `
          SELECT v.*,
                 u.name as user_name,
                 u.email as user_email
          FROM structure_proposal_votes v
          LEFT JOIN users u ON v.user_id = u.id
          WHERE v.structure_proposal_id = ?
          ORDER BY v.created_at ASC
        `;

        const commentsQuery = `
          SELECT c.*,
                 u.name as user_name,
                 u.email as user_email,
                 pc.user_id as parent_user_id,
                 pu.name as parent_user_name
          FROM structure_proposal_comments c
          LEFT JOIN users u ON c.user_id = u.id
          LEFT JOIN structure_proposal_comments pc ON c.parent_id = pc.id
          LEFT JOIN users pu ON pc.user_id = pu.id
          WHERE c.structure_proposal_id = ?
          ORDER BY c.created_at ASC
        `;

        Promise.all([
          new Promise(resolveOps => {
            db.all(operationsQuery, [sp.id], (err, operations) => {
              if (err) {
                console.error('Error fetching operations:', err);
                return resolveOps([]);
              }
              resolveOps(operations || []);
            });
          }),
          new Promise(resolveVotes => {
            db.all(votesQuery, [sp.id], (err, votes) => {
              if (err) {
                console.error('Error fetching votes:', err);
                return resolveVotes([]);
              }
              const enrichedVotes = (votes || []).map(vote => ({
                ...vote,
                user: {
                  id: vote.user_id,
                  name: vote.user_name,
                  email: vote.user_email
                }
              }));
              resolveVotes(enrichedVotes);
            });
          }),
          new Promise(resolveComments => {
            db.all(commentsQuery, [sp.id], (err, comments) => {
              if (err) {
                console.error('Error fetching comments:', err);
                return resolveComments([]);
              }
              const enrichedComments = (comments || []).map(comment => ({
                ...comment,
                user: {
                  id: comment.user_id,
                  name: comment.user_name,
                  email: comment.user_email
                },
                parent: comment.parent_id ? {
                  id: comment.parent_id,
                  user: {
                    id: comment.parent_user_id,
                    name: comment.parent_user_name
                  }
                } : null,
                replies: []
              }));
              resolveComments(enrichedComments);
            });
          })
        ]).then(([operations, votes, comments]) => {
          resolve({
            ...sp,
            user: {
              id: sp.user_id,
              name: sp.user_name,
              email: sp.user_email
            },
            operations,
            votes,
            comments
          });
        });
      });
    };

    Promise.all(structureProposals.map(enrichStructureProposal)).then(enrichedProposals => {
      res.json({ structureProposals: enrichedProposals });
    });
  });
});

// Create a new structure proposal
router.post('/', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const { title, description, operations } = req.body;
  const userId = req.user.id;

  if (!title || !operations || !Array.isArray(operations) || operations.length === 0) {
    return res.status(400).json({ error: 'Title and operations are required' });
  }

  // Check if there's already an active (non-approved, non-applied) structure proposal
  const activeProposalQuery = `
    SELECT id FROM structure_proposals
    WHERE document_id = ? AND approved = 0 AND applied = 0
  `;

  db.get(activeProposalQuery, [documentId], (err, activeProposal) => {
    if (err) {
      console.error('Error checking active proposals:', err);
      return res.status(500).json({ error: 'Failed to check active proposals' });
    }

    if (activeProposal) {
      return res.status(409).json({ error: 'There is already an active structure proposal for this document' });
    }

    // Validate operations
    for (const op of operations) {
      if (!op.operation_type || !['MOVE', 'MERGE', 'SPLIT', 'DELETE', 'RENAME_HEADING', 'CHANGE_HEADING_LEVEL', 'INSERT_NEW'].includes(op.operation_type)) {
        return res.status(400).json({ error: `Invalid operation type: ${op.operation_type}` });
      }
    }

    const structureProposalId = uuidv4();

    // Create structure proposal
    db.run(`
      INSERT INTO structure_proposals (id, document_id, user_id, title, description)
      VALUES (?, ?, ?, ?, ?)
    `, [structureProposalId, documentId, userId, title, description || null], function(err) {
      if (err) {
        console.error('Error creating structure proposal:', err);
        return res.status(500).json({ error: 'Failed to create structure proposal' });
      }

      // Insert operations
      let operationsInserted = 0;
      const totalOperations = operations.length;

      if (totalOperations === 0) {
        // No operations to insert, return success
        return res.status(201).json({
          structureProposal: {
            id: structureProposalId,
            documentId,
            userId,
            title,
            description,
            operations: [],
            votes: [],
            comments: []
          }
        });
      }

      operations.forEach(op => {
        const operationId = uuidv4();
        db.run(`
          INSERT INTO structure_operations (
            id, structure_proposal_id, operation_type, source_paragraph_ids,
            target_paragraph_id, new_position_index, new_parent_id,
            new_text, new_heading_level, operation_data
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          operationId,
          structureProposalId,
          op.operation_type,
          op.source_paragraph_ids ? JSON.stringify(op.source_paragraph_ids) : null,
          op.target_paragraph_id || null,
          op.new_position_index || null,
          op.new_parent_id || null,
          op.new_text || null,
          op.new_heading_level || null,
          op.operation_data ? JSON.stringify(op.operation_data) : null
        ], (opErr) => {
          if (opErr) {
            console.error('Error inserting operation:', opErr);
            return res.status(500).json({ error: 'Failed to create structure proposal operations' });
          }

          operationsInserted++;
          if (operationsInserted === totalOperations) {
            // All operations inserted, return success
            res.status(201).json({
              structureProposal: {
                id: structureProposalId,
                documentId,
                userId,
                title,
                description,
                operations: operations.map(op => ({ ...op, id: operationId })),
                votes: [],
                comments: []
              }
            });

            // Record metrics
            metricsCollector.recordBusinessEvent('structure_proposal_created', {
              structureProposalId,
              documentId,
              userId,
              operationCount: totalOperations
            });
          }
        });
      });
    });
  });
});

// Get a specific structure proposal
router.get('/:proposalId', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const { documentId, proposalId } = req.params;

  const query = `
    SELECT sp.*,
           u.name as user_name,
           u.email as user_email
    FROM structure_proposals sp
    JOIN users u ON sp.user_id = u.id
    WHERE sp.id = ? AND sp.document_id = ?
  `;

  db.get(query, [proposalId, documentId], (err, structureProposal) => {
    if (err) {
      console.error('Error fetching structure proposal:', err);
      return res.status(500).json({ error: 'Failed to fetch structure proposal' });
    }

    if (!structureProposal) {
      return res.status(404).json({ error: 'Structure proposal not found' });
    }

    // Enrich with operations, votes, and comments (same as above)
    const operationsQuery = `SELECT * FROM structure_operations WHERE structure_proposal_id = ? ORDER BY created_at ASC`;
    const votesQuery = `
      SELECT v.*, u.name as user_name, u.email as user_email
      FROM structure_proposal_votes v
      LEFT JOIN users u ON v.user_id = u.id
      WHERE v.structure_proposal_id = ?
      ORDER BY v.created_at ASC
    `;
    const commentsQuery = `
      SELECT c.*, u.name as user_name, u.email as user_email,
             pc.user_id as parent_user_id, pu.name as parent_user_name
      FROM structure_proposal_comments c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN structure_proposal_comments pc ON c.parent_id = pc.id
      LEFT JOIN users pu ON pc.user_id = pu.id
      WHERE c.structure_proposal_id = ?
      ORDER BY c.created_at ASC
    `;

    Promise.all([
      new Promise(resolveOps => db.all(operationsQuery, [proposalId], (err, ops) => resolveOps(ops || []))),
      new Promise(resolveVotes => db.all(votesQuery, [proposalId], (err, votes) => {
        if (err) return resolveVotes([]);
        const enrichedVotes = votes.map(vote => ({
          ...vote,
          user: { id: vote.user_id, name: vote.user_name, email: vote.user_email }
        }));
        resolveVotes(enrichedVotes);
      })),
      new Promise(resolveComments => db.all(commentsQuery, [proposalId], (err, comments) => {
        if (err) return resolveComments([]);
        const enrichedComments = comments.map(comment => ({
          ...comment,
          user: { id: comment.user_id, name: comment.user_name, email: comment.user_email },
          parent: comment.parent_id ? {
            id: comment.parent_id,
            user: { id: comment.parent_user_id, name: comment.parent_user_name }
          } : null,
          replies: []
        }));
        resolveComments(enrichedComments);
      }))
    ]).then(([operations, votes, comments]) => {
      const result = {
        ...structureProposal,
        user: {
          id: structureProposal.user_id,
          name: structureProposal.user_name,
          email: structureProposal.user_email
        },
        operations,
        votes,
        comments
      };
      res.json({ structureProposal: result });
    });
  });
});

// Vote on a structure proposal
router.post('/:proposalId/vote', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const { documentId, proposalId } = req.params;
  const { vote } = req.body;
  const userId = req.user.id;

  if (!['PRO', 'NEUTRAL', 'CONTRA'].includes(vote)) {
    return res.status(400).json({ error: 'Invalid vote type. Must be PRO, NEUTRAL, or CONTRA' });
  }

  // Check if structure proposal exists and is not applied
  const proposalQuery = `
    SELECT id, applied FROM structure_proposals
    WHERE id = ? AND document_id = ?
  `;

  db.get(proposalQuery, [proposalId, documentId], (err, proposal) => {
    if (err) {
      console.error('Error fetching structure proposal:', err);
      return res.status(500).json({ error: 'Failed to check structure proposal' });
    }

    if (!proposal) {
      return res.status(404).json({ error: 'Structure proposal not found' });
    }

    if (proposal.applied) {
      return res.status(400).json({ error: 'Cannot vote on an already applied structure proposal' });
    }

    // Insert or update vote
    const voteId = uuidv4();
    db.run(`
      INSERT OR REPLACE INTO structure_proposal_votes (id, structure_proposal_id, user_id, vote)
      VALUES (?, ?, ?, ?)
    `, [voteId, proposalId, userId, vote], function(err) {
      if (err) {
        console.error('Error casting vote:', err);
        return res.status(500).json({ error: 'Failed to cast vote' });
      }

      // Check if proposal should be approved based on document threshold
      checkAndUpdateStructureProposalApproval(db, documentId, proposalId, () => {
        res.json({ message: 'Vote recorded successfully' });
      });
    });
  });
});

// Apply an approved structure proposal
router.post('/:proposalId/apply', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const { documentId, proposalId } = req.params;
  const userId = req.user.id;

  // Check if user is document owner (only owner can apply)
  db.get('SELECT owner_id FROM documents WHERE id = ?', [documentId], (err, document) => {
    if (err) {
      console.error('Error checking document ownership:', err);
      return res.status(500).json({ error: 'Failed to check document ownership' });
    }

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.owner_id !== userId) {
      return res.status(403).json({ error: 'Only document owner can apply structure proposals' });
    }

    // Check if proposal is approved and not applied
    const proposalQuery = `
      SELECT id, approved, applied FROM structure_proposals
      WHERE id = ? AND document_id = ?
    `;

    db.get(proposalQuery, [proposalId, documentId], (err, proposal) => {
      if (err) {
        console.error('Error fetching structure proposal:', err);
        return res.status(500).json({ error: 'Failed to check structure proposal' });
      }

      if (!proposal) {
        return res.status(404).json({ error: 'Structure proposal not found' });
      }

      if (!proposal.approved) {
        return res.status(400).json({ error: 'Cannot apply unapproved structure proposal' });
      }

      if (proposal.applied) {
        return res.status(400).json({ error: 'Structure proposal already applied' });
      }

      // Apply the structure changes
      applyStructureProposal(db, documentId, proposalId, (applyErr) => {
        if (applyErr) {
          return res.status(500).json({ error: applyErr.message });
        }

        // Mark proposal as applied
        db.run(`
          UPDATE structure_proposals SET applied = 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [proposalId], (updateErr) => {
          if (updateErr) {
            console.error('Error marking proposal as applied:', updateErr);
            return res.status(500).json({ error: 'Failed to mark proposal as applied' });
          }

          res.json({ message: 'Structure proposal applied successfully' });

          metricsCollector.recordBusinessEvent('structure_proposal_applied', {
            structureProposalId: proposalId,
            documentId,
            userId
          });
        });
      });
    });
  });
});

// Add comment to structure proposal
router.post('/:proposalId/comments', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const { documentId, proposalId } = req.params;
  const { text, parentId } = req.body;
  const userId = req.user.id;

  if (!text || text.trim() === '') {
    return res.status(400).json({ error: 'Comment text is required' });
  }

  // Check if structure proposal exists
  db.get(`
    SELECT id FROM structure_proposals
    WHERE id = ? AND document_id = ?
  `, [proposalId, documentId], (err, proposal) => {
    if (err) {
      console.error('Error checking structure proposal:', err);
      return res.status(500).json({ error: 'Failed to check structure proposal' });
    }

    if (!proposal) {
      return res.status(404).json({ error: 'Structure proposal not found' });
    }

    const commentId = uuidv4();
    db.run(`
      INSERT INTO structure_proposal_comments (id, structure_proposal_id, user_id, text, parent_id)
      VALUES (?, ?, ?, ?, ?)
    `, [commentId, proposalId, userId, text.trim(), parentId || null], function(err) {
      if (err) {
        console.error('Error adding comment:', err);
        return res.status(500).json({ error: 'Failed to add comment' });
      }

      res.status(201).json({ message: 'Comment added successfully' });
    });
  });
});

// Helper function to check and update structure proposal approval
function checkAndUpdateStructureProposalApproval(db, documentId, proposalId, callback) {
  // Get document threshold
  db.get('SELECT acceptance_threshold FROM documents WHERE id = ?', [documentId], (err, document) => {
    if (err) {
      console.error('Error fetching document threshold:', err);
      return callback();
    }

    const threshold = document ? document.acceptance_threshold || 75.0 : 75.0;

    // Count total collaborators
    const collaboratorQuery = `
      SELECT COUNT(*) as total FROM (
        SELECT owner_id as user_id FROM documents WHERE id = ?
        UNION
        SELECT user_id FROM document_collaborators WHERE document_id = ?
      )
    `;

    db.get(collaboratorQuery, [documentId, documentId], (err, result) => {
      if (err) {
        console.error('Error counting collaborators:', err);
        return callback();
      }

      const totalCollaborators = result.total || 1;

      // Count PRO votes
      const proVoteQuery = `
        SELECT COUNT(*) as pro_count FROM structure_proposal_votes
        WHERE structure_proposal_id = ? AND vote = 'PRO'
      `;

      db.get(proVoteQuery, [proposalId], (err, voteResult) => {
        if (err) {
          console.error('Error counting PRO votes:', err);
          return callback();
        }

        const proVotes = voteResult.pro_count || 0;
        const approvalPercentage = (proVotes / totalCollaborators) * 100;

        // Check if approved
        if (approvalPercentage >= threshold) {
          db.run(`
            UPDATE structure_proposals SET approved = 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [proposalId], (updateErr) => {
            if (updateErr) {
              console.error('Error updating proposal approval:', updateErr);
            }
            callback();
          });
        } else {
          callback();
        }
      });
    });
  });
}

// Helper function to apply structure proposal changes
function applyStructureProposal(db, documentId, proposalId, callback) {
  // Get all operations for this proposal
  const operationsQuery = `
    SELECT * FROM structure_operations
    WHERE structure_proposal_id = ?
    ORDER BY
      CASE operation_type
        WHEN 'DELETE' THEN 1
        WHEN 'MERGE' THEN 2
        WHEN 'SPLIT' THEN 3
        WHEN 'MOVE' THEN 4
        WHEN 'RENAME_HEADING' THEN 5
        WHEN 'CHANGE_HEADING_LEVEL' THEN 6
        WHEN 'INSERT_NEW' THEN 7
        ELSE 8
      END,
      created_at ASC
  `;

  db.all(operationsQuery, [proposalId], (err, operations) => {
    if (err) {
      console.error('Error fetching operations:', err);
      return callback(new Error('Failed to fetch operations'));
    }

    if (!operations || operations.length === 0) {
      return callback(); // Nothing to apply
    }

    // Execute operations in order
    let completed = 0;
    const total = operations.length;
    let hasError = false;

    operations.forEach(operation => {
      if (hasError) return;

      executeOperation(db, documentId, operation, (opErr) => {
        if (opErr) {
          console.error('Error executing operation:', opErr);
          hasError = true;
          return callback(opErr);
        }

        completed++;
        if (completed === total) {
          // After all operations are applied, invalidate affected paragraph proposals
          invalidateAffectedProposals(db, documentId, operations, (invalidateErr) => {
            if (invalidateErr) {
              console.error('Error invalidating affected proposals:', invalidateErr);
              // Don't fail the whole operation for this
            }
            callback(); // All operations completed
          });
        }
      });
    });
  });
}

// Helper function to invalidate paragraph proposals affected by structure changes
function invalidateAffectedProposals(db, documentId, operations, callback) {
  // Get all paragraph IDs affected by the operations
  const affectedParagraphIds = new Set();

  operations.forEach(op => {
    if (op.target_paragraph_id) {
      affectedParagraphIds.add(op.target_paragraph_id);
    }
    if (op.source_paragraph_ids) {
      const sourceIds = JSON.parse(op.source_paragraph_ids);
      sourceIds.forEach(id => affectedParagraphIds.add(id));
    }
  });

  if (affectedParagraphIds.size === 0) {
    return callback(); // No paragraphs affected
  }

  const idsList = Array.from(affectedParagraphIds);
  const placeholders = idsList.map(() => '?').join(',');

  // Mark proposals for affected paragraphs as invalidated (we'll add an invalidated flag to proposals table)
  // For now, we'll just log this - in a real implementation, you might want to add an invalidated column
  console.log('Invalidating proposals for paragraphs:', idsList);

  // Check if proposals table has an invalidated column, if not, we'll skip this for now
  db.all(`
    PRAGMA table_info(proposals)
  `, (err, columns) => {
    if (err) {
      console.error('Error checking proposals table schema:', err);
      return callback();
    }

    const hasInvalidatedColumn = columns.some(col => col.name === 'invalidated');

    if (!hasInvalidatedColumn) {
      console.log('Proposals table does not have invalidated column, skipping invalidation');
      return callback();
    }

    // Invalidate proposals for affected paragraphs
    db.run(`
      UPDATE proposals SET invalidated = 1, updated_at = CURRENT_TIMESTAMP
      WHERE paragraph_id IN (${placeholders})
    `, idsList, (updateErr) => {
      if (updateErr) {
        console.error('Error invalidating proposals:', updateErr);
        return callback(updateErr);
      }

      console.log(`Invalidated proposals for ${idsList.length} affected paragraphs`);
      callback();
    });
  });
}

// Helper function to execute individual operations
function executeOperation(db, documentId, operation, callback) {
  const { operation_type, source_paragraph_ids, target_paragraph_id, new_position_index, new_parent_id, new_text, new_heading_level, operation_data } = operation;

  switch (operation_type) {
    case 'DELETE':
      if (!target_paragraph_id) return callback(new Error('DELETE operation missing target_paragraph_id'));

      // Mark paragraph as deleted by setting text to empty and updating order
      db.run(`
        UPDATE paragraphs SET text = '', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND document_id = ?
      `, [target_paragraph_id, documentId], callback);
      break;

    case 'MERGE':
      if (!source_paragraph_ids || !target_paragraph_id) return callback(new Error('MERGE operation missing required fields'));

      const sourceIds = JSON.parse(source_paragraph_ids);
      if (!Array.isArray(sourceIds) || sourceIds.length === 0) return callback(new Error('Invalid source_paragraph_ids'));

      // Get text from all source paragraphs
      const placeholders = sourceIds.map(() => '?').join(',');
      const textQuery = `SELECT text FROM paragraphs WHERE id IN (${placeholders}) AND document_id = ?`;

      db.all(textQuery, [...sourceIds, documentId], (err, paragraphs) => {
        if (err) return callback(err);

        const mergedText = paragraphs.map(p => p.text).join('\n\n');

        // Update target paragraph with merged text
        db.run(`
          UPDATE paragraphs SET text = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND document_id = ?
        `, [mergedText, target_paragraph_id, documentId], (updateErr) => {
          if (updateErr) return callback(updateErr);

          // Delete source paragraphs (set to empty)
          sourceIds.forEach(sourceId => {
            if (sourceId !== target_paragraph_id) {
              db.run(`
                UPDATE paragraphs SET text = '', updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND document_id = ?
              `, [sourceId, documentId]);
            }
          });

          callback();
        });
      });
      break;

    case 'MOVE':
      if (!target_paragraph_id || new_position_index === null) return callback(new Error('MOVE operation missing required fields'));

      // Update paragraph position
      db.run(`
        UPDATE paragraphs SET order_index = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND document_id = ?
      `, [new_position_index, target_paragraph_id, documentId], callback);
      break;

    case 'RENAME_HEADING':
      if (!target_paragraph_id || !new_text) return callback(new Error('RENAME_HEADING operation missing required fields'));

      db.run(`
        UPDATE paragraphs SET title = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND document_id = ?
      `, [new_text, target_paragraph_id, documentId], callback);
      break;

    case 'CHANGE_HEADING_LEVEL':
      if (!target_paragraph_id || !new_heading_level) return callback(new Error('CHANGE_HEADING_LEVEL operation missing required fields'));

      db.run(`
        UPDATE paragraphs SET heading_level = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND document_id = ?
      `, [new_heading_level, target_paragraph_id, documentId], callback);
      break;

    case 'INSERT_NEW':
      if (!new_text || new_position_index === null) return callback(new Error('INSERT_NEW operation missing required fields'));

      const newParagraphId = uuidv4();
      db.run(`
        INSERT INTO paragraphs (id, document_id, text, order_index, heading_level)
        VALUES (?, ?, ?, ?, ?)
      `, [newParagraphId, documentId, new_text, new_position_index, new_heading_level || null], callback);
      break;

    case 'SPLIT':
      // Complex operation - would need operation_data to specify split points
      callback(new Error('SPLIT operation not yet implemented'));
      break;

    default:
      callback(new Error(`Unknown operation type: ${operation_type}`));
  }
}

module.exports = router;

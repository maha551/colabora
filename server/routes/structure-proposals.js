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
  console.log('GET /structure-proposals called for document:', req.params.documentId);
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

  console.log('Executing query:', query, 'with params:', [documentId]);

  db.all(query, [documentId], (err, structureProposals) => {
    console.log('Query result - err:', err, 'rows:', structureProposals ? structureProposals.length : 'undefined');

    if (err) {
      // If table doesn't exist, return empty array
      if (err.code === 'SQLITE_ERROR' && err.message.includes('no such table')) {
        console.log('Structure proposals table does not exist yet, returning empty array');
        return res.json({ structureProposals: [] });
      }
      console.error('Error fetching structure proposals:', err);
      return res.status(500).json({ error: 'Failed to fetch structure proposals' });
    }

    // Get document voting_anonymous setting
    const userId = req.user.id;
    db.get(`SELECT voting_anonymous FROM documents WHERE id = ?`, [documentId], (docErr, doc) => {
      const isAnonymous = doc?.voting_anonymous === 1;

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
                // If table doesn't exist, return empty votes
                if (err.code === 'SQLITE_ERROR' && err.message.includes('no such table')) {
                  return resolveVotes([]);
                }
                console.error('Error fetching votes:', err);
                return resolveVotes([]);
              }
              const enrichedVotes = (votes || []).map(vote => {
                const voteData = { ...vote };
                // Hide user info if voting is anonymous
                if (!isAnonymous) {
                  voteData.user = {
                    id: vote.user_id,
                    name: vote.user_name,
                    email: vote.user_email
                  };
                } else {
                  // In anonymous mode, only include userId for the current user's own vote
                  if (vote.user_id === userId) {
                    voteData.userId = vote.user_id;
                  }
                  // Don't include user object for other users
                }
                return voteData;
              });
              resolveVotes(enrichedVotes);
            });
          }),
          new Promise(resolveComments => {
            db.all(commentsQuery, [sp.id], (err, comments) => {
              if (err) {
                // If table doesn't exist, return empty comments
                if (err.code === 'SQLITE_ERROR' && err.message.includes('no such table')) {
                  return resolveComments([]);
                }
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
        console.log('Sending response with', enrichedProposals.length, 'structure proposals');
        res.json({ structureProposals: enrichedProposals });
      });
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
    // Handle case where structure_proposals table might not exist yet (during migration)
    const activeProposalQuery = `
      SELECT id FROM structure_proposals
      WHERE document_id = ? AND approved = 0 AND applied = 0
    `;

    db.get(activeProposalQuery, [documentId], (err, activeProposal) => {
      if (err) {
        // If table doesn't exist, allow creation (table will be created on first use)
        if (err.code === 'SQLITE_ERROR' && err.message.includes('no such table')) {
          console.log('Structure proposals table does not exist yet, allowing creation');
          // Continue to create the proposal (table will be auto-created)
        } else {
          console.error('Error checking active proposals:', err);
          return res.status(500).json({ error: 'Failed to check active proposals' });
        }
      } else if (activeProposal) {
        return res.status(409).json({ error: 'There is already an active structure proposal for this document' });
      }

      // Validate operations
      for (const op of operations) {
        // Handle both camelCase (client) and snake_case (legacy)
        const operationType = op.operation_type || op.operationType;
        if (!operationType || !['MOVE', 'MERGE', 'SPLIT', 'DELETE', 'RENAME_HEADING', 'CHANGE_HEADING_LEVEL', 'INSERT_NEW'].includes(operationType)) {
          return res.status(400).json({ error: `Invalid operation type: ${operationType}` });
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
          // Handle both camelCase and snake_case
          const operationType = op.operation_type || op.operationType;
          const sourceParagraphIds = op.source_paragraph_ids || op.sourceParagraphIds;
          const targetParagraphId = op.target_paragraph_id || op.targetParagraphId;
          const newPositionIndex = op.new_position_index || op.newPositionIndex;
          const newParentId = op.new_parent_id || op.newParentId;
          const newText = op.new_text || op.newText;
          const newHeadingLevel = op.new_heading_level || op.newHeadingLevel;
          const operationData = op.operation_data || op.operationData;

          db.run(`
            INSERT INTO structure_operations (
              id, structure_proposal_id, operation_type, source_paragraph_ids,
              target_paragraph_id, new_position_index, new_parent_id,
              new_text, new_heading_level, operation_data
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            operationId,
            structureProposalId,
            operationType,
            sourceParagraphIds ? JSON.stringify(sourceParagraphIds) : null,
            targetParagraphId || null,
            newPositionIndex || null,
            newParentId || null,
            newText || null,
            newHeadingLevel || null,
            operationData ? JSON.stringify(operationData) : null
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

    // Get document voting_anonymous setting
    const userId = req.user.id;
    db.get(`SELECT voting_anonymous FROM documents WHERE id = ?`, [documentId], (docErr, doc) => {
      const isAnonymous = doc?.voting_anonymous === 1;

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
          const enrichedVotes = votes.map(vote => {
            const voteData = { ...vote };
            // Hide user info if voting is anonymous
            if (!isAnonymous) {
              voteData.user = { id: vote.user_id, name: vote.user_name, email: vote.user_email };
            } else {
              // In anonymous mode, only include userId for the current user's own vote
              if (vote.user_id === userId) {
                voteData.userId = vote.user_id;
              }
              // Don't include user object for other users
            }
            return voteData;
          });
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
      applyStructureProposal(db, documentId, proposalId, userId, (applyErr) => {
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

// Cancel/delete a structure proposal (only by creator)
router.delete('/:proposalId', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const { documentId, proposalId } = req.params;
  const userId = req.user.id;

  // Check if user is the creator of the proposal
  const creatorQuery = `
    SELECT user_id, applied FROM structure_proposals
    WHERE id = ? AND document_id = ?
  `;

  db.get(creatorQuery, [proposalId, documentId], (err, proposal) => {
    if (err) {
      // Handle table not existing
      if (err.code === 'SQLITE_ERROR' && err.message.includes('no such table')) {
        return res.status(404).json({ error: 'Structure proposal not found' });
      }
      console.error('Error checking proposal creator:', err);
      return res.status(500).json({ error: 'Failed to check proposal ownership' });
    }

    if (!proposal) {
      return res.status(404).json({ error: 'Structure proposal not found' });
    }

    if (proposal.user_id !== userId) {
      return res.status(403).json({ error: 'Only the proposal creator can delete it' });
    }

    if (proposal.applied) {
      return res.status(400).json({ error: 'Cannot delete an already applied proposal' });
    }

    // Delete the proposal and all related data
    const deleteOperations = 'DELETE FROM structure_operations WHERE structure_proposal_id = ?';
    const deleteVotes = 'DELETE FROM structure_proposal_votes WHERE structure_proposal_id = ?';
    const deleteComments = 'DELETE FROM structure_proposal_comments WHERE structure_proposal_id = ?';
    const deleteProposal = 'DELETE FROM structure_proposals WHERE id = ?';

    // Execute in sequence to avoid foreign key issues
    db.run(deleteOperations, [proposalId], (opErr) => {
      if (opErr && !opErr.message.includes('no such table')) {
        console.error('Error deleting operations:', opErr);
        return res.status(500).json({ error: 'Failed to delete proposal operations' });
      }

      db.run(deleteVotes, [proposalId], (voteErr) => {
        if (voteErr && !voteErr.message.includes('no such table')) {
          console.error('Error deleting votes:', voteErr);
          return res.status(500).json({ error: 'Failed to delete proposal votes' });
        }

        db.run(deleteComments, [proposalId], (commentErr) => {
          if (commentErr && !commentErr.message.includes('no such table')) {
            console.error('Error deleting comments:', commentErr);
            return res.status(500).json({ error: 'Failed to delete proposal comments' });
          }

          db.run(deleteProposal, [proposalId], (propErr) => {
            if (propErr) {
              console.error('Error deleting proposal:', propErr);
              return res.status(500).json({ error: 'Failed to delete proposal' });
            }

            res.json({ message: 'Structure proposal deleted successfully' });
          });
        });
      });
    });
  });
});

// Debug endpoint to check database state (temporary)
router.get('/debug/:documentId', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;

  // Check if structure_proposals table exists
  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='structure_proposals'", (tableErr, tables) => {
    if (tableErr) {
      return res.json({ error: 'Table check failed', tableErr: tableErr.message });
    }

    if (tables.length === 0) {
      return res.json({ tableExists: false, message: 'structure_proposals table does not exist' });
    }

    // Get all proposals for this document
    const query = `
      SELECT sp.*, u.name as creator_name
      FROM structure_proposals sp
      LEFT JOIN users u ON sp.user_id = u.id
      WHERE sp.document_id = ?
      ORDER BY sp.created_at DESC
    `;

    db.all(query, [documentId], (err, proposals) => {
      if (err) {
        return res.json({ error: 'Query failed', queryError: err.message });
      }

      // Count active proposals (not approved, not applied)
      const activeProposals = proposals.filter(p => p.approved === 0 && p.applied === 0);
      const approvedProposals = proposals.filter(p => p.approved === 1 && p.applied === 0);
      const appliedProposals = proposals.filter(p => p.applied === 1);

      res.json({
        tableExists: true,
        totalProposals: proposals.length,
        activeProposals: activeProposals.length,
        approvedProposals: approvedProposals.length,
        appliedProposals: appliedProposals.length,
        allProposals: proposals,
        activeDetails: activeProposals
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

// Helper function to create structure version snapshot
function createStructureVersion(db, documentId, proposalId, userId, operations, callback) {
  // Get current document structure before changes
  const structureQuery = `
    SELECT id, text, title, order_index, heading_level, created_at, updated_at
    FROM paragraphs
    WHERE document_id = ?
    ORDER BY order_index ASC
  `;

  db.all(structureQuery, [documentId], (err, paragraphs) => {
    if (err) {
      console.error('Error fetching current structure:', err);
      return callback(err);
    }

    const currentStructure = paragraphs.map(p => ({
      id: p.id,
      text: p.text,
      title: p.title,
      orderIndex: p.order_index,
      headingLevel: p.heading_level,
      createdAt: p.created_at,
      updatedAt: p.updated_at
    }));

    // Get next version number
    db.get('SELECT MAX(version_number) as max_version FROM document_structure_versions WHERE document_id = ?',
      [documentId], (verErr, result) => {
      if (verErr) {
        console.error('Error getting version number:', verErr);
        return callback(verErr);
      }

      const nextVersion = (result?.max_version || 0) + 1;
      const versionId = uuidv4();

      // Create version record
      db.run(`
        INSERT INTO document_structure_versions (
          id, document_id, version_number, created_by, structure_snapshot,
          change_type, related_proposal_id, description
        ) VALUES (?, ?, ?, ?, ?, 'structure_proposal', ?, 'Applied structure proposal')
      `, [
        versionId,
        documentId,
        nextVersion,
        userId,
        JSON.stringify(currentStructure),
        proposalId
      ], function(versionErr) {
        if (versionErr) {
          console.error('Error creating structure version:', versionErr);
          return callback(versionErr);
        }

        // Create detailed change log for each operation
        createChangeLog(db, documentId, versionId, operations, (logErr) => {
          if (logErr) {
            console.error('Error creating change log:', logErr);
            // Don't fail the whole operation for logging issues
          }
          callback();
        });
      });
    });
  });
}

// Helper function to create detailed change log
function createChangeLog(db, documentId, versionId, operations, callback) {
  if (!operations || operations.length === 0) {
    return callback();
  }

  let completed = 0;
  const total = operations.length;

  operations.forEach(operation => {
    const logId = uuidv4();
    // Handle both camelCase and snake_case
    const operation_type = operation.operation_type || operation.operationType;
    const source_paragraph_ids = operation.source_paragraph_ids || operation.sourceParagraphIds;
    const target_paragraph_id = operation.target_paragraph_id || operation.targetParagraphId;
    const new_position_index = operation.new_position_index || operation.newPositionIndex;
    const new_text = operation.new_text || operation.newText;
    const new_heading_level = operation.new_heading_level || operation.newHeadingLevel;

    // Get old data for affected paragraphs
    let oldDataQueries = [];

    if (target_paragraph_id) {
      oldDataQueries.push(new Promise(resolve => {
        db.get('SELECT order_index, text, title, heading_level FROM paragraphs WHERE id = ?', [target_paragraph_id], (err, row) => {
          resolve(err ? null : row);
        });
      }));
    }

    if (source_paragraph_ids && operation_type === 'MERGE') {
      const sourceIds = JSON.parse(source_paragraph_ids);
      sourceIds.forEach(id => {
        oldDataQueries.push(new Promise(resolve => {
          db.get('SELECT order_index, text, title, heading_level FROM paragraphs WHERE id = ?', [id], (err, row) => {
            resolve(err ? null : row);
          });
        }));
      });
    }

    Promise.all(oldDataQueries).then(oldDataArray => {
      const oldData = oldDataArray.filter(d => d !== null);

      // Prepare new data based on operation
      let newData = {};
      let metadata = {};

      switch (operation_type) {
        case 'MOVE':
          newData = { order_index: new_position_index };
          break;
        case 'MERGE':
          metadata = { source_paragraph_ids: JSON.parse(source_paragraph_ids) };
          break;
        case 'DELETE':
          newData = { text: '' };
          break;
        case 'INSERT_NEW':
          newData = {
            text: new_text,
            order_index: new_position_index,
            heading_level: new_heading_level
          };
          break;
        case 'RENAME_HEADING':
          newData = { title: new_text };
          break;
        case 'CHANGE_HEADING_LEVEL':
          newData = { heading_level: new_heading_level };
          break;
      }

      db.run(`
        INSERT INTO structure_change_log (
          id, document_id, version_id, operation_type, paragraph_id,
          old_data, new_data, operation_metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        logId,
        documentId,
        versionId,
        operation_type,
        target_paragraph_id,
        JSON.stringify(oldData),
        JSON.stringify(newData),
        JSON.stringify(metadata)
      ], (logErr) => {
        if (logErr) {
          console.error('Error inserting change log:', logErr);
        }

        completed++;
        if (completed === total) {
          callback();
        }
      });
    });
  });
}

// Helper function to apply structure proposal changes
function applyStructureProposal(db, documentId, proposalId, userId, callback) {
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

    // Start transaction for all operations
    db.run('BEGIN TRANSACTION', (beginErr) => {
      if (beginErr) {
        console.error('Error starting transaction:', beginErr);
        return callback(new Error('Failed to start database transaction'));
      }

      // Create structure version snapshot BEFORE applying changes
      createStructureVersion(db, documentId, proposalId, userId, operations, (versionErr) => {
        if (versionErr) {
          console.error('Error creating structure version:', versionErr);
          // Continue with applying changes even if versioning fails
        }

        // Execute operations sequentially to ensure proper ordering and error handling
        let operationIndex = 0;
        const total = operations.length;

        if (total === 0) {
          // No operations to execute, commit transaction
          console.log('No operations to execute, finalizing proposal');
          // Commit transaction after all operations complete
          db.run('COMMIT', (commitErr) => {
            if (commitErr) {
              console.error('Error committing transaction:', commitErr);
              return callback(new Error('Failed to commit transaction'));
            }
            console.log('Successfully applied 0 structure operations');
            callback(); // All operations completed successfully
          });
          return;
        }

        const processNextOperation = () => {
          if (operationIndex >= total) {
            // All operations completed successfully
            console.log('All operations completed, finalizing proposal');

            // After all operations are applied, invalidate affected paragraph proposals
            invalidateAffectedProposals(db, documentId, operations, (invalidateErr) => {
              if (invalidateErr) {
                console.error('Error invalidating affected proposals:', invalidateErr);
                // Don't fail the whole operation for this
              }

              // Normalize order_index values to ensure uniqueness and proper sequencing
              db.all(`
                SELECT id FROM paragraphs
                WHERE document_id = ? AND order_index >= 0
                ORDER BY order_index ASC, updated_at ASC
              `, [documentId], (orderErr, paragraphs) => {
                if (orderErr) {
                  console.error('Error fetching paragraphs for reordering:', orderErr);
                  // Continue with commit even if reordering fails
                } else {
                  // Update order_index to be sequential (0, 1, 2, ...)
                  paragraphs.forEach((para, index) => {
                    db.run(`
                      UPDATE paragraphs SET order_index = ?, updated_at = CURRENT_TIMESTAMP
                      WHERE id = ? AND document_id = ?
                    `, [index, para.id, documentId]);
                  });
                  console.log(`Renormalized order_index for ${paragraphs.length} paragraphs`);
                }

                // Commit transaction after all operations complete
                db.run('COMMIT', (commitErr) => {
                  if (commitErr) {
                    console.error('Error committing transaction:', commitErr);
                    return callback(new Error('Failed to commit transaction'));
                  }
                  console.log(`Successfully applied ${total} structure operations`);
                  callback(); // All operations completed successfully
                });
              });
            });
            return;
          }

          const operation = operations[operationIndex];
          console.log(`Executing operation ${operationIndex + 1}/${total}: ${operation.operation_type || operation.operationType}`);

          executeOperation(db, documentId, operation, (opErr) => {
            if (opErr) {
              console.error(`Operation ${operationIndex + 1} failed:`, opErr);
              // Rollback transaction on error
              db.run('ROLLBACK', (rollbackErr) => {
                if (rollbackErr) {
                  console.error('Error rolling back transaction:', rollbackErr);
                }
                return callback(opErr);
              });
              return;
            }

            operationIndex++;
            // Process next operation
            setTimeout(processNextOperation, 1); // Small delay to prevent overwhelming the database
          });
        };

        // Start processing operations
        processNextOperation();
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

// Helper function to validate paragraph existence
function validateParagraphExists(db, documentId, paragraphId, callback) {
  db.get(
    'SELECT id FROM paragraphs WHERE id = ? AND document_id = ?',
    [paragraphId, documentId],
    (err, row) => {
      if (err) return callback(err);
      if (!row) return callback(new Error(`Paragraph ${paragraphId} does not exist in document ${documentId}`));
      callback(null);
    }
  );
}

// Helper function to validate multiple paragraphs exist
function validateParagraphsExist(db, documentId, paragraphIds, callback) {
  if (!Array.isArray(paragraphIds) || paragraphIds.length === 0) {
    return callback(null); // Empty array is valid
  }

  const placeholders = paragraphIds.map(() => '?').join(',');
  const query = `SELECT COUNT(*) as count FROM paragraphs WHERE id IN (${placeholders}) AND document_id = ?`;

  db.get(query, [...paragraphIds, documentId], (err, row) => {
    if (err) return callback(err);
    if (row.count !== paragraphIds.length) {
      return callback(new Error(`Some paragraphs do not exist in document ${documentId}`));
    }
    callback(null);
  });
}

// Helper function to execute individual operations
function executeOperation(db, documentId, operation, callback) {
  // Handle both camelCase and snake_case
  const operation_type = operation.operation_type || operation.operationType;
  const source_paragraph_ids = operation.source_paragraph_ids || operation.sourceParagraphIds;
  const target_paragraph_id = operation.target_paragraph_id || operation.targetParagraphId;
  const new_position_index = operation.new_position_index || operation.newPositionIndex;
  const new_parent_id = operation.new_parent_id || operation.newParentId;
  const new_text = operation.new_text || operation.newText;
  const new_heading_level = operation.new_heading_level || operation.newHeadingLevel;
  const operation_data = operation.operation_data || operation.operationData;

  switch (operation_type) {
    case 'DELETE':
      if (!target_paragraph_id) return callback(new Error('DELETE operation missing target_paragraph_id'));

      // Validate target paragraph exists
      validateParagraphExists(db, documentId, target_paragraph_id, (validateErr) => {
        if (validateErr) return callback(validateErr);

        // Mark paragraph as deleted by setting text to empty and updating order
        db.run(`
          UPDATE paragraphs SET text = '', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND document_id = ?
        `, [target_paragraph_id, documentId], callback);
      });
      break;

    case 'MERGE':
      if (!source_paragraph_ids || !target_paragraph_id) return callback(new Error('MERGE operation missing required fields'));

      const sourceIds = JSON.parse(source_paragraph_ids);
      if (!Array.isArray(sourceIds) || sourceIds.length === 0) return callback(new Error('Invalid source_paragraph_ids'));

      // Validate all referenced paragraphs exist
      const allParagraphIds = [target_paragraph_id, ...sourceIds];
      validateParagraphsExist(db, documentId, allParagraphIds, (validateErr) => {
        if (validateErr) return callback(validateErr);

        // Get text from all source paragraphs
        const placeholders = sourceIds.map(() => '?').join(',');
        const textQuery = `SELECT id, text, order_index FROM paragraphs WHERE id IN (${placeholders}) AND document_id = ? ORDER BY order_index`;

        db.all(textQuery, [...sourceIds, documentId], (err, paragraphs) => {
        if (err) return callback(err);

        if (paragraphs.length !== sourceIds.length) {
          return callback(new Error('Some source paragraphs not found'));
        }

        const mergedText = paragraphs.map(p => p.text).join('\n\n');
        const minOrderIndex = Math.min(...paragraphs.map(p => p.order_index));

        // Update target paragraph with merged text
        db.run(`
          UPDATE paragraphs SET text = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND document_id = ?
        `, [mergedText, target_paragraph_id, documentId], (updateErr) => {
          if (updateErr) return callback(updateErr);

          // Mark source paragraphs as merged (empty text) to hide them from UI
          // We don't delete them to preserve foreign key relationships
          const sourceIdsToUpdate = sourceIds.filter(id => id !== target_paragraph_id);
          let completed = 0;
          const totalToUpdate = sourceIdsToUpdate.length;

          if (totalToUpdate === 0) {
            // No additional paragraphs to update (target was the only source)
            return callback();
          }

          sourceIdsToUpdate.forEach(sourceId => {
            // Set text to empty and order_index to negative to hide them
            db.run(`
              UPDATE paragraphs SET text = '', order_index = -999, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND document_id = ?
            `, [sourceId, documentId], (sourceErr) => {
              if (sourceErr) {
                console.error('Error updating source paragraph:', sourceErr);
                return callback(sourceErr);
              }

              completed++;
              if (completed === totalToUpdate) {
                callback();
              }
            });
          });
        });
      });
      }); // Close validateParagraphsExist callback
      break;

    case 'MOVE':
      if (!target_paragraph_id || new_position_index === null) return callback(new Error('MOVE operation missing required fields'));

      // Validate target paragraph exists
      validateParagraphExists(db, documentId, target_paragraph_id, (validateErr) => {
        if (validateErr) return callback(validateErr);

        // Update paragraph position
        db.run(`
          UPDATE paragraphs SET order_index = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND document_id = ?
        `, [new_position_index, target_paragraph_id, documentId], callback);
      });
      break;

    case 'RENAME_HEADING':
      if (!target_paragraph_id || !new_text) return callback(new Error('RENAME_HEADING operation missing required fields'));

      // Validate target paragraph exists
      validateParagraphExists(db, documentId, target_paragraph_id, (validateErr) => {
        if (validateErr) return callback(validateErr);

        db.run(`
          UPDATE paragraphs SET title = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND document_id = ?
        `, [new_text, target_paragraph_id, documentId], callback);
      });
      break;

    case 'CHANGE_HEADING_LEVEL':
      if (!target_paragraph_id || !new_heading_level) return callback(new Error('CHANGE_HEADING_LEVEL operation missing required fields'));

      db.run(`
        UPDATE paragraphs SET heading_level = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND document_id = ?
      `, [new_heading_level, target_paragraph_id, documentId], callback);
      break;

    case 'INSERT_NEW':
      if (!new_text || new_position_index === null || new_position_index < 0) {
        return callback(new Error('INSERT_NEW operation missing required fields or invalid position'));
      }

      // Validate that the position index is within reasonable bounds
      if (new_position_index > 10000) {
        return callback(new Error('INSERT_NEW position index too large'));
      }

      const newParagraphId = uuidv4();
      db.run(`
        INSERT INTO paragraphs (id, document_id, text, order_index, heading_level)
        VALUES (?, ?, ?, ?, ?)
      `, [newParagraphId, documentId, new_text, new_position_index, new_heading_level || null], (insertErr) => {
        if (insertErr) {
          // Check if it's a constraint violation (duplicate order_index)
          if (insertErr.message && insertErr.message.includes('UNIQUE constraint failed')) {
            return callback(new Error('INSERT_NEW position conflicts with existing paragraph'));
          }
          return callback(insertErr);
        }
        callback(null);
      });
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

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { logger } = require('../middleware/logger');
const { metricsCollector } = require('../middleware/monitoring');

const router = express.Router({ mergeParams: true });

// Helper function to check if user is member of organization
function isActiveMember(db, userId, organizationId, callback) {
  db.get(`
    SELECT om.status, o.is_active
    FROM organization_members om
    JOIN organizations o ON om.organization_id = o.id
    WHERE om.organization_id = ? AND om.user_id = ? AND om.status = 'active' AND o.is_active = 1
  `, [organizationId, userId], (err, membership) => {
    if (err) {
      return callback(err, false);
    }
    callback(null, !!membership);
  });
}

// Helper function to check if proposal should be approved
function checkProposalApproval(db, proposalId, organizationId, callback) {
  // Get organization voting threshold
  db.get('SELECT voting_threshold FROM organizations WHERE id = ?', [organizationId], (err, org) => {
    if (err || !org) {
      return callback(err);
    }

    const threshold = org.voting_threshold || 0.75;

    // Count votes
    db.all(`
      SELECT vote, COUNT(*) as count
      FROM document_tree_proposal_votes
      WHERE proposal_id = ?
      GROUP BY vote
    `, [proposalId], (err, voteCounts) => {
      if (err) {
        return callback(err);
      }

      const counts = { PRO: 0, NEUTRAL: 0, CONTRA: 0 };
      (voteCounts || []).forEach(row => {
        counts[row.vote] = parseInt(row.count);
      });

      const totalVotes = counts.PRO + counts.NEUTRAL + counts.CONTRA;
      if (totalVotes === 0) {
        return callback(null, false);
      }

      const approvalRate = counts.PRO / totalVotes;
      const shouldApprove = approvalRate >= threshold;

      if (shouldApprove) {
        // Update proposal status
        db.run(
          'UPDATE document_tree_proposals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?',
          ['approved', proposalId, 'pending'],
          (err) => {
            if (err) {
              return callback(err);
            }
            callback(null, true);
          }
        );
      } else {
        callback(null, false);
      }
    });
  });
}

// Validate tree operation
function validateTreeOperation(db, documentId, operationType, targetParentId, callback) {
  // Get document info
  db.get('SELECT id, parent_id, organization_id FROM documents WHERE id = ?', [documentId], (err, doc) => {
    if (err) {
      return callback(err, false, 'Database error');
    }
    if (!doc) {
      return callback(null, false, 'Document not found');
    }

    if (operationType === 'MOVE') {
      if (targetParentId === undefined || targetParentId === null || targetParentId === '') {
        // Allow moving to root (null parent)
        return callback(null, true, null);
      }

      // Check if target parent exists and belongs to same organization
      db.get(
        'SELECT id, organization_id FROM documents WHERE id = ?',
        [targetParentId],
        (err, targetParent) => {
          if (err) {
            return callback(err, false, 'Database error');
          }
          if (!targetParent) {
            return callback(null, false, 'Target parent document not found');
          }
          if (targetParent.organization_id !== doc.organization_id) {
            return callback(null, false, 'Target parent must belong to same organization');
          }
          if (targetParentId === documentId) {
            return callback(null, false, 'Cannot move document to itself');
          }

          // Check for circular reference (target parent is a descendant of document)
          const checkCircular = (checkId, visited = new Set()) => {
            return new Promise((resolve) => {
              if (visited.has(checkId) || checkId === documentId) {
                return resolve(true); // Circular reference detected
              }
              visited.add(checkId);
              db.get('SELECT parent_id FROM documents WHERE id = ?', [checkId], (err, child) => {
                if (err || !child || !child.parent_id) {
                  return resolve(false);
                }
                checkCircular(child.parent_id, visited).then(resolve);
              });
            });
          };

          checkCircular(targetParentId).then((isCircular) => {
            if (isCircular) {
              callback(null, false, 'Circular reference detected: cannot move document to its own descendant');
            } else {
              callback(null, true, null);
            }
          });
        }
      );
    } else if (operationType === 'DELETE') {
      // Check if document has children
      db.get('SELECT COUNT(*) as count FROM documents WHERE parent_id = ?', [documentId], (err, result) => {
        if (err) {
          return callback(err, false, 'Database error');
        }
        if (result.count > 0) {
          return callback(null, false, 'Cannot delete document with child documents. Delete children first.');
        }
        callback(null, true, null);
      });
    } else if (operationType === 'REORDER') {
      // REORDER validation - just check document exists
      callback(null, true, null);
    } else {
      callback(null, false, 'Invalid operation type');
    }
  });
}

// Get all tree proposals for a document
router.get('/:documentId', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const { documentId } = req.params;
  const userId = req.user.id;

  // Check document access
  db.get(`
    SELECT d.id, d.organization_id, d.ownership_type
    FROM documents d
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
    LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    WHERE d.id = ? AND (
      d.owner_id = ? OR
      dc.user_id = ? OR
      (d.ownership_type = 'organizational' AND om.user_id IS NOT NULL)
    )
  `, [userId, userId, documentId, userId, userId], (err, document) => {
    if (err) {
      logger.error('Error checking document access', { error: err.message, documentId, userId });
      return res.status(500).json({ error: 'Failed to check document access' });
    }

    if (!document) {
      return res.status(404).json({ error: 'Document not found or access denied' });
    }

    // Get proposals
    const query = `
      SELECT dtp.*,
             u.name as proposed_by_name,
             u.email as proposed_by_email
      FROM document_tree_proposals dtp
      JOIN users u ON dtp.proposed_by_user_id = u.id
      WHERE dtp.document_id = ?
      ORDER BY dtp.created_at DESC
    `;

    db.all(query, [documentId], (err, proposals) => {
      if (err) {
        if (err.message.includes('no such table')) {
          return res.json({ proposals: [] });
        }
        logger.error('Error fetching tree proposals', { error: err.message, documentId });
        return res.status(500).json({ error: 'Failed to fetch tree proposals' });
      }

      // Enrich with votes
      const enrichProposal = (proposal) => {
        return new Promise((resolve) => {
          db.all(`
            SELECT dtpv.*,
                   u.name as voter_name,
                   u.email as voter_email
            FROM document_tree_proposal_votes dtpv
            LEFT JOIN users u ON dtpv.user_id = u.id
            WHERE dtpv.proposal_id = ?
            ORDER BY dtpv.created_at ASC
          `, [proposal.id], (err, votes) => {
            if (err) {
              if (err.message.includes('no such table')) {
                return resolve({ ...proposal, votes: [], voteCounts: { pro: 0, neutral: 0, contra: 0 } });
              }
              logger.error('Error fetching votes', { error: err.message, proposalId: proposal.id });
              return resolve({ ...proposal, votes: [], voteCounts: { pro: 0, neutral: 0, contra: 0 } });
            }

            const voteCounts = { pro: 0, neutral: 0, contra: 0 };
            (votes || []).forEach(vote => {
              if (vote.vote === 'PRO') voteCounts.pro++;
              else if (vote.vote === 'NEUTRAL') voteCounts.neutral++;
              else if (vote.vote === 'CONTRA') voteCounts.contra++;
            });

            resolve({
              ...proposal,
              votes: votes || [],
              voteCounts
            });
          });
        });
      };

      Promise.all((proposals || []).map(enrichProposal)).then(enrichedProposals => {
        res.json({ proposals: enrichedProposals });
      }).catch(err => {
        logger.error('Error enriching proposals', { error: err.message, documentId });
        res.status(500).json({ error: 'Failed to process proposals' });
      });
    });
  });
});

// Create tree proposal
router.post('/', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const { documentId, operationType, targetParentId, newOrder, reason } = req.body;
  const userId = req.user.id;

  if (!documentId || !operationType) {
    return res.status(400).json({ error: 'documentId and operationType are required' });
  }

  if (!['MOVE', 'DELETE', 'REORDER'].includes(operationType)) {
    return res.status(400).json({ error: 'Invalid operationType. Must be MOVE, DELETE, or REORDER' });
  }

  // Check document access and get organization
  db.get(`
    SELECT d.id, d.organization_id, d.ownership_type
    FROM documents d
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
    LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    WHERE d.id = ? AND (
      d.owner_id = ? OR
      dc.user_id = ? OR
      (d.ownership_type = 'organizational' AND om.user_id IS NOT NULL)
    )
  `, [userId, userId, documentId, userId, userId], (err, document) => {
    if (err) {
      logger.error('Error checking document access', { error: err.message, documentId, userId });
      return res.status(500).json({ error: 'Failed to check document access' });
    }

    if (!document) {
      return res.status(404).json({ error: 'Document not found or access denied' });
    }

    // For organizational documents, check if user is active member
    if (document.ownership_type === 'organizational') {
      isActiveMember(db, userId, document.organization_id, (err, isMember) => {
        if (err) {
          logger.error('Error checking membership', { error: err.message, userId, organizationId: document.organization_id });
          return res.status(500).json({ error: 'Failed to verify membership' });
        }
        if (!isMember) {
          return res.status(403).json({ error: 'Only active organization members can create tree proposals' });
        }

        createProposal();
      });
    } else {
      createProposal();
    }

    function createProposal() {
      // Validate operation
      validateTreeOperation(db, documentId, operationType, targetParentId, (err, isValid, errorMessage) => {
        if (err) {
          logger.error('Error validating tree operation', { error: err.message, documentId, operationType });
          return res.status(500).json({ error: 'Failed to validate operation' });
        }
        if (!isValid) {
          return res.status(400).json({ error: errorMessage || 'Invalid tree operation' });
        }

        // Check for existing pending proposal
        db.get(`
          SELECT id FROM document_tree_proposals
          WHERE document_id = ? AND status = 'pending'
        `, [documentId], (err, existing) => {
          if (err && !err.message.includes('no such table')) {
            logger.error('Error checking existing proposals', { error: err.message, documentId });
            return res.status(500).json({ error: 'Failed to check existing proposals' });
          }

          if (existing) {
            return res.status(409).json({ error: 'There is already a pending proposal for this document' });
          }

          // Create proposal
          const proposalId = uuidv4();
          db.run(`
            INSERT INTO document_tree_proposals (
              id, document_id, organization_id, proposed_by_user_id,
              operation_type, target_parent_id, new_order, reason, status,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `, [proposalId, documentId, document.organization_id, userId, operationType, targetParentId || null, newOrder || null, reason || null], function(err) {
            if (err) {
              logger.error('Error creating tree proposal', { error: err.message, documentId, userId });
              return res.status(500).json({ error: 'Failed to create tree proposal' });
            }

            // Get created proposal with user info
            db.get(`
              SELECT dtp.*,
                     u.name as proposed_by_name,
                     u.email as proposed_by_email
              FROM document_tree_proposals dtp
              JOIN users u ON dtp.proposed_by_user_id = u.id
              WHERE dtp.id = ?
            `, [proposalId], (err, proposal) => {
              if (err) {
                logger.error('Error fetching created proposal', { error: err.message, proposalId });
                return res.status(500).json({ error: 'Proposal created but failed to retrieve' });
              }

              metricsCollector.recordBusinessEvent('document_tree_proposal_created', {
                proposalId,
                documentId,
                organizationId: document.organization_id,
                operationType,
                userId
              });

              res.status(201).json({
                proposal: {
                  ...proposal,
                  votes: [],
                  voteCounts: { pro: 0, neutral: 0, contra: 0 }
                }
              });
            });
          });
        });
      });
    }
  });
});

// Vote on tree proposal
router.post('/:proposalId/vote', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const { proposalId } = req.params;
  const { vote } = req.body;
  const userId = req.user.id;

  if (!['PRO', 'NEUTRAL', 'CONTRA'].includes(vote)) {
    return res.status(400).json({ error: 'Invalid vote. Must be PRO, NEUTRAL, or CONTRA' });
  }

  // Get proposal and check access
  db.get(`
    SELECT dtp.*, d.organization_id
    FROM document_tree_proposals dtp
    JOIN documents d ON dtp.document_id = d.id
    WHERE dtp.id = ?
  `, [proposalId], (err, proposal) => {
    if (err) {
      logger.error('Error fetching proposal', { error: err.message, proposalId });
      return res.status(500).json({ error: 'Failed to fetch proposal' });
    }

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    if (proposal.status !== 'pending') {
      return res.status(400).json({ error: 'Can only vote on pending proposals' });
    }

    // Check membership
    isActiveMember(db, userId, proposal.organization_id, (err, isMember) => {
      if (err) {
        logger.error('Error checking membership', { error: err.message, userId, organizationId: proposal.organization_id });
        return res.status(500).json({ error: 'Failed to verify membership' });
      }
      if (!isMember) {
        return res.status(403).json({ error: 'Only active organization members can vote' });
      }

      // Check if already voted
      db.get('SELECT id, vote FROM document_tree_proposal_votes WHERE proposal_id = ? AND user_id = ?', [proposalId, userId], (err, existing) => {
        if (err && !err.message.includes('no such table')) {
          logger.error('Error checking existing vote', { error: err.message, proposalId, userId });
          return res.status(500).json({ error: 'Failed to check existing vote' });
        }

        const voteId = uuidv4();
        if (existing) {
          // Update existing vote
          db.run(`
            UPDATE document_tree_proposal_votes
            SET vote = ?, updated_at = CURRENT_TIMESTAMP
            WHERE proposal_id = ? AND user_id = ?
          `, [vote, proposalId, userId], (err) => {
            if (err) {
              logger.error('Error updating vote', { error: err.message, proposalId, userId });
              return res.status(500).json({ error: 'Failed to update vote' });
            }

            checkProposalApproval(db, proposalId, proposal.organization_id, () => {
              res.json({ success: true, message: 'Vote updated successfully' });
            });
          });
        } else {
          // Create new vote
          db.run(`
            INSERT INTO document_tree_proposal_votes (id, proposal_id, user_id, vote, created_at, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `, [voteId, proposalId, userId, vote], (err) => {
            if (err) {
              logger.error('Error casting vote', { error: err.message, proposalId, userId });
              return res.status(500).json({ error: 'Failed to cast vote' });
            }

            checkProposalApproval(db, proposalId, proposal.organization_id, () => {
              metricsCollector.recordBusinessEvent('document_tree_proposal_voted', {
                proposalId,
                vote,
                userId
              });

              res.json({ success: true, message: 'Vote recorded successfully' });
            });
          });
        }
      });
    });
  });
});

// Apply approved proposal
router.post('/:proposalId/apply', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const { proposalId } = req.params;
  const userId = req.user.id;

  // Get proposal
  db.get(`
    SELECT dtp.*, d.owner_id, d.organization_id
    FROM document_tree_proposals dtp
    JOIN documents d ON dtp.document_id = d.id
    WHERE dtp.id = ?
  `, [proposalId], (err, proposal) => {
    if (err) {
      logger.error('Error fetching proposal', { error: err.message, proposalId });
      return res.status(500).json({ error: 'Failed to fetch proposal' });
    }

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    if (proposal.status !== 'approved') {
      return res.status(400).json({ error: 'Can only apply approved proposals' });
    }

    // Check permissions - owner or representative
    const isOwner = proposal.owner_id === userId;
    let isRepresentative = false;

    if (!isOwner) {
      db.get(`
        SELECT id FROM organization_representatives
        WHERE organization_id = ? AND user_id = ? AND status = 'active'
      `, [proposal.organization_id, userId], (err, rep) => {
        if (err) {
          logger.error('Error checking representative status', { error: err.message, userId, organizationId: proposal.organization_id });
          return res.status(500).json({ error: 'Failed to verify permissions' });
        }
        isRepresentative = !!rep;
        applyOperation();
      });
    } else {
      applyOperation();
    }

    function applyOperation() {
      if (!isOwner && !isRepresentative) {
        return res.status(403).json({ error: 'Only document owner or organization representative can apply proposals' });
      }

      // Apply the operation
      if (proposal.operation_type === 'MOVE') {
        db.run('UPDATE documents SET parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [proposal.target_parent_id || null, proposal.document_id], (err) => {
          if (err) {
            logger.error('Error applying MOVE operation', { error: err.message, proposalId });
            return res.status(500).json({ error: 'Failed to apply MOVE operation' });
          }
          markApplied();
        });
      } else if (proposal.operation_type === 'DELETE') {
        db.run('DELETE FROM documents WHERE id = ?', [proposal.document_id], (err) => {
          if (err) {
            logger.error('Error applying DELETE operation', { error: err.message, proposalId });
            return res.status(500).json({ error: 'Failed to apply DELETE operation' });
          }
          markApplied();
        });
      } else if (proposal.operation_type === 'REORDER') {
        // Update the document's sort_order to the new_order value from the proposal
        if (proposal.new_order === null || proposal.new_order === undefined) {
          logger.error('REORDER operation missing new_order value', { proposalId, documentId: proposal.document_id });
          return res.status(400).json({ error: 'REORDER operation requires new_order value' });
        }

        db.run('UPDATE documents SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
          [proposal.new_order, proposal.document_id], 
          (err) => {
            if (err) {
              logger.error('Error applying REORDER operation', { error: err.message, proposalId, documentId: proposal.document_id });
              return res.status(500).json({ error: 'Failed to apply REORDER operation' });
            }
            logger.info('REORDER operation applied successfully', { 
              proposalId, 
              documentId: proposal.document_id, 
              newOrder: proposal.new_order 
            });
            markApplied();
          }
        );
      } else {
        return res.status(400).json({ error: 'Invalid operation type' });
      }

      function markApplied() {
        db.run('UPDATE document_tree_proposals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['applied', proposalId], (err) => {
          if (err) {
            logger.error('Error marking proposal as applied', { error: err.message, proposalId });
            return res.status(500).json({ error: 'Operation applied but failed to update proposal status' });
          }

          metricsCollector.recordBusinessEvent('document_tree_proposal_applied', {
            proposalId,
            operationType: proposal.operation_type,
            documentId: proposal.document_id,
            userId
          });

          res.json({ success: true, message: 'Proposal applied successfully' });
        });
      }
    }
  });
});

// Cancel/delete proposal (only by creator)
router.delete('/:proposalId', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const { proposalId } = req.params;
  const userId = req.user.id;

  db.get('SELECT proposed_by_user_id, status FROM document_tree_proposals WHERE id = ?', [proposalId], (err, proposal) => {
    if (err) {
      logger.error('Error fetching proposal', { error: err.message, proposalId });
      return res.status(500).json({ error: 'Failed to fetch proposal' });
    }

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    if (proposal.proposed_by_user_id !== userId) {
      return res.status(403).json({ error: 'Only the proposal creator can delete it' });
    }

    if (proposal.status === 'applied') {
      return res.status(400).json({ error: 'Cannot delete an applied proposal' });
    }

    // Delete votes first
    db.run('DELETE FROM document_tree_proposal_votes WHERE proposal_id = ?', [proposalId], (err) => {
      if (err && !err.message.includes('no such table')) {
        logger.error('Error deleting votes', { error: err.message, proposalId });
        return res.status(500).json({ error: 'Failed to delete proposal votes' });
      }

      // Delete proposal
      db.run('DELETE FROM document_tree_proposals WHERE id = ?', [proposalId], (err) => {
        if (err) {
          logger.error('Error deleting proposal', { error: err.message, proposalId });
          return res.status(500).json({ error: 'Failed to delete proposal' });
        }

        res.json({ success: true, message: 'Proposal deleted successfully' });
      });
    });
  });
});

module.exports = router;

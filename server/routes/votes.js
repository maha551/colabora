const express = require('express');
const { metricsCollector } = require('../middleware/monitoring');
const { requireAuth, requireDocumentAccess } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// Cast or update a vote on a proposal
router.post('/', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const paragraphId = req.params.paragraphId;
  const proposalId = req.params.proposalId;
  const { vote } = req.body;
  const userId = req.user.id;

  if (!['PRO', 'NEUTRAL', 'CONTRA'].includes(vote)) {
    return res.status(400).json({ error: 'Invalid vote type. Must be PRO, NEUTRAL, or CONTRA' });
  }

  // Verify proposal exists and belongs to the correct paragraph and document
  const verifyQuery = `
    SELECT p.id, p.paragraph_id, pr.text as proposal_text
    FROM proposals p
    JOIN paragraphs pr ON p.paragraph_id = pr.id
    WHERE p.id = ? AND pr.id = ? AND pr.document_id = ?
  `;

  db.get(verifyQuery, [proposalId, paragraphId, documentId], (err, proposal) => {
    if (err) {
      console.error('Error verifying proposal:', err);
      return res.status(500).json({ error: 'Failed to cast vote' });
    }

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Check if user already voted on this proposal
    db.get(`
      SELECT id, vote FROM votes WHERE proposal_id = ? AND user_id = ?
    `, [proposalId, userId], (err, existingVote) => {
      if (err) {
        console.error('Error checking existing vote:', err);
        return res.status(500).json({ error: 'Failed to cast vote' });
      }

      if (existingVote) {
        // Check if vote changes are allowed for this document
        db.get(`
          SELECT vote_change_allowed FROM documents WHERE id = ?
        `, [documentId], (docErr, doc) => {
          if (docErr) {
            console.error('Error checking document options:', docErr);
            return res.status(500).json({ error: 'Failed to check document options' });
          }

          if (!doc || doc.vote_change_allowed === 0) {
            return res.status(403).json({ 
              error: 'Votes are locked for this document. You cannot change your vote.' 
            });
          }

          // Update existing vote
          db.run(`
            UPDATE votes SET vote = ? WHERE proposal_id = ? AND user_id = ?
          `, [vote, proposalId, userId], function(err) {
            if (err) {
              console.error('Error updating vote:', err);
              return res.status(500).json({ error: 'Failed to update vote' });
            }

            // Check if proposal should be approved (using document threshold)
            checkAndUpdateProposalApproval(db, proposalId, documentId);

            res.json({ message: 'Vote updated successfully' });
          });
        });
      } else {
        // Insert new vote
        const { v4: uuidv4 } = require('uuid');
        const voteId = uuidv4();

        db.run(`
          INSERT INTO votes (id, proposal_id, user_id, vote)
          VALUES (?, ?, ?, ?)
        `, [voteId, proposalId, userId, vote], function(err) {
          if (err) {
            console.error('Error casting vote:', err);
            return res.status(500).json({ error: 'Failed to cast vote' });
          }

          // Check if proposal should be approved
          checkAndUpdateProposalApproval(db, proposalId, documentId);

          // Record business metrics
          metricsCollector.recordBusinessEvent('vote_cast', {
            voteId,
            proposalId,
            userId,
            vote,
            documentId
          });

          res.json({ message: 'Vote cast successfully' });
        });
      }
    });
  });
});

// Helper function to check and update proposal approval status
function checkAndUpdateProposalApproval(db, proposalId, documentId) {
  // Get document acceptance threshold
  db.get(`SELECT acceptance_threshold FROM documents WHERE id = ?`, [documentId], (docErr, doc) => {
    if (docErr) {
      console.error('Error getting document threshold:', docErr);
      return;
    }

    const acceptanceThreshold = doc?.acceptance_threshold || 75.0;

    // Get total collaborators for the document
    const collabQuery = `
      SELECT COUNT(*) as total_users
      FROM (
        SELECT owner_id as user_id FROM documents WHERE id = ?
        UNION
        SELECT user_id FROM document_collaborators WHERE document_id = ?
      )
    `;

    db.get(collabQuery, [documentId, documentId], (err, result) => {
      if (err) {
        console.error('Error getting user count:', err);
        return;
      }

      const totalUsers = result.total_users;

      // Get PRO vote count for this proposal
      db.get(`
        SELECT COUNT(*) as pro_votes FROM votes WHERE proposal_id = ? AND vote = 'PRO'
      `, [proposalId], (err, voteResult) => {
        if (err) {
          console.error('Error getting vote count:', err);
          return;
        }

        const proVotes = voteResult.pro_votes;
        const approvalPercentage = totalUsers > 0 ? (proVotes / totalUsers) * 100 : 0;
        const shouldApprove = approvalPercentage >= acceptanceThreshold;

        // Update proposal approval status
        db.run(`
          UPDATE proposals SET approved = ? WHERE id = ?
        `, [shouldApprove ? 1 : 0, proposalId], function(err) {
        if (err) {
          console.error('Error updating proposal approval:', err);
          return;
        }

          // Always update the agreed view based on the highest approved proposal
          // regardless of whether this specific proposal was just approved or not
          updateAgreedViewForParagraph(db, proposalId, documentId);

          // Also check if this proposal should be unapproved (if votes dropped below threshold)
          if (!shouldApprove) {
            // Check if this was the currently accepted proposal in the agreed view
            db.get(`
              SELECT p.text, p.title
              FROM paragraphs p
              WHERE p.id = (SELECT paragraph_id FROM proposals WHERE id = ?)
            `, [proposalId], (err, currentParagraph) => {
              if (err || !currentParagraph) return;

              // Get the proposal that was used for the current paragraph content
              db.get(`
                SELECT pr.text, pr.type
                FROM proposals pr
                JOIN history h ON pr.id = h.proposal_id
                WHERE h.paragraph_id = (SELECT paragraph_id FROM proposals WHERE id = ?)
                ORDER BY h.approval_percentage DESC, h.created_at DESC
                LIMIT 1
              `, [proposalId], (err, currentProposal) => {
                if (err || !currentProposal) return;

                // If the current paragraph content matches this now-unapproved proposal,
                // we need to update to the next best approved proposal
                const isTitleChange = currentProposal.type === 'TITLE';
                const currentContent = isTitleChange ? currentParagraph.title : currentParagraph.text;
                const proposalContent = currentProposal.text;

                if (currentContent === proposalContent) {
                  // This was the active proposal, update to next best
                  updateAgreedViewForParagraph(db, proposalId, documentId);
                }
              });
            });
          }
        });
      });
    });
  });
}

// Helper function to update the agreed view for a paragraph based on the highest approved proposal
function updateAgreedViewForParagraph(db, proposalId, documentId) {
  // First get the paragraph_id from the proposal
  db.get(`SELECT paragraph_id FROM proposals WHERE id = ?`, [proposalId], (err, proposalData) => {
    if (err || !proposalData) {
      console.error('Error getting paragraph_id from proposal:', err);
      return;
    }

    const paragraphId = proposalData.paragraph_id;

    // Get all proposals for this paragraph with their current vote counts to determine approval status
    const allProposalsQuery = `
      SELECT
        pr.id,
        pr.text,
        pr.type,
        pr.heading_level,
        pr.user_id,
        COUNT(v.id) as pro_votes,
        pr.approved
      FROM proposals pr
      LEFT JOIN votes v ON pr.id = v.proposal_id AND v.vote = 'PRO'
      WHERE pr.paragraph_id = ?
      GROUP BY pr.id
      ORDER BY COUNT(v.id) DESC, pr.created_at ASC
    `;

    db.all(allProposalsQuery, [paragraphId], (err, allProposals) => {
      if (err) {
        console.error('Error getting proposals:', err);
        return;
      }

      // Get document acceptance threshold and total collaborators count
      db.get(`SELECT acceptance_threshold FROM documents WHERE id = ?`, [documentId], (docErr, doc) => {
        if (docErr) {
          console.error('Error getting document threshold:', docErr);
          return;
        }

        const acceptanceThreshold = doc?.acceptance_threshold || 75.0;

        const collabQuery = `
          SELECT COUNT(*) as total_users
          FROM (
            SELECT owner_id as user_id FROM documents WHERE id = ?
            UNION
            SELECT user_id FROM document_collaborators WHERE document_id = ?
          )
        `;

        db.get(collabQuery, [documentId, documentId], (err, result) => {
          if (err) {
            console.error('Error getting user count:', err);
            return;
          }

          const totalUsers = result?.total_users || 0;
          
          // Fix: Add validation for zero users
          if (totalUsers === 0) {
            console.warn(`Document ${documentId} has no collaborators - cannot calculate approval percentage`);
            return;
          }

          // Find the proposal with the highest approval percentage that meets the threshold
          let bestProposal = null;
          let bestApprovalPercentage = 0;

          for (const proposal of allProposals) {
            const approvalPercentage = totalUsers > 0 ? (proposal.pro_votes / totalUsers) * 100 : 0;
            if (approvalPercentage >= acceptanceThreshold && approvalPercentage > bestApprovalPercentage) {
              bestProposal = proposal;
              bestApprovalPercentage = approvalPercentage;
            }
          }

          // Get current paragraph data
          db.get(`
            SELECT
              p.id as paragraph_id,
              p.text as current_text,
              p.title as current_title,
              p.heading_level as current_heading_level,
              p.order_index,
              p.document_id
            FROM paragraphs p
            WHERE p.id = ?
          `, [paragraphId], (err, paragraphData) => {
            if (err || !paragraphData) {
              console.error('Error getting paragraph data:', err);
              return;
            }

            const isDocumentTitle = paragraphData.order_index !== null && paragraphData.order_index < 0;

            if (!bestProposal) {
              // No proposal meets the threshold - revert paragraph to empty state
              console.log(`No approved proposals for paragraph ${paragraphId} - reverting to empty state`);

              if (isDocumentTitle) {
                // For document title paragraph, don't empty it - keep the current title
                // This ensures the document title remains visible in the header
                return;
              }

              // Use transaction for atomic paragraph clearing
              db.run('BEGIN TRANSACTION', (beginErr) => {
                if (beginErr) {
                  console.error('Error beginning transaction for paragraph clearing:', beginErr);
                  return;
                }

                let operationsCompleted = 0;
                const totalOperations = 2; // paragraph update + document timestamp
                let hasError = false;

                const checkCompletion = () => {
                  operationsCompleted++;
                  if (operationsCompleted >= totalOperations && !hasError) {
                    db.run('COMMIT', (commitErr) => {
                      if (commitErr) {
                        console.error('Error committing paragraph clearing transaction:', commitErr);
                        db.run('ROLLBACK', () => {});
                      }
                    });
                  }
                };

                const handleError = (error, operation) => {
                  if (!hasError) {
                    hasError = true;
                    console.error(`Error in ${operation}:`, error);
                    db.run('ROLLBACK', () => {
                      console.error(`Transaction rolled back due to error in ${operation}`);
                    });
                  }
                };

                // For non-title paragraphs, set to empty (they will be hidden in the UI)
                if (paragraphData.current_title) {
                  // This is a heading paragraph - set to empty
                  db.run(`
                    UPDATE paragraphs
                    SET title = '',
                        heading_level = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                  `, [paragraphData.current_heading_level, paragraphId], (updateErr) => {
                    if (updateErr) {
                      handleError(updateErr, 'clearing paragraph title');
                      return;
                    }
                    checkCompletion();
                  });
                } else {
                  // This is a body paragraph - set to empty
                  db.run(`
                    UPDATE paragraphs SET text = '', updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                  `, [paragraphId], (updateErr) => {
                    if (updateErr) {
                      handleError(updateErr, 'clearing paragraph text');
                      return;
                    }
                    checkCompletion();
                  });
                }

                // Update document timestamp
                db.run(`
                  UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
                `, [documentId], (timestampErr) => {
                  if (timestampErr) {
                    handleError(timestampErr, 'updating document timestamp');
                    return;
                  }
                  checkCompletion();
                });
              });

              return;
            }

            // We have a best proposal - update the paragraph with it using transaction
            const proposalType = bestProposal.type || 'BODY';
            const isTitleChange = proposalType === 'TITLE';
            const oldValue = isTitleChange ? (paragraphData.current_title || '') : (paragraphData.current_text || '');
            const newValue = bestProposal.text;
            const newHeadingLevel = isTitleChange ? (bestProposal.heading_level || paragraphData.current_heading_level || (isDocumentTitle ? 'h1' : 'h2')) : null;

            // Use transaction for atomic proposal approval updates
            // This ensures all related updates (paragraph, document title, proposal status, history) succeed or fail together
            db.run('BEGIN TRANSACTION', (beginErr) => {
              if (beginErr) {
                console.error('Error beginning transaction for proposal approval:', beginErr);
                return;
              }

              // Track operations for transaction completion
              // This pattern ensures we wait for all async operations before committing
              let operationsCompleted = 0;
              let operationsExpected = 0;
              let hasError = false;

              // Calculate expected operations based on proposal type and document state
              operationsExpected += 1; // paragraph update (title or text)
              if (isTitleChange && isDocumentTitle) {
                operationsExpected += 2; // paragraph text sync + document title update
              }
              if (!bestProposal.approved) {
                operationsExpected += 1; // proposal approval status update
              }
              operationsExpected += 1; // document timestamp update
              // History entry creation is handled separately after all operations complete

              const checkCompletion = () => {
                operationsCompleted++;
                if (operationsCompleted >= operationsExpected && !hasError) {
                  // Check for existing history before creating new one
                  db.get(`SELECT id FROM history WHERE proposal_id = ?`, [bestProposal.id], (err, existingHistory) => {
                    if (err) {
                      console.error('Error checking existing history:', err);
                      db.run('ROLLBACK', () => {});
                      return;
                    }

                    if (!existingHistory) {
                      // Create history entry only if it doesn't exist (fix duplicate prevention)
                      const { v4: uuidv4 } = require('uuid');
                      const historyId = uuidv4();
                      db.run(`
                        INSERT INTO history (id, paragraph_id, user_id, old_text, new_text, approval_percentage, proposal_id, heading_level)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                      `, [historyId, paragraphId, bestProposal.user_id, oldValue, newValue, bestApprovalPercentage, bestProposal.id, newHeadingLevel], (historyErr) => {
                        if (historyErr) {
                          console.error('Error recording history entry:', historyErr);
                          db.run('ROLLBACK', () => {});
                          return;
                        }
                        // Commit transaction after history entry
                        db.run('COMMIT', (commitErr) => {
                          if (commitErr) {
                            console.error('Error committing proposal approval transaction:', commitErr);
                            db.run('ROLLBACK', () => {});
                          }
                        });
                      });
                    } else {
                      // History already exists, just commit
                      db.run('COMMIT', (commitErr) => {
                        if (commitErr) {
                          console.error('Error committing proposal approval transaction:', commitErr);
                          db.run('ROLLBACK', () => {});
                        }
                      });
                    }
                  });
                }
              };

              const handleError = (error, operation) => {
                if (!hasError) {
                  hasError = true;
                  console.error(`Error in ${operation}:`, error);
                  db.run('ROLLBACK', () => {
                    console.error(`Transaction rolled back due to error in ${operation}`);
                  });
                }
              };

              if (isTitleChange) {
                db.run(`
                  UPDATE paragraphs
                  SET title = ?,
                      heading_level = ?,
                      updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?
                `, [newValue, newHeadingLevel, paragraphId], (updateErr) => {
                  if (updateErr) {
                    handleError(updateErr, 'paragraph title update');
                    return;
                  }
                  checkCompletion();
                });

                if (isDocumentTitle) {
                  db.run(`
                    UPDATE paragraphs
                    SET text = ?, heading_level = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                  `, [newValue, newHeadingLevel, paragraphId], (docTitleErr) => {
                    if (docTitleErr) {
                      handleError(docTitleErr, 'document title paragraph sync');
                      return;
                    }
                    checkCompletion();
                  });

                  db.run(`
                    UPDATE documents SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
                  `, [newValue, documentId], (docErr) => {
                    if (docErr) {
                      handleError(docErr, 'document title update');
                      return;
                    }
                    checkCompletion();
                  });
                }
              } else {
                db.run(`
                  UPDATE paragraphs SET text = ?, updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?
                `, [newValue, paragraphId], (updateErr) => {
                  if (updateErr) {
                    handleError(updateErr, 'paragraph text update');
                    return;
                  }
                  checkCompletion();
                });
              }

              // Update proposal approval status if it's not already approved
              if (!bestProposal.approved) {
                db.run(`UPDATE proposals SET approved = 1 WHERE id = ?`, [bestProposal.id], (approvalErr) => {
                  if (approvalErr) {
                    handleError(approvalErr, 'proposal approval status update');
                    return;
                  }
                  checkCompletion();
                });
              }

              // Update document timestamp
              db.run(`
                UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
              `, [documentId], (timestampErr) => {
                if (timestampErr) {
                  handleError(timestampErr, 'document timestamp update');
                  return;
                }
                checkCompletion();
              });
            });
          });
        });
      });
    });
  });
}

module.exports = router;

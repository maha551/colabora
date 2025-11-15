const express = require('express');
const { metricsCollector } = require('../middleware/monitoring');
const { requireAuth, requireDocumentAccess } = require('../middleware/auth');
const VoterManager = require('../modules/voting');
const documentLockManager = require('../modules/locks');

const router = express.Router({ mergeParams: true });

// Cast or update a vote on a proposal
router.post('/', requireAuth, requireDocumentAccess, async (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const paragraphId = req.params.paragraphId;
  const proposalId = req.params.proposalId;
  const { vote } = req.body;
  const userId = req.user.id;

  if (!['PRO', 'NEUTRAL', 'CONTRA'].includes(vote)) {
    return res.status(400).json({ error: 'Invalid vote type. Must be PRO, NEUTRAL, or CONTRA' });
  }

  // Check if voting deadline has passed for this document
  try {
    const doc = await new Promise((resolve, reject) => {
      db.get(`SELECT voting_deadline, status FROM documents WHERE id = ?`, [documentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (doc.voting_deadline && new Date() > new Date(doc.voting_deadline)) {
      return res.status(403).json({
        error: 'Voting deadline has passed for this document',
        deadline: doc.voting_deadline
      });
    }

    // Check document status - prevent voting on agreed documents
    if (doc.status === 'agreed') {
      return res.status(403).json({ error: 'Cannot vote on agreed documents' });
    }
  } catch (error) {
    console.error('Error checking document status:', error);
    return res.status(500).json({ error: 'Failed to validate document status' });
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
          checkAndUpdateProposalApproval(db, proposalId, documentId).catch(err =>
            console.error('Error updating proposal approval:', err)
          );

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
          checkAndUpdateProposalApproval(db, proposalId, documentId).catch(err =>
            console.error('Error updating proposal approval:', err)
          );

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
async function checkAndUpdateProposalApproval(db, proposalId, documentId) {
  try {
    // Get document acceptance threshold
    const doc = await new Promise((resolve, reject) => {
      db.get(`SELECT acceptance_threshold FROM documents WHERE id = ?`, [documentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    const acceptanceThreshold = doc?.acceptance_threshold || 75.0;

    // Get total eligible voters using VoterManager
    const totalUsers = await VoterManager.getEligibleVoterCount(db, documentId);

    // Get PRO vote count for this proposal
    const voteResult = await new Promise((resolve, reject) => {
      db.get(
        `SELECT COUNT(*) as pro_votes FROM votes WHERE proposal_id = ? AND vote = 'PRO'`,
        [proposalId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    const proVotes = voteResult.pro_votes;
    const approvalPercentage = totalUsers > 0 ? (proVotes / totalUsers) * 100 : 0;
    const shouldApprove = approvalPercentage >= acceptanceThreshold;

    console.log(`Proposal ${proposalId}: ${proVotes}/${totalUsers} PRO votes (${approvalPercentage.toFixed(1)}%) - ${shouldApprove ? 'APPROVED' : 'NOT APPROVED'}`);

    // Update proposal approval status
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE proposals SET approved = ? WHERE id = ?`,
        [shouldApprove ? 1 : 0, proposalId],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Always update the agreed view based on the highest approved proposal
    // regardless of whether this specific proposal was just approved or not
    await updateAgreedViewForParagraph(db, proposalId, documentId);

    // Also check if this proposal should be unapproved (if votes dropped below threshold)
    if (!shouldApprove) {
      // Check if this was the currently accepted proposal in the agreed view
      const currentParagraph = await new Promise((resolve, reject) => {
        db.get(`
          SELECT p.text, p.title
          FROM paragraphs p
          WHERE p.id = (SELECT paragraph_id FROM proposals WHERE id = ?)
        `, [proposalId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (currentParagraph) {
        // Get the proposal that was used for the current paragraph content
        const currentProposal = await new Promise((resolve, reject) => {
          db.get(`
            SELECT pr.text, pr.type
            FROM proposals pr
            JOIN history h ON pr.id = h.proposal_id
            WHERE h.paragraph_id = (SELECT paragraph_id FROM proposals WHERE id = ?)
            ORDER BY h.approval_percentage DESC, h.created_at DESC
            LIMIT 1
          `, [proposalId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });

        if (currentProposal) {
          // If the current paragraph content matches this now-unapproved proposal,
          // we need to update to the next best approved proposal
          const isTitleChange = currentProposal.type === 'TITLE';
          const currentContent = isTitleChange ? currentParagraph.title : currentParagraph.text;
          const proposalContent = currentProposal.text;

          if (currentContent === proposalContent) {
            // This was the active proposal, update to next best
            await updateAgreedViewForParagraph(db, proposalId, documentId);
          }
        }
      }
    }

  } catch (error) {
    console.error('Error in checkAndUpdateProposalApproval:', error);
  }
}

// TEMPORARILY DISABLED: Complex function with syntax issues
// Helper function to update the agreed view for a paragraph based on the highest approved proposal
/*
async function updateAgreedViewForParagraph(db, proposalId, documentId) {
  // Use document-level locking to prevent race conditions
  return documentLockManager.withLock(documentId, async () => {
    try {
      // First get the paragraph_id from the proposal
      const proposalData = await new Promise((resolve, reject) => {
        db.get(`SELECT paragraph_id FROM proposals WHERE id = ?`, [proposalId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!proposalData) {
        console.error('Proposal not found:', proposalId);
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

      const allProposals = await new Promise((resolve, reject) => {
        db.all(allProposalsQuery, [paragraphId], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      // Get document acceptance threshold
      const doc = await new Promise((resolve, reject) => {
        db.get(`SELECT acceptance_threshold FROM documents WHERE id = ?`, [documentId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      const acceptanceThreshold = doc?.acceptance_threshold || 75.0;

      // Get total eligible voters using VoterManager
      const totalUsers = await VoterManager.getEligibleVoterCount(db, documentId);

      // Fix: Add validation for zero users
      if (totalUsers === 0) {
        console.warn(`Document ${documentId} has no eligible voters - cannot calculate approval percentage`);
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
    } catch (error) {
      console.error('Error updating agreed view for paragraph:', error);
      throw error;
    }
  });
}
*/

async function updateAgreedViewForParagraph(db, proposalId, documentId) {
  // Use document-level locking to prevent race conditions
  return documentLockManager.withLock(documentId, async () => {
    try {
      // First get the paragraph_id from the proposal
      const proposalData = await new Promise((resolve, reject) => {
        db.get(`SELECT paragraph_id FROM proposals WHERE id = ?`, [proposalId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!proposalData) {
        console.log(`Proposal ${proposalId} not found`);
        return;
      }

      const paragraphId = proposalData.paragraph_id;

      // Get all approved proposals for this paragraph, ordered by approval percentage
      const approvedProposals = await new Promise((resolve, reject) => {
        db.all(`
          SELECT pr.id, pr.text, pr.type, pr.user_id, pr.heading_level,
                 COUNT(CASE WHEN v.vote = 'PRO' THEN 1 END) as pro_votes,
                 COUNT(v.id) as total_votes
          FROM proposals pr
          LEFT JOIN votes v ON pr.id = v.proposal_id
          WHERE pr.paragraph_id = ? AND pr.approved = 1
          GROUP BY pr.id
          HAVING COUNT(v.id) > 0  -- Only proposals that have been voted on
          ORDER BY (COUNT(CASE WHEN v.vote = 'PRO' THEN 1 END) * 1.0 / COUNT(v.id)) DESC, pr.created_at DESC
        `, [paragraphId], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      if (approvedProposals.length === 0) {
        console.log(`No approved proposals found for paragraph ${paragraphId}`);
        return;
      }

      // Calculate approval percentages and find the best proposal
      const proposalsWithPercentages = approvedProposals.map(p => ({
        ...p,
        approvalPercentage: p.total_votes > 0 ? (p.pro_votes / p.total_votes) * 100 : 0
      }));

      const bestProposal = proposalsWithPercentages[0];

      // Get current paragraph content
      const currentParagraph = await new Promise((resolve, reject) => {
        db.get(`SELECT text, title FROM paragraphs WHERE id = ?`, [paragraphId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!currentParagraph) {
        console.log(`Paragraph ${paragraphId} not found`);
        return;
      }

      const newValue = bestProposal.text;
      const oldValue = bestProposal.type === 'TITLE' ? currentParagraph.title : currentParagraph.text;
      const bestApprovalPercentage = bestProposal.approvalPercentage;

      console.log(`Applying approved proposal ${bestProposal.id} to paragraph ${paragraphId} (${bestApprovalPercentage.toFixed(1)}% approval)`);

      // Check if we need to update the paragraph content
      const needsUpdate = oldValue !== newValue;

      if (!needsUpdate) {
        console.log(`Paragraph ${paragraphId} already has the correct approved content`);
        return;
      }

      // Start transaction for atomic update
      await new Promise((resolve, reject) => {
        db.run('BEGIN TRANSACTION', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Update paragraph content
      const updateField = bestProposal.type === 'TITLE' ? 'title' : 'text';
      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE paragraphs SET ${updateField} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [newValue, paragraphId],
          function(err) {
            if (err) {
              console.error('Error updating paragraph:', err);
              db.run('ROLLBACK', () => reject(err));
            } else {
              resolve();
            }
          }
        );
      });

      // Create history entry to record this approval
      const { v4: uuidv4 } = require('uuid');
      const historyId = uuidv4();

      await new Promise((resolve, reject) => {
        db.run(`
          INSERT OR REPLACE INTO history
          (id, paragraph_id, user_id, old_text, new_text, approval_percentage, proposal_id, heading_level, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
          historyId,
          paragraphId,
          bestProposal.user_id,
          oldValue,
          newValue,
          bestApprovalPercentage,
          bestProposal.id,
          bestProposal.heading_level
        ], function(err) {
          if (err) {
            console.error('Error creating history entry:', err);
            db.run('ROLLBACK', () => reject(err));
          } else {
            console.log(`Created history entry ${historyId} for approved proposal`);
            resolve();
          }
        });
      });

      // Commit transaction
      await new Promise((resolve, reject) => {
        db.run('COMMIT', (err) => {
          if (err) {
            console.error('Error committing transaction:', err);
            reject(err);
          } else {
            console.log(`Successfully applied approved proposal to paragraph ${paragraphId}`);
            resolve();
          }
        });
      });

    } catch (error) {
      console.error('Error updating agreed view for paragraph:', error);
      throw error;
    }
  });
}

module.exports = router;

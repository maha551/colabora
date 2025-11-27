const express = require('express');
const { metricsCollector } = require('../middleware/monitoring');
const { requireAuth, requireDocumentAccess } = require('../middleware/auth');
const VoterManager = require('../modules/voting');
const documentLockManager = require('../modules/locks');
const webSocketManager = require('../modules/websocket');
const { logger } = require('../middleware/logger');

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
    logger.error('Error checking document status', { error: error.message, stack: error.stack, documentId });
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
      logger.error('Error verifying proposal', { error: err.message, documentId, paragraphId, proposalId });
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
        logger.error('Error checking existing vote', { error: err.message, documentId, paragraphId, proposalId, userId });
        return res.status(500).json({ error: 'Failed to cast vote' });
      }

      if (existingVote) {
        // Check if vote changes are allowed for this document
        db.get(`
          SELECT vote_change_allowed FROM documents WHERE id = ?
        `, [documentId], (docErr, doc) => {
          if (docErr) {
            logger.error('Error checking document options', { error: docErr.message, documentId });
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
          `, [vote, proposalId, userId], async function(err) {
            if (err) {
              logger.error('Error updating vote', { error: err.message, documentId, paragraphId, proposalId, userId });
              return res.status(500).json({ error: 'Failed to update vote' });
            }

          // Fetch all votes for this proposal to include in WebSocket update (for instant UI update)
          db.all(`
            SELECT v.id, v.user_id, v.vote, v.created_at,
                   u.name as user_name, u.email as user_email
            FROM votes v
            LEFT JOIN users u ON v.user_id = u.id
            WHERE v.proposal_id = ?
            ORDER BY v.created_at ASC
          `, [proposalId], (voteErr, votes) => {
            if (voteErr) {
              logger.error('Error fetching votes for WebSocket update', { error: voteErr.message, documentId, paragraphId, proposalId });
              // Still broadcast without votes, client will reload
              webSocketManager.broadcastVoteUpdate(documentId, proposalId, paragraphId, {
                voteId: existingVote.id,
                userId,
                vote,
                action: 'updated'
              });
              return res.json({ message: 'Vote updated successfully' });
            }

            // Get document voting_anonymous setting
            db.get(`SELECT voting_anonymous FROM documents WHERE id = ?`, [documentId], (docErr, doc) => {
              const isAnonymous = doc?.voting_anonymous === 1;
              
              // Format votes for broadcast - include userId for all votes
              // Client will handle anonymity filtering based on document settings
              // This ensures consistent vote structure for all recipients
              const formattedVotes = votes.map(v => ({
                id: v.id,
                userId: v.user_id, // Always include userId - client handles anonymity
                vote: v.vote,
                createdAt: v.created_at,
                // Include user info - client will filter based on anonymity settings
                user: isAnonymous && v.user_id !== userId 
                  ? undefined // Hide user info for anonymous votes (except own vote)
                  : { id: v.user_id, name: v.user_name, email: v.user_email }
              }));

              // Broadcast real-time update via WebSocket with all votes
              webSocketManager.broadcastVoteUpdate(documentId, proposalId, paragraphId, {
                voteId: existingVote.id,
                userId,
                vote,
                action: 'updated',
                allVotes: formattedVotes, // Include all votes for instant UI update
                isAnonymous // Include anonymity flag so client knows how to display
              });
              
              // Respond immediately, then process approval asynchronously
              res.json({ message: 'Vote updated successfully' });
              
              // Process approval check asynchronously (non-blocking)
              checkAndUpdateProposalApproval(db, proposalId, documentId).catch(err => {
                logger.error('Error updating proposal approval (async)', { error: err.message, proposalId, paragraphId });
              });
            });
          });
          });
        });
      } else {
        // Insert new vote
        const { v4: uuidv4 } = require('uuid');
        const voteId = uuidv4();

        db.run(`
          INSERT INTO votes (id, proposal_id, user_id, vote)
          VALUES (?, ?, ?, ?)
        `, [voteId, proposalId, userId, vote], async function(err) {
          if (err) {
            logger.error('Error casting vote', { error: err.message, stack: err.stack, documentId, paragraphId, proposalId, userId });
            return res.status(500).json({ error: 'Failed to cast vote' });
          }

          // Record business metrics
          metricsCollector.recordBusinessEvent('vote_cast', {
            voteId,
            proposalId,
            userId,
            vote,
            documentId
          });

          // Fetch all votes for this proposal to include in WebSocket update (for instant UI update)
          db.all(`
            SELECT v.id, v.user_id, v.vote, v.created_at,
                   u.name as user_name, u.email as user_email
            FROM votes v
            LEFT JOIN users u ON v.user_id = u.id
            WHERE v.proposal_id = ?
            ORDER BY v.created_at ASC
          `, [proposalId], (voteErr, votes) => {
            if (voteErr) {
              logger.error('Error fetching votes for WebSocket update', { error: voteErr.message, documentId, paragraphId, proposalId });
              // Still broadcast without votes, client will reload
              webSocketManager.broadcastVoteUpdate(documentId, proposalId, paragraphId, {
                voteId,
                userId,
                vote,
                action: 'cast'
              });
              return res.json({ message: 'Vote cast successfully' });
            }

            // Get document voting_anonymous setting
            db.get(`SELECT voting_anonymous FROM documents WHERE id = ?`, [documentId], (docErr, doc) => {
              const isAnonymous = doc?.voting_anonymous === 1;
              
              // Format votes for broadcast - include userId for all votes
              // Client will handle anonymity filtering based on document settings
              // This ensures consistent vote structure for all recipients
              const formattedVotes = votes.map(v => ({
                id: v.id,
                userId: v.user_id, // Always include userId - client handles anonymity
                vote: v.vote,
                createdAt: v.created_at,
                // Include user info - client will filter based on anonymity settings
                user: isAnonymous && v.user_id !== userId 
                  ? undefined // Hide user info for anonymous votes (except own vote)
                  : { id: v.user_id, name: v.user_name, email: v.user_email }
              }));

              // Broadcast real-time update via WebSocket with all votes
              webSocketManager.broadcastVoteUpdate(documentId, proposalId, paragraphId, {
                voteId,
                userId,
                vote,
                action: 'cast',
                allVotes: formattedVotes, // Include all votes for instant UI update
                isAnonymous // Include anonymity flag so client knows how to display
              });
              
              // Respond immediately, then process approval asynchronously
              res.json({ message: 'Vote cast successfully' });
              
              // Process approval check asynchronously (non-blocking)
              checkAndUpdateProposalApproval(db, proposalId, documentId).catch(err => {
                logger.error('Error updating proposal approval (async)', { error: err.message, proposalId, paragraphId });
              });
            });
          });
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

    logger.debug('Proposal approval check', { proposalId, proVotes, totalUsers, approvalPercentage, approved: shouldApprove });

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
    logger.error('Error in checkAndUpdateProposalApproval', { error: error.message, stack: error.stack, proposalId, paragraphId });
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
        logger.warn('Proposal not found', { proposalId, paragraphId });
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
        logger.warn('Document has no eligible voters - cannot calculate approval percentage', { documentId });
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
              logger.error('Error getting paragraph data', { error: err.message, paragraphId });
              return;
            }

            const isDocumentTitle = paragraphData.order_index !== null && paragraphData.order_index < 0;

            if (!bestProposal) {
              // No proposal meets the threshold - revert paragraph to empty state
              logger.debug('No approved proposals for paragraph - reverting to empty state', { paragraphId, documentId });

              if (isDocumentTitle) {
                // For document title paragraph, don't empty it - keep the current title
                // This ensures the document title remains visible in the header
                return;
              }

              // Use transaction for atomic paragraph clearing
              db.run('BEGIN TRANSACTION', (beginErr) => {
                if (beginErr) {
                  logger.error('Error beginning transaction for paragraph clearing', { error: beginErr.message, paragraphId });
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
                        logger.error('Error committing paragraph clearing transaction', { error: commitErr.message, paragraphId });
                        db.run('ROLLBACK', () => {});
                      }
                    });
                  }
                };

                const handleError = (error, operation) => {
                  if (!hasError) {
                    hasError = true;
                    logger.error('Error in operation', { error: error.message, operation, paragraphId });
                    db.run('ROLLBACK', () => {
                      logger.error('Transaction rolled back due to error in operation', { operation, paragraphId });
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
                logger.error('Error beginning transaction for proposal approval', { error: beginErr.message, proposalId, paragraphId });
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
                      logger.error('Error checking existing history', { error: err.message, paragraphId, proposalId });
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
                          logger.error('Error recording history entry', { error: historyErr.message, paragraphId, proposalId });
                          db.run('ROLLBACK', () => {});
                          return;
                        }
                        // Commit transaction after history entry
                        db.run('COMMIT', (commitErr) => {
                          if (commitErr) {
                            logger.error('Error committing proposal approval transaction', { error: commitErr.message, proposalId, paragraphId });
                            db.run('ROLLBACK', () => {});
                          }
                        });
                      });
                    } else {
                      // History already exists, just commit
                      db.run('COMMIT', (commitErr) => {
                        if (commitErr) {
                          logger.error('Error committing proposal approval transaction', { error: commitErr.message, proposalId, paragraphId });
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
                  logger.error('Error in operation', { error: error.message, operation, proposalId, paragraphId });
                  db.run('ROLLBACK', () => {
                    logger.error('Transaction rolled back due to error in operation', { operation, proposalId, paragraphId });
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
      logger.error('Error updating agreed view for paragraph', { error: error.message, stack: error.stack, proposalId, documentId });
      throw error;
    }
  });
}
*/

async function updateAgreedViewForParagraph(db, proposalId, documentId) {
  // Use document-level locking to prevent race conditions
  return documentLockManager.withLock(documentId, async () => {
    try {
      logger.debug('Starting updateAgreedView', { proposalId, documentId });
      
      // Batch query: Get proposal data, document threshold, and paragraph info in parallel
      const [proposalData, doc, eligibleVoters] = await Promise.all([
        new Promise((resolve, reject) => {
          db.get(`SELECT paragraph_id FROM proposals WHERE id = ?`, [proposalId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        }),
        new Promise((resolve, reject) => {
          db.get(`SELECT acceptance_threshold FROM documents WHERE id = ?`, [documentId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        }),
        VoterManager.getEligibleVoterCount(db, documentId)
      ]);

      if (!proposalData) {
        logger.warn('Proposal not found in updateAgreedView', { proposalId, documentId });
        return;
      }

      const paragraphId = proposalData.paragraph_id;
      const acceptanceThreshold = doc?.acceptance_threshold || 75.0;
      
      if (eligibleVoters === 0) {
        logger.warn('Document has no eligible voters - cannot calculate approval percentage', { documentId });
        return;
      }

      logger.debug('Found paragraph for proposal in updateAgreedView', { paragraphId, proposalId, documentId });

      // Get ALL proposals for this paragraph with current vote counts (not just approved ones)
      // We need to check current vote counts, not just the approved flag
      const allProposals = await new Promise((resolve, reject) => {
        db.all(`
          SELECT pr.id, pr.text, pr.type, pr.user_id, pr.heading_level, pr.created_at,
                 COUNT(CASE WHEN v.vote = 'PRO' THEN 1 END) as pro_votes,
                 COUNT(v.id) as total_votes
          FROM proposals pr
          LEFT JOIN votes v ON pr.id = v.proposal_id
          WHERE pr.paragraph_id = ?
          GROUP BY pr.id
        `, [paragraphId], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      if (allProposals.length === 0) {
        logger.debug('No proposals found for paragraph', { paragraphId, documentId });
        return;
      }

      // Calculate approval percentages and filter by threshold
      const proposalsWithPercentages = allProposals.map((p) => {
        const approvalPercentage = eligibleVoters > 0 ? (p.pro_votes / eligibleVoters) * 100 : 0;
        return {
          ...p,
          approvalPercentage,
          eligibleVoters
        };
      });

      // Filter to only proposals that meet the threshold
      const validProposals = proposalsWithPercentages.filter(p => p.approvalPercentage >= acceptanceThreshold);

      if (validProposals.length === 0) {
        logger.debug('No proposals meet current acceptance threshold', { paragraphId, documentId, acceptanceThreshold });
        
        // Get current paragraph to check if it needs to be cleared
        const currentParagraph = await new Promise((resolve, reject) => {
          db.get(`SELECT text, title, order_index, heading_level FROM paragraphs WHERE id = ?`, [paragraphId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });

        if (!currentParagraph) {
          logger.warn('Paragraph not found', { paragraphId, documentId });
          return;
        }

        // Check if paragraph has content that needs to be cleared
        const hasContent = (currentParagraph.text && currentParagraph.text.trim()) || 
                          (currentParagraph.title && currentParagraph.title.trim());
        const isFirstParagraph = currentParagraph.order_index === 1;

        // Don't clear document title paragraph (first paragraph)
        if (isFirstParagraph) {
          logger.debug('Skipping clear for document title paragraph', { paragraphId, documentId });
          return;
        }

        // Clear paragraph content if it has any
        if (hasContent) {
          await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (beginErr) => {
              if (beginErr) {
                reject(beginErr);
                return;
              }

              // Clear paragraph based on type
              const clearQuery = currentParagraph.title 
                ? `UPDATE paragraphs SET title = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
                : `UPDATE paragraphs SET text = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

              db.run(clearQuery, [paragraphId], (clearErr) => {
                if (clearErr) {
                  db.run('ROLLBACK', () => {});
                  reject(clearErr);
                  return;
                }

                // Update document timestamp
                db.run(`UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [documentId], (docErr) => {
                  if (docErr) {
                    db.run('ROLLBACK', () => {});
                    reject(docErr);
                    return;
                  }

                  db.run('COMMIT', (commitErr) => {
                    if (commitErr) {
                      db.run('ROLLBACK', () => {});
                      reject(commitErr);
                    } else {
                      logger.debug('Cleared paragraph content (no approved proposals)', { paragraphId, documentId });
                      resolve();
                    }
                  });
                });
              });
            });
          });

          // Broadcast paragraph update (reverted to empty) via WebSocket
          // Use simpler query without history aggregation for performance
          db.get(`SELECT id, text, title, heading_level, order_index FROM paragraphs WHERE id = ?`, [paragraphId], (paraErr, updatedPara) => {
            if (!paraErr && updatedPara) {
              webSocketManager.broadcastDocumentUpdate(documentId, 'paragraph', {
                paragraphId,
                text: updatedPara.text || '',
                title: updatedPara.title || '',
                headingLevel: updatedPara.heading_level,
                orderIndex: updatedPara.order_index,
                reverted: true // Indicates paragraph was reverted to empty state
              });
              logger.debug('Broadcasted paragraph revert', { paragraphId, documentId });
            }
          });
        }
        
        return;
      }

      // Sort by: 1) Most votes (pro_votes DESC), 2) Most recent if tied (created_at DESC)
      validProposals.sort((a, b) => {
        if (b.pro_votes !== a.pro_votes) {
          return b.pro_votes - a.pro_votes; // More votes first
        }
        // If votes are equal, most recent first
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      const bestProposal = validProposals[0];

      // Get current paragraph content and check if it's the first paragraph (title paragraph)
      const currentParagraph = await new Promise((resolve, reject) => {
        db.get(`SELECT text, title, order_index FROM paragraphs WHERE id = ?`, [paragraphId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!currentParagraph) {
        logger.warn('Paragraph not found', { paragraphId, documentId });
        return;
      }

      // Check if this is the first paragraph (document title paragraph)
      // First paragraph always has order_index = 1 and is the document title
      const isFirstParagraph = currentParagraph.order_index === 1;

      const newValue = bestProposal.text;
      const oldValue = bestProposal.type === 'TITLE' ? currentParagraph.title : currentParagraph.text;
      const bestApprovalPercentage = bestProposal.approvalPercentage;

      logger.info('Applying approved proposal to paragraph', { proposalId: bestProposal.id, paragraphId, documentId, approvalPercentage: bestApprovalPercentage });
      if (isFirstParagraph && bestProposal.type === 'TITLE') {
        logger.debug('This is the document title paragraph - will update documents.title', { paragraphId, documentId });
      }

      // Check if we need to update the paragraph content
      const needsUpdate = oldValue !== newValue;

      if (!needsUpdate) {
        logger.debug('Paragraph already has the correct approved content', { paragraphId, documentId });
        // Even if paragraph doesn't need update, we might need to update documents.title
        if (isFirstParagraph && bestProposal.type === 'TITLE') {
          // Check if documents.title needs updating
          const currentDocTitle = await new Promise((resolve, reject) => {
            db.get(`SELECT title FROM documents WHERE id = ?`, [documentId], (err, row) => {
              if (err) reject(err);
              else resolve(row?.title);
            });
          });
          if (currentDocTitle !== newValue) {
            logger.debug('Updating documents.title', { documentId, oldTitle: currentDocTitle, newTitle: newValue });
            await new Promise((resolve, reject) => {
              db.run(
                `UPDATE documents SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [newValue, documentId],
                function(err) {
                  if (err) {
                    logger.error('Error updating document title', { error: err.message, documentId, newTitle: newValue });
                    reject(err);
                  } else {
                    logger.info('Updated documents.title', { documentId, newTitle: newValue });
                    resolve();
                  }
                }
              );
            });
          }
        }
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
      if (bestProposal.type === 'TITLE') {
        // For TITLE proposals, update the title field and heading_level
        await new Promise((resolve, reject) => {
          db.run(
            `UPDATE paragraphs SET title = ?, heading_level = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [newValue, bestProposal.heading_level, paragraphId],
            function(err) {
              if (err) {
                logger.error('Error updating paragraph title', { error: err.message, paragraphId, documentId });
                db.run('ROLLBACK', () => reject(err));
              } else {
                resolve();
              }
            }
          );
        });

        // If this is the first paragraph (document title paragraph), also update documents.title
        if (isFirstParagraph) {
          await new Promise((resolve, reject) => {
            db.run(
              `UPDATE documents SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              [newValue, documentId],
              function(err) {
                if (err) {
                  logger.error('Error updating document title', { error: err.message, documentId, newTitle: newValue });
                  db.run('ROLLBACK', () => reject(err));
                } else {
                  logger.info('Updated documents.title', { documentId, newTitle: newValue });
                  resolve();
                }
              }
            );
          });
        }
      } else {
        // For BODY proposals, update the text field
        await new Promise((resolve, reject) => {
          db.run(
            `UPDATE paragraphs SET text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [newValue, paragraphId],
            function(err) {
              if (err) {
                logger.error('Error updating paragraph text', { error: err.message, paragraphId, documentId });
                db.run('ROLLBACK', () => reject(err));
              } else {
                resolve();
              }
            }
          );
        });
      }

      // Update or create history entry to record this approval
      // First check if history entry already exists for this proposal
      const existingHistory = await new Promise((resolve, reject) => {
        db.get(`SELECT id FROM history WHERE proposal_id = ? AND paragraph_id = ?`, 
          [bestProposal.id, paragraphId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (existingHistory) {
        // Update existing history entry with current approval percentage
        // Note: history table doesn't have updated_at column, only created_at
        await new Promise((resolve, reject) => {
          db.run(`
            UPDATE history 
            SET approval_percentage = ?
            WHERE id = ?
          `, [bestApprovalPercentage, existingHistory.id], function(err) {
            if (err) {
              logger.error('Error updating history entry', { error: err.message, historyId: existingHistory.id, paragraphId, documentId });
              db.run('ROLLBACK', () => reject(err));
            } else {
              logger.debug('Updated history entry', { historyId: existingHistory.id, approvalPercentage: bestApprovalPercentage, paragraphId, documentId });
              resolve();
            }
          });
        });
      } else {
        // Create new history entry
        const { v4: uuidv4 } = require('uuid');
        const historyId = uuidv4();

        await new Promise((resolve, reject) => {
          db.run(`
            INSERT INTO history
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
              logger.error('Error creating history entry', { error: err.message, paragraphId, proposalId, documentId });
              db.run('ROLLBACK', () => reject(err));
            } else {
              logger.debug('Created history entry for approved proposal', { historyId, paragraphId, proposalId, documentId });
              resolve();
            }
          });
        });
      }

      // Also update history entries for other proposals in this paragraph to reflect current approval percentages
      // This ensures proposals that fall below threshold have updated history entries
      for (const proposal of proposalsWithPercentages) {
        if (proposal.id === bestProposal.id) continue; // Already handled above
        
        const otherHistory = await new Promise((resolve, reject) => {
          db.get(`SELECT id FROM history WHERE proposal_id = ? AND paragraph_id = ?`, 
            [proposal.id, paragraphId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });

        if (otherHistory) {
          // Update history entry with current approval percentage
          // Note: history table doesn't have updated_at column
          await new Promise((resolve) => {
            db.run(`
              UPDATE history 
              SET approval_percentage = ?
              WHERE id = ?
            `, [proposal.approvalPercentage, otherHistory.id], (err) => {
              if (err) {
                logger.error('Error updating history entry', { error: err.message, historyId: otherHistory.id, paragraphId, documentId });
              }
              resolve();
            });
          });
        }
      }

      // Commit transaction
      await new Promise((resolve, reject) => {
        db.run('COMMIT', (err) => {
          if (err) {
            logger.error('Error committing transaction', { error: err.message, paragraphId, proposalId, documentId });
            reject(err);
          } else {
            logger.info('Successfully applied approved proposal to paragraph', { paragraphId, proposalId, documentId });
            
            // Broadcast paragraph update via WebSocket (for instant agreed view update)
            // Use simpler query without history aggregation for better performance
            db.get(`SELECT id, text, title, heading_level, order_index FROM paragraphs WHERE id = ?`, [paragraphId], (paraErr, updatedPara) => {
              if (!paraErr && updatedPara) {
                const updateData = {
                  paragraphId,
                  text: updatedPara.text || '',
                  title: updatedPara.title || null,
                  headingLevel: updatedPara.heading_level,
                  orderIndex: updatedPara.order_index,
                  proposalId: bestProposal.id,
                  approvalPercentage: bestApprovalPercentage
                };
                
                logger.debug('Broadcasting paragraph update', { paragraphId, documentId, proposalId: bestProposal.id });
                
                webSocketManager.broadcastDocumentUpdate(documentId, 'paragraph', updateData);
                logger.debug('Broadcasted paragraph update', { paragraphId, documentId });
              } else if (paraErr) {
                logger.error('Error fetching paragraph for WebSocket broadcast', { error: paraErr.message, paragraphId, documentId });
              }
            });
            
            resolve();
          }
        });
      });

      logger.debug('Completed updateAgreedView', { proposalId, documentId, paragraphId });

    } catch (error) {
      logger.error('Error updating agreed view for paragraph', { error: error.message, stack: error.stack, proposalId, documentId });
      throw error;
    }
  });
}

module.exports = router;


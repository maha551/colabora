const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const router = express.Router();

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// Helper function to check if user is representative of organization
function isRepresentative(db, userId, organizationId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT representatives FROM organizations WHERE id = ?', [organizationId], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(false);

      try {
        const representatives = JSON.parse(row.representatives || '[]');
        resolve(representatives.includes(userId));
      } catch (e) {
        resolve(false);
      }
    });
  });
}

// Helper function to check if user is active member
function isActiveMember(db, userId, organizationId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT status FROM organization_members WHERE organization_id = ? AND user_id = ?', [organizationId, userId], (err, row) => {
      if (err) return reject(err);
      resolve(row && row.status === 'active');
    });
  });
}

// Helper function to get governance rules for organization
function getGovernanceRules(db, organizationId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM organization_governance_rules WHERE organization_id = ?', [organizationId], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

// Helper function to generate anonymous token
function generateAnonymousToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Helper function to hash vote for tamper-proofing
function hashVote(voteData) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(voteData));
  return hash.digest('hex');
}

// Export functions for testing alongside router
module.exports = router;
module.exports.generateAnonymousToken = generateAnonymousToken;
module.exports.hashVote = hashVote;

// Helper function to log audit events
function logAudit(db, organizationId, actionType, performedByUserId, affectedUserId = null, details = {}, req) {
  const auditData = {
    id: uuidv4(),
    organization_id: organizationId,
    action_type: actionType,
    performed_by_user_id: performedByUserId,
    affected_user_id: affectedUserId,
    details: JSON.stringify(details),
    ip_address: req.ip,
    user_agent: req.get('User-Agent'),
    created_at: new Date().toISOString()
  };

  db.run(`INSERT INTO organization_audit (
    id, organization_id, action_type, performed_by_user_id, affected_user_id,
    details, ip_address, user_agent, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    auditData.id, auditData.organization_id, auditData.action_type,
    auditData.performed_by_user_id, auditData.affected_user_id,
    auditData.details, auditData.ip_address, auditData.user_agent, auditData.created_at
  ]);
}

// Get governance rules for organization
router.get('/:organizationId/governance-rules', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;

  try {
    // Check if user has access (member or representative)
    const hasAccess = await isRepresentative(db, userId, organizationId) ||
                     await isActiveMember(db, userId, organizationId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const rules = await getGovernanceRules(db, organizationId);

    // If no governance rules exist yet, return default values
    const defaultRules = {
      id: null,
      organizationId: organizationId,
      representativeTermMonths: 12,
      representativeTermLimits: null,
      electionVotingMethod: 'simple_majority',
      electionQuorumPercentage: 0.5,
      electionNoticeDays: 14,
      defaultVotingDeadlineHours: 168,
      defaultQuorumPercentage: 0.5,
      documentProposalPeriodDays: 365, // Default 1 year proposal period for documents
      anonymousVotingEnabled: true,
      voteChangeAllowed: false,
      representativeCanCreateVotes: true,
      representativeCanInviteMembers: true,
      representativeCanManageDocuments: true,
      representativeApprovalRequired: true,
      tamperProofEnabled: true,
      auditTrailEnabled: true,
      createdAt: null,
      updatedAt: null
    };

    res.json({ governanceRules: rules || defaultRules });
  } catch (error) {
    console.error('Error fetching governance rules:', error);
    res.status(500).json({ error: 'Failed to fetch governance rules' });
  }
});

// Get policy votes for organization
router.get('/:organizationId/policy-votes', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;

  try {
    // Check if user has access
    const hasAccess = await isRepresentative(db, userId, organizationId) ||
                     await isActiveMember(db, userId, organizationId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get all policy votes for this organization
    db.all(`
      SELECT pv.*, u.name as created_by_name
      FROM policy_votes pv
      LEFT JOIN users u ON pv.created_by = u.id
      WHERE pv.organization_id = ?
      ORDER BY pv.created_at DESC
    `, [organizationId], (err, votes) => {
      if (err) {
        console.error('Error fetching policy votes:', err);
        return res.status(500).json({ error: 'Failed to fetch policy votes' });
      }

      res.json({ policyVotes: votes || [] });
    });

  } catch (error) {
    console.error('Error fetching policy votes:', error);
    res.status(500).json({ error: 'Failed to fetch policy votes' });
  }
});

// Create policy vote
router.post('/:organizationId/policy-votes', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;
  const { title, description, documentId, threshold, deadlineHours } = req.body;

  try {
    // Check if user is representative
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) {
      return res.status(403).json({ error: 'Only representatives can create policy votes' });
    }

    const voteId = uuidv4();
    const now = new Date();
    const deadline = new Date(now.getTime() + (deadlineHours || 168) * 60 * 60 * 1000); // Default 7 days

    db.run(`
      INSERT INTO policy_votes (
        id, organization_id, title, description, document_id,
        threshold_percentage, deadline_at, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      voteId, organizationId, title, description, documentId,
      threshold || 50, deadline.toISOString(), userId, now.toISOString()
    ], function(err) {
      if (err) {
        console.error('Error creating policy vote:', err);
        return res.status(500).json({ error: 'Failed to create policy vote' });
      }

      // Log audit event
      logAudit(db, organizationId, 'policy_vote_created', userId, null, { voteId, title }, req);

      res.json({
        policyVote: {
          id: voteId,
          organizationId,
          title,
          description,
          documentId,
          thresholdPercentage: threshold || 50,
          deadlineAt: deadline.toISOString(),
          createdBy: userId,
          createdAt: now.toISOString()
        }
      });
    });

  } catch (error) {
    console.error('Error creating policy vote:', error);
    res.status(500).json({ error: 'Failed to create policy vote' });
  }
});

// Vote on policy vote
router.post('/:organizationId/policy-votes/:voteId/vote', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, voteId } = req.params;
  const userId = req.user.id;
  const { vote } = req.body; // 'yes', 'no', 'abstain'

  try {
    // Check if user is active member
    const isMember = await isActiveMember(db, userId, organizationId);
    if (!isMember) {
      return res.status(403).json({ error: 'Only active members can vote' });
    }

    // Check if vote exists and is active
    db.get(`
      SELECT * FROM policy_votes
      WHERE id = ? AND organization_id = ? AND status = 'active'
    `, [voteId, organizationId], (err, policyVote) => {
      if (err || !policyVote) {
        return res.status(404).json({ error: 'Policy vote not found or not active' });
      }

      // Check if user already voted
      db.get(`
        SELECT * FROM policy_vote_responses
        WHERE policy_vote_id = ? AND user_id = ?
      `, [voteId, userId], (err, existingVote) => {
        if (err) {
          console.error('Error checking existing vote:', err);
          return res.status(500).json({ error: 'Failed to check vote status' });
        }

        if (existingVote) {
          return res.status(400).json({ error: 'You have already voted on this policy' });
        }

        // Record the vote
        const responseId = uuidv4();
        db.run(`
          INSERT INTO policy_vote_responses (
            id, policy_vote_id, user_id, vote, voted_at
          ) VALUES (?, ?, ?, ?, ?)
        `, [
          responseId, voteId, userId, vote, new Date().toISOString()
        ], function(err) {
          if (err) {
            console.error('Error recording vote:', err);
            return res.status(500).json({ error: 'Failed to record vote' });
          }

          // Update vote counts
          updatePolicyVoteCounts(db, voteId);

          // Log audit event
          logAudit(db, organizationId, 'policy_vote_cast', userId, null, { voteId, vote }, req);

          res.json({ success: true, message: 'Vote recorded successfully' });
        });
      });
    });

  } catch (error) {
    console.error('Error voting on policy:', error);
    res.status(500).json({ error: 'Failed to cast vote' });
  }
});

// Get election results
router.get('/:organizationId/elections/:electionId/results', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, electionId } = req.params;
  const userId = req.user.id;

  try {
    // Check if user has access
    const hasAccess = await isRepresentative(db, userId, organizationId) ||
                     await isActiveMember(db, userId, organizationId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get election details
    db.get(`
      SELECT re.*, COUNT(ec.id) as candidate_count
      FROM representative_elections re
      LEFT JOIN election_candidates ec ON re.id = ec.election_id
      WHERE re.id = ? AND re.organization_id = ?
      GROUP BY re.id
    `, [electionId, organizationId], (err, election) => {
      if (err || !election) {
        return res.status(404).json({ error: 'Election not found' });
      }

      // Get candidates with vote counts, sorted by votes
      db.all(`
        SELECT ec.*, u.name as user_name, u.email as user_email
        FROM election_candidates ec
        LEFT JOIN users u ON ec.user_id = u.id
        WHERE ec.election_id = ?
        ORDER BY ec.votes_received DESC, ec.nominated_at ASC
      `, [electionId], (err, candidates) => {
        if (err) {
          console.error('Error fetching candidates:', err);
          return res.status(500).json({ error: 'Failed to fetch election results' });
        }

        // Calculate totals
        const totalVotes = candidates.reduce((sum, c) => sum + (c.votes_received || 0), 0);
        const activeMembers = 0; // Would need to get from organization_members count
        const quorumPercentage = election.quorum_required > 0 ? (election.votes_cast / election.quorum_required) * 100 : 0;

        res.json({
          election,
          candidates,
          stats: {
            totalVotes,
            votesCast: election.votes_cast || 0,
            quorumRequired: election.quorum_required || 0,
            quorumPercentage,
            quorumReached: (election.votes_cast || 0) >= (election.quorum_required || 0),
            positionsAvailable: election.positions_available || 1
          }
        });
      });
    });

  } catch (error) {
    console.error('Error fetching election results:', error);
    res.status(500).json({ error: 'Failed to fetch election results' });
  }
});

// Rule Proposal System

// Get rule proposals for organization
router.get('/:organizationId/rule-proposals', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;

  try {
    // Check if user has access
    const hasAccess = await isRepresentative(db, userId, organizationId) ||
                     await isActiveMember(db, userId, organizationId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get all rule proposals with their votes
    db.all(`
      SELECT grp.*, u.name as created_by_name
      FROM governance_rule_proposals grp
      LEFT JOIN users u ON grp.created_by = u.id
      WHERE grp.organization_id = ?
      ORDER BY grp.created_at DESC
    `, [organizationId], (err, proposals) => {
      if (err) {
        console.error('Error fetching rule proposals:', err);
        return res.status(500).json({ error: 'Failed to fetch rule proposals' });
      }

      if (!proposals || proposals.length === 0) {
        return res.json({ ruleProposals: [] });
      }

      // Get votes for all proposals
      const proposalIds = proposals.map(p => p.id);
      const placeholders = proposalIds.map(() => '?').join(',');
      db.all(`
        SELECT
          grpv.*,
          u.name as voter_name,
          u.email as voter_email
        FROM governance_rule_proposal_votes grpv
        LEFT JOIN users u ON grpv.user_id = u.id
        WHERE grpv.proposal_id IN (${placeholders})
        ORDER BY grpv.voted_at ASC
      `, proposalIds, (err, votes) => {
        if (err) {
          console.error('Error fetching proposal votes:', err);
          return res.status(500).json({ error: 'Failed to fetch proposal votes' });
        }

        // Group votes by proposal
        const votesByProposal = {};
        votes.forEach(vote => {
          if (!votesByProposal[vote.proposal_id]) {
            votesByProposal[vote.proposal_id] = [];
          }
          votesByProposal[vote.proposal_id].push({
            id: vote.id,
            userId: vote.user_id,
            selectedOptionId: vote.selected_option_id,
            voteChoice: vote.vote_choice,
            votedAt: vote.voted_at,
            user: {
              id: vote.user_id,
              name: vote.voter_name,
              email: vote.voter_email
            }
          });
        });

        // Attach votes to proposals
        const proposalsWithVotes = proposals.map(proposal => ({
          ...proposal,
          votes: votesByProposal[proposal.id] || []
        }));

        res.json({ ruleProposals: proposalsWithVotes });
      });
    });

  } catch (error) {
    console.error('Error fetching rule proposals:', error);
    res.status(500).json({ error: 'Failed to fetch rule proposals' });
  }
});

// Create rule proposal
router.post('/:organizationId/rule-proposals', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;
  const { title, description, ruleField, proposedValue, options } = req.body;

  try {
    // Check if user is representative
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) {
      return res.status(403).json({ error: 'Only representatives can create rule proposals' });
    }

    const proposalId = uuidv4();
    const now = new Date();

    // Get current rule value
    db.get('SELECT * FROM organization_governance_rules WHERE organization_id = ?',
      [organizationId], (err, currentRules) => {
        if (err) {
          console.error('Error fetching current rules:', err);
          return res.status(500).json({ error: 'Failed to fetch current rules' });
        }

        const currentValue = currentRules ? JSON.stringify(currentRules[ruleField]) : null;

        db.run(`
          INSERT INTO governance_rule_proposals (
            id, organization_id, title, description, current_rule_field,
            current_rule_value, proposed_rule_value, created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          proposalId, organizationId, title, description, ruleField,
          currentValue, JSON.stringify(proposedValue), userId, now.toISOString()
        ], function(err) {
          if (err) {
            console.error('Error creating rule proposal:', err);
            return res.status(500).json({ error: 'Failed to create rule proposal' });
          }

          // If options provided, create them
          if (options && Array.isArray(options) && options.length > 0) {
            const optionInserts = options.map(option => {
              const optionId = uuidv4();
              return new Promise((resolve, reject) => {
                db.run(`
                  INSERT INTO governance_rule_proposal_options (
                    id, proposal_id, option_title, option_description, proposed_value
                  ) VALUES (?, ?, ?, ?, ?)
                `, [
                  optionId, proposalId, option.optionTitle, option.optionDescription,
                  JSON.stringify(option.proposedValue)
                ], (err) => {
                  if (err) reject(err);
                  else resolve(optionId);
                });
              });
            });

            Promise.all(optionInserts).then(() => {
              // Log audit event
              logAudit(db, organizationId, 'rule_proposal_created', userId, null, {
                proposalId,
                ruleField,
                hasOptions: true,
                optionCount: options.length
              }, req);

              res.json({
                success: true,
                ruleProposal: {
                  id: proposalId,
                  title,
                  description,
                  ruleField,
                  proposedValue,
                  options: options.length
                }
              });
            }).catch(err => {
              console.error('Error creating proposal options:', err);
              res.status(500).json({ error: 'Failed to create proposal options' });
            });
          } else {
            // Log audit event
            logAudit(db, organizationId, 'rule_proposal_created', userId, null, {
              proposalId,
              ruleField,
              hasOptions: false
            }, req);

            res.json({
              success: true,
              ruleProposal: {
                id: proposalId,
                title,
                description,
                ruleField,
                proposedValue
              }
            });
          }
        });
      });

  } catch (error) {
    console.error('Error creating rule proposal:', error);
    res.status(500).json({ error: 'Failed to create rule proposal' });
  }
});

// Start rule proposal voting
router.post('/:organizationId/rule-proposals/:proposalId/start-voting', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, proposalId } = req.params;
  const userId = req.user.id;

  try {
    // Check if user is representative
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) {
      return res.status(403).json({ error: 'Only representatives can start rule proposal voting' });
    }

    const now = new Date();
    const votingEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days

    // Get total voters (active members)
    db.get('SELECT COUNT(*) as total FROM organization_members WHERE organization_id = ? AND status = "active"',
      [organizationId], (err, result) => {
        if (err) {
          console.error('Error counting members:', err);
          return res.status(500).json({ error: 'Failed to count members' });
        }

        const totalVoters = result.total;

        db.run(`
          UPDATE governance_rule_proposals SET
            status = 'active',
            voting_starts_at = ?,
            voting_ends_at = ?,
            total_voters = ?,
            updated_at = ?
          WHERE id = ? AND organization_id = ? AND status = 'draft'
        `, [
          now.toISOString(), votingEnd.toISOString(), totalVoters,
          now.toISOString(), proposalId, organizationId
        ], function(err) {
          if (err) {
            console.error('Error starting rule proposal voting:', err);
            return res.status(500).json({ error: 'Failed to start voting' });
          }

          if (this.changes === 0) {
            return res.status(400).json({ error: 'Proposal not found or not in draft status' });
          }

          // Log audit event
          logAudit(db, organizationId, 'rule_proposal_voting_started', userId, null, {
            proposalId,
            totalVoters
          }, req);

          res.json({
            success: true,
            message: 'Rule proposal voting started',
            votingEndsAt: votingEnd.toISOString()
          });
        });
      });

  } catch (error) {
    console.error('Error starting rule proposal voting:', error);
    res.status(500).json({ error: 'Failed to start voting' });
  }
});

// Vote on rule proposal
router.post('/:organizationId/rule-proposals/:proposalId/vote', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, proposalId } = req.params;
  const userId = req.user.id;
  const { selectedOptionId, voteChoice } = req.body;

  try {
    // Check if user is active member
    const isMember = await isActiveMember(db, userId, organizationId);
    if (!isMember) {
      return res.status(403).json({ error: 'Only active members can vote on rule proposals' });
    }

    // Check if proposal exists and is active
    db.get(`
      SELECT * FROM governance_rule_proposals
      WHERE id = ? AND organization_id = ? AND status = 'active'
    `, [proposalId, organizationId], (err, proposal) => {
      if (err || !proposal) {
        return res.status(404).json({ error: 'Rule proposal not found or not active' });
      }

      // Check if user already voted
      db.get(`
        SELECT * FROM governance_rule_proposal_votes
        WHERE proposal_id = ? AND user_id = ?
      `, [proposalId, userId], (err, existingVote) => {
        if (err) {
          console.error('Error checking existing vote:', err);
          return res.status(500).json({ error: 'Failed to check vote status' });
        }

        if (existingVote) {
          return res.status(400).json({ error: 'You have already voted on this rule proposal' });
        }

        // Record the vote
        const voteId = uuidv4();
        db.run(`
          INSERT INTO governance_rule_proposal_votes (
            id, proposal_id, user_id, selected_option_id, vote_choice, voted_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          voteId, proposalId, userId, selectedOptionId || null, voteChoice || null, new Date().toISOString()
        ], function(err) {
          if (err) {
            console.error('Error recording vote:', err);
            return res.status(500).json({ error: 'Failed to record vote' });
          }

          // Update vote counts
          updateRuleProposalVoteCounts(db, proposalId);

          // Log audit event
          logAudit(db, organizationId, 'rule_proposal_vote_cast', userId, null, {
            proposalId,
            selectedOptionId,
            voteChoice
          }, req);

          res.json({ success: true, message: 'Vote recorded successfully' });
        });
      });
    });

  } catch (error) {
    console.error('Error voting on rule proposal:', error);
    res.status(500).json({ error: 'Failed to cast vote' });
  }
});

// Complete rule proposal voting
router.post('/:organizationId/rule-proposals/:proposalId/complete', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, proposalId } = req.params;
  const userId = req.user.id;

  try {
    // Check if user is representative
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) {
      return res.status(403).json({ error: 'Only representatives can complete rule proposal voting' });
    }

    // Get proposal and results
    db.get(`
      SELECT * FROM governance_rule_proposals
      WHERE id = ? AND organization_id = ? AND status = 'active'
    `, [proposalId, organizationId], (err, proposal) => {
      if (err || !proposal) {
        return res.status(404).json({ error: 'Rule proposal not found or not active' });
      }

      const totalVotes = proposal.votes_yes + proposal.votes_no + proposal.votes_abstain;
      const approvalRate = totalVotes > 0 ? (proposal.votes_yes / totalVotes) * 100 : 0;
      const threshold = proposal.threshold_percentage || 75.0;

      const approved = approvalRate >= threshold;
      const now = new Date();

      if (approved) {
        // Update governance rules
        const updates = {};
        try {
          updates[proposal.current_rule_field] = JSON.parse(proposal.proposed_rule_value);
        } catch (parseErr) {
          console.error('Error parsing proposed_rule_value:', parseErr);
          return res.status(500).json({ error: 'Invalid rule value format' });
        }

        const updateFields = Object.keys(updates);
        const updateValues = Object.values(updates);
        const setClause = updateFields.map(field => `${field} = ?`).join(', ');

        db.run(`UPDATE organization_governance_rules SET ${setClause}, updated_at = ? WHERE organization_id = ?`,
          [...updateValues, now.toISOString(), organizationId], (err) => {
            if (err) {
              console.error('Error updating governance rules:', err);
              return res.status(500).json({ error: 'Failed to update governance rules' });
            }

            // Mark proposal as approved and implemented
            db.run(`
              UPDATE governance_rule_proposals SET
                status = 'approved',
                approved_at = ?,
                implemented_at = ?,
                updated_at = ?
              WHERE id = ?
            `, [now.toISOString(), now.toISOString(), now.toISOString(), proposalId]);

            // Log audit event
            logAudit(db, organizationId, 'rule_proposal_approved', userId, null, {
              proposalId,
              ruleField: proposal.current_rule_field,
              oldValue: proposal.current_rule_value,
              newValue: proposal.proposed_rule_value,
              approvalRate
            }, req);

            let newRuleValue;
            try {
              newRuleValue = JSON.parse(proposal.proposed_rule_value);
            } catch (e) {
              console.error('Error parsing proposed_rule_value for response:', e);
              newRuleValue = proposal.proposed_rule_value; // Return raw value if parse fails
            }
            res.json({
              success: true,
              message: 'Rule proposal approved and implemented',
              approved: true,
              approvalRate,
              newRuleValue
            });
          });
      } else {
        // Mark as rejected
        db.run(`
          UPDATE governance_rule_proposals SET
            status = 'rejected',
            updated_at = ?
          WHERE id = ?
        `, [now.toISOString(), proposalId]);

        // Log audit event
        logAudit(db, organizationId, 'rule_proposal_rejected', userId, null, {
          proposalId,
          approvalRate,
          threshold
        }, req);

        res.json({
          success: true,
          message: 'Rule proposal rejected due to insufficient approval',
          approved: false,
          approvalRate,
          threshold
        });
      }
    });

  } catch (error) {
    console.error('Error completing rule proposal:', error);
    res.status(500).json({ error: 'Failed to complete rule proposal' });
  }
});

// Helper function to update rule proposal vote counts
function updateRuleProposalVoteCounts(db, proposalId) {
  // Update main proposal votes
  db.run(`
    UPDATE governance_rule_proposals SET
      votes_yes = (SELECT COUNT(*) FROM governance_rule_proposal_votes WHERE proposal_id = ? AND vote_choice = 'yes'),
      votes_no = (SELECT COUNT(*) FROM governance_rule_proposal_votes WHERE proposal_id = ? AND vote_choice = 'no'),
      votes_abstain = (SELECT COUNT(*) FROM governance_rule_proposal_votes WHERE proposal_id = ? AND vote_choice = 'abstain'),
      votes_cast = (SELECT COUNT(*) FROM governance_rule_proposal_votes WHERE proposal_id = ?),
      updated_at = ?
    WHERE id = ?
  `, [proposalId, proposalId, proposalId, proposalId, new Date().toISOString(), proposalId]);

  // Update option votes if applicable
  db.run(`
    UPDATE governance_rule_proposal_options SET
      votes_received = (
        SELECT COUNT(*) FROM governance_rule_proposal_votes
        WHERE proposal_id = ? AND selected_option_id = governance_rule_proposal_options.id
      )
    WHERE proposal_id = ?
  `, [proposalId, proposalId]);
}

// Helper function to update policy vote counts
function updatePolicyVoteCounts(db, voteId) {
  db.run(`
    UPDATE policy_votes SET
      votes_yes = (SELECT COUNT(*) FROM policy_vote_responses WHERE policy_vote_id = ? AND vote = 'yes'),
      votes_no = (SELECT COUNT(*) FROM policy_vote_responses WHERE policy_vote_id = ? AND vote = 'no'),
      votes_abstain = (SELECT COUNT(*) FROM policy_vote_responses WHERE policy_vote_id = ? AND vote = 'abstain'),
      updated_at = ?
    WHERE id = ?
  `, [voteId, voteId, voteId, new Date().toISOString(), voteId]);
}

// Update governance rules (representatives only)
router.put('/:organizationId/governance-rules', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;
  const updates = req.body;

  try {
    // Check if user is representative
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) {
      return res.status(403).json({ error: 'Only representatives can update governance rules' });
    }

    // Get existing rules
    const existingRules = await getGovernanceRules(db, organizationId);
    if (!existingRules) {
      return res.status(404).json({ error: 'Governance rules not found' });
    }

    // Build update query
    const updateFields = [];
    const updateValues = [];

    Object.keys(updates).forEach(key => {
      if (['representative_term_months', 'representative_term_limits', 'election_voting_method',
           'election_quorum_percentage', 'election_notice_days', 'default_voting_deadline_hours',
           'default_quorum_percentage', 'anonymous_voting_enabled', 'vote_change_allowed',
           'representative_can_create_votes', 'representative_can_invite_members',
           'representative_can_manage_documents', 'representative_approval_required',
           'tamper_proof_enabled', 'audit_trail_enabled'].includes(key)) {
        updateFields.push(`${key} = ?`);
        updateValues.push(updates[key]);
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updateValues.push(organizationId);

    db.run(
      `UPDATE organization_governance_rules SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE organization_id = ?`,
      updateValues,
      function(err) {
        if (err) {
          console.error('Error updating governance rules:', err);
          return res.status(500).json({ error: 'Failed to update governance rules' });
        }

        // Log audit event
        logAudit(db, organizationId, 'governance_rules_updated', userId, null, updates, req);

        res.json({ success: true, message: 'Governance rules updated successfully' });
      }
    );
  } catch (error) {
    console.error('Error updating governance rules:', error);
    res.status(500).json({ error: 'Failed to update governance rules' });
  }
});

// Create representative election
router.post('/:organizationId/elections', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;
  const { title, description, positionsAvailable, termMonths } = req.body;

  try {
    // Check if user is representative
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) {
      return res.status(403).json({ error: 'Only representatives can create elections' });
    }

    // Get governance rules
    const rules = await getGovernanceRules(db, organizationId);
    if (!rules) {
      return res.status(400).json({ error: 'Organization governance rules not configured' });
    }

    const electionId = uuidv4();
    const now = new Date();
    const termEndDate = new Date(now);
    termEndDate.setMonth(termEndDate.getMonth() + (termMonths || rules.representative_term_months));

    // Get current member count for quorum calculation
    db.get('SELECT COUNT(*) as memberCount FROM organization_members WHERE organization_id = ? AND status = "active"',
      [organizationId], (err, row) => {
        if (err) {
          console.error('Error counting members:', err);
          return res.status(500).json({ error: 'Failed to create election' });
        }

        const memberCount = row.memberCount;
        const quorumRequired = Math.ceil(memberCount * rules.election_quorum_percentage);

        db.run(`INSERT INTO representative_elections (
          id, organization_id, election_title, election_description,
          positions_available, term_end_date, quorum_required,
          anonymous_voting, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
          electionId, organizationId, title, description,
          positionsAvailable, termEndDate.toISOString(), quorumRequired,
          rules.anonymous_voting_enabled ? 1 : 0, userId
        ], function(err) {
          if (err) {
            console.error('Error creating election:', err);
            return res.status(500).json({ error: 'Failed to create election' });
          }

          // Log audit event
          logAudit(db, organizationId, 'election_created', userId, null, {
            electionId, title, positionsAvailable, termMonths
          }, req);

          res.json({
            election: {
              id: electionId,
              title,
              description,
              positionsAvailable,
              termEndDate: termEndDate.toISOString(),
              quorumRequired,
              anonymousVoting: rules.anonymous_voting_enabled,
              status: 'draft'
            }
          });
        });
      });
  } catch (error) {
    console.error('Error creating election:', error);
    res.status(500).json({ error: 'Failed to create election' });
  }
});

// Get elections for organization
router.get('/:organizationId/elections', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;

  try {
    // Check if user has access
    const hasAccess = await isRepresentative(db, userId, organizationId) ||
                     await isActiveMember(db, userId, organizationId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    db.all(
      'SELECT * FROM representative_elections WHERE organization_id = ? ORDER BY created_at DESC',
      [organizationId],
      (err, rows) => {
        if (err) {
          console.error('Error fetching elections:', err);
          return res.status(500).json({ error: 'Failed to fetch elections' });
        }

        const elections = rows.map(row => ({
          id: row.id,
          title: row.election_title,
          description: row.election_description,
          status: row.status,
          positionsAvailable: row.positions_available,
          termStartDate: row.term_start_date,
          termEndDate: row.term_end_date,
          votingStartsAt: row.voting_starts_at,
          votingEndsAt: row.voting_ends_at,
          quorumRequired: row.quorum_required,
          totalVoters: row.total_voters,
          votesCast: row.votes_cast,
          quorumMet: row.quorum_met === 1,
          anonymousVoting: row.anonymous_voting === 1,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }));

        res.json({ elections });
      }
    );
  } catch (error) {
    console.error('Error fetching elections:', error);
    res.status(500).json({ error: 'Failed to fetch elections' });
  }
});

// Nominate candidate for election
router.post('/:organizationId/elections/:electionId/candidates', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, electionId } = req.params;
  const userId = req.user.id;
  const { candidateUserId, nominationStatement } = req.body;

  try {
    // Check if user is active member
    const isMember = await isActiveMember(db, userId, organizationId);
    if (!isMember) {
      return res.status(403).json({ error: 'Only active members can nominate candidates' });
    }

    // Check if candidate is active member
    const isCandidateMember = await isActiveMember(db, candidateUserId, organizationId);
    if (!isCandidateMember) {
      return res.status(400).json({ error: 'Candidate must be an active member' });
    }

    // Check if election exists and is in draft status
    db.get('SELECT status FROM representative_elections WHERE id = ? AND organization_id = ?',
      [electionId, organizationId], (err, election) => {
        if (err || !election) {
          return res.status(404).json({ error: 'Election not found' });
        }

        if (election.status !== 'draft') {
          return res.status(400).json({ error: 'Cannot nominate candidates for elections that are not in draft status' });
        }

        const candidateId = uuidv4();
        db.run(`INSERT INTO election_candidates (
          id, election_id, user_id, candidate_statement, nominated_by
        ) VALUES (?, ?, ?, ?, ?)`, [
          candidateId, electionId, candidateUserId, nominationStatement, userId
        ], function(err) {
          if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
              return res.status(400).json({ error: 'User is already nominated for this election' });
            }
            console.error('Error nominating candidate:', err);
            return res.status(500).json({ error: 'Failed to nominate candidate' });
          }

          res.json({
            candidate: {
              id: candidateId,
              userId: candidateUserId,
              statement: nominationStatement,
              nominatedBy: userId,
              acceptedNomination: false
            }
          });
        });
      });
  } catch (error) {
    console.error('Error nominating candidate:', error);
    res.status(500).json({ error: 'Failed to nominate candidate' });
  }
});

// Accept nomination
router.post('/:organizationId/elections/:electionId/candidates/:candidateId/accept', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, electionId, candidateId } = req.params;
  const userId = req.user.id;

  try {
    // Check if user owns this candidate nomination
    db.get('SELECT user_id FROM election_candidates WHERE id = ? AND election_id = ?',
      [candidateId, electionId], (err, candidate) => {
        if (err || !candidate) {
          return res.status(404).json({ error: 'Candidate not found' });
        }

        if (candidate.user_id !== userId) {
          return res.status(403).json({ error: 'Can only accept your own nomination' });
        }

        db.run(
          'UPDATE election_candidates SET accepted_nomination = 1, nomination_accepted_at = CURRENT_TIMESTAMP WHERE id = ?',
          [candidateId],
          function(err) {
            if (err) {
              console.error('Error accepting nomination:', err);
              return res.status(500).json({ error: 'Failed to accept nomination' });
            }

            res.json({ success: true, message: 'Nomination accepted successfully' });
          }
        );
      });
  } catch (error) {
    console.error('Error accepting nomination:', error);
    res.status(500).json({ error: 'Failed to accept nomination' });
  }
});

// Start election voting
router.post('/:organizationId/elections/:electionId/start', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, electionId } = req.params;
  const userId = req.user.id;
  const { votingStartDate, votingEndDate } = req.body;

  try {
    // Check if user is representative
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) {
      return res.status(403).json({ error: 'Only representatives can start elections' });
    }

    // Check election status
    db.get('SELECT status FROM representative_elections WHERE id = ? AND organization_id = ?',
      [electionId, organizationId], (err, election) => {
        if (err || !election) {
          return res.status(404).json({ error: 'Election not found' });
        }

        if (election.status !== 'draft') {
          return res.status(400).json({ error: 'Election is not in draft status' });
        }

        const startDate = votingStartDate ? new Date(votingStartDate) : new Date();
        const endDate = new Date(votingEndDate);

        if (endDate <= startDate) {
          return res.status(400).json({ error: 'End date must be after start date' });
        }

        // Get active member count
        db.get('SELECT COUNT(*) as count FROM organization_members WHERE organization_id = ? AND status = "active"',
          [organizationId], (err, row) => {
            if (err) {
              console.error('Error counting members:', err);
              return res.status(500).json({ error: 'Failed to start election' });
            }

            const memberCount = row.count;

            db.run(
              `UPDATE representative_elections SET
               status = 'active',
               voting_starts_at = ?,
               voting_ends_at = ?,
               total_voters = ?,
               updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [startDate.toISOString(), endDate.toISOString(), memberCount, electionId],
              function(err) {
                if (err) {
                  console.error('Error starting election:', err);
                  return res.status(500).json({ error: 'Failed to start election' });
                }

                // Create voter tokens for anonymous voting
                createVoterTokensForElection(db, electionId, organizationId, (tokenErr) => {
                  if (tokenErr) {
                    console.error('Error creating voter tokens:', tokenErr);
                    // Don't fail the election start, just log the error
                  }

                  // Log audit event
                  logAudit(db, organizationId, 'election_started', userId, null, {
                    electionId, startDate: startDate.toISOString(), endDate: endDate.toISOString()
                  }, req);

                  res.json({
                    success: true,
                    message: 'Election started successfully',
                    votingStartsAt: startDate.toISOString(),
                    votingEndsAt: endDate.toISOString()
                  });
                });
              }
            );
          });
      });
  } catch (error) {
    console.error('Error starting election:', error);
    res.status(500).json({ error: 'Failed to start election' });
  }
});

// Helper function to create voter tokens for election
function createVoterTokensForElection(db, electionId, organizationId, callback) {
  // Get all active members
  db.all('SELECT user_id FROM organization_members WHERE organization_id = ? AND status = "active"',
    [organizationId], (err, members) => {
      if (err) {
        return callback(err);
      }

      if (members.length === 0) {
        return callback(null);
      }

      // Create voting session for election
      const sessionId = uuidv4();
      const votingSessionData = {
        id: sessionId,
        organization_id: organizationId,
        session_type: 'election',
        related_entity_id: electionId,
        title: 'Representative Election',
        description: 'Vote for organization representatives',
        status: 'active',
        anonymous_voting: 1,
        created_by: 'system' // Use system for automated creation
      };

      db.run(`INSERT INTO voting_sessions (
        id, organization_id, session_type, related_entity_id, title, description,
        status, anonymous_voting, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        sessionId, organizationId, 'election', electionId, 'Representative Election',
        'Vote for organization representatives', 'active', 1, 'system'
      ], function(err) {
        if (err) {
          return callback(err);
        }

        // Create voter tokens for each member
        let tokensCreated = 0;
        members.forEach(member => {
          const tokenId = uuidv4();
          const anonymousToken = generateAnonymousToken();

          db.run(`INSERT INTO voter_tokens (
            id, voting_session_id, user_id, anonymous_token
          ) VALUES (?, ?, ?, ?)`, [
            tokenId, sessionId, member.user_id, anonymousToken
          ], function(err) {
            if (err) {
              console.error('Error creating voter token:', err);
            }
            tokensCreated++;

            if (tokensCreated === members.length) {
              callback(null);
            }
          });
        });
      });
    });
}

// Cast vote in election
router.post('/:organizationId/elections/:electionId/vote', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, electionId } = req.params;
  const userId = req.user.id;
  const { candidateRanking } = req.body; // Array of candidate IDs in order of preference

  try {
    // Check if user is active member
    const isMember = await isActiveMember(db, userId, organizationId);
    if (!isMember) {
      return res.status(403).json({ error: 'Only active members can vote' });
    }

    // Check if election is active
    db.get('SELECT status, anonymous_voting FROM representative_elections WHERE id = ? AND organization_id = ?',
      [electionId, organizationId], (err, election) => {
        if (err || !election) {
          return res.status(404).json({ error: 'Election not found' });
        }

        if (election.status !== 'active') {
          return res.status(400).json({ error: 'Election is not currently active' });
        }

        if (election.anonymous_voting) {
          // Anonymous voting - find user's token
          db.get('SELECT vt.anonymous_token, vs.id as session_id FROM voter_tokens vt JOIN voting_sessions vs ON vt.voting_session_id = vs.id WHERE vt.user_id = ? AND vs.related_entity_id = ? AND vs.session_type = "election"',
            [userId, electionId], (err, tokenRow) => {
              if (err || !tokenRow) {
                return res.status(400).json({ error: 'Voting token not found' });
              }

              // Check if already voted
              db.get('SELECT id FROM anonymous_vote_ballots WHERE voting_session_id = ? AND voter_token = ?',
                [tokenRow.session_id, tokenRow.anonymous_token], (err, existingVote) => {
                  if (existingVote) {
                    return res.status(400).json({ error: 'You have already voted in this election' });
                  }

                  // For ranked choice, we'd need more complex logic
                  // For now, implement simple majority (first choice gets vote)
                  if (!candidateRanking || candidateRanking.length === 0) {
                    return res.status(400).json({ error: 'No candidates selected' });
                  }

                  const ballotId = uuidv4();
                  const voteData = {
                    sessionId: tokenRow.session_id,
                    token: tokenRow.anonymous_token,
                    candidateId: candidateRanking[0], // First choice
                    timestamp: new Date().toISOString()
                  };

                  const voteHash = hashVote(voteData);

                  db.run(`INSERT INTO anonymous_vote_ballots (
                    id, voting_session_id, voter_token, vote_choice, vote_hash
                  ) VALUES (?, ?, ?, ?, ?)`, [
                    ballotId, tokenRow.session_id, tokenRow.anonymous_token,
                    candidateRanking[0], voteHash
                  ], function(err) {
                    if (err) {
                      console.error('Error casting vote:', err);
                      return res.status(500).json({ error: 'Failed to cast vote' });
                    }

                    // Update election vote count
                    db.run('UPDATE representative_elections SET votes_cast = votes_cast + 1 WHERE id = ?',
                      [electionId]);

                    // Update candidate vote count
                    db.run('UPDATE election_candidates SET votes_received = votes_received + 1 WHERE id = ?',
                      [candidateRanking[0]]);

                    res.json({ success: true, message: 'Vote cast successfully' });
                  });
                });
            });
        } else {
          // Non-anonymous voting would go here
          return res.status(400).json({ error: 'Non-anonymous voting not yet implemented' });
        }
      });
  } catch (error) {
    console.error('Error casting vote:', error);
    res.status(500).json({ error: 'Failed to cast vote' });
  }
});

// Update election phase (draft -> nomination -> voting -> completed)
router.post('/:organizationId/elections/:electionId/update-phase', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, electionId } = req.params;
  const userId = req.user.id;
  const { newPhase } = req.body; // 'nomination', 'voting', 'completed'

  try {
    // Check if user is representative
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) {
      return res.status(403).json({ error: 'Only representatives can update election phases' });
    }

    // Get current election
    db.get('SELECT * FROM representative_elections WHERE id = ? AND organization_id = ?',
      [electionId, organizationId], (err, election) => {
        if (err || !election) {
          return res.status(404).json({ error: 'Election not found' });
        }

        const now = new Date();
        let updates = { updated_at: now.toISOString() };

        // Phase transition logic
        switch (newPhase) {
          case 'nomination':
            if (election.status !== 'draft') {
              return res.status(400).json({ error: 'Can only start nomination from draft status' });
            }
            updates.status = 'nomination';
            updates.nomination_starts_at = now.toISOString();
            updates.nomination_ends_at = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
            break;

          case 'voting':
            if (election.status !== 'nomination') {
              return res.status(400).json({ error: 'Can only start voting from nomination status' });
            }
            updates.status = 'voting';
            updates.voting_starts_at = now.toISOString();
            updates.voting_ends_at = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
            break;

          case 'completed':
            return res.status(400).json({ error: 'Use the /complete endpoint to finish elections' });

          default:
            return res.status(400).json({ error: 'Invalid phase transition' });
        }

        // Update election
        const updateFields = Object.keys(updates);
        const updateValues = Object.values(updates);
        const placeholders = updateFields.map(() => '?').join(', ');
        const setClause = updateFields.map(field => `${field} = ?`).join(', ');

        db.run(`UPDATE representative_elections SET ${setClause} WHERE id = ?`,
          [...updateValues, electionId], function(err) {
            if (err) {
              console.error('Error updating election phase:', err);
              return res.status(500).json({ error: 'Failed to update election phase' });
            }

            // Log audit event
            logAudit(db, organizationId, 'election_phase_updated', userId, null, {
              electionId,
              oldPhase: election.status,
              newPhase,
              updates
            }, req);

            res.json({
              success: true,
              message: `Election moved to ${newPhase} phase`,
              election: { ...election, ...updates }
            });
          });
      });

  } catch (error) {
    console.error('Error updating election phase:', error);
    res.status(500).json({ error: 'Failed to update election phase' });
  }
});

// Auto-schedule elections based on term expiration
router.post('/:organizationId/elections/auto-schedule', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;

  try {
    // Check if user is representative
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) {
      return res.status(403).json({ error: 'Only representatives can auto-schedule elections' });
    }

    // Get current representatives and their term end dates
    db.all(`
      SELECT rt.*, u.name as user_name
      FROM representative_terms rt
      LEFT JOIN users u ON rt.user_id = u.id
      WHERE rt.organization_id = ? AND rt.term_status = 'active'
      ORDER BY rt.term_end_date ASC
    `, [organizationId], (err, terms) => {
      if (err) {
        console.error('Error fetching representative terms:', err);
        return res.status(500).json({ error: 'Failed to check term expirations' });
      }

      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const expiringTerms = terms.filter(term =>
        new Date(term.term_end_date) <= thirtyDaysFromNow &&
        new Date(term.term_end_date) > now
      );

      if (expiringTerms.length === 0) {
        return res.json({
          success: true,
          message: 'No representatives have terms expiring soon',
          scheduled: false
        });
      }

      // Create automatic election
      const electionId = uuidv4();
      const electionTitle = `Automatic Election - ${expiringTerms.length} Positions`;
      const electionDescription = `Automatic election triggered by term expiration for: ${expiringTerms.map(t => t.user_name).join(', ')}`;

      // Schedule election to start in 14 days, nominations in 7 days
      const nominationStart = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const votingStart = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      const votingEnd = new Date(votingStart.getTime() + 7 * 24 * 60 * 60 * 1000);

      db.run(`
        INSERT INTO representative_elections (
          id, organization_id, election_title, election_description,
          positions_available, status, created_by,
          nomination_starts_at, nomination_ends_at,
          voting_starts_at, voting_ends_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        electionId, organizationId, electionTitle, electionDescription,
        expiringTerms.length, 'draft', userId,
        nominationStart.toISOString(), votingStart.toISOString(),
        votingStart.toISOString(), votingEnd.toISOString(),
        now.toISOString(), now.toISOString()
      ], function(err) {
        if (err) {
          console.error('Error creating auto-scheduled election:', err);
          return res.status(500).json({ error: 'Failed to schedule election' });
        }

        // Log audit event
        logAudit(db, organizationId, 'election_auto_scheduled', userId, null, {
          electionId,
          reason: 'term_expiration',
          expiringTerms: expiringTerms.map(t => ({ userId: t.user_id, termEnd: t.term_end_date })),
          positions: expiringTerms.length
        }, req);

        res.json({
          success: true,
          message: `Election auto-scheduled for ${expiringTerms.length} expiring positions`,
          election: {
            id: electionId,
            title: electionTitle,
            positions: expiringTerms.length,
            nominationStart: nominationStart.toISOString(),
            votingStart: votingStart.toISOString(),
            votingEnd: votingEnd.toISOString()
          }
        });
      });
    });

  } catch (error) {
    console.error('Error auto-scheduling election:', error);
    res.status(500).json({ error: 'Failed to auto-schedule election' });
  }
});

// Complete election and tabulate results
router.post('/:organizationId/elections/:electionId/complete', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, electionId } = req.params;
  const userId = req.user.id;

  try {
    // Check if user is representative
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) {
      return res.status(403).json({ error: 'Only representatives can complete elections' });
    }

    // Check election status
    db.get('SELECT status, positions_available, votes_cast, quorum_required FROM representative_elections WHERE id = ? AND organization_id = ?',
      [electionId, organizationId], (err, election) => {
        if (err || !election) {
          return res.status(404).json({ error: 'Election not found' });
        }

        if (election.status !== 'active') {
          return res.status(400).json({ error: 'Election is not active' });
        }

        const quorumMet = election.votes_cast >= election.quorum_required;

        if (!quorumMet) {
          // Mark as failed due to lack of quorum
          db.run('UPDATE representative_elections SET status = "cancelled", quorum_met = 0, election_completed_at = CURRENT_TIMESTAMP WHERE id = ?',
            [electionId]);
          return res.json({
            success: false,
            message: 'Election cancelled due to insufficient participation (quorum not met)',
            quorumRequired: election.quorum_required,
            votesCast: election.votes_cast
          });
        }

        // Get candidates sorted by votes
        db.all('SELECT * FROM election_candidates WHERE election_id = ? ORDER BY votes_received DESC',
          [electionId], (err, candidates) => {
            if (err) {
              console.error('Error fetching candidates:', err);
              return res.status(500).json({ error: 'Failed to complete election' });
            }

            // Mark top candidates as elected and collect elected user IDs
            const positionsAvailable = election.positions_available;
            const electedUserIds = [];
            let position = 1;

            candidates.forEach((candidate, index) => {
              const elected = position <= positionsAvailable;
              db.run('UPDATE election_candidates SET elected = ?, elected_position = ? WHERE id = ?',
                [elected ? 1 : 0, elected ? position : null, candidate.id]);

              if (elected) {
                electedUserIds.push(candidate.user_id);
                position++;

                // Create representative term
                const termId = uuidv4();
                const termEndDate = new Date();
                termEndDate.setMonth(termEndDate.getMonth() + 12); // Default 12 months

                db.run(`INSERT INTO representative_terms (
                  id, organization_id, user_id, term_number, elected_in_election_id,
                  term_start_date, term_end_date
                ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`, [
                  termId, organizationId, candidate.user_id, 1, electionId,
                  termEndDate.toISOString()
                ]);
              }
            });

            // Update organization's representatives array
            const representativesJson = JSON.stringify(electedUserIds);
            db.run('UPDATE organizations SET representatives = ? WHERE id = ?',
              [representativesJson, organizationId], (err) => {
              if (err) {
                console.error('Error updating organization representatives:', err);
                return res.status(500).json({ error: 'Failed to update organization representatives' });
              }

              // Update election status after representatives are updated
              db.run('UPDATE representative_elections SET status = "completed", quorum_met = 1, election_completed_at = CURRENT_TIMESTAMP WHERE id = ?',
                [electionId], (err) => {
                if (err) {
                  console.error('Error updating election status:', err);
                  return res.status(500).json({ error: 'Failed to complete election' });
                }

                // Log audit event
                logAudit(db, organizationId, 'election_completed', userId, null, {
                  electionId,
                  positionsFilled: electedUserIds.length,
                  electedUserIds
                }, req);

                res.json({
                  success: true,
                  message: 'Election completed successfully',
                  electedCandidates: candidates.slice(0, positionsAvailable).map(c => ({
                    userId: c.user_id,
                    votesReceived: c.votes_received,
                    position: candidates.indexOf(c) + 1
                  }))
                });
              });
            });
      });
    });
  } catch (error) {
    console.error('Error completing election:', error);
    res.status(500).json({ error: 'Failed to complete election' });
  }
});

// Governance Audit Log System

// Get public audit logs for organization (accessible to all members)
router.get('/:organizationId/public-audit-logs', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;
  const { actionType, startDate, endDate, limit = 20, offset = 0 } = req.query;

  try {
    // Check if user is a member (not just representative)
    const hasAccess = await isRepresentative(db, userId, organizationId) ||
                     await isActiveMember(db, userId, organizationId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Build query with filters - limit sensitive actions for public access
    let query = `
      SELECT
        oal.id,
        oal.action_type,
        oal.created_at,
        u1.name as performed_by_name,
        u2.name as affected_user_name,
        CASE
          WHEN oal.action_type IN ('org_created', 'rep_added', 'rep_removed', 'member_invited', 'member_added', 'member_left') THEN
            oal.details
          ELSE
            NULL
        END as details
      FROM organization_audit oal
      LEFT JOIN users u1 ON oal.performed_by_user_id = u1.id
      LEFT JOIN users u2 ON oal.affected_user_id = u2.id
      WHERE oal.organization_id = ?
        AND oal.action_type IN (
          'org_created', 'rep_added', 'rep_removed', 'member_invited',
          'member_joined', 'member_left', 'member_bulk_added', 'vote_proposed',
          'vote_approved', 'vote_started', 'vote_completed', 'doc_created',
          'dissolution_proposed', 'org_dissolved', 'rule_proposal_created',
          'rule_proposal_approved', 'rule_proposal_rejected', 'election_created',
          'election_started', 'election_completed'
        )
    `;
    const params = [organizationId];

    if (actionType) {
      query += ' AND oal.action_type = ?';
      params.push(actionType);
    }

    if (startDate) {
      query += ' AND oal.created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND oal.created_at <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY oal.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    db.all(query, params, (err, logs) => {
      if (err) {
        console.error('Error fetching public audit logs:', err);
        return res.status(500).json({ error: 'Failed to fetch audit logs' });
      }

      // Get total count for pagination (same filters)
      let countQuery = `
        SELECT COUNT(*) as total FROM organization_audit
        WHERE organization_id = ?
          AND action_type IN (
            'org_created', 'rep_added', 'rep_removed', 'member_invited',
            'member_joined', 'member_left', 'member_bulk_added', 'vote_proposed',
            'vote_approved', 'vote_started', 'vote_completed', 'doc_created',
            'dissolution_proposed', 'org_dissolved', 'rule_proposal_created',
            'rule_proposal_approved', 'rule_proposal_rejected', 'election_created',
            'election_started', 'election_completed'
          )
      `;
      const countParams = [organizationId];

      if (actionType) {
        countQuery += ' AND action_type = ?';
        countParams.push(actionType);
      }

      if (startDate) {
        countQuery += ' AND created_at >= ?';
        countParams.push(startDate);
      }

      if (endDate) {
        countQuery += ' AND created_at <= ?';
        countParams.push(endDate);
      }

      db.get(countQuery, countParams, (err, countResult) => {
        if (err) {
          console.error('Error counting public audit logs:', err);
          return res.status(500).json({ error: 'Failed to count audit logs' });
        }

        res.json({
          auditLogs: logs || [],
          pagination: {
            total: countResult.total,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: parseInt(offset) + parseInt(limit) < countResult.total
          }
        });
      });
    });

  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Get audit log statistics
router.get('/:organizationId/audit-stats', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;
  const { days = 30 } = req.query;

  try {
    // Check if user is representative
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) {
      return res.status(403).json({ error: 'Only representatives can access audit statistics' });
    }

    const startDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000).toISOString();

    // Get activity breakdown by action type
    db.all(`
      SELECT action_type, COUNT(*) as count
      FROM organization_audit
      WHERE organization_id = ? AND created_at >= ?
      GROUP BY action_type
      ORDER BY count DESC
    `, [organizationId, startDate], (err, actionStats) => {
      if (err) {
        console.error('Error fetching action stats:', err);
        return res.status(500).json({ error: 'Failed to fetch audit statistics' });
      }

      // Get activity by user
      db.all(`
        SELECT u.name as user_name, COUNT(*) as activity_count
        FROM organization_audit oal
        LEFT JOIN users u ON oal.performed_by_user_id = u.id
        WHERE oal.organization_id = ? AND oal.created_at >= ?
        GROUP BY oal.performed_by_user_id
        ORDER BY activity_count DESC
        LIMIT 10
      `, [organizationId, startDate], (err, userStats) => {
        if (err) {
          console.error('Error fetching user stats:', err);
          return res.status(500).json({ error: 'Failed to fetch user statistics' });
        }

        // Get daily activity
        db.all(`
          SELECT DATE(created_at) as date, COUNT(*) as count
          FROM organization_audit
          WHERE organization_id = ? AND created_at >= ?
          GROUP BY DATE(created_at)
          ORDER BY date DESC
        `, [organizationId, startDate], (err, dailyStats) => {
          if (err) {
            console.error('Error fetching daily stats:', err);
            return res.status(500).json({ error: 'Failed to fetch daily statistics' });
          }

          // Get total counts
          db.get(`
            SELECT
              COUNT(*) as total_logs,
              COUNT(DISTINCT performed_by_user_id) as active_users,
              COUNT(DISTINCT CASE WHEN action_type LIKE '%election%' THEN id END) as election_actions,
              COUNT(DISTINCT CASE WHEN action_type LIKE '%vote%' THEN id END) as voting_actions
            FROM organization_audit
            WHERE organization_id = ? AND created_at >= ?
          `, [organizationId, startDate], (err, totals) => {
            if (err) {
              console.error('Error fetching totals:', err);
              return res.status(500).json({ error: 'Failed to fetch totals' });
            }

            res.json({
              statistics: {
                period: `${days} days`,
                totalLogs: totals.total_logs,
                activeUsers: totals.active_users,
                electionActions: totals.election_actions,
                votingActions: totals.voting_actions
              },
              actionBreakdown: actionStats || [],
              userActivity: userStats || [],
              dailyActivity: dailyStats || []
            });
          });
        });
      });
    });

  } catch (error) {
    console.error('Error fetching audit statistics:', error);
    res.status(500).json({ error: 'Failed to fetch audit statistics' });
  }
});

// Export audit logs (CSV format)
router.get('/:organizationId/audit-export', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;
  const { startDate, endDate, format = 'csv' } = req.query;

  try {
    // Check if user is representative
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) {
      return res.status(403).json({ error: 'Only representatives can export audit logs' });
    }

    let query = `
      SELECT
        oal.created_at,
        oal.action_type,
        u1.name as performed_by,
        u2.name as affected_user,
        oal.details,
        oal.ip_address
      FROM organization_audit oal
      LEFT JOIN users u1 ON oal.performed_by_user_id = u1.id
      LEFT JOIN users u2 ON oal.affected_user_id = u2.id
      WHERE oal.organization_id = ?
    `;
    const params = [organizationId];

    if (startDate) {
      query += ' AND oal.created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND oal.created_at <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY oal.created_at DESC';

    db.all(query, params, (err, logs) => {
      if (err) {
        console.error('Error exporting audit logs:', err);
        return res.status(500).json({ error: 'Failed to export audit logs' });
      }

      if (format === 'csv') {
        // Generate CSV
        const csvHeader = 'Timestamp,Action Type,Performed By,Affected User,Details,IP Address\n';
        const csvRows = logs.map(log => [
          log.created_at,
          log.action_type,
          log.performed_by || '',
          log.affected_user || '',
          JSON.stringify(log.details || {}).replace(/"/g, '""'), // Escape quotes for CSV
          log.ip_address || ''
        ].map(field => `"${field}"`).join(',')).join('\n');

        const csv = csvHeader + csvRows;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="governance-audit-${organizationId}-${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csv);
      } else {
        // JSON format
        res.json({ auditLogs: logs });
      }
    });

  } catch (error) {
    console.error('Error exporting audit logs:', error);
    res.status(500).json({ error: 'Failed to export audit logs' });
  }
});

// Get voting analytics
router.get('/:organizationId/analytics', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;
  const { period } = req.query; // 'month', 'quarter', 'year'

  try {
    // Check if user has access
    const hasAccess = await isRepresentative(db, userId, organizationId) ||
                     await isActiveMember(db, userId, organizationId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Calculate date range
    const now = new Date();
    let periodStart, periodEnd;

    switch (period) {
      case 'month':
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'quarter':
        const quarterStart = Math.floor(now.getMonth() / 3) * 3;
        periodStart = new Date(now.getFullYear(), quarterStart, 1);
        periodEnd = new Date(now.getFullYear(), quarterStart + 3, 0);
        break;
      case 'year':
        periodStart = new Date(now.getFullYear(), 0, 1);
        periodEnd = new Date(now.getFullYear(), 11, 31);
        break;
      default:
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    // Get or create analytics record
    const periodKey = `${periodStart.toISOString().split('T')[0]}_${periodEnd.toISOString().split('T')[0]}`;

    db.get('SELECT * FROM voting_analytics WHERE organization_id = ? AND period_start = ? AND period_end = ?',
      [organizationId, periodStart.toISOString().split('T')[0], periodEnd.toISOString().split('T')[0]],
      (err, existing) => {
        if (err) {
          console.error('Error fetching analytics:', err);
          return res.status(500).json({ error: 'Failed to fetch analytics' });
        }

        if (existing) {
          return res.json({ analytics: existing });
        }

        // Calculate analytics
        calculateVotingAnalytics(db, organizationId, periodStart, periodEnd, (analytics) => {
          if (!analytics) {
            return res.status(500).json({ error: 'Failed to calculate analytics' });
          }

          const analyticsId = uuidv4();
          db.run(`INSERT INTO voting_analytics (
            id, organization_id, period_start, period_end, total_members,
            active_voters, total_votes_cast, average_votes_per_member,
            elections_held, average_election_turnout, quorum_achieved_percentage,
            total_decisions_made, decisions_passed, decisions_failed,
            average_decision_time_hours
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            analyticsId, organizationId, periodStart.toISOString().split('T')[0],
            periodEnd.toISOString().split('T')[0], analytics.totalMembers,
            analytics.activeVoters, analytics.totalVotesCast, analytics.averageVotesPerMember,
            analytics.electionsHeld, analytics.averageElectionTurnout, analytics.quorumAchievedPercentage,
            analytics.totalDecisionsMade, analytics.decisionsPassed, analytics.decisionsFailed,
            analytics.averageDecisionTimeHours
          ], function(err) {
            if (err) {
              console.error('Error saving analytics:', err);
              return res.status(500).json({ error: 'Failed to save analytics' });
            }

            res.json({ analytics: { id: analyticsId, ...analytics } });
          });
        });
      });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Helper function to calculate voting analytics
function calculateVotingAnalytics(db, organizationId, startDate, endDate, callback) {
  // Get member count
  db.get('SELECT COUNT(*) as count FROM organization_members WHERE organization_id = ? AND status = "active"',
    [organizationId], (err, memberRow) => {
      if (err) return callback(null);

      const totalMembers = memberRow.count;

      // Get elections in period
      db.all('SELECT * FROM representative_elections WHERE organization_id = ? AND created_at >= ? AND created_at <= ?',
        [organizationId, startDate.toISOString(), endDate.toISOString()], (err, elections) => {
          if (err) return callback(null);

          const electionsHeld = elections.length;
          let totalTurnout = 0;
          let quorumAchievedCount = 0;

          elections.forEach(election => {
            if (election.total_voters > 0) {
              totalTurnout += (election.votes_cast / election.total_voters);
            }
            if (election.quorum_met) {
              quorumAchievedCount++;
            }
          });

          const averageElectionTurnout = electionsHeld > 0 ? (totalTurnout / electionsHeld) * 100 : 0;
          const quorumAchievedPercentage = electionsHeld > 0 ? (quorumAchievedCount / electionsHeld) * 100 : 0;

          // Get voting sessions in period
          db.all('SELECT * FROM voting_sessions WHERE organization_id = ? AND created_at >= ? AND created_at <= ?',
            [organizationId, startDate.toISOString(), endDate.toISOString()], (err, sessions) => {
              if (err) return callback(null);

              const totalDecisionsMade = sessions.length;
              let decisionsPassed = 0;
              let decisionsFailed = 0;
              let totalVotesCast = 0;

              sessions.forEach(session => {
                totalVotesCast += session.votes_cast_count || 0;
                if (session.result === 'approved') decisionsPassed++;
                else if (session.result === 'rejected' || session.result === 'failed') decisionsFailed++;
              });

              const activeVoters = totalVotesCast > 0 ? Math.min(totalMembers, Math.ceil(totalVotesCast / totalDecisionsMade)) : 0;
              const averageVotesPerMember = totalMembers > 0 ? totalVotesCast / totalMembers : 0;

              callback({
                totalMembers,
                activeVoters,
                totalVotesCast,
                averageVotesPerMember,
                electionsHeld,
                averageElectionTurnout,
                quorumAchievedPercentage,
                totalDecisionsMade,
                decisionsPassed,
                decisionsFailed,
                averageDecisionTimeHours: 0 // TODO: Calculate from session durations
              });
            });
        });
    });
}

module.exports = router;

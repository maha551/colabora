const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { metricsCollector } = require('../middleware/monitoring');

const router = express.Router();

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// Middleware to check if user is admin (for organization creation)
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const db = req.app.locals.db;
  db.get('SELECT role FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      console.error('Error checking user role:', err);
      return res.status(500).json({ error: 'Failed to verify permissions' });
    }

    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        error: 'Admin privileges required to create organizations'
      });
    }

    next();
  });
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


// Create organization (admin only)
router.post('/', requireAdmin, (req, res) => {
  const db = req.app.locals.db;
  const { name, description, representatives, membershipPolicy, votingEnabled, votingThreshold } = req.body;
  const adminId = req.user.id;

  if (!name || !representatives || representatives.length < 3) {
    return res.status(400).json({
      error: 'Organization name and at least 3 representatives required'
    });
  }

  const orgId = uuidv4();
  const repsJson = JSON.stringify(representatives);

  db.run(`INSERT INTO organizations (
    id, name, description, representatives, membership_policy, voting_enabled, voting_threshold, created_by_admin_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
    orgId, name, description || '', repsJson,
    membershipPolicy || 'invitation', votingEnabled ? 1 : 0, votingThreshold || 0.5, adminId
  ], function(err) {
    if (err) {
      console.error('Error creating organization:', err);
      return res.status(500).json({ error: 'Failed to create organization' });
    }

    // Log audit event
    logAudit(db, orgId, 'org_created', adminId, null, { name, representatives }, req);

    res.status(201).json({
      organization: {
        id: orgId,
        name,
        description,
        representatives,
        membershipPolicy: membershipPolicy || 'invitation',
        votingEnabled: votingEnabled || false,
        votingThreshold: votingThreshold || 0.5,
        isActive: true,
        createdAt: new Date().toISOString()
      }
    });
  });
});

// Get all organizations for current user
router.get('/', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;

  // Get organizations where user is a member or representative
  const query = `
    SELECT DISTINCT o.*,
           om.status as membership_status,
           om.joined_at
    FROM organizations o
    LEFT JOIN organization_members om ON o.id = om.organization_id AND om.user_id = ?
    WHERE om.user_id = ? OR json_extract(o.representatives, '$') LIKE ?
    ORDER BY o.created_at DESC
  `;

  db.all(query, [userId, userId, `%${userId}%`], (err, rows) => {
    if (err) {
      console.error('Error fetching organizations:', err);
      return res.status(500).json({ error: 'Failed to fetch organizations' });
    }

    const organizations = rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      representatives: JSON.parse(row.representatives || '[]'),
      membershipPolicy: row.membership_policy,
      votingEnabled: row.voting_enabled === 1,
      votingThreshold: row.voting_threshold,
      isActive: row.is_active === 1,
      membershipStatus: row.membership_status,
      joinedAt: row.joined_at,
      createdAt: row.created_at
    }));

    res.json({ organizations });
  });
});

// Get specific organization details
router.get('/:organizationId', requireAuth, async (req, res) => {
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

    // Get organization details
    db.get('SELECT * FROM organizations WHERE id = ?', [organizationId], (err, org) => {
      if (err) {
        console.error('Error fetching organization:', err);
        return res.status(500).json({ error: 'Failed to fetch organization' });
      }

      if (!org) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      // Get members
      db.all(`
        SELECT om.*, u.name, u.email, u.avatar
        FROM organization_members om
        JOIN users u ON om.user_id = u.id
        WHERE om.organization_id = ?
        ORDER BY om.joined_at DESC
      `, [organizationId], (err, members) => {
        if (err) {
          console.error('Error fetching members:', err);
          return res.status(500).json({ error: 'Failed to fetch members' });
        }

        res.json({
          organization: {
            id: org.id,
            name: org.name,
            description: org.description,
            representatives: JSON.parse(org.representatives || '[]'),
            membershipPolicy: org.membership_policy,
            votingThreshold: org.voting_threshold,
            isActive: org.is_active === 1,
            createdAt: org.created_at,
            members: members.map(m => ({
              id: m.id,
              userId: m.user_id,
              status: m.status,
              joinedAt: m.joined_at,
              leftAt: m.left_at,
              user: {
                id: m.user_id,
                name: m.name,
                email: m.email,
                avatar: m.avatar
              }
            }))
          }
        });
      });
    });
  } catch (error) {
    console.error('Error in organization details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update organization (representatives only)
router.put('/:organizationId', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;
  const { name, description, membershipPolicy, votingThreshold } = req.body;

  try {
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) {
      return res.status(403).json({ error: 'Only representatives can update organization' });
    }

    db.run(`UPDATE organizations SET
      name = ?, description = ?, membership_policy = ?, voting_threshold = ?
      WHERE id = ?`, [
      name, description, membershipPolicy, votingThreshold, organizationId
    ], function(err) {
      if (err) {
        console.error('Error updating organization:', err);
        return res.status(500).json({ error: 'Failed to update organization' });
      }

      logAudit(db, organizationId, 'org_updated', userId, null, { name, membershipPolicy, votingThreshold }, req);
      res.json({ success: true });
    });
  } catch (error) {
    console.error('Error updating organization:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Nominate new representative (representatives only)
router.post('/:organizationId/representatives', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;
  const { newRepresentativeId } = req.body;

  try {
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) {
      return res.status(403).json({ error: 'Only representatives can nominate new representatives' });
    }

    // Get current representatives
    db.get('SELECT representatives FROM organizations WHERE id = ?', [organizationId], (err, row) => {
      if (err) {
        console.error('Error fetching organization:', err);
        return res.status(500).json({ error: 'Failed to fetch organization' });
      }

      const currentReps = JSON.parse(row.representatives || '[]');
      if (currentReps.includes(newRepresentativeId)) {
        return res.status(400).json({ error: 'User is already a representative' });
      }

      // Add new representative
      currentReps.push(newRepresentativeId);
      const updatedReps = JSON.stringify(currentReps);

      db.run('UPDATE organizations SET representatives = ? WHERE id = ?', [updatedReps, organizationId], function(err) {
        if (err) {
          console.error('Error updating representatives:', err);
          return res.status(500).json({ error: 'Failed to add representative' });
        }

        logAudit(db, organizationId, 'rep_added', userId, newRepresentativeId, {}, req);
        res.json({ representatives: currentReps });
      });
    });
  } catch (error) {
    console.error('Error nominating representative:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove representative (requires 3/3 approval)
router.delete('/:organizationId/representatives/:repId', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, repId } = req.params;
  const userId = req.user.id;

  try {
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) {
      return res.status(403).json({ error: 'Only representatives can remove representatives' });
    }

    // Get current representatives
    db.get('SELECT representatives FROM organizations WHERE id = ?', [organizationId], (err, row) => {
      if (err) {
        console.error('Error fetching organization:', err);
        return res.status(500).json({ error: 'Failed to fetch organization' });
      }

      const currentReps = JSON.parse(row.representatives || '[]');
      if (!currentReps.includes(repId)) {
        return res.status(400).json({ error: 'User is not a representative' });
      }

      // Check minimum representatives
      if (currentReps.length <= 3) {
        return res.status(400).json({ error: 'Cannot remove representative: minimum 3 required' });
      }

      // For now, allow immediate removal (in production, would need approval workflow)
      const updatedReps = currentReps.filter(id => id !== repId);
      const updatedRepsJson = JSON.stringify(updatedReps);

      db.run('UPDATE organizations SET representatives = ? WHERE id = ?', [updatedRepsJson, organizationId], function(err) {
        if (err) {
          console.error('Error removing representative:', err);
          return res.status(500).json({ error: 'Failed to remove representative' });
        }

        logAudit(db, organizationId, 'rep_removed', userId, repId, {}, req);
        res.json({ representatives: updatedReps });
      });
    });
  } catch (error) {
    console.error('Error removing representative:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Invite members (representatives only)
router.post('/:organizationId/members/invite', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;
  const { emails } = req.body; // Array of email addresses

  try {
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) {
      return res.status(403).json({ error: 'Only representatives can invite members' });
    }

    if (!emails || !Array.isArray(emails)) {
      return res.status(400).json({ error: 'Email list required' });
    }

    // For now, just log the invitations (in production, would send actual emails)
    const invitations = emails.map(email => ({
      id: uuidv4(),
      organizationId,
      email,
      invitedBy: userId,
      invitedAt: new Date().toISOString()
    }));

    // Log bulk invitation
    logAudit(db, organizationId, 'member_bulk_invited', userId, null, { emailCount: emails.length, emails }, req);

    res.json({
      success: true,
      invitations: invitations.length,
      message: `Invitations sent to ${invitations.length} email addresses`
    });
  } catch (error) {
    console.error('Error inviting members:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add member to organization
router.post('/:organizationId/members', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;
  const { userId: memberUserId } = req.body;

  try {
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) {
      return res.status(403).json({ error: 'Only representatives can add members' });
    }

    // Check if user exists
    db.get('SELECT id, name, email FROM users WHERE id = ?', [memberUserId], (err, user) => {
      if (err) {
        console.error('Error checking user:', err);
        return res.status(500).json({ error: 'Failed to verify user' });
      }

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if already a member
      db.get('SELECT id FROM organization_members WHERE organization_id = ? AND user_id = ?', [organizationId, memberUserId], (err, existing) => {
        if (err) {
          console.error('Error checking membership:', err);
          return res.status(500).json({ error: 'Failed to check membership' });
        }

        if (existing) {
          return res.status(400).json({ error: 'User is already a member' });
        }

        // Add member
        const membershipId = uuidv4();
        db.run(`INSERT INTO organization_members (
          id, organization_id, user_id, invited_by_rep_id
        ) VALUES (?, ?, ?, ?)`, [membershipId, organizationId, memberUserId, userId], function(err) {
          if (err) {
            console.error('Error adding member:', err);
            return res.status(500).json({ error: 'Failed to add member' });
          }

          logAudit(db, organizationId, 'member_added', userId, memberUserId, {}, req);
          res.json({
            membership: {
              id: membershipId,
              organizationId,
              userId: memberUserId,
              status: 'active',
              invitedBy: userId,
              joinedAt: new Date().toISOString()
            }
          });
        });
      });
    });
  } catch (error) {
    console.error('Error adding member:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove member from organization
router.delete('/:organizationId/members/:memberUserId', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, memberUserId } = req.params;
  const userId = req.user.id;

  try {
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) {
      return res.status(403).json({ error: 'Only representatives can remove members' });
    }

    // Update membership status to legacy (preserve voting history)
    db.run(`UPDATE organization_members SET
      status = 'legacy', left_at = ?
      WHERE organization_id = ? AND user_id = ?`, [
      new Date().toISOString(), organizationId, memberUserId
    ], function(err) {
      if (err) {
        console.error('Error removing member:', err);
        return res.status(500).json({ error: 'Failed to remove member' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Member not found' });
      }

      logAudit(db, organizationId, 'member_left', userId, memberUserId, { initiatedBy: 'representative' }, req);
      res.json({ success: true });
    });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get organization votes
router.get('/:organizationId/votes', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;

  try {
    const hasAccess = await isRepresentative(db, userId, organizationId) ||
                     await isActiveMember(db, userId, organizationId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    db.all(`SELECT * FROM organization_votes
      WHERE organization_id = ?
      ORDER BY created_at DESC`, [organizationId], (err, votes) => {
      if (err) {
        console.error('Error fetching votes:', err);
        return res.status(500).json({ error: 'Failed to fetch votes' });
      }

      res.json({ votes });
    });
  } catch (error) {
    console.error('Error fetching votes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create organization vote
router.post('/:organizationId/votes', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;
  const { title, description, voteType, targetDocumentId, votingStartDate, votingEndDate } = req.body;

  try {
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) {
      return res.status(403).json({ error: 'Only representatives can create votes' });
    }

    // Check if voting is enabled for this organization
    const org = await new Promise((resolve, reject) => {
      db.get('SELECT voting_enabled, voting_threshold FROM organizations WHERE id = ?', [organizationId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!org || !org.voting_enabled) {
      return res.status(403).json({ error: 'Voting is not enabled for this organization' });
    }

    const voteId = uuidv4();
    const threshold = org.voting_threshold || 0.5;

    // Validate voting dates if provided
    let votingStartsAt = null;
    let votingEndsAt = null;

    if (votingStartDate) {
      votingStartsAt = new Date(votingStartDate);
      if (isNaN(votingStartsAt.getTime())) {
        return res.status(400).json({ error: 'Invalid voting start date' });
      }
    }

    if (votingEndDate) {
      votingEndsAt = new Date(votingEndDate);
      if (isNaN(votingEndsAt.getTime())) {
        return res.status(400).json({ error: 'Invalid voting end date' });
      }
      if (votingStartsAt && votingEndsAt <= votingStartsAt) {
        return res.status(400).json({ error: 'Voting end date must be after start date' });
      }
    }

    db.run(`INSERT INTO organization_votes (
      id, organization_id, title, description, vote_type, proposed_by_user_id,
      threshold, status, voting_starts_at, voting_ends_at, target_document_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?)`, [
      voteId, organizationId, title, description, voteType, userId, threshold,
      votingStartsAt ? votingStartsAt.toISOString() : null,
      votingEndsAt ? votingEndsAt.toISOString() : null,
      targetDocumentId
    ], function(err) {
      if (err) {
        console.error('Error creating vote:', err);
        return res.status(500).json({ error: 'Failed to create vote' });
      }

      logAudit(db, organizationId, 'vote_proposed', userId, null, { voteType, title }, req);
      res.json({
        vote: {
          id: voteId,
          organizationId,
          title,
          description,
          voteType,
          proposedBy: userId,
          threshold,
          status: 'proposed',
          votingStartsAt: votingStartsAt ? votingStartsAt.toISOString() : null,
          votingEndsAt: votingEndsAt ? votingEndsAt.toISOString() : null,
          createdAt: new Date().toISOString()
        }
      });
    });
  } catch (error) {
    console.error('Error creating vote:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve vote (representatives only)
router.post('/:organizationId/votes/:voteId/approve', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, voteId } = req.params;
  const userId = req.user.id;

  try {
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) {
      return res.status(403).json({ error: 'Only representatives can approve votes' });
    }

    db.run(`UPDATE organization_votes SET
      approved_by_rep_id = ?, status = 'approved', voting_starts_at = ?
      WHERE id = ? AND organization_id = ? AND status = 'proposed'`, [
      userId, new Date().toISOString(), voteId, organizationId
    ], function(err) {
      if (err) {
        console.error('Error approving vote:', err);
        return res.status(500).json({ error: 'Failed to approve vote' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Vote not found or already approved' });
      }

      logAudit(db, organizationId, 'vote_approved', userId, null, { voteId }, req);
      res.json({ success: true });
    });
  } catch (error) {
    console.error('Error approving vote:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cast vote in organization vote
router.post('/:organizationId/votes/:voteId/vote', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, voteId } = req.params;
  const userId = req.user.id;
  const { choice } = req.body; // 'yes', 'no', 'abstain'

  try {
    const isActive = await isActiveMember(db, userId, organizationId);
    if (!isActive) {
      return res.status(403).json({ error: 'Only active members can vote' });
    }

    // Check if vote exists and is active
    db.get(`SELECT * FROM organization_votes
      WHERE id = ? AND organization_id = ? AND status = 'approved'`, [
      voteId, organizationId
    ], (err, vote) => {
      if (err) {
        console.error('Error fetching vote:', err);
        return res.status(500).json({ error: 'Failed to fetch vote' });
      }

      if (!vote) {
        return res.status(404).json({ error: 'Vote not found or not active' });
      }

      // Check if already voted
      db.get('SELECT id FROM vote_ballots WHERE vote_id = ? AND user_id = ?', [voteId, userId], (err, existing) => {
        if (err) {
          console.error('Error checking existing vote:', err);
          return res.status(500).json({ error: 'Failed to check existing vote' });
        }

        if (existing) {
          return res.status(400).json({ error: 'Already voted' });
        }

        // Cast vote
        const ballotId = uuidv4();
        db.run(`INSERT INTO vote_ballots (
          id, vote_id, user_id, membership_status, vote_choice
        ) VALUES (?, ?, ?, 'active', ?)`, [
          ballotId, voteId, userId, choice
        ], function(err) {
          if (err) {
            console.error('Error casting vote:', err);
            return res.status(500).json({ error: 'Failed to cast vote' });
          }

          // Update vote counts
          const countField = choice === 'yes' ? 'result_yes' :
                           choice === 'no' ? 'result_no' : 'result_abstain';
          db.run(`UPDATE organization_votes SET ${countField} = ${countField} + 1 WHERE id = ?`, [voteId]);

          res.json({ success: true, ballotId });
        });
      });
    });
  } catch (error) {
    console.error('Error casting vote:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get organization document proposals
router.get('/:organizationId/document-proposals', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;

  try {
    const isRep = await isRepresentative(db, userId, organizationId);
    const isMember = await isActiveMember(db, userId, organizationId);
    const hasAccess = isRep || isMember;

    console.log(`Document proposals access check for user ${userId} in org ${organizationId}:`);
    console.log(`- Is representative: ${isRep}`);
    console.log(`- Is active member: ${isMember}`);
    console.log(`- Has access: ${hasAccess}`);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // First get the document proposals
    db.all(`
      SELECT dp.*, u.name as user_name, u.email as user_email
      FROM document_proposals dp
      JOIN users u ON dp.proposed_by_user_id = u.id
      WHERE dp.organization_id = ?
      ORDER BY dp.created_at DESC
    `, [organizationId], (err, proposalRows) => {
      if (err) {
        console.error('Error fetching document proposals:', err);
        return res.status(500).json({ error: 'Failed to fetch document proposals' });
      }

      if (proposalRows.length === 0) {
        return res.json({ documentProposals: [] });
      }

      // Get votes for all proposals
      const proposalIds = proposalRows.map(row => row.id);
      const placeholders = proposalIds.map(() => '?').join(',');
      db.all(`
        SELECT dpv.*, u.name as voter_name, u.email as voter_email
        FROM document_proposal_votes dpv
        JOIN users u ON dpv.user_id = u.id
        WHERE dpv.document_proposal_id IN (${placeholders})
        ORDER BY dpv.created_at ASC
      `, proposalIds, (err, voteRows) => {
        if (err) {
          console.error('Error fetching proposal votes:', err);
          return res.status(500).json({ error: 'Failed to fetch proposal votes' });
        }

        // Group votes by proposal
        const votesByProposal = {};
        voteRows.forEach(vote => {
          if (!votesByProposal[vote.document_proposal_id]) {
            votesByProposal[vote.document_proposal_id] = [];
          }
          votesByProposal[vote.document_proposal_id].push({
            id: vote.id,
            userId: vote.user_id,
            vote: vote.vote,
            createdAt: vote.created_at,
            user: {
              id: vote.user_id,
              name: vote.voter_name,
              email: vote.voter_email
            }
          });
        });

        const documentProposals = proposalRows.map(row => ({
          id: row.id,
          organizationId: row.organization_id,
          title: row.title,
          description: row.description,
          proposedByUserId: row.proposed_by_user_id,
          approved: row.approved === 1,
          applied: row.applied === 1,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          user: {
            id: row.proposed_by_user_id,
            name: row.user_name,
            email: row.user_email
          },
          votes: votesByProposal[row.id] || [],
          documentOptions: row.document_options ? JSON.parse(row.document_options) : null,
          contributors: row.contributors ? JSON.parse(row.contributors) : []
        }));

        res.json({ documentProposals });
      });
    });
  } catch (error) {
    console.error('Error fetching document proposals:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create document proposal
router.post('/:organizationId/document-proposals', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;
  const { title, description, contributors, documentOptions } = req.body;

  try {
    const isActive = await isActiveMember(db, userId, organizationId);
    if (!isActive) {
      return res.status(403).json({ error: 'Only active members can create document proposals' });
    }

    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const proposalId = uuidv4();
    const contributorsJson = contributors && contributors.length > 0 ? JSON.stringify(contributors) : null;
    const optionsJson = documentOptions ? JSON.stringify(documentOptions) : null;

    db.run(`INSERT INTO document_proposals (
      id, organization_id, title, description, proposed_by_user_id,
      contributors, document_options
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
      proposalId, organizationId, title.trim(), description?.trim() || null,
      userId, contributorsJson, optionsJson
    ], function(err) {
      if (err) {
        console.error('Error creating document proposal:', err);
        return res.status(500).json({ error: 'Failed to create document proposal' });
      }

      // Get the created proposal with user info
      db.get(`
        SELECT dp.*, u.name as user_name, u.email as user_email
        FROM document_proposals dp
        JOIN users u ON dp.proposed_by_user_id = u.id
        WHERE dp.id = ?
      `, [proposalId], (err, row) => {
        if (err) {
          console.error('Error fetching created proposal:', err);
          return res.status(500).json({ error: 'Proposal created but failed to retrieve' });
        }

        const proposal = {
          id: row.id,
          organizationId: row.organization_id,
          title: row.title,
          description: row.description,
          proposedByUserId: row.proposed_by_user_id,
          approved: false,
          applied: false,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          user: {
            id: row.proposed_by_user_id,
            name: row.user_name,
            email: row.user_email
          },
          votes: [],
          documentOptions: row.document_options ? JSON.parse(row.document_options) : null,
          contributors: row.contributors ? JSON.parse(row.contributors) : []
        };

        logAudit(db, organizationId, 'document_proposal_created', userId, null, { proposalId, title, description }, req);
        res.status(201).json({ documentProposal: proposal });
      });
    });
  } catch (error) {
    console.error('Error creating document proposal:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Vote on document proposal
router.post('/:organizationId/document-proposals/:proposalId/vote', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, proposalId } = req.params;
  const userId = req.user.id;
  const { vote } = req.body; // 'PRO', 'NEUTRAL', 'CONTRA'

  try {
    const isActive = await isActiveMember(db, userId, organizationId);
    if (!isActive) {
      return res.status(403).json({ error: 'Only active members can vote on document proposals' });
    }

    if (!['PRO', 'NEUTRAL', 'CONTRA'].includes(vote)) {
      return res.status(400).json({ error: 'Invalid vote choice' });
    }

    // Check if proposal exists and is not approved yet
    db.get('SELECT id, approved, applied FROM document_proposals WHERE id = ? AND organization_id = ?',
      [proposalId, organizationId], (err, proposal) => {
      if (err) {
        console.error('Error fetching proposal:', err);
        return res.status(500).json({ error: 'Failed to fetch proposal' });
      }

      if (!proposal) {
        return res.status(404).json({ error: 'Document proposal not found' });
      }

      if (proposal.approved && proposal.applied) {
        return res.status(400).json({ error: 'Cannot vote on proposal that has already been converted to a document' });
      }

      // Check if user already voted
      db.get('SELECT id, vote FROM document_proposal_votes WHERE document_proposal_id = ? AND user_id = ?',
        [proposalId, userId], (err, existingVote) => {
        if (err) {
          console.error('Error checking existing vote:', err);
          return res.status(500).json({ error: 'Failed to check existing vote' });
        }

        if (existingVote) {
          return res.status(400).json({
            error: 'Already voted on this proposal',
            currentVote: existingVote.vote
          });
        }

        // Cast vote using a transaction to ensure atomicity
        db.run('BEGIN TRANSACTION', (err) => {
          if (err) {
            console.error('Error starting vote transaction:', err);
            return res.status(500).json({ error: 'Failed to start voting transaction' });
          }

          const voteId = uuidv4();
          db.run(`INSERT INTO document_proposal_votes (
            id, document_proposal_id, user_id, vote
          ) VALUES (?, ?, ?, ?)`, [
            voteId, proposalId, userId, vote
          ], function(err) {
            if (err) {
              console.error('Error casting vote:', err);
              db.run('ROLLBACK', (rollbackErr) => {
                if (rollbackErr) {
                  console.error('Error rolling back transaction:', rollbackErr);
                }
              });
              return res.status(500).json({ error: 'Failed to cast vote' });
            }

            // Log the vote
            logAudit(db, organizationId, 'document_proposal_voted', userId, null,
              { proposalId, vote, voteId }, null);

            // Check if proposal should be approved based on votes
            checkProposalApproval(db, proposalId, organizationId, (approvalResult) => {
              db.run('COMMIT', (err) => {
                if (err) {
                  console.error('Error committing vote transaction:', err);
                  return res.status(500).json({ error: 'Failed to commit vote' });
                }
                res.json({
                  success: true,
                  voteId,
                  message: 'Vote recorded successfully'
                });
              });
            });
          });
        });
      });
    });
  } catch (error) {
    console.error('Error voting on proposal:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to check if proposal should be approved
function checkProposalApproval(db, proposalId, organizationId, callback) {
  // Get proposal and voting threshold first (without transaction for read)
  const query = `
    SELECT dp.*,
           COUNT(dpv.id) as total_votes,
           COUNT(CASE WHEN dpv.vote = 'PRO' THEN 1 END) as pro_votes,
           COUNT(CASE WHEN dpv.vote = 'CONTRA' THEN 1 END) as contra_votes,
           o.voting_threshold
    FROM document_proposals dp
    JOIN organizations o ON dp.organization_id = o.id
    LEFT JOIN document_proposal_votes dpv ON dp.id = dpv.document_proposal_id
    WHERE dp.id = ? AND dp.organization_id = ?
    GROUP BY dp.id
  `;

  db.get(query, [proposalId, organizationId], (err, row) => {
    if (err) {
      console.error('Error checking proposal approval:', err);
      return callback();
    }

    if (!row || row.approved) {
      return callback();
    }

    const totalVotes = row.total_votes || 0;
    const proVotes = row.pro_votes || 0;
    const threshold = row.voting_threshold || 0.5;

    // Need at least some votes to consider approval
    if (totalVotes === 0) {
      return callback();
    }

    // Calculate approval percentage
    const approvalRate = proVotes / totalVotes;

    if (approvalRate >= threshold) {
      // Use a transaction for the approval process
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          console.error('Error starting transaction:', err);
          return callback();
        }

        // Approve the proposal atomically
        db.run('UPDATE document_proposals SET approved = 1, updated_at = ? WHERE id = ? AND approved = 0',
          [new Date().toISOString(), proposalId], function(err) {
          if (err) {
            console.error('Error approving proposal:', err);
            db.run('ROLLBACK', (rollbackErr) => {
              if (rollbackErr) {
                console.error('Error rolling back transaction:', rollbackErr);
              }
            });
            return callback();
          }

          if (this.changes === 0) {
            // Proposal was already approved by another process
            db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                console.error('Error committing transaction:', commitErr);
              }
            });
            return callback();
          }

          // Log approval
          logAudit(db, organizationId, 'document_proposal_approved', row.proposed_by_user_id, null,
            { proposalId, approvalRate, threshold, totalVotes, proVotes }, null);

          // Convert proposal to actual document
          convertProposalToDocument(db, proposalId, (success) => {
            if (success) {
              console.log(`Document proposal ${proposalId} approved and converted to document`);
              db.run('COMMIT', (err) => {
                if (err) console.error('Error committing transaction:', err);
                callback();
              });
            } else {
              console.error('Failed to convert proposal to document, rolling back approval');
              db.run('UPDATE document_proposals SET approved = 0 WHERE id = ?', [proposalId], () => {
                db.run('ROLLBACK', (err) => {
                  if (err) console.error('Error rolling back transaction:', err);
                  callback();
                });
              });
            }
          });
        });
      });
    } else {
      callback();
    }
  });
}

// Helper function to convert approved proposal to actual document
function convertProposalToDocument(db, proposalId, callback) {
  // Get proposal details with organization governance rules
  const query = `
    SELECT dp.*, o.voting_threshold as org_threshold
    FROM document_proposals dp
    JOIN organizations o ON dp.organization_id = o.id
    WHERE dp.id = ? AND dp.approved = 1
  `;

  db.get(query, [proposalId], (err, result) => {
    if (err) {
      console.error('Error fetching approved proposal:', err);
      return callback(false);
    }

    if (!result) {
      console.error('Approved proposal not found:', proposalId);
      return callback(false);
    }

    const proposal = result;
    if (proposal.applied) {
      console.log('Proposal already applied:', proposalId);
      return callback(true); // Already applied, consider success
    }

    try {
      // For organizational documents, use organization's governance settings
      // For organizational documents, all organization members are automatically collaborators
      // No need to store individual collaborators - they'll be fetched dynamically

      // Use organization's voting threshold as acceptance threshold for the document
      const acceptanceThreshold = proposal.org_threshold || 75;

      // Get document proposal period from governance rules (default 1 year = 365 days)
      db.get('SELECT document_proposal_period_days FROM organization_governance_rules WHERE organization_id = ?',
        [proposal.organization_id], (govErr, govRules) => {
        if (govErr) {
          console.error('Error fetching governance rules for proposal period:', govErr);
        }
        
        const proposalPeriodDays = govRules?.document_proposal_period_days || 365;
        const proposalDeadline = new Date();
        proposalDeadline.setDate(proposalDeadline.getDate() + proposalPeriodDays);
        
        // Create organizational document with standard governance settings
        const documentId = uuidv4();

        // Extract parentId from documentOptions if provided
        let documentOptions = null;
        let parentId = null;
        try {
          documentOptions = proposal.document_options ? JSON.parse(proposal.document_options) : null;
          parentId = documentOptions?.parentId || null;
        } catch (parseErr) {
          console.error('Error parsing document_options for proposal:', proposalId, parseErr);
          // Continue without parentId if parsing fails
        }

        db.run(`INSERT INTO documents (
          id, title, description, owner_id, collaborators, organization_id, parent_id, status, proposal_deadline,
          acceptance_threshold, voting_anonymous, voting_anonymity_locked,
          vote_change_allowed, structure_proposals_enabled, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
          documentId,
          proposal.title,
          proposal.description || '',
          proposal.proposed_by_user_id, // Original proposer becomes owner
          JSON.stringify([]), // Empty array - org members are auto-collaborators
          proposal.organization_id,
          parentId, // parent_id from documentOptions
          'proposal', // Status: starts as 'proposal' when created from approved proposal
          proposalDeadline.toISOString(), // Deadline for proposal period (default 1 year, configurable via governance)
          acceptanceThreshold, // Use organization's voting threshold
          0, // voting_anonymous - organizations typically have transparent voting
          0, // voting_anonymity_locked - allow changes if governance allows
          1, // vote_change_allowed - typically allowed in organizations
          1, // structure_proposals_enabled - organizations usually allow structure changes
          new Date().toISOString()
        ], function(err) {
          if (err) {
            console.error('Error creating organizational document from proposal:', err);
            return callback(false);
          }

          console.log(`Created organizational document ${documentId} from proposal ${proposalId}`);
          console.log(`Document settings: threshold=${acceptanceThreshold}%, all org members are collaborators`);

          // Mark proposal as applied
          db.run('UPDATE document_proposals SET applied = 1, updated_at = ? WHERE id = ?',
            [new Date().toISOString(), proposalId], (err) => {
            if (err) {
              console.error('Error marking proposal as applied:', err);
              // Document was created but proposal marking failed
              // This is a serious inconsistency - log it
              console.error(`CRITICAL: Document ${documentId} created but proposal ${proposalId} not marked as applied`);
              return callback(false);
            }

            console.log(`Proposal ${proposalId} marked as applied`);
            callback(true);
          });
        });
      });
    } catch (error) {
      console.error('Unexpected error converting proposal to document:', error);
      callback(false);
    }
  });
}

module.exports = router;

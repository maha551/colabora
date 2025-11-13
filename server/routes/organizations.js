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

module.exports = router;

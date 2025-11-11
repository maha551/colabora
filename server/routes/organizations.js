const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Get all organizations for a user
router.get('/', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;

  // Get organizations where user is a member or representative
  db.all(`
    SELECT DISTINCT o.*,
           om.status as membership_status,
           CASE WHEN o.representatives LIKE '%' || ? || '%' THEN 1 ELSE 0 END as is_representative
    FROM organizations o
    LEFT JOIN organization_members om ON o.id = om.organization_id AND om.user_id = ?
    WHERE (om.user_id = ? OR o.representatives LIKE '%' || ? || '%')
    AND o.is_active = 1
    ORDER BY o.created_at DESC
  `, [userId, userId, userId, userId], (err, organizations) => {
    if (err) {
      console.error('Error fetching organizations:', err);
      return res.status(500).json({ error: 'Failed to fetch organizations' });
    }

    // Parse representatives JSON
    const parsedOrgs = organizations.map(org => ({
      ...org,
      representatives: JSON.parse(org.representatives || '[]'),
      is_representative: Boolean(org.is_representative)
    }));

    res.json({ organizations: parsedOrgs });
  });
});

// Get organization details
router.get('/:organizationId', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;

  // Check if user is member or representative
  db.get(`
    SELECT o.*,
           om.status as membership_status,
           CASE WHEN o.representatives LIKE '%' || ? || '%' THEN 1 ELSE 0 END as is_representative
    FROM organizations o
    LEFT JOIN organization_members om ON o.id = om.organization_id AND om.user_id = ?
    WHERE o.id = ?
    AND (om.user_id = ? OR o.representatives LIKE '%' || ? || '%')
    AND o.is_active = 1
  `, [userId, userId, organizationId, userId, userId], (err, organization) => {
    if (err) {
      console.error('Error fetching organization:', err);
      return res.status(500).json({ error: 'Failed to fetch organization' });
    }

    if (!organization) {
      return res.status(404).json({ error: 'Organization not found or access denied' });
    }

    // Parse representatives
    organization.representatives = JSON.parse(organization.representatives || '[]');
    organization.is_representative = Boolean(organization.is_representative);

    // Get member count
    db.get(`
      SELECT COUNT(*) as member_count
      FROM organization_members
      WHERE organization_id = ? AND status = 'active'
    `, [organizationId], (err, countResult) => {
      if (err) {
        console.error('Error counting members:', err);
      } else {
        organization.member_count = countResult.member_count;
      }
      res.json({ organization });
    });
  });
});

// Get organization members
router.get('/:organizationId/members', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;

  // Check access
  db.get(`
    SELECT 1 FROM organizations o
    LEFT JOIN organization_members om ON o.id = om.organization_id AND om.user_id = ?
    WHERE o.id = ? AND (om.user_id = ? OR o.representatives LIKE '%' || ? || '%')
  `, [userId, organizationId, userId, userId], (err, accessCheck) => {
    if (err || !accessCheck) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get members with user details
    db.all(`
      SELECT om.*, u.name, u.email, u.avatar,
             CASE WHEN o.representatives LIKE '%' || om.user_id || '%' THEN 1 ELSE 0 END as is_representative
      FROM organization_members om
      JOIN users u ON om.user_id = u.id
      JOIN organizations o ON om.organization_id = o.id
      WHERE om.organization_id = ?
      ORDER BY om.joined_at ASC
    `, [organizationId], (err, members) => {
      if (err) {
        console.error('Error fetching members:', err);
        return res.status(500).json({ error: 'Failed to fetch members' });
      }

      res.json({ members });
    });
  });
});

// Create organization (admin only - for now, check if user is admin)
router.post('/', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;
  const { name, description, representatives, votingThreshold = 0.5 } = req.body;

  // For now, allow any authenticated user to create organizations
  // In production, this should check for admin role

  if (!name || !representatives || representatives.length < 3) {
    return res.status(400).json({
      error: 'Organization name and at least 3 representatives required'
    });
  }

  const organizationId = uuidv4();

  db.run(`
    INSERT INTO organizations (id, name, description, representatives, voting_threshold, created_by_admin_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [organizationId, name, description, JSON.stringify(representatives), votingThreshold, userId], function(err) {
    if (err) {
      console.error('Error creating organization:', err);
      return res.status(500).json({ error: 'Failed to create organization' });
    }

    // Add representatives as members
    const memberInserts = representatives.map(repId => {
      return new Promise((resolve, reject) => {
        const memberId = uuidv4();
        db.run(`
          INSERT INTO organization_members (id, organization_id, user_id, status, invited_by_rep_id)
          VALUES (?, ?, ?, 'active', ?)
        `, [memberId, organizationId, repId, userId], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    Promise.all(memberInserts).then(() => {
      // Audit log
      db.run(`
        INSERT INTO organization_audit (id, organization_id, action_type, performed_by_user_id, details)
        VALUES (?, ?, 'org_created', ?, ?)
      `, [uuidv4(), organizationId, userId, JSON.stringify({ name, representatives })]);

      res.json({
        organization: {
          id: organizationId,
          name,
          description,
          representatives,
          voting_threshold: votingThreshold,
          is_active: true,
          created_by_admin_id: userId
        }
      });
    }).catch(err => {
      console.error('Error adding representatives:', err);
      res.status(500).json({ error: 'Failed to add representatives' });
    });
  });
});

// Update organization (representatives only)
router.put('/:organizationId', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;
  const updates = req.body;

  // Check if user is representative
  db.get(`
    SELECT representatives FROM organizations
    WHERE id = ? AND representatives LIKE '%' || ? || '%'
  `, [organizationId, userId], (err, org) => {
    if (err || !org) {
      return res.status(403).json({ error: 'Only representatives can update organization' });
    }

    const fields = [];
    const values = [];

    if (updates.name) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.membership_policy) {
      fields.push('membership_policy = ?');
      values.push(updates.membership_policy);
    }
    if (updates.voting_threshold) {
      fields.push('voting_threshold = ?');
      values.push(updates.voting_threshold);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }

    values.push(organizationId);

    db.run(`
      UPDATE organizations
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, values, function(err) {
      if (err) {
        console.error('Error updating organization:', err);
        return res.status(500).json({ error: 'Failed to update organization' });
      }

      // Audit log
      db.run(`
        INSERT INTO organization_audit (id, organization_id, action_type, performed_by_user_id, details)
        VALUES (?, ?, 'org_updated', ?, ?)
      `, [uuidv4(), organizationId, userId, JSON.stringify(updates)]);

      res.json({ success: true });
    });
  });
});

module.exports = router;

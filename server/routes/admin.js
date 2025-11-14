const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { securityLogger } = require('../middleware/logger');

const router = express.Router();

// Get admin dashboard stats
router.get('/dashboard', requireAdmin, (req, res) => {
  const db = req.app.locals.db;

  const queries = [
    'SELECT COUNT(*) as total_users FROM users',
    'SELECT COUNT(*) as total_organizations FROM organizations',
    'SELECT COUNT(*) as total_documents FROM documents',
    'SELECT COUNT(*) as active_organizations FROM organizations WHERE is_active = 1'
  ];

  const stats = {};

  function runNextQuery(index) {
    if (index >= queries.length) {
      return res.json({
        success: true,
        stats,
        adminUser: {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email
        }
      });
    }

    db.get(queries[index], (err, row) => {
      if (err) {
        console.error('Error getting admin stats:', err);
        return res.status(500).json({ error: 'Failed to fetch admin statistics' });
      }

      // Extract stat name from query
      const statName = queries[index].match(/COUNT\(\*\) as (\w+)/)[1];
      stats[statName] = row[Object.keys(row)[0]];

      runNextQuery(index + 1);
    });
  }

  runNextQuery(0);
});

// Create organization (admin only)
router.post('/organizations', requireAdmin, [
  body('name').isLength({ min: 2, max: 100 }).trim().escape(),
  body('description').optional().isLength({ max: 500 }).trim().escape(),
  body('membershipPolicy').isIn(['open', 'invitation']),
  body('votingThreshold').isFloat({ min: 0, max: 1 }),
  body('firstRepresentativeId').isUUID()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  const db = req.app.locals.db;
  const { name, description, membershipPolicy, votingThreshold, firstRepresentativeId } = req.body;
  const organizationId = uuidv4();

  // Verify the first representative exists
  db.get('SELECT id, name FROM users WHERE id = ?', [firstRepresentativeId], (err, user) => {
    if (err) {
      console.error('Error checking representative:', err);
      return res.status(500).json({ error: 'Failed to verify representative' });
    }

    if (!user) {
      return res.status(400).json({ error: 'Representative user not found' });
    }

    // Create organization
    db.run(`
      INSERT INTO organizations (id, name, description, representatives, membership_policy, voting_threshold, is_active, created_by_admin_id)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `, [organizationId, name, description, JSON.stringify([firstRepresentativeId]), membershipPolicy, votingThreshold, req.user.id], function(err) {
      if (err) {
        console.error('Error creating organization:', err);
        return res.status(500).json({ error: 'Failed to create organization' });
      }

      // Add representative as organization member
      db.run(`
        INSERT INTO organization_members (id, organization_id, user_id, status)
        VALUES (?, ?, ?, 'active')
      `, [uuidv4(), organizationId, firstRepresentativeId], function(err) {
        if (err) {
          console.error('Error adding representative to organization:', err);
          // Don't fail the whole operation, just log the error
          securityLogger.error('Failed to add representative to new organization', {
            organizationId,
            representativeId: firstRepresentativeId,
            error: err.message
          });
        }

        securityLogger.adminAction(req.user.id, 'organization_created', {
          organizationId,
          organizationName: name,
          representativeId: firstRepresentativeId
        });

        res.status(201).json({
          success: true,
          organization: {
            id: organizationId,
            name,
            description,
            membershipPolicy,
            votingThreshold,
            representatives: [firstRepresentativeId],
            isActive: true,
            createdBy: req.user.id
          }
        });
      });
    });
  });
});

// List all organizations (admin overview)
router.get('/organizations', requireAdmin, (req, res) => {
  const db = req.app.locals.db;

  db.all(`
    SELECT
      o.*,
      u.name as created_by_name,
      (SELECT COUNT(*) FROM organization_members om WHERE om.organization_id = o.id AND om.status = 'active') as member_count,
      (SELECT COUNT(*) FROM documents d WHERE d.organization_id = o.id) as document_count
    FROM organizations o
    LEFT JOIN users u ON o.created_by_admin_id = u.id
    ORDER BY o.created_at DESC
  `, (err, organizations) => {
    if (err) {
      console.error('Error fetching organizations:', err);
      return res.status(500).json({ error: 'Failed to fetch organizations' });
    }

    const processedOrganizations = organizations.map(org => ({
      ...org,
      representatives: JSON.parse(org.representatives || '[]'),
      memberCount: org.member_count,
      documentCount: org.document_count
    }));

    res.json({
      success: true,
      organizations: processedOrganizations
    });
  });
});

// Deactivate/reactivate organization
router.patch('/organizations/:id/status', requireAdmin, [
  body('isActive').isBoolean()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  const db = req.app.locals.db;
  const { id } = req.params;
  const { isActive } = req.body;

  db.run('UPDATE organizations SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id], function(err) {
    if (err) {
      console.error('Error updating organization status:', err);
      return res.status(500).json({ error: 'Failed to update organization status' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    securityLogger.adminAction(req.user.id, 'organization_status_changed', {
      organizationId: id,
      newStatus: isActive
    });

    res.json({
      success: true,
      message: `Organization ${isActive ? 'activated' : 'deactivated'} successfully`
    });
  });
});

// Get all users (for admin to assign as representatives)
router.get('/users', requireAdmin, (req, res) => {
  const db = req.app.locals.db;

  db.all(`
    SELECT id, name, email, role, created_at,
           (SELECT COUNT(*) FROM organization_members om WHERE om.user_id = u.id AND om.status = 'active') as organizations_count
    FROM users u
    ORDER BY created_at DESC
  `, (err, users) => {
    if (err) {
      console.error('Error fetching users:', err);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    res.json({
      success: true,
      users: users.map(user => ({
        ...user,
        organizationsCount: user.organizations_count
      }))
    });
  });
});

// Promote user to admin (only existing admins can do this)
router.post('/promote-admin/:userId', requireAdmin, (req, res) => {
  const db = req.app.locals.db;
  const { userId } = req.params;

  // Verify target user exists
  db.get('SELECT id, name, email, role FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      console.error('Error checking user:', err);
      return res.status(500).json({ error: 'Failed to verify user' });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ error: 'User is already an admin' });
    }

    db.run('UPDATE users SET role = ? WHERE id = ?', ['admin', userId], function(err) {
      if (err) {
        console.error('Error promoting user to admin:', err);
        return res.status(500).json({ error: 'Failed to promote user' });
      }

      securityLogger.adminAction(req.user.id, 'user_promoted_to_admin', {
        promotedUserId: userId,
        promotedUserName: user.name
      });

      res.json({
        success: true,
        message: `User ${user.name} has been promoted to admin`,
        promotedUser: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: 'admin'
        }
      });
    });
  });
});

module.exports = router;

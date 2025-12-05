const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { securityLogger, logger } = require('../middleware/logger');

const router = express.Router();

// Helper function to generate random professional color
function generateDefaultBrandingColor() {
  const colors = [
    '#3B82F6', '#10B981', '#8B5CF6', '#06B6D4',
    '#F59E0B', '#EF4444', '#6366F1', '#14B8A6'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

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
        logger.error('Error getting admin stats', { error: err.message, userId: req.user.id });
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
  body('representatives').isArray({ min: 1 }),
  body('representatives.*').isLength({ min: 1, max: 50 }),
  body('membershipPolicy').isIn(['open', 'invitation']),
  body('votingThreshold').isFloat({ min: 0, max: 1 }),
  body('governanceRules').optional().isObject(),
  body('governanceRules.representativeTermMonths').optional().isInt({ min: 1, max: 120 }),
  body('governanceRules.electionVotingMethod').optional().isIn(['simple_majority', 'ranked_choice', 'approval']),
  body('governanceRules.electionQuorumPercentage').optional().isFloat({ min: 0, max: 1 }),
  body('governanceRules.defaultVotingDeadlineHours').optional().isInt({ min: 1, max: 720 }),
  body('governanceRules.documentProposalPeriodDays').optional().isInt({ min: 1, max: 3650 })
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('Organization creation validation errors', { errors: errors.array(), userId: req.user.id });
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  const db = req.app.locals.db;
  const {
    name,
    description,
    representatives,
    membershipPolicy,
    votingThreshold,
    governanceRules = {}
  } = req.body;
  const organizationId = uuidv4();

  // Verify all representatives exist
  const checkPromises = representatives.map(repId =>
    new Promise((resolve, reject) => {
      db.get('SELECT id, name FROM users WHERE id = ?', [repId], (err, user) => {
        if (err) reject(err);
        else resolve(user);
      });
    })
  );

  Promise.all(checkPromises).then(verifiedUsers => {
    const missingUsers = verifiedUsers.filter(user => !user);
    if (missingUsers.length > 0) {
      return res.status(400).json({ error: 'One or more representative users not found' });
    }

    // Generate default branding color
    const defaultBrandingColor = generateDefaultBrandingColor();

    // Create organization
    db.run(`
      INSERT INTO organizations (id, name, description, representatives, membership_policy, voting_threshold, is_active, created_by_admin_id, branding_color)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `, [organizationId, name, description, JSON.stringify(representatives), membershipPolicy, votingThreshold, req.user.id, defaultBrandingColor], function(err) {
      if (err) {
        logger.error('Error creating organization', { error: err.message, code: err.code, organizationId, name, description, representatives, membershipPolicy, votingThreshold, createdBy: req.user.id });
        return res.status(500).json({ 
          error: 'Failed to create organization',
          details: err.message,
          code: err.code
        });
      }

      // Create governance rules for the organization
      const rulesId = uuidv4();
      const defaultRules = {
        representativeTermMonths: governanceRules.representativeTermMonths || 12,
        electionVotingMethod: governanceRules.electionVotingMethod || 'simple_majority',
        electionQuorumPercentage: governanceRules.electionQuorumPercentage || 0.5,
        electionNoticeDays: 14,
        defaultVotingDeadlineHours: governanceRules.defaultVotingDeadlineHours || 168,
        defaultQuorumPercentage: 0.5,
        documentProposalPeriodDays: governanceRules.documentProposalPeriodDays || 365,
        anonymousVotingEnabled: true,
        voteChangeAllowed: false,
        representativeCanCreateVotes: true,
        representativeCanInviteMembers: true,
        representativeCanManageDocuments: true,
        representativeApprovalRequired: true,
        tamperProofEnabled: true,
        auditTrailEnabled: true
      };

      db.run(`
        INSERT INTO organization_governance_rules (
          id, organization_id, representative_term_months, election_voting_method,
          election_quorum_percentage, election_notice_days, default_voting_deadline_hours,
          default_quorum_percentage, document_proposal_period_days, anonymous_voting_enabled,
          vote_change_allowed, representative_can_create_votes, representative_can_invite_members,
          representative_can_manage_documents, representative_approval_required,
          tamper_proof_enabled, audit_trail_enabled, threshold_calculation_method, default_acceptance_threshold
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        rulesId, organizationId,
        defaultRules.representativeTermMonths,
        defaultRules.electionVotingMethod,
        defaultRules.electionQuorumPercentage,
        defaultRules.electionNoticeDays,
        defaultRules.defaultVotingDeadlineHours,
        defaultRules.defaultQuorumPercentage,
        defaultRules.documentProposalPeriodDays,
        defaultRules.anonymousVotingEnabled ? 1 : 0,
        defaultRules.voteChangeAllowed ? 1 : 0,
        defaultRules.representativeCanCreateVotes ? 1 : 0,
        defaultRules.representativeCanInviteMembers ? 1 : 0,
        defaultRules.representativeCanManageDocuments ? 1 : 0,
        defaultRules.representativeApprovalRequired ? 1 : 0,
        defaultRules.tamperProofEnabled ? 1 : 0,
        defaultRules.auditTrailEnabled ? 1 : 0,
        'all_votes', // threshold_calculation_method default
        75.0 // default_acceptance_threshold default
      ], function(err) {
        if (err) {
          logger.error('Error creating governance rules', { error: err.message, code: err.code, organizationId, sql: `
            INSERT INTO organization_governance_rules (
              id, organization_id, representative_term_months, election_voting_method,
              election_quorum_percentage, election_notice_days, default_voting_deadline_hours,
              default_quorum_percentage, document_proposal_period_days, anonymous_voting_enabled,
              vote_change_allowed, representative_can_create_votes, representative_can_invite_members,
              representative_can_manage_documents, representative_approval_required,
              tamper_proof_enabled, audit_trail_enabled, threshold_calculation_method, default_acceptance_threshold
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `});
          
          // Check if columns exist
          db.all('PRAGMA table_info(organization_governance_rules)', (pragmaErr, columns) => {
            if (pragmaErr) {
              logger.error('Error getting table info', { error: pragmaErr.message, organizationId });
            } else {
              logger.debug('organization_governance_rules columns', { columns: columns.map(c => c.name).join(', '), organizationId });
              const hasThresholdMethod = columns.some(c => c.name === 'threshold_calculation_method');
              const hasAcceptanceThreshold = columns.some(c => c.name === 'default_acceptance_threshold');
              logger.debug('Table schema check', { hasThresholdMethod, hasAcceptanceThreshold, organizationId });
            }
          });
          
          // Rollback organization creation if governance rules fail
          db.run('DELETE FROM organizations WHERE id = ?', [organizationId], (deleteErr) => {
            if (deleteErr) {
              logger.error('Error rolling back organization creation', { error: deleteErr.message, organizationId });
            }
          });
          return res.status(500).json({ 
            error: 'Failed to create governance rules',
            details: err.message,
            code: err.code,
            hint: 'The organization_governance_rules table may be missing columns. Run the migration: node server/migrations/organization-features-migration.js'
          });
        }

        // Add all representatives as organization members
        const memberPromises = representatives.map(repId =>
          new Promise((resolve, reject) => {
            db.run(`
              INSERT INTO organization_members (id, organization_id, user_id, status)
              VALUES (?, ?, ?, 'active')
            `, [uuidv4(), organizationId, repId], function(err) {
              if (err) reject(err);
              else resolve();
            });
          })
        );

        Promise.all(memberPromises).then(() => {
          securityLogger.adminAction(req.user.id, 'organization_created', {
            organizationId,
            organizationName: name,
            representatives: representatives,
            governanceRules: defaultRules
          });

          res.status(201).json({
            success: true,
            organization: {
              id: organizationId,
              name,
              description,
              membershipPolicy,
              votingThreshold,
              representatives: representatives,
              governanceRules: defaultRules,
              isActive: true,
              createdBy: req.user.id
            }
          });
        }).catch(err => {
          logger.error('Error adding representatives to organization', { error: err.message, organizationId, representatives });
          // Organization is created, but representatives couldn't be added
          securityLogger.error('Failed to add representatives to new organization', {
            organizationId,
            representatives,
            error: err.message
          });

          // Still return success since organization was created
          res.status(201).json({
            success: true,
            organization: {
              id: organizationId,
              name,
              description,
              membershipPolicy,
              votingThreshold,
              representatives: representatives,
              governanceRules: defaultRules,
              isActive: true,
              createdBy: req.user.id
            },
            warning: 'Organization created but some representatives could not be added'
          });
        });
      });
    });
  }).catch(err => {
    logger.error('Error verifying representatives', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to verify representatives' });
  });
});

// List all organizations (admin overview)
router.get('/organizations', requireAdmin, (req, res) => {
  const db = req.app.locals.db;

  // Use SELECT * to get all columns, then process them
  db.all(`
    SELECT o.*,
      (SELECT COUNT(*) FROM organization_members om WHERE om.organization_id = o.id AND om.status = 'active') as member_count,
      (SELECT COUNT(*) FROM documents d WHERE d.organization_id = o.id) as document_count
    FROM organizations o
    ORDER BY o.created_at DESC
  `, (err, organizations) => {
    if (err) {
      logger.error('Error fetching organizations', { error: err.message, code: err.code, userId: req.user.id });
      
      // Try to get table info to debug
      db.all('PRAGMA table_info(organizations)', (pragmaErr, columns) => {
        if (pragmaErr) {
          logger.error('Error getting table info', { error: pragmaErr.message });
        } else {
          logger.debug('Organizations table columns', { columns: columns.map(c => c.name).join(', ') });
        }
      });
      
      return res.status(500).json({ 
        error: 'Failed to fetch organizations',
        details: err.message,
        code: err.code
      });
    }

    if (!organizations || organizations.length === 0) {
      return res.json({
        success: true,
        organizations: []
      });
    }

    // Process organizations
    const processedOrganizations = organizations.map(org => {
      let representatives = [];
      try {
        if (org.representatives) {
          representatives = typeof org.representatives === 'string' 
            ? JSON.parse(org.representatives) 
            : org.representatives;
        }
      } catch (parseError) {
        logger.error('Error parsing representatives for org', { error: parseError.message, organizationId: org.id });
        representatives = [];
      }
      
      return {
        id: org.id,
        name: org.name,
        description: org.description || null,
        representatives,
        membershipPolicy: org.membership_policy || 'invitation',
        votingEnabled: org.voting_enabled === 1 || org.voting_enabled === true,
        votingThreshold: org.voting_threshold || 0.5,
        isActive: org.is_active === 1 || org.is_active === true || org.is_active === undefined,
        createdByAdminId: org.created_by_admin_id || null,
        createdAt: org.created_at || null,
        memberCount: org.member_count || 0,
        documentCount: org.document_count || 0
      };
    });

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
      logger.error('Error updating organization status', { error: err.message, organizationId: id, userId: req.user.id });
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
      logger.error('Error fetching users', { error: err.message, userId: req.user.id });
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
      logger.error('Error checking user', { error: err.message, targetUserId: userId, userId: req.user.id });
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
        logger.error('Error promoting user to admin', { error: err.message, targetUserId: userId, userId: req.user.id });
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

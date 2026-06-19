const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { body } = require('express-validator');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { securityLogger, logger } = require('../middleware/logger');
const { sendInvitationEmail } = require('../modules/emailService');
const { safeJsonParseArray } = require('../utils/jsonUtils');
const { organizationValidation, handleValidationErrors } = require('../middleware/validation');
const TransactionManager = require('../database/services/TransactionManager');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { getUserId } = require('../utils/routeHelpers');

const router = express.Router();

router.use(require('./admin/platform'));

// Helper function to generate random professional color
function generateDefaultBrandingColor() {
  const colors = [
    '#3B82F6', '#10B981', '#8B5CF6', '#06B6D4',
    '#F59E0B', '#EF4444', '#6366F1', '#14B8A6'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Get admin dashboard stats
router.get('/dashboard', requireAdmin, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const userId = getUserId(req);

  try {
    const queries = [
      'SELECT COUNT(*) as total_users FROM users',
      'SELECT COUNT(*) as total_organizations FROM organizations',
      'SELECT COUNT(*) as total_documents FROM documents',
      'SELECT COUNT(*) as active_organizations FROM organizations WHERE is_active = true'
    ];

    const stats = {};

    // Execute all queries in parallel
    const results = await Promise.all(
      queries.map(query => TransactionManager.query(db, query, []))
    );

    // Extract stat names and values
    queries.forEach((query, index) => {
      const statName = query.match(/COUNT\(\*\) as (\w+)/)[1];
      stats[statName] = results[index][Object.keys(results[index])[0]];
    });

    res.json({
      success: true,
      stats,
      adminUser: {
        id: userId,
        name: req.user.name,
        email: req.user.email
      }
    });
  } catch (err) {
    // Re-throw ApiError instances
    if (err instanceof ApiError) {
      throw err;
    }
    logger.error('Error getting admin stats', { error: err.message, userId });
    throw ApiError.database('Failed to fetch admin statistics', { originalError: err.message }, 'FETCH_ADMIN_STATISTICS_FAILED');
  }
}));

// Create organization (admin only)
router.post('/organizations', requireAdmin, ...organizationValidation.adminCreate, asyncHandler(async (req, res, next) => {
  // Debug logging to see what's actually received
  logger.info('Admin organization creation request received', {
    body: {
      name: req.body.name,
      membershipPolicy: req.body.membershipPolicy,
      votingThreshold: req.body.votingThreshold,
      membershipPolicyType: typeof req.body.membershipPolicy,
      votingThresholdType: typeof req.body.votingThreshold,
      hasMembershipPolicy: 'membershipPolicy' in req.body,
      hasVotingThreshold: 'votingThreshold' in req.body,
      representatives: req.body.representatives,
      representativeEmails: req.body.representativeEmails,
      representativesType: typeof req.body.representatives,
      representativeEmailsType: typeof req.body.representativeEmails,
      isRepresentativesArray: Array.isArray(req.body.representatives),
      isRepresentativeEmailsArray: Array.isArray(req.body.representativeEmails),
      representativeEmailsLength: Array.isArray(req.body.representativeEmails) ? req.body.representativeEmails.length : 'not-array',
      representativeEmailsContent: Array.isArray(req.body.representativeEmails) ? req.body.representativeEmails : 'not-array',
      representativeMode: req.body.representativeMode || 'not-provided',
      fullBody: JSON.stringify(req.body)
    }
  });

  const db = req.app.locals.db;
  const userId = getUserId(req);
  
  const {
    name,
    description,
    representatives,
    representativeEmails, // camelCase (from client)
    representative_emails, // snake_case (alternative format)
    membershipPolicy,
    membership_policy, // snake_case alternative
    votingEnabled,
    voting_enabled, // snake_case alternative
    votingThreshold,
    voting_threshold, // snake_case alternative
    governanceRules = {},
    governance_rules // snake_case alternative
  } = req.body;
  
  // Support both camelCase and snake_case field names
  const actualRepresentativeEmails = representativeEmails || representative_emails;
  const actualMembershipPolicy = membershipPolicy || membership_policy;
  const actualVotingEnabled = votingEnabled !== undefined ? votingEnabled : (voting_enabled !== undefined ? voting_enabled : true); // Default to true (voting enabled by default)
  const actualVotingThreshold = votingThreshold !== undefined ? votingThreshold : voting_threshold;
  const actualGovernanceRules = (governanceRules && Object.keys(governanceRules).length > 0) 
    ? governanceRules 
    : (governance_rules || {});
  const organizationId = uuidv4();
  
  // Ensure description is not undefined (default to null)
  const orgDescription = description || null;

  // Normalize representativeEmails: handle string input, filter out empty values
  let normalizedRepresentativeEmails = [];
  if (actualRepresentativeEmails) {
    if (typeof actualRepresentativeEmails === 'string') {
      // If it's a string, try to parse it or split by comma
      try {
        const parsed = JSON.parse(actualRepresentativeEmails);
        normalizedRepresentativeEmails = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // If not JSON, split by comma
        normalizedRepresentativeEmails = actualRepresentativeEmails.split(',').map(e => e.trim()).filter(e => e);
      }
    } else if (Array.isArray(actualRepresentativeEmails)) {
      // Filter out empty strings, null, undefined
      normalizedRepresentativeEmails = actualRepresentativeEmails.filter(email => email && typeof email === 'string' && email.trim().length > 0);
    }
  }

  // Normalize representatives: ensure it's an array
  const normalizedRepresentatives = Array.isArray(representatives) 
    ? representatives.filter(id => id && typeof id === 'string' && id.trim().length > 0)
    : [];

  // Validate that at least one of representatives or representativeEmails is provided with valid values
  const hasValidRepresentatives = normalizedRepresentatives.length > 0;
  const hasValidRepresentativeEmails = normalizedRepresentativeEmails.length > 0;

  if (!hasValidRepresentatives && !hasValidRepresentativeEmails) {
    logger.warn('Validation failed: no valid representatives or emails', {
      representatives: req.body.representatives,
      representativeEmails: req.body.representativeEmails,
      representative_emails: req.body.representative_emails,
      actualRepresentativeEmails,
      normalizedRepresentatives,
      normalizedRepresentativeEmails
    });
    return next(ApiError.validation('Either representatives (user IDs) or representativeEmails must be provided', null, 'REPRESENTATIVES_OR_EMAILS_REQUIRED'));
  }

  // If representatives provided, verify they exist and are not organization IDs
  if (hasValidRepresentatives) {
    try {
      const checkPromises = normalizedRepresentatives.map(repId =>
        TransactionManager.query(db, 'SELECT id, name FROM users WHERE id = ?', [repId])
      );
      const verifiedUsers = await Promise.all(checkPromises);
      const missingUsers = verifiedUsers.filter(user => !user);
      if (missingUsers.length > 0) {
        return next(ApiError.validation('One or more representative users not found', null, 'REPRESENTATIVE_USERS_NOT_FOUND'));
      }
      
      // Verify that representatives are not organization IDs
      const orgCheckPromises = normalizedRepresentatives.map(repId =>
        TransactionManager.query(db, 'SELECT id FROM organizations WHERE id = ?', [repId])
      );
      const orgChecks = await Promise.all(orgCheckPromises);
      const invalidReps = orgChecks.filter(org => org).map((_, index) => normalizedRepresentatives[index]);
      if (invalidReps.length > 0) {
        return next(ApiError.validation('Cannot use organization IDs as representatives', null, 'INVALID_REPRESENTATIVE_ID'));
      }
    } catch (err) {
      logger.error('Error verifying representatives', { error: err.message });
      throw ApiError.database('Failed to verify representatives', { originalError: err.message }, 'VERIFY_REPRESENTATIVES_FAILED');
    }
  }

  // Create organization with empty representatives if using email invitations
  const initialRepresentatives = hasValidRepresentatives ? JSON.stringify(normalizedRepresentatives) : JSON.stringify([]);

  // Generate default branding color
  const defaultBrandingColor = generateDefaultBrandingColor();

  // Create governance rules object (needed for response)
  const defaultRules = {
    representativeTermMonths: actualGovernanceRules.representativeTermMonths || actualGovernanceRules.representative_term_months || 12,
    electionVotingMethod: actualGovernanceRules.electionVotingMethod || actualGovernanceRules.election_voting_method || 'simple_majority',
    electionQuorumPercentage: actualGovernanceRules.electionQuorumPercentage !== undefined ? actualGovernanceRules.electionQuorumPercentage : (actualGovernanceRules.election_quorum_percentage !== undefined ? actualGovernanceRules.election_quorum_percentage : 0.5),
    electionNoticeDays: 14,
    defaultVotingDeadlineHours: actualGovernanceRules.defaultVotingDeadlineHours || actualGovernanceRules.default_voting_deadline_hours || 168,
    defaultQuorumPercentage: 0.5,
    documentProposalPeriodDays: actualGovernanceRules.documentProposalPeriodDays || actualGovernanceRules.document_proposal_period_days || 365,
    paragraphProposalCutoffDays: actualGovernanceRules.paragraphProposalCutoffDays ?? actualGovernanceRules.paragraph_proposal_cutoff_days ?? 7,
    anonymousVotingEnabled: true,
    voteChangeAllowed: false,
    representativeCanCreateVotes: true,
    representativeCanInviteMembers: true,
    representativeCanManageDocuments: true,
    representativeApprovalRequired: true,
    tamperProofEnabled: true,
    auditTrailEnabled: true,
    defaultStructureProposalsEnabled: true,
    defaultVotingAnonymityLocked: false
  };

  try {
    // Use TransactionManager for atomic operations - all database writes in one transaction
    const organization = await TransactionManager.executeInTransaction(db, async (trx) => {
      // 1. Create organization
      const isActiveValue = true;
      const votingEnabledValue = !!actualVotingEnabled;
      const { initializeRootOrgFields } = require('../services/ParticipationGraphService');
      const participationTemplate = req.body.participationTemplate || req.body.participation_template || 'classical_cooperative';
      const rootFields = initializeRootOrgFields(organizationId, { template: participationTemplate });

      await TransactionManager.execute(
        trx,
        `INSERT INTO organizations (
          id, name, description, representatives, membership_policy, voting_enabled, voting_threshold,
          is_active, created_by_admin_id, branding_color,
          primary_parent_id, org_kind, participation_profile, tree_depth, tree_path, participation_graph_root_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          organizationId, name, orgDescription, initialRepresentatives, actualMembershipPolicy,
          votingEnabledValue, actualVotingThreshold, isActiveValue, userId, defaultBrandingColor,
          rootFields.primary_parent_id, rootFields.org_kind, rootFields.participation_profile,
          rootFields.tree_depth, rootFields.tree_path, rootFields.participation_graph_root_id,
        ]
      );

      // 2. Dual-write: If representatives provided as IDs, add them to organization_representatives table
      if (hasValidRepresentatives) {
        for (const repId of normalizedRepresentatives) {
          const repTableId = uuidv4();
          try {
            const insertSql =
              `INSERT INTO organization_representatives (id, organization_id, user_id, status, added_at) VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP) ON CONFLICT (id) DO NOTHING`;
            
            await TransactionManager.execute(trx, insertSql, [repTableId, organizationId, repId]);
          } catch (repErr) {
            if (!repErr.message.includes('UNIQUE constraint')) {
              logger.error('Error adding representative to table', { error: repErr.message, organizationId, repId });
              throw repErr;
            }
            // UNIQUE constraint is expected and can be ignored
          }
        }
      }

      // 3. If representativeEmails provided, create invitation records (database writes in transaction)
      const invitationTokens = [];
      if (hasValidRepresentativeEmails) {
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + 7); // 7 days

        for (const email of normalizedRepresentativeEmails) {
          const invitationToken = crypto.randomBytes(32).toString('hex');
          const invitationId = uuidv4();

          // Store invitation in transaction
          await TransactionManager.execute(
            trx,
            `INSERT INTO organization_invitations (
              id, organization_id, email, invitation_token, invitation_type, 
              invited_by, status, expires_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [invitationId, organizationId, email.toLowerCase(), invitationToken, 'representative', userId, 'pending', expirationDate.toISOString()]
          );

          invitationTokens.push({ email, token: invitationToken, id: invitationId });
        }
      }

      // 4. Create governance rules using shared function (includes all 21 fields)
      const { createDefaultGovernanceRules } = require('./governance');
      await createDefaultGovernanceRules(trx, organizationId, defaultRules);

      const pgDefaults = rootFields.governanceDefaults || {};
      if (Object.keys(pgDefaults).length > 0 || participationTemplate === 'federation_union') {
        const patch = {
          participation_graph_enabled: pgDefaults.participationGraphEnabled === true,
          subgroups_enabled: pgDefaults.subgroupsEnabled !== false,
          federation_electorate_mode: participationTemplate === 'federation_union' ? 'delegates_only' : 'all_members',
        };
        const sets = Object.entries(patch).map(([k]) => `${k} = ?`).join(', ');
        await TransactionManager.execute(
          trx,
          `UPDATE organization_governance_rules SET ${sets} WHERE organization_id = ?`,
          [...Object.values(patch), organizationId]
        );
      }

      // 5. Add all representatives as organization members (only if representatives are user IDs, not emails)
      if (hasValidRepresentatives) {
        for (const repId of normalizedRepresentatives) {
          try {
            await TransactionManager.execute(
              trx,
              `INSERT INTO organization_members (id, organization_id, user_id, status)
              VALUES (?, ?, ?, 'active')`,
              [uuidv4(), organizationId, repId]
            );
          } catch (err) {
            // Check for duplicate entry (user already a member)
            if (!err.message.includes('UNIQUE constraint')) {
              logger.error('Error adding representative as member', { error: err.message, organizationId, repId });
              throw err;
            }
            logger.warn('Representative already a member', { organizationId, repId });
          }
        }
      }

      // Log security audit
      securityLogger.adminAction(userId, 'organization_created', {
        organizationId,
        organizationName: name,
        representatives: normalizedRepresentatives,
        representativeEmails: normalizedRepresentativeEmails,
        governanceRules: defaultRules
      });

      return {
        id: organizationId,
        name,
        description,
        membershipPolicy: actualMembershipPolicy,
        votingEnabled: actualVotingEnabled,
        votingThreshold: actualVotingThreshold,
        representatives: normalizedRepresentatives,
        governanceRules: defaultRules,
        isActive: true,
        createdBy: userId,
        invitationTokens // Return tokens for email sending outside transaction
      };
    });

    // Send invitation emails outside transaction (external operation, non-blocking)
    if (organization.invitationTokens && organization.invitationTokens.length > 0) {
      const adminName = req.user.name || 'Administrator';
      const emailPromises = organization.invitationTokens.map(async ({ email, token }) => {
        try {
          await sendInvitationEmail(email, name, token, adminName, 'representative');
        } catch (emailErr) {
          logger.error('Failed to send representative invitation email', {
            error: emailErr.message,
            email,
            organizationId,
          });
          // Continue with other emails even if one fails
        }
      });
      // Fire and forget - don't await
      Promise.all(emailPromises).catch(err => {
        logger.error('Error sending some invitation emails', { error: err.message, organizationId });
      });
    }

    // All operations complete - send response
    res.status(201).json({
      success: true,
      organization: {
        id: organization.id,
        name: organization.name,
        description: organization.description,
        membershipPolicy: organization.membershipPolicy,
        votingEnabled: organization.votingEnabled,
        votingThreshold: organization.votingThreshold,
        representatives: organization.representatives,
        governanceRules: organization.governanceRules,
        isActive: organization.isActive,
        createdBy: organization.createdBy
      },
      message: normalizedRepresentativeEmails && normalizedRepresentativeEmails.length > 0
        ? `Organization created. Representative invitations sent to ${normalizedRepresentativeEmails.length} email address${normalizedRepresentativeEmails.length !== 1 ? 'es' : ''}.`
        : 'Organization created successfully.'
    });
  } catch (error) {
    logger.error('Error creating organization', { 
      error: error.message, 
      code: error.code,
      organizationId,
      stack: error.stack,
      userId 
    });
    
    // Transaction automatically rolled back - no manual cleanup needed
    
    // Check if it's a governance rules error
    if (error.message && error.message.includes('organization_governance_rules')) {
      throw ApiError.database('Failed to create governance rules', { 
        originalError: error.message,
        code: error.code,
        hint: 'The organization_governance_rules table may be missing columns. Run the migration: node server/migrations/organization-features-migration.js'
      }, 'CREATE_GOVERNANCE_RULES_FAILED');
    }
    
    throw ApiError.database('Failed to create organization', { 
      originalError: error.message,
      code: error.code
    }, 'CREATE_ORGANIZATION_FAILED');
  }
}));

// Invite representatives via email (admin only)
router.post('/organizations/:organizationId/representatives/invite', requireAdmin, ...organizationValidation.inviteMembers, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const { emails } = req.body;
  const adminId = getUserId(req);

  try {
    // Verify organization exists
    const organization = await TransactionManager.query(
      db,
      'SELECT id, name FROM organizations WHERE id = ?',
      [organizationId]
    );

    if (!organization) {
      return next(ApiError.notFound('Organization', 'ORGANIZATION_NOT_FOUND'));
    }

    const adminName = req.user.name || 'Administrator';
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 7); // 7 days

    const invitations = [];
    const failedEmails = [];

    for (const email of emails) {
      try {
        const invitationToken = crypto.randomBytes(32).toString('hex');
        const invitationId = uuidv4();

        // Store invitation
        await TransactionManager.execute(
          db,
          `INSERT INTO organization_invitations (
            id, organization_id, email, invitation_token, invitation_type, 
            invited_by, status, expires_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [invitationId, organizationId, email.toLowerCase(), invitationToken, 'representative', adminId, 'pending', expirationDate.toISOString()]
        );

        // The invitation row is created regardless of whether the email is
        // deliverable; email sending is best-effort.
        invitations.push({ id: invitationId, email, token: invitationToken });

        // Send invitation email
        try {
          await sendInvitationEmail(
            email,
            organization.name,
            invitationToken,
            adminName,
            'representative'
          );
        } catch (emailErr) {
          logger.error('Failed to send representative invitation email', {
            error: emailErr.message,
            email,
            organizationId,
          });
          failedEmails.push({ email, error: emailErr.message });
        }
      } catch (dbErr) {
        logger.error('Failed to create representative invitation', {
          error: dbErr.message,
          email,
          organizationId,
        });
        failedEmails.push({ email, error: 'Database error' });
      }
    }

    securityLogger.adminAction(adminId, 'representatives_invited', {
      organizationId,
      emailCount: emails.length,
      successful: invitations.length,
      failed: failedEmails.length
    }, req);

    res.json({
      success: true,
      invitations: invitations.length,
      failed: failedEmails.length,
      failedEmails: failedEmails.length > 0 ? failedEmails : undefined,
      message: `Representative invitations sent to ${invitations.length} email address${invitations.length !== 1 ? 'es' : ''}${failedEmails.length > 0 ? ` (${failedEmails.length} failed)` : ''}`
    });
  } catch (error) {
    // Re-throw ApiError instances
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error inviting representatives', { error: error.message, stack: error.stack, organizationId });
    throw ApiError.database('Internal server error', { originalError: error.message }, 'INVITE_REPRESENTATIVES_FAILED');
  }
}));

// List all organizations (admin overview)
router.get('/organizations', requireAdmin, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;

  try {
    const organizations = await TransactionManager.queryAll(
      db,
      `SELECT o.id, o.name, o.description, o.representatives, o.membership_policy, o.voting_enabled, 
        o.voting_threshold, o.is_active, o.created_by_admin_id, o.created_at, o.branding_color, 
        o.branding_logo_url, o.branding_title, o.icon_set, o.font_family,
        (SELECT COUNT(*) FROM organization_members om WHERE om.organization_id = o.id AND om.status = 'active') as member_count,
        (SELECT COUNT(*) FROM documents d WHERE d.organization_id = o.id) as document_count,
        u.name as created_by_name,
        u.email as created_by_email
      FROM organizations o
      LEFT JOIN users u ON o.created_by_admin_id = u.id
      ORDER BY o.created_at DESC`
    );

    if (!organizations || organizations.length === 0) {
      return res.json({
        success: true,
        organizations: []
      });
    }

    // Process organizations
    const processedOrganizations = organizations.map(org => {
      let representatives = [];
      if (org.representatives) {
        representatives = typeof org.representatives === 'string' 
          ? safeJsonParseArray(org.representatives) 
          : (Array.isArray(org.representatives) ? org.representatives : []);
      }
      
      return {
        id: org.id,
        name: org.name,
        description: org.description || null,
        representatives,
        membershipPolicy: org.membership_policy || 'invitation',
        votingEnabled: org.voting_enabled === true || org.voting_enabled === true,
        votingThreshold: org.voting_threshold || 0.5,
        isActive: org.is_active === true || org.is_active === true || org.is_active === undefined,
        createdByAdminId: org.created_by_admin_id || null,
        createdByName: org.created_by_name || org.created_by_email || 'Unknown',
        createdAt: org.created_at || null,
        memberCount: org.member_count || 0,
        documentCount: org.document_count || 0,
        brandingColor: org.branding_color || null,
        brandingLogoUrl: org.branding_logo_url || null,
        brandingTitle: org.branding_title || null,
        iconSet: org.icon_set || null,
        fontFamily: org.font_family || null
      };
    });

    res.json({
      success: true,
      organizations: processedOrganizations
    });
  } catch (err) {
    const userId = getUserId(req, false);
    logger.error('Error fetching organizations', { error: err.message, code: err.code, userId });
    
    // Try to get table info to debug
    try {
      const columnInfoQuery =
        `SELECT column_name as name, data_type as type, is_nullable as notnull, column_default as dflt_value, CASE WHEN is_nullable = 'NO' THEN 1 ELSE 0 END as notnull FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'organizations' ORDER BY ordinal_position`;
      const columns = await TransactionManager.queryAll(db, columnInfoQuery, []);
      logger.debug('Organizations table columns', { columns: columns.map(c => c.name).join(', ') });
    } catch (pragmaErr) {
      logger.error('Error getting table info', { error: pragmaErr.message });
    }
    
    throw ApiError.database('Failed to fetch organizations', { 
      originalError: err.message,
      code: err.code
    }, 'FETCH_ORGANIZATIONS_FAILED');
  }
}));

// Admin dogfooding: reparent organization in participation graph (temporary until vote-gated reparent in Phase 7)
router.patch('/organizations/:id/parent', requireAdmin, [
  body('primaryParentId')
    .optional({ nullable: true })
    .custom((value, { req }) => {
      const raw = value !== undefined ? value : req.body.primary_parent_id;
      if (raw === null || raw === undefined || raw === '') return true;
      if (typeof raw !== 'string' || raw.trim().length === 0) {
        throw new Error('primaryParentId must be a non-empty string or null');
      }
      return true;
    }),
  handleValidationErrors,
], asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const rawParent = req.body.primaryParentId !== undefined ? req.body.primaryParentId : req.body.primary_parent_id;
  const primaryParentId = rawParent === '' || rawParent === undefined ? null : rawParent;

  try {
    const ParticipationGraphService = require('../services/ParticipationGraphService');
    const result = await ParticipationGraphService.setPrimaryParent(db, id, primaryParentId);
    res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error reparenting organization', { error: error.message, organizationId: id, primaryParentId });
    throw ApiError.database('Failed to update organization parent', { originalError: error.message });
  }
}));

// Deactivate/reactivate organization
router.patch('/organizations/:id/status', requireAdmin, [
  // Accept both camelCase and snake_case (transformRequest snake-cases the body).
  body('isActive')
    .custom((value, { req }) => {
      const raw = value !== undefined ? value : req.body.is_active;
      if (raw === undefined || raw === null || raw === '') {
        throw new Error('isActive is required');
      }
      if (typeof raw !== 'boolean' && raw !== 'true' && raw !== 'false' && raw !== 0 && raw !== 1) {
        throw new Error('isActive must be a boolean');
      }
      return true;
    }),
  handleValidationErrors
], asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const userId = getUserId(req);
  const { id } = req.params;
  const rawIsActive = req.body.isActive !== undefined ? req.body.isActive : req.body.is_active;
  const isActive = rawIsActive === true || rawIsActive === 'true' || rawIsActive === 1;

  try {
    const result = await TransactionManager.execute(
      db,
      'UPDATE organizations SET is_active = ? WHERE id = ?',
      [isActive, id]
    );

    if (result.changes === 0) {
      return next(ApiError.notFound('Organization', 'ORGANIZATION_NOT_FOUND'));
    }

    securityLogger.adminAction(userId, 'organization_status_changed', {
      organizationId: id,
      newStatus: isActive
    });

    res.json({
      success: true,
      message: `Organization ${isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (err) {
    // Re-throw ApiError instances
    if (err instanceof ApiError) {
      throw err;
    }
    logger.error('Error updating organization status', { error: err.message, organizationId: id, userId });
    throw ApiError.database('Failed to update organization status', { originalError: err.message }, 'UPDATE_ORGANIZATION_STATUS_FAILED');
  }
}));

// Get all users (for admin to assign as representatives)
router.get('/users', requireAdmin, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;

  try {
    const users = await TransactionManager.queryAll(
      db,
      `SELECT id, name, email, role, created_at,
        COALESCE(is_active, true) as is_active,
        suspended_at,
        (SELECT COUNT(*) FROM organization_members om WHERE om.user_id = u.id AND om.status = 'active') as organizations_count
      FROM users u
      ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      users: users.map(user => ({
        ...user,
        organizationsCount: user.organizations_count,
        isActive: user.is_active !== false && user.is_active !== 0,
        suspendedAt: user.suspended_at,
      }))
    });
  } catch (err) {
    // Re-throw ApiError instances
    if (err instanceof ApiError) {
      throw err;
    }
    logger.error('Error fetching users', { error: err.message, userId });
    throw ApiError.database('Failed to fetch users', { originalError: err.message }, 'FETCH_USERS_FAILED');
  }
}));

// Promote user to admin (only existing admins can do this)
router.post('/promote-admin/:userId', requireAdmin, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const adminUserId = getUserId(req);
  const { userId } = req.params;

  try {
    // Verify target user exists
    const user = await TransactionManager.query(
      db,
      'SELECT id, name, email, role FROM users WHERE id = ?',
      [userId]
    );

    if (!user) {
      return next(ApiError.notFound('User', 'USER_NOT_FOUND'));
    }

    if (user.role === 'admin') {
      return next(ApiError.validation('User is already an admin', null, 'USER_ALREADY_ADMIN'));
    }

    const result = await TransactionManager.execute(
      db,
      'UPDATE users SET role = ? WHERE id = ?',
      ['admin', userId]
    );

    securityLogger.adminAction(adminUserId, 'user_promoted_to_admin', {
      promotedUserId: userId,
      promotedUserName: user.name
    }, req);

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
  } catch (err) {
    // Re-throw ApiError instances
    if (err instanceof ApiError) {
      throw err;
    }
    logger.error('Error promoting user to admin', { error: err.message, targetUserId: userId, userId: adminUserId });
    throw ApiError.database('Failed to promote user', { originalError: err.message }, 'PROMOTE_USER_FAILED');
  }
}));

// Clear rate limits (admin only)
// POST /api/admin/rate-limits/clear
// Body: { ip?: string } - optional IP address to clear specific IP, or omit to clear all
router.post('/rate-limits/clear', requireAdmin, asyncHandler(async (req, res) => {
  const redisClient = req.app.locals.redisClient;
  const adminUserId = getUserId(req);
  const { ip } = req.body;

  if (!redisClient) {
    return res.status(503).json({
      success: false,
      error: 'Redis not available. Rate limits are stored in-memory and will reset when the server restarts.',
      message: 'If using in-memory rate limiting, restart the server to clear rate limits.'
    });
  }

  try {
    let keysToDelete = [];
    
    if (ip) {
      // Clear rate limits for specific IP
      // With our new prefix structure, keys are formatted as:
      // - rl:auth:${express-rate-limit-key} (where key contains IP)
      // - rl:api:${express-rate-limit-key} (where key contains IP)
      // express-rate-limit may use IP directly or hash it, so we search broadly
      const allRateLimitKeys = await redisClient.keys('rl:*');
      
      // Filter keys that contain the IP address (could be in various positions)
      keysToDelete = allRateLimitKeys.filter(key => {
        // Check if key contains the IP (express-rate-limit may format it differently)
        return key.includes(ip) || 
               key.includes(ip.replace(/:/g, '-')) || // IPv6 colons might be replaced
               key.includes(ip.replace(/\./g, '-')) || // IPv4 dots might be replaced
               key.includes(Buffer.from(ip).toString('base64').substring(0, 10)); // Might be hashed/encoded
      });
      
      // Also try exact patterns for common formats
      const exactPatterns = [
        `rl:auth:${ip}`,
        `rl:api:${ip}`,
        `rl:${ip}`,
        `rl:auth:*${ip}*`,
        `rl:api:*${ip}*`
      ];
      
      for (const pattern of exactPatterns) {
        const keys = await redisClient.keys(pattern);
        keysToDelete.push(...keys);
      }
      
      // Remove duplicates
      keysToDelete = [...new Set(keysToDelete)];
      
      if (keysToDelete.length === 0) {
        return res.json({
          success: true,
          message: `No rate limit keys found for IP: ${ip}`,
          deleted: 0,
          searchedKeys: allRateLimitKeys.length
        });
      }
    } else {
      // Clear all rate limit keys
      keysToDelete = await redisClient.keys('rl:*');
      
      if (keysToDelete.length === 0) {
        return res.json({
          success: true,
          message: 'No rate limit keys found',
          deleted: 0
        });
      }
    }
    
    // Delete keys
    const deleted = await redisClient.del(...keysToDelete);
    
    securityLogger.adminAction(adminUserId, 'rate_limits_cleared', {
      ip: ip || 'all',
      keysDeleted: deleted,
      totalKeys: keysToDelete.length
    });
    
    res.json({
      success: true,
      message: ip 
        ? `Cleared ${deleted} rate limit key(s) for IP: ${ip}`
        : `Cleared ${deleted} rate limit key(s)`,
      deleted,
      totalKeys: keysToDelete.length
    });
  } catch (err) {
    logger.error('Error clearing rate limits', { 
      error: err.message, 
      stack: err.stack,
      ip: ip || 'all',
      userId: adminUserId 
    });
    throw ApiError.database('Failed to clear rate limits', { originalError: err.message }, 'CLEAR_RATE_LIMITS_FAILED');
  }
}));

// List rate limits (admin only)
// GET /api/admin/rate-limits?ip=1.2.3.4 (optional IP filter)
router.get('/rate-limits', requireAdmin, asyncHandler(async (req, res) => {
  const redisClient = req.app.locals.redisClient;
  const { ip } = req.query;

  if (!redisClient) {
    return res.status(503).json({
      success: false,
      error: 'Redis not available. Rate limits are stored in-memory.',
      message: 'Cannot list rate limits when using in-memory storage.'
    });
  }

  try {
    // Get all rate limit keys first
    const allKeys = await redisClient.keys('rl:*');
    
    // If searching for specific IP, filter results
    let filteredKeys = allKeys;
    if (ip) {
      // Filter keys that contain the IP address (could be in various positions)
      filteredKeys = allKeys.filter(key => {
        // Check if key contains the IP (express-rate-limit may format it differently)
        return key.includes(ip) || 
               key.includes(ip.replace(/:/g, '-')) || // IPv6 colons might be replaced
               key.includes(ip.replace(/\./g, '-')); // IPv4 dots might be replaced
      });
    }
    
    const rateLimits = [];
    for (const key of filteredKeys) {
      const value = await redisClient.get(key);
      const ttl = await redisClient.ttl(key);
      const ttlMinutes = Math.ceil(ttl / 60);
      
      rateLimits.push({
        key,
        hits: parseInt(value || '0', 10),
        ttlSeconds: ttl,
        ttlMinutes,
        expiresIn: ttl > 0 ? `${ttlMinutes} minute(s)` : 'expired'
      });
    }
    
    res.json({
      success: true,
      count: rateLimits.length,
      rateLimits
    });
  } catch (err) {
    logger.error('Error listing rate limits', { 
      error: err.message, 
      stack: err.stack,
      ip: ip || 'all'
    });
    throw ApiError.database('Failed to list rate limits', { originalError: err.message }, 'LIST_RATE_LIMITS_FAILED');
  }
}));

module.exports = router;

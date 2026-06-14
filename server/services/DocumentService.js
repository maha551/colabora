/**
 * DocumentService - document creation, access, and voting finalization.
 * Does not depend on route files.
 */

const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../database/services/TransactionManager');
const { ApiError } = require('../middleware/errorHandler');
const { logger } = require('../middleware/logger');
const { isRepresentative } = require('../modules/permissions');
const { buildOwnerJoin, buildOwnerSelect, buildAccessCheck } = require('../utils/documentQueries');
const { safeJsonParse } = require('../utils/jsonUtils');
const { getIsPostgreSQL } = require('../utils/routeHelpers');
const { syncDocumentCollaborators } = require('../modules/document-collaborator-sync');
const UserService = require('../database/services/UserService');
const crypto = require('crypto');
const votingLockManager = require('../utils/votingLocks');
const voteVerificationLog = require('../utils/voteVerificationLog');
const { generateReceiptId, computeVoteHash } = require('../utils/voteReceipt');
const UnifiedVotingService = require('../modules/unified-voting');
const documentValidation = require('../utils/documentValidation');
const GovernanceRulesService = require('./governance/GovernanceRulesService');

const DOCUMENT_CONFIG = {
  MAX_DEPTH: 10,
  DEFAULT_PROPOSAL_PERIOD_DAYS: 30,
  MIN_ACCEPTANCE_THRESHOLD: 0,
  MAX_ACCEPTANCE_THRESHOLD: 100,
  DEFAULT_ACCEPTANCE_THRESHOLD: 75
};

/** Map lifecycle / amendment governance columns to API camelCase. */
function mapDocumentLifecycleFields(doc, { includeSnapshotFlag = true } = {}) {
  if (!doc) return {};
  const fields = {
    proposalEndedAt: doc.proposal_ended_at || undefined,
    votingEndedAt: doc.voting_ended_at || undefined,
    amendmentsClosedAt: doc.amendments_closed_at || undefined,
    amendmentAdoptionVoteId: doc.amendment_adoption_vote_id || undefined,
  };
  if (includeSnapshotFlag) {
    fields.hasAmendmentSnapshot = !!(doc.amendment_snapshot_json);
  }
  return fields;
}

// --- Document listing (extracted from route handlers) ---

/**
 * List documents accessible to a user (as owner, collaborator, or org member).
 * @param {Object} db - Database/knex connection
 * @param {string} userId
 * @param {{ limit?: number, offset?: number, includeTotal?: boolean }} options
 * @returns {Promise<{ documents: Array, pagination: Object }>}
 */
async function listDocuments(db, userId, options = {}) {
  const limit = options.limit || 50;
  const offset = options.offset || 0;
  const maxLimit = 200;
  const validLimit = Math.min(Math.max(1, limit), maxLimit);

  const query = `
    SELECT DISTINCT d.*,
           ${buildOwnerSelect('d')},
           o.name as organization_name
    FROM documents d
    ${buildOwnerJoin('d')}
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id
    LEFT JOIN organizations o ON d.organization_id = o.id
    LEFT JOIN organization_members om ON o.id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    WHERE (d.owner_id = ? AND d.ownership_type != 'organizational')
       OR dc.user_id = ?
       OR (d.ownership_type = 'organizational' AND om.user_id IS NOT NULL)
    ORDER BY d.updated_at DESC
    LIMIT ? OFFSET ?
  `;

  logger.debug('Executing documents query', { userId, limit: validLimit, offset });

  let documents;
  try {
    documents = await TransactionManager.queryAll(db, query, [userId, userId, userId, validLimit, offset]);
  } catch (err) {
    logger.error('Error fetching documents', { error: err.message, userId });
    throw ApiError.database('Failed to fetch documents', { originalError: err.message });
  }

  let totalCount = null;
  if (options.includeTotal) {
    try {
      const countQuery = `
        SELECT COUNT(DISTINCT d.id) as total
        FROM documents d
        ${buildOwnerJoin('d')}
        LEFT JOIN document_collaborators dc ON d.id = dc.document_id
        LEFT JOIN organizations o ON d.organization_id = o.id
        LEFT JOIN organization_members om ON o.id = om.organization_id AND om.user_id = ? AND om.status = 'active'
        WHERE (d.owner_id = ? AND d.ownership_type != 'organizational')
           OR dc.user_id = ?
           OR (d.ownership_type = 'organizational' AND om.user_id IS NOT NULL)
      `;
      const countResult = await TransactionManager.query(db, countQuery, [userId, userId, userId]);
      totalCount = countResult?.total || 0;
    } catch (countErr) {
      logger.warn('Error fetching document count', { error: countErr.message, userId });
    }
  }

  logger.debug('Found documents for user', { count: documents.length, userId });

  const documentIds = documents.map(doc => doc.id);
  const orgIds = [...new Set(documents.filter(doc => doc.organization_id).map(doc => doc.organization_id))];

  let collabQuery, collabParams;
  if (documentIds.length > 0) {
    collabQuery = `
      SELECT
        dc.document_id,
        dc.id as collaborator_id,
        dc.user_id,
        dc.created_at,
        u.name as user_name,
        u.email as user_email
      FROM document_collaborators dc
      JOIN users u ON dc.user_id = u.id
      WHERE dc.document_id IN (${documentIds.map(() => '?').join(',')})
        AND dc.user_id NOT IN (SELECT id FROM organizations)
    `;
    collabParams = documentIds;
  }

  let orgCollabQuery, orgCollabParams;
  if (orgIds.length > 0) {
    orgCollabQuery = `
      SELECT
        om.organization_id,
        u.id as user_id,
        u.name as user_name,
        u.email as user_email,
        u.avatar as user_avatar,
        'auto' as collaborator_type
      FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE om.organization_id IN (${orgIds.map(() => '?').join(',')}) AND om.status = 'active'
        AND om.user_id NOT IN (SELECT id FROM organizations)
      ORDER BY u.name
    `;
    orgCollabParams = orgIds;
  }

  let statsQuery, statsParams = [];
  if (documentIds.length > 0) {
    statsQuery = `
      SELECT
        p.document_id,
        COUNT(DISTINCT p.id) as paragraph_count,
        COUNT(DISTINCT pr.id) as proposal_count
      FROM paragraphs p
      LEFT JOIN proposals pr ON p.id = pr.paragraph_id
      WHERE p.document_id IN (${documentIds.map(() => '?').join(',')})
      GROUP BY p.document_id
    `;
    statsParams = documentIds;
  }

  const queryPromises = [];
  queryPromises.push(collabQuery ? TransactionManager.queryAll(db, collabQuery, collabParams) : Promise.resolve([]));
  queryPromises.push(orgCollabQuery ? TransactionManager.queryAll(db, orgCollabQuery, orgCollabParams) : Promise.resolve([]));
  queryPromises.push(statsQuery ? TransactionManager.queryAll(db, statsQuery, statsParams) : Promise.resolve([]));

  try {
    const [collaborators, orgCollaborators, stats] = await Promise.all(queryPromises);

    const collabMap = new Map();
    const orgCollabMap = new Map();
    const statsMap = new Map();

    collaborators.forEach(collab => {
      if (!collabMap.has(collab.document_id)) {
        collabMap.set(collab.document_id, []);
      }
      collabMap.get(collab.document_id).push({
        id: collab.collaborator_id,
        document_id: collab.document_id,
        user_id: collab.user_id,
        created_at: collab.created_at,
        user: {
          id: collab.user_id,
          name: collab.user_name,
          email: collab.user_email,
          avatar: collab.user_avatar
        }
      });
    });

    orgCollaborators.forEach(collab => {
      if (!orgCollabMap.has(collab.organization_id)) {
        orgCollabMap.set(collab.organization_id, []);
      }
      orgCollabMap.get(collab.organization_id).push({
        id: collab.user_id,
        user_id: collab.user_id,
        user: {
          id: collab.user_id,
          name: collab.user_name,
          email: collab.user_email,
          avatar: collab.user_avatar
        },
        collaborator_type: 'auto'
      });
    });

    stats.forEach(stat => {
      statsMap.set(stat.document_id, {
        paragraphCount: stat.paragraph_count || 0,
        proposalCount: stat.proposal_count || 0
      });
    });

    const processedDocuments = documents.map(doc => {
      const docStats = statsMap.get(doc.id) || { paragraphCount: 0, proposalCount: 0 };
      let docCollaborators = [];

      if (doc.ownership_type === 'organizational' && doc.organization_id) {
        docCollaborators = orgCollabMap.get(doc.organization_id) || [];
      } else {
        docCollaborators = collabMap.get(doc.id) || [];
      }

      const paragraphs = Array.from({ length: docStats.paragraphCount }, (_, index) => ({
        id: `para-${doc.id}-${index}`,
        proposals: index === 0 ? Array.from({ length: docStats.proposalCount }, () => ({})) : []
      }));

      return {
        ...doc,
        title: doc.title,
        parentId: doc.parent_id || undefined,
        sortOrder: doc.sort_order !== null && doc.sort_order !== undefined ? doc.sort_order : undefined,
        status: doc.status || 'draft',
        proposalDeadline: doc.proposal_deadline || undefined,
        owner: {
          id: doc.owner_id,
          name: doc.owner_name || null,
          email: doc.owner_email || null,
          avatar: doc.owner_avatar || null,
          type: doc.owner_type || 'user'
        },
        collaborators: docCollaborators,
        paragraphs: paragraphs,
        organization: doc.organization_id ? {
          id: doc.organization_id,
          name: doc.organization_name
        } : undefined,
        options: {
          acceptanceThreshold: doc.acceptance_threshold || 75.0,
          votingAnonymous: doc.voting_anonymous === true,
          structureProposalsEnabled: doc.structure_proposals_enabled === true,
          votingAnonymityLocked: doc.voting_anonymity_locked === true,
          voteChangeAllowed: doc.vote_change_allowed === true
        }
      };
    });

    return {
      documents: processedDocuments,
      pagination: {
        limit: validLimit,
        offset: offset,
        total: totalCount,
        hasMore: documents.length === validLimit
      }
    };
  } catch (err) {
    logger.error('Error fetching document data', { error: err.message, stack: err.stack });
    throw ApiError.database('Failed to fetch documents', { originalError: err.message });
  }
}

/**
 * List documents belonging to an organization, with full batch-fetched data.
 * @param {Object} db - Database/knex connection
 * @param {string} organizationId
 * @param {string} userId - Requesting user
 * @param {{ }} options - Reserved for future use
 * @returns {Promise<{ documents: Array, organizationId: string }>}
 */
async function listOrganizationDocuments(db, organizationId, userId, options = {}) {
  let organization;
  try {
    let orgQuery = 'SELECT id, name, is_active FROM organizations WHERE id = ?';
    organization = await TransactionManager.query(db, orgQuery, [organizationId]);
  } catch (err) {
    logger.error('Error checking organization existence', {
      error: err.message,
      organizationId,
      userId,
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
    });
    throw ApiError.database(
      'Failed to verify organization access',
      { originalError: err.message, organizationId },
      'DATABASE_ERROR'
    );
  }

  if (!organization) {
    logger.warn('Organization not found', { organizationId, userId });
    throw ApiError.notFound(
      'Organization',
      'ORGANIZATION_NOT_FOUND'
    );
  }

  if (!organization.is_active) {
    logger.warn('Organization is inactive', { organizationId, userId, organizationName: organization.name });
    throw ApiError.forbidden(
      `Organization "${organization.name || organizationId}" is currently inactive. Please contact an administrator.`,
      'ORGANIZATION_INACTIVE'
    );
  }

  const timestampConversion = `EXTRACT(EPOCH FROM d.created_at)`;
  const nullsFirst = 'NULLS FIRST';

  const includeMinutes = options.includeMinutes === true;
  const kindFilter = includeMinutes ? '' : " AND (d.document_kind IS NULL OR d.document_kind = 'standard')";
  const meetingJoin = includeMinutes
    ? `LEFT JOIN meetings m ON d.meeting_id = m.id`
    : '';
  const meetingSelect = includeMinutes
    ? ', m.minutes_finalized_at AS meeting_minutes_finalized_at, m.scheduled_at AS meeting_scheduled_at'
    : '';
  const documentsQuery = `
    SELECT d.*,
           ${buildOwnerSelect('d')},
           o.name as organization_name
           ${meetingSelect}
    FROM documents d
    ${buildOwnerJoin('d')}
    JOIN organizations o ON d.organization_id = o.id
    ${meetingJoin}
    WHERE d.ownership_type = 'organizational'
      AND d.organization_id = ?
      AND o.is_active = true
      ${kindFilter}
    ORDER BY d.parent_id ${nullsFirst}, COALESCE(d.sort_order, ${timestampConversion}) ASC, d.created_at ASC
  `;

  let documents;
  try {
    documents = await TransactionManager.queryAll(db, documentsQuery, [organizationId]);
  } catch (err) {
    logger.error('Error fetching organization documents', { error: err.message, organizationId });
    throw ApiError.database('Failed to fetch organization documents', { originalError: err.message });
  }

  logger.debug('Found organization documents', { count: documents ? documents.length : 0, organizationId });

  let organizationMembers;
  try {
    organizationMembers = await TransactionManager.queryAll(db, `
      SELECT
        u.id as user_id,
        u.name as user_name,
        u.email as user_email,
        'auto' as collaborator_type
      FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE om.organization_id = ? AND om.status = 'active'
        AND om.user_id NOT IN (SELECT id FROM organizations)
      ORDER BY u.name
    `, [organizationId]);
  } catch (err) {
    logger.error('Error fetching organization members', { error: err.message, organizationId });
    throw ApiError.database('Failed to fetch organization members', { originalError: err.message });
  }

  const documentIds = documents.map(doc => doc.id);
  const nonOrgDocumentIds = documents.filter(doc => doc.ownership_type !== 'organizational').map(doc => doc.id);
  let documentCollaborators = {};
  if (nonOrgDocumentIds.length > 0) {
    try {
      const collaborators = await TransactionManager.queryAll(db, `
        SELECT
          dc.document_id,
          dc.user_id,
          u.name as user_name,
          u.email as user_email,
          u.avatar as user_avatar
        FROM document_collaborators dc
        JOIN users u ON dc.user_id = u.id
        WHERE dc.document_id IN (${nonOrgDocumentIds.map(() => '?').join(',')})
      `, nonOrgDocumentIds);

      collaborators.forEach(collab => {
        if (!documentCollaborators[collab.document_id]) {
          documentCollaborators[collab.document_id] = [];
        }
        documentCollaborators[collab.document_id].push({
          id: collab.user_id,
          name: collab.user_name,
          email: collab.user_email,
          avatar: collab.user_avatar
        });
      });
    } catch (err) {
      logger.error('Error fetching document collaborators', { error: err.message });
      throw ApiError.database('Failed to fetch document collaborators', { originalError: err.message });
    }
  }

  let paragraphsByDoc = {};
  if (documentIds.length > 0) {
    try {
      const paragraphs = await TransactionManager.queryAll(db, `
        SELECT 
          p.id,
          p.document_id,
          p.text,
          p.order_index,
          p.heading_level,
          p.created_at
        FROM paragraphs p
        WHERE p.document_id IN (${documentIds.map(() => '?').join(',')})
        ORDER BY p.document_id, p.order_index ASC, p.created_at ASC
      `, documentIds);

      paragraphs.forEach(para => {
        if (!paragraphsByDoc[para.document_id]) {
          paragraphsByDoc[para.document_id] = [];
        }
        paragraphsByDoc[para.document_id].push(para);
      });
    } catch (err) {
      logger.error('Error fetching paragraphs', { error: err.message });
      throw ApiError.database('Failed to fetch paragraphs', { originalError: err.message });
    }
  }

  let proposalsByParagraph = {};
  const allParagraphIds = Object.values(paragraphsByDoc).flat().map(p => p.id);
  if (allParagraphIds.length > 0) {
    try {
      const { hasNewCommentSchema } = require('../utils/routeHelpers');
      const hasNewSchema = await hasNewCommentSchema(db);
      const commentCountSubquery = hasNewSchema
        ? `(SELECT COUNT(*) FROM comments c WHERE c.commentable_type = 'proposal' AND c.commentable_id = pr.id)`
        : `(SELECT COUNT(*) FROM comments c WHERE c.proposal_id = pr.id)`;

      const proposals = await TransactionManager.queryAll(db, `
        SELECT 
          pr.id,
          pr.paragraph_id,
          ${commentCountSubquery} as comment_count
        FROM proposals pr
        WHERE pr.paragraph_id IN (${allParagraphIds.map(() => '?').join(',')})
        ORDER BY pr.paragraph_id, pr.created_at ASC
      `, allParagraphIds);

      proposals.forEach(prop => {
        if (!proposalsByParagraph[prop.paragraph_id]) {
          proposalsByParagraph[prop.paragraph_id] = [];
        }
        proposalsByParagraph[prop.paragraph_id].push({
          id: prop.id,
          comments: prop.comment_count > 0 ? Array.from({ length: prop.comment_count }, (_, j) => ({
            id: `comment-${prop.id}-${j}`
          })) : []
        });
      });
    } catch (err) {
      logger.error('Error fetching proposals', { error: err.message });
      throw ApiError.database('Failed to fetch proposals', { originalError: err.message });
    }
  }

  const votingDocumentIds = documents.filter(doc => (doc.status || 'draft') === 'voting').map(doc => doc.id);
  let documentVotesByDoc = {};
  if (votingDocumentIds.length > 0) {
    try {
      const anonymousDocIds = documents.filter(doc => doc.voting_anonymous === true && (doc.status || 'draft') === 'voting').map(doc => doc.id);
      const nonAnonymousDocIds = votingDocumentIds.filter(id => !anonymousDocIds.includes(id));

      const votePromises = [];

      if (anonymousDocIds.length > 0) {
        votePromises.push(TransactionManager.queryAll(db, `
          SELECT document_id, id, vote, created_at, updated_at
          FROM document_votes
          WHERE document_id IN (${anonymousDocIds.map(() => '?').join(',')})
        `, anonymousDocIds).then(votes => {
          const grouped = {};
          votes.forEach(vote => {
            if (!grouped[vote.document_id]) {
              grouped[vote.document_id] = [];
            }
            grouped[vote.document_id].push({
              id: vote.id,
              vote: vote.vote,
              createdAt: vote.created_at,
              updatedAt: vote.updated_at
            });
          });
          return grouped;
        }));
      } else {
        votePromises.push(Promise.resolve({}));
      }

      if (nonAnonymousDocIds.length > 0) {
        votePromises.push(TransactionManager.queryAll(db, `
          SELECT dv.document_id, dv.id, dv.vote, dv.created_at, dv.updated_at,
                 u.id as user_id, u.name as user_name, u.email as user_email, u.avatar as user_avatar
          FROM document_votes dv
          JOIN users u ON dv.user_id = u.id
          WHERE dv.document_id IN (${nonAnonymousDocIds.map(() => '?').join(',')})
        `, nonAnonymousDocIds).then(votes => {
          const grouped = {};
          votes.forEach(vote => {
            if (!grouped[vote.document_id]) {
              grouped[vote.document_id] = [];
            }
            grouped[vote.document_id].push({
              id: vote.id,
              userId: vote.user_id,
              vote: vote.vote,
              createdAt: vote.created_at,
              updatedAt: vote.updated_at,
              user: {
                id: vote.user_id,
                name: vote.user_name,
                email: vote.user_email,
                avatar: vote.user_avatar
              }
            });
          });
          return grouped;
        }));
      } else {
        votePromises.push(Promise.resolve({}));
      }

      const [anonymousVotes, nonAnonymousVotes] = await Promise.all(votePromises);
      documentVotesByDoc = { ...anonymousVotes };
      Object.keys(nonAnonymousVotes).forEach(docId => {
        documentVotesByDoc[docId] = nonAnonymousVotes[docId];
      });
    } catch (err) {
      logger.error('Error fetching document votes', { error: err.message });
      throw ApiError.database('Failed to fetch document votes', { originalError: err.message });
    }
  }

  const processedDocuments = documents.map(doc => {
    let collaborators = [];
    if (doc.ownership_type === 'organizational') {
      collaborators = organizationMembers || [];
    } else {
      collaborators = documentCollaborators[doc.id] || [];
    }

    const paragraphs = paragraphsByDoc[doc.id] || [];

    const formattedParagraphs = paragraphs.map(para => {
      const proposals = proposalsByParagraph[para.id] || [];
      return {
        id: para.id,
        text: para.text || '',
        orderIndex: para.order_index,
        headingLevel: para.heading_level,
        createdAt: para.created_at,
        proposals: proposals
      };
    });

    const documentVotes = documentVotesByDoc[doc.id] || [];

    const result = {
      ...doc,
      parentId: doc.parent_id || undefined,
      sortOrder: doc.sort_order !== null && doc.sort_order !== undefined ? doc.sort_order : undefined,
      status: doc.status || 'draft',
      proposalDeadline: doc.proposal_deadline || undefined,
      votingDeadline: doc.voting_deadline || undefined,
      owner: {
        id: doc.owner_id,
        name: doc.owner_name || null,
        email: doc.owner_email || null,
        avatar: doc.owner_avatar || null,
        type: doc.owner_type || 'user'
      },
      collaborators: collaborators,
      organization: doc.organization_id ? {
        id: doc.organization_id,
        name: doc.organization_name
      } : null,
      options: {
        acceptanceThreshold: doc.acceptance_threshold,
        votingAnonymous: doc.voting_anonymous === true,
        votingAnonymityLocked: doc.voting_anonymity_locked === true,
        voteChangeAllowed: doc.vote_change_allowed === true,
        structureProposalsEnabled: doc.structure_proposals_enabled === true
      },
      documentVotes: documentVotes,
      paragraphs: formattedParagraphs
    };
    result.documentKind = doc.document_kind || undefined;
    result.meetingId = doc.meeting_id || undefined;
    if (doc.meeting_minutes_finalized_at !== undefined) {
      result.minutesFinalizedAt = doc.meeting_minutes_finalized_at ?? null;
    }
    if (doc.meeting_scheduled_at !== undefined) {
      result.meetingScheduledAt = doc.meeting_scheduled_at || undefined;
    }
    return result;
  });

  return {
    documents: processedDocuments,
    organizationId: organizationId
  };
}

// --- Agreed view (extracted from GET /:id/agreed) ---

/**
 * Get the agreed (accepted-changes) view for a document.
 * @param {Object} db - Database/knex connection
 * @param {string} documentId
 * @param {string} userId - Requesting user (for access check)
 * @param {{ includePending?: boolean, view?: 'accepted' | 'amended' }} options
 * @returns {Promise<{ document: Object }>}
 */

/** Winning amendment proposal for a paragraph: must have votes and meet acceptance threshold. */
async function resolveThresholdMetAmendmentForParagraph(
  db,
  paragraphId,
  document,
  { eligibleVoters, calculationMethod }
) {
  const acceptanceThreshold = document.acceptance_threshold != null ? document.acceptance_threshold : 75.0;
  if (!eligibleVoters || eligibleVoters <= 0) return null;

  const proposals = await TransactionManager.queryAll(db, `
    SELECT pr.id, pr.text, pr.type, pr.heading_level, pr.created_at,
      u.name as user_name, u.email as user_email, u.avatar as user_avatar,
      COUNT(CASE WHEN v.vote = 'PRO' THEN 1 END) as pro_votes,
      COUNT(v.id) as total_votes
    FROM proposals pr
    LEFT JOIN users u ON pr.user_id = u.id
    LEFT JOIN votes v ON v.proposal_id = pr.id
    WHERE pr.paragraph_id = ?
      AND NOT EXISTS (SELECT 1 FROM history h WHERE h.proposal_id = pr.id)
    GROUP BY pr.id, pr.text, pr.type, pr.heading_level, pr.created_at, u.name, u.email, u.avatar
  `, [paragraphId]);

  const valid = proposals
    .filter((p) => Number(p.total_votes) > 0)
    .map((p) => ({
      ...p,
      approvalPercentage: UnifiedVotingService.calculateApprovalPercentage({
        proVotes: Number(p.pro_votes) || 0,
        totalVotes: Number(p.total_votes) || 0,
        totalEligible: eligibleVoters,
        calculationMethod,
      }),
    }))
    .filter((p) => p.approvalPercentage >= acceptanceThreshold);

  if (valid.length === 0) return null;

  valid.sort((a, b) => {
    if (b.approvalPercentage !== a.approvalPercentage) {
      return b.approvalPercentage - a.approvalPercentage;
    }
    if (Number(b.pro_votes) !== Number(a.pro_votes)) {
      return Number(b.pro_votes) - Number(a.pro_votes);
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return valid[0];
}

async function getAgreedView(db, documentId, userId, options = {}) {
  const includePending = !!options.includePending;
  const view = options.view || (includePending ? 'amended' : 'accepted');

  const accessQuery = `
    SELECT d.*,
           ${buildOwnerSelect('d')},
           o.name as organization_name
    FROM documents d
    ${buildOwnerJoin('d')}
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
    LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    LEFT JOIN organizations o ON d.organization_id = o.id AND o.is_active = true
    WHERE d.id = ?
      AND ${buildAccessCheck('d')}
  `;

  const document = await TransactionManager.query(db, accessQuery, [userId, userId, documentId, userId, userId]);

  if (!document) {
    throw ApiError.notFound('Document', 'DOCUMENT_NOT_FOUND_OR_ACCESS_DENIED');
  }

  const showAmendedPreview = view === 'amended' && (
    document.amendments_open === 1
    || document.amendment_adoption_vote_id
    || includePending
  );

  const agreedViewQuery = `
    SELECT
      p.*,
      (
        SELECT json_agg(
          json_build_object(
            'id', h.id,
            'paragraph_id', h.paragraph_id,
            'user_id', h.user_id,
            'old_text', h.old_text,
            'new_text', h.new_text,
            'approval_percentage', h.approval_percentage,
            'proposal_id', h.proposal_id,
            'created_at', h.created_at,
            'accepted_at', COALESCE(h.accepted_at, h.created_at),
            'heading_level', h.heading_level,
            'user_name', hu.name,
            'user_email', hu.email,
            'user_avatar', hu.avatar,
            'proposal_type', pr_h.type
          ) ORDER BY h.created_at DESC
        )
        FROM history h
        LEFT JOIN users hu ON h.user_id = hu.id
        LEFT JOIN proposals pr_h ON h.proposal_id = pr_h.id
        WHERE h.paragraph_id = p.id
          AND h.approval_percentage IS NOT NULL
          AND h.approval_percentage >= ?
      ) as history_json
    FROM paragraphs p
    WHERE p.document_id = ?
    ORDER BY p.order_index ASC, p.created_at ASC
  `;

  const threshold = document.acceptance_threshold != null ? document.acceptance_threshold : 75.0;
  const rows = await TransactionManager.queryAll(db, agreedViewQuery, [threshold, documentId]);

  const paragraphData = rows.map(row => {
    let history = [];
    if (row.history_json && row.history_json !== '[null]' && row.history_json !== 'null') {
      try {
        const rawHistory = typeof row.history_json === 'string'
          ? safeJsonParse(row.history_json, [])
          : (row.history_json || []);

        history = (Array.isArray(rawHistory) ? rawHistory : []).filter(entry => {
          if (!entry || entry === null || typeof entry !== 'object') return false;
          return entry.id != null;
        }).map(entry => {
          try {
            return {
              id: entry.id,
              paragraph_id: entry.paragraph_id,
              paragraphId: entry.paragraph_id,
              userId: entry.user_id,
              oldText: entry.old_text,
              newText: entry.new_text,
              text: entry.new_text,
              approvalPercentage: entry.approval_percentage != null ? Number(entry.approval_percentage) : null,
              proposalId: entry.proposal_id,
              acceptedAt: entry.accepted_at || entry.acceptedAt || entry.created_at,
              createdAt: entry.created_at,
              type: entry.proposal_type || 'BODY',
              heading_level: entry.heading_level,
              user: {
                id: entry.user_id,
                name: entry.user_name,
                email: entry.user_email,
                avatar: entry.user_avatar
              }
            };
          } catch (entryError) {
            logger.warn('Failed to parse history entry', {
              error: entryError.message,
              documentId,
              paragraphId: row.id,
              entryId: entry?.id
            });
            return null;
          }
        }).filter(entry => entry !== null && entry.approvalPercentage != null && entry.approvalPercentage >= threshold);
      } catch (historyError) {
        logger.error('Failed to parse history JSON', {
          error: historyError.message,
          documentId,
          paragraphId: row.id
        });
        history = [];
      }
    }

    return {
      ...row,
      order: row.order_index,
      heading_level: row.heading_level,
      proposals: [],
      suggestions: [],
      history
    };
  });

  if (showAmendedPreview && (document.amendments_open === 1 || document.amendment_adoption_vote_id)) {
    const VoterManager = require('../modules/voting');
    const eligibleVoters = await VoterManager.getEligibleVoterCount(db, documentId);
    let calculationMethod = 'all_members';
    if (document.organization_id) {
      try {
        const governanceModule = require('../routes/governance');
        const governanceRules = await governanceModule.getGovernanceRules(db, document.organization_id);
        calculationMethod = governanceRules?.thresholdCalculationMethod || 'all_members';
      } catch (govErr) {
        logger.debug('Could not fetch governance rules for amended agreed view', { error: govErr.message, documentId });
      }
    }

    for (const para of paragraphData) {
      const pendingProposal = await resolveThresholdMetAmendmentForParagraph(db, para.id, document, {
        eligibleVoters,
        calculationMethod,
      });
      if (!pendingProposal) continue;

      const syntheticEntry = {
        id: `pending-${pendingProposal.id}`,
        paragraph_id: para.id,
        paragraphId: para.id,
        userId: null,
        oldText: null,
        newText: pendingProposal.text,
        text: pendingProposal.text,
        approvalPercentage: pendingProposal.approvalPercentage,
        proposalId: pendingProposal.id,
        acceptedAt: null,
        createdAt: null,
        type: pendingProposal.type || 'BODY',
        heading_level: pendingProposal.heading_level,
        isPending: true,
        user: {
          id: null,
          name: pendingProposal.user_name,
          email: pendingProposal.user_email,
          avatar: pendingProposal.user_avatar
        }
      };
      para.history = [syntheticEntry, ...(para.history || [])];
    }
  }

  let collaborators = [];
  if (document.ownership_type === 'organizational' && document.organization_id) {
    const orgCollabQuery = `
      SELECT
        u.id as user_id,
        u.name as user_name,
        u.email as user_email,
        u.avatar as user_avatar
      FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE om.organization_id = ? AND om.status = 'active'
        AND om.user_id NOT IN (SELECT id FROM organizations)
      ORDER BY u.name
    `;
    const orgCollaborators = await TransactionManager.queryAll(db, orgCollabQuery, [document.organization_id]);
    collaborators = orgCollaborators.map(collab => ({
      id: collab.user_id,
      document_id: documentId,
      user_id: collab.user_id,
      created_at: new Date().toISOString(),
      user: {
        id: collab.user_id,
        name: collab.user_name,
        email: collab.user_email,
        avatar: collab.user_avatar
      }
    }));
  } else {
    const collabQuery = `
      SELECT
        dc.id as collaborator_id,
        dc.document_id,
        dc.user_id,
        dc.created_at,
        u.name as user_name,
        u.email as user_email,
        u.avatar as user_avatar
      FROM document_collaborators dc
      JOIN users u ON dc.user_id = u.id
      WHERE dc.document_id = ?
        AND dc.user_id NOT IN (SELECT id FROM organizations)
    `;
    const docCollaborators = await TransactionManager.queryAll(db, collabQuery, [documentId]);
    collaborators = docCollaborators.map(collab => ({
      id: collab.collaborator_id,
      document_id: collab.document_id,
      user_id: collab.user_id,
      created_at: collab.created_at,
      user: {
        id: collab.user_id,
        name: collab.user_name,
        email: collab.user_email,
        avatar: collab.user_avatar
      }
    }));
  }

  return {
    document: {
      ...document,
      parentId: document.parent_id || undefined,
      status: document.status || 'draft',
      proposalDeadline: document.proposal_deadline || undefined,
      amendmentsOpen: document.amendments_open === 1,
      amendmentsOpenedAt: document.amendments_opened_at || undefined,
      ...mapDocumentLifecycleFields(document),
      owner: {
        id: document.owner_id,
        name: document.owner_name || null,
        email: document.owner_email || null,
        avatar: document.owner_avatar || null,
        type: document.owner_type || 'user'
      },
      collaborators,
      paragraphs: paragraphData,
      options: {
        acceptanceThreshold: document.acceptance_threshold != null ? document.acceptance_threshold : 75.0,
        votingAnonymous: document.voting_anonymous === true,
        votingAnonymityLocked: document.voting_anonymity_locked === true,
        voteChangeAllowed: document.vote_change_allowed === true
      }
    }
  };
}

// --- Document deletion (extracted from DELETE /:id) ---

/**
 * Delete a document and all related records in a transaction.
 * Caller is responsible for permission checks and WebSocket broadcast.
 * @param {Object} db - Database/knex connection
 * @param {string} documentId
 * @param {string} userId - For logging
 * @returns {Promise<{ success: true, childCount: number }>}
 */
async function deleteDocument(db, documentId, userId) {
  const document = await TransactionManager.query(db, `
    SELECT
      id,
      owner_id,
      ownership_type,
      organization_id,
      parent_id,
      (SELECT COUNT(*) FROM documents WHERE parent_id = ?) as child_count
    FROM documents
    WHERE id = ?
  `, [documentId, documentId]);

  if (!document) {
    throw ApiError.notFound('Document', 'DOCUMENT_NOT_FOUND');
  }

  if (document.ownership_type === 'organizational') {
    throw ApiError.forbidden(
      'Organizational documents cannot be deleted directly. Please propose deletion through the governance process.',
      'ORGANIZATIONAL_DELETION_REQUIRES_PROPOSAL'
    );
  }

  if (document.owner_id !== userId) {
    throw ApiError.forbidden('Only document owner can delete document', 'NOT_DOCUMENT_OWNER');
  }

  let childCount = 0;
  await TransactionManager.executeInTransaction(db, async (trx) => {
    const childDocuments = document.child_count > 0
      ? await TransactionManager.queryAll(trx, 'SELECT id FROM documents WHERE parent_id = ?', [documentId])
      : [];
    childCount = childDocuments.length;

    for (const child of childDocuments) {
      await TransactionManager.query(trx, 'UPDATE documents SET parent_id = NULL WHERE id = ?', [child.id]);
    }

    await TransactionManager.query(trx, `
      DELETE FROM structure_proposal_votes
      WHERE structure_proposal_id IN (
        SELECT id FROM structure_proposals WHERE document_id = ?
      )
    `, [documentId]);

    await TransactionManager.query(trx, 'DELETE FROM structure_proposals WHERE document_id = ?', [documentId]);

    await TransactionManager.query(trx, `
      DELETE FROM votes
      WHERE proposal_id IN (
        SELECT id FROM proposals WHERE paragraph_id IN (
          SELECT id FROM paragraphs WHERE document_id = ?
        )
      )
    `, [documentId]);

    await TransactionManager.query(trx, `
      DELETE FROM comments
      WHERE (
        (commentable_type = 'proposal' AND commentable_id IN (
          SELECT id FROM proposals WHERE paragraph_id IN (
            SELECT id FROM paragraphs WHERE document_id = ?
          )
        ))
        OR
        (commentable_type = 'structure_proposal' AND commentable_id IN (
          SELECT id FROM structure_proposals WHERE document_id = ?
        ))
      )
    `, [documentId, documentId]);

    await TransactionManager.query(trx, `
      DELETE FROM history
      WHERE paragraph_id IN (
        SELECT id FROM paragraphs WHERE document_id = ?
      )
    `, [documentId]);

    await TransactionManager.query(trx, `
      DELETE FROM proposals
      WHERE paragraph_id IN (
        SELECT id FROM paragraphs WHERE document_id = ?
      )
    `, [documentId]);

    await TransactionManager.query(trx, 'DELETE FROM paragraphs WHERE document_id = ?', [documentId]);

    await TransactionManager.query(trx, 'DELETE FROM document_collaborators WHERE document_id = ?', [documentId]);

    await TransactionManager.query(trx, 'DELETE FROM documents WHERE id = ?', [documentId]);

    logger.info('Document deleted successfully', {
      documentId,
      userId,
      childCount: childDocuments.length
    });
  });

  return { success: true, childCount };
}

// --- Voting status (extracted from GET /:id/voting-status) ---

/**
 * Get voting status for a document (breakdown, quorum, user vote).
 * @param {Object} db - Database/knex connection
 * @param {string} documentId
 * @param {string} userId
 * @returns {Promise<{ document: Object, voting: Object }>}
 */
async function getDocumentVotingStatus(db, documentId, userId) {
  const document = await TransactionManager.query(db, `
    SELECT d.*, o.name as organization_name
    FROM documents d
    LEFT JOIN organizations o ON d.organization_id = o.id
    WHERE d.id = ?
  `, [documentId]);

  if (!document) {
    throw ApiError.notFound('Document', 'DOCUMENT_NOT_FOUND');
  }

  if (document.ownership_type !== 'organizational') {
    throw ApiError.validation('Document is not organizational', null, 'NOT_ORGANIZATIONAL_DOCUMENT');
  }

  const VoterManager = require('../modules/voting');
  const canVote = await VoterManager.canUserVote(db, documentId, userId);

  const userVoteRow = await TransactionManager.query(db, `
    SELECT vote FROM document_votes WHERE document_id = ? AND user_id = ?
  `, [documentId, userId]);
  const userVote = userVoteRow?.vote || null;

  const votes = await TransactionManager.queryAll(db, `
    SELECT vote, COUNT(*) as count
    FROM document_votes
    WHERE document_id = ?
    GROUP BY vote
  `, [documentId]);

  const voteBreakdown = { PRO: 0, NEUTRAL: 0, CONTRA: 0 };
  votes.forEach(v => {
    const count = typeof v.count === 'number' ? v.count : (parseInt(v.count, 10) || 0);
    if (v.vote && ['PRO', 'NEUTRAL', 'CONTRA'].includes(v.vote)) {
      voteBreakdown[v.vote] = count;
    }
  });

  const totalVotes = Object.values(voteBreakdown).reduce((sum, count) => sum + count, 0);
  const approvalRate = totalVotes > 0 ? (voteBreakdown.PRO / totalVotes) * 100 : 0;

  let eligibleVoters = [];
  try {
    eligibleVoters = await VoterManager.getEligibleVoters(db, documentId);
  } catch (voterError) {
    logger.error('Error getting eligible voters', { error: voterError.message, documentId });
    eligibleVoters = [];
  }

  let quorumPercentage = 0.3;
  if (document.organization_id) {
    try {
      const { transformRulesToCamelCase } = require('../utils/governanceFieldMapping');
      const rulesRaw = await GovernanceRulesService.getGovernanceRules(db, document.organization_id);
      const governanceRules = rulesRaw ? transformRulesToCamelCase(rulesRaw) : null;
      if (governanceRules?.defaultQuorumPercentage != null) {
        quorumPercentage = governanceRules.defaultQuorumPercentage;
      }
    } catch (govErr) {
      logger.warn('Could not fetch governance rules for voting-status quorum, using default 30%', { error: govErr.message, documentId });
    }
  }
  const totalEligible = eligibleVoters.length;
  const quorumRequired = Math.max(1, Math.ceil(totalEligible * quorumPercentage));
  const quorumMet = totalVotes >= quorumRequired;

  const DocumentStatusManager = require('../modules/document-status');
  const finalizationDeferredUntilDeadline = document.status === 'voting'
    && DocumentStatusManager.shouldDeferDocumentFinalization(document);

  const UnifiedVotingService = require('../modules/unified-voting');
  const acceptanceThreshold = document.acceptance_threshold || 75.0;
  const approvalResult = await UnifiedVotingService.checkApproval({
    db,
    organizationId: document.organization_id || null,
    proVotes: voteBreakdown.PRO,
    totalVotes,
    totalEligible,
    acceptanceThreshold,
    minVotersRequired: quorumRequired
  });
  const wouldApproveIfFinalized = approvalResult.approved;

  return {
    document: {
      id: document.id,
      title: document.title,
      status: document.status,
      organizationName: document.organization_name,
      proposalDeadline: document.proposal_deadline,
      votingDeadline: document.voting_deadline,
      votingStartedAt: document.voting_started_at,
      acceptanceThreshold: document.acceptance_threshold,
      minVotersRequired: document.min_voters_required,
      votingAnonymous: !!document.voting_anonymous,
      voteChangeAllowed: !!document.vote_change_allowed,
      adoptedAt: document.adopted_at || null
    },
    voting: {
      canVote,
      userVote,
      totalVotes,
      voteBreakdown,
      approvalRate: Math.round(approvalRate * 10) / 10,
      totalEligibleVoters: totalEligible,
      quorumMet,
      quorumRequired,
      finalizationDeferredUntilDeadline,
      canFinalizeEarly: !finalizationDeferredUntilDeadline,
      wouldApproveIfFinalized
    }
  };
}

// --- Batch document fetch (extracted from POST /batch) ---

/**
 * Fetch multiple documents by IDs with paragraph history. Checks access per-document.
 * @param {Object} db - Database/knex connection
 * @param {string[]} documentIds - Array of document IDs (pre-validated, de-duped)
 * @param {string} userId
 * @returns {Promise<{ documents: Array, notFound: string[], errors: Object }>}
 */
async function getDocumentsBatch(db, documentIds, userId) {
  const uniqueDocumentIds = [...new Set(documentIds)];

  const placeholders = uniqueDocumentIds.map(() => '?').join(',');
  const accessQuery = `
    SELECT d.id, d.title
    FROM documents d
    ${buildOwnerJoin('d')}
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
    LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    LEFT JOIN organizations o ON d.organization_id = o.id AND o.is_active = true
    WHERE d.id IN (${placeholders})
      AND ${buildAccessCheck('d')}
  `;

  const accessParams = [userId, userId, ...uniqueDocumentIds, userId, userId];

  let accessibleDocuments;
  try {
    accessibleDocuments = await TransactionManager.queryAll(db, accessQuery, accessParams);
  } catch (err) {
    logger.error('Error fetching accessible documents in batch', { error: err.message, userId, documentCount: uniqueDocumentIds.length });
    throw new ApiError(500, 'Failed to fetch documents', 'DATABASE_ERROR', { details: err.message });
  }

  const accessibleDocumentIds = new Set(accessibleDocuments.map(doc => doc.id));
  const notFound = uniqueDocumentIds.filter(id => !accessibleDocumentIds.has(id));

  if (accessibleDocuments.length === 0) {
    return { documents: [], notFound, errors: {} };
  }

  const accessibleIds = accessibleDocuments.map(doc => doc.id);
  const accessiblePlaceholders = accessibleIds.map(() => '?').join(',');

  let paragraphsQuery = `
    SELECT
      p.document_id,
      p.id as paragraph_id,
      p.text,
      p.title as paragraph_title,
      p.order_index,
      (
        SELECT json_agg(
          json_build_object(
            'id', h.id,
            'paragraph_id', h.paragraph_id,
            'user_id', h.user_id,
            'old_text', h.old_text,
            'new_text', h.new_text,
            'text', h.new_text,
            'approval_percentage', h.approval_percentage,
            'proposal_id', h.proposal_id,
            'created_at', h.created_at,
            'accepted_at', COALESCE(h.accepted_at, h.created_at),
            'acceptedAt', COALESCE(h.accepted_at, h.created_at),
            'heading_level', h.heading_level,
            'user_name', hu.name,
            'user_email', hu.email,
            'user_avatar', hu.avatar,
            'proposal_type', pr_h.type,
            'type', COALESCE(pr_h.type, 'BODY'),
            'user', json_build_object(
              'id', hu.id,
              'name', hu.name,
              'email', hu.email,
              'avatar', hu.avatar
            )
          ) ORDER BY h.created_at DESC
        )
        FROM history h
        LEFT JOIN users hu ON h.user_id = hu.id
        LEFT JOIN proposals pr_h ON h.proposal_id = pr_h.id
        WHERE h.paragraph_id = p.id
      ) as history_json
    FROM paragraphs p
    WHERE p.document_id IN (${accessiblePlaceholders})
    ORDER BY p.document_id, p.order_index ASC, p.created_at ASC
  `;
  let paragraphRows;
  try {
    paragraphRows = await TransactionManager.queryAll(db, paragraphsQuery, accessibleIds);
  } catch (err) {
    logger.error('Error fetching paragraphs in batch', { error: err.message, documentCount: accessibleIds.length });
    throw new ApiError(500, 'Failed to fetch document content', 'DATABASE_ERROR', { details: err.message });
  }

  const paragraphsByDocument = new Map();
  paragraphRows.forEach(row => {
    if (!paragraphsByDocument.has(row.document_id)) {
      paragraphsByDocument.set(row.document_id, []);
    }
    paragraphsByDocument.get(row.document_id).push(row);
  });

  const documents = accessibleDocuments.map(doc => {
    const docParagraphRows = paragraphsByDocument.get(doc.id) || [];

    const paragraphs = docParagraphRows.map(row => {
      let history = [];
      if (row.history_json && row.history_json !== '[null]' && row.history_json !== 'null') {
        let rawHistory;
        rawHistory = typeof row.history_json === 'string' ? safeJsonParse(row.history_json, []) : (row.history_json || []);
        history = (Array.isArray(rawHistory) ? rawHistory : []).filter(entry => entry !== null && entry.id !== null).map(entry => ({
          id: entry.id,
          paragraph_id: entry.paragraph_id,
          paragraphId: entry.paragraph_id,
          userId: entry.user_id,
          user_id: entry.user_id,
          oldText: entry.old_text,
          newText: entry.new_text,
          text: entry.new_text || entry.text,
          approvalPercentage: entry.approval_percentage != null ? Number(entry.approval_percentage) : 100,
          proposalId: entry.proposal_id,
          acceptedAt: entry.accepted_at || entry.acceptedAt || entry.created_at,
          createdAt: entry.created_at,
          type: entry.type || entry.proposal_type || 'BODY',
          heading_level: entry.heading_level,
          user: entry.user || {
            id: entry.user_id,
            name: entry.user_name,
            email: entry.user_email,
            avatar: entry.user_avatar
          }
        }));
      }

      return {
        id: row.paragraph_id,
        text: row.text,
        title: row.paragraph_title,
        order: row.order_index,
        history
      };
    });

    return {
      id: doc.id,
      title: doc.title,
      paragraphs
    };
  });

  return { documents, notFound, errors: {} };
}

class DocumentService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Finalize voting for a document. Checks permissions, status, and delegates to DocumentScheduler.
   * @param {string} documentId
   * @param {string} userId
   * @param {string} userRole
   * @throws {ApiError}
   */
  async finalizeVoting(documentId, userId, userRole) {
    const db = this.db;
    const document = await TransactionManager.query(db, 'SELECT owner_id, status, organization_id, ownership_type FROM documents WHERE id = ?', [documentId]);

    if (!document) {
      throw ApiError.notFound('Document');
    }

    const isOwner = document.ownership_type !== 'organizational' && document.owner_id === userId;
    const isAdmin = userRole === 'admin';
    const isRep = document.organization_id
      ? await isRepresentative(db, userId, document.organization_id)
      : false;
    let isMember = false;
    if (document.ownership_type === 'organizational') {
      const memberRow = await TransactionManager.query(db, `
        SELECT id FROM organization_members
        WHERE organization_id = ? AND user_id = ? AND status = 'active'
      `, [document.organization_id, userId]);
      isMember = !!memberRow;
    }

    if (!isOwner && !isAdmin && !isRep && !isMember) {
      throw ApiError.forbidden(
        'Only document owner, organization member/representative, or admin can perform this action',
        null,
        'PERMISSION_DENIED'
      );
    }

    if (document.ownership_type === 'organizational' && document.organization_id && !isAdmin && !isRep) {
      const { transformRulesToCamelCase } = require('../utils/governanceFieldMapping');
      const rulesRaw = await GovernanceRulesService.getGovernanceRules(db, document.organization_id);
      const rules = rulesRaw ? transformRulesToCamelCase(rulesRaw) : null;
      const repApprovalRequired = rules?.representativeApprovalRequired ?? rules?.representative_approval_required;
      if (repApprovalRequired === true || repApprovalRequired === 1) {
        throw ApiError.forbidden(
          'Only a representative can complete voting when representative approval is required.',
          null,
          'REPRESENTATIVE_APPROVAL_REQUIRED'
        );
      }
    }

    if (document.status === 'agreed') {
      if (document.ownership_type === 'organizational') {
        try {
          const votesRouter = require('../routes/votes');
          if (typeof votesRouter.reEvaluateAllProposalsForDocument === 'function') {
            await votesRouter.reEvaluateAllProposalsForDocument(db, documentId);
          }
        } catch (applyErr) {
          logger.warn('Failed to reconcile organizational proposals on already-agreed document', {
            error: applyErr.message,
            documentId
          });
        }
      }
      return;
    }

    if (document.status !== 'voting') {
      throw ApiError.validation('Document must be in voting status to finalize', null, 'DOCUMENT_NOT_IN_VOTING_STATUS');
    }

    const DocumentStatusManager = require('../modules/document-status');
    const allowEarlyComplete = isOwner || isAdmin || isRep;
    const canFinalize = await DocumentStatusManager.canFinalizeVoting(db, documentId, { allowEarlyComplete });

    if (!canFinalize.canFinalize) {
      let errorCode = 'CANNOT_FINALIZE_VOTING';
      let errorMessage = canFinalize.reason;
      if (canFinalize.reason === 'participation_threshold_not_met') {
        errorCode = 'PARTICIPATION_THRESHOLD_NOT_MET';
        errorMessage = 'Participation threshold must be met before completing the vote';
      } else if (canFinalize.reason === 'voting_open_until_deadline') {
        errorCode = 'VOTING_OPEN_UNTIL_DEADLINE';
        errorMessage = 'Voting remains open until the deadline when vote changes are allowed';
      }
      throw ApiError.validation(errorMessage, null, errorCode);
    }

    const doc = await TransactionManager.query(db, `
      SELECT id, title, owner_id, organization_id, acceptance_threshold, min_voters_required
      FROM documents WHERE id = ?
    `, [documentId]);

    const DocumentScheduler = require('../modules/scheduler');
    const scheduler = new DocumentScheduler(db);
    await scheduler.finalizeVoting(doc);
  }

  /**
   * Get document with full details (access check, paragraphs, proposals, comments, collaborators, userUpvoted).
   * @param {string} documentId
   * @param {string} userId
   * @returns {Promise<Object>} Document object for response
   * @throws {ApiError}
   */
  async getDocumentWithFullDetails(documentId, userId) {
    const db = this.db;
    const accessQuery = `
    SELECT d.*,
           ${buildOwnerSelect('d')},
           m.minutes_finalized_at AS meeting_minutes_finalized_at,
           m.scheduled_at AS meeting_scheduled_at
    FROM documents d
    ${buildOwnerJoin('d')}
    LEFT JOIN meetings m ON d.meeting_id = m.id
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
    LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    LEFT JOIN organizations o ON d.organization_id = o.id AND o.is_active = true
    WHERE d.id = ?
      AND ${buildAccessCheck('d')}
  `;

    let document;
    try {
      document = await TransactionManager.query(db, accessQuery, [userId, userId, documentId, userId, userId]);
    } catch (err) {
      logger.error('Error fetching document', { error: err.message, documentId, userId });
      throw new ApiError(500, 'Failed to fetch document', 'DATABASE_ERROR', { details: err.message });
    }

    if (!document) {
      throw new ApiError(404, 'Document not found or access denied', 'NOT_FOUND');
    }

    const isAnonymous = !!document.voting_anonymous;

    let hasNewCommentSchema = false;
    try {
      const columnCheck = await TransactionManager.queryAll(db, `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'comments' AND column_name = 'commentable_type'
      `);
      hasNewCommentSchema = columnCheck && columnCheck.length > 0;
    } catch (err) {
      logger.warn('Could not check comments table schema, assuming new schema', { error: err.message });
      hasNewCommentSchema = true;
    }

    const commentCountSubquery = hasNewCommentSchema
      ? `(SELECT COUNT(*) FROM comments WHERE commentable_type = 'proposal' AND commentable_id = pr.id AND deleted_at IS NULL)`
      : `(SELECT COUNT(*) FROM comments WHERE proposal_id = pr.id AND deleted_at IS NULL)`;

    // Single canonical query in PostgreSQL dialect; convert to SQLite when needed
    const commentsSubqueryPg = hasNewCommentSchema
      ? `(
        SELECT json_agg(
          json_build_object(
            'id', c.id,
            'commentable_type', c.commentable_type,
            'commentable_id', c.commentable_id,
            'user_id', c.user_id,
            'text', c.text,
            'parent_id', c.parent_id,
            'created_at', c.created_at,
            'updated_at', c.updated_at,
            'deleted_at', c.deleted_at,
            'edited_at', c.edited_at,
            'edit_count', c.edit_count,
            'user_name', cu.name,
            'user_email', cu.email,
            'user_avatar', cu.avatar,
            'parent_user_id', pc.user_id,
            'parent_user_name', pcu.name,
            'upvote_count', COALESCE(c.upvote_count, 0)
          ) ORDER BY c.created_at ASC
        )
        FROM (
          SELECT c.*
          FROM comments c
          WHERE c.commentable_type = 'proposal' AND c.commentable_id = pr.id AND c.deleted_at IS NULL
        ) c
        LEFT JOIN users cu ON c.user_id = cu.id
        LEFT JOIN comments pc ON c.parent_id = pc.id
        LEFT JOIN users pcu ON pc.user_id = pcu.id
      )`
      : `(
        SELECT json_agg(
          json_build_object(
            'id', c.id,
            'commentable_type', 'proposal',
            'commentable_id', c.proposal_id,
            'user_id', c.user_id,
            'text', c.text,
            'parent_id', c.parent_id,
            'created_at', c.created_at,
            'updated_at', c.updated_at,
            'deleted_at', c.deleted_at,
            'edited_at', c.edited_at,
            'edit_count', c.edit_count,
            'user_name', cu.name,
            'user_email', cu.email,
            'user_avatar', cu.avatar,
            'parent_user_id', pc.user_id,
            'parent_user_name', pcu.name,
            'upvote_count', COALESCE(c.upvote_count, 0)
          ) ORDER BY c.created_at ASC
        )
        FROM (
          SELECT c.*
          FROM comments c
          WHERE c.proposal_id = pr.id AND c.deleted_at IS NULL
        ) c
        LEFT JOIN users cu ON c.user_id = cu.id
        LEFT JOIN comments pc ON c.parent_id = pc.id
        LEFT JOIN users pcu ON pc.user_id = pcu.id
      )`;

    let optimizedParagraphsQuery = `
      SELECT p.*,
        (
          SELECT json_agg(
            json_build_object(
              'id', pr.id, 'user_id', pr.user_id, 'text', pr.text, 'type', pr.type, 'heading_level', pr.heading_level,
              'created_at', pr.created_at, 'updated_at', pr.updated_at, 'user_name', pu.name, 'user_email', pu.email, 'user_avatar', pu.avatar,
              'votes', (SELECT json_agg(json_build_object('id', v.id, 'user_id', v.user_id, 'vote', v.vote, 'created_at', v.created_at, 'user_name', vu.name, 'user_email', vu.email, 'user_avatar', vu.avatar) ORDER BY v.created_at ASC) FROM votes v LEFT JOIN users vu ON v.user_id = vu.id WHERE v.proposal_id = pr.id),
              'comments', ${commentsSubqueryPg},
              'comment_count', ${commentCountSubquery}
            ) ORDER BY pr.created_at ASC
          )
          FROM proposals pr
          LEFT JOIN users pu ON pr.user_id = pu.id
          WHERE pr.paragraph_id = p.id
        ) as proposals_json,
        (
          SELECT json_agg(
            json_build_object('id', h.id, 'paragraph_id', h.paragraph_id, 'user_id', h.user_id, 'old_text', h.old_text, 'new_text', h.new_text, 'approval_percentage', h.approval_percentage, 'proposal_id', h.proposal_id, 'created_at', h.created_at, 'accepted_at', COALESCE(h.accepted_at, h.created_at), 'heading_level', h.heading_level, 'user_name', hu.name, 'user_email', hu.email, 'user_avatar', hu.avatar, 'proposal_type', pr_h.type) ORDER BY h.created_at DESC
          )
          FROM history h
          LEFT JOIN users hu ON h.user_id = hu.id
          LEFT JOIN proposals pr_h ON h.proposal_id = pr_h.id
          WHERE h.paragraph_id = p.id
        ) as history_json
      FROM paragraphs p
      WHERE p.document_id = ?
      ORDER BY p.order_index ASC, p.created_at ASC
    `;
    let rows;
    try {
      rows = await TransactionManager.queryAll(db, optimizedParagraphsQuery, [documentId]);
    } catch (err) {
      logger.error('Error fetching paragraphs', { error: err.message, documentId });
      throw new ApiError(500, 'Failed to fetch document content', 'DATABASE_ERROR', { details: err.message, code: err.code });
    }

    const paragraphData = rows.map(row => {
      let proposals = [];
      if (row.proposals_json && row.proposals_json !== '[null]' && row.proposals_json !== 'null') {
        let rawProposals = typeof row.proposals_json === 'string' ? safeJsonParse(row.proposals_json, []) : (row.proposals_json || []);
        proposals = (Array.isArray(rawProposals) ? rawProposals : []).filter(prop => prop !== null && prop.id !== null).map(prop => {
          let votes = [];
          if (prop.votes) {
            let rawVotes = typeof prop.votes === 'string' ? safeJsonParse(prop.votes, []) : (prop.votes || []);
            votes = (Array.isArray(rawVotes) ? rawVotes : []).map(vote => {
              const voteData = { id: vote.id, proposalId: prop.id, vote: vote.vote, createdAt: vote.created_at, created_at: vote.created_at };
              if (!isAnonymous) {
                voteData.userId = vote.user_id;
                voteData.user = { id: vote.user_id, name: vote.user_name, email: vote.user_email, avatar: vote.user_avatar };
              } else if (vote.user_id === userId) {
                voteData.userId = vote.user_id;
              }
              return voteData;
            });
          }
          let comments = [];
          if (prop.comments) {
            let rawComments = typeof prop.comments === 'string' ? safeJsonParse(prop.comments, []) : (prop.comments || []);
            comments = (Array.isArray(rawComments) ? rawComments : []).map(comment => {
              const commentableType = comment.commentable_type || 'proposal';
              const commentableId = comment.commentable_id || comment.proposal_id || prop.id;
              return {
                id: comment.id, commentableType, commentableId,
                proposalId: commentableType === 'proposal' ? commentableId : undefined,
                structureProposalId: commentableType === 'structure_proposal' ? commentableId : undefined,
                userId: comment.user_id, user_id: comment.user_id, text: comment.text,
                parentId: comment.parent_id || undefined, parent_id: comment.parent_id,
                createdAt: comment.created_at, created_at: comment.created_at,
                updatedAt: comment.updated_at, updated_at: comment.updated_at,
                deletedAt: comment.deleted_at, deleted_at: comment.deleted_at,
                editedAt: comment.edited_at, edited_at: comment.edited_at,
                editCount: comment.edit_count || 0, edit_count: comment.edit_count || 0,
                user: { id: comment.user_id, name: comment.user_name, email: comment.user_email, avatar: comment.user_avatar },
                parent: comment.parent_id ? { id: comment.parent_id, user: { id: comment.parent_user_id, name: comment.parent_user_name } } : null,
                replies: [], upvoteCount: comment.upvote_count != null ? Number(comment.upvote_count) : 0, userUpvoted: false
              };
            });
          }
          return { id: prop.id, userId: prop.user_id, user_id: prop.user_id, paragraphId: row.id, paragraph_id: row.id, text: prop.text, type: prop.type, headingLevel: prop.heading_level, heading_level: prop.heading_level, createdAt: prop.created_at, created_at: prop.created_at, updatedAt: prop.updated_at, updated_at: prop.updated_at, user: { id: prop.user_id, name: prop.user_name, email: prop.user_email, avatar: prop.user_avatar }, votes, comments, commentCount: prop.comment_count || comments.length };
        });
      }
      let history = [];
      if (row.history_json && row.history_json !== '[null]' && row.history_json !== 'null') {
        let rawHistory = typeof row.history_json === 'string' ? safeJsonParse(row.history_json, []) : (row.history_json || []);
        history = (Array.isArray(rawHistory) ? rawHistory : []).filter(entry => entry !== null && entry.id !== null).map(entry => ({
          id: entry.id, paragraph_id: entry.paragraph_id, paragraphId: entry.paragraph_id, userId: entry.user_id, oldText: entry.old_text, newText: entry.new_text, text: entry.new_text, approvalPercentage: entry.approval_percentage != null ? Number(entry.approval_percentage) : 100, proposalId: entry.proposal_id, acceptedAt: entry.accepted_at || entry.acceptedAt || entry.created_at, createdAt: entry.created_at, type: entry.proposal_type || 'BODY', heading_level: entry.heading_level, user: { id: entry.user_id, name: entry.user_name, email: entry.user_email, avatar: entry.user_avatar }
        }));
      }
      return { ...row, order: row.order_index, heading_level: row.heading_level, proposals, suggestions: proposals, history };
    });

    let collaborators;
    try {
      if (document.ownership_type === 'organizational' && document.organization_id) {
        const orgCollabQuery = `SELECT u.id as user_id, u.name as user_name, u.email as user_email, u.avatar as user_avatar FROM organization_members om JOIN users u ON om.user_id = u.id WHERE om.organization_id = ? AND om.status = 'active' AND om.user_id NOT IN (SELECT id FROM organizations) ORDER BY u.name`;
        const orgCollaborators = await TransactionManager.queryAll(db, orgCollabQuery, [document.organization_id]);
        collaborators = orgCollaborators.map(collab => ({ id: collab.user_id, document_id: documentId, user_id: collab.user_id, created_at: new Date().toISOString(), user: { id: collab.user_id, name: collab.user_name, email: collab.user_email, avatar: collab.user_avatar } }));
      } else {
        const collabQuery = `SELECT dc.id as collaborator_id, dc.document_id, dc.user_id, dc.created_at, u.name as user_name, u.email as user_email, u.avatar as user_avatar FROM document_collaborators dc JOIN users u ON dc.user_id = u.id WHERE dc.document_id = ? AND dc.user_id NOT IN (SELECT id FROM organizations)`;
        const docCollaborators = await TransactionManager.queryAll(db, collabQuery, [documentId]);
        collaborators = docCollaborators.map(collab => ({ id: collab.collaborator_id, document_id: collab.document_id, user_id: collab.user_id, created_at: collab.created_at, user: { id: collab.user_id, name: collab.user_name, email: collab.user_email, avatar: collab.user_avatar } }));
      }
    } catch (collabErr) {
      logger.error('Error fetching collaborators', { error: collabErr.message, documentId });
      throw new ApiError(500, 'Failed to fetch collaborators', 'DATABASE_ERROR', { details: collabErr.message });
    }

    const normalizedCollaborators = collaborators || [];
    const result = {
      ...document,
      parentId: document.parent_id || undefined,
      status: document.status || 'draft',
      proposalDeadline: document.proposal_deadline || undefined,
      amendmentsOpen: document.amendments_open === 1,
      amendmentsOpenedAt: document.amendments_opened_at || undefined,
      ...mapDocumentLifecycleFields(document),
      owner: { id: document.owner_id, name: document.owner_name || null, email: document.owner_email || null, avatar: document.owner_avatar || null, type: document.owner_type || 'user' },
      collaborators: normalizedCollaborators,
      paragraphs: paragraphData,
      options: { acceptanceThreshold: document.acceptance_threshold || 75.0, votingAnonymous: document.voting_anonymous === true, votingAnonymityLocked: document.voting_anonymity_locked === true, voteChangeAllowed: document.vote_change_allowed === true }
    };
    result.documentKind = document.document_kind || undefined;
    result.meetingId = document.meeting_id || undefined;
    if (document.meeting_id) {
      result.minutesFinalizedAt = document.meeting_minutes_finalized_at ?? null;
      if (document.meeting_scheduled_at) {
        result.meetingScheduledAt = document.meeting_scheduled_at;
      }
    }

    const commentIds = [];
    for (const para of result.paragraphs || []) {
      for (const prop of para.proposals || para.suggestions || []) {
        for (const c of prop.comments || []) {
          if (c && c.id) commentIds.push(c.id);
        }
      }
    }
    if (commentIds.length > 0 && userId) {
      try {
        const placeholders = commentIds.map(() => '?').join(',');
        const upvotedRows = await TransactionManager.queryAll(db, `SELECT comment_id FROM comment_upvotes WHERE user_id = ? AND comment_id IN (${placeholders})`, [userId, ...commentIds]);
        const upvotedSet = new Set(upvotedRows.map(r => r.comment_id));
        for (const para of result.paragraphs || []) {
          for (const prop of para.proposals || para.suggestions || []) {
            for (const c of prop.comments || []) {
              if (c && c.id) c.userUpvoted = upvotedSet.has(c.id);
            }
          }
        }
      } catch (err) {
        logger.warn('Error fetching comment upvotes for document', { error: err.message, documentId });
      }
    }

    return result;
  }

  /**
   * Remove a collaborator from a document. Caller must be owner or admin.
   * Organizational documents are not allowed (managed via org membership).
   * @param {string} documentId
   * @param {string} currentUserId
   * @param {string} collaboratorUserId
   * @throws {ApiError}
   */
  async removeCollaborator(documentId, currentUserId, collaboratorUserId) {
    const db = this.db;
    const document = await TransactionManager.query(db, `
      SELECT owner_id, ownership_type FROM documents WHERE id = ?
    `, [documentId]);

    if (!document) {
      throw ApiError.notFound('Document');
    }

    if (document.ownership_type === 'organizational') {
      throw ApiError.forbidden('Collaborators for organizational documents are managed automatically through organization membership. To revoke access, remove the user from the organization.');
    }

    if (document.owner_id !== currentUserId) {
      const user = await TransactionManager.query(db, 'SELECT role FROM users WHERE id = ?', [currentUserId]);
      if (!user || user.role !== 'admin') {
        throw ApiError.forbidden('Only document owner or admin can manage collaborators');
      }
    }

    if (document.owner_id === collaboratorUserId) {
      throw ApiError.validation('Cannot remove document owner');
    }

    const existing = await TransactionManager.query(db, `
      SELECT id FROM document_collaborators WHERE document_id = ? AND user_id = ?
    `, [documentId, collaboratorUserId]);

    if (!existing) {
      throw ApiError.notFound('Collaborator');
    }

    await TransactionManager.execute(db, `
      DELETE FROM document_collaborators WHERE document_id = ? AND user_id = ?
    `, [documentId, collaboratorUserId]);

    try {
      await TransactionManager.execute(db, `
        UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `, [documentId]);
    } catch (err) {
      logger.error('Error updating document timestamp', { error: err.message, documentId });
    }

    logger.info('Collaborator removed successfully', { userId: collaboratorUserId, documentId });
  }

  /**
   * Invite a collaborator by userId or email. Creates a pending invitation; user must accept before access.
   * @returns {{ invitationSent: boolean, invitation?: Object, message: string }}
   */
  async addCollaboratorByEmail(documentId, currentUserId, { userId, email }) {
    const db = this.db;
    if (!userId && !email) {
      throw ApiError.validation('Either user ID or email is required', null, 'USER_ID_OR_EMAIL_REQUIRED');
    }
    const document = await TransactionManager.query(db, 'SELECT owner_id, ownership_type FROM documents WHERE id = ?', [documentId]);
    if (!document) throw ApiError.notFound('Document', 'DOCUMENT_NOT_FOUND');
    if (document.ownership_type === 'organizational') {
      throw ApiError.forbidden('Collaborators for organizational documents are managed automatically through organization membership.', 'ORGANIZATIONAL_COLLABORATORS_MANAGED_AUTOMATICALLY');
    }
    if (document.owner_id !== currentUserId) {
      const currentUser = await TransactionManager.query(db, 'SELECT role FROM users WHERE id = ?', [currentUserId]);
      if (!currentUser || currentUser.role !== 'admin') {
        throw ApiError.forbidden('Only document owner or admin can manage collaborators', 'NOT_DOCUMENT_OWNER_OR_ADMIN');
      }
    }

    let targetEmail = email;
    if (!targetEmail) {
      const user = await TransactionManager.query(db, 'SELECT id, email FROM users WHERE id = ?', [userId]);
      if (!user) throw ApiError.notFound('User', 'USER_NOT_FOUND');
      targetEmail = user.email;
    }

    const { invitations, failedEmails } = await this.inviteCollaborators(documentId, currentUserId, [targetEmail]);
    if (!invitations.length) {
      const failure = failedEmails[0];
      throw ApiError.validation(
        failure?.error || 'Failed to send collaborator invitation',
        failure ? { email: failure.email } : null,
        'INVITATION_FAILED'
      );
    }

    return {
      invitationSent: true,
      invitation: invitations[0],
      message: 'Collaborator invitation sent. The user must accept before gaining access to the document.',
    };
  }

  /**
   * Get invitations for a document. Caller must be owner, collaborator, or admin.
   * @returns {{ invitations: Array }}
   */
  async getDocumentInvitations(documentId, requestUserId) {
    const db = this.db;
    const document = await TransactionManager.query(db, 'SELECT id, owner_id, ownership_type FROM documents WHERE id = ?', [documentId]);
    if (!document) throw ApiError.notFound('Document');
    if (document.owner_id !== requestUserId) {
      const isCollaborator = await TransactionManager.query(db, 'SELECT id FROM document_collaborators WHERE document_id = ? AND user_id = ?', [documentId, requestUserId]);
      if (!isCollaborator) {
        const user = await TransactionManager.query(db, 'SELECT role FROM users WHERE id = ?', [requestUserId]);
        if (!user || user.role !== 'admin') {
          throw ApiError.forbidden('Only document owner, collaborators, or admin can view invitations');
        }
      }
    }
    const invitations = await TransactionManager.queryAll(db, `
      SELECT di.id, di.document_id, di.email, di.invitation_token, di.status, di.expires_at, di.accepted_at, di.created_at, di.invited_by,
        inviter.name as inviter_name, accepter.name as accepted_by_name
      FROM document_invitations di
      LEFT JOIN users inviter ON di.invited_by = inviter.id
      LEFT JOIN users accepter ON di.accepted_by_user_id = accepter.id
      WHERE di.document_id = ?
      ORDER BY di.created_at DESC
    `, [documentId]);
    const now = new Date();
    const invitationsWithExpiration = invitations.map(inv => ({
      ...inv,
      isExpired: now > new Date(inv.expires_at) && inv.status === 'pending'
    }));
    return { invitations: invitationsWithExpiration };
  }

  /**
   * Invite collaborators by email. Creates invitation rows and returns tokens/links. Caller sends emails.
   * @returns {{ invitations: Array, failedEmails: Array }}
   */
  async inviteCollaborators(documentId, userId, emails) {
    const db = this.db;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const email of emails) {
      if (!email || typeof email !== 'string' || !emailRegex.test(email)) {
        throw ApiError.validation(`Invalid email address: ${email}`);
      }
    }
    const document = await TransactionManager.query(db, 'SELECT id, title, owner_id, ownership_type FROM documents WHERE id = ?', [documentId]);
    if (!document) throw ApiError.notFound('Document');
    if (document.ownership_type === 'organizational') {
      throw ApiError.forbidden('Organizational documents use organization membership for collaboration. Invite users to the organization instead.');
    }
    if (document.owner_id !== userId) {
      const user = await TransactionManager.query(db, 'SELECT role FROM users WHERE id = ?', [userId]);
      if (!user || user.role !== 'admin') {
        throw ApiError.forbidden('Only document owner or admin can invite collaborators');
      }
    }
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 7);
    const invitations = [];
    const failedEmails = [];
    for (const email of emails) {
      const emailLower = email.toLowerCase().trim();
      try {
        const existingUser = await TransactionManager.query(db, 'SELECT id FROM users WHERE email = ?', [emailLower]);
        if (existingUser) {
          const existingCollaborator = await TransactionManager.query(db, 'SELECT id FROM document_collaborators WHERE document_id = ? AND user_id = ?', [documentId, existingUser.id]);
          if (existingCollaborator) {
            failedEmails.push({ email, error: 'User is already a collaborator' });
            continue;
          }
          if (document.owner_id === existingUser.id) {
            failedEmails.push({ email, error: 'User is already the document owner' });
            continue;
          }
        }
        const existingInvitation = await TransactionManager.query(db, 'SELECT id, status FROM document_invitations WHERE document_id = ? AND email = ? AND status = ?', [documentId, emailLower, 'pending']);
        let invitationId, invitationToken, isResend = false;
        if (existingInvitation) {
          invitationId = existingInvitation.id;
          const existingToken = await TransactionManager.query(db, 'SELECT invitation_token FROM document_invitations WHERE id = ?', [invitationId]);
          invitationToken = existingToken.invitation_token;
          isResend = true;
          await TransactionManager.execute(db, 'UPDATE document_invitations SET expires_at = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?', [expirationDate.toISOString(), invitationId]);
        } else {
          invitationToken = crypto.randomBytes(32).toString('hex');
          invitationId = uuidv4();
          await TransactionManager.execute(db, `
            INSERT INTO document_invitations (id, document_id, email, invitation_token, invited_by, status, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP)
          `, [invitationId, documentId, emailLower, invitationToken, userId, expirationDate.toISOString()]);
        }
        invitations.push({ id: invitationId, email, token: invitationToken, isResend });
      } catch (dbError) {
        logger.error('Failed to create document invitation', { error: dbError.message, email, documentId });
        failedEmails.push({ email, error: dbError.message });
      }
    }
    return { invitations, failedEmails };
  }

  /**
   * Cast or update a deletion vote. Caller must hold vote lock. Validates and performs the vote in a transaction.
   * @returns {{ voteId, action: 'cast'|'updated', receiptId, contestId, voteType, voteRecordedAt }}
   */
  async castDocumentDeletionVote(documentId, userId, vote) {
    const db = this.db;
    const document = await TransactionManager.query(db, 'SELECT id, deletion_proposed_at, deletion_vote_deadline, organization_id, ownership_type FROM documents WHERE id = ?', [documentId]);
    if (!document) throw ApiError.notFound('Document', 'DOCUMENT_NOT_FOUND');
    if (!document.deletion_proposed_at) throw ApiError.validation('Deletion not proposed for this document', null, 'DELETION_NOT_PROPOSED');
    if (document.deletion_vote_deadline && new Date() > new Date(document.deletion_vote_deadline)) {
      throw ApiError.forbidden('Deletion vote deadline has passed', 'DELETION_VOTE_DEADLINE_PASSED');
    }
    if (document.ownership_type === 'organizational' && document.organization_id) {
      const { isActiveMember } = require('../modules/permissions');
      const member = await isActiveMember(db, userId, document.organization_id);
      if (!member) throw ApiError.forbidden('Only organization members can vote on deletion', 'NOT_ORGANIZATION_MEMBER');
    }
    const { generateReceiptId, computeVoteHash } = require('../utils/voteReceipt');
    const voteVerificationLog = require('../utils/voteVerificationLog');
    const existingVote = await TransactionManager.query(db, 'SELECT id, vote, receipt_id FROM document_deletion_votes WHERE document_id = ? AND user_id = ?', [documentId, userId]);
    const voteRecordedAt = new Date().toISOString();
    const voteId = existingVote ? existingVote.id : uuidv4();
    const receiptId = existingVote?.receipt_id || generateReceiptId();
    const voteHash = computeVoteHash('document_deletion', { contestId: documentId, choice: vote, timestamp: voteRecordedAt, receiptId });
    await TransactionManager.executeInTransaction(db, async (txDb) => {
      if (existingVote) {
        await TransactionManager.execute(txDb, `
          UPDATE document_deletion_votes SET vote = ?, created_at = CURRENT_TIMESTAMP, receipt_id = ?, vote_hash = ?
          WHERE document_id = ? AND user_id = ?
        `, [vote, receiptId, voteHash, documentId, userId]);
      } else {
        await TransactionManager.execute(txDb, `
          INSERT INTO document_deletion_votes (id, document_id, user_id, vote, receipt_id, vote_hash)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [voteId, documentId, userId, vote, receiptId, voteHash]);
      }
      await voteVerificationLog.appendLogEntry(txDb, { voteType: 'document_deletion', contestId: documentId, choice: vote, timestamp: voteRecordedAt, receiptId, voteHash });
    });
    return {
      voteId,
      action: existingVote ? 'updated' : 'cast',
      receiptId,
      contestId: documentId,
      voteType: 'document_deletion',
      voteRecordedAt
    };
  }

  /**
   * Check if document-level votes meet agreement threshold and transition to agreed if so.
   * @returns {{ transitioned: boolean, oldStatus?: string, newStatus?: string } | void }
   */
  async checkAgreementStatus(documentId) {
    const db = this.db;
    const doc = await TransactionManager.query(db, `
      SELECT id, status, acceptance_threshold, proposal_deadline, voting_deadline, min_voters_required, organization_id, ownership_type, vote_change_allowed
      FROM documents WHERE id = ?
    `, [documentId]);
    if (!doc || doc.status === 'agreed' || doc.status === 'rejected') return;
    if (doc.status !== 'voting' && doc.status !== 'proposal') return;
    if (doc.status === 'proposal' && doc.ownership_type === 'organizational' && doc.proposal_deadline) {
      const deadline = new Date(doc.proposal_deadline);
      if (new Date() < deadline) return;
    }
    const acceptanceThreshold = doc.acceptance_threshold || 75.0;
    const VoterManager = require('../modules/voting');
    const eligibleVoters = await VoterManager.getEligibleVoters(db, documentId);
    const totalEligible = eligibleVoters.length;
    if (totalEligible === 0) {
      logger.warn('Document has no eligible voters', { documentId });
      return;
    }
    const votes = await TransactionManager.queryAll(db, 'SELECT vote FROM document_votes WHERE document_id = ?', [documentId]);
    if (!votes || votes.length === 0) return;
    const actualVotes = votes.length;
    const proVotes = votes.filter(v => v.vote === 'PRO').length;
    let quorumPercentage = 0.3;
    if (doc.organization_id) {
      try {
        const { transformRulesToCamelCase } = require('../utils/governanceFieldMapping');
        const rulesRaw = await GovernanceRulesService.getGovernanceRules(db, doc.organization_id);
        const governanceRules = rulesRaw ? transformRulesToCamelCase(rulesRaw) : null;
        if (governanceRules?.defaultQuorumPercentage != null) quorumPercentage = governanceRules.defaultQuorumPercentage;
      } catch (govErr) {
        logger.warn('Could not fetch governance rules for quorum', { error: govErr.message, organizationId: doc.organization_id });
      }
    }
    const quorumRequired = Math.max(1, Math.ceil(totalEligible * quorumPercentage));
    const UnifiedVotingService = require('../modules/unified-voting');
    const approvalResult = await UnifiedVotingService.checkApproval({
      db,
      organizationId: doc.organization_id || null,
      proVotes,
      totalVotes: actualVotes,
      totalEligible,
      acceptanceThreshold,
      minVotersRequired: quorumRequired
    });
    if (!approvalResult.quorumMet) return;
    if (approvalResult.approved) {
      const DocumentStatusManager = require('../modules/document-status');
      if (DocumentStatusManager.shouldDeferDocumentFinalization(doc)) {
        logger.debug('Document finalization deferred until voting deadline', { documentId, votingDeadline: doc.voting_deadline });
        return;
      }
      const oldStatus = doc.status;
      await DocumentStatusManager.transitionToAgreed(db, documentId, null);
      logger.info('Document status updated to agreed - threshold met', { documentId, approvalPercentage: approvalResult.approvalPercentage, acceptanceThreshold });
      return { transitioned: true, oldStatus, newStatus: 'agreed' };
    }
  }

  async checkDocumentHierarchy(documentId, maxDepth) {
    return checkDocumentHierarchy(this.db, documentId, maxDepth);
  }

  async validateParentDocument(parentId, ownershipType, organizationId, userId) {
    return validateParentDocument(this.db, parentId, ownershipType, organizationId, userId);
  }

  async calculateDocumentPosition(positionType, referenceDocumentId, ownershipType, organizationId) {
    return calculateDocumentPosition(this.db, positionType, referenceDocumentId, ownershipType, organizationId);
  }

  async listDocuments(userId, options) {
    return listDocuments(this.db, userId, options);
  }

  async listOrganizationDocuments(organizationId, userId, options) {
    return listOrganizationDocuments(this.db, organizationId, userId, options);
  }

  async getAgreedView(documentId, userId, options) {
    return getAgreedView(this.db, documentId, userId, options);
  }

  async deleteDocument(documentId, userId) {
    return deleteDocument(this.db, documentId, userId);
  }

  async getDocumentVotingStatus(documentId, userId) {
    return getDocumentVotingStatus(this.db, documentId, userId);
  }

  async getDocumentsBatch(documentIds, userId) {
    return getDocumentsBatch(this.db, documentIds, userId);
  }
}

// --- Hierarchy and position (used by route POST / for document creation) ---
async function checkDocumentHierarchy(db, documentId, maxDepth, visited = new Set()) {
  const effectiveMax = maxDepth != null ? maxDepth : DOCUMENT_CONFIG.MAX_DEPTH;
  if (visited.has(documentId)) {
    return {
      valid: false,
      error: 'DOC_CIRCULAR_REFERENCE',
      message: 'Circular reference detected in document hierarchy',
      statusCode: 400
    };
  }
  if (visited.size >= effectiveMax) {
    return {
      valid: false,
      error: 'DOC_MAX_DEPTH_EXCEEDED',
      message: `Document hierarchy depth exceeds maximum allowed (${effectiveMax})`,
      statusCode: 400
    };
  }
  visited.add(documentId);
  const parentDoc = await TransactionManager.query(db, 'SELECT parent_id FROM documents WHERE id = ?', [documentId]);
  if (parentDoc && parentDoc.parent_id) {
    return checkDocumentHierarchy(db, parentDoc.parent_id, effectiveMax, visited);
  }
  return { valid: true };
}

async function validateParentDocument(db, parentId, ownershipType, organizationId, userId) {
  const DOC_PARENT_MESSAGES = {
    DOC_PARENT_NOT_FOUND: 'Parent document not found',
    DOC_PARENT_OWNERSHIP_MISMATCH: 'Parent document ownership type mismatch',
    DOC_PARENT_NOT_ORGANIZATIONAL: 'Parent document must be organizational',
    DOC_PARENT_ORGANIZATION_MISMATCH: 'Parent document belongs to different organization',
    DOC_PARENT_ACCESS_DENIED: 'Access denied to parent document'
  };
  if (!parentId) return { valid: true };

  const parentDoc = await TransactionManager.query(db, `
    SELECT id, title, organization_id, ownership_type, parent_id, owner_id
    FROM documents WHERE id = ?
  `, [parentId]);

  if (!parentDoc) {
    return {
      valid: false,
      error: 'DOC_PARENT_NOT_FOUND',
      message: DOC_PARENT_MESSAGES.DOC_PARENT_NOT_FOUND,
      statusCode: 400
    };
  }

  if (parentDoc.ownership_type !== ownershipType) {
    return {
      valid: false,
      error: 'DOC_PARENT_OWNERSHIP_MISMATCH',
      message: `${DOC_PARENT_MESSAGES.DOC_PARENT_OWNERSHIP_MISMATCH}. Parent has ${parentDoc.ownership_type}, child has ${ownershipType}.`,
      statusCode: 400
    };
  }

  if (ownershipType === 'organizational') {
    if (!parentDoc.organization_id) {
      return {
        valid: false,
        error: 'DOC_PARENT_NOT_ORGANIZATIONAL',
        message: DOC_PARENT_MESSAGES.DOC_PARENT_NOT_ORGANIZATIONAL,
        statusCode: 400
      };
    }
    if (parentDoc.organization_id !== organizationId) {
      return {
        valid: false,
        error: 'DOC_PARENT_ORGANIZATION_MISMATCH',
        message: DOC_PARENT_MESSAGES.DOC_PARENT_ORGANIZATION_MISMATCH,
        statusCode: 400
      };
    }
    const member = await TransactionManager.query(db, `
      SELECT om.status FROM organization_members om
      WHERE om.organization_id = ? AND om.user_id = ? AND om.status = 'active'
    `, [organizationId, userId]);
    if (!member) {
      return {
        valid: false,
        error: 'DOC_PARENT_ACCESS_DENIED',
        message: DOC_PARENT_MESSAGES.DOC_PARENT_ACCESS_DENIED,
        statusCode: 403
      };
    }
  } else {
    const doc = await TransactionManager.query(db, `
      SELECT d.id FROM documents d
      LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
      LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
      WHERE d.id = ?
        AND (
          (d.ownership_type != 'organizational' AND d.owner_id = ?)
          OR dc.user_id = ?
          OR (d.ownership_type = 'organizational' AND d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active')
        )
    `, [userId, userId, parentId, userId, userId, userId]);
    if (!doc) {
      return {
        valid: false,
        error: 'DOC_PARENT_ACCESS_DENIED',
        message: DOC_PARENT_MESSAGES.DOC_PARENT_ACCESS_DENIED,
        statusCode: 403
      };
    }
  }

  const hierarchyCheck = await checkDocumentHierarchy(db, parentId, DOCUMENT_CONFIG.MAX_DEPTH);
  if (!hierarchyCheck.valid) return hierarchyCheck;
  return { valid: true, parentDoc };
}

// --- Document creation (used by route POST / and re-exported for backward compat) ---
async function calculateSortOrder(db, positionType, referenceDocumentId, parentId) {
  if (positionType === 'root') {
    const rootRow = await TransactionManager.query(db, `SELECT COALESCE(MAX(sort_order), 0) as max_sort FROM documents WHERE parent_id IS NULL`, []);
    return (rootRow?.max_sort || 0) + 1.0;
  }
  if (positionType === 'child') {
    const childRow = await TransactionManager.query(db, `SELECT COALESCE(MAX(sort_order), 0) as max_sort FROM documents WHERE parent_id = ?`, [referenceDocumentId]);
    return (childRow?.max_sort || 0) + 1.0;
  }
  if (positionType === 'above_sibling' || positionType === 'below_sibling') {
    const row = await TransactionManager.query(db, `SELECT sort_order, parent_id FROM documents WHERE id = ?`, [referenceDocumentId]);
    if (!row) throw new Error(`Reference document not found: ${referenceDocumentId}`);
    const refSortOrder = row.sort_order || (Date.now() / 1000);
    const refParentId = row.parent_id;
    let minGap = 1.0;
    try {
      const gapRow = await TransactionManager.query(db, `SELECT MIN(ABS(sort_order - ?)) as min_gap FROM documents WHERE parent_id ${refParentId ? '= ?' : 'IS NULL'} AND id != ? AND sort_order IS NOT NULL`, refParentId ? [refSortOrder, refParentId, referenceDocumentId] : [refSortOrder, referenceDocumentId]);
      minGap = gapRow?.min_gap || 1.0;
    } catch (err) {
      logger.warn('Failed to get min gap for sort order, using default', { error: err.message, referenceDocumentId });
    }
    const newSortOrder = positionType === 'above_sibling' ? (minGap < 0.1 ? refSortOrder - 0.5 : refSortOrder - (minGap / 2)) : (minGap < 0.1 ? refSortOrder + 0.5 : refSortOrder + (minGap / 2));
    return newSortOrder;
  }
  return Date.now() / 1000;
}

/**
 * Calculate document position (parent ID and sort order) from position type and reference document.
 * @param {Object} db - Database connection
 * @param {string} positionType - 'root', 'child', 'above_sibling', 'below_sibling'
 * @param {string|null} referenceDocumentId - Reference document ID (required for non-root)
 * @param {string} ownershipType - Document ownership type
 * @param {string|null} organizationId - Organization ID (for organizational docs)
 * @returns {Promise<{ finalParentId: string|null, calculatedSortOrder: number|null, error?: { code, message, statusCode, details? } }>}
 */
async function calculateDocumentPosition(db, positionType, referenceDocumentId, ownershipType, organizationId) {
  let finalParentId = null;
  let calculatedSortOrder = null;

  if (positionType === 'root') {
    calculatedSortOrder = await calculateSortOrder(db, 'root', null, null);
    return { finalParentId, calculatedSortOrder };
  }

  if (!referenceDocumentId) {
    return {
      finalParentId: null,
      calculatedSortOrder: null,
      error: {
        code: 'DOC_REFERENCE_REQUIRED',
        message: 'Reference document ID is required when position type is specified',
        statusCode: 400
      }
    };
  }

  try {
    const refDoc = await TransactionManager.query(db, `
      SELECT id, parent_id, organization_id, ownership_type FROM documents WHERE id = ?
    `, [referenceDocumentId]);

    if (!refDoc) {
      return {
        finalParentId: null,
        calculatedSortOrder: null,
        error: { code: 'DOC_REFERENCE_NOT_FOUND', message: 'Reference document not found', statusCode: 404 }
      };
    }

    if (ownershipType === 'organizational' && organizationId && refDoc.organization_id !== organizationId) {
      return {
        finalParentId: null,
        calculatedSortOrder: null,
        error: { code: 'DOC_REFERENCE_ORG_MISMATCH', message: 'Reference document belongs to a different organization', statusCode: 403 }
      };
    }

    if (positionType === 'child') {
      finalParentId = referenceDocumentId;
    } else if (positionType === 'above_sibling' || positionType === 'below_sibling') {
      finalParentId = refDoc.parent_id || null;
    }

    calculatedSortOrder = await calculateSortOrder(db, positionType, referenceDocumentId, finalParentId);
    return { finalParentId, calculatedSortOrder };
  } catch (refError) {
    logger.error('Error validating reference document', { error: refError.message, referenceDocumentId });
    return {
      finalParentId: null,
      calculatedSortOrder: null,
      error: {
        code: 'DOC_REFERENCE_VALIDATION_ERROR',
        message: 'Failed to validate reference document',
        statusCode: 500,
        details: refError.message
      }
    };
  }
}

async function buildDocumentInsertSQL(db, ownershipType, organizationId, options, documentId, trimmedTitle, trimmedDescription, userId, parentId, sortOrder, governanceRules = null) {
  const getOptionValue = (camelKey, snakeKey) => (!options ? undefined : (options[camelKey] !== undefined ? options[camelKey] : options[snakeKey]));
  const acceptanceThresholdValue = getOptionValue('acceptanceThreshold', 'acceptance_threshold');
  const acceptanceThreshold = acceptanceThresholdValue !== undefined ? Math.min(DOCUMENT_CONFIG.MAX_ACCEPTANCE_THRESHOLD, Math.max(DOCUMENT_CONFIG.MIN_ACCEPTANCE_THRESHOLD, parseFloat(acceptanceThresholdValue))) : DOCUMENT_CONFIG.DEFAULT_ACCEPTANCE_THRESHOLD;
  const toBoolean = (v) => (typeof v === 'boolean' ? v : (typeof v === 'number' ? v !== 0 : false));
  // Default unspecified flags to their `documents` table column defaults so the create
  // response and stored row stay consistent (vote_change_allowed defaults to true).
  const boolOption = (camelKey, snakeKey, defaultValue) => {
    const raw = getOptionValue(camelKey, snakeKey);
    return raw === undefined ? defaultValue : !!toBoolean(raw);
  };
  const votingAnonymous = boolOption('votingAnonymous', 'voting_anonymous', false);
  const votingAnonymityLocked = boolOption('votingAnonymityLocked', 'voting_anonymity_locked', false);
  const voteChangeAllowed = boolOption('voteChangeAllowed', 'vote_change_allowed', true);
  const structureProposalsEnabled = boolOption('structureProposalsEnabled', 'structure_proposals_enabled', true);
  let sql, params, validatedAcceptanceThreshold, finalVotingAnonymous, finalVotingAnonymityLocked, finalVoteChangeAllowed, finalStructureProposalsEnabled;
  if (ownershipType === 'shared') {
    sql = `INSERT INTO documents (id, title, description, owner_id, ownership_type, creator_ids, organization_id, parent_id, sort_order, acceptance_threshold, voting_anonymous, voting_anonymity_locked, vote_change_allowed, structure_proposals_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
    params = [documentId, trimmedTitle, trimmedDescription, userId, ownershipType, JSON.stringify(options?.creatorIds || []), null, parentId || null, sortOrder || null, acceptanceThreshold, votingAnonymous, votingAnonymityLocked, voteChangeAllowed, structureProposalsEnabled];
  } else if (ownershipType === 'organizational') {
    const finalAcceptanceThreshold = governanceRules?.defaultAcceptanceThreshold || DOCUMENT_CONFIG.DEFAULT_ACCEPTANCE_THRESHOLD;
    finalVotingAnonymous = !!(governanceRules?.anonymousVotingEnabled ?? false);
    const explicitVoteChange = getOptionValue('voteChangeAllowed', 'vote_change_allowed');
    finalVoteChangeAllowed = explicitVoteChange !== undefined
      ? !!toBoolean(explicitVoteChange)
      : !!(governanceRules?.voteChangeAllowed ?? false);
    finalStructureProposalsEnabled = !!(governanceRules?.defaultStructureProposalsEnabled !== undefined ? governanceRules.defaultStructureProposalsEnabled : true);
    finalVotingAnonymityLocked = !!(governanceRules?.defaultVotingAnonymityLocked !== undefined ? governanceRules.defaultVotingAnonymityLocked : false);
    const proposalPeriodDays = governanceRules?.documentProposalPeriodDays || DOCUMENT_CONFIG.DEFAULT_PROPOSAL_PERIOD_DAYS;
    const proposalDeadline = new Date(); proposalDeadline.setDate(proposalDeadline.getDate() + proposalPeriodDays);
    const cutoffDays = Math.min(governanceRules?.paragraphProposalCutoffDays ?? 7, Math.max(0, proposalPeriodDays - 1));
    const paragraphProposalsCutoff = new Date(proposalDeadline); paragraphProposalsCutoff.setDate(paragraphProposalsCutoff.getDate() - cutoffDays);
    let minVotersRequired = 0;
    try {
      const memberCountRow = await TransactionManager.query(db, `SELECT COUNT(*) as count FROM organization_members WHERE organization_id = ? AND status = ?`, [organizationId, 'active']);
      minVotersRequired = Math.max(1, Math.ceil((memberCountRow?.count || 0) * (governanceRules?.defaultQuorumPercentage || 0.3)));
    } catch (err) {
      logger.warn('Failed to get organization member count for minVotersRequired', { error: err.message, organizationId });
    }
    validatedAcceptanceThreshold = (typeof finalAcceptanceThreshold === 'number' && !isNaN(finalAcceptanceThreshold)) ? finalAcceptanceThreshold : DOCUMENT_CONFIG.DEFAULT_ACCEPTANCE_THRESHOLD;
    sql = `INSERT INTO documents (id, title, description, owner_id, ownership_type, creator_ids, organization_id, parent_id, sort_order, status, proposal_deadline, paragraph_proposals_cutoff, acceptance_threshold, voting_anonymous, voting_anonymity_locked, vote_change_allowed, structure_proposals_enabled, min_voters_required, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
    params = [documentId, trimmedTitle, trimmedDescription, organizationId, ownershipType, null, organizationId, parentId || null, sortOrder || null, 'proposal', proposalDeadline.toISOString(), paragraphProposalsCutoff.toISOString(), validatedAcceptanceThreshold, finalVotingAnonymous, finalVotingAnonymityLocked, finalVoteChangeAllowed, finalStructureProposalsEnabled, minVotersRequired];
  } else {
    sql = `INSERT INTO documents (id, title, description, owner_id, ownership_type, creator_ids, organization_id, parent_id, sort_order, acceptance_threshold, voting_anonymous, voting_anonymity_locked, vote_change_allowed, structure_proposals_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
    params = [documentId, trimmedTitle, trimmedDescription, userId, ownershipType, null, null, parentId || null, sortOrder || null, acceptanceThreshold, votingAnonymous, votingAnonymityLocked, voteChangeAllowed, structureProposalsEnabled];
  }
  const finalValues = ownershipType === 'organizational' ? { acceptanceThreshold: validatedAcceptanceThreshold, votingAnonymous: finalVotingAnonymous, votingAnonymityLocked: finalVotingAnonymityLocked, voteChangeAllowed: finalVoteChangeAllowed, structureProposalsEnabled: finalStructureProposalsEnabled } : { acceptanceThreshold, votingAnonymous, votingAnonymityLocked, voteChangeAllowed, structureProposalsEnabled };
  return { sql, params, ...finalValues };
}

async function createInitialParagraph(db, documentId, title, description, userId) {
  const paragraphId = uuidv4();
  await TransactionManager.query(db, `INSERT INTO paragraphs (id, document_id, title, text, order_index, heading_level, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [paragraphId, documentId, null, '', 1, 'h1']);
  const titleProposalId = uuidv4();
  await TransactionManager.query(db, `INSERT INTO proposals (id, paragraph_id, user_id, text, type, heading_level, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, [titleProposalId, paragraphId, userId, title, 'TITLE', 'h1']);
  return paragraphId;
}

/** First paragraph for meeting minutes: direct write, no proposal/voting workflow. */
async function createMinutesInitialParagraph(db, documentId, headingTitle) {
  const paragraphId = uuidv4();
  const title = (headingTitle && String(headingTitle).trim()) ? String(headingTitle).trim() : 'Agenda';
  await TransactionManager.query(db, `
    INSERT INTO paragraphs (id, document_id, title, text, order_index, heading_level, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, [paragraphId, documentId, title, '', 1, 'h1']);
  return paragraphId;
}

/**
 * Create a meeting minutes document (organizational, draft, no proposal/voting deadlines).
 * Used only from meeting creation path. Call with db or trx (when inside a transaction).
 * @param {Object} dbOrTrx - Database or transaction
 * @param {{ meetingId: string, organizationId: string, title: string, userId: string }} opts
 * @returns {Promise<{ id: string }>} Document id
 */
async function createMinutesDocument(dbOrTrx, { meetingId, organizationId, title, userId }) {
  const db = dbOrTrx;
  const documentId = uuidv4();
  const trimmedTitle = (title && String(title).trim()) ? String(title).trim() : 'Meeting minutes';
  const acceptanceThreshold = DOCUMENT_CONFIG.DEFAULT_ACCEPTANCE_THRESHOLD;
  const votingAnonymous = false;
  const votingAnonymityLocked = false;
  const voteChangeAllowed = false;
  const structureProposalsEnabled = false;
  const sql = `INSERT INTO documents (id, title, description, owner_id, ownership_type, creator_ids, organization_id, parent_id, sort_order, status, document_kind, meeting_id, acceptance_threshold, voting_anonymous, voting_anonymity_locked, vote_change_allowed, structure_proposals_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
  const params = [documentId, trimmedTitle, null, organizationId, 'organizational', null, organizationId, null, null, 'draft', 'meeting_minutes', meetingId, acceptanceThreshold, votingAnonymous, votingAnonymityLocked, voteChangeAllowed, structureProposalsEnabled];
  await TransactionManager.execute(db, sql, params);
  await createMinutesInitialParagraph(db, documentId, 'Agenda');
  await syncDocumentCollaborators(db, documentId, organizationId, true);
  return { id: documentId };
}

async function addCollaborators(db, documentId, ownershipType, organizationId, userId, creatorIds) {
  if (ownershipType === 'shared' && creatorIds) {
    const collaboratorsToInvite = creatorIds.filter(cid => cid !== userId);
    if (collaboratorsToInvite.length === 0) return;

    const documentService = new DocumentService(db);
    for (const collaboratorId of collaboratorsToInvite) {
      const user = await TransactionManager.query(db, 'SELECT id, email FROM users WHERE id = ?', [collaboratorId]);
      if (!user?.email) continue;
      try {
        await documentService.inviteCollaborators(documentId, userId, [user.email]);
      } catch (err) {
        logger.warn('Failed to create collaborator invitation during document create', {
          error: err.message,
          documentId,
          collaboratorId,
        });
      }
    }
  } else if (ownershipType === 'organizational') {
    await syncDocumentCollaborators(db, documentId, organizationId, true);
  }
}

async function buildDocumentResponse(db, documentId, trimmedTitle, trimmedDescription, userId, ownershipType, organizationId, parentId, options) {
  const ownerId = ownershipType === 'organizational' ? organizationId : userId;
  let owner;
  if (ownershipType === 'organizational') {
    const organization = await TransactionManager.query(db, 'SELECT id, name FROM organizations WHERE id = ?', [ownerId]);
    if (!organization) throw new Error('Organization not found');
    owner = { id: organization.id, name: organization.name, type: 'organization' };
  } else {
    const user = await TransactionManager.query(db, 'SELECT id, name, email, avatar FROM users WHERE id = ?', [ownerId]);
    if (!user) throw new Error('User not found');
    owner = { id: user.id || ownerId, name: user.name, email: user.email, avatar: user.avatar, type: 'user' };
  }
  const docDetails = await TransactionManager.query(db, `SELECT proposal_deadline, paragraph_proposals_cutoff, voting_deadline, voting_started_at, min_voters_required, adopted_at, status, amendments_open, amendments_opened_at, proposal_ended_at, voting_ended_at, amendments_closed_at, amendment_adoption_vote_id, document_kind, meeting_id FROM documents WHERE id = ?`, [documentId]) || {};
  const result = { id: documentId, title: trimmedTitle, description: trimmedDescription, ownerId, parentId: parentId || undefined, status: docDetails.status || (ownershipType === 'organizational' ? 'proposal' : 'draft'), owner, ownershipType, organizationId: ownershipType === 'organizational' ? organizationId : null, options, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  if (docDetails.document_kind) result.documentKind = docDetails.document_kind;
  if (docDetails.meeting_id) result.meetingId = docDetails.meeting_id;
  if (ownershipType === 'organizational') {
    if (docDetails.proposal_deadline) result.proposalDeadline = docDetails.proposal_deadline;
    if (docDetails.paragraph_proposals_cutoff) result.paragraphProposalsCutoff = docDetails.paragraph_proposals_cutoff;
    if (docDetails.voting_deadline) result.votingDeadline = docDetails.voting_deadline;
    if (docDetails.voting_started_at) result.votingStartedAt = docDetails.voting_started_at;
    if (docDetails.min_voters_required) result.minVotersRequired = docDetails.min_voters_required;
    if (docDetails.adopted_at) result.adoptedAt = docDetails.adopted_at;
    result.amendmentsOpen = docDetails.amendments_open === 1;
    if (docDetails.amendments_opened_at) result.amendmentsOpenedAt = docDetails.amendments_opened_at;
    Object.assign(result, mapDocumentLifecycleFields(docDetails));
    if (docDetails.document_kind === 'meeting_minutes' && docDetails.meeting_id) {
      const meeting = await TransactionManager.query(db, 'SELECT minutes_finalized_at, scheduled_at FROM meetings WHERE id = ?', [docDetails.meeting_id]);
      if (meeting) {
        result.minutesFinalizedAt = meeting.minutes_finalized_at ?? null;
        if (meeting.scheduled_at) result.meetingScheduledAt = meeting.scheduled_at;
      }
    }
  }
  let collaborators = [];
  try {
    if (ownershipType === 'organizational' && organizationId) {
      const orgCollaborators = await TransactionManager.queryAll(db, `SELECT u.id as user_id, u.name as user_name, u.email as user_email, u.avatar as user_avatar FROM organization_members om JOIN users u ON om.user_id = u.id WHERE om.organization_id = ? AND om.status = 'active' AND om.user_id NOT IN (SELECT id FROM organizations) ORDER BY u.name`, [organizationId]);
      collaborators = orgCollaborators.map(c => ({ id: c.user_id, document_id: documentId, user_id: c.user_id, created_at: new Date().toISOString(), user: { id: c.user_id, name: c.user_name, email: c.user_email, avatar: c.user_avatar } }));
    } else {
      const docCollaborators = await TransactionManager.queryAll(db, `SELECT dc.id as collaborator_id, dc.document_id, dc.user_id, dc.created_at, u.name as user_name, u.email as user_email, u.avatar as user_avatar FROM document_collaborators dc JOIN users u ON dc.user_id = u.id WHERE dc.document_id = ? AND dc.user_id NOT IN (SELECT id FROM organizations)`, [documentId]);
      collaborators = docCollaborators.map(c => ({ id: c.collaborator_id, document_id: c.document_id, user_id: c.user_id, created_at: c.created_at, user: { id: c.user_id, name: c.user_name, email: c.user_email, avatar: c.user_avatar } }));
    }
  } catch (err) {
    logger.warn('Failed to load collaborators for document response', { error: err.message, documentId });
  }
  result.collaborators = collaborators;
  result.paragraphs = [];
  return result;
}

const { validateDocumentInputs, logDocumentEvent, logDocumentError, logDocumentSuccess, ERROR_CODES, handleDocumentCreationError } = documentValidation;

/**
 * Full document creation orchestration: validation, parent/position/org checks, then create.
 * Used by POST /api/documents. Returns { document } or throws ApiError.
 * @param {Object} db - knex/db
 * @param {string} userId - current user id
 * @param {Object} body - request body (camelCase or snake_case)
 * @param {{ role?: string, email?: string }} userContext - for permission and error logging
 * @returns {Promise<{ document: Object }>}
 */
async function createDocumentFull(db, userId, body, userContext = {}) {
  if (body.document_kind !== undefined || body.documentKind !== undefined) {
    throw ApiError.validation('document_kind cannot be set via the API', null, 'VALIDATION_ERROR');
  }
  if (body.meeting_id !== undefined || body.meetingId !== undefined) {
    throw ApiError.validation('meeting_id cannot be set via the API', null, 'VALIDATION_ERROR');
  }
  const ownershipType = body.ownershipType || body.ownership_type || 'personal';
  const organizationId = body.organizationId || body.organization_id;
  const title = body.title;
  const description = body.description;
  const options = body.options;
  const parentId = body.parentId ?? body.parent_id;
  let creatorIds = body.creatorIds ?? body.creator_ids;

  logger.info('Document creation request received', {
    hasTitle: !!title,
    ownershipType,
    organizationId,
    hasOrganizationId: !!organizationId,
    requestBodyKeys: Object.keys(body)
  });

  if (ownershipType === 'organizational') {
    if (!organizationId) {
      throw ApiError.validation(
        'Organization ID is required for organizational documents',
        { organizationId },
        'MISSING_ORGANIZATION_ID'
      );
    }
  }

  if (ownershipType !== 'organizational' && !userId) {
    throw ApiError.validation(
      'Owner ID is required for non-organizational documents',
      { ownershipType },
      'MISSING_OWNER'
    );
  }

  if (!userId) {
    throw ApiError.auth('Authentication required');
  }

  const positionType = options?.positionType || options?.position_type;
  const referenceDocumentId = options?.referenceDocumentId || options?.reference_document_id;

  logDocumentEvent('info', 'document_creation_started', {
    userId,
    ownershipType,
    organizationId,
    hasParent: !!parentId,
    hasOptions: !!options,
    positionType,
    referenceDocumentId
  });

  const inputValidation = validateDocumentInputs(title, description, options, ownershipType, organizationId, creatorIds);
  if (!inputValidation.valid) {
    logDocumentError('DOC_VALIDATION_FAILED', 'Document creation input validation failed', {
      userId,
      errors: inputValidation.errors,
      requestBody: { title, description, options, ownershipType, organizationId, creatorIds, parentId }
    });
    throw ApiError.validation(
      'Validation failed',
      {
        validationErrors: inputValidation.errors.map(err => ({
          field: err.field,
          message: err.message || err.error,
          reason: err.error,
          expected: err.expected,
          received: err.received
        }))
      },
      'VALIDATION_ERROR'
    );
  }

  if (ownershipType === 'shared') {
    if (!creatorIds) creatorIds = [];
    if (!creatorIds.includes(userId)) creatorIds.push(userId);
  }

  try {
    const result = await TransactionManager.executeInTransaction(db, async (trx) => {
      let finalParentId = parentId;
      if (finalParentId) {
        logDocumentEvent('info', 'parent_validation_started', { parentId: finalParentId, ownershipType, organizationId, userId });
        try {
          const parentValidation = await validateParentDocument(trx, finalParentId, ownershipType, organizationId, userId);
          if (!parentValidation.valid) {
            logDocumentError(parentValidation.error, parentValidation.message, {
              userId,
              parentId: finalParentId,
              ownershipType,
              organizationId
            });
            throw new ApiError(
              parentValidation.statusCode,
              parentValidation.message,
              parentValidation.error
            );
          }
          logDocumentSuccess('parent_validation_success', { parentId: finalParentId, ownershipType });
        } catch (validationError) {
          logDocumentError('DOC_PARENT_VALIDATION_ERROR', 'Error during parent validation', {
            userId,
            parentId: finalParentId,
            error: validationError.message
          });
          if (validationError instanceof ApiError) throw validationError;
          throw ApiError.database(
            'Failed to validate parent document',
            { originalError: validationError.message, parentId: finalParentId },
            'DOC_PARENT_VALIDATION_ERROR'
          );
        }
      }

      let calculatedSortOrder = null;
      if (positionType) {
        const positionResult = await calculateDocumentPosition(trx, positionType, referenceDocumentId, ownershipType, organizationId);
        if (positionResult.error) {
          throw new ApiError(
            positionResult.error.statusCode,
            positionResult.error.message,
            positionResult.error.code,
            positionResult.error.details
          );
        }
        finalParentId = positionResult.finalParentId;
        calculatedSortOrder = positionResult.calculatedSortOrder;
      }

      let rules = null;
      if (ownershipType === 'organizational') {
        let orgQuery = 'SELECT id, name FROM organizations WHERE id = ? AND is_active = true';
        const org = await TransactionManager.query(trx, orgQuery, [organizationId]);
        if (!org) {
          logDocumentError('DOC_ORG_NOT_FOUND', 'Organization not found or not active', { userId, organizationId });
          throw ApiError.validation('Organization not found or not active', { organizationId }, 'ORGANIZATION_NOT_FOUND_OR_INACTIVE');
        }
        logDocumentSuccess('organization_verified', { userId, organizationId, organizationName: org.name });

        const member = await TransactionManager.query(trx, `
          SELECT status FROM organization_members
          WHERE organization_id = ? AND user_id = ?
        `, [organizationId, userId]);
        if (!member || member.status !== 'active') {
          logDocumentError('DOC_ORG_MEMBERSHIP_REQUIRED', 'User is not an active member of the organization', {
            userId,
            organizationId,
            membershipStatus: member?.status || 'none'
          });
          throw ApiError.forbidden(ERROR_CODES.DOC_ORG_MEMBERSHIP_REQUIRED, 'DOC_ORG_MEMBERSHIP_REQUIRED');
        }

        const { canCreateDocuments } = require('../modules/permissions');
        const { transformRulesToCamelCase } = require('../utils/governanceFieldMapping');
        try {
          const rulesRaw = await GovernanceRulesService.getGovernanceRules(trx, organizationId);
          rules = rulesRaw ? transformRulesToCamelCase(rulesRaw) : null;
          if (!rules) {
            logger.debug('No governance rules found for organization, using defaults', { organizationId });
          }
        } catch (rulesError) {
          const isDatabaseError = rulesError.message && (
            rulesError.message.includes('database') ||
            rulesError.message.includes('query') ||
            rulesError.message.includes('connection') ||
            /^[0-9A-Z]{5}$/.test(rulesError.code)
          );
          const errorContext = {
            error: rulesError.message,
            errorType: rulesError.name || typeof rulesError,
            errorCode: rulesError.code,
            organizationId,
            userId,
            organizationName: org?.name,
            stack: process.env.NODE_ENV !== 'production' ? rulesError.stack : undefined
          };
          logDocumentError('DOC_GOVERNANCE_RULES_FETCH_ERROR', 'Failed to fetch governance rules for document creation', errorContext);
          let errorMessage = 'Failed to fetch governance rules. Document creation cannot proceed.';
          let errorDetails = {
            originalError: rulesError.message,
            organizationId,
            organizationName: org?.name
          };
          if (isDatabaseError) {
            errorMessage = 'A database error occurred while fetching governance rules. Please try again in a moment.';
            errorDetails.suggestion = 'This may be a temporary issue. Please wait a moment and try again.';
          } else if (rulesError.message && rulesError.message.includes('timeout')) {
            errorMessage = 'The request to fetch governance rules timed out. Please try again.';
            errorDetails.suggestion = 'The server may be experiencing high load. Please try again in a moment.';
          } else if (rulesError.message && (rulesError.message.includes('permission') || rulesError.message.includes('access'))) {
            errorMessage = 'You do not have permission to access governance rules for this organization.';
            errorDetails.suggestion = 'Please contact an organization administrator if you believe this is an error.';
          }
          throw ApiError.database(errorMessage, errorDetails, 'GOVERNANCE_RULES_FETCH_ERROR');
        }

        const canCreate = await canCreateDocuments(trx, userId, organizationId, rules, userContext.role);
        if (!canCreate) {
          logDocumentError('DOC_ORG_ACCESS_DENIED', 'User does not have permission to create documents', {
            userId,
            organizationId,
            userEmail: userContext.email,
            userRole: userContext.role
          });
          throw ApiError.forbidden(ERROR_CODES.DOC_ORG_ACCESS_DENIED, 'DOC_ORG_ACCESS_DENIED');
        }
      }

      return await createDocument(trx, ownershipType, organizationId, options, userId, title, description, creatorIds, finalParentId, calculatedSortOrder, rules);
    });

    logDocumentSuccess(ownershipType === 'organizational' ? 'organizational_document_created' : 'document_created', {
      userId,
      ownershipType,
      organizationId,
      title: title.substring(0, 50)
    });

    return { document: result };
  } catch (error) {
    logger.error('Error in document creation', {
      error: error.message,
      stack: error.stack,
      userId,
      organizationId,
      ownershipType,
      errorName: error.name,
      errorCode: error.code,
      isApiError: error instanceof ApiError || (error.statusCode && error.toJSON)
    });
    if (error instanceof ApiError || (error.statusCode && error.toJSON)) {
      throw error;
    }
    if (error.message && (error.message.includes('Database error') || error.message.includes('Failed to verify'))) {
      logDocumentError('DOC_DB_ERROR', 'Database error during document creation', {
        userId,
        organizationId,
        error: error.message
      });
      throw ApiError.database('Failed to create document', { originalError: error.message, organizationId }, 'DOCUMENT_CREATION_ERROR');
    }
    const errorResponse = handleDocumentCreationError(error, userId, ownershipType, organizationId);
    throw new ApiError(
      errorResponse.statusCode,
      errorResponse.errorMessage,
      errorResponse.errorCode,
      {
        ...errorResponse.errorDetails,
        ...(error.documentId && { documentId: error.documentId }),
        ...(organizationId && { organizationId })
      }
    );
  }
}

async function createDocument(db, ownershipType, organizationId, options, userId, title, description, creatorIds, parentId, sortOrder, governanceRules = null) {
  const documentId = uuidv4();
  const trimmedTitle = title.trim();
  const trimmedDescription = description ? description.trim() : null;
  let finalSortOrder = sortOrder;
  if (finalSortOrder === null || finalSortOrder === undefined) {
    const positionType = parentId ? 'child' : 'root';
    try {
      finalSortOrder = await calculateSortOrder(db, positionType, parentId || null, parentId);
    } catch (e) {
      finalSortOrder = Date.now() / 1000;
    }
  }
  const { sql, params, acceptanceThreshold, votingAnonymous, votingAnonymityLocked, voteChangeAllowed, structureProposalsEnabled } = await buildDocumentInsertSQL(db, ownershipType, organizationId, options, documentId, trimmedTitle, trimmedDescription, userId, parentId, finalSortOrder, governanceRules);
  const isTransaction = db && (db.transacting === true || (db.client && db.transacting));
  if (isTransaction) {
    const trx = db;
    const userRow = await TransactionManager.query(trx, 'SELECT id FROM users WHERE id = ?', [userId]);
    if (!userRow) throw new Error(`User ${userId} does not exist`);
    await TransactionManager.query(trx, sql, params);
    await createInitialParagraph(trx, documentId, trimmedTitle, trimmedDescription, userId);
    await addCollaborators(trx, documentId, ownershipType, organizationId, userId, creatorIds);
    const responseOptions = { acceptanceThreshold, votingAnonymous: !!votingAnonymous, votingAnonymityLocked: !!votingAnonymityLocked, voteChangeAllowed: !!voteChangeAllowed, structureProposalsEnabled: !!structureProposalsEnabled };
    const result = await buildDocumentResponse(trx, documentId, trimmedTitle, trimmedDescription, userId, ownershipType, organizationId, parentId, responseOptions);
    if (ownershipType === 'organizational') {
      try {
        const DocumentIntegrity = require('../utils/documentIntegrity');
        const validation = await DocumentIntegrity.validateOwnerReference(trx, documentId);
        if (!validation.valid) logger.error('Document created with invalid owner reference', { documentId, errors: validation.errors });
      } catch (err) {
        logger.warn('Document integrity check failed after create', { error: err.message, documentId });
      }
    }
    return result;
  }
  const knex = db;
  return await TransactionManager.executeInTransaction(knex, async (trx) => {
    const userRow = await TransactionManager.query(trx, 'SELECT id FROM users WHERE id = ?', [userId]);
    if (!userRow) throw new Error(`User ${userId} does not exist`);
    await TransactionManager.query(trx, sql, params);
    await createInitialParagraph(trx, documentId, trimmedTitle, trimmedDescription, userId);
    await addCollaborators(trx, documentId, ownershipType, organizationId, userId, creatorIds);
    const responseOptions = { acceptanceThreshold, votingAnonymous: !!votingAnonymous, votingAnonymityLocked: !!votingAnonymityLocked, voteChangeAllowed: !!voteChangeAllowed, structureProposalsEnabled: !!structureProposalsEnabled };
    const result = await buildDocumentResponse(trx, documentId, trimmedTitle, trimmedDescription, userId, ownershipType, organizationId, parentId, responseOptions);
    if (ownershipType === 'organizational') {
      try {
        const DocumentIntegrity = require('../utils/documentIntegrity');
        await DocumentIntegrity.validateOwnerReference(trx, documentId);
      } catch (err) {
        logger.warn('Document integrity check failed after create', { error: err.message, documentId });
      }
    }
    return result;
  });
}

// --- Document invitation (extracted from routes) ---

/**
 * Validate a document invitation token.
 * @param {Object} db - Database connection
 * @param {string} token - Invitation token
 * @returns {Promise<{ valid: boolean, error?: string, expired?: boolean, status?: string, invitation?: Object, userExists?: boolean }>}
 */
async function validateInvitationToken(db, token) {
  const invitation = await TransactionManager.query(db, `
    SELECT
      di.id,
      di.document_id,
      di.email,
      di.status,
      di.expires_at,
      di.created_at,
      d.title as document_title,
      u.name as inviter_name
    FROM document_invitations di
    JOIN documents d ON di.document_id = d.id
    LEFT JOIN users u ON di.invited_by = u.id
    WHERE di.invitation_token = ?
  `, [token]);

  if (!invitation) {
    return { valid: false, error: 'Invalid invitation token' };
  }

  const now = new Date();
  const expiresAt = new Date(invitation.expires_at);
  if (now > expiresAt) {
    if (invitation.status === 'pending') {
      await TransactionManager.execute(db, `
        UPDATE document_invitations SET status = 'expired' WHERE id = ?
      `, [invitation.id]);
    }
    return { valid: false, expired: true, error: 'Invitation has expired' };
  }

  if (invitation.status !== 'pending') {
    return {
      valid: false,
      status: invitation.status,
      error: `Invitation has been ${invitation.status}`
    };
  }

  const existingUser = await TransactionManager.query(db, `
    SELECT id FROM users WHERE email = ?
  `, [invitation.email.toLowerCase()]);

  return {
    valid: true,
    invitation: {
      id: invitation.id,
      documentId: invitation.document_id,
      documentTitle: invitation.document_title,
      email: invitation.email,
      inviterName: invitation.inviter_name,
      expiresAt: invitation.expires_at,
      createdAt: invitation.created_at
    },
    userExists: !!existingUser
  };
}

/**
 * Accept a document invitation for a logged-in user.
 * @param {Object} db - Database connection
 * @param {string} token - Invitation token
 * @param {string} userId - Current user ID
 * @returns {Promise<{ success: boolean, message: string, documentId: string, documentTitle: string }>}
 */
async function acceptDocumentInvitation(db, token, userId) {
  const invitation = await TransactionManager.query(db, `
    SELECT
      di.id,
      di.document_id,
      di.email,
      di.status,
      di.expires_at,
      d.title as document_title,
      d.owner_id
    FROM document_invitations di
    JOIN documents d ON di.document_id = d.id
    WHERE di.invitation_token = ?
  `, [token]);

  if (!invitation) {
    throw ApiError.notFound('Invitation');
  }

  const user = await TransactionManager.query(db, `
    SELECT id, email FROM users WHERE id = ?
  `, [userId]);

  if (!user) {
    throw ApiError.notFound('User');
  }

  if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    throw ApiError.validation('Email address does not match the invitation');
  }

  const now = new Date();
  const expiresAt = new Date(invitation.expires_at);
  if (now > expiresAt) {
    await TransactionManager.execute(db, `
      UPDATE document_invitations SET status = 'expired' WHERE id = ?
    `, [invitation.id]);
    throw ApiError.validation('Invitation has expired');
  }

  if (invitation.status !== 'pending') {
    throw ApiError.validation(`Invitation has been ${invitation.status}`);
  }

  await TransactionManager.executeInTransaction(db, async (txDb) => {
    const existing = await TransactionManager.query(txDb, `
      SELECT id FROM document_collaborators WHERE document_id = ? AND user_id = ?
    `, [invitation.document_id, userId]);

    if (!existing) {
      const collaboratorId = uuidv4();
      await TransactionManager.execute(txDb, `
        INSERT INTO document_collaborators (id, document_id, user_id)
        VALUES (?, ?, ?)
      `, [collaboratorId, invitation.document_id, userId]);
    }

    await TransactionManager.execute(txDb, `
      UPDATE document_invitations
      SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP, accepted_by_user_id = ?
      WHERE id = ?
    `, [userId, invitation.id]);
  });

  logger.info('Document invitation accepted', { userId, documentId: invitation.document_id, invitationId: invitation.id });

  return {
    success: true,
    message: 'Invitation accepted successfully',
    documentId: invitation.document_id,
    documentTitle: invitation.document_title
  };
}

/**
 * Update document title. Caller must have ownership or org membership.
 * @param {Object} db - Database connection
 * @param {string} documentId
 * @param {string} userId
 * @param {{ title: string }} body
 * @param {{ userRole?: string }} options - Optional. userRole for admin bypass (e.g. from req.user.role).
 */
async function updateDocumentTitle(db, documentId, userId, body, options = {}) {
  const title = (body && body.title) ? body.title.trim() : '';
  const document = await TransactionManager.query(db, `
    SELECT owner_id, ownership_type, organization_id FROM documents WHERE id = ?
  `, [documentId]);

  if (!document) {
    throw ApiError.notFound('Document', 'DOCUMENT_NOT_FOUND');
  }

  if (document.ownership_type === 'organizational') {
    const memberRow = await TransactionManager.query(db, `
      SELECT id FROM organization_members
      WHERE organization_id = ? AND user_id = ? AND status = 'active'
    `, [document.organization_id, userId]);
    if (!memberRow) {
      throw ApiError.forbidden('Only organization members can update documents', 'ORGANIZATION_MEMBER_REQUIRED');
    }
    const userRole = options.userRole;
    const isAdmin = userRole === 'admin';
    const isRep = await isRepresentative(db, userId, document.organization_id);
    if (!isAdmin) {
      const { transformRulesToCamelCase } = require('../utils/governanceFieldMapping');
      const rulesRaw = await GovernanceRulesService.getGovernanceRules(db, document.organization_id);
      const rules = rulesRaw ? transformRulesToCamelCase(rulesRaw) : null;
      const repCanManage = rules?.representativeCanManageDocuments ?? rules?.representative_can_manage_documents;
      if (repCanManage === false || repCanManage === 0) {
        throw ApiError.forbidden(
          'Only representatives can manage documents under current governance rules.',
          null,
          'REPRESENTATIVE_MANAGE_REQUIRED'
        );
      }
      if (!isRep) {
        throw ApiError.forbidden(
          'Only representatives can manage documents under current governance rules.',
          null,
          'REPRESENTATIVE_MANAGE_REQUIRED'
        );
      }
    }
  } else {
    if (document.owner_id !== userId) {
      throw ApiError.forbidden('Only document owner can update document', 'DOCUMENT_OWNER_REQUIRED');
    }
  }

  await TransactionManager.execute(db, `
    UPDATE documents SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `, [title, documentId]);
}

/**
 * Get status change history for a document.
 * @param {Object} db - Database connection
 * @param {string} documentId
 * @returns {Promise<{ history: Array }>}
 */
async function getDocumentStatusHistory(db, documentId) {
  const DocumentStatusManager = require('../modules/document-status');
  const history = await DocumentStatusManager.getStatusHistory(db, documentId);
  return { history };
}

/**
 * Cast or update a document-level vote. Caller is responsible for broadcast and retryCheckDocumentAgreementStatus.
 * @param {Object} db - Database connection
 * @param {string} documentId
 * @param {string} userId
 * @param {{ vote: string }} body
 * @returns {Promise<{ voteId: string, action: string, receiptId: string, contestId: string, voteType: string, voteRecordedAt: string }>}
 */
async function castDocumentVote(db, documentId, userId, body) {
  const vote = body && body.vote;
  if (!['PRO', 'NEUTRAL', 'CONTRA'].includes(vote)) {
    throw ApiError.validation('Invalid vote type. Must be PRO, NEUTRAL, or CONTRA');
  }

  const document = await TransactionManager.query(db, `
    SELECT id, vote_change_allowed, status, ownership_type, voting_deadline FROM documents WHERE id = ?
  `, [documentId]);

  if (!document) {
    throw ApiError.notFound('Document');
  }

  if (document.ownership_type === 'organizational' && document.status !== 'voting') {
    throw ApiError.forbidden('Document-level voting is only available during the voting period. Current status: ' + document.status);
  }

  if (document.voting_deadline && new Date() > new Date(document.voting_deadline)) {
    throw ApiError.forbidden('Voting deadline has passed for this document', { deadline: document.voting_deadline });
  }

  if (document.status === 'agreed' || document.status === 'rejected') {
    throw ApiError.forbidden('Cannot vote on documents that have been finalized. Status: ' + document.status);
  }

  const voteResult = await votingLockManager.withVoteLock('document', documentId, async () => {
    const currentDoc = await TransactionManager.query(db, `
      SELECT voting_deadline, status, vote_change_allowed, voting_anonymous FROM documents WHERE id = ?
    `, [documentId]);

    if (!currentDoc) {
      throw ApiError.notFound('Document');
    }

    if (currentDoc.voting_deadline && new Date() > new Date(currentDoc.voting_deadline)) {
      throw ApiError.forbidden('Voting deadline has passed for this document', { deadline: currentDoc.voting_deadline });
    }

    if (currentDoc.status === 'agreed' || currentDoc.status === 'rejected') {
      throw ApiError.forbidden('Cannot vote on documents that have been finalized. Status: ' + currentDoc.status);
    }

    const existingVote = await TransactionManager.query(db, `
      SELECT id, vote, receipt_id FROM document_votes WHERE document_id = ? AND user_id = ?
    `, [documentId, userId]);

    const voteRecordedAt = new Date().toISOString();

    if (existingVote) {
      if (!currentDoc.vote_change_allowed || currentDoc.vote_change_allowed === false) {
        throw ApiError.forbidden('Votes are locked for this document. You cannot change your vote.');
      }
      const receiptId = existingVote.receipt_id || generateReceiptId();
      const voteHash = computeVoteHash('document', {
        contestId: documentId,
        choice: vote,
        timestamp: voteRecordedAt,
        receiptId
      });
      await TransactionManager.executeInTransaction(db, async (txDb) => {
        await TransactionManager.execute(txDb, `
          UPDATE document_votes SET vote = ?, updated_at = CURRENT_TIMESTAMP, receipt_id = ?, vote_hash = ? WHERE document_id = ? AND user_id = ?
        `, [vote, receiptId, voteHash, documentId, userId]);
        await voteVerificationLog.appendLogEntry(txDb, {
          voteType: 'document',
          contestId: documentId,
          choice: vote,
          timestamp: voteRecordedAt,
          receiptId,
          voteHash
        });
      });
      return {
        voteId: existingVote.id,
        action: 'updated',
        receiptId,
        contestId: documentId,
        voteType: 'document',
        voteRecordedAt
      };
    }

    const voteId = uuidv4();
    const receiptId = generateReceiptId();
    const voteHash = computeVoteHash('document', {
      contestId: documentId,
      choice: vote,
      timestamp: voteRecordedAt,
      receiptId
    });
    await TransactionManager.executeInTransaction(db, async (txDb) => {
      await TransactionManager.execute(txDb, `
        INSERT INTO document_votes (id, document_id, user_id, vote, created_at, updated_at, receipt_id, vote_hash)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)
      `, [voteId, documentId, userId, vote, receiptId, voteHash]);
      await voteVerificationLog.appendLogEntry(txDb, {
        voteType: 'document',
        contestId: documentId,
        choice: vote,
        timestamp: voteRecordedAt,
        receiptId,
        voteHash
      });
    });
    return {
      voteId,
      action: 'cast',
      receiptId,
      contestId: documentId,
      voteType: 'document',
      voteRecordedAt
    };
  });

  return voteResult;
}

/**
 * Get document-level votes (formatted for response, respecting anonymity).
 * @param {Object} db - Database connection
 * @param {string} documentId
 * @param {string} userId
 * @returns {Promise<{ votes: Array }>}
 */
async function getDocumentVotes(db, documentId, userId) {
  const doc = await TransactionManager.query(db, `SELECT voting_anonymous FROM documents WHERE id = ?`, [documentId]);
  const isAnonymous = doc?.voting_anonymous === true;

  const votesQuery = isAnonymous
    ? `SELECT id, vote, created_at, updated_at FROM document_votes WHERE document_id = ?`
    : `SELECT dv.id, dv.vote, dv.created_at, dv.updated_at, u.id as user_id, u.name as user_name, u.email as user_email, u.avatar as user_avatar
       FROM document_votes dv
       JOIN users u ON dv.user_id = u.id
       WHERE dv.document_id = ?`;

  const votes = await TransactionManager.queryAll(db, votesQuery, [documentId]);

  const formattedVotes = votes.map(vote => {
    if (isAnonymous) {
      return {
        id: vote.id,
        vote: vote.vote,
        createdAt: vote.created_at,
        updatedAt: vote.updated_at
      };
    }
    return {
      id: vote.id,
      userId: vote.user_id,
      vote: vote.vote,
      createdAt: vote.created_at,
      updatedAt: vote.updated_at,
      user: {
        id: vote.user_id,
        name: vote.user_name,
        email: vote.user_email,
        avatar: vote.user_avatar
      }
    };
  });

  return { votes: formattedVotes };
}

async function startDocumentVoting(db, documentId, userId, options = {}) {
  const isAdmin = options.isAdmin === true;
  const document = await TransactionManager.query(db, 'SELECT owner_id, status, organization_id, ownership_type FROM documents WHERE id = ?', [documentId]);
  if (!document) {
    throw ApiError.notFound('Document');
  }
  const isOwner = document.ownership_type !== 'organizational' && document.owner_id === userId;
  const isRep = document.organization_id ? await isRepresentative(db, userId, document.organization_id) : false;
  let isMember = false;
  if (document.ownership_type === 'organizational') {
    const memberRow = await TransactionManager.query(db, `
      SELECT id FROM organization_members
      WHERE organization_id = ? AND user_id = ? AND status = 'active'
    `, [document.organization_id, userId]);
    isMember = !!memberRow;
  }
  if (!isOwner && !isAdmin && !isRep && !isMember) {
    throw ApiError.forbidden('Only document owner, organization member/representative, or admin can perform this action', null, 'PERMISSION_DENIED');
  }
  if (document.status !== 'proposal') {
    throw ApiError.validation('Document must be in proposal status to start voting', null, 'DOCUMENT_NOT_IN_PROPOSAL_STATUS');
  }
  if (document.ownership_type === 'organizational' && document.organization_id && !isOwner) {
    const { transformRulesToCamelCase } = require('../utils/governanceFieldMapping');
    const rulesRaw = await GovernanceRulesService.getGovernanceRules(db, document.organization_id);
    const rules = rulesRaw ? transformRulesToCamelCase(rulesRaw) : null;
    const repCanCreate = rules?.representativeCanCreateVotes ?? rules?.representative_can_create_votes;
    if (!isAdmin) {
      if (repCanCreate === false || repCanCreate === 0) {
        throw ApiError.forbidden(
          'Representatives are not allowed to start voting for this organization under current governance rules.',
          null,
          'REPRESENTATIVE_CANNOT_START_VOTING'
        );
      }
      if (repCanCreate !== false && repCanCreate !== 0 && !isRep) {
        throw ApiError.forbidden(
          'Only representatives can start voting for organizational documents under current governance rules.',
          null,
          'ONLY_REPRESENTATIVES_CAN_START_VOTING'
        );
      }
    }
  }
  const DocumentStatusManager = require('../modules/document-status');
  return await DocumentStatusManager.transitionToVoting(db, documentId, userId, {
    changeReason: 'manual_voting_started',
  });
}

async function proposeDeletion(db, documentId, userId, body) {
  const document = await TransactionManager.query(db, `
    SELECT id, title, owner_id, organization_id, ownership_type, deletion_proposed_at
    FROM documents WHERE id = ?
  `, [documentId]);
  if (!document) {
    throw ApiError.notFound('Document', 'DOCUMENT_NOT_FOUND');
  }
  if (document.deletion_proposed_at) {
    throw ApiError.validation('Deletion already proposed for this document', null, 'DELETION_ALREADY_PROPOSED');
  }
  if (document.ownership_type === 'organizational' && document.organization_id) {
    const rep = await isRepresentative(db, userId, document.organization_id);
    if (!rep) throw ApiError.forbidden('Only representatives can propose deletion', 'NOT_REPRESENTATIVE');
  } else {
    if (document.owner_id !== userId) {
      throw ApiError.forbidden('Only the document owner can propose deletion', 'NOT_DOCUMENT_OWNER');
    }
  }
  let voteDeadlineDays = 7;
  if (document.organization_id) {
    try {
      const { transformRulesToCamelCase } = require('../utils/governanceFieldMapping');
      const rulesRaw = await GovernanceRulesService.getGovernanceRules(db, document.organization_id);
      const governanceRules = rulesRaw ? transformRulesToCamelCase(rulesRaw) : null;
      if (governanceRules?.defaultVotingDeadlineHours) {
        voteDeadlineDays = Math.ceil(governanceRules.defaultVotingDeadlineHours / 24);
      }
    } catch (govErr) {
      logger.warn('Could not fetch governance rules for deletion vote deadline, using default', { error: govErr.message, documentId: document.id });
    }
  }
  const voteDeadline = new Date();
  voteDeadline.setDate(voteDeadline.getDate() + voteDeadlineDays);
  await TransactionManager.execute(db, `
    UPDATE documents
    SET deletion_proposed_at = CURRENT_TIMESTAMP,
        deletion_proposed_by = ?,
        deletion_vote_deadline = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [userId, voteDeadline.toISOString(), documentId]);
  const DocumentStatusManager = require('../modules/document-status');
  await DocumentStatusManager.logStatusChange(db, documentId, document.status, document.status, userId, 'deletion_proposed');
  return { voteDeadline: voteDeadline.toISOString() };
}

async function getAmendmentSummary(db, documentId) {
  const doc = await TransactionManager.query(db, 'SELECT id FROM documents WHERE id = ?', [documentId]);
  if (!doc) {
    throw ApiError.notFound('Document', 'DOCUMENT_NOT_FOUND');
  }
  const paragraphRows = await TransactionManager.queryAll(db, 'SELECT id FROM paragraphs WHERE document_id = ?', [documentId]);
  const paragraphIds = paragraphRows.map(r => r.id);
  const paragraphPlaceholders = paragraphIds.length ? paragraphIds.map(() => '?').join(',') : '';
  let paragraphProposals = 0;
  if (paragraphPlaceholders) {
    const row = await TransactionManager.query(db, `
      SELECT COUNT(*) as cnt FROM proposals
      WHERE paragraph_id IN (${paragraphPlaceholders}) AND (approved = false OR approved IS NULL)
    `, paragraphIds);
    paragraphProposals = row?.cnt ?? 0;
  }
  const structureRow = await TransactionManager.query(db, `
    SELECT COUNT(*) as cnt FROM structure_proposals
    WHERE document_id = ? AND applied = false AND (status IS NULL OR status NOT IN ('approved', 'rejected'))
  `, [documentId]);
  const structureProposals = structureRow?.cnt ?? 0;
  const treeRow = await TransactionManager.query(db, `
    SELECT COUNT(*) as cnt FROM document_tree_proposals WHERE document_id = ? AND status = 'pending'
  `, [documentId]);
  const treeProposals = treeRow?.cnt ?? 0;
  return { paragraphProposals, structureProposals, treeProposals };
}

async function closeAmendments(db, documentId, userId) {
  const document = await TransactionManager.query(db, `
    SELECT id, title, status, amendments_open, organization_id, ownership_type, amendment_adoption_vote_id
    FROM documents WHERE id = ?
  `, [documentId]);
  if (!document) {
    throw ApiError.notFound('Document', 'DOCUMENT_NOT_FOUND');
  }
  if (document.status !== 'agreed') {
    throw ApiError.validation('Only agreed documents can have amendments closed', null, 'DOCUMENT_NOT_AGREED');
  }
  if (document.amendments_open !== 1) {
    throw ApiError.validation('Document is not open for amendments', null, 'AMENDMENTS_NOT_OPEN');
  }
  if (document.amendment_adoption_vote_id) {
    throw ApiError.validation('An amendment adoption vote is already in progress', null, 'ADOPTION_VOTE_PENDING');
  }
  if (document.ownership_type !== 'organizational' || !document.organization_id) {
    throw ApiError.forbidden('Only organizational documents support amendments', 'ORGANIZATIONAL_REQUIRED');
  }
  const rep = await isRepresentative(db, userId, document.organization_id);
  if (!rep) {
    throw ApiError.forbidden('Only representatives can close amendments', 'NOT_REPRESENTATIVE');
  }

  const AmendmentSnapshotService = require('./AmendmentSnapshotService');
  const DocumentStatusManager = require('../modules/document-status');
  const { snapshot, isEmpty } = await AmendmentSnapshotService.buildSnapshot(db, documentId, userId);

  if (isEmpty) {
    await TransactionManager.execute(db, `
      UPDATE documents SET amendments_open = 0, amendments_opened_at = NULL,
        amendments_closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [documentId]);
    await AmendmentSnapshotService.clearCandidates(db, documentId);
    await DocumentStatusManager.logStatusChange(db, documentId, 'agreed', 'agreed', userId, 'amendments_closed_empty');
    return {
      organizationId: document.organization_id,
      adoptionVoteCreated: false,
      candidateCount: 0,
    };
  }

  const voteId = await AmendmentSnapshotService.createAmendmentAdoptionVote(
    db,
    document.organization_id,
    documentId,
    snapshot,
    userId,
    document.title
  );

  await TransactionManager.execute(db, `
    UPDATE documents SET amendments_open = 0, amendments_opened_at = NULL,
      amendment_snapshot_json = ?, amendment_adoption_vote_id = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [JSON.stringify(snapshot), voteId, documentId]);

  await DocumentStatusManager.logStatusChange(db, documentId, 'agreed', 'agreed', userId, 'amendments_closed_pending_adoption');

  const webSocketManager = require('../modules/websocket');
  webSocketManager.broadcastOrganizationUpdate(document.organization_id, 'organization-vote-created', {
    organizationId: document.organization_id,
    voteId,
    voteType: 'document_amendment_adoption',
    documentId,
  });

  return {
    organizationId: document.organization_id,
    adoptionVoteCreated: true,
    voteId,
    candidateCount:
      (snapshot.paragraphChanges?.length || 0)
      + (snapshot.structureProposals?.length || 0)
      + (snapshot.treeProposals?.length || 0),
  };
}

async function completeDeletionVote(db, documentId, userId) {
  const document = await TransactionManager.query(db, `
    SELECT id, title, owner_id, organization_id, ownership_type, deletion_proposed_at, deletion_vote_deadline
    FROM documents WHERE id = ?
  `, [documentId]);
  if (!document) {
    throw ApiError.notFound('Document', 'DOCUMENT_NOT_FOUND');
  }
  if (!document.deletion_proposed_at) {
    throw ApiError.validation('No active deletion proposal for this document', null, 'NO_ACTIVE_DELETION_PROPOSAL');
  }
  let canComplete = false;
  if (document.ownership_type === 'organizational' && document.organization_id) {
    canComplete = await isRepresentative(db, userId, document.organization_id);
  } else {
    canComplete = document.owner_id === userId;
  }
  if (!canComplete) {
    throw ApiError.forbidden('Only document owner or representative can complete deletion vote', 'NOT_OWNER_OR_REPRESENTATIVE');
  }
  const voteAggregation = await UnifiedVotingService.aggregateVotes(db, 'document_deletion_votes', 'document_id', documentId);
  const totalEligible = await UnifiedVotingService.getEligibleVoterCount(db, document.organization_id, 'organization');
  const governanceRules = await UnifiedVotingService.getGovernanceRules(db, document.organization_id);
  const acceptanceThreshold = governanceRules?.defaultAcceptanceThreshold ?? 75.0;
  await UnifiedVotingService.requireQuorumForComplete(db, {
    organizationId: document.organization_id || null,
    proVotes: voteAggregation.proVotes,
    totalVotes: voteAggregation.totalVotes,
    totalEligible,
    acceptanceThreshold
  });
  const DocumentScheduler = require('../modules/scheduler');
  const scheduler = new DocumentScheduler(db);
  await scheduler.finalizeDeletionVote(document);
  return { organizationId: document.organization_id };
}

async function cancelDeletion(db, documentId, userId) {
  const document = await TransactionManager.query(db, `
    SELECT id, deletion_proposed_by, organization_id, ownership_type
    FROM documents WHERE id = ?
  `, [documentId]);
  if (!document) {
    throw ApiError.notFound('Document', 'DOCUMENT_NOT_FOUND');
  }
  if (!document.deletion_proposed_by) {
    throw ApiError.validation('No deletion proposal exists for this document', null, 'NO_DELETION_PROPOSAL');
  }
  let canCancel = false;
  if (document.deletion_proposed_by === userId) {
    canCancel = true;
  } else if (document.ownership_type === 'organizational' && document.organization_id) {
    const repRow = await TransactionManager.query(db, `
      SELECT COUNT(*) as count FROM organization_representatives
      WHERE organization_id = ? AND user_id = ? AND status = 'active'
    `, [document.organization_id, userId]);
    canCancel = (repRow?.count || 0) > 0;
  }
  if (!canCancel) {
    throw ApiError.forbidden('Only the proposer or a representative can cancel deletion', 'NOT_PROPOSER_OR_REPRESENTATIVE');
  }
  await TransactionManager.execute(db, `
    UPDATE documents
    SET deletion_proposed_at = NULL,
        deletion_proposed_by = NULL,
        deletion_vote_deadline = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [documentId]);
  await TransactionManager.execute(db, 'DELETE FROM document_deletion_votes WHERE document_id = ?', [documentId]);
}

async function getDeletionStatus(db, documentId, userId) {
  const document = await TransactionManager.query(db, `
    SELECT deletion_proposed_at, deletion_proposed_by, deletion_vote_deadline,
           organization_id, ownership_type
    FROM documents WHERE id = ?
  `, [documentId]);
  if (!document) {
    throw ApiError.notFound('Document', 'DOCUMENT_NOT_FOUND');
  }
  if (!document.deletion_proposed_at) {
    return { proposed: false };
  }
  const votes = await TransactionManager.queryAll(db, `
    SELECT vote, COUNT(*) as count
    FROM document_deletion_votes
    WHERE document_id = ?
    GROUP BY vote
  `, [documentId]);
  const voteBreakdown = { PRO: 0, NEUTRAL: 0, CONTRA: 0 };
  votes.forEach(v => {
    const count = typeof v.count === 'number' ? v.count : (parseInt(v.count, 10) || 0);
    if (v.vote && ['PRO', 'NEUTRAL', 'CONTRA'].includes(v.vote)) {
      voteBreakdown[v.vote] = count;
    }
  });
  const totalVotes = voteBreakdown.PRO + voteBreakdown.NEUTRAL + voteBreakdown.CONTRA;
  const approvalRate = totalVotes > 0 ? (voteBreakdown.PRO / totalVotes) * 100 : 0;
  let eligibleVoters = 0;
  if (document.organization_id) {
    const memberCountRow = await TransactionManager.query(db, `
      SELECT COUNT(*) as count FROM organization_members
      WHERE organization_id = ? AND status = 'active'
    `, [document.organization_id]);
    eligibleVoters = memberCountRow?.count || 0;
  }
  const quorumRequired = Math.max(1, Math.ceil(eligibleVoters * 0.3));
  return {
    proposed: true,
    proposedAt: document.deletion_proposed_at,
    proposedBy: document.deletion_proposed_by,
    voteDeadline: document.deletion_vote_deadline,
    votes: {
      total: totalVotes,
      breakdown: voteBreakdown,
      approvalRate: Math.round(approvalRate * 10) / 10
    },
    eligibleVoters,
    quorumRequired,
    quorumMet: totalVotes >= quorumRequired
  };
}

/**
 * Cast deletion vote and perform post-vote formatting, cache invalidation, and broadcast.
 * Caller should hold vote lock (e.g. votingLockManager.withVoteLock). Broadcast fns are injected to keep service free of route/io deps.
 * @param {Object} db - Database connection
 * @param {string} documentId - Document ID
 * @param {string} userId - User ID
 * @param {string} vote - 'PRO' | 'NEUTRAL' | 'CONTRA'
 * @param {{ broadcastDocumentUpdate: Function, broadcastOrganizationUpdate: Function }} broadcastFns
 * @returns {Promise<{ voteId, action, receiptId, contestId, voteType, voteRecordedAt }>}
 */
async function castDocumentDeletionVoteWithBroadcast(db, documentId, userId, vote, broadcastFns) {
  const docSvc = new DocumentService(db);
  const result = await docSvc.castDocumentDeletionVote(documentId, userId, vote);
  const docSettings = await TransactionManager.query(db, 'SELECT voting_anonymous, organization_id FROM documents WHERE id = ?', [documentId]);
  const isAnonymous = docSettings?.voting_anonymous === true;
  const votes = await TransactionManager.queryAll(db, `
    SELECT ddv.*, u.name as user_name, u.email as user_email
    FROM document_deletion_votes ddv
    LEFT JOIN users u ON ddv.user_id = u.id
    WHERE ddv.document_id = ?
    ORDER BY ddv.created_at ASC
  `, [documentId]);
  const formattedVotes = UnifiedVotingService.formatVotesForResponse(votes, isAnonymous, userId);
  UnifiedVotingService.invalidateCache(documentId, 'document', `deletion-${documentId}`);
  const payload = {
    type: 'deletion-vote',
    documentId,
    voteId: result.voteId,
    userId,
    vote,
    action: result.action,
    allVotes: formattedVotes,
    isAnonymous
  };
  if (broadcastFns.broadcastDocumentUpdate) broadcastFns.broadcastDocumentUpdate(documentId, 'deletion-vote', payload);
  if (docSettings?.organization_id && broadcastFns.broadcastOrganizationUpdate) {
    broadcastFns.broadcastOrganizationUpdate(docSettings.organization_id, 'deletion-vote', payload);
  }
  return result;
}

/**
 * Get document title and inviter display name for invitation emails. Keeps route free of direct document/user queries.
 * @param {Object} db - Database connection
 * @param {string} documentId - Document ID
 * @param {string} userId - Inviter user ID
 * @returns {Promise<{ documentTitle: string, inviterName: string }>}
 */
async function getDocumentAndInviterForEmail(db, documentId, userId) {
  const document = await TransactionManager.query(db, 'SELECT title FROM documents WHERE id = ?', [documentId]);
  const inviter = await TransactionManager.query(db, 'SELECT name FROM users WHERE id = ?', [userId]);
  return {
    documentTitle: document?.title || 'Document',
    inviterName: inviter?.name || 'A user'
  };
}

/**
 * Run integrity check (validate all document owners). Caller must enforce admin role.
 * @param {Object} db - Database connection
 * @returns {Promise<{ total: number, valid: number, invalid: Array }>}
 */
async function runIntegrityCheck(db) {
  const DocumentIntegrity = require('../utils/documentIntegrity');
  return await DocumentIntegrity.validateAllDocumentOwners(db);
}

module.exports = DocumentService;
module.exports.createDocument = createDocument;
module.exports.createDocumentFull = createDocumentFull;
module.exports.checkDocumentHierarchy = checkDocumentHierarchy;
module.exports.validateParentDocument = validateParentDocument;
module.exports.calculateDocumentPosition = calculateDocumentPosition;
module.exports.listDocuments = listDocuments;
module.exports.listOrganizationDocuments = listOrganizationDocuments;
module.exports.getAgreedView = getAgreedView;
module.exports.resolveThresholdMetAmendmentForParagraph = resolveThresholdMetAmendmentForParagraph;
module.exports.deleteDocument = deleteDocument;
module.exports.getDocumentVotingStatus = getDocumentVotingStatus;
module.exports.getDocumentsBatch = getDocumentsBatch;
module.exports.validateInvitationToken = validateInvitationToken;
module.exports.acceptDocumentInvitation = acceptDocumentInvitation;
module.exports.updateDocumentTitle = updateDocumentTitle;
module.exports.getDocumentStatusHistory = getDocumentStatusHistory;
module.exports.castDocumentVote = castDocumentVote;
module.exports.getDocumentVotes = getDocumentVotes;
module.exports.startDocumentVoting = startDocumentVoting;
module.exports.proposeDeletion = proposeDeletion;
module.exports.getAmendmentSummary = getAmendmentSummary;
module.exports.closeAmendments = closeAmendments;
module.exports.completeDeletionVote = completeDeletionVote;
module.exports.cancelDeletion = cancelDeletion;
module.exports.getDeletionStatus = getDeletionStatus;
module.exports.castDocumentDeletionVoteWithBroadcast = castDocumentDeletionVoteWithBroadcast;
module.exports.getDocumentAndInviterForEmail = getDocumentAndInviterForEmail;
module.exports.runIntegrityCheck = runIntegrityCheck;
module.exports.createMinutesDocument = createMinutesDocument;

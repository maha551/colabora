const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { logger } = require('../middleware/logger');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const TransactionManager = require('../database/services/TransactionManager');
const { getUserId } = require('../utils/routeHelpers');
const VoterManager = require('../modules/voting');
const router = express.Router();

// GET /api/agreed-versions - Get recently accepted proposal versions
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const userId = getUserId(req);
  const since = req.query.since; // Optional timestamp filter for "new since last visit"

  try {
    // Get all documents the user has access to
    const { buildAccessCheck } = require('../utils/documentQueries');
    
    const documentsQuery = `
      SELECT d.id, d.title
      FROM documents d
      LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
      LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
      LEFT JOIN organizations o ON d.organization_id = o.id AND o.is_active = true
      WHERE ${buildAccessCheck('d')}
    `;

    // Parameters: userId (dc JOIN), userId (om JOIN), userId (owner check), userId (dc check)
    const documents = await TransactionManager.queryAll(db, documentsQuery, [userId, userId, userId, userId]);

    if (documents.length === 0) {
      return res.json({ versions: [] });
    }

    const documentIds = documents.map(d => d.id);
    const placeholders = documentIds.map(() => '?').join(',');

    // Build query with optional time filter
    let timeFilter = '';
    let params = documentIds;

    if (since) {
      timeFilter = ' AND h.created_at > ?';
      params = [...documentIds, since];
    }

    // Get recently accepted versions with real approval data
    const query = `
      SELECT
        h.id,
        h.paragraph_id,
        h.new_text as accepted_text,
        h.old_text as previous_text,
        h.approval_percentage,
        COALESCE(h.accepted_at, h.created_at) as accepted_at,
        h.proposal_id,

        -- Document and paragraph info
        d.id as document_id,
        d.title as document_title,
        p.title as paragraph_title,
        p.text as current_paragraph_text,

        -- User who accepted the proposal
        u.id as user_id,
        u.name as user_name,
        u.avatar as user_avatar,

        -- Additional context: total votes for this proposal
        (SELECT COUNT(*) FROM votes v WHERE v.proposal_id = h.proposal_id) as total_votes,
        (SELECT COUNT(*) FROM votes v WHERE v.proposal_id = h.proposal_id AND v.vote = 'PRO') as pro_votes

      FROM history h
      JOIN paragraphs p ON h.paragraph_id = p.id
      JOIN documents d ON p.document_id = d.id
      JOIN users u ON h.user_id = u.id

      WHERE p.document_id IN (${placeholders})
        AND h.approval_percentage >= COALESCE(d.acceptance_threshold, 75.0)  -- Use document-specific threshold
        ${timeFilter}

      ORDER BY h.created_at DESC
      LIMIT 20
    `;

    const rows = await TransactionManager.queryAll(db, query, params);

    // Get eligible voter counts per document (VoterManager excludes org from org docs)
    const uniqueDocIds = [...new Set(rows.map(r => r.document_id).filter(Boolean))];
    const voterCountByDoc = rows.length > 0
      ? await VoterManager.getEligibleVoterCountsByDocument(db, uniqueDocIds)
      : {};

    // Format the results with actual votes
    const formattedVersions = await Promise.all(rows.map(async (row) => {
      // Get document's voting_anonymous setting
      let isAnonymous = false;
      try {
        const docResult = await TransactionManager.query(db, 'SELECT voting_anonymous FROM documents WHERE id = ?', [row.document_id]);
        isAnonymous = docResult?.voting_anonymous === true;
      } catch (err) {
        const errorMessage = err?.message || err?.toString() || String(err) || 'Unknown error';
        logger.error('Error fetching document voting_anonymous setting', { error: errorMessage, documentId: row.document_id });
        // Default to non-anonymous if we can't determine
      }

      // Get actual votes for this proposal (if proposal_id exists)
      let processedVotes = [];
      if (row.proposal_id) {
        try {
          const votes = await TransactionManager.queryAll(db,
            `SELECT v.*, u.name as user_name
             FROM votes v
             JOIN users u ON v.user_id = u.id
             WHERE v.proposal_id = ?`,
            [row.proposal_id]
          );

          // Process votes following the pattern from debated-proposals.js
          processedVotes = votes.map(vote => {
            // Map database fields to frontend format
            const voteData = {
              id: vote.id,
              proposalId: row.proposal_id,
              vote: vote.vote,
              createdAt: vote.created_at || vote.createdAt,
            };
            
            // Hide user info if voting is anonymous
            if (!isAnonymous) {
              voteData.userId = vote.user_id;
              voteData.user = { id: vote.user_id, name: vote.user_name };
            } else {
              // In anonymous mode, only include userId for the current user's own vote
              if (vote.user_id === userId) {
                voteData.userId = vote.user_id;
              }
              // Don't include user object for other users
            }
            return voteData;
          });
        } catch (err) {
          const errorMessage = err?.message || err?.toString() || String(err) || 'Unknown error';
          logger.error('Error fetching votes for agreed version', { error: errorMessage, proposalId: row.proposal_id });
          // Continue with empty votes array if there's an error
        }
      }

      // Infer proposal type from proposal_id or paragraph context
      let proposalType = 'BODY';
      if (row.proposal_id) {
        try {
          const proposalRow = await TransactionManager.query(db, 'SELECT type FROM proposals WHERE id = ?', [row.proposal_id]);
          if (proposalRow) {
            proposalType = proposalRow.type || 'BODY';
          }
        } catch (err) {
          const errorMessage = err?.message || err?.toString() || String(err) || 'Unknown error';
          logger.error('Error fetching proposal type', { error: errorMessage, proposalId: row.proposal_id });
          // Check if it's first paragraph (likely TITLE)
          try {
            const paraRow = await TransactionManager.query(db, 'SELECT order_index FROM paragraphs WHERE id = ?', [row.paragraph_id]);
            if (paraRow && paraRow.order_index === 1) {
              proposalType = 'TITLE';
            }
          } catch (err2) {
            // Default to BODY
          }
        }
      }

      // Fetch other proposals for the same paragraph and type (for context)
      let otherProposals = [];
      try {
        const otherProposalsQuery = `
          SELECT 
            p.id,
            p.text as proposed_text,
            p.type,
            p.created_at,
            u.id as user_id,
            u.name as user_name,
            u.email as user_email,
            u.avatar as user_avatar,
            (SELECT COUNT(*) FROM votes v WHERE v.proposal_id = p.id AND v.vote = 'PRO') as pro_votes
          FROM proposals p
          JOIN users u ON p.user_id = u.id
          WHERE p.paragraph_id = ?
            AND p.id != ?
            AND p.type = ?
            AND p.approved = false
          ORDER BY pro_votes DESC, p.created_at DESC
          LIMIT 2
        `;
        
        const otherProposalsRows = await TransactionManager.queryAll(db, otherProposalsQuery, [
          row.paragraph_id,
          row.proposal_id || '',
          proposalType
        ]);

        // Get votes for other proposals
        for (const otherProposal of otherProposalsRows) {
          let otherVotes = [];
          try {
            const votes = await TransactionManager.queryAll(db,
              `SELECT v.*, u.name as user_name
               FROM votes v
               JOIN users u ON v.user_id = u.id
               WHERE v.proposal_id = ?`,
              [otherProposal.id]
            );

            otherVotes = votes.map(vote => {
              const voteData = {
                id: vote.id,
                proposalId: otherProposal.id,
                vote: vote.vote,
                createdAt: vote.created_at || vote.createdAt,
              };
              
              if (!isAnonymous) {
                voteData.userId = vote.user_id;
                voteData.user = { id: vote.user_id, name: vote.user_name };
              } else {
                if (vote.user_id === userId) {
                  voteData.userId = vote.user_id;
                }
              }
              return voteData;
            });
          } catch (err) {
            const errorMessage = err?.message || err?.toString() || String(err) || 'Unknown error';
            logger.error('Error fetching votes for other proposal', { error: errorMessage, proposalId: otherProposal.id });
          }

          otherProposals.push({
            id: otherProposal.id,
            paragraphId: row.paragraph_id,
            documentId: row.document_id,
            documentTitle: row.document_title,
            paragraphTitle: row.paragraph_title,
            proposedText: otherProposal.proposed_text,
            currentText: row.current_paragraph_text,
            type: otherProposal.type,
            headingLevel: null,
            createdAt: otherProposal.created_at,
            user: {
              id: otherProposal.user_id,
              name: otherProposal.user_name,
              email: otherProposal.user_email,
              avatar: otherProposal.user_avatar,
            },
            votes: otherVotes,
            totalUsers: voterCountByDoc[row.document_id] ?? 1,
          });
        }
      } catch (err) {
        const errorMessage = err?.message || err?.toString() || String(err) || 'Unknown error';
        logger.error('Error fetching other proposals for agreed version', { error: errorMessage, paragraphId: row.paragraph_id });
        // Continue with empty array if there's an error
      }

      return {
        id: `agreed-${row.id}`,
        documentId: row.document_id,
        documentTitle: row.document_title,
        paragraphId: row.paragraph_id,
        paragraphTitle: row.paragraph_title,
        acceptedText: row.accepted_text,
        previousText: row.previous_text || 'Previous version not available',
        approvalPercentage: row.approval_percentage,
        acceptedAt: row.accepted_at,
        userName: row.user_name,
        userId: row.user_id,
        userAvatar: row.user_avatar,
        proposalId: row.proposal_id,
        // Additional metadata
        totalVotes: row.total_votes || 0,
        proVotes: row.pro_votes || 0,
        // Include actual votes with user information
        votes: processedVotes,
        // Include other proposals for context
        otherProposals: otherProposals,
        // Include type for comparison logic
        type: proposalType,
      };
    }));

    logger.debug('Found agreed versions for user', { userId, count: formattedVersions.length });
    res.json({ versions: formattedVersions });

  } catch (error) {
    // Re-throw ApiError instances
    if (error instanceof ApiError) {
      throw error;
    }
    const errorMessage = error?.message || error?.toString() || String(error) || 'Unknown error';
    const errorStack = error?.stack || 'No stack trace available';
    logger.error('Error in agreed versions API', { error: errorMessage, stack: errorStack, userId });
    throw ApiError.database('Failed to fetch agreed versions', { originalError: errorMessage }, 'FETCH_AGREED_VERSIONS_FAILED');
  }
}));

// GET /api/agreed-versions/history - Get aggregated history entries from all documents
router.get('/history', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const userId = getUserId(req);
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  const documentId = req.query.documentId; // Optional filter by document
  const since = req.query.since; // Optional timestamp filter

  try {
    // Get all documents the user has access to
    const { buildAccessCheck } = require('../utils/documentQueries');
    
    let documentsQuery = `
      SELECT d.id, d.title, d.description
      FROM documents d
      LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
      LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
      LEFT JOIN organizations o ON d.organization_id = o.id AND o.is_active = true
      WHERE ${buildAccessCheck('d')}
    `;
    
    let documentsParams = [userId, userId, userId, userId];
    
    // If filtering by specific document, add that condition
    if (documentId) {
      documentsQuery += ' AND d.id = ?';
      documentsParams.push(documentId);
    }

    // Parameters: userId (dc JOIN), userId (om JOIN), userId (owner check), userId (dc check), [documentId]
    const documents = await TransactionManager.queryAll(db, documentsQuery, documentsParams);

    if (documents.length === 0) {
      return res.json({ 
        entries: [],
        pagination: {
          total: 0,
          limit,
          offset,
          hasMore: false
        }
      });
    }

    const documentIds = documents.map(d => d.id);
    const placeholders = documentIds.map(() => '?').join(',');

    // Build query with optional time filter
    let timeFilter = '';
    let params = documentIds;

    if (since) {
      timeFilter = ' AND COALESCE(h.accepted_at, h.created_at) > ?';
      params = [...documentIds, since];
    }

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM history h
      JOIN paragraphs p ON h.paragraph_id = p.id
      JOIN documents d ON p.document_id = d.id
      WHERE p.document_id IN (${placeholders})
        AND h.approval_percentage >= COALESCE(d.acceptance_threshold, 75.0)
        ${timeFilter}
    `;
    
    const countResult = await TransactionManager.query(db, countQuery, params);
    const total = countResult?.total || 0;

    // Get history entries with pagination
    const query = `
      SELECT
        h.id,
        h.paragraph_id,
        h.new_text as text,
        h.old_text,
        h.approval_percentage,
        COALESCE(h.accepted_at, h.created_at) as accepted_at,
        h.proposal_id,
        h.user_id as history_user_id,
        h.heading_level as heading_level,

        -- Get proposal type from proposals table (if proposal_id exists)
        COALESCE(pr.type, 
          CASE WHEN p.order_index = 1 THEN 'TITLE' ELSE 'BODY' END
        ) as type,

        -- Document and paragraph info
        d.id as document_id,
        d.title as document_title,
        d.description as document_description,
        p.title as paragraph_title,

        -- User info
        u.id as user_id,
        u.name as user_name,
        u.email as user_email,
        u.avatar as user_avatar

      FROM history h
      JOIN paragraphs p ON h.paragraph_id = p.id
      JOIN documents d ON p.document_id = d.id
      JOIN users u ON h.user_id = u.id
      LEFT JOIN proposals pr ON h.proposal_id = pr.id

      WHERE p.document_id IN (${placeholders})
        AND h.approval_percentage >= COALESCE(d.acceptance_threshold, 75.0)
        ${timeFilter}

      ORDER BY COALESCE(h.accepted_at, h.created_at) DESC
      LIMIT ? OFFSET ?
    `;

    const queryParams = [...params, limit, offset];
    const rows = await TransactionManager.queryAll(db, query, queryParams);

    // Format the results
    const entries = rows.map((row) => {
      // Parse accepted_at date
      let acceptedAtDate;
      if (row.accepted_at instanceof Date) {
        acceptedAtDate = row.accepted_at;
      } else if (typeof row.accepted_at === 'string') {
        acceptedAtDate = new Date(row.accepted_at);
      } else {
        acceptedAtDate = new Date();
      }

      return {
        // VersionHistory fields
        id: String(row.id),
        paragraphId: String(row.paragraph_id),
        userId: String(row.user_id),
        text: String(row.text || ''),
        oldText: row.old_text ? String(row.old_text) : null,
        proposalId: row.proposal_id ? String(row.proposal_id) : null,
        acceptedAt: acceptedAtDate.toISOString(),
        approvalPercentage: Number(row.approval_percentage || 0),
        type: row.type || 'BODY',
        headingLevel: row.heading_level || undefined,
        user: {
          id: String(row.user_id),
          name: String(row.user_name || 'Unknown'),
          email: row.user_email ? String(row.user_email) : undefined,
          avatar: row.user_avatar || undefined,
        },
        // Document context
        documentId: String(row.document_id),
        documentTitle: String(row.document_title || 'Untitled'),
        documentDescription: row.document_description ? String(row.document_description) : undefined,
        paragraphTitle: row.paragraph_title ? String(row.paragraph_title) : undefined,
      };
    });

    const hasMore = offset + entries.length < total;

    logger.debug('Found history entries for user', { 
      userId, 
      count: entries.length, 
      total,
      offset,
      hasMore 
    });

    res.json({
      entries,
      pagination: {
        total,
        limit,
        offset,
        hasMore
      }
    });

  } catch (error) {
    // Re-throw ApiError instances
    if (error instanceof ApiError) {
      throw error;
    }
    const errorMessage = error?.message || error?.toString() || String(error) || 'Unknown error';
    const errorStack = error?.stack || 'No stack trace available';
    logger.error('Error in agreed history API', { error: errorMessage, stack: errorStack, userId });
    throw ApiError.database('Failed to fetch agreed history', { originalError: errorMessage }, 'FETCH_AGREED_HISTORY_FAILED');
  }
}));

module.exports = router;

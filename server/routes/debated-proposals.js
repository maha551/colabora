const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { logger } = require('../middleware/logger');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const TransactionManager = require('../database/services/TransactionManager');
const { getUserId, hasNewCommentSchema } = require('../utils/routeHelpers');
const VoterManager = require('../modules/voting');
const router = express.Router();

// GET /api/debated-proposals - Get most debated proposals for user's documents
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const userId = getUserId(req);

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
        AND (d.document_kind IS NULL OR d.document_kind = 'standard')
    `;

    // Parameters: userId (dc JOIN), userId (om JOIN), userId (owner check), userId (dc check)
    const documents = await TransactionManager.queryAll(db, documentsQuery, [userId, userId, userId, userId]);

    if (documents.length === 0) {
      return res.json({ proposals: [] });
    }

    const documentIds = documents.map(d => d.id);

    // Get eligible voter counts per document (VoterManager excludes org from org docs)
    const voterCountByDoc = await VoterManager.getEligibleVoterCountsByDocument(db, documentIds);

    // Get debated proposals with engagement scoring
    const debatedProposals = await calculateDebatedProposals(db, documentIds, documents, userId, voterCountByDoc);

    // Return top 10 most debated proposals
    res.json({ proposals: debatedProposals.slice(0, 10) });

  } catch (error) {
    // Re-throw ApiError instances
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error in debated proposals API', { error: error.message, stack: error.stack, userId });
    throw ApiError.database('Failed to fetch debated proposals', { originalError: error.message }, 'FETCH_DEBATED_PROPOSALS_FAILED');
  }
}));

// Calculate debated proposals with engagement scoring
async function calculateDebatedProposals(db, documentIds, documents, userId, voterCountByDoc = {}) {
  if (documentIds.length === 0) return [];

  const placeholders = documentIds.map(() => '?').join(',');
  
  const now = 'NOW()';
  const hoursOldSql = `EXTRACT(EPOCH FROM (${now} - p.created_at)) / 3600`;
  const dateFilterSql = `p.created_at > ${now} - INTERVAL '30 days'`;

  const query = `
    SELECT
      p.id,
      p.paragraph_id,
      p.user_id,
      p.text as proposed_text,
      p.type,
      p.heading_level,
      p.created_at,

      -- User info
      u.name as user_name,
      u.email as user_email,
      u.avatar as user_avatar,

      -- Document and paragraph info
      d.title as document_title,
      par.text as current_text,
      par.title as paragraph_title,
      par.document_id,

      -- Engagement metrics
      COALESCE(comment_counts.comment_count, 0) as comment_count,
      COALESCE(vote_counts.total_votes, 0) as total_votes,
      COALESCE(vote_counts.pro_votes, 0) as pro_votes,
      COALESCE(vote_counts.contra_votes, 0) as contra_votes,
      COALESCE(vote_counts.neutral_votes, 0) as neutral_votes,

      -- Time factor for scoring
      ${hoursOldSql} as hours_old

    FROM proposals p
    JOIN users u ON p.user_id = u.id
    JOIN paragraphs par ON p.paragraph_id = par.id
    JOIN documents d ON par.document_id = d.id

    -- Left join for comment counts
    LEFT JOIN (
      SELECT commentable_id as proposal_id, COUNT(*) as comment_count
      FROM comments
      WHERE commentable_type = 'proposal'
      GROUP BY commentable_id
    ) comment_counts ON p.id = comment_counts.proposal_id

    -- Left join for vote counts
    LEFT JOIN (
      SELECT
        proposal_id,
        COUNT(*) as total_votes,
        SUM(CASE WHEN vote = 'PRO' THEN 1 ELSE 0 END) as pro_votes,
        SUM(CASE WHEN vote = 'CONTRA' THEN 1 ELSE 0 END) as contra_votes,
        SUM(CASE WHEN vote = 'NEUTRAL' THEN 1 ELSE 0 END) as neutral_votes
      FROM votes
      GROUP BY proposal_id
    ) vote_counts ON p.id = vote_counts.proposal_id

    WHERE par.document_id IN (${placeholders})
      AND p.approved = false
      AND ${dateFilterSql}  -- Only recent proposals
      AND d.status != 'rejected'
      AND (d.status != 'agreed' OR d.amendments_open = 1)
      AND (d.document_kind IS NULL OR d.document_kind = 'standard')

    ORDER BY p.created_at DESC
  `;

  try {
    const rows = await TransactionManager.queryAll(db, query, documentIds);

    if (rows.length === 0) {
      return [];
    }

    // Get proposal IDs for comments query
    const proposalIds = rows.map(row => row.id);
    
    // Batch fetch all comments - check schema for backward compatibility
    const commentsByProposal = {};
    if (proposalIds.length > 0) {
      try {
        const hasNewSchema = await hasNewCommentSchema(db);
        const commentPlaceholders = proposalIds.map(() => '?').join(',');
        const commentWhereClause = hasNewSchema
          ? `c.commentable_type = 'proposal' AND c.commentable_id IN (${commentPlaceholders})`
          : `c.proposal_id IN (${commentPlaceholders})`;
        
        const allComments = await TransactionManager.queryAll(db, `
          SELECT c.*,
                 u.name as user_name,
                 u.email as user_email,
                 u.avatar as user_avatar,
                 pc.user_id as parent_user_id,
                 pu.name as parent_user_name
          FROM comments c
          JOIN users u ON c.user_id = u.id
          LEFT JOIN comments pc ON c.parent_id = pc.id
          LEFT JOIN users pu ON pc.user_id = pu.id
          WHERE ${commentWhereClause} AND c.deleted_at IS NULL
          ORDER BY c.created_at ASC
        `, proposalIds);
        
        // Group comments by proposal_id (handle both old and new schema)
        allComments.forEach(comment => {
          const proposalId = hasNewSchema ? comment.commentable_id : comment.proposal_id;
          if (!commentsByProposal[proposalId]) {
            commentsByProposal[proposalId] = [];
          }
          commentsByProposal[proposalId].push(comment);
        });
      } catch (err) {
        logger.error('Error batch fetching comments for proposals', { error: err.message });
        // Continue with empty object - proposals will have empty comments arrays
      }
    }

    // Batch optimization: Fetch all document settings and votes upfront
    // This eliminates N+1 queries by fetching all needed data in batch before the map
    const uniqueDocumentIds = [...new Set(rows.map(r => r.document_id))];
    const docSettingsPlaceholders = uniqueDocumentIds.map(() => '?').join(',');
    let docSettingsMap = new Map();
    
    if (uniqueDocumentIds.length > 0) {
      try {
        const docSettings = await TransactionManager.queryAll(db, 
          `SELECT id, voting_anonymous FROM documents WHERE id IN (${docSettingsPlaceholders})`, 
          uniqueDocumentIds
        );
        docSettings.forEach(d => {
          docSettingsMap.set(d.id, d);
        });
      } catch (err) {
        logger.error('Error batch fetching document voting_anonymous settings', { error: err.message });
        // Continue with empty map - will default to non-anonymous
      }
    }

    // Batch fetch all votes for main proposals
    const allProposalIds = rows.map(r => r.id);
    const votesByProposal = new Map();
    
    if (allProposalIds.length > 0) {
      try {
        const votesPlaceholders = allProposalIds.map(() => '?').join(',');
        const allVotes = await TransactionManager.queryAll(db,
          `SELECT v.*, u.name as user_name
           FROM votes v
           JOIN users u ON v.user_id = u.id
           WHERE v.proposal_id IN (${votesPlaceholders})
           ORDER BY v.created_at ASC`,
          allProposalIds
        );
        
        // Group votes by proposal_id
        allVotes.forEach(vote => {
          if (!votesByProposal.has(vote.proposal_id)) {
            votesByProposal.set(vote.proposal_id, []);
          }
          votesByProposal.get(vote.proposal_id).push(vote);
        });
      } catch (err) {
        logger.error('Error batch fetching votes for proposals', { error: err.message });
        // Continue with empty map - proposals will have empty votes arrays
      }
    }

    // Calculate debate scores and format results with actual vote objects
    const scoredProposals = await Promise.all(rows.map(async (row) => {
      const debateScore = calculateDebateScore(row);

      // Get document's voting_anonymous setting from batch-fetched map
      let isAnonymous = false;
      try {
        const docSettings = docSettingsMap.get(row.document_id);
        isAnonymous = docSettings?.voting_anonymous === true;
      } catch (err) {
        logger.error('Error getting document voting_anonymous setting from map', { error: err.message, documentId: row.document_id });
        // Default to non-anonymous if we can't determine
      }

      // Get actual votes for this proposal from batch-fetched map
      let processedVotes = [];
      try {
        const votes = votesByProposal.get(row.id) || [];

        // Process votes following the exact pattern from server/routes/proposals.js lines 196-209
        processedVotes = votes.map(vote => {
          // Map database fields to frontend format
          const voteData = {
            id: vote.id,
            proposalId: row.id,
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
        logger.error('Error fetching votes for proposal', { error: err.message, proposalId: row.id });
        // Continue with empty votes array if there's an error
      }

      // Fetch other proposals for the same paragraph and type (excluding current and approved)
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
          row.id,
          row.type
        ]);

        // Batch fetch votes for all other proposals (optimization: single query instead of N queries)
        const otherProposalIds = otherProposalsRows.map(op => op.id);
        const otherVotesByProposal = new Map();
        
        if (otherProposalIds.length > 0) {
          try {
            const otherVotesPlaceholders = otherProposalIds.map(() => '?').join(',');
            const allOtherVotes = await TransactionManager.queryAll(db,
              `SELECT v.*, u.name as user_name
               FROM votes v
               JOIN users u ON v.user_id = u.id
               WHERE v.proposal_id IN (${otherVotesPlaceholders})
               ORDER BY v.created_at ASC`,
              otherProposalIds
            );
            
            // Group votes by proposal_id
            allOtherVotes.forEach(vote => {
              if (!otherVotesByProposal.has(vote.proposal_id)) {
                otherVotesByProposal.set(vote.proposal_id, []);
              }
              otherVotesByProposal.get(vote.proposal_id).push(vote);
            });
          } catch (err) {
            logger.error('Error batch fetching votes for other proposals', { error: err.message, proposalId: row.id });
            // Continue with empty map - other proposals will have empty votes arrays
          }
        }

        // Process other proposals using batch-fetched votes
        for (const otherProposal of otherProposalsRows) {
          let otherVotes = [];
          try {
            const votes = otherVotesByProposal.get(otherProposal.id) || [];

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
            logger.error('Error fetching votes for other proposal', { error: err.message, proposalId: otherProposal.id });
          }

          otherProposals.push({
            id: otherProposal.id,
            paragraphId: row.paragraph_id,
            documentId: row.document_id,
            documentTitle: row.document_title,
            paragraphTitle: row.paragraph_title,
            proposedText: otherProposal.proposed_text,
            currentText: row.current_text,
            type: otherProposal.type,
            headingLevel: row.heading_level,
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
        logger.error('Error fetching other proposals', { error: err.message, proposalId: row.id, paragraphId: row.paragraph_id });
        // Continue with empty array if there's an error
      }

      // Fetch agreed version (most recent history entry for this paragraph and type)
      let agreedVersion = null;
      try {
        const agreedVersionQuery = `
          SELECT 
            h.id,
            h.new_text as accepted_text,
            h.old_text as previous_text,
            h.proposal_id,
            COALESCE(h.accepted_at, h.created_at) as accepted_at,
            COALESCE(pr.type, ?) as proposal_type
          FROM history h
          LEFT JOIN proposals pr ON h.proposal_id = pr.id
          WHERE h.paragraph_id = ?
            AND COALESCE(pr.type, ?) = ?
          ORDER BY h.created_at DESC
          LIMIT 1
        `;
        
        const agreedVersionRow = await TransactionManager.query(db, agreedVersionQuery, [
          row.type, // fallback type
          row.paragraph_id,
          row.type, // fallback type
          row.type
        ]);

        if (agreedVersionRow) {
          agreedVersion = {
            text: agreedVersionRow.accepted_text,
            previousText: agreedVersionRow.previous_text,
            proposalId: agreedVersionRow.proposal_id,
            acceptedAt: agreedVersionRow.accepted_at,
            type: agreedVersionRow.proposal_type || row.type,
          };
        }
      } catch (err) {
        logger.error('Error fetching agreed version', { error: err.message, proposalId: row.id, paragraphId: row.paragraph_id });
        // Continue with null if there's an error
      }

      // Get comments from batch-fetched data and format them
      const rawComments = commentsByProposal[row.id] || [];
      const processedComments = rawComments.map(comment => ({
        id: comment.id,
        commentableType: 'proposal',
        commentableId: comment.commentable_id || comment.proposal_id || row.id,
        proposalId: comment.proposal_id || comment.commentable_id || row.id, // backward compatibility
        userId: comment.user_id,
        text: comment.text,
        parentId: comment.parent_id || undefined,
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
        deletedAt: comment.deleted_at || null,
        editedAt: comment.edited_at || null,
        editCount: comment.edit_count || 0,
        user: {
          id: comment.user_id,
          name: comment.user_name,
          email: comment.user_email,
          avatar: comment.user_avatar
        },
        parent: comment.parent_id ? {
          id: comment.parent_id,
          user: {
            id: comment.parent_user_id,
            name: comment.parent_user_name
          }
        } : null,
        replies: []
      }));

      return {
        id: row.id,
        debateScore: Math.round(debateScore * 100) / 100, // Round to 2 decimal places
        commentCount: row.comment_count,
        controversyScore: row.total_votes > 0 ?
          Math.round((row.pro_votes / row.total_votes) * (row.contra_votes / row.total_votes) * 400) / 100 : 0,
        engagement: {
          comments: row.comment_count,
          proPercentage: row.total_votes > 0 ? Math.round((row.pro_votes / row.total_votes) * 100) : 0,
          contraPercentage: row.total_votes > 0 ? Math.round((row.contra_votes / row.total_votes) * 100) : 0,
          neutralPercentage: row.total_votes > 0 ?
            Math.round(((row.neutral_votes) / row.total_votes) * 100) : 0,
        },
        comments: processedComments,
        // Include all existing proposal fields
        paragraphId: row.paragraph_id,
        documentId: row.document_id,
        documentTitle: row.document_title,
        paragraphTitle: row.paragraph_title,
        proposedText: row.proposed_text,
        currentText: row.current_text,
        type: row.type,
        headingLevel: row.heading_level,
        createdAt: row.created_at,
        user: {
          id: row.user_id,
          name: row.user_name,
          email: row.user_email,
          avatar: row.user_avatar,
        },
        votes: processedVotes, // Return actual vote objects instead of just counts
        totalUsers: voterCountByDoc[row.document_id] ?? 1,
        otherProposals: otherProposals, // Other proposals for comparison
        agreedVersion: agreedVersion, // Agreed version if available
      };
    }));

    // Sort by debate score descending
    scoredProposals.sort((a, b) => b.debateScore - a.debateScore);

    return scoredProposals;
  } catch (err) {
    logger.error('Error querying debated proposals', { error: err.message, documentIds });
    throw err;
  }
}

// Calculate debate score based on multiple factors
function calculateDebateScore(row) {
  const commentFactor = (row.comment_count || 0) * 2.0; // Comments are valuable engagement

  // Controversy factor: high when both PRO and CONTRA votes are significant
  const controversyFactor = row.total_votes > 0 ?
    (row.pro_votes / row.total_votes) * (row.contra_votes / row.total_votes) * 4.0 : 0;

  // Time decay factor: newer proposals get slight boost, very old ones are penalized
  const hoursOld = row.hours_old || 0;
  let timeFactor;
  if (hoursOld < 24) {
    timeFactor = 1.2; // Fresh proposals get boost
  } else if (hoursOld < 168) { // 7 days
    timeFactor = 1.0; // Normal time factor
  } else {
    timeFactor = Math.max(0.1, 1.0 - (hoursOld - 168) / 720); // Gradual decay after 7 days
  }

  // Participation factor: more votes = more engagement
  const participationFactor = Math.min(row.total_votes / 5, 2.0); // Cap at 2.0 for proposals with 5+ votes

  const totalScore = (commentFactor + controversyFactor + participationFactor) * timeFactor;

  return totalScore;
}

module.exports = router;

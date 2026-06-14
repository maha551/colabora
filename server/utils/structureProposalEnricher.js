/**
 * Structure Proposal Enricher Utility
 * Enriches structure proposals with operations, votes, and comments
 * Uses UnifiedVotingService for vote formatting
 */

const TransactionManager = require('../database/services/TransactionManager');
const UnifiedVotingService = require('../modules/unified-voting');
const { logger } = require('../middleware/logger');

/**
 * Enrich a structure proposal with operations, votes, and comments
 * @param {Object} db - Database instance
 * @param {Object} proposal - Structure proposal from database (with user_name, user_email joined)
 * @param {boolean} isAnonymous - Whether voting is anonymous
 * @param {string} userId - Current user ID (for anonymous voting logic)
 * @param {Array} [preFetchedOperations] - Optional pre-fetched operations array (for batch optimization)
 * @param {Array} [preFetchedVotes] - Optional pre-fetched votes array (for batch optimization)
 * @param {Array} [preFetchedComments] - Optional pre-fetched comments array (for batch optimization)
 * @returns {Promise<Object>} Enriched structure proposal
 */
async function enrichStructureProposal(db, proposal, isAnonymous, userId, preFetchedOperations = null, preFetchedVotes = null, preFetchedComments = null) {
  const proposalId = proposal.id;
  const documentId = proposal.document_id;

  let operations = [];
  let votes = [];
  let comments = [];

  // Use pre-fetched operations if provided, otherwise fetch individually
  if (preFetchedOperations !== null) {
    operations = preFetchedOperations;
  } else {
    const operationsQuery = `
      SELECT id, structure_proposal_id, operation_type, source_paragraph_ids, target_paragraph_id, 
        new_position_index, new_parent_id, new_text, new_heading_level, operation_data, created_at
      FROM structure_operations
      WHERE structure_proposal_id = ?
      ORDER BY created_at ASC
    `;

    try {
      operations = await TransactionManager.queryAll(db, operationsQuery, [proposalId]);
    } catch (err) {
      // If table doesn't exist, return empty operations
      if (!err.message.includes('no such table')) {
        logger.error('Error fetching operations', { error: err.message, proposalId, documentId });
      }
    }
  }

  // Use pre-fetched votes if provided, otherwise fetch individually
  if (preFetchedVotes !== null) {
    // Pre-fetched votes already have user info joined
    votes = preFetchedVotes;
  } else {
    const votesQuery = `
      SELECT v.*,
             u.name as user_name,
             u.email as user_email
      FROM structure_proposal_votes v
      LEFT JOIN users u ON v.user_id = u.id
      WHERE v.structure_proposal_id = ?
      ORDER BY v.created_at ASC
    `;

    try {
      votes = await TransactionManager.queryAll(db, votesQuery, [proposalId]);
    } catch (err) {
      // If table doesn't exist, return empty votes
      if (!err.message.includes('no such table')) {
        logger.error('Error fetching votes', { error: err.message, proposalId, documentId });
      }
    }
  }

  // Fetch and format votes using UnifiedVotingService
  try {
    const rawVotes = votes;
    
    // Use UnifiedVotingService to format votes
    const formattedVotes = UnifiedVotingService.formatVotesForResponse(rawVotes, isAnonymous, userId);
    
    // Transform to match current API structure exactly
    // Current structure includes userId field in anonymous mode for own vote
    votes = formattedVotes.map(vote => {
      const voteData = {
        id: vote.id,
        vote: vote.vote,
        createdAt: vote.createdAt || vote.created_at
      };
      
      // In anonymous mode, include userId for own vote (matching current behavior)
      if (isAnonymous && vote.userId === userId) {
        voteData.userId = vote.userId;
      }
      
      // Include user object if present (UnifiedVotingService handles this)
      if (vote.user) {
        voteData.user = vote.user;
      }
      
      return voteData;
    });
  } catch (err) {
    // If table doesn't exist, return empty votes
    if (!err.message.includes('no such table')) {
      logger.error('Error fetching votes', { error: err.message, proposalId, documentId });
    }
  }

  // Use pre-fetched comments if provided, otherwise fetch individually
  if (preFetchedComments !== null) {
    // Pre-fetched comments already have user info joined, just format them
    comments = (preFetchedComments || []).map(comment => ({
      id: comment.id,
      commentableType: comment.commentable_type,
      commentableId: comment.commentable_id,
      structureProposalId: comment.commentable_id, // For backward compatibility
      userId: comment.user_id,
      text: comment.text,
      parentId: comment.parent_id || undefined,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      deletedAt: comment.deleted_at || null,
      editedAt: comment.edited_at || null,
      editCount: comment.edit_count || 0,
      upvoteCount: comment.upvote_count != null ? Number(comment.upvote_count) : 0,
      userUpvoted: false,
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
  } else {
    const commentsQuery = `
      SELECT c.*,
             u.name as user_name,
             u.email as user_email,
             u.avatar as user_avatar,
             pc.user_id as parent_user_id,
             pu.name as parent_user_name
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN comments pc ON c.parent_id = pc.id
      LEFT JOIN users pu ON pc.user_id = pu.id
      WHERE c.commentable_type = 'structure_proposal'
        AND c.commentable_id = ?
        AND c.deleted_at IS NULL
      ORDER BY c.created_at ASC
    `;

    try {
      const rawComments = await TransactionManager.queryAll(db, commentsQuery, [proposalId]);
      comments = (rawComments || []).map(comment => ({
        id: comment.id,
        commentableType: comment.commentable_type,
        commentableId: comment.commentable_id,
        structureProposalId: comment.commentable_id, // For backward compatibility
        userId: comment.user_id,
        text: comment.text,
        parentId: comment.parent_id || undefined,
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
        deletedAt: comment.deleted_at || null,
        editedAt: comment.edited_at || null,
        editCount: comment.edit_count || 0,
        upvoteCount: comment.upvote_count != null ? Number(comment.upvote_count) : 0,
        userUpvoted: false,
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
    } catch (err) {
      // If table doesn't exist, return empty comments
      if (!err.message.includes('no such table')) {
        logger.error('Error fetching comments', { error: err.message, proposalId, documentId });
      }
    }
  }

  // Set userUpvoted for each comment from comment_upvotes
  if (comments.length > 0 && userId) {
    try {
      const commentIds = comments.map(c => c.id);
      const placeholders = commentIds.map(() => '?').join(',');
      const upvotedRows = await TransactionManager.queryAll(db, `
        SELECT comment_id FROM comment_upvotes WHERE user_id = ? AND comment_id IN (${placeholders})
      `, [userId, ...commentIds]);
      const upvotedSet = new Set(upvotedRows.map(r => r.comment_id));
      comments.forEach(c => { c.userUpvoted = upvotedSet.has(c.id); });
    } catch (err) {
      logger.debug('Error fetching comment upvotes for structure proposal', { error: err.message, proposalId });
    }
  }

  // Compute quorum info for Complete vote button (participation threshold)
  let quorumMet = false;
  let quorumRequired = 0;
  try {
    const document = await TransactionManager.query(db, 'SELECT acceptance_threshold, organization_id FROM documents WHERE id = ?', [documentId]);
    const totalEligible = await UnifiedVotingService.getEligibleVoterCount(db, documentId, 'document');
    const voteAggregation = await UnifiedVotingService.aggregateVotes(db, 'structure_proposal_votes', 'structure_proposal_id', proposalId);
    const acceptanceThreshold = document?.acceptance_threshold || 75.0;
    const approvalResult = await UnifiedVotingService.checkApproval({
      db,
      proposalId,
      organizationId: document?.organization_id || null,
      proVotes: voteAggregation.proVotes,
      totalVotes: voteAggregation.totalVotes,
      totalEligible,
      acceptanceThreshold
    });
    quorumMet = approvalResult.quorumMet;
    quorumRequired = approvalResult.quorumRequired;
  } catch (err) {
    if (!err.message?.includes('no such table')) {
      logger.debug('Could not compute quorum for structure proposal', { proposalId, documentId, error: err.message });
    }
  }

  // Return enriched proposal with exact structure matching current API
  return {
    ...proposal,
    user: {
      id: proposal.user_id,
      name: proposal.user_name,
      email: proposal.user_email
    },
    operations,
    votes,
    comments,
    quorumMet,
    quorumRequired,
    votingDeadline: proposal.voting_deadline || null
  };
}

module.exports = {
  enrichStructureProposal
};


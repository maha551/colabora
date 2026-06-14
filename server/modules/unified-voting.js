/**
 * Unified Voting Service
 * Centralized service for all proposal/voting systems
 * Handles voter eligibility, approval calculations, quorum checks, and status transitions.
 *
 * SQL INJECTION PROTECTION
 * ------------------------
 * Table and column names are interpolated into raw SQL in aggregateVotes, aggregateLegacyVotes,
 * checkAndUpdateApproval, and getAllVotes. To prevent SQL injection, all such identifiers must
 * be validated against the ALLOWED_* whitelists below before use. assertAllowedIdentifier() is
 * called at the start of each method that builds dynamic SQL.
 *
 * When adding a new vote or proposal table (or column) used by this module:
 * 1. Add the table/column to the appropriate ALLOWED_* constant.
 * 2. Ensure callers pass only whitelisted values (they are typically hardcoded in route handlers).
 *
 * Guarded interpolation sites:
 * - aggregateVotes: tableName, proposalIdColumn
 * - aggregateLegacyVotes: tableName, proposalIdColumn
 * - checkAndUpdateApproval: voteTable, proposalIdColumn, proposalTable, proposalIdColumnInProposalTable, approvalColumn, statusCondition
 * - getAllVotes: tableName, proposalIdColumn
 */

const { logger } = require('../middleware/logger');
const VoterManager = require('./voting');
const TransactionManager = require('../database/services/TransactionManager');
const BoundedCache = require('../utils/BoundedCache');

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const VOTE_AGG_CACHE_TTL = 2 * 60 * 1000; // 2 minutes
const APPROVAL_CACHE_TTL = 1 * 60 * 1000; // 1 minute

// --- SQL injection whitelists: do not interpolate unvalidated identifiers into SQL ---

/**
 * Allowed vote table names. Used in: aggregateVotes, aggregateLegacyVotes, getAllVotes.
 * Add new vote tables here when introducing new voting flows.
 */
const ALLOWED_VOTE_TABLES = Object.freeze([
  'votes',
  'governance_rule_proposal_votes',
  'structure_proposal_votes',
  'document_tree_proposal_votes',
  'document_deletion_votes',
  'document_votes'
]);

/**
 * Allowed proposal table names. Used in: checkAndUpdateApproval (UPDATE ... SET ... WHERE ...).
 * Add new proposal tables here when introducing new proposal types.
 */
const ALLOWED_PROPOSAL_TABLES = Object.freeze([
  'proposals',
  'structure_proposals',
  'document_tree_proposals'
]);

/**
 * Allowed column names for the proposal/document ID in vote tables (e.g. proposal_id, document_id).
 * Used in: aggregateVotes, aggregateLegacyVotes, getAllVotes, checkAndUpdateApproval (voteTable column).
 */
const ALLOWED_PROPOSAL_ID_COLUMNS = Object.freeze([
  'proposal_id',
  'structure_proposal_id',
  'document_id'
]);

/**
 * Allowed column names for approval status in proposal tables (e.g. approved, status).
 * Used in: checkAndUpdateApproval (SET approvalColumn = ...).
 */
const ALLOWED_APPROVAL_COLUMNS = Object.freeze(['approved', 'status']);

/**
 * Allowed column names for the proposal ID in the proposal table (typically 'id').
 * Used in: checkAndUpdateApproval (WHERE proposalIdColumnInProposalTable = ?).
 */
const ALLOWED_PROPOSAL_ID_IN_PROPOSAL_TABLE = Object.freeze(['id']);

/**
 * Allowed statusCondition fragments appended to UPDATE WHERE in checkAndUpdateApproval.
 * Only exact string matches are allowed. Add new conditions here if a new status flow is added.
 */
const ALLOWED_STATUS_CONDITIONS = Object.freeze(['', "AND status = 'pending'"]);

/**
 * Validates that a table or column identifier is in the allowed set before use in raw SQL.
 * Prevents SQL injection when callers pass table/column names (e.g. from config or params).
 *
 * @param {string} value - Identifier to check (e.g. table name, column name)
 * @param {ReadonlySet<string>|ReadonlyArray<string>} allowed - Whitelist of allowed values
 * @param {string} label - Human-readable label for error messages (e.g. 'vote table')
 * @throws {Error} If value is not a string or is not in the allowed set
 */
function assertAllowedIdentifier(value, allowed, label) {
  const set = Array.isArray(allowed) ? new Set(allowed) : allowed;
  if (typeof value !== 'string' || !set.has(value)) {
    logger.warn('UnifiedVotingService: disallowed identifier rejected', { label, value, allowed: [...set] });
    throw new Error(`Invalid ${label}: not in whitelist`);
  }
}

const voterCountCache = new BoundedCache({ maxSize: 500 });
const governanceRulesCache = new BoundedCache({ maxSize: 200 });
const voteAggregationCache = new BoundedCache({ maxSize: 1000 });
const approvalResultCache = new BoundedCache({ maxSize: 1000 });

class UnifiedVotingService {
  /**
   * Get eligible voter count (with caching)
   * @param {Object} db - Database instance
   * @param {string} contextId - Document ID or organization ID
   * @param {string} contextType - 'document' or 'organization'
   * @returns {Promise<number>} Eligible voter count
   */
  static async getEligibleVoterCount(db, contextId, contextType = 'document') {
    const cacheKey = `${contextType}:${contextId}`;
    const cached = voterCountCache.get(cacheKey);
    if (cached) return cached.count;

    let count;
    if (contextType === 'document') {
      count = await VoterManager.getEligibleVoterCount(db, contextId);
    } else {
      // Organization context
      const result = await TransactionManager.query(
        db,
        'SELECT COUNT(*) as total FROM organization_members WHERE organization_id = ? AND status = ?',
        [contextId, 'active']
      );
      count = result?.total || 0;
    }

    voterCountCache.set(cacheKey, { count, timestamp: Date.now() }, CACHE_TTL);
    return count;
  }

  /**
   * Get governance rules (with caching)
   * @param {Object} db - Database instance
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} Governance rules
   */
  static async getGovernanceRules(db, organizationId) {
    const cacheKey = organizationId;
    const cached = governanceRulesCache.get(cacheKey);
    if (cached) return cached.rules;

    try {
      const GovernanceRulesService = require('../services/governance/GovernanceRulesService');
      const rulesRaw = await GovernanceRulesService.getGovernanceRules(db, organizationId);
      
      // Transform from snake_case (database) to camelCase (expected by UnifiedVotingService)
      let rules = rulesRaw;
      if (rulesRaw) {
        const { transformRulesToCamelCase } = require('../utils/governanceFieldMapping');
        rules = transformRulesToCamelCase(rulesRaw);
      }
      
      governanceRulesCache.set(cacheKey, { rules, timestamp: Date.now() }, CACHE_TTL);
      return rules;
    } catch (error) {
      logger.error('Error fetching governance rules', { error: error.message, organizationId });
      return null;
    }
  }

  /**
   * Invalidate cache for a context
   * @param {string} contextId - Document ID or organization ID
   * @param {string} contextType - 'document' or 'organization'
   * @param {string} proposalId - Optional proposal ID to invalidate proposal-specific caches
   */
  static invalidateCache(contextId, contextType = 'document', proposalId = null) {
    const cacheKey = `${contextType}:${contextId}`;
    voterCountCache.invalidate(cacheKey);
    if (contextType === 'organization') {
      governanceRulesCache.invalidate(contextId);
    }
    if (proposalId) {
      const tables = ['votes', 'governance_rule_proposal_votes', 'structure_proposal_votes',
                      'document_tree_proposal_votes', 'document_deletion_votes', 'document_votes'];
      for (const table of tables) {
        voteAggregationCache.invalidate(`vote_agg:${table}:${proposalId}`);
      }
      approvalResultCache.invalidate(`approval:${proposalId}`);
    }
  }

  /**
   * Invalidate all caches for an organization
   * @param {string} organizationId - Organization ID
   */
  static invalidateOrganizationCache(organizationId) {
    governanceRulesCache.invalidate(organizationId);
    voterCountCache.invalidate(`organization:${organizationId}`);
  }

  /**
   * Calculate approval percentage based on threshold calculation method
   * @param {Object} params - Calculation parameters
   * @param {number} params.proVotes - Number of PRO votes
   * @param {number} params.totalVotes - Total votes cast
   * @param {number} params.totalEligible - Total eligible voters
   * @param {string} params.calculationMethod - 'all_votes' or 'all_members'
   * @returns {number} Approval percentage (0-100)
   */
  static calculateApprovalPercentage({ proVotes, totalVotes, totalEligible, calculationMethod = 'all_votes' }) {
    if (calculationMethod === 'all_members') {
      // Calculate as percentage of all eligible members
      return totalEligible > 0 ? (proVotes / totalEligible) * 100 : 0;
    } else {
      // Calculate as percentage of actual votes cast (all_votes)
      return totalVotes > 0 ? (proVotes / totalVotes) * 100 : 0;
    }
  }

  /**
   * Check if quorum is met
   * @param {Object} params - Quorum parameters
   * @param {number} params.actualVotes - Actual votes cast
   * @param {number} params.totalEligible - Total eligible voters
   * @param {number} params.quorumPercentage - Quorum percentage (0-1, e.g., 0.5 for 50%)
   * @param {number} params.minVotersRequired - Minimum voters required (optional override)
   * @returns {Object} { quorumMet: boolean, quorumRequired: number }
   */
  static checkQuorum({ actualVotes, totalEligible, quorumPercentage, minVotersRequired = null }) {
    let quorumRequired;
    
    if (minVotersRequired && minVotersRequired > 0) {
      quorumRequired = minVotersRequired;
    } else {
      quorumRequired = Math.max(1, Math.ceil(totalEligible * quorumPercentage));
    }

    const quorumMet = actualVotes >= quorumRequired;
    
    return { quorumMet, quorumRequired };
  }

  /**
   * Check if proposal should be approved (with caching)
   * @param {Object} params - Approval check parameters
   * @param {Object} db - Database instance
   * @param {string} params.proposalId - Proposal ID for caching (optional)
   * @param {string} params.organizationId - Organization ID (for governance rules)
   * @param {number} params.proVotes - Number of PRO votes
   * @param {number} params.totalVotes - Total votes cast
   * @param {number} params.totalEligible - Total eligible voters
   * @param {number} params.acceptanceThreshold - Acceptance threshold percentage (0-100)
   * @param {string} params.calculationMethod - 'all_votes' or 'all_members' (optional, will fetch from governance if not provided)
   * @param {number} params.quorumPercentage - Quorum percentage (optional, will fetch from governance if not provided)
   * @param {number} params.minVotersRequired - Minimum voters required (optional override)
   * @returns {Promise<Object>} { approved: boolean, approvalPercentage: number, quorumMet: boolean, details: Object }
   */
  static async checkApproval(params) {
    const {
      db,
      proposalId = null,
      organizationId,
      proVotes,
      totalVotes,
      totalEligible,
      acceptanceThreshold,
      calculationMethod = null,
      quorumPercentage = null,
      minVotersRequired = null
    } = params;

    // Check cache if proposalId provided
    if (proposalId) {
      const cached = approvalResultCache.get(`approval:${proposalId}`);
      if (cached) return cached.result;
    }

    // Get governance rules if organization ID provided
    let governanceRules = null;
    if (organizationId) {
      governanceRules = await this.getGovernanceRules(db, organizationId);
    }

    // Use provided calculation method or get from governance rules
    const finalCalculationMethod = calculationMethod || 
      governanceRules?.thresholdCalculationMethod || 
      'all_members';

    // Use provided quorum percentage or get from governance rules
    const finalQuorumPercentage = quorumPercentage !== null
      ? quorumPercentage
      : (governanceRules?.defaultQuorumPercentage || 0.5);

    // Check quorum
    const { quorumMet, quorumRequired } = this.checkQuorum({
      actualVotes: totalVotes,
      totalEligible,
      quorumPercentage: finalQuorumPercentage,
      minVotersRequired
    });

    // Calculate approval percentage
    const approvalPercentage = this.calculateApprovalPercentage({
      proVotes,
      totalVotes,
      totalEligible,
      calculationMethod: finalCalculationMethod
    });

    // Check if approved (must meet both quorum and threshold)
    const approved = quorumMet && approvalPercentage >= acceptanceThreshold;

    const result = {
      approved,
      approvalPercentage,
      quorumMet,
      quorumRequired,
      details: {
        proVotes,
        totalVotes,
        totalEligible,
        acceptanceThreshold,
        calculationMethod: finalCalculationMethod,
        quorumPercentage: finalQuorumPercentage
      }
    };

    // Cache result if proposalId provided
    if (proposalId) {
      approvalResultCache.set(`approval:${proposalId}`, { result, timestamp: Date.now() }, APPROVAL_CACHE_TTL);
    }

    return result;
  }

  /**
   * Aggregate votes from a vote table (with caching)
   * @param {Object} db - Database instance
   * @param {string} tableName - Vote table name (e.g., 'votes', 'structure_proposal_votes')
   * @param {string} proposalIdColumn - Column name for proposal ID
   * @param {string} proposalId - Proposal ID
   * @returns {Promise<Object>} { proVotes: number, contraVotes: number, neutralVotes: number, totalVotes: number }
   */
  static async aggregateVotes(db, tableName, proposalIdColumn, proposalId) {
    assertAllowedIdentifier(tableName, ALLOWED_VOTE_TABLES, 'vote table');
    assertAllowedIdentifier(proposalIdColumn, ALLOWED_PROPOSAL_ID_COLUMNS, 'proposal ID column');

    const cacheKey = `vote_agg:${tableName}:${proposalId}`;
    const cached = voteAggregationCache.get(cacheKey);
    if (cached) return cached.result;

    const query = `
      SELECT 
        COUNT(CASE WHEN vote = 'PRO' THEN 1 END) as pro_votes,
        COUNT(CASE WHEN vote = 'CONTRA' THEN 1 END) as contra_votes,
        COUNT(CASE WHEN vote = 'NEUTRAL' THEN 1 END) as neutral_votes,
        COUNT(*) as total_votes
      FROM ${tableName}
      WHERE ${proposalIdColumn} = ?
    `;

    const result = await TransactionManager.query(db, query, [proposalId]);
    
    const aggregation = {
      proVotes: result?.pro_votes || 0,
      contraVotes: result?.contra_votes || 0,
      neutralVotes: result?.neutral_votes || 0,
      totalVotes: result?.total_votes || 0
    };

    voteAggregationCache.set(cacheKey, { result: aggregation, timestamp: Date.now() }, VOTE_AGG_CACHE_TTL);
    return aggregation;
  }

  /**
   * Aggregate legacy vote_choice format votes for backward compatibility
   * @param {Object} db - Database instance
   * @param {string} tableName - Vote table name (e.g., 'governance_rule_proposal_votes')
   * @param {string} proposalIdColumn - Column name for proposal ID
   * @param {string} proposalId - Proposal ID
   * @returns {Promise<Object>} { legacy_yes: number, legacy_no: number, legacy_abstain: number }
   */
  static async aggregateLegacyVotes(db, tableName, proposalIdColumn, proposalId) {
    assertAllowedIdentifier(tableName, ALLOWED_VOTE_TABLES, 'vote table');
    assertAllowedIdentifier(proposalIdColumn, ALLOWED_PROPOSAL_ID_COLUMNS, 'proposal ID column');

    // governance_rule_proposal_votes was migrated to vote (PRO/CONTRA/NEUTRAL) - no legacy format
    if (tableName === 'governance_rule_proposal_votes') {
      return { legacy_yes: 0, legacy_no: 0, legacy_abstain: 0 };
    }
    try {
      const legacyCounts = await TransactionManager.query(db, `
        SELECT 
          COUNT(CASE WHEN vote_choice = 'yes' THEN 1 END) as legacy_yes,
          COUNT(CASE WHEN vote_choice = 'no' THEN 1 END) as legacy_no,
          COUNT(CASE WHEN vote_choice = 'abstain' THEN 1 END) as legacy_abstain
        FROM ${tableName}
        WHERE ${proposalIdColumn} = ? AND vote IS NULL
      `, [proposalId]);
      
      return {
        legacy_yes: legacyCounts?.legacy_yes || 0,
        legacy_no: legacyCounts?.legacy_no || 0,
        legacy_abstain: legacyCounts?.legacy_abstain || 0
      };
    } catch (error) {
      logger.warn('Error counting legacy votes', { 
        error: error.message, 
        tableName,
        proposalIdColumn,
        proposalId 
      });
      return { legacy_yes: 0, legacy_no: 0, legacy_abstain: 0 };
    }
  }

  /**
   * Combine new and legacy vote counts
   * @param {Object} voteAggregation - New format vote aggregation from aggregateVotes()
   * @param {Object} legacyCounts - Legacy vote counts from aggregateLegacyVotes()
   * @returns {Object} Combined counts with votesYes, votesNo, votesAbstain, totalVotes
   */
  static combineVoteCounts(voteAggregation, legacyCounts) {
    const votesYes = voteAggregation.proVotes + (legacyCounts?.legacy_yes || 0);
    const votesNo = voteAggregation.contraVotes + (legacyCounts?.legacy_no || 0);
    const votesAbstain = voteAggregation.neutralVotes + (legacyCounts?.legacy_abstain || 0);
    const totalVotes = voteAggregation.totalVotes + (legacyCounts?.legacy_yes || 0) + (legacyCounts?.legacy_no || 0) + (legacyCounts?.legacy_abstain || 0);
    
    return { votesYes, votesNo, votesAbstain, totalVotes };
  }

  /**
   * Format votes for API response with anonymity handling
   * @param {Array} votes - Raw vote records from database (with user_name, user_email joined)
   * @param {boolean} isAnonymous - Whether voting is anonymous
   * @param {string} currentUserId - Current user ID (for showing own vote in anonymous mode)
   * @returns {Array} Array of formatted votes
   */
  static formatVotesForResponse(votes, isAnonymous = false, currentUserId = null) {
    return (votes || []).map(v => ({
      id: v.id,
      userId: v.user_id,
      vote: v.vote,
      createdAt: v.created_at,
      user: isAnonymous && v.user_id !== currentUserId
        ? undefined
        : { id: v.user_id, name: v.user_name, email: v.user_email }
    }));
  }

  /**
   * Check and update proposal approval status
   * Generic method that handles the common approval check pattern
   * @param {Object} db - Database instance
   * @param {Object} params - Approval check parameters
   * @param {string} params.proposalId - Proposal ID
   * @param {string} params.contextId - Document ID or organization ID
   * @param {string} params.contextType - 'document' or 'organization'
   * @param {string} params.voteTable - Vote table name (e.g., 'votes', 'structure_proposal_votes')
   * @param {string} params.proposalIdColumn - Column name for proposal ID in vote table
   * @param {string} params.proposalTable - Proposal table name (e.g., 'proposals', 'structure_proposals')
   * @param {string} params.proposalIdColumnInProposalTable - Column name for proposal ID in proposal table (usually 'id')
   * @param {string} params.approvalColumn - Column name for approval status (e.g., 'approved', 'status')
   * @param {number} params.acceptanceThreshold - Acceptance threshold percentage (0-100)
   * @param {string} params.organizationId - Organization ID (for governance rules)
   * @param {Function} params.onApproved - Optional callback when approved (receives approvalResult)
   * @param {Function} params.onNotApproved - Optional callback when not approved
   * @param {boolean} params.autoApprovePersonal - Whether to auto-approve for single-voter documents (default: false)
   * @param {Object} params.documentInfo - Optional document info object with ownership_type for auto-approve check
   * @param {string} params.statusValue - Optional status value to set when approved (for status-based proposals like 'approved')
   * @param {string} params.statusCondition - Optional WHERE condition for status update (e.g., "AND status = 'pending'")
   * @returns {Promise<Object>} { approved: boolean, approvalResult: Object }
   */
  static async checkAndUpdateApproval(db, params) {
    const {
      proposalId,
      contextId,
      contextType = 'document',
      voteTable,
      proposalIdColumn,
      proposalTable,
      proposalIdColumnInProposalTable = 'id',
      approvalColumn = 'approved',
      acceptanceThreshold,
      organizationId = null,
      onApproved = null,
      onNotApproved = null,
      autoApprovePersonal = false,
      documentInfo = null,
      statusValue = null,
      statusCondition = ''
    } = params;

    assertAllowedIdentifier(voteTable, ALLOWED_VOTE_TABLES, 'vote table');
    assertAllowedIdentifier(proposalIdColumn, ALLOWED_PROPOSAL_ID_COLUMNS, 'proposal ID column');
    assertAllowedIdentifier(proposalTable, ALLOWED_PROPOSAL_TABLES, 'proposal table');
    assertAllowedIdentifier(proposalIdColumnInProposalTable, ALLOWED_PROPOSAL_ID_IN_PROPOSAL_TABLE, 'proposal ID column in proposal table');
    assertAllowedIdentifier(approvalColumn, ALLOWED_APPROVAL_COLUMNS, 'approval column');
    if (!ALLOWED_STATUS_CONDITIONS.includes(statusCondition)) {
      logger.warn('UnifiedVotingService: disallowed statusCondition rejected', { statusCondition });
      throw new Error('Invalid statusCondition: not in whitelist');
    }

    try {
      // Get total eligible voters using unified service (with caching)
      const totalEligible = await this.getEligibleVoterCount(db, contextId, contextType);

      // Auto-approve for personal documents when owner is the sole collaborator
      if (autoApprovePersonal && documentInfo && documentInfo.ownership_type === 'personal' && totalEligible === 1) {
        const updateQuery = statusValue
          ? `UPDATE ${proposalTable} SET ${approvalColumn} = ?, updated_at = CURRENT_TIMESTAMP WHERE ${proposalIdColumnInProposalTable} = ?`
          : `UPDATE ${proposalTable} SET ${approvalColumn} = true, updated_at = CURRENT_TIMESTAMP WHERE ${proposalIdColumnInProposalTable} = ?`;
        
        const updateParams = statusValue ? [statusValue, proposalId] : [proposalId];
        
        await TransactionManager.execute(db, updateQuery, updateParams);
        logger.debug('Auto-approved proposal for personal document with only owner', { proposalId, contextId });
        
        if (onApproved) {
          await onApproved({ approved: true, autoApproved: true });
        }
        
        return { approved: true, autoApproved: true };
      }

      // Aggregate votes using unified service
      const voteAggregation = await this.aggregateVotes(db, voteTable, proposalIdColumn, proposalId);
      const { proVotes, totalVotes } = voteAggregation;

      if (totalVotes === 0) {
        if (onNotApproved) {
          await onNotApproved({ approved: false, reason: 'no_votes' });
        }
        return { approved: false, reason: 'no_votes' };
      }

      // Use unified service to check approval (handles calculation method correctly)
      const approvalResult = await this.checkApproval({
        db,
        proposalId,
        organizationId,
        proVotes,
        totalVotes,
        totalEligible,
        acceptanceThreshold
      });

      // Update proposal approval status atomically (TIME.2 fix: prevent race conditions)
      if (approvalResult.approved) {
        // Build atomic update query that only updates if not already approved
        // For boolean 'approved' column, check that it's not already 1/true
        // For status column, use statusCondition which should include status check
        let atomicCondition = statusCondition || '';
        
        // If using boolean 'approved' column, add condition to prevent duplicate approvals
        if (approvalColumn === 'approved' && !statusValue) {
          atomicCondition = atomicCondition 
            ? `${atomicCondition} AND ${approvalColumn} = false`
            : `AND ${approvalColumn} = false`;
        }
        
        const updateQuery = statusValue
          ? `UPDATE ${proposalTable} SET ${approvalColumn} = ?, updated_at = CURRENT_TIMESTAMP WHERE ${proposalIdColumnInProposalTable} = ? ${atomicCondition}`
          : `UPDATE ${proposalTable} SET ${approvalColumn} = true, updated_at = CURRENT_TIMESTAMP WHERE ${proposalIdColumnInProposalTable} = ? ${atomicCondition}`;
        
        const updateParams = statusValue ? [statusValue, proposalId] : [proposalId];
        
        const result = await TransactionManager.execute(db, updateQuery, updateParams);
        
        // Check if update succeeded (0 rows means proposal was already approved or status changed)
        if (result.changes === 0) {
          logger.debug('Proposal approval skipped - already approved or status changed', { proposalId, contextId });
          // Still return approved=true since the proposal is approved (just already was)
          return { approved: true, approvalResult, alreadyApproved: true };
        }
        
        logger.debug('Proposal approved', { proposalId, contextId, approvalPercentage: approvalResult.approvalPercentage });
        
        if (onApproved) {
          await onApproved(approvalResult);
        }
      } else {
        // Optionally update to not approved (only if approvalColumn is 'approved' boolean)
        // Make this atomic too - only update if currently approved
        if (approvalColumn === 'approved' && !statusValue) {
          const result = await TransactionManager.execute(db, 
            `UPDATE ${proposalTable} SET ${approvalColumn} = false, updated_at = CURRENT_TIMESTAMP WHERE ${proposalIdColumnInProposalTable} = ? AND ${approvalColumn} = true`,
            [proposalId]
          );
          
          if (result.changes === 0) {
            logger.debug('Proposal unapproval skipped - not currently approved', { proposalId });
          }
        }
        
        if (onNotApproved) {
          await onNotApproved(approvalResult);
        }
      }

      return { approved: approvalResult.approved, approvalResult };
    } catch (error) {
      logger.error('Error in checkAndUpdateApproval', { error: error.message, stack: error.stack, proposalId, contextId });
      throw error;
    }
  }

  /**
   * Require quorum (participation threshold) for completing a vote.
   * Throws PARTICIPATION_THRESHOLD_NOT_MET if quorum is not met.
   * Use before allowing Complete vote action.
   * @param {Object} db - Database instance
   * @param {Object} params - Same params as checkApproval (proposalId, organizationId, proVotes, totalVotes, totalEligible, acceptanceThreshold, etc.)
   * @returns {Promise<Object>} approvalResult from checkApproval
   * @throws {ApiError} PARTICIPATION_THRESHOLD_NOT_MET when quorum not met
   */
  static async requireQuorumForComplete(db, params) {
    const ApiError = require('../middleware/errorHandler').ApiError;
    const approvalResult = await this.checkApproval({ db, ...params });
    if (!approvalResult.quorumMet) {
      throw ApiError.validation(
        'Participation threshold must be met before completing the vote',
        null,
        'PARTICIPATION_THRESHOLD_NOT_MET'
      );
    }
    return approvalResult;
  }

  /**
   * Get all votes for a proposal (for WebSocket broadcasts)
   * @param {Object} db - Database instance
   * @param {string} tableName - Vote table name
   * @param {string} proposalIdColumn - Column name for proposal ID
   * @param {string} proposalId - Proposal ID
   * @param {boolean} isAnonymous - Whether voting is anonymous
   * @param {string} currentUserId - Current user ID (for showing own vote)
   * @returns {Promise<Array>} Array of formatted votes
   */
  static async getAllVotes(db, tableName, proposalIdColumn, proposalId, isAnonymous = false, currentUserId = null) {
    assertAllowedIdentifier(tableName, ALLOWED_VOTE_TABLES, 'vote table');
    assertAllowedIdentifier(proposalIdColumn, ALLOWED_PROPOSAL_ID_COLUMNS, 'proposal ID column');

    const query = `
      SELECT v.*, u.name as user_name, u.email as user_email
      FROM ${tableName} v
      LEFT JOIN users u ON v.user_id = u.id
      WHERE v.${proposalIdColumn} = ?
      ORDER BY v.created_at ASC
    `;

    const votes = await TransactionManager.queryAll(db, query, [proposalId]);
    
    return this.formatVotesForResponse(votes, isAnonymous, currentUserId);
  }
}

module.exports = UnifiedVotingService;


const { logger } = require('../middleware/logger');

// Maximum acceptable difference in vote counts for validation
// Allows for eventual consistency in distributed systems
const MAX_ACCEPTABLE_DIFF = 1;

/**
 * Calculate vote counts from an array of votes
 * @param {Array} votes - Array of vote objects with 'vote' property ('PRO', 'NEUTRAL', 'CONTRA')
 * @returns {Object} Object with pro, contra, neutral, and total counts
 */
function calculateVoteCounts(votes) {
  if (!Array.isArray(votes)) {
    logger.warn('calculateVoteCounts: votes is not an array', { votes });
    return { pro: 0, contra: 0, neutral: 0, total: 0 };
  }

  const counts = {
    pro: 0,
    contra: 0,
    neutral: 0,
    total: 0
  };

  votes.forEach(vote => {
    const voteValue = vote?.vote || vote?.voteChoice;
    
    // Handle both PRO/NEUTRAL/CONTRA format and yes/no/abstain format
    if (voteValue === 'PRO' || voteValue === 'yes') {
      counts.pro++;
      counts.total++;
    } else if (voteValue === 'CONTRA' || voteValue === 'no') {
      counts.contra++;
      counts.total++;
    } else if (voteValue === 'NEUTRAL' || voteValue === 'abstain') {
      counts.neutral++;
      counts.total++;
    } else {
      // Unknown vote values are excluded from total to prevent count mismatches
      logger.warn('calculateVoteCounts: Unknown vote value excluded from count', { voteValue, voteId: vote?.id });
    }
  });

  return counts;
}

/**
 * Validate that vote counts match the actual votes array
 * @param {Object} voteCounts - Object with pro, contra, neutral, total counts
 * @param {Array} votes - Array of vote objects
 * @returns {Object} Object with isValid boolean and error message if invalid
 */
function validateVoteCounts(voteCounts, votes) {
  if (!voteCounts || typeof voteCounts !== 'object') {
    return {
      isValid: false,
      error: 'Vote counts is not an object'
    };
  }

  if (!Array.isArray(votes)) {
    return {
      isValid: false,
      error: 'Votes is not an array'
    };
  }

  const calculatedCounts = calculateVoteCounts(votes);
  const providedTotal = voteCounts.total || 0;
  const calculatedTotal = calculatedCounts.total;

  // Check if totals match
  if (providedTotal !== calculatedTotal) {
    return {
      isValid: false,
      error: `Vote count total mismatch: provided ${providedTotal}, calculated ${calculatedTotal}`,
      provided: voteCounts,
      calculated: calculatedCounts
    };
  }

  // Check if individual counts match (allow small differences for eventual consistency)
  const proDiff = Math.abs((voteCounts.pro || 0) - calculatedCounts.pro);
  const contraDiff = Math.abs((voteCounts.contra || 0) - calculatedCounts.contra);
  const neutralDiff = Math.abs((voteCounts.neutral || 0) - calculatedCounts.neutral);

  // Fail validation if differences exceed threshold
  if (proDiff > MAX_ACCEPTABLE_DIFF || contraDiff > MAX_ACCEPTABLE_DIFF || neutralDiff > MAX_ACCEPTABLE_DIFF) {
    logger.error('Vote counts validation failed - differences exceed threshold', {
      provided: voteCounts,
      calculated: calculatedCounts,
      differences: { pro: proDiff, contra: contraDiff, neutral: neutralDiff },
      threshold: MAX_ACCEPTABLE_DIFF
    });
    
    return {
      isValid: false,
      error: `Vote counts mismatch exceeds threshold: pro=${proDiff}, contra=${contraDiff}, neutral=${neutralDiff} (max allowed: ${MAX_ACCEPTABLE_DIFF})`,
      provided: voteCounts,
      calculated: calculatedCounts
    };
  }

  // For small differences (within threshold), log warning but pass
  if (proDiff > 0 || contraDiff > 0 || neutralDiff > 0) {
    logger.warn('Vote counts have minor mismatches (within threshold)', {
      provided: voteCounts,
      calculated: calculatedCounts,
      differences: { pro: proDiff, contra: contraDiff, neutral: neutralDiff },
      threshold: MAX_ACCEPTABLE_DIFF
    });
    
    return {
      isValid: true,
      warning: 'Vote counts have minor mismatches (within acceptable threshold)',
      provided: voteCounts,
      calculated: calculatedCounts
    };
  }

  return {
    isValid: true,
    provided: voteCounts,
    calculated: calculatedCounts
  };
}

/**
 * Normalize vote value to standard format (PRO/NEUTRAL/CONTRA)
 * @param {string} vote - Vote value in any format (PRO/NEUTRAL/CONTRA or yes/no/abstain)
 * @returns {string} Normalized vote value (PRO/NEUTRAL/CONTRA)
 */
function normalizeVoteValue(vote) {
  if (!vote || typeof vote !== 'string') {
    return null;
  }

  const upperVote = vote.trim().toUpperCase();
  
  // Handle yes/no/abstain format
  if (upperVote === 'YES') return 'PRO';
  if (upperVote === 'NO') return 'CONTRA';
  if (upperVote === 'ABSTAIN') return 'NEUTRAL';
  
  // Handle PRO/NEUTRAL/CONTRA format (already normalized)
  if (['PRO', 'NEUTRAL', 'CONTRA'].includes(upperVote)) {
    return upperVote;
  }

  logger.warn('normalizeVoteValue: Unknown vote format', { vote, upperVote });
  return null;
}

/**
 * Convert vote counts from one format to another
 * @param {Object} counts - Vote counts object
 * @param {string} fromFormat - Source format ('pro_contra_neutral' or 'yes_no_abstain')
 * @param {string} toFormat - Target format ('pro_contra_neutral' or 'yes_no_abstain')
 * @returns {Object} Converted vote counts
 */
function convertVoteCountsFormat(counts, fromFormat, toFormat) {
  if (fromFormat === toFormat) {
    return counts;
  }

  if (fromFormat === 'yes_no_abstain' && toFormat === 'pro_contra_neutral') {
    return {
      pro: counts.yes || 0,
      contra: counts.no || 0,
      neutral: counts.abstain || 0,
      total: (counts.yes || 0) + (counts.no || 0) + (counts.abstain || 0)
    };
  }

  if (fromFormat === 'pro_contra_neutral' && toFormat === 'yes_no_abstain') {
    return {
      yes: counts.pro || 0,
      no: counts.contra || 0,
      abstain: counts.neutral || 0,
      total: (counts.pro || 0) + (counts.contra || 0) + (counts.neutral || 0)
    };
  }

  logger.warn('convertVoteCountsFormat: Unsupported conversion', { fromFormat, toFormat });
  return counts;
}

module.exports = {
  calculateVoteCounts,
  validateVoteCounts,
  normalizeVoteValue,
  convertVoteCountsFormat
};

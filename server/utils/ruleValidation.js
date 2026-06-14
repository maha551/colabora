/**
 * Rule Validation Utility
 * Unified wrapper for rule validation logic used across multiple endpoints
 * 
 * This utility consolidates the duplicated validation logic from:
 * - server/routes/governance.js:471-533 (validate-rule-change endpoint)
 * - server/routes/governance.js:1008-1087 (create rule-proposals endpoint)
 */

const { validateGovernanceRuleValue, checkRuleDependencies, checkDeadlockConditions, checkDuplicateProposal } = require('../modules/rule-validation');
const ApiError = require('../middleware/errorHandler').ApiError;

/**
 * Validate a rule change with all checks
 * @param {Object} db - Database connection
 * @param {string} organizationId - Organization ID
 * @param {string} ruleField - Rule field name
 * @param {any} proposedValue - Proposed value
 * @param {Object} options - Validation options
 * @param {string} options.mode - 'collect' (returns all errors) or 'throw' (throws on first error)
 * @returns {Promise<{valid: boolean, errors: Array, warnings: Array, conflicts: Array}>}
 * @throws {ApiError} If mode is 'throw' and validation fails
 */
async function validateRuleChange(db, organizationId, ruleField, proposedValue, options = {}) {
  const { mode = 'collect', excludeProposalId } = options;
  const errors = [];
  const warnings = [];
  const conflicts = [];

  // 1. Validate value format
  const validation = validateGovernanceRuleValue(ruleField, proposedValue);
  if (!validation.valid) {
    if (mode === 'throw') {
      throw ApiError.validation(validation.error);
    }
    errors.push(validation.error);
  }

  // 2. Check for duplicates (includes cooldown check)
  const duplicate = await checkDuplicateProposal(db, organizationId, ruleField, excludeProposalId);
  if (duplicate.exists) {
    if (mode === 'throw') {
      throw new ApiError(409, duplicate.message, 'DUPLICATE_PROPOSAL', duplicate.details);
    }
    conflicts.push({
      type: 'duplicate',
      message: duplicate.message,
      details: duplicate.details
    });
  }

  // 3. Check dependencies
  const dependencyCheck = await checkRuleDependencies(db, organizationId, ruleField, proposedValue);
  if (!dependencyCheck.valid) {
    if (mode === 'throw') {
      // Return error object for the caller to handle (they need to send response)
      throw new ApiError(400, 'Rule change would create invalid state', 'DEPENDENCY_VIOLATION', {
        message: dependencyCheck.error,
        ruleField,
        proposedValue,
        ...(dependencyCheck.details || {})
      });
    }
    conflicts.push({
      type: 'dependency',
      message: dependencyCheck.error,
      details: dependencyCheck.details
    });
  }

  // 4. Check for deadlock conditions
  const deadlockCheck = checkDeadlockConditions(ruleField, proposedValue);
  if (deadlockCheck.isDeadlock) {
    if (mode === 'throw') {
      throw new ApiError(400, deadlockCheck.message, 'DEADLOCK_CONDITION', {
        ruleField,
        proposedValue,
        ...(deadlockCheck.details || {})
      });
    }
    conflicts.push({
      type: 'deadlock',
      message: deadlockCheck.message,
      details: deadlockCheck.details
    });
  }

  // Return result
  const result = {
    valid: errors.length === 0 && conflicts.filter(c => c.type !== 'cooldown').length === 0,
    errors,
    warnings,
    conflicts
  };

  return result;
}

module.exports = {
  validateRuleChange
};


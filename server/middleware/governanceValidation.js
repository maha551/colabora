/**
 * Governance Rule Proposal Validation Middleware
 * Validates rule proposal values before creation
 * 
 * Note: This middleware performs basic format validation for early error feedback.
 * Comprehensive validation (dependencies, deadlocks, duplicates) is done in the route handler
 * using the validateRuleChange utility.
 */

const { validateGovernanceRuleValue } = require('../modules/rule-validation');
const { logger } = require('./logger');
const { extractField } = require('../utils/fieldExtractor');
const { getUserId } = require('../utils/routeHelpers');

/**
 * Validate rule proposal request
 * Checks that proposed rule values are valid (percentages, integers, booleans, enums)
 */
function validateRuleProposal(req, res, next) {
  // Handle both camelCase (from frontend) and snake_case (after transformation)
  const ruleField = extractField(req.body, 'ruleField', 'rule_field');
  const proposedValue = extractField(req.body, 'proposedValue', 'proposed_value');
  const options = req.body.options;
  const userId = getUserId(req, false); // Optional for logging

  // Check required fields
  if (!ruleField) {
    logger.warn('Rule proposal validation failed: missing ruleField', { userId });
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: [{
        field: 'ruleField',
        message: 'Rule field is required',
        received: ruleField,
        expected: 'string (one of the governance rule field names)'
      }]
    });
  }

  if (proposedValue === undefined || proposedValue === null) {
    logger.warn('Rule proposal validation failed: missing proposedValue', { 
      ruleField, 
      userId 
    });
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: [{
        field: 'proposedValue',
        message: 'Proposed value is required',
        received: proposedValue,
        expected: 'value matching the rule field type (number, boolean, string, etc.)'
      }]
    });
  }

  // Helper to convert numeric values (0, 1) to booleans for boolean fields
  const normalizeBooleanValue = (value, fieldName) => {
    // Check if this is a boolean field
    const booleanFields = [
      'membersCanProposeRules', 'membersCanCreateDocuments', 'membersCanInitializeElections',
      'membersCanInviteMembers', 'membersCanManageRuleProposals', 'membersCanInitiateMistrustVote',
      'anonymousVotingEnabled', 'voteChangeAllowed', 'representativeCanCreateVotes',
      'representativeCanInviteMembers', 'representativeCanManageDocuments',
      'representativeApprovalRequired', 'tamperProofEnabled', 'auditTrailEnabled',
      'defaultStructureProposalsEnabled', 'defaultVotingAnonymityLocked'
    ];
    
    if (booleanFields.includes(fieldName) && typeof value === 'number') {
      return value !== 0;
    }
    return value;
  };

  // Validate single value proposal (only if not using options)
  if (!options || !Array.isArray(options) || options.length === 0) {
    // Normalize boolean values before validation
    const normalizedValue = normalizeBooleanValue(proposedValue, ruleField);
    const validation = validateGovernanceRuleValue(ruleField, normalizedValue);
    if (!validation.valid) {
      logger.warn('Rule proposal validation failed', {
        ruleField,
        proposedValue,
        error: validation.error,
        userId
      });
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: [{
          field: 'proposedValue',
          message: validation.error,
          ruleField,
          receivedValue: proposedValue,
          receivedType: typeof proposedValue,
          ...(validation.context || {})
        }]
      });
    }
  }

  // Validate options if provided
  if (options && Array.isArray(options)) {
    if (options.length === 0) {
      return res.status(400).json({
        error: 'Validation failed',
        details: [{ field: 'options', message: 'Options array cannot be empty' }]
      });
    }

    // Validate each option
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      // Handle both camelCase and snake_case
      const optionTitle = option.optionTitle || option.option_title;
      const optionDescription = option.optionDescription || option.option_description;
      const optionProposedValue = option.proposedValue !== undefined ? option.proposedValue : option.proposed_value;
      
      if (!optionTitle || typeof optionTitle !== 'string' || optionTitle.trim().length === 0) {
        logger.warn('Rule proposal option validation failed: missing title', {
          ruleField,
          optionIndex: i,
          userId
        });
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: [{
            field: `options[${i}].optionTitle`,
            message: 'Option title is required and must be a non-empty string',
            received: optionTitle,
            receivedType: typeof optionTitle,
            expected: 'non-empty string (max 200 characters)'
          }]
        });
      }

      if (optionTitle.length > 200) {
        logger.warn('Rule proposal option validation failed: title too long', {
          ruleField,
          optionIndex: i,
          titleLength: option.optionTitle.length,
          userId
        });
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: [{
            field: `options[${i}].optionTitle`,
            message: 'Option title must be less than 200 characters',
            received: optionTitle,
            receivedLength: optionTitle.length,
            maxLength: 200
          }]
        });
      }

      if (optionDescription && typeof optionDescription !== 'string') {
        return res.status(400).json({
          error: 'Validation failed',
          details: [{ field: `options[${i}].optionDescription`, message: 'Option description must be a string' }]
        });
      }

      if (optionDescription && optionDescription.length > 1000) {
        return res.status(400).json({
          error: 'Validation failed',
          details: [{ field: `options[${i}].optionDescription`, message: 'Option description must be less than 1000 characters' }]
        });
      }

      if (optionProposedValue === undefined || optionProposedValue === null) {
        return res.status(400).json({
          error: 'Validation failed',
          details: [{ field: `options[${i}].proposedValue`, message: 'Option proposed value is required' }]
        });
      }

      // Normalize boolean values before validation
      const normalizedOptionValue = normalizeBooleanValue(optionProposedValue, ruleField);
      // Validate the proposed value for this option
      const optionValidation = validateGovernanceRuleValue(ruleField, normalizedOptionValue);
      if (!optionValidation.valid) {
        logger.warn('Rule proposal option validation failed', {
          ruleField,
          optionIndex: i,
          proposedValue: option.proposedValue,
          error: optionValidation.error,
          userId
        });
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: [{
            field: `options[${i}].proposedValue`,
            message: optionValidation.error,
            ruleField,
            optionIndex: i,
            optionTitle: optionTitle,
            receivedValue: optionProposedValue,
            receivedType: typeof optionProposedValue,
            ...(optionValidation.context || {})
          }]
        });
      }
    }
  }

  // Validation passed
  next();
}

/**
 * Validate title and description for rule proposals
 */
function validateRuleProposalMetadata(req, res, next) {
  const { title, description } = req.body;
  const userId = getUserId(req, false); // Optional for logging

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    logger.warn('Rule proposal metadata validation failed: missing title', { userId });
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: [{
        field: 'title',
        message: 'Title is required and must be a non-empty string',
        received: title,
        receivedType: typeof title,
        expected: 'non-empty string (max 200 characters)'
      }]
    });
  }

  if (title.length > 200) {
    logger.warn('Rule proposal metadata validation failed: title too long', { 
      titleLength: title.length,
      userId 
    });
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: [{
        field: 'title',
        message: 'Title must be less than 200 characters',
        received: title,
        receivedLength: title.length,
        maxLength: 200
      }]
    });
  }

  if (description && typeof description !== 'string') {
    return res.status(400).json({
      error: 'Validation failed',
      details: [{ field: 'description', message: 'Description must be a string' }]
    });
  }

  if (description && description.length > 2000) {
    return res.status(400).json({
      error: 'Validation failed',
      details: [{ field: 'description', message: 'Description must be less than 2000 characters' }]
    });
  }

  next();
}

module.exports = {
  validateRuleProposal,
  validateRuleProposalMetadata
};


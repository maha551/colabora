/**
 * Governance domain services barrel export.
 */

const GovernanceRulesService = require('./GovernanceRulesService');
const GovernanceAuditService = require('./GovernanceAuditService');
const RuleProposalService = require('./RuleProposalService');
const RepresentativeService = require('./RepresentativeService');

module.exports = {
  ...GovernanceRulesService,
  ...GovernanceAuditService,
  ...RuleProposalService,
  ...RepresentativeService
};

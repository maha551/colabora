// Governance API functions for democratic organization features
// This module composes all governance sub-modules into a single API

import { rulesApi } from './rules';
import { electionsApi } from './elections';
import { ruleProposalsApi } from './rule-proposals';
import { auditLogsApi } from './audit';

export const governanceApi = {
  // Governance Rules
  getGovernanceRules: rulesApi.getGovernanceRules,
  updateGovernanceRules: rulesApi.updateGovernanceRules,
  getPermissions: rulesApi.getPermissions,
  getBootstrapStatus: rulesApi.getBootstrapStatus,
  completeBootstrap: rulesApi.completeBootstrap,
  validateRuleChange: rulesApi.validateRuleChange,
  getRuleHistory: rulesApi.getRuleHistory,

  // Elections
  createElection: electionsApi.createElection,
  getElections: electionsApi.getElections,
  startElection: electionsApi.startElection,
  nominateCandidate: electionsApi.nominateCandidate,
  acceptNomination: electionsApi.acceptNomination,
  castElectionVote: electionsApi.castElectionVote,
  updateElectionPhase: electionsApi.updateElectionPhase,
  completeElection: electionsApi.completeElection,
  cancelElection: electionsApi.cancelElection,
  resignAsRepresentative: electionsApi.resignAsRepresentative,
  getPendingResignations: electionsApi.getPendingResignations,
  checkElectionPhaseTransitions: electionsApi.checkElectionPhaseTransitions,
  forceElectionPhase: electionsApi.forceElectionPhase,
  getVotingAnalytics: electionsApi.getVotingAnalytics,
  getElectionResults: electionsApi.getElectionResults,
  getUserElectionVoteStatus: electionsApi.getUserElectionVoteStatus,

  // Rule Proposals API
  ruleProposalsApi,

  // Audit Logs API
  auditLogsApi,
};


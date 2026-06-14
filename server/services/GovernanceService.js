/**
 * GovernanceService - backward-compatibility facade re-exporting governance domain services.
 * Prefer importing from ./governance/* or ./governance directly in new code.
 */

const governance = require('./governance');
const ElectionService = require('./ElectionService');

module.exports = {
  ...governance,
  calculateRankedChoiceWinners: ElectionService.calculateRankedChoiceWinners,
  processElectionResults: ElectionService.processElectionResults,
  createReplacementElection: ElectionService.createReplacementElection
};

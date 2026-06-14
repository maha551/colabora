# Organization Governance: Issues and Improvement Opportunities

**Last verified:** 2026-06-10

This document tracks governance rule proposals, elections, and related enforcement. Items marked **Resolved** were verified against the current codebase and integration tests in `tests/integration/governance.integration.test.js`.

---

## Governance Enforcement (Implemented)

The following governance flags are enforced in backend and reflected in the UI:

- **representativeCanCreateVotes**: Enforced when starting document voting and rule-proposal voting.
- **representativeCanManageDocuments**: Enforced in document title updates for organizational documents.
- **representativeApprovalRequired**: Enforced when finalizing/completing document voting for organizational documents.

Rule proposal expiration (`processExpiredRuleProposals` in `server/modules/scheduler.js`), backend validation (`validateRuleChange`), duplicate prevention (`checkDuplicateProposal`), quorum on completion (`approvalResult.quorumMet`), transaction + `WHERE status = 'active'` on complete, and conflict detection (snapshot vs current value) are implemented.

---

## Resolved (verified June 2026)

| # | Topic | Implementation |
|---|--------|----------------|
| 1 | Permission discrepancy (FE vs BE for rule proposals) | FE: `client/src/hooks/useOrganizationPermissions.ts` (`canProposeRules` with bootstrap/recovery/`membersCanProposeRules`); BE: `canProposeRules()` in `server/routes/governance/rule-proposals.js` |
| 2 | Automatic expiration for rule proposals | `server/modules/scheduler.js` → `processExpiredRuleProposals` |
| 3 | Backend validation of proposed rule values | `server/utils/ruleValidation.js`, `server/modules/rule-validation.js` |
| 4 | Duplicate/conflict prevention on create | `checkDuplicateProposal` in create/validate path |
| 5 | Quorum requirement on rule proposal completion | `approvalResult.quorumMet` in `RuleProposalService.completeRuleProposal` |
| 6 | Race condition on proposal completion | Transaction, `WHERE status = 'active'`, `votingLockManager` |
| 7 | Conflict detection (rule changed since proposal) | Snapshot vs current value check in `RuleProposalService.completeRuleProposal` (uses camelCase-transformed snapshot) |
| 8 | Inconsistent status values (`expired` vs `cancelled`) | Runtime uses `cancelled` for expired proposals; legacy migration docs may differ |
| 9 | Rule field whitelist / SQL safety | `server/utils/governanceRuleFields.js`, `server/utils/fieldValidation.js` |
| 10 | Vote count updates | Vote cast in transaction; counts updated via service layer |
| 12 | Proposal history | `governance_rule_history` table; `GET .../rule-history` |
| 14 | Proposal withdrawal | `POST .../rule-proposals/:id/withdraw` |
| 17 | Proposal comments | `server/routes/rule-proposal-comments.js`; `client/src/utils/ruleProposalAdapter.ts` |

---

## Partially open

| # | Topic | Notes |
|---|--------|-------|
| 11 | Notification coverage | Elections and rule events partially notify via `server/modules/notifications.js`; no full deadline-reminder matrix |
| 13 | Configurable rule-proposal voting period | `minimumVotingPeriodHours` is respected as a floor; default remains hardcoded `14 * 24` hours in `RuleProposalService.startRuleProposalVoting` |
| 15 | Error message consistency | Create/forbidden paths return structured errors; not uniform across all governance endpoints |

---

## Still open / future enhancements

| # | Topic |
|---|--------|
| 16 | Proposal templates |
| 17 | (was comments — now resolved; kept for historical numbering) |
| 18 | Bulk / packaged rule changes |
| 19 | Proposal impact preview |
| 20 | Representative vote weight |
| 21 | Rate limiting on proposal creation |
| 22 | Additional SQL hardening (whitelist largely mitigates dynamic updates) |
| 23 | Index / query performance review |
| 24 | Refactor vote counts to on-the-fly aggregation |

---

## Testing coverage

### Covered by `tests/integration/governance.integration.test.js`

- Organization setup and governance rules CRUD
- Representative election lifecycle (anonymous ballots, including `receiptId`)
- Public representative elections (`anonymousVotingEnabled: false`)
- Rule proposal lifecycle (create → start → vote → complete → verify rule change)
- Duplicate draft proposal rejection (`409 DUPLICATE_PROPOSAL`)
- Election quorum failure on complete (isolated org, high quorum, insufficient votes)
- Ranked-choice election path
- Vote input validation on active election (`NO_CANDIDATES_SELECTED`)
- Analytics and access control

### Covered elsewhere (smoke or partial)

- Scheduler expiration: `tests/scheduler/scheduler-jobs.test.js` (smoke-calls `processExpiredRuleProposals`)
- Ballot export / verification log: `tests/integration/ballot-export.integration.test.js`, `tests/integration/vote-verification.integration.test.js`

### Follow-up (not in scope of June 2026 hardening)

- Replace placeholder rule-proposal race test in `tests/integration/voting-race-conditions.test.js`
- Concurrent complete-voting load tests

---

## Related documentation

- Field inventory and validation status: [GOVERNANCE_RULES_INVENTORY.md](./GOVERNANCE_RULES_INVENTORY.md)
- Verifiability: [VERIFIABILITY_SPEC.md](./VERIFIABILITY_SPEC.md)
- Current cross-cutting issues: [../ISSUES_VERIFICATION_2026.md](../ISSUES_VERIFICATION_2026.md)

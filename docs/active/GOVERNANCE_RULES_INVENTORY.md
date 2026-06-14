# Governance Rules Comprehensive Inventory

## Database Schema Fields (snake_case)

### Representative Elections
- `representative_term_months` - INTEGER
- `representative_term_limits` - INTEGER (nullable)
- `election_voting_method` - TEXT (enum: 'simple_majority', 'ranked_choice', 'approval')
- `election_quorum_percentage` - REAL
- `election_notice_days` - INTEGER

### General Voting Rules
- `default_voting_deadline_hours` - INTEGER
- `default_quorum_percentage` - REAL
- `document_proposal_period_days` - INTEGER
- `paragraph_proposal_cutoff_days` - INTEGER (days before proposal deadline when paragraph proposals are locked)
- `threshold_calculation_method` - TEXT (enum: 'all_votes', 'all_members')
- `default_acceptance_threshold` - REAL (0-100)
- `anonymous_voting_enabled` - BOOLEAN
- `vote_change_allowed` - BOOLEAN
- `default_structure_proposals_enabled` - BOOLEAN
- `default_voting_anonymity_locked` - BOOLEAN

### Representative Powers
- `representative_can_create_votes` - BOOLEAN
- `representative_can_invite_members` - BOOLEAN
- `representative_can_manage_documents` - BOOLEAN
- `representative_approval_required` - BOOLEAN

### Audit & Compliance
- `tamper_proof_enabled` - BOOLEAN
- `audit_trail_enabled` - BOOLEAN

### Member Permissions
- `members_can_propose_rules` - BOOLEAN
- `members_can_propose_rules_threshold` - REAL (0-1)
- `members_can_create_documents` - BOOLEAN
- `members_can_create_documents_threshold` - REAL (0-1)
- `members_can_initialize_elections` - BOOLEAN
- `members_can_initialize_elections_threshold` - REAL (0-1)
- `members_can_invite_members` - BOOLEAN
- `members_can_invite_members_threshold` - REAL (0-1)
- `members_can_manage_rule_proposals` - BOOLEAN
- `members_can_manage_rule_proposals_threshold` - REAL (0-1)

### Mistrust Vote
- `members_can_initiate_mistrust_vote` - BOOLEAN
- `mistrust_vote_threshold` - REAL (0-100)
- `mistrust_vote_quorum_percentage` - REAL (0-1)

### Organization-Configurable Safeguards (proposal-able)
- `minimum_quorum_percentage` - REAL (0-1)
- `minimum_approval_threshold` - REAL (0-1)
- `minimum_voting_period_hours` - INTEGER

### System-Managed Fields (NOT proposal-able)
- `bootstrap_mode` - BOOLEAN
- `bootstrap_completed_at` - DATETIME
- `recovery_mode` - BOOLEAN
- `recovery_mode_entered_at` - DATETIME
- `recovery_mode_reason` - TEXT
- `last_successful_vote_at` - DATETIME
- `failed_proposals_count` - INTEGER
- `last_failed_proposal_at` - DATETIME
- `rule_changes_this_month` - INTEGER
- `last_rule_change_at` - DATETIME

## Field Registry

Canonical lists live in `server/utils/governanceRuleFields.js`:
- `PROPOSABLE_POLICY_FIELDS` — all 37 democratically editable policy fields
- `SYSTEM_MANAGED_FIELDS` — platform-written state fields
- `PROPOSABLE_POLICY_DB_FIELDS` — snake_case DB columns for proposal completion whitelist

## Validation Status

- All proposal-able policy fields have validation in `server/modules/rule-validation.js` ✅
- All proposal-able policy fields are in `governanceFieldMapping.js` ✅
- All proposal-able policy DB columns are in `fieldValidation.js` whitelist ✅
- All policy fields are exposed in `RuleProposalDialog` and `GovernanceRulesVotingInterface` ✅
- Enforcement gaps and resolved issues: see [GOVERNANCE_ISSUES_AND_IMPROVEMENTS.md](./GOVERNANCE_ISSUES_AND_IMPROVEMENTS.md) (last verified 2026-06-10)

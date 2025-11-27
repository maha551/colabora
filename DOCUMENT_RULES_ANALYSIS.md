# Document Rules Analysis: Organizations and Documents

## Overview

This document provides a comprehensive analysis of how document rules work in the Colabora application, particularly in the context of organizations and their documents. The system uses **Organization Governance Rules** to provide default settings for organizational documents, which can be overridden at document creation time.

---

## Architecture Overview

### Key Components

1. **Organization Governance Rules** (`organization_governance_rules` table)
   - Stores configurable governance settings per organization
   - Provides defaults for document creation
   - Can be modified through rule proposals (voting process)

2. **Documents** (`documents` table)
   - Can be `personal`, `shared`, or `organizational`
   - Organizational documents inherit from governance rules
   - Document settings are **locked at creation** and cannot be changed

3. **Document Creation Flow**
   - User provides options (optional)
   - System fetches organization governance rules
   - Applies governance rules as defaults if options not provided
   - Stores final settings in document record

---

## Governance Rules Applied to Documents

### Document-Related Governance Rules

The following governance rules are used when creating organizational documents:

| Governance Rule Field | Document Setting | Applied At | Status |
|----------------------|------------------|------------|--------|
| `default_acceptance_threshold` | `acceptance_threshold` | Creation | ✅ Working |
| `document_proposal_period_days` | `proposal_deadline` | Creation | ✅ Working |
| `anonymous_voting_enabled` | `voting_anonymous` | Creation | ✅ Working |
| `vote_change_allowed` | `vote_change_allowed` | Creation | ✅ Working |
| `default_quorum_percentage` | `min_voters_required` | Creation | ✅ Working |
| `threshold_calculation_method` | Used during voting | Runtime | ✅ Working |
| `default_voting_deadline_hours` | `voting_deadline` | Status transition | ✅ Working |

---

## Document Creation Process

### Code Location: `server/routes/documents.js:428-509`

When creating an organizational document:

1. **Fetch Governance Rules**
   ```javascript
   const governanceModule = require('./governance');
   governanceRules = await governanceModule.getGovernanceRules(db, organizationId);
   ```

2. **Apply Rules as Defaults** (if options not provided)
   ```javascript
   // Acceptance threshold
   const finalAcceptanceThreshold = options?.acceptanceThreshold !== undefined
     ? options.acceptanceThreshold
     : (governanceRules?.default_acceptance_threshold || 75.0);
   
   // Voting anonymity
   const finalVotingAnonymous = options?.votingAnonymous !== undefined
     ? (options.votingAnonymous ? 1 : 0)
     : (governanceRules?.anonymous_voting_enabled ? 1 : 0);
   
   // Vote change allowed
   const finalVoteChangeAllowed = options?.voteChangeAllowed !== undefined
     ? (options.voteChangeAllowed ? 1 : 0)
     : (governanceRules?.vote_change_allowed ? 1 : 0);
   
   // Proposal period
   const proposalPeriodDays = governanceRules?.document_proposal_period_days || 30;
   const proposalDeadline = new Date();
   proposalDeadline.setDate(proposalDeadline.getDate() + proposalPeriodDays);
   
   // Quorum calculation
   const quorumPercentage = governanceRules?.default_quorum_percentage || 0.3;
   minVotersRequired = Math.max(1, Math.ceil(memberCount * quorumPercentage));
   ```

3. **Store Document with Final Settings**
   - All settings are stored in the `documents` table
   - Settings cannot be changed after creation
   - Document starts in `proposal` status

---

## Document Lifecycle and Rules

### Document Status Flow

1. **Proposal** → Created with `proposal_deadline` from governance rules
2. **Voting** → Transitions when proposal deadline passes
   - `voting_deadline` set from `default_voting_deadline_hours`
3. **Agreed/Rejected** → Based on voting results and thresholds

### Status Transition: Proposal → Voting

**Code Location:** `server/modules/document-status.js:13-74`

```javascript
// Fetch governance rules for voting deadline
const governanceRules = await governanceModule.getGovernanceRules(db, document.organization_id);
const votingDeadlineHours = governanceRules?.default_voting_deadline_hours || 168; // 7 days default

const votingDeadline = new Date();
votingDeadline.setHours(votingDeadline.getHours() + votingDeadlineHours);
```

---

## Voting and Threshold Calculations

### Threshold Calculation Method

**Code Location:** `server/routes/documents.js:2511-2538`

The `threshold_calculation_method` governance rule determines how approval percentage is calculated:

#### Option 1: `all_votes` (Default)
- Calculates approval as percentage of **actual votes cast**
- Formula: `(PRO votes / total votes cast) * 100`
- Example: 8 PRO out of 10 votes = 80% approval

#### Option 2: `all_members`
- Calculates approval as percentage of **all eligible members**
- Formula: `(PRO votes / total eligible members) * 100`
- Example: 8 PRO votes out of 20 members = 40% approval

```javascript
if (calculationMethod === 'all_members') {
  approvalPercentage = totalEligible > 0 ? (proVotes / totalEligible) * 100 : 0;
} else {
  approvalPercentage = actualVotes > 0 ? (proVotes / actualVotes) * 100 : 0;
}
```

### Quorum Requirements

**Code Location:** `server/routes/documents.js:471-490`

- `min_voters_required` is calculated at document creation
- Uses `default_quorum_percentage` from governance rules
- Formula: `Math.max(1, Math.ceil(memberCount * quorumPercentage))`
- Minimum of 1 voter required

### Approval Threshold

- Document must meet **both** conditions:
  1. **Quorum met**: `actualVotes >= min_voters_required`
  2. **Approval threshold met**: `approvalPercentage >= acceptance_threshold`

---

## Frontend Integration

### Document Creation Modal

**Code Location:** `client/src/components/OrganizationManagement/DocumentCreationModal.tsx`

The frontend:
1. Receives governance rules as props
2. Initializes form fields with governance rule defaults
3. Allows users to override defaults before creation
4. Shows organization defaults as hints

```typescript
useEffect(() => {
  if (isOpen && governanceRules) {
    setAcceptanceThreshold(governanceRules.defaultAcceptanceThreshold || 75);
    setVotingAnonymous(governanceRules.anonymousVotingEnabled ?? false);
    setVoteChangeAllowed(governanceRules.voteChangeAllowed ?? true);
  }
}, [isOpen, governanceRules]);
```

---

## Database Schema

### Organization Governance Rules Table

```sql
CREATE TABLE organization_governance_rules (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE,
  
  -- Document-related rules
  document_proposal_period_days INTEGER DEFAULT 365,
  default_acceptance_threshold REAL DEFAULT 75.0,
  default_quorum_percentage REAL DEFAULT 0.5,
  default_voting_deadline_hours INTEGER DEFAULT 168, -- 7 days
  threshold_calculation_method TEXT CHECK(...) DEFAULT 'all_votes',
  anonymous_voting_enabled BOOLEAN DEFAULT 1,
  vote_change_allowed BOOLEAN DEFAULT 0,
  
  -- Other governance rules (elections, representatives, etc.)
  ...
);
```

### Documents Table (Relevant Fields)

```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  organization_id TEXT, -- For organizational docs
  ownership_type TEXT CHECK(...) DEFAULT 'personal',
  status TEXT CHECK(...) DEFAULT 'draft',
  
  -- Document settings (locked at creation)
  acceptance_threshold REAL DEFAULT 75.0,
  voting_anonymous BOOLEAN DEFAULT 0,
  vote_change_allowed BOOLEAN DEFAULT 1,
  structure_proposals_enabled BOOLEAN DEFAULT 0,
  
  -- Deadlines
  proposal_deadline DATETIME,
  voting_deadline DATETIME,
  paragraph_proposals_cutoff DATETIME,
  
  -- Voting requirements
  min_voters_required INTEGER DEFAULT 0,
  ...
);
```

---

## Key Design Principles

### 1. **Immutability After Creation**
- Document settings are **locked** once created
- Prevents confusion about voting rules mid-document
- Ensures consistency throughout document lifecycle

### 2. **Governance Rules as Defaults**
- Governance rules provide sensible defaults
- Users can override at creation time
- If not provided, governance rules apply

### 3. **Organization-Specific Customization**
- Each organization can set its own governance rules
- Rules apply to all documents in that organization
- Rules can be changed via rule proposals (voting process)

### 4. **Hierarchical Document Structure**
- Documents can have parent-child relationships
- Child documents inherit organization from parent
- Parent validation ensures organizational consistency

---

## Rule Proposal System

### Changing Governance Rules

Organizations can change their governance rules through **Rule Proposals**:

1. **Create Proposal** - Representative proposes rule change
2. **Vote** - Organization members vote on proposal
3. **Approval** - If approved (typically 75% threshold), rule is updated
4. **Effect** - New rules apply to **newly created documents only**
   - Existing documents keep their original settings

**Code Location:** `server/routes/governance.js:822-970`

---

## Example Scenarios

### Scenario 1: Creating Document with Defaults

1. Organization has governance rules:
   - `default_acceptance_threshold`: 80%
   - `anonymous_voting_enabled`: true
   - `document_proposal_period_days`: 60

2. User creates document **without** specifying options

3. Document is created with:
   - `acceptance_threshold`: 80%
   - `voting_anonymous`: true
   - `proposal_deadline`: now + 60 days

### Scenario 2: Creating Document with Overrides

1. Same organization as above

2. User creates document **with** options:
   - `acceptanceThreshold`: 90%
   - `votingAnonymous`: false

3. Document is created with:
   - `acceptance_threshold`: 90% (user override)
   - `voting_anonymous`: false (user override)
   - `proposal_deadline`: now + 60 days (from governance rules)

### Scenario 3: Voting Calculation

1. Organization has:
   - `threshold_calculation_method`: `all_members`
   - `default_acceptance_threshold`: 75%
   - 20 active members

2. Document has:
   - `acceptance_threshold`: 80%
   - `min_voters_required`: 10 (50% quorum)

3. Voting results:
   - 12 members vote (quorum met ✓)
   - 10 PRO votes, 2 CONTRA votes
   - Approval: (10 / 20) * 100 = 50% (using `all_members`)
   - Result: **Rejected** (50% < 80% threshold)

---

## Important Notes

### What Rules Apply When

- **At Creation**: `default_acceptance_threshold`, `document_proposal_period_days`, `anonymous_voting_enabled`, `vote_change_allowed`, `default_quorum_percentage`
- **At Status Transition**: `default_voting_deadline_hours`
- **During Voting**: `threshold_calculation_method`

### What Can Be Changed

- ✅ Governance rules (via rule proposals)
- ✅ Document content (paragraphs, proposals)
- ❌ Document settings (after creation)
- ❌ Document ownership type (after creation)

### Personal vs Organizational Documents

- **Personal/Shared Documents**: Do not use governance rules
- **Organizational Documents**: Always use governance rules as defaults
- Governance rules only apply to documents with `ownership_type = 'organizational'`

---

## Related Files

### Backend
- `server/routes/documents.js` - Document creation and management
- `server/routes/governance.js` - Governance rules management
- `server/modules/document-status.js` - Status transitions
- `server/modules/voting.js` - Voting logic
- `server/modules/scheduler.js` - Scheduled tasks (deadline checks)
- `server/database/DatabaseManager.js` - Database schema

### Frontend
- `client/src/components/OrganizationManagement/DocumentCreationModal.tsx` - Document creation UI
- `client/src/components/governance/GovernanceRulesDialog.tsx` - Governance rules management UI
- `client/src/types/index.ts` - TypeScript type definitions

### Documentation
- `docs/archive/GOVERNANCE_RULES_DOCUMENT_INTEGRATION_ANALYSIS.md` - Detailed integration analysis
- `database_governance_migration.sql` - Database schema for governance rules

---

## Summary

The document rules system in Colabora is a sophisticated integration between organization governance rules and document settings. Key points:

1. **Governance rules provide defaults** for organizational documents
2. **Users can override** defaults at document creation
3. **Settings are immutable** after document creation
4. **Rules apply at different stages**: creation, status transitions, and voting
5. **Organizations can customize** their rules through the rule proposal system

This design ensures consistency while allowing flexibility, and maintains clear governance boundaries for organizational documents.


# Frontend API Modules Documentation

This document provides comprehensive documentation for all 15 frontend API modules in the Colabora application.

## Table of Contents

1. [documentsApi](#documentsapi)
2. [proposalsApi](#proposalsapi)
3. [votesApi](#votesapi)
4. [commentsApi](#commentsapi)
5. [paragraphsApi](#paragraphsapi)
6. [structureProposalsApi](#structureproposalsapi)
7. [structureHistoryApi](#structurehistoryapi)
8. [documentTreeProposalsApi](#documenttreeproposalsapi)
9. [organizationsApi](#organizationsapi)
10. [governanceApi](#governanceapi)
11. [authApi](#authapi)
12. [searchApi](#searchapi)
13. [exportApi](#exportapi)
14. [activityApi](#activityapi)
15. [errorReportsApi](#errorreportsapi)

---

## documentsApi

Document CRUD operations, voting, status management, and collaboration.

### Functions

#### `getDocuments()`
Get all documents for the current user.

**Returns:** `Promise<DocumentsResponse>`

**Example:**
```typescript
const response = await documentsApi.getDocuments();
console.log(response.documents); // Array of Document objects
```

#### `getDocument(id: string)`
Get a specific document with full details including proposals, votes, and comments.

**Parameters:**
- `id: string` - Document ID

**Returns:** `Promise<DocumentResponse>`

**Example:**
```typescript
const response = await documentsApi.getDocument('doc-123');
console.log(response.document);
```

#### `getAgreedDocument(id: string)`
Get agreed view of a document (lightweight - only history, no proposals/votes/comments).

**Parameters:**
- `id: string` - Document ID

**Returns:** `Promise<DocumentResponse>`

#### `getDocumentsBatch(documentIds: string[])`
Batch fetch documents (lightweight - for activity feed).

**Parameters:**
- `documentIds: string[]` - Array of document IDs

**Returns:** `Promise<BatchDocumentsResponse>`

#### `createDocument(title, description?, contributors?, options?, ownershipType?, organizationId?)`
Create a new document.

**Parameters:**
- `title: string` - Document title
- `description?: string` - Document description
- `contributors?: string[]` - Array of contributor user IDs
- `options?: object` - Document options:
  - `acceptanceThreshold?: number` - Voting threshold (0-1)
  - `votingAnonymous?: boolean` - Enable anonymous voting
  - `votingAnonymityLocked?: boolean` - Lock anonymity setting
  - `voteChangeAllowed?: boolean` - Allow vote changes
  - `structureProposalsEnabled?: boolean` - Enable structure proposals
  - `parentId?: string` - Parent document ID
  - `positionType?: 'root' | 'child' | 'above_sibling' | 'below_sibling'` - Position in tree
  - `referenceDocumentId?: string` - Reference document ID
- `ownershipType?: 'personal' | 'shared' | 'organizational'` - Document ownership type
- `organizationId?: string` - Organization ID (required for organizational documents)

**Returns:** `Promise<DocumentResponse>`

**Example:**
```typescript
const doc = await documentsApi.createDocument(
  'My Document',
  'Description',
  ['user-1', 'user-2'],
  {
    acceptanceThreshold: 0.75,
    votingAnonymous: false
  },
  'shared'
);
```

#### `updateDocument(id: string, updates: Partial<Document>)`
Update a document.

**Parameters:**
- `id: string` - Document ID
- `updates: Partial<Document>` - Document fields to update

**Returns:** `Promise<DocumentResponse>`

#### `updateDocumentTitle(id: string, title: string)`
Update document title (legacy method - use `updateDocument` instead).

**Parameters:**
- `id: string` - Document ID
- `title: string` - New title

**Returns:** `Promise<DocumentResponse>`

#### `deleteDocument(id: string)`
Delete a document.

**Parameters:**
- `id: string` - Document ID

**Returns:** `Promise<{ success: boolean; message: string }>`

#### `addCollaborator(documentId: string, userIdOrEmail: string, options?)`
Add collaborator to document.

**Parameters:**
- `documentId: string` - Document ID
- `userIdOrEmail: string` - User ID or email address
- `options?: { useEmail?: boolean }` - Use email instead of user ID

**Returns:** `Promise<{ success: boolean; message: string }>`

#### `removeCollaborator(documentId: string, userId: string)`
Remove collaborator from document.

**Parameters:**
- `documentId: string` - Document ID
- `userId: string` - User ID

**Returns:** `Promise<{ success: boolean; message: string }>`

#### `voteOnDocument(documentId: string, vote: 'PRO' | 'NEUTRAL' | 'CONTRA')`
Vote on a document (document-level voting).

**Parameters:**
- `documentId: string` - Document ID
- `vote: 'PRO' | 'NEUTRAL' | 'CONTRA'` - Vote choice

**Returns:** `Promise<{ success: boolean; message: string }>`

#### `getDocumentVotes(documentId: string)`
Get document votes.

**Parameters:**
- `documentId: string` - Document ID

**Returns:** `Promise<{ votes: Array<...> }>`

#### `getVotingStatus(documentId: string)`
Get voting status for organizational documents.

**Parameters:**
- `documentId: string` - Document ID

**Returns:** `Promise<VotingStatusResponse>`

#### `getStatusHistory(documentId: string)`
Get document status history.

**Parameters:**
- `documentId: string` - Document ID

**Returns:** `Promise<StatusHistoryResponse>`

#### `startVoting(documentId: string)`
Start voting period (admin/owner only).

**Parameters:**
- `documentId: string` - Document ID

**Returns:** `Promise<{ success: boolean; message: string }>`

#### `finalizeVoting(documentId: string)`
Finalize voting period (admin/owner only).

**Parameters:**
- `documentId: string` - Document ID

**Returns:** `Promise<{ success: boolean; message: string }>`

#### `proposeDeletion(documentId: string)`
Propose document deletion.

**Parameters:**
- `documentId: string` - Document ID

**Returns:** `Promise<{ success: boolean; message: string }>`

#### `voteDeletion(documentId: string, vote: 'PRO' | 'NEUTRAL' | 'CONTRA')`
Vote on document deletion proposal.

**Parameters:**
- `documentId: string` - Document ID
- `vote: 'PRO' | 'NEUTRAL' | 'CONTRA'` - Vote choice

**Returns:** `Promise<{ success: boolean; message: string }>`

#### `cancelDeletion(documentId: string)`
Cancel document deletion proposal.

**Parameters:**
- `documentId: string` - Document ID

**Returns:** `Promise<{ success: boolean; message: string }>`

#### `getDeletionStatus(documentId: string)`
Get document deletion status.

**Parameters:**
- `documentId: string` - Document ID

**Returns:** `Promise<DeletionStatusResponse>`

---

## proposalsApi

Paragraph proposal creation.

### Functions

#### `createProposal(documentId, paragraphId, data)`
Create a new proposal for a paragraph.

**Parameters:**
- `documentId: string` - Document ID
- `paragraphId: string` - Paragraph ID
- `data: object` - Proposal data:
  - `text: string` - Proposal text
  - `type: 'BODY' | 'TITLE'` - Proposal type
  - `headingLevel?: HeadingLevel` - Heading level (for titles)

**Returns:** `Promise<{ message: string }>`

**Example:**
```typescript
await proposalsApi.createProposal('doc-123', 'para-456', {
  text: 'New paragraph text',
  type: 'BODY'
});
```

---

## votesApi

Proposal voting.

### Functions

#### `castVote(documentId, paragraphId, proposalId, vote)`
Cast or update a vote on a proposal.

**Parameters:**
- `documentId: string` - Document ID
- `paragraphId: string` - Paragraph ID
- `proposalId: string` - Proposal ID
- `vote: 'PRO' | 'NEUTRAL' | 'CONTRA'` - Vote choice

**Returns:** `Promise<VoteResponse>`

**Example:**
```typescript
const response = await votesApi.castVote('doc-123', 'para-456', 'prop-789', 'PRO');
console.log(response.vote);
```

---

## commentsApi

Comment management on proposals.

### Functions

#### `addComment(documentId, paragraphId, proposalId, data)`
Add a comment to a proposal.

**Parameters:**
- `documentId: string` - Document ID
- `paragraphId: string` - Paragraph ID
- `proposalId: string` - Proposal ID
- `data: object` - Comment data:
  - `text: string` - Comment text
  - `parentId?: string` - Parent comment ID (for threaded comments)

**Returns:** `Promise<{ message: string }>`

**Example:**
```typescript
await commentsApi.addComment('doc-123', 'para-456', 'prop-789', {
  text: 'This looks good!',
  parentId: undefined // Top-level comment
});
```

#### `updateComment(documentId, paragraphId, proposalId, commentId, data)`
Update a comment.

**Parameters:**
- `documentId: string` - Document ID
- `paragraphId: string` - Paragraph ID
- `proposalId: string` - Proposal ID
- `commentId: string` - Comment ID
- `data: object` - Updated comment data:
  - `text: string` - New comment text

**Returns:** `Promise<{ message: string }>`

#### `deleteComment(documentId, paragraphId, proposalId, commentId)`
Delete a comment.

**Parameters:**
- `documentId: string` - Document ID
- `paragraphId: string` - Paragraph ID
- `proposalId: string` - Proposal ID
- `commentId: string` - Comment ID

**Returns:** `Promise<{ message: string }>`

#### `getComments(documentId, paragraphId, proposalId, options?)`
Get comments with pagination.

**Parameters:**
- `documentId: string` - Document ID
- `paragraphId: string` - Paragraph ID
- `proposalId: string` - Proposal ID
- `options?: object` - Pagination options:
  - `limit?: number` - Number of comments per page
  - `offset?: number` - Offset for pagination

**Returns:** `Promise<{ comments: Comment[]; total: number; limit: number; offset: number }>`

---

## paragraphsApi

Paragraph CRUD operations.

### Functions

#### `createParagraph(documentId, data)`
Create a new paragraph. All user-created paragraphs are suggestions (empty paragraph + proposal).

**Parameters:**
- `documentId: string` - Document ID
- `data: object` - Paragraph data:
  - `title?: string` - Paragraph title
  - `text: string` - Paragraph text
  - `order: number` - Paragraph order index
  - `asSuggestion?: boolean` - Create as suggestion (defaults to true)
  - `headingLevel?: HeadingLevel` - Heading level

**Returns:** `Promise<ParagraphResponse>`

**Example:**
```typescript
const response = await paragraphsApi.createParagraph('doc-123', {
  text: 'New paragraph content',
  order: 0,
  headingLevel: 'h2'
});
```

#### `updateParagraph(documentId, paragraphId, data)`
Update a paragraph.

**Parameters:**
- `documentId: string` - Document ID
- `paragraphId: string` - Paragraph ID
- `data: object` - Updated paragraph data:
  - `title?: string` - New title
  - `text?: string` - New text
  - `order?: number` - New order

**Returns:** `Promise<ParagraphResponse>`

#### `deleteParagraph(documentId, paragraphId)`
Delete a paragraph.

**Parameters:**
- `documentId: string` - Document ID
- `paragraphId: string` - Paragraph ID

**Returns:** `Promise<MessageResponse>`

---

## structureProposalsApi

Document structure change proposals (move, reorder, etc.).

### Functions

#### `getStructureProposals(documentId)`
Get all structure proposals for a document.

**Parameters:**
- `documentId: string` - Document ID

**Returns:** `Promise<StructureProposalsResponse>`

#### `getStructureProposal(documentId, proposalId)`
Get a specific structure proposal.

**Parameters:**
- `documentId: string` - Document ID
- `proposalId: string` - Proposal ID

**Returns:** `Promise<StructureProposalResponse>`

#### `createStructureProposal(documentId, title, description, operations)`
Create a new structure proposal.

**Parameters:**
- `documentId: string` - Document ID
- `title: string` - Proposal title
- `description: string | undefined` - Proposal description
- `operations: StructureOperation[]` - Array of structure operations

**Returns:** `Promise<StructureProposalResponse>`

#### `voteOnStructureProposal(documentId, proposalId, vote)`
Vote on a structure proposal.

**Parameters:**
- `documentId: string` - Document ID
- `proposalId: string` - Proposal ID
- `vote: 'PRO' | 'NEUTRAL' | 'CONTRA'` - Vote choice

**Returns:** `Promise<MessageResponse>`

#### `deleteStructureProposal(documentId, proposalId)`
Delete/cancel a structure proposal.

**Parameters:**
- `documentId: string` - Document ID
- `proposalId: string` - Proposal ID

**Returns:** `Promise<MessageResponse>`

#### `applyStructureProposal(documentId, proposalId)`
Apply an approved structure proposal.

**Parameters:**
- `documentId: string` - Document ID
- `proposalId: string` - Proposal ID

**Returns:** `Promise<MessageResponse>`

#### `addCommentToStructureProposal(documentId, proposalId, text, parentId?)`
Add comment to structure proposal.

**Parameters:**
- `documentId: string` - Document ID
- `proposalId: string` - Proposal ID
- `text: string` - Comment text
- `parentId?: string` - Parent comment ID

**Returns:** `Promise<MessageResponse>`

---

## structureHistoryApi

Document structure version history.

### Functions

#### `getStructureVersions(documentId)`
Get document structure versions.

**Parameters:**
- `documentId: string` - Document ID

**Returns:** `Promise<StructureVersionsResponse>`

#### `getStructureVersion(documentId, versionId)`
Get detailed change log for a version.

**Parameters:**
- `documentId: string` - Document ID
- `versionId: string` - Version ID

**Returns:** `Promise<StructureVersionResponse>`

#### `restoreStructureVersion(documentId, versionId)`
Restore document to a previous version.

**Parameters:**
- `documentId: string` - Document ID
- `versionId: string` - Version ID

**Returns:** `Promise<RestoreVersionResponse>`

---

## documentTreeProposalsApi

Document tree structure proposals (parent/child relationships).

### Functions

#### `getProposals(documentId)`
Get all tree proposals for a document.

**Parameters:**
- `documentId: string` - Document ID

**Returns:** `Promise<TreeProposalsResponse>`

#### `createProposal(operation)`
Create a tree proposal.

**Parameters:**
- `operation: TreeProposalOperation` - Tree proposal operation

**Returns:** `Promise<TreeProposalResponse>`

#### `voteOnProposal(proposalId, vote)`
Vote on a tree proposal.

**Parameters:**
- `proposalId: string` - Proposal ID
- `vote: 'PRO' | 'NEUTRAL' | 'CONTRA'` - Vote choice

**Returns:** `Promise<MessageResponse>`

#### `applyProposal(proposalId)`
Apply an approved proposal.

**Parameters:**
- `proposalId: string` - Proposal ID

**Returns:** `Promise<MessageResponse>`

#### `cancelProposal(proposalId)`
Cancel/delete a proposal.

**Parameters:**
- `proposalId: string` - Proposal ID

**Returns:** `Promise<MessageResponse>`

---

## organizationsApi

Organization management, members, votes, and admin functions.

### Functions

#### `createOrganization(name, description?, representatives?, membershipPolicy?, _votingEnabled?, votingThreshold?)`
Create organization (requires admin privileges).

**Parameters:**
- `name: string` - Organization name
- `description?: string` - Organization description
- `representatives?: string[]` - Array of representative user IDs
- `membershipPolicy?: 'open' | 'invitation'` - Membership policy
- `_votingEnabled?: boolean` - Enable voting (deprecated)
- `votingThreshold?: number` - Voting threshold (0-1)

**Returns:** `Promise<OrganizationResponse>`

#### `getOrganizations()`
Get user's organizations.

**Returns:** `Promise<OrganizationsResponse>`

#### `getOrganization(organizationId)`
Get organization details.

**Parameters:**
- `organizationId: string` - Organization ID

**Returns:** `Promise<OrganizationResponse>`

#### `getOrganizationDocuments(organizationId)`
Get organization documents.

**Parameters:**
- `organizationId: string` - Organization ID

**Returns:** `Promise<DocumentsResponse>`

#### `updateOrganization(organizationId, updates)`
Update organization.

**Parameters:**
- `organizationId: string` - Organization ID
- `updates: object` - Update fields:
  - `name?: string`
  - `description?: string`
  - `membershipPolicy?: 'open' | 'invitation'`
  - `votingThreshold?: number`
  - `brandingColor?: string`
  - `brandingLogoUrl?: string`
  - `brandingTitle?: string`
  - `brandingBannerUrl?: string`
  - `iconSet?: 'lucide' | 'tabler' | 'heroicons'`
  - `fontFamily?: 'inter' | 'work-sans' | 'poppins' | 'merriweather'`

**Returns:** `Promise<OrganizationResponse>`

#### `nominateRepresentative(organizationId, newRepresentativeId)`
Nominate new representative.

**Parameters:**
- `organizationId: string` - Organization ID
- `newRepresentativeId: string` - User ID to nominate

**Returns:** `Promise<MessageResponse>`

#### `initiateMistrustVote(organizationId, repId)`
Initiate mistrust vote for representative removal.

**Parameters:**
- `organizationId: string` - Organization ID
- `repId: string` - Representative ID

**Returns:** `Promise<{ success: boolean; message: string; vote: {...} }>`

#### `inviteMembers(organizationId, emails)`
Invite members to organization.

**Parameters:**
- `organizationId: string` - Organization ID
- `emails: string[]` - Array of email addresses

**Returns:** `Promise<InviteMembersResponse>`

#### `getInvitations(organizationId)`
Get invitation history.

**Parameters:**
- `organizationId: string` - Organization ID

**Returns:** `Promise<{ success: boolean; invitations: Array<...>; count: number }>`

#### `addMember(organizationId, userId)`
Add member to organization.

**Parameters:**
- `organizationId: string` - Organization ID
- `userId: string` - User ID

**Returns:** `Promise<MessageResponse>`

#### `removeMember(organizationId, userId)`
Remove member from organization.

**Parameters:**
- `organizationId: string` - Organization ID
- `userId: string` - User ID

**Returns:** `Promise<MessageResponse>`

#### `getOrganizationVotes(organizationId)`
Get organization votes.

**Parameters:**
- `organizationId: string` - Organization ID

**Returns:** `Promise<OrganizationVotesResponse>`

#### `createOrganizationVote(organizationId, title, description?, voteType?, targetDocumentId?, votingStartDate?, votingEndDate?)`
Create organization vote.

**Parameters:**
- `organizationId: string` - Organization ID
- `title: string` - Vote title
- `description?: string` - Vote description
- `voteType?: string` - Vote type
- `targetDocumentId?: string` - Target document ID
- `votingStartDate?: string` - Voting start date
- `votingEndDate?: string` - Voting end date

**Returns:** `Promise<MessageResponse>`

#### `approveVote(organizationId, voteId)`
Approve vote (representatives only).

**Parameters:**
- `organizationId: string` - Organization ID
- `voteId: string` - Vote ID

**Returns:** `Promise<MessageResponse>`

#### `castVote(organizationId, voteId, choice)`
Cast vote in organization vote.

**Parameters:**
- `organizationId: string` - Organization ID
- `voteId: string` - Vote ID
- `choice: 'yes' | 'no' | 'abstain'` - Vote choice

**Returns:** `Promise<MessageResponse>`

#### `completeOrganizationVote(organizationId, voteId)`
Complete organization vote.

**Parameters:**
- `organizationId: string` - Organization ID
- `voteId: string` - Vote ID

**Returns:** `Promise<{ success: boolean; vote: {...} }>`

### Admin Functions

#### `getAdminDashboard()`
Get admin dashboard data.

**Returns:** `Promise<AdminDashboardResponse>`

#### `createOrganizationAdmin(name, representatives, options?)`
Create organization (admin only, with full options).

**Parameters:**
- `name: string` - Organization name
- `representatives: string[]` - Array of representative user IDs
- `options?: object` - Organization options:
  - `description?: string`
  - `membershipPolicy?: 'open' | 'invitation'`
  - `votingThreshold?: number`
  - `governanceRules?: object` - Governance rules

**Returns:** `Promise<OrganizationResponse>`

#### `getAllOrganizationsAdmin()`
Get all organizations (admin only).

**Returns:** `Promise<OrganizationsResponse>`

#### `inviteRepresentatives(organizationId, emails)`
Invite representatives (admin only).

**Parameters:**
- `organizationId: string` - Organization ID
- `emails: string[]` - Array of email addresses

**Returns:** `Promise<MessageResponse>`

#### `updateOrganizationStatus(id, isActive)`
Update organization status (admin only).

**Parameters:**
- `id: string` - Organization ID
- `isActive: boolean` - Active status

**Returns:** `Promise<MessageResponse>`

#### `getAllUsersAdmin()`
Get all users (admin only).

**Returns:** `Promise<AdminUsersResponse>`

#### `promoteUserToAdmin(userId)`
Promote user to admin (admin only).

**Parameters:**
- `userId: string` - User ID

**Returns:** `Promise<MessageResponse>`

---

## governanceApi

Governance rules, elections, rule proposals, and audit logs.

### Functions

#### `getGovernanceRules(organizationId)`
Get governance rules.

**Parameters:**
- `organizationId: string` - Organization ID

**Returns:** `Promise<GovernanceRulesResponse>`

#### `updateGovernanceRules(organizationId, updates)`
Update governance rules.

**Parameters:**
- `organizationId: string` - Organization ID
- `updates: Partial<OrganizationGovernanceRules>` - Rule updates

**Returns:** `Promise<GovernanceRulesResponse>`

#### `getPermissions(organizationId)`
Get user permissions for organization.

**Parameters:**
- `organizationId: string` - Organization ID

**Returns:** `Promise<{ success: boolean; permissions: {...}; context: {...} }>`

#### `getBootstrapStatus(organizationId)`
Get bootstrap status.

**Parameters:**
- `organizationId: string` - Organization ID

**Returns:** `Promise<{ success: boolean; bootstrap: {...} }>`

#### `completeBootstrap(organizationId, confirm)`
Complete bootstrap mode.

**Parameters:**
- `organizationId: string` - Organization ID
- `confirm: boolean` - Confirmation flag

**Returns:** `Promise<{ success: boolean; message: string; bootstrap: {...} }>`

#### `validateRuleChange(organizationId, ruleField, proposedValue)`
Validate rule change before proposing.

**Parameters:**
- `organizationId: string` - Organization ID
- `ruleField: string` - Rule field name
- `proposedValue: unknown` - Proposed value

**Returns:** `Promise<{ valid: boolean; errors: string[]; warnings: string[]; conflicts: Array<...> }>`

#### `getRuleHistory(organizationId, options?)`
Get rule change history.

**Parameters:**
- `organizationId: string` - Organization ID
- `options?: object` - Query options:
  - `ruleField?: string` - Filter by rule field
  - `limit?: number` - Results limit
  - `offset?: number` - Results offset

**Returns:** `Promise<{ success: boolean; history: Array<...>; pagination: {...} }>`

### Elections

#### `createElection(organizationId, electionData)`
Create a new election.

**Parameters:**
- `organizationId: string` - Organization ID
- `electionData: object` - Election data:
  - `title: string` - Election title
  - `description?: string` - Election description
  - `positionsAvailable: number` - Number of positions
  - `termMonths?: number` - Term length in months

**Returns:** `Promise<MessageResponse>`

#### `getElections(organizationId)`
Get all elections.

**Parameters:**
- `organizationId: string` - Organization ID

**Returns:** `Promise<ElectionsResponse>`

#### `startElection(organizationId, electionId, votingData)`
Start an election.

**Parameters:**
- `organizationId: string` - Organization ID
- `electionId: string` - Election ID
- `votingData: object` - Voting data:
  - `votingStartDate?: string` - Start date
  - `votingEndDate: string` - End date

**Returns:** `Promise<MessageResponse>`

#### `nominateCandidate(organizationId, electionId, nominationData)`
Nominate a candidate.

**Parameters:**
- `organizationId: string` - Organization ID
- `electionId: string` - Election ID
- `nominationData: object` - Nomination data:
  - `candidateUserId: string` - Candidate user ID
  - `nominationStatement?: string` - Nomination statement

**Returns:** `Promise<MessageResponse>`

#### `acceptNomination(organizationId, electionId, candidateId)`
Accept a nomination.

**Parameters:**
- `organizationId: string` - Organization ID
- `electionId: string` - Election ID
- `candidateId: string` - Candidate ID

**Returns:** `Promise<MessageResponse>`

#### `castElectionVote(organizationId, electionId, voteData)`
Cast election vote.

**Parameters:**
- `organizationId: string` - Organization ID
- `electionId: string` - Election ID
- `voteData: object` - Vote data:
  - `candidateRanking: string[]` - Array of candidate IDs in preference order

**Returns:** `Promise<MessageResponse>`

#### `updateElectionPhase(organizationId, electionId, newPhase)`
Update election phase.

**Parameters:**
- `organizationId: string` - Organization ID
- `electionId: string` - Election ID
- `newPhase: 'nomination' | 'voting'` - New phase

**Returns:** `Promise<MessageResponse>`

#### `completeElection(organizationId, electionId)`
Complete an election.

**Parameters:**
- `organizationId: string` - Organization ID
- `electionId: string` - Election ID

**Returns:** `Promise<MessageResponse>`

#### `getElectionResults(organizationId, electionId)`
Get election results.

**Parameters:**
- `organizationId: string` - Organization ID
- `electionId: string` - Election ID

**Returns:** `Promise<ElectionResultsResponse>`

#### `resignAsRepresentative(organizationId, repId)`
Resign as representative.

**Parameters:**
- `organizationId: string` - Organization ID
- `repId: string` - Representative ID

**Returns:** `Promise<{ success: boolean; message: string; electionCreated: boolean; electionId?: string }>`

#### `getPendingResignations(organizationId)`
Get pending resignations.

**Parameters:**
- `organizationId: string` - Organization ID

**Returns:** `Promise<{ pendingResignations: Array<...> }>`

#### `checkElectionPhaseTransitions(organizationId)`
Check and advance election phase transitions.

**Parameters:**
- `organizationId: string` - Organization ID

**Returns:** `Promise<{ success: boolean; message: string; advancedCount: number; advancedElections: Array<...> }>`

#### `forceElectionPhase(organizationId, electionId, newPhase)`
Force election phase change.

**Parameters:**
- `organizationId: string` - Organization ID
- `electionId: string` - Election ID
- `newPhase: 'nomination' | 'voting' | 'completed'` - New phase

**Returns:** `Promise<{ success: boolean; message: string; election: {...} }>`

### Analytics

#### `getVotingAnalytics(organizationId, period?)`
Get voting analytics.

**Parameters:**
- `organizationId: string` - Organization ID
- `period?: 'month' | 'quarter' | 'year'` - Time period

**Returns:** `Promise<VotingAnalyticsResponse>`

### Rule Proposals

Access via `governanceApi.ruleProposalsApi`:

#### `getRuleProposals(organizationId)`
Get rule proposals.

**Parameters:**
- `organizationId: string` - Organization ID

**Returns:** `Promise<RuleProposalsResponse>`

#### `createRuleProposal(organizationId, proposalData)`
Create rule proposal.

**Parameters:**
- `organizationId: string` - Organization ID
- `proposalData: object` - Proposal data:
  - `title: string` - Proposal title
  - `description?: string` - Proposal description
  - `ruleField: string` - Rule field to change
  - `proposedValue: unknown` - Proposed value
  - `options?: Array<...>` - Options for multi-choice proposals

**Returns:** `Promise<MessageResponse>`

#### `startRuleProposalVoting(organizationId, proposalId)`
Start rule proposal voting.

**Parameters:**
- `organizationId: string` - Organization ID
- `proposalId: string` - Proposal ID

**Returns:** `Promise<MessageResponse>`

#### `voteOnRuleProposal(organizationId, proposalId, voteData)`
Vote on rule proposal.

**Parameters:**
- `organizationId: string` - Organization ID
- `proposalId: string` - Proposal ID
- `voteData: object` - Vote data:
  - `selectedOptionId?: string` - Selected option ID (for multi-choice)
  - `voteChoice?: 'yes' | 'no' | 'abstain'` - Vote choice

**Returns:** `Promise<MessageResponse>`

#### `completeRuleProposal(organizationId, proposalId)`
Complete rule proposal.

**Parameters:**
- `organizationId: string` - Organization ID
- `proposalId: string` - Proposal ID

**Returns:** `Promise<MessageResponse>`

### Audit Logs

Access via `governanceApi.auditLogsApi`:

#### `getAuditLogs(organizationId, filters?)`
Get audit logs.

**Parameters:**
- `organizationId: string` - Organization ID
- `filters?: object` - Filter options:
  - `actionType?: string` - Action type filter
  - `performedBy?: string` - Performer filter
  - `affectedUser?: string` - Affected user filter
  - `startDate?: string` - Start date
  - `endDate?: string` - End date
  - `limit?: number` - Results limit
  - `offset?: number` - Results offset

**Returns:** `Promise<AuditLogsResponse>`

#### `getAuditStats(organizationId, days?)`
Get audit statistics.

**Parameters:**
- `organizationId: string` - Organization ID
- `days?: number` - Number of days to analyze

**Returns:** `Promise<AuditStatsResponse>`

#### `exportAuditLogs(organizationId, filters?)`
Export audit logs.

**Parameters:**
- `organizationId: string` - Organization ID
- `filters?: object` - Export filters:
  - `startDate?: string` - Start date
  - `endDate?: string` - End date
  - `format?: 'csv' | 'json'` - Export format

**Returns:** `Promise<unknown>`

#### `getPublicAuditLogs(organizationId, filters?)`
Get public audit logs. Includes all governance decisions: rule proposals, elections, organization votes, structure proposals, tree proposals, and document status changes.

**Parameters:**
- `organizationId: string` - Organization ID
- `filters?: object` - Filter options (similar to getAuditLogs)

**Returns:** `Promise<AuditLogsResponse>`

**Action types returned:** `org_created`, `rep_added`, `rep_removed`, `member_invited`, `member_joined`, `member_left`, `member_bulk_added`, `member_bulk_invited`, `vote_proposed`, `vote_approved`, `vote_started`, `vote_completed`, `doc_created`, `rule_proposal_created`, `rule_proposal_approved`, `rule_proposal_rejected`, `structure_proposal_approved`, `structure_proposal_rejected`, `tree_proposal_approved`, `tree_proposal_rejected`, `tree_proposal_applied`, `document_status_agreed`, `document_status_rejected`, `election_created`, `election_started`, `election_completed`

---

## authApi

Authentication, user management, and invitations.

### Functions

#### `login(email, password)`
Login user.

**Parameters:**
- `email: string` - User email
- `password: string` - User password

**Returns:** `Promise<LoginResponse>`

**Example:**
```typescript
const response = await authApi.login('user@example.com', 'password123');
localStorage.setItem('authToken', response.token);
```

#### `register(name, email, password, invitationToken?)`
Register new user.

**Parameters:**
- `name: string` - User name
- `email: string` - User email
- `password: string` - User password
- `invitationToken?: string` - Invitation token (if registering via invitation)

**Returns:** `Promise<RegisterResponse>`

#### `validateInvitationToken(token)`
Validate invitation token.

**Parameters:**
- `token: string` - Invitation token

**Returns:** `Promise<{ valid: boolean; invitation?: {...}; error?: string; expired?: boolean; status?: string }>`

#### `acceptInvitation(token)`
Accept invitation (for logged-in users).

**Parameters:**
- `token: string` - Invitation token

**Returns:** `Promise<{ success: boolean; message: string; organization?: {...}; invitationType?: 'member' | 'representative'; alreadyMember?: boolean }>`

#### `getPendingInvitations()`
Get pending invitations for current user.

**Returns:** `Promise<{ invitations: Array<...>; count: number }>`

#### `declineInvitation(token)`
Decline invitation by token (logged-in users).

**Parameters:**
- `token: string` - Invitation token

**Returns:** `Promise<{ message: string }>`

#### `acceptInvitationById(invitationId)`
Accept invitation by id (for pending list).

**Parameters:**
- `invitationId: string` - Invitation id

**Returns:** `Promise<{ success: boolean; message: string; organization?: {...}; invitationType?: string; alreadyMember?: boolean }>`

#### `declineInvitationById(invitationId)`
Decline invitation by id (for pending list).

**Parameters:**
- `invitationId: string` - Invitation id

**Returns:** `Promise<{ message: string }>`

#### `getCurrentUser()`
Get current user.

**Returns:** `Promise<CurrentUserResponse>`

#### `getUserProfile(userId)`
Get user profile by ID (for viewing other members' profiles).

**Parameters:**
- `userId: string` - User ID

**Returns:** `Promise<CurrentUserResponse>`

#### `logout()`
Logout user.

**Returns:** `Promise<MessageResponse>`

---

## searchApi

Search functionality.

### Functions

#### `search(query, filters?)`
Unified full-text search across documents, paragraphs, and meetings.

**Parameters:**
- `query: string` - Search query
- `filters?: SearchFilters` - Search filters:
  - `types?: ('document' | 'paragraph' | 'meeting')[]` - Limit result entity types (default: all)
  - `documentId?: string` - Scope paragraph search to one document
  - `organizationId?: string` - Filter by organization
  - `status?: string` - Document status filter (`draft`, `proposal`, `voting`, `agreed`, `rejected`)
  - `dateFrom?: string` - ISO date filter (documents/paragraphs)
  - `dateTo?: string` - ISO date filter (documents/paragraphs)
  - `authorId?: string` - Filter by owner/author
  - `limit?: number` - Page size (default 50)
  - `offset?: number` - Pagination offset

**Returns:** `Promise<SearchResults>` with discriminated `results` (`entityType`: `document` | `paragraph` | `meeting`), `count`, and optional `facets`.

**Example:**
```typescript
const results = await searchApi.search('democracy', {
  organizationId: 'org-123',
  types: ['document', 'paragraph'],
});
console.log(results.results);
```

#### `getSuggestions(query)`
Get search suggestions across documents, meetings, and paragraphs.

**Parameters:**
- `query: string` - Search query prefix (min 2 characters)
- `organizationId?: string` - Optional organization scope

**Returns:** `Promise<{ suggestions: SearchSuggestion[] }>` where each suggestion has `text`, `entityType`, and `entityId`.

---

## exportApi

Document export (PDF, Markdown, DOCX).

### Functions

#### `exportDocument(documentId, format)`
Export document in specified format.

**Parameters:**
- `documentId: string` - Document ID
- `format: 'pdf' | 'markdown' | 'docx'` - Export format

**Returns:** `Promise<Blob>`

**Example:**
```typescript
const blob = await exportApi.exportDocument('doc-123', 'pdf');
const url = URL.createObjectURL(blob);
// Download or display the file
```

---

## activityApi

Activity feed data.

### Functions

#### `getAgreedVersions(since?)`
Get agreed versions (recently accepted proposals).

**Parameters:**
- `since?: string` - ISO timestamp to get versions since

**Returns:** `Promise<AgreedVersionsResponse>`

#### `getDebatedProposals()`
Get most debated proposals.

**Returns:** `Promise<DebatedProposalsResponse>`

#### `getPendingVotes()`
Get pending votes (proposals awaiting user's vote).

**Returns:** `Promise<PendingVotesResponse>`

#### `getPendingDecisions(params?)`
Get all open decisions for the current user: paragraph proposals (not yet voted), open elections, open organization votes, active rule proposals, open structure proposals.

**Parameters:**
- `params?: { limit?: number; offset?: number; kind?: string; documentId?: string; organizationId?: string }` - Pagination and filters

**Returns:** `Promise<PendingDecisionsResponse>` with `{ entries: PendingDecisionEntry[], pagination: { total, limit, offset, hasMore } }`. Each entry has `id`, `kind` (`paragraph_proposal` | `election` | `organization_vote` | `rule_proposal` | `structure_proposal`), `timestamp`, `organizationId?`, `organizationName?`, `documentId?`, `documentTitle?`, `payload`.

---

## errorReportsApi

Error reporting and management.

### Functions

#### `submitReport(report)`
Submit an error report.

**Parameters:**
- `report: ErrorReportSubmission` - Error report data

**Returns:** `Promise<{ id: string; message: string }>`

#### `getReports(status?, limit?, offset?)`
Get error reports.

**Parameters:**
- `status?: string` - Filter by status
- `limit?: number` - Results limit (default: 50)
- `offset?: number` - Results offset (default: 0)

**Returns:** `Promise<ErrorReportsResponse>`

#### `getReport(id)`
Get specific error report.

**Parameters:**
- `id: string` - Report ID

**Returns:** `Promise<ErrorReportResponse>`

#### `updateReport(id, updates)`
Update error report.

**Parameters:**
- `id: string` - Report ID
- `updates: object` - Update fields:
  - `status?: ErrorReport['status']` - New status
  - `priority?: ErrorReport['priority']` - New priority
  - `assigned_to?: string` - Assigned user ID
  - `resolution_notes?: string` - Resolution notes

**Returns:** `Promise<{ message: string }>`

#### `getStats()`
Get error report statistics.

**Returns:** `Promise<ErrorReportStats>`

---

## Response Types

All response types are defined in `client/src/lib/api/types.ts` and re-exported from the main API file. Common types include:

- `DocumentsResponse` - Array of documents
- `DocumentResponse` - Single document
- `ParagraphResponse` - Single paragraph
- `VoteResponse` - Vote data
- `MessageResponse` - Success/error message
- `OrganizationsResponse` - Array of organizations
- `OrganizationResponse` - Single organization
- And many more...

See `client/src/lib/api/types.ts` for complete type definitions.

---

## Error Handling

All API functions may throw errors. See [ERROR_HANDLING.md](ERROR_HANDLING.md) for details on error types and handling patterns.

---

## Caching

Many API functions automatically invalidate related caches when mutations occur. The caching system uses a TTL-based approach with automatic invalidation on related endpoints.

See [CLIENT_FEATURES.md](CLIENT_FEATURES.md) for details on caching behavior.


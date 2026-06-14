# Backend API Routes Documentation

This document maps frontend API modules to their corresponding backend routes, including authentication requirements and route patterns.

## Route Registration

All routes are registered in `server/bootstrap.js` in the `registerRoutes()` function. Routes are registered with Express middleware and require database availability (except error-reports).

## Authentication Middleware

Routes use authentication middleware from `server/middleware/auth.js`:

- **`requireAuth`** - Requires valid JWT token (user must be logged in)
- **`requireAdmin`** - Requires admin privileges
- **No middleware** - Public routes (login, register, health checks)

## Frontend Module to Backend Route Mapping

### documentsApi

**Base Path:** `/api/documents`

| Frontend Function | HTTP Method | Route | Auth Required | Description |
|------------------|-------------|------|---------------|-------------|
| `getDocuments()` | GET | `/api/documents` | Yes | Get all documents for user |
| `getDocument(id)` | GET | `/api/documents/:id` | Yes | Get specific document |
| `getAgreedDocument(id)` | GET | `/api/documents/:id/agreed` | Yes | Get agreed view |
| `getDocumentsBatch()` | POST | `/api/documents/batch` | Yes | Batch fetch documents |
| `createDocument()` | POST | `/api/documents` | Yes | Create document |
| `updateDocument(id, updates)` | PUT | `/api/documents/:id` | Yes | Update document |
| `deleteDocument(id)` | DELETE | `/api/documents/:id` | Yes | Delete document |
| `addCollaborator()` | POST | `/api/documents/:id/collaborators` | Yes | Add collaborator |
| `removeCollaborator()` | DELETE | `/api/documents/:id/collaborators/:userId` | Yes | Remove collaborator |
| `voteOnDocument()` | POST | `/api/documents/:id/vote` | Yes | Vote on document |
| `getDocumentVotes()` | GET | `/api/documents/:id/votes` | Yes | Get document votes |
| `getVotingStatus()` | GET | `/api/documents/:id/voting-status` | Yes | Get voting status |
| `getStatusHistory()` | GET | `/api/documents/:id/status-history` | Yes | Get status history |
| `startVoting()` | POST | `/api/documents/:id/start-voting` | Yes | Start voting period |
| `finalizeVoting()` | POST | `/api/documents/:id/finalize-voting` | Yes | Finalize voting |
| `proposeDeletion()` | POST | `/api/documents/:id/propose-deletion` | Yes | Propose deletion |
| `voteDeletion()` | POST | `/api/documents/:id/vote-deletion` | Yes | Vote on deletion |
| `cancelDeletion()` | POST | `/api/documents/:id/cancel-deletion` | Yes | Cancel deletion |
| `getDeletionStatus()` | GET | `/api/documents/:id/deletion-status` | Yes | Get deletion status |

**Route File:** `server/routes/documents.js`

---

### proposalsApi

**Base Path:** `/api/documents/:documentId/paragraphs/:paragraphId/proposals`

| Frontend Function | HTTP Method | Route | Auth Required | Description |
|------------------|-------------|------|---------------|-------------|
| `createProposal()` | POST | `/api/documents/:documentId/paragraphs/:paragraphId/proposals` | Yes | Create proposal |

**Route File:** `server/routes/proposals.js`

---

### votesApi

**Base Path:** `/api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/vote`

| Frontend Function | HTTP Method | Route | Auth Required | Description |
|------------------|-------------|------|---------------|-------------|
| `castVote()` | POST | `/api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/vote` | Yes | Cast vote on proposal |

**Route File:** `server/routes/votes.js`

---

### commentsApi

**Base Path:** `/api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/comments`

| Frontend Function | HTTP Method | Route | Auth Required | Description |
|------------------|-------------|------|---------------|-------------|
| `addComment()` | POST | `/api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/comments` | Yes | Add comment |
| `updateComment()` | PUT | `/api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/comments/:commentId` | Yes | Update comment |
| `deleteComment()` | DELETE | `/api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/comments/:commentId` | Yes | Delete comment |
| `getComments()` | GET | `/api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/comments` | Yes | Get comments |

**Route File:** `server/routes/comments.js`

---

### paragraphsApi

**Base Path:** `/api/documents/:documentId/paragraphs`

| Frontend Function | HTTP Method | Route | Auth Required | Description |
|------------------|-------------|------|---------------|-------------|
| `createParagraph()` | POST | `/api/documents/:documentId/paragraphs` | Yes | Create paragraph |
| `updateParagraph()` | PUT | `/api/documents/:documentId/paragraphs/:paragraphId` | Yes | Update paragraph |
| `deleteParagraph()` | DELETE | `/api/documents/:documentId/paragraphs/:paragraphId` | Yes | Delete paragraph |

**Route File:** `server/routes/paragraphs.js`

---

### structureProposalsApi

**Base Path:** `/api/documents/:documentId/structure-proposals`

| Frontend Function | HTTP Method | Route | Auth Required | Description |
|------------------|-------------|------|---------------|-------------|
| `getStructureProposals()` | GET | `/api/documents/:documentId/structure-proposals` | Yes | Get structure proposals |
| `getStructureProposal()` | GET | `/api/documents/:documentId/structure-proposals/:proposalId` | Yes | Get structure proposal |
| `createStructureProposal()` | POST | `/api/documents/:documentId/structure-proposals` | Yes | Create structure proposal |
| `voteOnStructureProposal()` | POST | `/api/documents/:documentId/structure-proposals/:proposalId/vote` | Yes | Vote on structure proposal |
| `deleteStructureProposal()` | DELETE | `/api/documents/:documentId/structure-proposals/:proposalId` | Yes | Delete structure proposal |
| `applyStructureProposal()` | POST | `/api/documents/:documentId/structure-proposals/:proposalId/apply` | Yes | Apply structure proposal |
| `addCommentToStructureProposal()` | POST | `/api/documents/:documentId/structure-proposals/:proposalId/comments` | Yes | Add comment to structure proposal |

**Route File:** `server/routes/structure-proposals.js`

---

### structureHistoryApi

**Base Path:** `/api/documents/:documentId/structure-history`

| Frontend Function | HTTP Method | Route | Auth Required | Description |
|------------------|-------------|------|---------------|-------------|
| `getStructureVersions()` | GET | `/api/documents/:documentId/structure-history` | Yes | Get structure versions |
| `getStructureVersion()` | GET | `/api/documents/:documentId/structure-history/:versionId` | Yes | Get structure version |
| `restoreStructureVersion()` | POST | `/api/documents/:documentId/structure-history/:versionId/restore` | Yes | Restore structure version |

**Route File:** `server/routes/structure-history.js`

---

### documentTreeProposalsApi

**Base Path:** `/api/document-tree-proposals`

| Frontend Function | HTTP Method | Route | Auth Required | Description |
|------------------|-------------|------|---------------|-------------|
| `getProposals()` | GET | `/api/document-tree-proposals/:documentId` | Yes | Get tree proposals |
| `createProposal()` | POST | `/api/document-tree-proposals` | Yes | Create tree proposal |
| `voteOnProposal()` | POST | `/api/document-tree-proposals/:proposalId/vote` | Yes | Vote on tree proposal |
| `applyProposal()` | POST | `/api/document-tree-proposals/:proposalId/apply` | Yes | Apply tree proposal |
| `cancelProposal()` | DELETE | `/api/document-tree-proposals/:proposalId` | Yes | Cancel tree proposal |

**Route File:** `server/routes/document-tree-proposals.js`

---

### organizationsApi

**Base Path:** `/api/organizations` and `/api/admin`

| Frontend Function | HTTP Method | Route | Auth Required | Description |
|------------------|-------------|------|---------------|-------------|
| `getOrganizations()` | GET | `/api/organizations` | Yes | Get user's organizations |
| `getOrganization(id)` | GET | `/api/organizations/:id` | Yes | Get organization details (includes `overviewPinnedEventId`, resolved `overviewPinnedEvent` when set) |
| `getOrganizationDocuments(id)` | GET | `/api/documents/organization/:id` | Yes | Get organization documents |
| `setOverviewPin(id, eventId)` | PUT | `/api/organizations/:id/overview-pin` | Yes (rep) | Pin or clear overview calendar event (`body: { eventId: string \| null }`) |
| `updateOrganization(id, updates)` | PUT | `/api/organizations/:id` | Yes | Update organization |
| `nominateRepresentative()` | POST | `/api/organizations/:id/representatives` | Yes | Nominate representative |
| `initiateMistrustVote()` | POST | `/api/governance/:id/representatives/:repId/mistrust-vote` | Yes | Initiate mistrust vote |
| `inviteMembers()` | POST | `/api/organizations/:id/members/invite` | Yes | Invite members |
| `getInvitations()` | GET | `/api/organizations/:id/invitations` | Yes | Get invitations |
| `addMember()` | POST | `/api/organizations/:id/members` | Yes | Add member |
| `removeMember()` | DELETE | `/api/organizations/:id/members/:userId` | Yes | Remove member |
| `getOrganizationVotes()` | GET | `/api/organizations/:id/votes` | Yes | Get organization votes |
| `createOrganizationVote()` | POST | `/api/organizations/:id/votes` | Yes | Create organization vote |
| `approveVote()` | POST | `/api/organizations/:id/votes/:voteId/approve` | Yes | Approve vote |
| `declineVote()` | POST | `/api/organizations/:id/votes/:voteId/decline` | Yes | Decline vote (representatives only, body: { reason }) |
| `castVote()` | POST | `/api/organizations/:id/votes/:voteId/vote` | Yes | Cast vote |
| `completeOrganizationVote()` | POST | `/api/organizations/:id/votes/:voteId/complete` | Yes | Complete vote |
| `createOrganization()` | POST | `/api/admin/organizations` | Admin | Create organization |
| `getAdminDashboard()` | GET | `/api/admin/dashboard` | Admin | Get admin dashboard |
| `getAllOrganizationsAdmin()` | GET | `/api/admin/organizations` | Admin | Get all organizations |
| `inviteRepresentatives()` | POST | `/api/admin/organizations/:id/representatives/invite` | Admin | Invite representatives |
| `updateOrganizationStatus()` | PATCH | `/api/admin/organizations/:id/status` | Admin | Update status |
| `getAllUsersAdmin()` | GET | `/api/admin/users` | Admin | Get all users |
| `promoteUserToAdmin()` | POST | `/api/admin/promote-admin/:userId` | Admin | Promote to admin |

**Route Files:** 
- `server/routes/organizations.js`
- `server/routes/admin.js`

---

### governanceApi

**Base Path:** `/api/governance/:organizationId`

| Frontend Function | HTTP Method | Route | Auth Required | Description |
|------------------|-------------|------|---------------|-------------|
| `getGovernanceRules()` | GET | `/api/governance/:organizationId/governance-rules` | Yes | Get governance rules |
| `updateGovernanceRules()` | PUT | `/api/governance/:organizationId/governance-rules` | Yes | Update governance rules |
| `getPermissions()` | GET | `/api/governance/:organizationId/permissions` | Yes | Get permissions |
| `getBootstrapStatus()` | GET | `/api/governance/:organizationId/bootstrap-status` | Yes | Get bootstrap status |
| `completeBootstrap()` | POST | `/api/governance/:organizationId/bootstrap/complete` | Yes | Complete bootstrap |
| `validateRuleChange()` | POST | `/api/governance/:organizationId/validate-rule-change` | Yes | Validate rule change |
| `getRuleHistory()` | GET | `/api/governance/:organizationId/rule-history` | Yes | Get rule history |
| `createElection()` | POST | `/api/governance/:organizationId/elections` | Yes | Create election |
| `getElections()` | GET | `/api/governance/:organizationId/elections` | Yes | Get elections |
| `startElection()` | POST | `/api/governance/:organizationId/elections/:electionId/start` | Yes | Start election |
| `nominateCandidate()` | POST | `/api/governance/:organizationId/elections/:electionId/candidates` | Yes | Nominate candidate |
| `acceptNomination()` | POST | `/api/governance/:organizationId/elections/:electionId/candidates/:candidateId/accept` | Yes | Accept nomination |
| `castElectionVote()` | POST | `/api/governance/:organizationId/elections/:electionId/vote` | Yes | Cast election vote |
| `updateElectionPhase()` | POST | `/api/governance/:organizationId/elections/:electionId/update-phase` | Yes | Update election phase |
| `completeElection()` | POST | `/api/governance/:organizationId/elections/:electionId/complete` | Yes | Complete election |
| `getElectionResults()` | GET | `/api/governance/:organizationId/elections/:electionId/results` | Yes | Get election results |
| `resignAsRepresentative()` | POST | `/api/governance/:organizationId/representatives/:repId/resign` | Yes | Resign as representative |
| `getPendingResignations()` | GET | `/api/governance/:organizationId/representatives/pending-resignations` | Yes | Get pending resignations |
| `checkElectionPhaseTransitions()` | POST | `/api/governance/:organizationId/elections/check-phase-transitions` | Yes | Check phase transitions |
| `forceElectionPhase()` | POST | `/api/governance/:organizationId/elections/:electionId/force-phase` | Yes | Force election phase |
| `getVotingAnalytics()` | GET | `/api/governance/:organizationId/analytics` | Yes | Get voting analytics |
| `ruleProposalsApi.getRuleProposals()` | GET | `/api/governance/:organizationId/rule-proposals` | Yes | Get rule proposals |
| `ruleProposalsApi.createRuleProposal()` | POST | `/api/governance/:organizationId/rule-proposals` | Yes | Create rule proposal |
| `ruleProposalsApi.startRuleProposalVoting()` | POST | `/api/governance/:organizationId/rule-proposals/:proposalId/start-voting` | Yes | Start rule proposal voting |
| `ruleProposalsApi.declineRuleProposal()` | POST | `/api/governance/:organizationId/rule-proposals/:proposalId/decline` | Yes | Decline rule proposal (representatives only, body: { reason }) |
| `ruleProposalsApi.withdrawRuleProposal()` | POST | `/api/governance/:organizationId/rule-proposals/:proposalId/withdraw` | Yes | Withdraw rule proposal (creator only, draft only) |
| `ruleProposalsApi.voteOnRuleProposal()` | POST | `/api/governance/:organizationId/rule-proposals/:proposalId/vote` | Yes | Vote on rule proposal |
| `ruleProposalsApi.completeRuleProposal()` | POST | `/api/governance/:organizationId/rule-proposals/:proposalId/complete` | Yes | Complete rule proposal |
| `auditLogsApi.getAuditLogs()` | GET | `/api/governance/:organizationId/audit-logs` | Yes | Get audit logs |
| `auditLogsApi.getAuditStats()` | GET | `/api/governance/:organizationId/audit-stats` | Yes | Get audit stats |
| `auditLogsApi.exportAuditLogs()` | GET | `/api/governance/:organizationId/audit-export` | Yes | Export audit logs |
| `auditLogsApi.getPublicAuditLogs()` | GET | `/api/governance/:organizationId/public-audit-logs` | No | Get public audit logs (includes structure proposals, tree proposals, document status decisions) |

**Route File:** `server/routes/governance.js`

**Note:** Structure proposal completions, tree proposal completions, and document status transitions (agreed/rejected) are logged to `organization_audit` and appear in public-audit-logs, ensuring full transparency for all decision types.

---

### authApi

**Base Path:** `/api/auth` and `/api/organizations/invitations`

| Frontend Function | HTTP Method | Route | Auth Required | Description |
|------------------|-------------|------|---------------|-------------|
| `login()` | POST | `/api/auth/login` | No | Login user |
| `register()` | POST | `/api/auth/register` | No | Register user |
| `getCurrentUser()` | GET | `/api/auth/me` | Yes | Get current user |
| `getUserProfile(userId)` | GET | `/api/auth/users/:userId` | Yes | Get user profile |
| `logout()` | POST | `/api/auth/logout` | Yes | Logout user |
| `validateInvitationToken()` | GET | `/api/organizations/invitations/validate/:token` | No | Validate invitation token |
| `acceptInvitation()` | POST | `/api/organizations/invitations/:token/accept` | Yes | Accept invitation |
| `declineInvitation()` | POST | `/api/organizations/invitations/:token/decline` | Yes | Decline invitation by token |
| `getPendingInvitations()` | GET | `/api/organizations/invitations/pending` | Yes | Get pending invitations |
| `acceptInvitationById()` | POST | `/api/organizations/invitations/accept-by-id` | Yes | Accept invitation by id (body: `{ invitationId }`) |
| `declineInvitationById()` | POST | `/api/organizations/invitations/decline-by-id` | Yes | Decline invitation by id (body: `{ invitationId }`) |

**Route File:** `server/routes/auth.js` (invitation routes in `server/routes/organizations.js`)

---

### searchApi

**Base Path:** `/api/search`

| Frontend Function | HTTP Method | Route | Auth Required | Description |
|------------------|-------------|------|---------------|-------------|
| `search(query, filters?)` | GET | `/api/search` | Yes | Unified search (documents, paragraphs, meetings) |
| `getSuggestions(query)` | GET | `/api/search/suggestions` | Yes | Multi-entity search suggestions |

**Query params (`GET /api/search`):** `q` (required), `types` (comma-separated: `document`, `paragraph`, `meeting`), `documentId`, `organizationId`, `status`, `dateFrom`, `dateTo`, `authorId`, `limit`, `offset`.

**Response:** `{ results: SearchResult[], count: number, facets?: Record<string, number> }` where each result includes `entityType`.

**Route File:** `server/routes/search.js`

---

### exportApi

**Base Path:** `/api/export`

| Frontend Function | HTTP Method | Route | Auth Required | Description |
|------------------|-------------|------|---------------|-------------|
| `exportDocument(id, format)` | GET | `/api/export/documents/:documentId` | Yes | Export document |

**Query Parameters:**
- `format`: `'pdf' | 'markdown' | 'docx'`

**Route File:** `server/routes/export.js`

---

### activityApi

**Base Path:** `/api/agreed-versions`, `/api/debated-proposals`, `/api/pending-votes`, `/api/pending-decisions`, `/api/decisions`

| Frontend Function | HTTP Method | Route | Auth Required | Description |
|------------------|-------------|------|---------------|-------------|
| `getAgreedVersions(since?)` | GET | `/api/agreed-versions` | Yes | Get agreed versions |
| `getAgreedHistory(params?)` | GET | `/api/agreed-versions/history` | Yes | Get aggregated history entries |
| `getDebatedProposals()` | GET | `/api/debated-proposals` | Yes | Get debated proposals |
| `getPendingVotes()` | GET | `/api/pending-votes` | Yes | Get pending votes (paragraph proposals only) |
| `getPendingDecisions(params?)` | GET | `/api/pending-decisions` | Yes | Get all open decisions (paragraph proposals, elections, org votes, rule proposals, structure proposals) |
| `getDecisions(params?)` | GET | `/api/decisions` | Yes | Get unified decisions timeline (paragraph changes, rule proposals, elections, org votes, structure proposals, tree proposals, document status, meeting decisions, document deletion outcomes from `decisions_audit`) |

**Query Parameters for `getDecisions`:**
- `limit`, `offset` - Pagination
- `documentId` - Filter by document
- `organizationId` - Filter by organization
- `kind` - Filter by decision type

**Query Parameters for `getPendingDecisions`:**
- `limit`, `offset` - Pagination
- `documentId` - Filter by document
- `organizationId` - Filter by organization
- `kind` - Filter by pending kind (`paragraph_proposal`, `election`, `organization_vote`, `rule_proposal`, `structure_proposal`)

**Response for `getPendingDecisions`:** `{ entries: PendingDecisionEntry[], pagination: { total, limit, offset, hasMore } }`. Each entry has `id`, `kind`, `timestamp`, `organizationId?`, `organizationName?`, `documentId?`, `documentTitle?`, `payload`.

**Route Files:**
- `server/routes/agreed-versions.js`
- `server/routes/debated-proposals.js`
- `server/routes/pending-votes.js`
- `server/routes/pending-decisions.js`
- `server/routes/decisions.js`

---

### Calendar (Phase 1+)

**Base Path:** `/api/calendar`

Calendar events are derived from documents (proposal_deadline, voting_deadline, paragraph_proposals_cutoff, adopted_at), representative_elections (nomination/voting start/end), meetings, and finalized scheduling polls. Access is restricted by user org membership and document access (same as decisions).

| Purpose | HTTP Method | Route | Auth Required | Description |
|---------|-------------|-------|---------------|-------------|
| Get events | GET | `/api/calendar` | Yes | Get calendar events in a date range (JSON). When `organizationId` is provided, user must be a member. |
| iCal feed | GET | `/api/calendar/ical` | Yes or token | iCal (RFC 5545) feed with enriched DESCRIPTION, LOCATION, URL, VALARM, and calendar metadata. |
| Subscribe URL | GET | `/api/calendar/ical/subscribe-url` | Yes | Returns `{ url, expiresAt }` with a long-lived token (1 year) for calendar subscription. |

**Query parameters for GET /api/calendar:**
- `organizationId` (optional) – Restrict to this organization; user must be a member. Omit for all member orgs.
- `from` (required) – Start of range (ISO date).
- `to` (required) – End of range (ISO date).
- `meetingId` (optional) – Return only events for this meeting (requires org membership; meeting must belong to `organizationId` when provided).

**Response for GET /api/calendar:** `{ events: CalendarEvent[] }`. Each event has:
- `id`, `type`, `title`, `start`, `end` (ISO 8601)
- `organizationId`
- `documentId?`, `electionId?`, `meetingId?`, `schedulingPollId?`, `link?`
- `description?`, `location?`, `meetingLink?`, `organizationName?` (enriched fields)

**Event types:** `document_proposal_deadline`, `document_voting_deadline`, `document_paragraph_cutoff`, `document_adopted`, `election_nomination_start`, `election_nomination_end`, `election_voting_start`, `election_voting_end`, `meeting`, `scheduling_poll_finalized`.

**Query parameters for GET /api/calendar/ical:**
- `organizationId` (optional)
- `from`, `to` (optional; default: now to 1 year ahead)
- `meetingId` (optional) – Single-meeting `.ics` download
- `token` (optional) – Subscription auth (from subscribe-url endpoint)

**iCal output:**
- **Meetings:** `DESCRIPTION` includes numbered agenda (when published), join link, and Colabora deep link; `LOCATION` for physical venue; `URL` prefers video link.
- **Document/election events:** contextual `DESCRIPTION` with org name and plain-language deadline text; all-day `VALUE=DATE` when user timezone is known.
- **Reminders:** `VALARM` for meetings (−1h, −15m) and deadlines (−1d, −1h).
- **Subscription metadata:** `X-WR-CALNAME`, `REFRESH-INTERVAL` (6h), `X-PUBLISHED-TTL` (6h).
- **Timezone:** timed events use `DTSTART;TZID=…` from the requesting user's profile preference when set; otherwise UTC.

**Route File:** `server/routes/calendar.js`  
**Service:** `server/services/CalendarService.js`

---

### Scheduling (Phase 2)

**Base Path:** `/api/organizations/:organizationId/scheduling-polls`

Scheduling polls let organizations create polls with time slots; members submit yes/no/maybe per slot; a representative or the creator finalizes with a chosen slot. All routes require authentication and organization membership (`requireAuth`, `requireOrganizationMember`). Create poll, add slots, and finalize additionally require the user to be an **organization representative** (or, for add slots and finalize, the **poll creator**).

| Purpose | HTTP Method | Route | Who can call | Description |
|---------|-------------|-------|----------------|-------------|
| Create poll | POST | `/:organizationId/scheduling-polls` | Representative only | Create a scheduling poll. Body: `{ title, description?, participationDeadline? }` (default deadline: 3 days). |
| List polls | GET | `/:organizationId/scheduling-polls` | Org member | List scheduling polls for the organization. |
| Get poll | GET | `/:organizationId/scheduling-polls/:pollId` | Org member | Get one poll with slots and aggregated response counts. Managers also receive `participationSummary` and `suggestedSlot`. |
| Update poll | PATCH | `/:organizationId/scheduling-polls/:pollId` | Creator or representative | Extend participation deadline. Body: `{ participationDeadline }`. Reopens `closed` polls when the new deadline is in the future. |
| Close participation | POST | `/:organizationId/scheduling-polls/:pollId/close` | Creator or representative | Manually close participation (`status` → `closed`). |
| Add slots | POST | `/:organizationId/scheduling-polls/:pollId/slots` | Creator or representative | Add time slots while poll is `open`. Body: `{ slots: [{ startAt, endAt, sortOrder? }] }`. |
| Set my responses | PUT | `/:organizationId/scheduling-polls/:pollId/responses` | Org member | Set current user's responses while poll is `open`. Returns `409 POLL_CLOSED` after participation closes. |
| Finalize poll | POST | `/:organizationId/scheduling-polls/:pollId/finalize` | Creator or representative | Set chosen slot and finalize from `open` or `closed`. Body: `{ chosenSlotId }`. |

**Poll lifecycle:** `open` (accepting responses until `participationDeadline`) → `closed` (participation ended; organizers finalize) → `finalized` (slot chosen).

**Response shapes:**
- **Create:** `{ poll: { id, organizationId, createdByUserId, title, description, status, chosenSlotId, participationDeadline, participationClosedAt, createdAt, updatedAt } }`
- **List:** `{ polls: [...] }` (same poll shape)
- **Get one:** `{ poll: {...}, slots: [{ id, startAt, endAt, sortOrder }], responseCounts: [{ slotId, yes, no, maybe }], chosenSlot?: { startAt, endAt } }` when finalized
- **Add slots:** `{ slots: [{ id, startAt, endAt, sortOrder }, ...] }`
- **Set responses:** `{ responses: [...] }` (the recorded list)
- **Finalize:** `{ poll: {...}, chosenSlot: { startAt, endAt } }`

**Route File:** `server/routes/organizations/scheduling.js`  
**Service:** `server/services/SchedulingService.js`

**Guest link routes (member, creator or rep):**

| Purpose | HTTP Method | Route | Who can call | Description |
|---------|-------------|-------|----------------|-------------|
| Get guest link | GET | `/:organizationId/scheduling-polls/:pollId/guest-link` | Creator or representative | Returns `{ url, expiresAt, tokenPreview }`. |
| Regenerate guest link | POST | `/:organizationId/scheduling-polls/:pollId/guest-link/regenerate` | Creator or representative | Revokes prior links and returns a new URL. |

**Get one poll (extended):** Also returns `guestLink: { url, expiresAt }`, merged member+guest `responseCounts`, and `guestRespondentSummaries` (display names only).

---

### Guest scheduling (public, no auth)

**Base Path:** `/api/public/guest`

Account-free poll participation via share token. Disabled when `PUBLIC_GUEST_SCHEDULING=false`.

| Purpose | HTTP Method | Route | Auth | Description |
|---------|-------------|-------|------|-------------|
| Guest poll view | GET | `/polls/:token` | None | Poll slots, merged counts, chosen slot, meeting pack, finalized minutes. Optional header `X-Guest-Session` restores guest session. |
| Save guest responses | PUT | `/polls/:token/responses` | None | Body: `{ displayName?, sessionToken?, responses: [{ slotId, response }] }`. Returns `{ sessionToken, displayName, responses }`. 409 when poll is not open. |

**Route File:** `server/routes/public/guest-scheduling.js`  
**Service:** `server/services/GuestSchedulingService.js`

---

### Meetings (Phase 3)

**Base Path:** `/api/organizations/:organizationId/meetings`

Meetings are first-class entities with title, scheduled time, optional location, and optional video room link (Jitsi or BigBlueButton). All routes require authentication and organization membership. Create meeting is allowed for any org member; update and create-room require the **meeting creator** or an **organization representative**. Calendar and iCal feeds include meeting events (see Calendar section).

**Configuration (env):** `VIDEO_PROVIDER` (`jitsi` | `bigbluebutton` | `none`; default `none`). If `none`, only manual `meeting_link` can be set. For Jitsi: `JITSI_MEET_BASE_URL` (default `https://meet.jit.si`). For BigBlueButton: `BIGBLUEBUTTON_URL`, `BIGBLUEBUTTON_SECRET` (required when `VIDEO_PROVIDER=bigbluebutton`).

| Purpose | HTTP Method | Route | Who can call | Description |
|---------|-------------|-------|----------------|-------------|
| Create from poll | POST | `/:organizationId/meetings/from-scheduling-poll/:pollId` | Org member | Create meeting from finalized scheduling poll's chosen slot. Body: `{ title?, createRoom? }`. |
| Create meeting | POST | `/:organizationId/meetings` | Org member | Create a meeting. Body: `{ title, scheduled_at (ISO), end_at?, location?, createRoom? }`. |
| List meetings | GET | `/:organizationId/meetings` | Org member | List meetings. Query: `from`, `to` (optional, ISO dates). |
| Get meeting | GET | `/:organizationId/meetings/:meetingId` | Org member | Get one meeting. |
| Update meeting | PUT | `/:organizationId/meetings/:meetingId` | Creator or representative | Update meeting. Body: `{ title?, scheduled_at?, end_at?, location?, meeting_link? }`. |
| Create video room | POST | `/:organizationId/meetings/:meetingId/create-room` | Creator or representative | Create Jitsi or BBB room and set `meeting_link`. 400 if provider is `none` or meeting already has a link. |

**Request/response shapes:**
- **POST create:** Request: `{ title, scheduled_at, end_at?, location?, createRoom? }`. Response: 201 — meeting object (`id`, `organizationId`, `title`, `scheduledAt`, `endAt`, `location`, `meetingLink`, `meetingProvider`, `createdByUserId`, `createdFromSchedulingPollId`, `createdAt`, `updatedAt`).
- **POST from-scheduling-poll:** Request: `{ title?, createRoom? }`. Response: 201 — same meeting shape.
- **GET list:** Response: 200 `{ meetings: Meeting[] }`.
- **GET one:** Response: 200 — single meeting.
- **PUT update:** Request: optional `title`, `scheduled_at`, `end_at`, `location`, `meeting_link`. Response: 200 — updated meeting.
- **POST create-room:** Response: 200 — meeting with `meeting_link` and `meeting_provider` set.

**Route File:** `server/routes/organizations/meetings.js`  
**Service:** `server/services/MeetingService.js`

---

### Vote verification and ballot export

**Base Path:** `/api/verification` (ballot export), `/api/vote-verification` (log and receipts)

See `docs/active/VERIFIABILITY_SPEC.md` for full details.

| Purpose | HTTP Method | Route | Auth Required | Description |
|---------|-------------|-------|---------------|-------------|
| Ballot export | GET | `/api/verification/ballots` | Yes | Anonymized ballots for a closed contest (query: `voteType`, `contestId`) |
| Tally verify | GET | `/api/verification/verify` | Yes | Recompute and compare (query: `voteType`, `contestId`). Response includes `verificationKind` (`pro_contra`, `election`, `meeting_options`), `match`, and type-specific fields. |
| List contests | GET | `/api/verification/contests` | Yes | Closed verifiable contests for org (query: `organizationId`, `limit?`, `offset?`) |
| Save my receipt | POST | `/api/vote-verification/my-receipts` | Yes | Persist user receipt (body: `organizationId`, `voteType`, `contestId`, `receiptId`, …) |
| List my receipts | GET | `/api/vote-verification/my-receipts` | Yes | User's saved receipts for org (query: `organizationId`) |
| Log (paginated) | GET | `/api/vote-verification/log` | Yes | Immutable vote log entries (query: `voteType?`, `contestId?`, `limit?`, `offset?`) |
| Log chain | GET | `/api/vote-verification/log/chain` | Yes | Recent log entries for chain verification (query: `limit?`) |
| Recorded receipts | GET | `/api/vote-verification/receipts` | Yes | Receipt ids and vote hashes for a contest (query: `voteType`, `contestId`) |

**Route Files:** `server/routes/ballot-export.js`, `server/routes/vote-verification.js`

---

### errorReportsApi

**Base Path:** `/api/error-reports`

**Note:** Error reports routes do NOT require database availability (can work even if DB is down).

| Frontend Function | HTTP Method | Route | Auth Required | Description |
|------------------|-------------|------|---------------|-------------|
| `submitReport(report)` | POST | `/api/error-reports` | No | Submit error report |
| `getReports(status?, limit?, offset?)` | GET | `/api/error-reports` | Yes | Get error reports |
| `getReport(id)` | GET | `/api/error-reports/:id` | Yes | Get error report |
| `updateReport(id, updates)` | PATCH | `/api/error-reports/:id` | Yes | Update error report |
| `getStats()` | GET | `/api/error-reports/stats/summary` | Yes | Get error stats |

**Route File:** `server/routes/error-reports.js`

---

## Health Check Routes

These routes are always available, even without database:

| Route | HTTP Method | Auth Required | Description |
|-------|-------------|---------------|-------------|
| `/api/health/detailed` | GET | No | Detailed health check |
| `/api/health/live` | GET | No | Liveness check |

---

## Route Registration Order

Routes are registered in a specific order in `server/bootstrap.js` to handle path conflicts:

1. Health check routes
2. Admin routes (`/api/admin`)
3. Organization routes (`/api/organizations`)
4. Notification routes (`/api/notifications`)
5. Governance routes (`/api/governance`)
6. Activity routes (`/api/pending-votes`, `/api/pending-decisions`, `/api/debated-proposals`, `/api/agreed-versions`, `/api/decisions`)
7. Calendar (`/api/calendar`)
8. Document tree proposals (`/api/document-tree-proposals`)
9. Document-specific routes (structure-proposals, structure-history, paragraphs, proposals, votes, comments)
10. Generic document routes (`/api/documents`)
11. Search routes (`/api/search`)
12. Export routes (`/api/export`)
13. Ballot export (`/api/verification`), vote verification log and receipts (`/api/vote-verification`)
14. Error reports routes (`/api/error-reports`)

---

## Request/Response Transformation

All API routes use middleware for request/response transformation:

- **Request Transformation:** Converts camelCase to snake_case for database compatibility
- **Response Transformation:** Converts snake_case to camelCase for frontend compatibility

This is handled by:
- `server/middleware/transformRequest.js` - Request transformation
- `server/middleware/transformResponse.js` - Response transformation

---

## Database Availability

Most routes require database availability via the `requireDatabase` middleware. If the database is unavailable, routes return HTTP 503 with an error message.

Exception: Error reports routes do NOT require database availability.

---

## Authentication

Authentication is handled via JWT tokens stored in:
- **Request Header:** `Authorization: Bearer <token>`
- **Local Storage:** `authToken` (frontend)

Routes explicitly declare their authentication requirements using middleware:
- `requireAuth` - Requires valid JWT
- `requireAdmin` - Requires admin privileges
- No middleware - Public routes

See `server/middleware/auth.js` for authentication implementation.


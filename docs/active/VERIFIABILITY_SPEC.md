# Vote Verifiability Specification

## 1. Scope and definitions

This specification defines verifiability for all in-app vote types in Colabora. It does **not** implement end-to-end cryptographic voting; it specifies anonymized ballot export, an immutable vote log, voter receipts, and vote hashes so that votes can be audited and tallies can be recomputed from exported data.

### 1.1 Vote types covered

The application has **eight vote surfaces**:

1. **Paragraph proposals** – votes on paragraph amendment proposals
2. **Document-level vote** – vote on the whole document
3. **Document deletion** – vote on deleting a document
4. **Document tree proposals** – votes on tree operations (move/delete/reorder)
5. **Structure proposals** – votes on structure changes (move/merge/split/etc.)
6. **Governance rule proposals** – votes on organization rule changes
7. **Organization votes** – yes/no/abstain votes on org decisions (policy, membership, etc.)
8. **Representative elections** – anonymous ballots (`anonymous_vote_ballots`) or public ballots (`election_votes`) for electing representatives
9. **Meeting votes** – live meeting option votes (`meeting_vote_responses`) for in-meeting decisions

See [§ 1.2 Vote type inventory](#12-vote-type-inventory) for tables and columns.

### 1.2 Terms

- **Contest** – A single vote event: one proposal, one document vote, one org vote, or one election/session. Identified by a contest ID (e.g. `proposal_id`, `document_id`, `vote_id`, `voting_session_id`).
- **Ballot** – One recorded vote (one row in the corresponding vote table) for a contest.
- **Export** – Anonymized list of ballots for a closed contest, in a deterministic order, for audit or recomputation.
- **Log entry** – One append-only record in the vote verification log, representing one ballot event.
- **Receipt** – Data returned to the voter (e.g. `receiptId`, `contestId`, `voteType`) so they can verify their vote was recorded.
- **Vote hash** – Deterministic hash of (contest, voter identifier or token, choice, timestamp, etc.) for integrity; must not break anonymity when voting is anonymous.

---

## 2. Vote type inventory

For each vote type, the following is defined.

| Vote type | Table(s) | Contest ID column(s) | Vote value column | Allowed values | Anonymity source |
|-----------|----------|----------------------|--------------------|----------------|-------------------|
| Paragraph proposals | `votes` | `proposal_id` | `vote` | PRO, NEUTRAL, CONTRA | `documents.voting_anonymous` (via paragraph → document) |
| Document-level vote | `document_votes` | `document_id` | `vote` | PRO, NEUTRAL, CONTRA | `documents.voting_anonymous` |
| Document deletion | `document_deletion_votes` | `document_id` | `vote` | PRO, NEUTRAL, CONTRA | `documents.voting_anonymous` |
| Document tree proposals | `document_tree_proposal_votes` | `proposal_id` | `vote` | PRO, NEUTRAL, CONTRA | `documents.voting_anonymous` (join via document_tree_proposals → document) |
| Structure proposals | `structure_proposal_votes` | `structure_proposal_id` | `vote` | PRO, NEUTRAL, CONTRA | `documents.voting_anonymous` (via structure_proposals.document_id) |
| Governance rule proposals | `governance_rule_proposal_votes` | `proposal_id` | `vote` | PRO, NEUTRAL, CONTRA | `governance_rule_proposals.anonymous_voting` |
| Organization votes | `vote_ballots`, `organization_votes` | `vote_id` (organization_votes.id) | `vote_choice` | yes, no, abstain | Non-anonymous (no anonymity field; treat as identified) |
| Representative elections | `anonymous_vote_ballots` (anonymous) or `election_votes` (public) | `voting_session_id` (anonymous) or `election_id` (public) | `vote_choice` / aggregated candidate choice | candidate id(s) or ranked JSON | `representative_elections.anonymous_voting` |
| Meeting votes | `meeting_vote_responses` | `meeting_votes.id` | `option_id` | option id per response | `meeting_votes.anonymous` |

**Implementation references:**

- Paragraph: `server/routes/votes.js`
- Document / deletion: `server/routes/documents.js`
- Tree proposals: `server/routes/document-tree-proposals.js`
- Structure proposals: `server/routes/structure-proposals.js`
- Rule proposals and representative elections: `server/routes/governance.js`
- Organization votes: `server/routes/organizations.js`
- Schema: `server/database/DatabaseManager.js`

---

## 3. Anonymity rules

### 3.1 When voting is anonymous

The following fields must **never** appear in export or in the immutable log:

- `user_id`
- `user_name`
- `user_email`
- `anonymous_token`
- `voter_token` (or any token that can be linked to `voter_tokens.user_id`)

For representative elections, ballots are keyed by `voter_token`; that token must not be exported or logged in a way that links to a real user. Export and log may include only contest id, choice, timestamp, and optionally `receipt_id` and `vote_hash` (where the hash input does not include user identity).

### 3.2 When voting is non-anonymous

Export and log may include a stable voter identifier for audit (e.g. user id or pseudonym/display name). Email must not be included in export unless explicitly required for a defined audit process.

### 3.3 Forbidden fields per vote type

| Vote type | Forbidden in export and log (when anonymous) |
|-----------|-----------------------------------------------|
| Paragraph proposals | user_id, user_name, user_email, anonymous_token, voter_token |
| Document-level vote | user_id, user_name, user_email, anonymous_token, voter_token |
| Document deletion | user_id, user_name, user_email, anonymous_token, voter_token |
| Document tree proposals | user_id, user_name, user_email, anonymous_token, voter_token |
| Structure proposals | user_id, user_name, user_email, anonymous_token, voter_token |
| Governance rule proposals | user_id, user_name, user_email, anonymous_token, voter_token |
| Organization votes | None – non-anonymous; identifier may be exported per § 3.2 |
| Representative elections | user_id, user_name, user_email, anonymous_token, voter_token (voter_token must not be linked to user) |

---

## 4. Export format

### 4.1 Per-vote-type record shape

Each exported ballot is a record with the following shape (common across types; field names are canonical):

- `contestId` (string) – Contest identifier (proposal_id, document_id, vote_id, voting_session_id as appropriate).
- `choice` (string) – Vote value. Use **PRO / NEUTRAL / CONTRA** for proposal-style votes; use **yes / no / abstain** for organization votes and representative elections. For tally recomputation, map yes→PRO, no→CONTRA, abstain→NEUTRAL (see TALLY_SPEC.md).
- `createdAt` (ISO 8601 string) – When the vote was recorded.
- `receiptId` (string, optional) – Present when receipts are implemented (Agent D).
- `voteHash` (string, optional) – Present when vote hashes are implemented (Agent D).

For **non-anonymous** contests (e.g. organization votes), export may additionally include a voter identifier (e.g. `userId` or `voterPseudonym`) as defined in § 3.2; never include email unless required by a separate audit policy.

### 4.2 Deterministic sort order

Exports must be ordered so that the same contest always yields the same sequence of ballots. Use:

- **Sort key:** `created_at ASC, id ASC` (or equivalent: `createdAt` then ballot row `id`).

Apply this order when querying each vote table so that repeated exports for the same closed contest are byte-for-byte identical.

### 4.3 API response envelope

The ballot export API response must have the following shape so the verifier can compare recomputed tally to announced result:

```json
{
  "contestId": "<string>",
  "voteType": "<voteType enum>",
  "ballots": [ "<array of ballot records per § 4.1>" ],
  "closedAt": "<ISO 8601 or null>",
  "announcedResult": {
    "pro": "<number>",
    "contra": "<number>",
    "neutral": "<number>",
    "total": "<number>"
  }
}
```

`voteType` must be one of the canonical names in [§ 5 Log entry schema](#5-log-entry-schema). `announcedResult` may be omitted if the contest does not expose counts in this form; the verifier will recompute from `ballots` and compare when available.

### 4.4 Ballot export API (handover for Agent E)

- **Endpoint:** `GET /api/verification/ballots`
- **Query parameters:** `voteType` (required), `contestId` (required). Both must be present and valid.
- **Auth:** Requires authentication (`Authorization: Bearer <token>`). Returns 401 if unauthenticated.
- **Response:** JSON envelope per § 4.3: `contestId`, `voteType`, `ballots`, `closedAt`, `announcedResult` (when available).
- **Restriction:** Ballot export is only allowed when the contest is **closed** (voting has ended). If the contest exists but is not closed, the API returns **403** with code `CONTEST_NOT_CLOSED`. If the contest does not exist or the ID is invalid, returns **404**.
- **Vote type → contestId:** Use the table in [§ 5.2 contestId and voteType per vote type](#52-contestid-and-votetype-per-vote-type): for example, for `voteType=paragraph` use `contestId=proposal_id`; for `voteType=organization` use `contestId=organization_votes.id`.
- **Recomputation:** See `docs/active/TALLY_SPEC.md` § 5 (Recompute from export) and § 5.1 (Recompute from ballot export API). A reference script that reads an export JSON file and outputs counts (and compares to `announcedResult`) is at `scripts/recompute-tally-from-export.js`.

### 4.5 Related verification APIs (Agent C log, Agent D receipts)

The following endpoints support verification and auditing alongside the ballot export:

- **Log (Agent C):** `GET /api/vote-verification/log` – Query parameters: `voteType?`, `contestId?`, `limit?`, `offset?`. Returns immutable log entries (no PII) in ascending sequence order. Use to verify that vote events were recorded in order and to check the chain of `previousEntryHash`.
- **Log chain:** `GET /api/vote-verification/log/chain` – Query: `limit?`. Returns the most recent log entries for chain verification (previous-entry hash links).
- **Recorded receipts (Agent D):** `GET /api/vote-verification/receipts` – Query parameters: `voteType` (required), `contestId` (required). Returns `{ receiptIds, voteHashes }` in deterministic order for the contest. Voters can check that their receipt id appears in the list. No PII.

All of the above require authentication. The same `voteType` and `contestId` conventions apply (see § 5.2).

### 4.6 Verifier (Agent E)

The tally verifier recomputes pro/contra/neutral/total from exported ballots and compares the result to `announcedResult`. See TALLY_SPEC.md § 5 and § 5.1 for the recomputation steps.

- **How to run (script):**
  - **File mode:** `node scripts/recompute-tally-from-export.js <path-to-export.json>` — reads a saved export JSON (e.g. from `GET /api/verification/ballots`) and outputs computed counts, comparison to `announcedResult`, and Match YES/NO (with diff on mismatch).
  - **API mode:** `node scripts/recompute-tally-from-export.js --api-url=<baseURL> --token=<JWT> --vote-type=<type> --contest-id=<id>` — fetches the ballot export from the API and runs the same recompute and compare.
- **Exit codes:** 0 = match or no `announcedResult` to compare; 1 = mismatch or error (missing params, file not found, HTTP 401/403/404, etc.).
- **Verify endpoint:** `GET /api/verification/verify?voteType=&contestId=` (auth required). Returns `{ match, verificationKind, contestId, voteType, computed?, announcedResult?, diff?, ballotCount?, announcedBallotCount? }`. Elections use `verificationKind: election` (ballot count compare); meeting votes use `meeting_options` (per-option counts).
- **Contest list:** `GET /api/verification/contests?organizationId=` — closed contests for Transparency tab (active org members).
- **User receipts:** `POST /api/vote-verification/my-receipts`, `GET /api/vote-verification/my-receipts?organizationId=` — server-side receipt store for cross-device access.

---

## 5. Log entry schema

A single canonical schema is used for all vote types in the immutable vote verification log.

### 5.1 Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| logSequenceId | integer | yes | Monotonically increasing sequence number (e.g. row id or sequence_index). |
| previousEntryHash | string | yes | Hash of the previous log entry’s canonical representation (or empty/seed for first entry). |
| voteType | string | yes | One of: `paragraph`, `document`, `document_deletion`, `document_tree`, `structure`, `governance_rule`, `organization`, `representative_election`. |
| contestId | string | yes | Contest identifier (see table below). |
| choice | string | yes | PRO, NEUTRAL, CONTRA or yes, no, abstain. |
| timestamp | string | yes | ISO 8601 when the vote was recorded. |
| voteHash | string | no | Vote hash if implemented (Agent D). |
| receiptId | string | no | Receipt id if implemented (Agent D). |
| created_at | string | yes | When the log row was written (ISO 8601). |

Optional: a single **payload** field (e.g. JSON) for extensibility; if used, it must not contain any forbidden anonymity fields.

### 5.2 contestId and voteType per vote type

| Vote type | voteType | contestId |
|-----------|----------|-----------|
| Paragraph proposals | paragraph | proposal_id |
| Document-level vote | document | document_id |
| Document deletion | document_deletion | document_id |
| Document tree proposals | document_tree | proposal_id |
| Structure proposals | structure | structure_proposal_id |
| Governance rule proposals | governance_rule | proposal_id |
| Organization votes | organization | vote_id (organization_votes.id) |
| Representative elections | representative_election | voting_session_id |

### 5.3 Anonymity

Log entries must respect anonymity: for anonymous vote types, do not store `user_id`, `user_name`, `user_email`, `anonymous_token`, or `voter_token` in the log (see § 3).

### 5.4 Log and receipts read API

Auditors and the verifier can read the immutable log and the list of recorded receipt ids per contest.

- **Log (paginated):** `GET /api/vote-verification/log`  
  Query: `voteType?`, `contestId?`, `limit?` (default 100, max 1000), `offset?`.  
  Response: `{ entries: [{ logSequenceId, previousEntryHash, voteType, contestId, choice, timestamp, voteHash?, receiptId?, createdAt }], total, limit, offset }`. Entries are in ascending sequence order. No PII.

- **Log chain (for chain verification):** `GET /api/vote-verification/log/chain`  
  Query: `limit?` (default 50, max 500).  
  Response: `{ entries: [...], total, limit }`. Returns the most recent entries in ascending sequence order so auditors can verify each entry’s `previousEntryHash` links to the previous.

- **Recorded receipts per contest:** `GET /api/vote-verification/receipts`  
  Query: `voteType` (required), `contestId` (required).  
  Response: `{ receiptIds: string[], voteHashes: string[] }` in deterministic order (created_at ASC, id ASC). No PII. Voters can check that their receipt id appears in `receiptIds`.

Auth: all three endpoints require authentication (`Authorization: Bearer <token>`). Returns 401 if unauthenticated.

---

## 6. Receipt format

### 6.1 Voter-facing (API response to vote-cast)

Returned to the client after a vote is successfully recorded:

- `receiptId` (string) – Unique id for this ballot (e.g. UUID).
- `contestId` (string) – Contest identifier.
- `voteType` (string) – Same enum as in § 5.
- `voteRecordedAt` (string, optional) – ISO 8601 timestamp.

Optionally, a short **verification code** (e.g. derived from `receiptId`) may be returned so the voter can later check that their receipt appears in the list of recorded receipts for the contest.

### 6.2 Server-stored

- Store `receipt_id` (and optionally `vote_hash`) on the vote row where the schema supports it.
- Pass `receiptId` (and `voteHash` when available) to the log append service (Agent C) so they can be stored in the log entry.

---

## 7. Vote hash

### 7.1 Purpose

The vote hash allows integrity checks (ballot not altered) and optional verification that a receipt corresponds to a recorded ballot, without revealing the voter in anonymous contexts.

### 7.2 Hash function

Use SHA-256 over a deterministic encoding of the hash input (e.g. as in `server/routes/governance.js` `hashVote`). The encoding must be **deterministic**: same inputs must always produce the same hash. Use a fixed key order (e.g. alphabetically sorted keys) or a fixed-order JSON schema when serializing to string; do not rely on arbitrary object key order.

### 7.3 Hash input per vote type

- **Generic shape (non-anonymous):** `H(contestId, userId, choice, timestamp, nonce)` – do not include fields that are not yet available at write time (e.g. receiptId can be included if generated before the hash).
- **Anonymous types:** Do **not** include `user_id`. Use a non-reversible token or no voter identifier in the input (e.g. for representative elections, the existing pattern uses session + token + choice + ranking/timestamp; the token must not be exportable in a way that links to the user).

### 7.4 Representative elections (anonymous)

`anonymous_vote_ballots` already has a `vote_hash` column. The current implementation hashes an object containing at least: `sessionId`, `token` (anonymous token), `voteChoice`, `ranking` (candidate ranking), `timestamp`. This spec does not change that; Agent D should align new receipt/hash behaviour with this pattern and document the exact key set and order for deterministic hashing. The hash must not include any data that links the token to `voter_tokens.user_id` in export or log.

### 7.4a Representative elections (public)

When `representative_elections.anonymous_voting` is false, ballots are stored in `election_votes` with `user_id`. The vote hash uses the same canonical shape as organization votes: `H(contestId, userId, choice, timestamp, receiptId)` with alphabetically sorted keys. Export and log **may** include `userId` for audit.

### 7.5 Deterministic encoding

Specify in implementation: when building the object to hash, use a single canonical key order (e.g. sorted keys) and the same string representation (e.g. JSON) so that recomputation yields the same hash.

---

## Handover (Agent A → B, C, D, E)

- **B, C, D:** Implement according to this document and to `docs/active/TALLY_SPEC.md`. Do not export or log any field listed as forbidden for anonymous contexts (§ 3.3).
- **Forbidden in anonymous export/log:** `user_id`, `user_name`, `user_email`, `anonymous_token`, `voter_token` (and any link from token to user).
- **E:** Use `docs/active/TALLY_SPEC.md` and the export response shape in this spec to implement the verifier once the ballot export API (B) is available.

**Spec locations:**

- Verifiability: `docs/active/VERIFIABILITY_SPEC.md` (this file)
- Tally: `docs/active/TALLY_SPEC.md`

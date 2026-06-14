# Tally Specification

## 1. Purpose and references

This document specifies how vote counts and approval are computed so that a verifier can recompute the tally from exported ballots and compare it to the announced result. All formulas and rules below match the current application behaviour.

**Implementation references:**

- **Count aggregation:** `server/utils/voteCounts.js` – `calculateVoteCounts`, `normalizeVoteValue`, `convertVoteCountsFormat`
- **Unified voting:** `server/modules/unified-voting.js` – `aggregateVotes`, `checkApproval`, `checkQuorum`, `calculateApprovalPercentage`, `combineVoteCounts` (for legacy vote_choice)
- **Organization vote completion:** `server/routes/organizations.js` (complete endpoint)
- **Governance rule proposal status:** `server/routes/governance.js` (rule proposal status and approval)

---

## 2. Count aggregation (per ballot)

### 2.1 Choice-to-count mapping

Each ballot contributes to exactly one of three buckets: **pro**, **contra**, **neutral**. The mapping is:

| Ballot value (vote or vote_choice) | Count bucket |
|-----------------------------------|--------------|
| PRO, yes | pro |
| CONTRA, no | contra |
| NEUTRAL, abstain | neutral |

Any other value is **excluded from the total** (not counted). Implementation: `server/utils/voteCounts.js` `calculateVoteCounts` (lines 24–40); it reads `vote.vote` or `vote.voteChoice`.

### 2.2 Normalization (for display or recomputation)

When inputs use yes/no/abstain, they can be normalized to PRO/CONTRA/NEUTRAL for a single internal representation:

- yes → PRO  
- no → CONTRA  
- abstain → NEUTRAL  

Implementation: `server/utils/voteCounts.js` `normalizeVoteValue`.

### 2.3 SQL aggregation pattern (proposal-style tables)

For vote tables that store `vote` as PRO/NEUTRAL/CONTRA, the server uses this pattern (see `server/modules/unified-voting.js` `aggregateVotes`):

```sql
SELECT
  COUNT(CASE WHEN vote = 'PRO'   THEN 1 END) AS pro_votes,
  COUNT(CASE WHEN vote = 'CONTRA' THEN 1 END) AS contra_votes,
  COUNT(CASE WHEN vote = 'NEUTRAL' THEN 1 END) AS neutral_votes,
  COUNT(*) AS total_votes
FROM <vote_table>
WHERE <proposal_id_column> = ?
```

**Proposal ID column by vote type:**

| Vote type | Table | proposalIdColumn |
|-----------|-------|-------------------|
| Paragraph proposals | votes | proposal_id |
| Document-level vote | document_votes | document_id |
| Document deletion | document_deletion_votes | document_id |
| Document tree proposals | document_tree_proposal_votes | proposal_id |
| Structure proposals | structure_proposal_votes | structure_proposal_id |
| Governance rule proposals | governance_rule_proposal_votes | proposal_id |

### 2.4 Organization votes (vote_ballots)

Organization votes do not use the SQL pattern above. Counts are stored on the contest row in `organization_votes`: `result_yes`, `result_no`, `result_abstain`, and are incremented when each ballot is cast. For recomputation from an export of ballots:

- Sum ballots by `vote_choice`: count of `yes` → result_yes, `no` → result_no, `abstain` → result_abstain.
- totalVotes = result_yes + result_no + result_abstain.

Implementation: `server/routes/organizations.js` (cast: increment `result_yes`/`result_no`/`result_abstain`; complete: read these for approval and quorum).

### 2.5 Representative elections (anonymous_vote_ballots)

For session-level yes/no/abstain (e.g. policy votes via voting_sessions), count ballots by `vote_choice` the same way as organization votes. For candidate elections, the server also maintains per-candidate counts (`election_candidates.votes_received`). A verifier may either:

- Recompute session-level yes/no/abstain from exported ballots and compare to session totals, or  
- Recompute per-candidate totals from exported ballots (when export includes candidate/ranking) and compare to `votes_received`.

---

## 3. Approval and threshold

### 3.1 Approval percentage

Two methods are used, depending on contest and governance rules (see § 3.3):

**Method 1 – all_votes (percentage of votes cast):**

```
approvalPercentage = (totalVotes > 0) ? (proVotes / totalVotes) * 100 : 0
```

**Method 2 – all_members (percentage of eligible voters):**

```
approvalPercentage = (totalEligible > 0) ? (proVotes / totalEligible) * 100 : 0
```

Implementation: `server/modules/unified-voting.js` `calculateApprovalPercentage` (lines 149–156).

### 3.2 Approved condition

A proposal (or equivalent) is **approved** when **both** of the following hold:

1. **Quorum is met:** actualVotes >= quorumRequired (see § 3.4).  
2. **Threshold is met:** approvalPercentage >= acceptanceThreshold (e.g. 75%).

Implementation: `server/modules/unified-voting.js` `checkApproval` (lines 239–256): `approved = quorumMet && approvalPercentage >= acceptanceThreshold`.

### 3.3 Governance rule variants (rule proposals)

For **governance rule proposals**, the calculation method and quorum come from the organization’s governance rules (or a snapshot at proposal creation):

- **threshold_calculation_method:** `all_votes` or `all_members`. If not set, the code defaults to `all_members` (see `server/modules/unified-voting.js` `checkApproval`, line 232).
- **totalEligible:** For organization-scoped contests, total eligible = count of active organization members (`organization_members` where `status = 'active'`). Implementation: `UnifiedVotingService.getEligibleVoterCount(db, organizationId, 'organization')`.
- **acceptanceThreshold:** From the proposal (e.g. `governance_rule_proposals.threshold_percentage`) or governance default (e.g. 75%).

Rule proposal status endpoint combines: `aggregateVotes` on `governance_rule_proposal_votes`, optional `aggregateLegacyVotes` and `combineVoteCounts`, then `checkApproval` with `organizationId` so that governance rules (or snapshot) supply `calculationMethod` and quorum. Reference: `server/routes/governance.js` (e.g. status endpoint around lines 2289–2326).

### 3.4 Quorum

**Formula:**

- If `minVotersRequired` is provided and > 0: `quorumRequired = minVotersRequired`.
- Else: `quorumRequired = max(1, ceil(totalEligible * quorumPercentage))`.

**quorumMet:** `actualVotes >= quorumRequired`.

`quorumPercentage` is typically in the range 0–1 (e.g. 0.5 for 50%). Implementation: `server/modules/unified-voting.js` `checkQuorum` (lines 168–179).

---

## 4. Organization votes and representative elections

### 4.1 Organization votes

- **Tally from ballots:** Sum ballots by `vote_choice`: yes → result_yes, no → result_no, abstain → result_abstain. totalVotes = result_yes + result_no + result_abstain.
- **Approval rate:** `approvalRate = (result_yes / totalVotes) * 100` (when totalVotes > 0). Implementation: `server/routes/organizations.js` complete endpoint, `approvalRate = (totalYes / totalVotes) * 100`.
- **Threshold:** Stored in `organization_votes.threshold`. Normalization: if value ≤ 1, treat as 0–1 and multiply by 100 for comparison; otherwise treat as 0–100. Implementation: `rawThreshold <= 1 ? rawThreshold * 100 : rawThreshold`.
- **Quorum:** `quorumRequired = ceil(memberCount * quorumPercentage)`. For `representative_removal` vote type, `mistrust_vote_quorum_percentage` is used; otherwise `default_quorum_percentage`. memberCount = active organization members. Implementation: `server/routes/organizations.js` (lines 2698–2703).
- **Passed:** Vote status is set to `passed` when `quorumMet && approvalMet` (approvalMet = approvalRate >= threshold); otherwise `failed`. Implementation: same file, `passed = quorumMet && approvalMet`, `newStatus = passed ? 'passed' : 'failed'`.

### 4.2 Representative elections

- For **yes/no/abstain** session types (e.g. policy votes using `anonymous_vote_ballots` or equivalent): use the same counting as organization votes (sum by vote_choice).
- For **candidate elections:** Tally is per-candidate (`election_candidates.votes_received`). The verifier may either recompute session-level totals from exported ballots or recompute per-candidate counts from exported ballot data (e.g. ranking or choice), depending on what the export includes and what the verifier scope is.

---

## 5. Recompute from export

To verify a contest from its ballot export:

1. **Input:** Export payload with `ballots` (and optionally `announcedResult`). Each ballot has at least `contestId`, `choice`, `createdAt` (see VERIFIABILITY_SPEC.md § 4).

2. **Normalize choices:** Map each ballot’s `choice` to pro/contra/neutral: PRO or yes → pro; CONTRA or no → contra; NEUTRAL or abstain → neutral. Skip or ignore any other value.

3. **Count:** Sum ballots in each bucket to get pro, contra, neutral, total.

4. **Approval (for proposal-style or org votes):**  
   - If the contest uses **all_votes:** approvalPercentage = (pro / total) * 100.  
   - If the contest uses **all_members:** approvalPercentage = (pro / totalEligible) * 100 (totalEligible must be known from context or API).  
   For organization votes, use approvalRate = (pro / total) * 100 and compare to threshold (with 0–1 vs 0–100 normalization if needed).

5. **Quorum (when applicable):** Compute quorumRequired from totalEligible and quorumPercentage (or use minVotersRequired). quorumMet = total >= quorumRequired.

6. **Compare:** Compare computed counts to `announcedResult` (pro, contra, neutral, total) if present, or to counts returned by the server for that contest. Report match or mismatch (and optionally a diff).

### 5.1 Recompute from ballot export API

Use the `ballots` array from `GET /api/verification/ballots?voteType=<type>&contestId=<id>`. Each ballot has at least `contestId`, `choice`, and `createdAt` (see VERIFIABILITY_SPEC.md § 4). Normalize each ballot’s `choice` per § 2.2 (PRO or yes → pro; CONTRA or no → contra; NEUTRAL or abstain → neutral). Sum ballots in each bucket to get pro, contra, neutral, total. Compare to the response’s `announcedResult` when present. The verifier script `scripts/recompute-tally-from-export.js` supports both file input (path to export JSON) and API fetch (flags `--api-url`, `--token`, `--vote-type`, `--contest-id`). Alternatively, use `GET /api/verification/verify?voteType=&contestId=` to get match and computed counts in one call (see VERIFIABILITY_SPEC.md § 4.6).

### 5.2 Vote type–specific notes (for verifier / Agent E)

- **Governance rule proposals:** Use `all_votes` or `all_members` per organization governance rules (or proposal snapshot); see § 3.3.
- **Organization votes:** Approval rate = (pro / total) × 100; threshold may be stored as 0–1 or 0–100 (§ 4.1).
- **Representative elections:** Session-level yes/no/abstain tally as above; per-candidate counts are separate when the export includes candidate/ranking data.

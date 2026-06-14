# Meeting Protocol UI/UX Quick Wins

Date: 2026-04-28
Owner: Product + Frontend
Scope: Fast, low-risk improvements to meeting protocol UX in current architecture.

---

## Goal

Improve in-meeting speed and clarity without forcing linear flows.

Important product constraint:
- Users must be able to do only one step (only brainstorm, only vote, only date poll, only decision logging) or combine steps as needed.
- "Next step" should be suggested, never required.

---

## Prioritization

- P0: Very low effort, high impact, no backend schema changes
- P1: Low/medium effort, strong UX payoff, mostly frontend
- P2: Medium effort, larger interaction/state refinement

---

## P0 Quick Wins (Do First)

1) Next Action Prompt (non-blocking)
- Add a small contextual panel at top/bottom of protocol area:
  - "Brainstorm open: Start vote when ready"
  - "Vote closed: Record decision"
  - "Date poll finalized: Create meeting"
- Keep optional: include "Dismiss" and "Not now".
- Why: Removes "what now?" confusion with minimal UI work.

2) Primary vs Secondary Actions in each block
- Each protocol block should expose one primary CTA and 1-2 secondary alternatives.
- Example in brainstorm block:
  - Primary: "Go to vote"
  - Secondary: "End without vote"
- Why: Faster decision-making during live meetings.

3) Collapse stale protocol blocks by default
- Auto-collapse older steps once flow advances (brainstorm ended after vote starts, etc.).
- Keep expandable for audit/history.
- Why: Reduces timeline noise and scrolling friction.

4) Stronger default values in existing dialogs
- Prefill vote title with current topic.
- Prefill vote options from brainstorm options.
- Prefill date poll title from meeting title.
- Keep editable.
- Why: Fewer clicks and less typing with current APIs.

5) Language consistency pass in protocol panel
- Remove mixed-language labels inside the same surface.
- Align button verbs with intent ("Go to vote", "Record decision", "Create meeting").
- Why: Immediate polish and reduced cognitive load.

6) Outcome callout for closed votes
- Add clear result panel in vote-ended state:
  - winner/highest option
  - participation count
  - quick CTA: "Record decision"
- Why: Makes outcomes visible and actionable.

---

## P1 Quick Wins (Next Batch)

7) "Record Decision" quick action
- Add lightweight decision capture UI after vote/date poll outcome.
- Implement as structured minutes paragraph in Decisions section first (no new schema required).
- Include optional "Create to-do from this decision" toggle.
- Why: Closes the loop from discussion to actionable record.

8) Inline conversion actions on timeline blocks
- Brainstorm block: "Go to vote"
- Vote-ended block: "Record decision", "Create to-do"
- Date-poll block: "View poll", "Create meeting"
- Why: Users stay in one surface and continue work quickly.

9) Reusable "Quick Action Chips"
- Show compact chips near action bar:
  - "Start vote from current brainstorm"
  - "Record decision from latest vote"
  - "Create meeting from finalized poll"
- Why: Reduces hunt in dense UIs.

10) Better empty and partial state messaging
- If flow is intentionally incomplete, show clear status:
  - "Brainstorm completed without vote"
  - "Vote completed, decision not yet recorded"
- Why: Supports modular/non-linear use cases.

---

## P2 Quick Wins (Still Incremental)

11) Modular flow status badges
- Add per-block status tags:
  - Open, Completed, Stopped, Partial
- Why: Improves scanability in long protocol timelines.

12) "Create from latest" shortcuts
- Add shortcuts in action bar:
  - Start vote from latest brainstorm options
  - Create to-do from latest decision text
- Why: Speeds common transitions without enforcing them.

13) Lightweight "Live Moderator Mode"
- Compact strip with:
  - current topic
  - active open item (brainstorm/vote)
  - one recommended next action
- Why: Better facilitation under time pressure.

---

## Guardrails for the Overhaul

- Do not force wizard-like completion.
- Never hide ability to stop at any step.
- Keep full timeline auditability.
- Preserve moderator permissions and finalized-minutes constraints.
- Prefer additive UI on top of existing APIs first.

---

## Suggested Implementation Sequence

Sprint 1 (P0):
- Next action prompt
- Primary/secondary action hierarchy
- Stale block collapse
- Prefill improvements
- Language consistency pass

Sprint 2 (P1):
- Record decision quick action
- Inline conversion actions
- Quick action chips
- Partial-state messaging

Sprint 3 (P2):
- Status badges
- Create-from-latest shortcuts
- Lightweight moderator live mode

---

## Success Metrics

- Time from brainstorm start to vote start
- Time from vote close to decision record
- Percent of votes that lead to decision entries
- Percent of finalized date polls that become meetings
- Clicks per common protocol task (baseline vs after)


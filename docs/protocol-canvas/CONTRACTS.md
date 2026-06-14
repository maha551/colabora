# Protocol Block Canvas Contracts (W0 Freeze)

This file defines the freeze contract for parallel implementation workstreams.

## Scope

The block-canvas redesign is an additive rendering layer over existing minutes data and handlers.

- No backend schema change in v1.
- No changes to overlay mechanics in `MeetingsTab`.
- Minutes render exclusively via `BlockCanvas` + `buildProtocolBlocks` (legacy `MinutesBlock` removed).

## Canonical Types

Source of truth file:

- `client/src/components/OrganizationManagement/blocks/protocolBlocks.types.ts`

Core exported contracts:

- `ProtocolBlockType`
- `ProtocolBlockStatus`
- `ProtocolBlock`
- `ProtocolBlockLink`
- `ProtocolNextAction`
- `BuildProtocolBlocksInput`
- `BuildProtocolBlocksOutput`
- `ProtocolUiHandlers`

## Adapter Contract

`buildProtocolBlocks(input: BuildProtocolBlocksInput): BuildProtocolBlocksOutput`

Rules:

- Deterministic ordering.
- Pure function (no side effects, no fetch, no mutation of input).
- Must preserve all timeline semantics (paragraph/event/todo ordering).
- Must infer link chips from existing IDs/payloads only.

## UI Surface Contract

Future component surface:

- `BlockCanvas` receives:
  - `detail`, `timelineItems`, `agendaItems`, `activeVote`
  - all existing UI handlers through `ProtocolUiHandlers`
  - embed/standalone variant context from panel

Explicit non-goals for this contract freeze:

- Do not alter `MeetingsTab` video overlay state machine.
- Do not alter WebSocket event semantics.

## UX contract & rollout docs

- Canvas UX rules: `CANVAS_UX_CONTRACT.md`
- Parity matrix: `PARITY_MATRIX.md`
- QA checklist: `CANVAS_QA_CHECKLIST.md`
- Rollout checklist: `CANVAS_ROLLOUT_CHECKLIST.md`

## Parallel Workstream Ownership Boundaries

- W1 owns adapter logic and type-safe transformations.
- W4-W10 each own one block renderer file.
- W11 owns `BlockCanvas` shell and list orchestration.
- W12-W15 own insertion and inline affordances.
- W16 is the only integration workstream touching `MeetingMinutesPanel` wiring.
- W20/W25 own embed-overlay regression checks; they do not modify overlay mechanics.

## Compatibility Requirements (Must Hold)

- Paragraph section presets and markdown behavior preserved.
- To-do lifecycle (including post-finalize owner/mod status update) preserved.
- Minutes finalize/unfinalize document transitions preserved.
- Export (`/api/export/documents/:id`) preserved.
- Reorder mode and follow-live preserved.
- Embed overlay and compact action card preserved.

## W20/W25 Embed-Overlay Regression Safeguards

Source of truth checklist:

- `client/src/components/OrganizationManagement/blocks/README_EMBED_REGRESSION.md`

Guardrail requirements:

- W20/W25 must validate embed overlay compatibility whenever `MeetingMinutesPanel` or block-canvas files are touched.
- Safeguards must include both manual verification and at least one automated assertion run.
- Do not "fix" regressions by changing `MeetingsTab` overlay mechanics in this stream; escalate if broken.

Minimum regression checklist coverage (required):

- Pin and unpin behavior still opens/closes the embedded minutes panel without desync.
- Hover delay still gates overlay reveal and avoids accidental open/close thrash.
- Compact action card still renders, aligns, and stays actionable in embed mode.
- Sticky header remains visible and non-overlapping while scrolling.
- Bottom action bar remains visible, interactive, and non-obstructive.
- Narrow-width behavior (mobile/small split panes) keeps actions reachable and readable.

Validation command guidance (run what applies to changed files):

- `npm --prefix client run build`
- `npx tsc --noEmit -p client/tsconfig.json`
- `npx jest client/src/components/OrganizationManagement/blocks/__tests__/protocolBlocks.test.ts`

## Enterprise pilot rollout

See `CANVAS_ROLLOUT_CHECKLIST.md`. Validate agenda navigation, reorder mode, brainstorm persistence, audit lines, follow-live announcements, and embed overlay when shipping minutes changes.

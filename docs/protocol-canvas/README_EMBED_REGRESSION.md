# Embed Overlay Regression Checklist (W20/W25)

This checklist protects embed-overlay compatibility while the block canvas evolves.

## Purpose

- Catch regressions between block-canvas rendering and existing embed overlay behavior.
- Keep overlay UX stable without modifying runtime overlay mechanics.
- Provide a repeatable "pre-merge" validation path for W20/W25 changes.

## Scope

Run this checklist when changing any of:

- `client/src/components/OrganizationManagement/MeetingMinutesPanel.tsx`
- `client/src/components/OrganizationManagement/blocks/BlockCanvas.tsx`
- `client/src/components/OrganizationManagement/blocks/BlockRenderer.tsx`
- `client/src/components/OrganizationManagement/blocks/BlockInserter.tsx`
- `client/src/components/OrganizationManagement/blocks/protocolCanvasAnalytics.ts`
- `client/src/components/OrganizationManagement/blocks/protocolBlocks.ts`
- `client/src/components/OrganizationManagement/blocks/protocolBlocks.types.ts`

## Manual Regression Checklist (Required)

Test in both standalone-width and embed/narrow-width layouts.

### 1) Pin / Unpin

- Open minutes panel in embedded mode and pin it.
- Confirm content remains interactive while pinned.
- Unpin and verify panel returns to non-pinned behavior without state desync.

### 2) Hover Delay

- Trigger overlay via hover interactions.
- Confirm the delay prevents accidental flicker/open-close thrash.
- Move pointer in/out quickly and verify no stuck-open or stuck-closed state.

### 3) Compact Action Card

- Confirm compact action card appears in embed mode.
- Validate main actions remain clickable and keyboard reachable.
- Check card position does not overlap critical content or controls.

### 4) Sticky Header

- Scroll long minutes content with overlay active.
- Confirm sticky header remains visible and anchored.
- Verify header does not overlap the compact action card unexpectedly.

### 5) Bottom Action Bar

- Confirm bottom action bar is rendered in embed mode.
- Verify actions are visible, clickable, and not clipped.
- Validate bar does not hide required content at common viewport sizes.

### 6) Narrow Width Behavior

- Resize to narrow pane/mobile-like width.
- Verify action controls remain reachable and labels/icons remain legible.
- Confirm no critical controls move off-screen.

## Automated Guardrails (Required)

Run at least one automated check for every touched PR, and prefer running all listed commands before merge.

### Suggested commands

From repository root:

- `npm --prefix client run build`
- `npx tsc --noEmit -p client/tsconfig.json`
- `npx jest client/src/components/OrganizationManagement/blocks/__tests__/protocolBlocks.test.ts`

If a command is too expensive locally, run at minimum `npx tsc --noEmit -p client/tsconfig.json` and one relevant test command in CI.

## Pass / Fail Criteria

- **Pass**: all required manual checks succeed and at least one automated check passes.
- **Fail**: any pin/unpin, hover delay, compact card, sticky header, bottom bar, or narrow-width regression is observed.

## Escalation Rule

If the checklist fails because overlay mechanics changed unexpectedly:

- Do not patch around the issue in W20/W25 docs-only/regression streams.
- Open a follow-up fix task in the owning integration stream for overlay mechanics.

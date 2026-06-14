# Canvas QA checklist (a11y + responsive)

Run before releases touching `MeetingMinutesPanel`, `BlockCanvas`, or block renderers.

## Keyboard

- [ ] Tab through agenda chips, topic headers, insert controls, and block CTAs without traps.
- [ ] Slash menu detailed insert: Arrow keys move selection; Enter activates (when focused).
- [ ] Vote close confirmation: focus moves to dialog; Escape and Cancel work.

## Screen reader (spot)

- [ ] New minutes entry when follow-live is on announces via polite live region (no duplicate announcements).
- [ ] Block type + status readable from card heading + badge.

## Responsive / embed

- [ ] Narrow split (~320–400px): insert row wraps; no horizontal scroll on minutes column.
- [ ] Embed overlay: pin/unpin does not desync minutes scroll (`README_EMBED_REGRESSION.md`).

## Commands

```bash
npx tsc --noEmit -p client/tsconfig.json
npx jest client/src/components/OrganizationManagement/blocks/__tests__/
```

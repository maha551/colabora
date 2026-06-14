# Canvas-only rollout checklist

The meeting minutes UI uses the protocol block canvas only (`BlockCanvas` + `buildProtocolBlocks`). Legacy timeline/`MinutesBlock` has been removed.

## Pilot org

- [ ] Smoke-test live meeting: brainstorm → vote → decision → to-do.
- [ ] Moderator: finalize / unfinalize still behaves as before.
- [ ] Export minutes still works (`/api/export/documents/:id`).
- [ ] Embed meeting view: run `README_EMBED_REGRESSION.md` checklist.

## Analytics (optional)

Apps may listen for `protocolCanvasAnalytics` `CustomEvent` on `window` (see `protocolCanvasAnalytics.ts`) for primary actions.

## Monitoring

- Watch error logs for minutes API failures after UX changes.
- Collect moderator feedback on insert menu vs bottom action bar duplication (iterate if noisy).

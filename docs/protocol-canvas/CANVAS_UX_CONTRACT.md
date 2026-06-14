# Canvas UX Contract

Single UX standard for [MeetingMinutesPanel.tsx](../MeetingMinutesPanel.tsx) when rendering protocol blocks via [BlockCanvas.tsx](BlockCanvas.tsx).

## Block shell (owned by [BlockRenderer.tsx](BlockRenderer.tsx))

- **Header**: Block type label (`h3`) + status `Badge` (secondary).
- **Body**: Renderer-specific content in a shared `min-w-0` column; no duplicate block-type headings inside renderers unless semantically required (e.g. paragraph title).
- **Links**: [BlockLinkChip.tsx](BlockLinkChip.tsx) after body.
- **Next action**: [InlineNextActionHint.tsx](InlineNextActionHint.tsx) when `nextAction` is set.
- **Footer**: Recorded time; optional author (paragraph/decision); vote opened/closed times for vote blocks.

## Status language

- Use i18n keys under `protocolCanvas.status.*` with human-readable defaults.
- Renderer-specific micro-status (e.g. poll finalized) complements the shell badge, not duplicate “Open/Closed” where the shell already applies.

## Actions

- **Primary**: At most one dominant CTA per block (e.g. Cast vote, Close vote).
- **Secondary**: Outline or ghost; destructive actions use `destructive` variant with confirmation when irreversible.
- **Permissions**: Moderator-only controls disabled or hidden for participants; respect `minutesFinalizedAt`.

## Accessibility

- Interactive controls keyboard-focusable; `aria-label` on landmark sections.
- Embed/narrow widths: actions wrap with `flex-wrap`; no horizontal overflow.

## Analytics

- Fire `protocolCanvas` custom events via [protocolCanvasAnalytics.ts](protocolCanvasAnalytics.ts) for primary CTAs (optional listeners in host app).

# WP3 Paragraph Creation — Handover

## Summary

Paragraph creation is implemented end-to-end: document creation creates an initial title paragraph (order_index 1) plus TITLE proposal in the same transaction; user paragraph creation (POST) is atomic (paragraph + proposal(s) + document timestamp) with cutoff/status checks before any write; WebSocket broadcasts paragraph-created and proposal updates; frontend uses `paragraphsApi.createParagraph` and handles `paragraph-created` in `useWebSocketUpdates`.

## Key files

### Backend
- **Document creation + title paragraph:** `server/routes/documents.js`
  - `createInitialParagraph(db, documentId, title, description, userId)` — inserts one paragraph (order_index 1) and one TITLE proposal. Called only with transaction `trx` from `createDocument`; on throw, whole document creation rolls back.
  - `createDocument` uses `withTransaction`; inside it: document insert, `createInitialParagraph(trx, ...)`, `addCollaborators(trx, ...)`.
- **User paragraph creation:** `server/routes/paragraphs.js`
  - `POST /` — auth, document access, `checkNoActiveStructureProposals`, `paragraphValidation.create`. Then: load document (cutoff/status checks), then `executeInTransaction`: `calculateAndValidateOrderIndex`, INSERT paragraph, INSERT proposal(s), UPDATE documents.updated_at. After commit: broadcast each proposal, then `broadcastDocumentUpdate(documentId, 'paragraph-created', { paragraphId, paragraph })`, then 201 response. Optional fire-and-forget `normalizeParagraphOrder`.
- **Paragraph update:** `server/routes/paragraphs.js` — `PUT /:paragraphId` with transaction and validation.

### Frontend
- **API:** `client/src/lib/api/paragraphs.ts` — `createParagraph(documentId, { text?, title?, order?, asSuggestion?, headingLevel? })`. `order` is optional (backend computes if omitted).
- **Add paragraph action:** `client/src/hooks/useDocumentActions.ts` — `handleAddElement('paragraph', options)` builds body (order from options or max+1), calls `paragraphsApi.createParagraph`, then `reloadDocument()`, toast on success; on error logs, shows toast, re-throws.
- **Editor trigger:** `client/src/components/DocumentEditor.tsx` — calls `onAddElement("paragraph", { text, title?, headingLevel?, order })`.
- **WebSocket:** `client/src/hooks/useWebSocketUpdates.ts` — `paragraph-created`: add paragraph to state (skip if already exists), sort by order. If a proposal event arrives before paragraph exists, code reloads document to stay consistent.

## Test commands

- Paragraph integration tests (Package 3 fixes: 3.1–3.5, order, cutoff, concurrent):
  ```bash
  npm test -- --testPathPattern="paragraphs.integration" --runInBand --forceExit
  ```
- Document integration tests (includes WP3 test: document creation creates title paragraph + TITLE proposal):
  ```bash
  npm test -- --testPathPattern="documents.integration" --runInBand --forceExit
  ```
- Both:
  ```bash
  npm test -- --testPathPattern="paragraphs.integration|documents.integration" --runInBand --forceExit
  ```

## WP3 changes made

- **Tests:** Added in `tests/integration/documents.integration.test.js`: "WP3: document creation creates exactly one title paragraph with TITLE proposal" (create doc, GET doc, assert one paragraph with order_index/order 1 and at least one TITLE proposal with document title).
- **Frontend:** `client/src/lib/api/paragraphs.ts` — `order` in `createParagraph` data is now optional to match backend. `client/src/hooks/useDocumentActions.ts` — on create failure: log error, show toast with message, then re-throw so callers still get the error.

## Verification checklist

- [ ] Run paragraphs and documents integration tests locally (see commands above).
- [ ] Manual: Create document → confirm one title paragraph with proposal; add paragraph from editor → confirm new paragraph and proposal appear; open same doc in second tab → add paragraph in first tab → confirm second tab shows new paragraph (WebSocket) or after reload.

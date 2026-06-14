# SPLIT Structure Operation — Deferred Implementation

**Status:** Deferred  
**Last updated:** 2026-06-09  
**Estimated effort when prioritized:** 4–6 engineering days

---

## Summary

The **SPLIT** structure operation allows dividing a single paragraph into two or more paragraphs at specified positions. Database schema, TypeScript types, and API ordering already recognize `SPLIT`, but the feature is **explicitly rejected** at validation/application layers and has **no frontend UI** in `StructureProposalMode.tsx`.

This document records rejection points, existing support, the frontend gap, and prerequisites before implementation.

---

## Backend rejection points

### 1. Route validation — `server/routes/structure-proposals.js`

On proposal **creation**, allowed operation types exclude `SPLIT`:

```214:216:server/routes/structure-proposals.js
        if (!operationType || !['MOVE', 'MERGE', 'DELETE', 'RENAME_HEADING', 'CHANGE_HEADING_LEVEL', 'INSERT_NEW'].includes(operationType)) {
          return next(ApiError.validation(`Invalid operation type: ${operationType}. SPLIT operation is not yet implemented.`, null, 'INVALID_OPERATION_TYPE'));
        }
```

Integration tests assert SPLIT proposals return **400** (`tests/integration/structure-proposals.test.js` — “should reject SPLIT operation”).

### 2. Express body validation — `server/middleware/validation.js`

Structure proposal POST validator whitelists operation types without `SPLIT`:

```1595:1597:server/middleware/validation.js
    body('operations.*.operation_type')
      .isIn(['MOVE', 'MERGE', 'DELETE', 'RENAME_HEADING', 'CHANGE_HEADING_LEVEL', 'INSERT_NEW'])
      .withMessage('Invalid operation type. SPLIT is not yet implemented.'),
```

### 3. Application handler — `server/routes/structure-proposals.js`

When a proposal is **approved and applied**, the `SPLIT` case throws:

```1786:1796:server/routes/structure-proposals.js
    case 'SPLIT':
      // LIMITATION: SPLIT operation is not yet implemented
      // ...
      throw new Error('SPLIT operation is not yet implemented. This feature is planned for a future release.');
```

Note: SQL ordering in the same file assigns `SPLIT` sort priority (`WHEN 'SPLIT' THEN 3`), indicating partial planning for apply-order semantics.

---

## Schema and types already support SPLIT

| Layer | Support |
|-------|---------|
| **PostgreSQL** | `structure_operations.operation_type` CHECK constraint includes `'SPLIT'` (`knex/migrations/001_initial_schema.js`) |
| **TypeScript** | `StructureOperationType` union includes `'SPLIT'` (`client/src/types/index.ts`) |
| **StructureOperation** | Generic `operation_data` / field bag can hold split metadata once schema is defined |

No migration is required to *recognize* the enum value; implementation work is validation, apply logic, and UI.

---

## Frontend gap — `StructureProposalMode.tsx`

Current UI supports **MOVE** (drag reorder), **MERGE** (multi-select merge targets), and **DELETE** (checkbox delete candidates). `generateOperations()` only emits those three types.

There is no interaction to:

- Select a paragraph to split
- Choose split position(s) within text or at heading boundaries
- Preview resulting paragraphs before submit

Users cannot propose SPLIT even if backend allowed it.

---

## Prerequisite UX decision

Before engineering SPLIT, product/design should decide:

1. **Split interaction model**
   - Inline cursor split in paragraph text vs. structural “split after this heading” vs. both
2. **Heading handling**
   - When splitting a heading paragraph, do both parts inherit heading levels or does the second become body text?
3. **Order index strategy**
   - How `order_index` values are assigned for N new paragraphs and downstream MOVE conflicts
4. **Merge symmetry**
   - Whether SPLIT should be reversible only via new proposals or offer undo in draft mode
5. **Minimum content rules**
   - Minimum characters per resulting paragraph; empty-segment rejection

These choices affect `operation_data` schema, validation rules, diff/history display, and voting copy.

---

## Suggested implementation outline (when prioritized)

| Phase | Scope | Estimate |
|-------|--------|----------|
| **1. Spec + operation_data** | Finalize UX; document JSON shape for split positions and new paragraph definitions | 0.5–1 day |
| **2. Backend** | Add SPLIT to validators; implement apply handler (paragraph insert, order shift, history) | 1.5–2 days |
| **3. Frontend** | Split UI in `StructureProposalMode`; operation preview; i18n | 1.5–2 days |
| **4. Tests + docs** | Integration tests, activity feed labels, update `STRUCTURE_PROPOSALS.md` | 0.5–1 day |

**Total:** ~4–6 days depending on UX complexity and edge-case handling (nested headings, agreed vs. draft paragraphs).

---

## Related files

- `server/routes/structure-proposals.js` — create validation, apply switch
- `server/middleware/validation.js` — POST body whitelist
- `client/src/components/StructureProposalMode.tsx` — structure proposal UI
- `client/src/types/index.ts` — `StructureOperationType`, `StructureOperation`
- `tests/integration/structure-proposals.test.js` — SPLIT rejection test
- `docs/active/STRUCTURE_PROPOSALS.md` — current structure proposal behavior (if present)

---

## Decision log

| Date | Decision |
|------|----------|
| 2026-06-09 | Defer SPLIT implementation; document gaps for future prioritization |

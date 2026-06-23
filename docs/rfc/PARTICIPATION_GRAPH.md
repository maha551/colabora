# Participation Graph RFC

> Status: Phase 0 — authoritative spec for migrations 019–026  
> Related: [ADR 001](../adr/001-participation-graph-multigraph.md), [Agent orchestration](./AGENT_ORCHESTRATION.md)

## Summary

Add **Participation Graph**: nested organizations (classical hierarchy default), optional matrix links, cross-cutting networks, document ratification pipelines, vote delegation, and a Phase 9 visual editor. Flat admin-provisioned orgs remain the baseline when `participationGraphEnabled` is false.

## Layers

1. **Structure** — `primary_parent_id` tree  
2. **Participation** — `organization_relationships` (matrix, affiliate, ratifies_to)  
3. **Flows** — document lineage, auto-submit on agree  
4. **Delegation** — `vote_delegations` (LiquidFeedback precedence)

## Data model (incremental)

### organizations (019+)

- `primary_parent_id`, `org_kind` (`standard`|`network`|`initiative`)
- `participation_profile`, `subgroup_visibility` (`open`|`closed`|`secret`)
- `created_by_user_id`, `tree_depth`, `tree_path`, `participation_graph_root_id`
- `graph_layout_json` (026, root only)

### organization_relationships (019+)

- `source_org_id`, `target_org_id`, `relationship_type`, `config_json`, `status`, `created_by_vote_id`
- Types: `primary_parent`, `matrix_link`, `affiliate`, `ratifies_to`, `participates_in`
- Phase 4: `membership_subject` (`user`|`organization`)

### organization_participations (021)

- `participation_kind`: `member`, `representative`, `lead_link`, `rep_link`, `liaison`, `observer`

### document_lineage (022)

- Cross-org ratification provenance; statuses: `pending_ratification`, `ratified`, `rejected`, `superseded`, `withdrawn`

### vote_delegations (025)

- Modes: `global`, `domain`, `proxy`; precedence: single-issue > domain > global; direct vote overrides

## Authorization

**Default:** membership/rep in org X grants access to X only — no tree inheritance.

**Break-glass:** parent rep admin on child when `config_json.admin.parentRepsCanAdminister === true`.

Central resolver: `ParticipationGraphService.resolveAccess(userId, orgId, action)`.

## Org vote types (new)

- `subgroup_creation` (Phase 2)
- `document_submission` (Phase 5)
- `relationship_change` (Phase 9)

## Governance rules (new columns)

See [GOVERNANCE_RULES_INVENTORY](../active/GOVERNANCE_RULES_INVENTORY.md) — added incrementally Phases 2–8.

## Threat model

1. Cross-org document leak → direct membership + isolation tests  
2. Secret subgroup enumeration → omit from listings / 404  
3. Delegation concentration → caps + UI transparency  
4. Forged ratification → lineage permissions on submit  
5. Tampered vote metadata → JSON schema validation  
6. Break-glass overreach → governance toggle + audit  

## Phases

| Phase | Deliverable |
|-------|-------------|
| 0 | This RFC + contracts |
| 1 | Tree schema, read APIs, breadcrumb |
| 2 | Vote-gated subgroups, visibility |
| 3 | Meeting → org vote |
| 4 | Federation, delegates |
| 5 | Document lineage |
| 6 | Networks |
| 7 | Matrix + context switcher |
| 8 | Delegation |
| 9 | Graph editor + `@xyflow/react` |

## Dependencies

- **Phase 9 only:** `@xyflow/react`  
- No Playwright; API workflow tests in `tests/e2e/`

## API contracts

Per-phase: [`docs/rfc/contracts/phase-N.json`](./contracts/)

## Non-goals v1

- Consent-based (sociocracy) voting — structure only via double-links  
- User-created root orgs — subgroups only  
- Decidim integration  
- Browser E2E automation  

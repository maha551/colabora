# ADR 001: Participation Graph — Adjacency List Multigraph

## Status

Accepted (Phase 0)

## Context

Colabora needs nested organizations, optional matrix/network links, document ratification flows, and vote delegation. Options considered:

1. **Nested set / closure table** — fast reads, painful writes on reparent
2. **PostgreSQL `ltree`** — fast path queries, extension dependency, painful moves
3. **Adjacency list + materialized `tree_path`** — simple writes, recursive CTE or path prefix for reads
4. **Separate graph DB** — operational complexity

Human org trees rarely exceed ~5 levels. Write frequency (create subgroup, reparent via vote) matters as much as read frequency.

## Decision

Use **adjacency list** (`organizations.primary_parent_id`) plus a separate **`organization_relationships`** table for non-tree edges (matrix, affiliate, ratifies_to). Maintain denormalized `tree_path` and `tree_depth` on write.

Relationship behavior is configured via **`config_json`** on edges, seeded from named **profiles** (presets).

## Consequences

- Migrations 019–026 incrementally add columns/tables
- `ParticipationGraphService` centralizes tree math and access resolution
- Phase 9 adds `@xyflow/react` for visualization only; DB remains source of truth
- Direct membership grants access to an org only (no inheritance by default)

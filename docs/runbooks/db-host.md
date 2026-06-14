# Database Host Decision (Phase 0)

## Decision

Use **Fly Postgres** as the default production PostgreSQL host for this repository.

## Rationale

- Existing deployment and troubleshooting docs are Fly-focused (`fly deploy`, `fly postgres attach`, Fly secrets, Fly DB diagnostics).
- Fly Postgres keeps app and database within the same platform/network model, reducing operational complexity for the current deployment path.
- This Phase 0 scaffold introduces local/dev PostgreSQL and Knex migration structure without changing runtime database behavior.

## Scope and Constraints

- This is a documentation and scaffolding decision only.
- Runtime DB selection/connection code remains unchanged in Phase 0.
- Alternate production Postgres hosts can still be supported later by supplying a compatible `DATABASE_URL`.

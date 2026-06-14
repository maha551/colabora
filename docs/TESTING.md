# Testing Guide

## Prerequisites

Integration and unit tests require PostgreSQL. The test harness uses per-worker schemas inside a dedicated `colabora_test` database (see `tests/setup.js` and `tests/utils/db-cleanup.js`).

## Quick start (local)

```bash
# 1. Start PostgreSQL (Docker)
npm run db:up

# 2. Create colabora_test + run migrations
npm run test:db:setup

# 3. Run tests
npm run test:integration
npm run test:unit
```

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `TEST_DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:5432/colabora_test` | Test database connection |
| `TEST_DB_SCHEMA` | `test_w{JEST_WORKER_ID}` | Per-worker schema isolation |
| `JWT_SECRET` | set in `tests/setup.js` | Auth for test server |
| `SKIP_RUNTIME_MIGRATIONS` | `1` in tests | Use knex migrations only |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run db:up` | Start Postgres via docker compose |
| `npm run db:down` | Stop docker compose services |
| `npm run test:db:setup` | Create `colabora_test` and run migrations |
| `npm run test:integration` | Integration test suite (auto-runs `pretest:integration`) |
| `npm run test:unit` | Unit test suite (requires test DB) |

## CI

GitHub Actions uses an ephemeral Postgres service (`colabora_ci`) with `DATABASE_URL` set in the workflow. Local bootstrap mirrors that setup with `colabora_test`.

## Troubleshooting

**`database "colabora_test" does not exist`**

Run `npm run test:db:setup` after `npm run db:up`.

**`too many clients`**

Jest uses `maxWorkers: 2` and small pool sizes. Avoid running multiple test processes against the same DB simultaneously.

**Connection refused**

Ensure Docker is running and port 5432 is available: `docker compose ps`.

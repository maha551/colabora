---
description: 
alwaysApply: true
---

# PONYTAIL.md

## Cursor Cloud specific instructions

Colabora is a Node.js/Express + React (Vite) app backed by PostgreSQL with Socket.io
for realtime. Standard commands live in `package.json` (`npm run dev`, `npm start`,
`npm run build`, `npm test`) and in `.github/workflows/ci-cd.yml`. Notes below are the
non-obvious gotchas for running and testing in this environment.

### Database
- Local Postgres runs via Docker: `npm run db:up` (see `docker-compose.yml`), then
  `npm run db:migrate` applies Knex migrations to the `DATABASE_URL` (public schema).
- Tests use a separate DB. Set `TEST_DATABASE_URL` (locally
  `postgresql://postgres:postgres@127.0.0.1:5432/colabora_test`). Each Jest worker
  migrates its own isolated schema (`test_wN`) via `migrate.latest()` — so a new
  migration is picked up automatically by the test harness (no manual step), but the
  baseline snapshot in `tests/migrations/__snapshots__/baseline.test.js.snap` must be
  regenerated with `npx jest tests/migrations/baseline.test.js -u` whenever the schema
  changes, or that test fails.

### Running tests
- `npm test` runs the full suite without coverage; `npm run test:ci` adds
  `--coverage --ci` and enforces the coverage gate (this is the CI `test` job).
- Always export `PG_POOL_MAX=5` (matches CI). Higher values × parallel Jest workers can
  exhaust Postgres `max_connections` and surface as flaky `503`/"too many clients".
- The coverage thresholds in `jest.config.js` are an enforced *floor* aligned with the
  current fully-passing suite (~51% stmts / ~38% branches / ~53% lines / ~54% funcs),
  not aspirational targets. Reaching the old 60% would require thousands more covered
  branches. Ratchet the floor upward as coverage is added; do not lower it.
- `tests/websocket/websocket-events.test.js` is intentionally `describe.skip`-ed: the
  test server starts unbound (no listening socket), so `socket.io-client` cannot connect
  and would hang/contaminate other suites. Don't "unskip" without giving the harness a
  real listening port first.

### Scheduler in tests
- `DocumentScheduler.start()` registers interval jobs and an *immediate* 5s burst that
  fires ~12 DB-heavy jobs at once. That burst is intentionally skipped under
  `NODE_ENV=test` (see `server/modules/scheduler.js`): every integration suite boots its
  own server, and the concurrent burst exhausts the small test connection pool, producing
  cascading `503`s (most visibly in `documents`/`governance` suites) under coverage on CI.
  The interval jobs and `isRunning` are still set, so the scheduler is "running" for tests.

### CI / deployment
- `.github/workflows/ci-cd.yml` is the authoritative pipeline. The `Build & Validation`
  job runs `node scripts/security-test.js --local`, which requires the GitHub Actions
  repository secret **`JWT_SECRET`** (≥32 chars). Without it, build/security/deploy jobs
  fail even when all tests pass.
- **Pipeline layout:** `changes` (path detection) → `code-quality` → parallel `test`
  (full `test:ci` with coverage) + `client-unit` → `build-validation`. Docker, health,
  and deployment-readiness jobs run on every `main` push and on PRs that touch deploy-
  relevant paths (`Dockerfile`, `server/`, `knex/`, deploy config, etc.); otherwise they
  are skipped. Superseded runs on the same branch/PR are canceled via workflow concurrency.
- **Branch protection (GitHub Settings → Branches):** Required status checks should
  include the always-run jobs: `Code Quality & Dependencies`, `Test (unit + integration)`,
  `Client unit tests`, `Build & Validation`. Do **not** require `Migration + Test
  (ephemeral PG)` — that job was removed as redundant. Skipped deploy-heavy jobs
  (`Docker Build Validation`, `Health Check Validation`, `Deployment Readiness`) must
  **not** be required checks, or client-only PRs cannot merge. `main` pushes still run
  the full deploy-heavy chain before Hetzner Deploy.

### Integration test pitfalls
- **DB pool alignment:** Rows inserted or updated via `getTestKnex()` alone may not be
  visible to API routes that use `app.locals.db` (a separate pool). After
  `startApplication` / `startTestServer`, seed users, fixtures, and direct SQL
  updates with `getServerDb(server)` from `tests/utils/test-helpers.js`, then log in
  through the API. Use `clearStructureProposalTables(getServerDb(server))` when
  integration tests share a document across examples.
- **Organizational `voteChangeAllowed`:** New org documents default `vote_change_allowed`
  from governance rules (usually `false`). Tests that need vote changes or deadline
  deferral must pass `options: { voteChangeAllowed: true }` on document create (or set
  org governance explicitly)—do not rely on raw Knex updates alone.
- **Profile `representatives` visibility:** Only active organization representatives may
  view fields marked `representatives`; co-org members who are not reps must not see them.
  Filtering honors `?organizationId=` on `GET /api/auth/users/:id` (the member profile page
  passes this). Without org context, a viewer who is a rep in *any* shared org may still
  see representatives-only fields.

### Email / external services
- `RESEND_API_KEY` is optional outside production. Email sends (contact form, invites)
  are best-effort in non-prod and log instead of throwing, so missing keys don't 500.

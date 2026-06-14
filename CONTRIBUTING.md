# Contributing to Colabora

Thank you for your interest in contributing!

## Development setup

1. Fork and clone the repository.
2. Copy `env.example` to `.env` and set `DATABASE_URL` and `JWT_SECRET`.
3. Start PostgreSQL: `npm run db:up`
4. Install dependencies: `npm install` and `npm run install:frontend`
5. Run migrations: `npm run db:migrate`
6. Start dev servers: `npm run dev` and `npm run dev:frontend` (separate terminals)

See [AGENTS.md](AGENTS.md) for test database notes and CI pitfalls.

## Running tests

```bash
export PG_POOL_MAX=5
export TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/colabora_test
npm test
```

CI runs `npm run test:ci` and `npm run test:client-unit`.

## Pull requests

1. Create a feature branch from `main`.
2. Keep changes focused; match existing code style.
3. Add or update tests for behavior changes.
4. Ensure tests pass locally.
5. Open a PR with a clear description and test plan.

## Code style

- Server: Node.js / Express conventions in `server/`
- Client: React + TypeScript, design tokens in `client/src/lib/designSystem.ts`
- Do not commit secrets, `.env`, or `.kamal/secrets`

## Questions

Open a GitHub Discussion or issue for non-security questions.

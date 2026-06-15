# Participation Graph — Agent Orchestration

Phases merge **sequentially** (0 → 9). Within each phase, **`be` ∥ `fe` ∥ `qa` → `int`**.

## Roles

| ID | Role | Owns |
|----|------|------|
| `orch` | Orchestrator | Branches, PRs, CI triage |
| `arch` | Architect | RFC, `docs/rfc/contracts/phase-N.json` |
| `be` | Backend | `knex/`, `server/` |
| `fe` | Frontend | `client/` |
| `qa` | QA / Security | `tests/integration/participation-graph*`, `tests/e2e/participation-graph*` |
| `int` | Integrator | Merge tracks, fix drift, run full CI |

## Branch pattern

```
feature/participation-graph-phase-N-be
feature/participation-graph-phase-N-fe
feature/participation-graph-phase-N-qa
  → merge to feature/participation-graph-phase-N → PR to main
```

Integration branch: `feature/participation-graph`.

## Contract gate

Before parallel work, merge `docs/rfc/contracts/phase-N.json`. Frontend and QA may mock APIs until backend lands.

## Merge order

`be` → `fe` → `qa` → run `PG_POOL_MAX=5 npm run test:ci` + `npm run test:client-unit`.

## Task brief template

```markdown
## Agent: [be|fe|qa|int|arch|orch]
## Phase: N
## Read: docs/rfc/PARTICIPATION_GRAPH.md, docs/rfc/contracts/phase-N.json, AGENTS.md
## Scope: [paths]
## Verify: PG_POOL_MAX=5 npx jest [suites]
```

See [PARTICIPATION_GRAPH.md](./PARTICIPATION_GRAPH.md) for architecture and phase details.

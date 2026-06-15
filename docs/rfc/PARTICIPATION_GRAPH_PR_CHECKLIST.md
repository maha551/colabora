# Participation Graph — PR Checklist

Copy into every phase PR description.

## PR checklist

- [ ] Rebases cleanly on `main` / integration branch
- [ ] `PG_POOL_MAX=5 npm run test:ci` passes locally
- [ ] `npm run test:client-unit` passes (if client changed)
- [ ] New migration: `npx jest tests/migrations/baseline.test.js -u` snapshot updated
- [ ] Integration tests use `getServerDb(server)` for fixtures visible to API routes
- [ ] No coverage floor regression (`jest.config.js`)
- [ ] `docs/rfc/PARTICIPATION_GRAPH.md` or phase contract updated if behavior changed
- [ ] English i18n keys added (`client/public/locales/en/organization.json`) when UI changes
- [ ] `tests/integration/participation-graph-security.integration.test.js` extended for this phase
- [ ] E2E workflow updated if phase adds cross-cutting journey (Phases 3, 4, 5, 9)
- [ ] `node scripts/security-test.js --local` passes (requires `JWT_SECRET` in env)

## Phase reference

| PR | Phase | Migration |
|----|-------|-----------|
| #1 | 0 | — (docs) |
| #2 | 1 | 019 |
| #3 | 2 | 020 |
| #4 | 3 | 020b |
| #5 | 4 | 021 |
| #6 | 5 | 022 |
| #7 | 6 | 023 |
| #8 | 7 | 024 |
| #9 | 8 | 025 |
| #10 | 8b | — (optional) |
| #11 | 9 | 026 |

# Response Caching

Optional response cache for hot read endpoints. When `REDIS_URL` is set, the cache is Redis-backed (shared across instances). When not set, an in-memory cache is used (single instance only).

## Cached endpoints

| Endpoint | Cache key | TTL | Invalidated when |
|----------|------------|-----|-------------------|
| `GET /api/organizations` (default params only: limit=20, offset=0, includeGovernanceRules=false) | `orgs:user:${userId}` | 90s | User accepts/declines invitation, user added/removed as member, user added/resigns as representative |
| `GET /api/governance/:organizationId/governance-rules` | `gov_rules:${organizationId}` | 60s | Governance rules updated (PUT), rule proposal approved (complete-vote) |

## Key shape and TTLs

- Prefix: `colabora:cache:`
- Org list: `orgs:user:${userId}`, 90 seconds
- Governance rules: `gov_rules:${organizationId}`, 60 seconds

## Invalidation

- **Org list:** Invalidated in routes when membership or representative status changes (invitations accept, members add/remove, representatives add/resign, auth registration with invitation).
- **Governance rules:** Invalidated in PUT governance-rules and in rule-proposals complete (when a proposal is approved).

## Configuration

- **Redis:** Set `REDIS_URL` for shared cache across app instances. If not set, the cache uses an in-memory store (per process).
- No separate env vars for TTLs; they are defined in `server/utils/responseCache.js` (`TTL.ORG_LIST_MS`, `TTL.GOV_RULES_MS`).

## Module

- **Implementation:** `server/utils/responseCache.js` — `createResponseCache(redisClient)` returns `{ get, set, del }`.
- **Registration:** The cache is created in `server/modules/server.js` and attached as `app.locals.responseCache`.

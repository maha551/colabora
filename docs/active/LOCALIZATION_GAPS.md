# Localization Gaps – Strings Not Yet Localized

**Last updated:** 2026-06-10

Governance UI i18n is **complete for DE and ES** (100% key parity, all governance dialog/surface components wired).

---

## Completed (governance pass)

| Area | Status |
|------|--------|
| Governance dialogs (bootstrap, elections, nominations, rules config, rule proposal) | ✅ Wired + DE/ES |
| `GovernanceRulesVotingInterface` (full panel) | ✅ Wired + DE/ES |
| `ProposalDetailsDialog`, `RuleHistoryView`, `EnhancedDiffView` | ✅ Wired + DE/ES |
| `RepresentativeRejectDialog`, `CompleteVoteButton`, `RuleMetadataDisplay` | ✅ Wired + DE/ES |
| `ruleLabels.*` via `useRuleLabels()` hook | ✅ DE/ES |
| Bootstrap/recovery banners, proposal status badges | ✅ |
| `DocumentTreeProposalDialog`, `OrganizationBrandingDialog` | ✅ (prior pass) |

---

## Out of scope / lower priority

| Area | Notes |
|------|--------|
| `PublicGovernanceDashboard.tsx` | Public transparency page; not part of governance dialog pass |
| `getVoteStatusLabel()` / `formatVoteValue()` in `lib/voting.ts` | Utility fallbacks; UI components use `t()` where shown |
| Server emails (`server/modules/emailService.js`) | Backend; not client i18n |
| Logger / dev-only strings | Intentionally English |

---

## Conventions

- Add keys to `client/public/locales/en/*.json` first, then run `node scripts/merge-governance-dialog-i18n.js` and `node scripts/sync-i18n-keys.js all`.
- German copy uses **Du** register (see `docs/TRANSLATION_STATUS.md`).
- Run `npm run i18n:check-de` before merging i18n changes.
- Verify parity: `node scripts/diff-i18n-keys.js de` and `node scripts/diff-i18n-keys.js es`.

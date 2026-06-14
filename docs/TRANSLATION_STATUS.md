# Translation Status – Colabora UI

**Source language:** English (`en`)  
**Fallback:** `fallbackLng: 'en'` in `client/src/i18n.ts` – missing keys show in English.

---

## 1. Namespaces (files per locale)

| Namespace   | File            | Purpose |
|------------|------------------|--------|
| `common`   | common.json      | Buttons, toasts, confirmations, validation, profile, collaborator |
| `nav`      | nav.json        | Header/footer, menu, language names |
| `auth`     | auth.json       | Login, password, forgot password |
| `documents`| documents.json  | Document dashboard, editor, view tabs, suggestions, structure |
| `organization` | organization.json | Org dashboard, management, transparency |
| `governance`   | governance.json | Rules, elections, proposals, voting |
| `activity`     | activity.json  | Activity feed, empty states |
| `errors`       | errors.json    | Error pages/messages |
| `admin`        | admin.json     | Admin dashboard, create org, reports |
| `onboarding`   | onboarding.json | Welcome tour, diff hints, first-use guidance |

**Total: 10 namespaces** (registered in `client/src/i18n.ts`).

---

## 2. Languages

| Code | Language   | Notes |
|------|------------|--------|
| en   | English    | **Source** – complete for all namespaces |
| ar   | Arabic     | |
| de   | German     | |
| es   | Spanish    | **100% key parity + translated** (see §7) |
| fa   | Persian    | |
| fr   | French     | |
| hi   | Hindi      | |
| id   | Indonesian | |
| it   | Italian    | |
| ja   | Japanese   | |
| ko   | Korean     | |
| nl   | Dutch      | |
| pl   | Polish     | |
| pt   | Portuguese | |
| ru   | Russian    | |
| tr   | Turkish    | |
| ur   | Urdu       | |
| vi   | Vietnamese | |
| zh   | Chinese    | |

**Total: 19 languages.**

---

## 3. Coverage matrix (namespace × language)

| Namespace     | en | ar | de | es | fa | fr | hi | id | it | ja | ko | nl | pl | pt | ru | tr | ur | vi | zh |
|---------------|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|-----|
| common        | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| nav           | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| auth          | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| documents     | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| organization  | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| governance    | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| activity      | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| errors        | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| admin         | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| onboarding    | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |

- ✅ = keys present and translated for that locale (or source for `en`).
- ⚠️ = keys may be synced from EN but still need human translation.

---

## 4. Scripts (project root)

| Command | Purpose |
|---------|---------|
| `npm run i18n:diff` | Diff vs `de` (default). Pass locale: `node scripts/diff-i18n-keys.js es` |
| `npm run i18n:check-de` | Fail CI if `de` missing keys vs `en` (Sie lint is warn-only unless `--strict-sie`) |
| `npm run i18n:convert-de-du` | Bulk-convert Sie → Du in `de/*.json` (review diff after) |
| `node scripts/sync-i18n-keys.js [locale\|all]` | Add missing keys from `en` without overwriting translations |

---

## 5. File locations

- **English (source):** `client/public/locales/en/*.json`
- **Other locales:** `client/public/locales/<code>/*.json`
- **i18n config:** `client/src/i18n.ts` (`ns` and `fallbackLng`)

---

## 6. Summary

| Item | Status |
|------|--------|
| EN (source) | ✅ Complete for all 10 namespaces |
| Spanish (es) | ✅ **100% key parity** (`npm run i18n:diff:es` → 0 missing); all namespaces human-translated including `onboarding`, `activity`, governance `tab.*`, organization transparency/audit |
| German (de) | ✅ **100% key parity** + wired UI + **Du** register; CI: `npm run i18n:check-de` |
| French (fr) | ⚠️ Partial; documents & admin may still need work |
| Other locales | ⚠️ Keys often synced; translation still needed where values match EN |
| Code i18n | ✅ Transparency notice, election results alerts, org document create modal use locale files |

**When adding EN keys:** run `node scripts/sync-i18n-keys.js de` (or `all`), translate to Du, then `npm run i18n:check-de`.

---

## 7. German (Du) style guide

Address the user informally:

| Avoid (Sie) | Prefer (Du) |
|-------------|-------------|
| Geben Sie Ihre E-Mail ein | Gib deine E-Mail ein |
| Möchten Sie …? | Möchtest du …? |
| Ihre Stimme wird benötigt | Deine Stimme wird benötigt |

Keep neutral imperatives where natural: Speichern, Abbrechen, Exportieren.

Third-person for others stays third person: „Max hat …“

---

## 8. German terminology glossary

| English | German (Du) |
|---------|-------------|
| Dashboard | Übersicht |
| Governance | Mitbestimmung |
| Meeting | Besprechung / Meeting (mixed OK) |
| Representative | Vertreter |
| Vote | Abstimmung |
| Proposal (org/formal) | Antrag |
| Proposal (paragraph edit) | Vorschlag |
| Transparency | Transparenz |
| Schedule | Termine |

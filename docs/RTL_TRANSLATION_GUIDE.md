# RTL Translation Guide (ar, fa, ur)

**Locales:** Arabic (`ar`), Persian (`fa`), Urdu (`ur`)  
**Direction:** RTL — set automatically via [`client/src/lib/supportedLocales.ts`](../client/src/lib/supportedLocales.ts)

---

## Style rules

| Locale | Register | Notes |
|--------|----------|-------|
| **ar** | Modern Standard Arabic (MSA), formal | Use standard product UI tone; avoid dialect |
| **fa** | Formal Persian (شما) | Prefer native Persian terms over Arabic loanwords where natural |
| **ur** | Formal Urdu | Distinct from fa; use Urdu grammar and vocabulary |

**Always preserve:**
- `{{variable}}` interpolation tokens
- `\n` line breaks in confirm dialogs
- `languageNames.*` in each language's native script (do not translate to English)

**Translate:** `nav.democraticIntelligence` and all user-facing copy.

---

## Governance terminology glossary

Use these consistently across `governance.json`, `organization.json`, and `documents.json`.

| English | Arabic (ar) | Persian (fa) | Urdu (ur) |
|---------|-------------|--------------|-----------|
| Governance | الحوكمة | مشارکت / حکمرانی | نظم و نسق |
| Vote / voting | التصويت | رأی‌گیری | رائے دہی |
| Proposal (formal/org) | مقترح | پیشنهاد | تجویز |
| Proposal (paragraph edit) | اقتراح | پیشنهاد ویرایش | تجویز ترمیم |
| Representative | ممثل | نماینده | نمائندہ |
| Election | انتخاب | انتخابات | انتخابات |
| Quorum | النصاب | حد نصاب | نصاب |
| Amendment | تعديل | اصلاحیه | ترمیم |
| Transparency | الشفافية | شفافیت | شفافیت |
| Bootstrap mode | وضع الإقلاع | حالت راه‌اندازی اولیه | ابتدائی سیٹ اپ موڈ |
| Mistrust vote | تصويت عدم الثقة | رأی‌گیری عدم اعتماد | عدم اعتماد کی رائے |
| Nomination | ترشيح | نامزدی | نامزدگی |
| Resignation | استقالة | استعفا | استعفی |
| Threshold | العتبة | آستانه | حد |
| Consensus | إجماع | اجماع | اتفاق رائے |
| Document | مستند | سند | دستاویز |
| Organization | منظمة | سازمان | تنظیم |
| Collaborator | متعاون | همکار | اشتراک کنندہ |
| Suggestion | اقتراح | پیشنهاد | تجویز |
| Agreed document | المستند المتفق عليه | سند توافق‌شده | متفقہ دستاویز |

---

## RTL UI notes

- Punctuation: prefer Arabic comma `،` in ar; fa/ur may use `،` or standard comma consistently per locale file.
- Numbers and percentages (`{{pct}}%`) stay LTR inside RTL text — i18n tokens handle this.
- Mixed LTR tokens (emails, URLs) remain untranslated.
- Button labels: short imperatives (Save → حفظ / ذخیره / محفوظ کریں).

---

## Workflow commands

```bash
# Sync missing keys from English
npm run i18n:sync:rtl

# Check key parity + untranslated warnings
npm run i18n:check-rtl

# Machine-translate EN-copy strings only (never overwrites existing translations)
python scripts/auto_translate_locales.py ar
python scripts/auto_translate_locales.py fa
python scripts/auto_translate_locales.py ur

# Per-namespace batch
python scripts/auto_translate_locales.py ar,fa,ur organization.json

# Find remaining EN-copy keys
python scripts/list_identical_locale_keys.py ar common.json
```

---

## Review priority (Tier A)

Manually review after MT:

1. **governance.json** — elections, quorum, vote confirmation, bootstrap
2. **organization.json** — representative resignation, mistrust vote, nomination, transparency
3. **documents.json** — suggestion voting, agreed-document amendments

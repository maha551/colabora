/**
 * Merge governance dialog i18n keys into en/de/es governance.json
 * Usage: node scripts/merge-governance-dialog-i18n.js
 */
const fs = require('fs');
const path = require('path');

const LOCALES_ROOT = path.join(__dirname, '..', 'client', 'public', 'locales');
const DATA = require('./governance-dialog-i18n-data');
const COMPLETE = require('./complete-i18n-data');

for (const locale of ['en', 'de', 'es']) {
  for (const ns of ['governance', 'documents']) {
    const filePath = path.join(LOCALES_ROOT, locale, `${ns}.json`);
    const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const patch = ns === 'governance'
      ? deepMerge(DATA[locale] || {}, COMPLETE.governance[locale] || {})
      : COMPLETE.documents[locale] || {};
    const merged = deepMerge(existing, patch);
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
    console.log(`Updated ${locale}/${ns}.json`);
  }
}

function deepMerge(target, source) {
  const out = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') {
      out[k] = deepMerge(target[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

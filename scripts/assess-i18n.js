/**
 * Read-only i18n coverage report: compare locale keys/values against en.
 * Usage: node scripts/assess-i18n.js [locale]
 */
const fs = require('fs');
const path = require('path');

const LOCALES_ROOT = path.join(__dirname, '..', 'client', 'public', 'locales');
const NAMESPACES = ['common', 'nav', 'auth', 'documents', 'organization', 'governance', 'activity', 'errors', 'admin', 'onboarding'];
const locale = process.argv[2] || 'fr';

function flattenKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, key));
    } else {
      keys.push(key);
    }
  }
  return keys;
}

function getVal(obj, key) {
  return key.split('.').reduce((o, p) => o?.[p], obj);
}

function isLikelyUntranslated(enVal, locVal) {
  if (typeof enVal !== 'string' || typeof locVal !== 'string') return false;
  if (enVal !== locVal) return false;
  if (enVal.length <= 2) return false;
  if (/^[0-9%$]+$/.test(enVal)) return false;
  if (/^[A-Z]{2,5}$/.test(enVal)) return false;
  if (/^[\w.+-]+@[\w.-]+\.\w+$/.test(enVal)) return false;
  return true;
}

const enDir = path.join(LOCALES_ROOT, 'en');
const locDir = path.join(LOCALES_ROOT, locale);

let totalEn = 0;
let totalPresent = 0;
let totalMissing = 0;
let totalUntranslated = 0;

console.log(`=== ${locale.toUpperCase()} TRANSLATION ASSESSMENT ===\n`);

for (const ns of NAMESPACES) {
  const enPath = path.join(enDir, `${ns}.json`);
  const locPath = path.join(locDir, `${ns}.json`);
  if (!fs.existsSync(enPath)) continue;

  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const enKeys = flattenKeys(en);
  totalEn += enKeys.length;

  if (!fs.existsSync(locPath)) {
    console.log(`${ns}.json: MISSING FILE (${enKeys.length} keys)`);
    totalMissing += enKeys.length;
    continue;
  }

  const loc = JSON.parse(fs.readFileSync(locPath, 'utf8'));
  const locSet = new Set(flattenKeys(loc));
  const missing = enKeys.filter((k) => !locSet.has(k));
  const untranslated = enKeys.filter((k) =>
    locSet.has(k) && isLikelyUntranslated(getVal(en, k), getVal(loc, k))
  );

  totalPresent += enKeys.length - missing.length;
  totalMissing += missing.length;
  totalUntranslated += untranslated.length;

  const pct = Math.round(((enKeys.length - missing.length) / enKeys.length) * 100);
  console.log(
    `${ns}.json: ${enKeys.length - missing.length}/${enKeys.length} keys (${pct}%), ` +
    `untranslated=${untranslated.length}`
  );
}

const coverage = ((totalPresent / totalEn) * 100).toFixed(1);
const transPct = totalPresent ? (((totalPresent - totalUntranslated) / totalPresent) * 100).toFixed(1) : '0';
console.log(`\nTOTAL: ${totalPresent}/${totalEn} keys (${coverage}% coverage), ~${transPct}% translated`);

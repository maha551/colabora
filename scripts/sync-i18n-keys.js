/**
 * Adds missing i18n keys from en/<ns>.json into <locale>/<ns>.json.
 * Only adds keys that are missing; never overwrites existing translations.
 * Usage: node scripts/sync-i18n-keys.js [locale]
 *   locale: e.g. de, or "all" for all non-en locales (default: all)
 * Run from project root.
 */
const fs = require('fs');
const path = require('path');

const LOCALES_ROOT = path.join(__dirname, '..', 'client', 'public', 'locales');
const NAMESPACES = ['common', 'nav', 'auth', 'documents', 'organization', 'governance', 'activity', 'errors', 'admin', 'onboarding', 'emails'];

const NON_EN_LOCALES = ['ar', 'de', 'es', 'fa', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'nl', 'pl', 'pt', 'ru', 'tr', 'ur', 'vi', 'zh'];

function deepMergeMissing(target, source) {
  for (const key of Object.keys(source)) {
    if (!(key in target)) {
      const srcVal = source[key];
      if (srcVal !== null && typeof srcVal === 'object' && !Array.isArray(srcVal)) {
        target[key] = {};
        deepMergeMissing(target[key], srcVal);
      } else {
        target[key] = srcVal;
      }
    } else {
      const tgtVal = target[key];
      const srcVal = source[key];
      if (tgtVal !== null && typeof tgtVal === 'object' && !Array.isArray(tgtVal) &&
          srcVal !== null && typeof srcVal === 'object' && !Array.isArray(srcVal)) {
        deepMergeMissing(tgtVal, srcVal);
      }
    }
  }
}

function sortObjectKeys(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortObjectKeys(obj[key]);
  }
  return sorted;
}

function runSync(locale) {
  const localeDir = path.join(LOCALES_ROOT, locale);
  if (!fs.existsSync(localeDir)) {
    fs.mkdirSync(localeDir, { recursive: true });
  }

  let added = 0;
  for (const ns of NAMESPACES) {
    const enPath = path.join(LOCALES_ROOT, 'en', `${ns}.json`);
    const localePath = path.join(localeDir, `${ns}.json`);

    if (!fs.existsSync(enPath)) continue;

    const enContent = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    let localeContent = {};
    if (fs.existsSync(localePath)) {
      localeContent = JSON.parse(fs.readFileSync(localePath, 'utf8'));
    }

    const before = JSON.stringify(localeContent);
    deepMergeMissing(localeContent, enContent);
    const after = JSON.stringify(localeContent);
    if (before !== after) {
      const sorted = sortObjectKeys(localeContent);
      fs.writeFileSync(localePath, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
      const addedKeys = Object.keys(JSON.parse(after)).length - Object.keys(JSON.parse(before)).length;
      added += 1;
      console.log(`  ${locale}/${ns}.json: updated`);
    }
  }
  return added;
}

function main() {
  const arg = process.argv[2] || 'all';
  const locales = arg === 'all' ? NON_EN_LOCALES : [arg];

  console.log(`Syncing missing keys from en to: ${locales.join(', ')}`);
  for (const locale of locales) {
    console.log(`\n${locale}:`);
    runSync(locale);
  }
  console.log('\nDone.');
}

main();

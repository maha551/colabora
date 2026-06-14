/**
 * Lists i18n keys that exist in en/<ns>.json but are missing in <locale>/<ns>.json.
 * Usage: node scripts/diff-i18n-keys.js [locale]
 *   locale: e.g. de, es, fr (default: de)
 * Run from project root. Locales path: client/public/locales/
 */
const fs = require('fs');
const path = require('path');

const LOCALES_ROOT = path.join(__dirname, '..', 'client', 'public', 'locales');
const NAMESPACES = ['common', 'nav', 'auth', 'documents', 'organization', 'governance', 'activity', 'errors', 'admin', 'onboarding', 'emails'];

function collectKeyPaths(obj, prefix = '') {
  const paths = [];
  for (const key of Object.keys(obj)) {
    const pathKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      paths.push(...collectKeyPaths(value, pathKey));
    } else {
      paths.push(pathKey);
    }
  }
  return paths;
}

function hasKey(obj, pathKey) {
  // Flat dot-notation keys (e.g. "protocolCanvas.addBlock") are stored as a single JSON key
  if (Object.prototype.hasOwnProperty.call(obj, pathKey)) return true;
  const parts = pathKey.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object' || !(part in current)) return false;
    current = current[part];
  }
  return true;
}

function main() {
  const locale = process.argv[2] || 'de';
  const enDir = path.join(LOCALES_ROOT, 'en');
  const localeDir = path.join(LOCALES_ROOT, locale);

  if (!fs.existsSync(localeDir)) {
    console.error(`Locale directory not found: ${localeDir}`);
    process.exit(1);
  }

  const report = { locale, missing: {} };
  let totalMissing = 0;

  for (const ns of NAMESPACES) {
    const enPath = path.join(enDir, `${ns}.json`);
    const localePath = path.join(localeDir, `${ns}.json`);

    if (!fs.existsSync(enPath)) continue;
    const enContent = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const enPaths = collectKeyPaths(enContent);

    let localeContent = {};
    if (fs.existsSync(localePath)) {
      localeContent = JSON.parse(fs.readFileSync(localePath, 'utf8'));
    }

    const missing = enPaths.filter((p) => !hasKey(localeContent, p));
    if (missing.length) {
      report.missing[ns] = missing;
      totalMissing += missing.length;
      console.log(`\n${ns}: ${missing.length} missing key(s)`);
      missing.forEach((p) => console.log(`  - ${p}`));
    }
  }

  console.log(`\nTotal missing for ${locale}: ${totalMissing}`);
  return report;
}

main();

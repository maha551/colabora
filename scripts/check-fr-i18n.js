/**
 * Validates French locale: key parity vs en and no untranslated (EN-identical) strings.
 * Usage: node scripts/check-fr-i18n.js
 * Exit 1 if missing keys or untranslated strings found.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LOCALES_ROOT = path.join(__dirname, '..', 'client', 'public', 'locales');
const NAMESPACES = ['common', 'nav', 'auth', 'documents', 'organization', 'governance', 'activity', 'errors', 'admin', 'onboarding'];
const FR_DIR = path.join(LOCALES_ROOT, 'fr');
const EN_DIR = path.join(LOCALES_ROOT, 'en');

let exitCode = 0;

function flattenLeaves(obj, prefix = '') {
  const leaves = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      leaves.push(...flattenLeaves(v, key));
    } else {
      leaves.push({ key, value: v });
    }
  }
  return leaves;
}

function getVal(obj, key) {
  return key.split('.').reduce((o, p) => o?.[p], obj);
}

function shouldSkipUntranslatedCheck(enVal) {
  if (typeof enVal !== 'string') return true;
  if (enVal.length <= 2) return true;
  if (/^[0-9%$]+$/.test(enVal)) return true;
  if (/^[A-Z]{2,5}$/.test(enVal)) return true;
  if (/^[\w.+-]+@[\w.-]+\.\w+$/.test(enVal)) return true;
  if (/^https?:\/\//.test(enVal)) return true;
  if (enVal === 'colabora') return true;
  return false;
}

try {
  const diffOut = execSync('node scripts/diff-i18n-keys.js fr', {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  });
  const missingMatch = diffOut.match(/Total missing for fr: (\d+)/);
  const missing = missingMatch ? parseInt(missingMatch[1], 10) : 0;
  if (missing > 0) {
    console.error(diffOut);
    console.error(`\nFAIL: ${missing} missing key(s) in fr locales`);
    exitCode = 1;
  } else {
    console.log('OK: fr locale key parity with en');
  }
} catch (e) {
  console.error(e.stdout || e.message);
  exitCode = 1;
}

const untranslatedHits = [];

for (const ns of NAMESPACES) {
  const enPath = path.join(EN_DIR, `${ns}.json`);
  const frPath = path.join(FR_DIR, `${ns}.json`);
  if (!fs.existsSync(enPath) || !fs.existsSync(frPath)) continue;

  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const fr = JSON.parse(fs.readFileSync(frPath, 'utf8'));
  const enLeaves = flattenLeaves(en);

  for (const { key, value: enVal } of enLeaves) {
    const frVal = getVal(fr, key);
    if (frVal === undefined) continue;
    if (shouldSkipUntranslatedCheck(enVal)) continue;
    if (enVal === frVal) {
      untranslatedHits.push(`${ns}.json:${key}`);
    }
  }
}

if (untranslatedHits.length) {
  console.error(`\nFAIL: ${untranslatedHits.length} untranslated string(s) in fr locales:`);
  untranslatedHits.slice(0, 50).forEach((h) => console.error(`  - ${h}`));
  if (untranslatedHits.length > 50) {
    console.error(`  ... and ${untranslatedHits.length - 50} more`);
  }
  exitCode = 1;
} else {
  console.log('OK: no untranslated strings detected in fr locales');
}

process.exit(exitCode);

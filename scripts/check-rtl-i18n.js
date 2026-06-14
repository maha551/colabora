/**
 * Validates RTL locales (ar, fa, ur): key parity vs en and untranslated-key warnings.
 * Usage: node scripts/check-rtl-i18n.js [--strict-untranslated]
 * Exit 1 if missing keys or (with --strict-untranslated) any EN-copy strings remain.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const strictUntranslated = process.argv.includes('--strict-untranslated');
const RTL_LOCALES = ['ar', 'fa', 'ur'];
const NAMESPACES = [
  'common', 'nav', 'auth', 'documents', 'organization', 'governance',
  'activity', 'errors', 'admin', 'onboarding',
];
const ROOT = path.join(__dirname, '..');
const LOCALE_ROOT = path.join(ROOT, 'client', 'public', 'locales');

function flatten(obj, prefix = '') {
  const out = {};
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      Object.assign(out, flatten(v, key));
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => Object.assign(out, flatten(v, `${prefix}[${i}]`)));
  } else {
    out[prefix] = obj;
  }
  return out;
}

function countIdentical(lang, ns) {
  const enPath = path.join(LOCALE_ROOT, 'en', `${ns}.json`);
  const locPath = path.join(LOCALE_ROOT, lang, `${ns}.json`);
  if (!fs.existsSync(enPath) || !fs.existsSync(locPath)) return 0;
  const en = flatten(JSON.parse(fs.readFileSync(enPath, 'utf8')));
  const loc = flatten(JSON.parse(fs.readFileSync(locPath, 'utf8')));
  let count = 0;
  for (const k of Object.keys(en)) {
    if (k.startsWith('languageNames.')) continue;
    if (!(k in loc)) continue;
    const ev = en[k];
    const lv = loc[k];
    if (typeof ev === 'string' && typeof lv === 'string' && ev.trim() && lv.trim() && ev === lv) {
      if (!/^https?:\/\//.test(ev.trim())) count += 1;
    }
  }
  return count;
}

let exitCode = 0;

for (const lang of RTL_LOCALES) {
  try {
    const diffOut = execSync(`node scripts/diff-i18n-keys.js ${lang}`, {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const missingMatch = diffOut.match(new RegExp(`Total missing for ${lang}: (\\d+)`));
    const missing = missingMatch ? parseInt(missingMatch[1], 10) : 0;
    if (missing > 0) {
      console.error(diffOut);
      console.error(`\nFAIL: ${missing} missing key(s) in ${lang} locales`);
      exitCode = 1;
    } else {
      console.log(`OK: ${lang} locale key parity with en`);
    }
  } catch (e) {
    console.error(e.stdout || e.message);
    exitCode = 1;
  }

  let totalIdentical = 0;
  const perNs = [];
  for (const ns of NAMESPACES) {
    const n = countIdentical(lang, ns);
    totalIdentical += n;
    if (n > 0) perNs.push(`${ns}=${n}`);
  }
  if (totalIdentical > 0) {
    console.warn(`WARN: ${lang} has ${totalIdentical} untranslated (EN-copy) string(s): ${perNs.join(', ')}`);
    if (strictUntranslated) {
      console.error(`FAIL: --strict-untranslated enabled for ${lang}`);
      exitCode = 1;
    }
  } else {
    console.log(`OK: ${lang} has no untranslated strings`);
  }
}

process.exit(exitCode);

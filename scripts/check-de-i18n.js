/**
 * Validates German locale: key parity vs en and optional Sie-form lint.
 * Usage: node scripts/check-de-i18n.js [--strict-sie]
 * Exit 1 if missing keys or (with --strict-sie) Sie patterns found.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const strictSie = process.argv.includes('--strict-sie');
const DE_DIR = path.join(__dirname, '..', 'client', 'public', 'locales', 'de');

const SIE_PATTERN = /\b(Sie |Ihre |Ihnen |Ihr |Geben Sie |Wählen Sie |Möchten Sie |Bitte geben Sie )/;

let exitCode = 0;

try {
  const diffOut = execSync('node scripts/diff-i18n-keys.js de', {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  });
  const missingMatch = diffOut.match(/Total missing for de: (\d+)/);
  const missing = missingMatch ? parseInt(missingMatch[1], 10) : 0;
  if (missing > 0) {
    console.error(diffOut);
    console.error(`\nFAIL: ${missing} missing key(s) in de locales`);
    exitCode = 1;
  } else {
    console.log('OK: de locale key parity with en');
  }
} catch (e) {
  console.error(e.stdout || e.message);
  exitCode = 1;
}

const sieHits = [];
for (const file of fs.readdirSync(DE_DIR).filter((f) => f.endsWith('.json'))) {
  const content = fs.readFileSync(path.join(DE_DIR, file), 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    if (SIE_PATTERN.test(line)) {
      sieHits.push(`${file}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (sieHits.length) {
  console.warn(`\nWARN: ${sieHits.length} possible Sie-form string(s) in de locales:`);
  sieHits.slice(0, 30).forEach((h) => console.warn(`  ${h}`));
  if (sieHits.length > 30) console.warn(`  ... and ${sieHits.length - 30} more`);
  if (strictSie) {
    console.error('\nFAIL: --strict-sie enabled');
    exitCode = 1;
  }
} else {
  console.log('OK: no Sie patterns detected in de locales');
}

process.exit(exitCode);

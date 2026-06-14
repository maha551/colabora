/**
 * Script to update all test files to use safe database deletion
 * Run with: node tests/utils/update-test-files.js
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const testFiles = glob.sync('tests/**/*.test.js');

let updated = 0;

testFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let modified = false;

  // Add import if not present and file uses fs.unlinkSync
  if (content.includes('fs.unlinkSync(testDbPath)') && !content.includes('safeDeleteTestDatabase')) {
    // Add import at top if test-helpers is not imported
    if (!content.includes("require('../utils/test-helpers')") && !content.includes("require('./utils/test-helpers')")) {
      // Find the last require statement
      const requireMatch = content.match(/(const.*=.*require\([^)]+\);\n)/g);
      if (requireMatch) {
        const lastRequire = requireMatch[requireMatch.length - 1];
        const lastRequireIndex = content.lastIndexOf(lastRequire) + lastRequire.length;
        const importLine = "const { safeDeleteTestDatabase } = require('../utils/test-helpers');\n";
        content = content.slice(0, lastRequireIndex) + importLine + content.slice(lastRequireIndex);
        modified = true;
      }
    }

    // Replace fs.unlinkSync patterns
    content = content.replace(
      /if \(fs\.existsSync\(testDbPath\)\) \{\s*fs\.unlinkSync\(testDbPath\);\s*\}/g,
      'await safeDeleteTestDatabase(testDbPath);'
    );

    content = content.replace(
      /try \{\s*if \(fs\.existsSync\(testDbPath\)\) \{\s*fs\.unlinkSync\(testDbPath\);\s*\}\s*\} catch \(error\) \{\s*console\.warn\([^)]+\);\s*\}/g,
      'await safeDeleteTestDatabase(testDbPath);'
    );

    if (modified || content.includes('safeDeleteTestDatabase')) {
      fs.writeFileSync(file, content, 'utf8');
      updated++;
      console.log(`Updated: ${file}`);
    }
  }
});

console.log(`\nUpdated ${updated} files`);


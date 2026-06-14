#!/usr/bin/env node

/**
 * Design System Validation Script
 * 
 * Scans the codebase for design system violations:
 * - Hardcoded hex colors
 * - Hardcoded Tailwind gray classes (bg-gray-*, text-gray-*, border-gray-*)
 * - Hardcoded spacing values (when not using SPACING constants)
 * 
 * Usage: node scripts/validate-design-system.js
 */

const fs = require('fs');
const path = require('path');

const VIOLATIONS = {
  hexColors: [],
  grayClasses: [],
  hardcodedSpacing: [],
};

// Patterns to check
const HEX_COLOR_PATTERN = /#[0-9a-fA-F]{3,6}/gi;
const GRAY_CLASS_PATTERN = /(bg-gray-|text-gray-|border-gray-)[\d]+/g;
const SPACING_PATTERN = /(?:gap-|space-y-|space-x-|p-|px-|py-|pt-|pb-|pl-|pr-|m-|mx-|my-|mt-|mb-|ml-|mr-)[\d]+/g;

// Files to exclude
const EXCLUDE_PATTERNS = [
  /node_modules/,
  /\.git/,
  /build/,
  /coverage/,
  /\.next/,
  /dist/,
  /designSystem\.ts$/, // Design system file itself
  /designSystem\.types\.ts$/, // Design system types
  /globals\.css$/, // CSS variables file
  /statusColors\.ts$/, // Status colors (uses design tokens)
  /documentStyles\.ts$/, // Document styles (uses design system)
  /\.test\./,
  /\.spec\./,
];

// Directories to scan
const SCAN_DIRECTORIES = [
  path.join(__dirname, '../client/src/components'),
  path.join(__dirname, '../client/src/lib'),
  path.join(__dirname, '../client/src/pages'),
];

function shouldExcludeFile(filePath) {
  return EXCLUDE_PATTERNS.some(pattern => pattern.test(filePath));
}

function scanFile(filePath) {
  if (shouldExcludeFile(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    // Check for hex colors
    const hexMatches = line.match(HEX_COLOR_PATTERN);
    if (hexMatches) {
      // Exclude hex colors in comments or CSS variable definitions
      if (!line.includes('//') && !line.includes('/*') && !line.includes('var(--')) {
        VIOLATIONS.hexColors.push({
          file: filePath,
          line: lineNumber,
          content: line.trim(),
          matches: hexMatches,
        });
      }
    }

    // Check for gray classes
    const grayMatches = line.match(GRAY_CLASS_PATTERN);
    if (grayMatches) {
      VIOLATIONS.grayClasses.push({
        file: filePath,
        line: lineNumber,
        content: line.trim(),
        matches: grayMatches,
      });
    }

    // Check for hardcoded spacing (basic check - may have false positives)
    // This is a simplified check; a more sophisticated one would parse the AST
    const spacingMatches = line.match(SPACING_PATTERN);
    if (spacingMatches && !line.includes('SPACING') && !line.includes('designSystem')) {
      // Only flag if it's not clearly using design system
      VIOLATIONS.hardcodedSpacing.push({
        file: filePath,
        line: lineNumber,
        content: line.trim(),
        matches: spacingMatches,
      });
    }
  });
}

function scanDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      scanFile(fullPath);
    }
  }
}

// Track design system usage
const DESIGN_SYSTEM_USAGE = {
  componentsUsingSpacing: 0,
  componentsUsingColors: 0,
  componentsUsingIconWrapper: 0,
  componentsUsingDesignSystem: 0,
};

function scanFile(filePath) {
  if (shouldExcludeFile(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // Check for design system usage
  if (/from\s+['"]@\/lib\/designSystem['"]/.test(content)) {
    DESIGN_SYSTEM_USAGE.componentsUsingDesignSystem++;
  }
  if (/SPACING\./.test(content)) {
    DESIGN_SYSTEM_USAGE.componentsUsingSpacing++;
  }
  if (/COLORS\./.test(content)) {
    DESIGN_SYSTEM_USAGE.componentsUsingColors++;
  }
  if (/from\s+['"]@\/components\/ui\/Icon['"]|from\s+['"]\.\.\/ui\/Icon['"]|from\s+['"]\.\/ui\/Icon['"]/.test(content)) {
    DESIGN_SYSTEM_USAGE.componentsUsingIconWrapper++;
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    // Check for hex colors
    const hexMatches = line.match(HEX_COLOR_PATTERN);
    if (hexMatches) {
      // Exclude hex colors in comments or CSS variable definitions
      if (!line.includes('//') && !line.includes('/*') && !line.includes('var(--')) {
        // Exclude legitimate cases (user-provided branding colors)
        if (!line.includes('brandingColor') && !line.includes('organization') && !line.includes('getUserColor')) {
          VIOLATIONS.hexColors.push({
            file: filePath,
            line: lineNumber,
            content: line.trim(),
            matches: hexMatches,
          });
        }
      }
    }

    // Check for gray classes
    const grayMatches = line.match(GRAY_CLASS_PATTERN);
    if (grayMatches) {
      VIOLATIONS.grayClasses.push({
        file: filePath,
        line: lineNumber,
        content: line.trim(),
        matches: grayMatches,
      });
    }

    // Check for hardcoded spacing (basic check - may have false positives)
    // This is a simplified check; a more sophisticated one would parse the AST
    const spacingMatches = line.match(SPACING_PATTERN);
    if (spacingMatches && !line.includes('SPACING') && !line.includes('designSystem')) {
      // Only flag if it's not clearly using design system
      // Filter out icon sizes (h-4 w-4, etc.)
      if (!line.match(/h-[\d]+|w-[\d]+/)) {
        VIOLATIONS.hardcodedSpacing.push({
          file: filePath,
          line: lineNumber,
          content: line.trim(),
          matches: spacingMatches,
        });
      }
    }
  });
}

function printReport() {
  console.log('\n=== Design System Validation Report ===\n');

  // Show design system usage
  console.log('📊 Design System Usage:');
  console.log(`   Components using SPACING: ${DESIGN_SYSTEM_USAGE.componentsUsingSpacing}`);
  console.log(`   Components using COLORS: ${DESIGN_SYSTEM_USAGE.componentsUsingColors}`);
  console.log(`   Components using Icon wrapper: ${DESIGN_SYSTEM_USAGE.componentsUsingIconWrapper}`);
  console.log(`   Components importing designSystem: ${DESIGN_SYSTEM_USAGE.componentsUsingDesignSystem}`);
  console.log();

  let totalViolations = 0;

  if (VIOLATIONS.hexColors.length > 0) {
    console.log(`❌ Hardcoded Hex Colors: ${VIOLATIONS.hexColors.length} violations`);
    VIOLATIONS.hexColors.slice(0, 10).forEach(v => {
      console.log(`   ${v.file}:${v.line} - ${v.content.substring(0, 80)}`);
    });
    if (VIOLATIONS.hexColors.length > 10) {
      console.log(`   ... and ${VIOLATIONS.hexColors.length - 10} more`);
    }
    totalViolations += VIOLATIONS.hexColors.length;
    console.log();
  } else {
    console.log('✅ No hardcoded hex colors found\n');
  }

  if (VIOLATIONS.grayClasses.length > 0) {
    console.log(`⚠️  Hardcoded Gray Classes: ${VIOLATIONS.grayClasses.length} violations`);
    VIOLATIONS.grayClasses.slice(0, 10).forEach(v => {
      console.log(`   ${v.file}:${v.line} - ${v.content.substring(0, 80)}`);
    });
    if (VIOLATIONS.grayClasses.length > 10) {
      console.log(`   ... and ${VIOLATIONS.grayClasses.length - 10} more`);
    }
    totalViolations += VIOLATIONS.grayClasses.length;
    console.log();
  } else {
    console.log('✅ No hardcoded gray classes found\n');
  }

  if (VIOLATIONS.hardcodedSpacing.length > 0) {
    console.log(`⚠️  Hardcoded Spacing (may have false positives): ${VIOLATIONS.hardcodedSpacing.length} potential violations`);
    console.log('   Note: This is a basic check. Review manually to confirm violations.');
    console.log('   Note: Icon sizes (h-4 w-4) are excluded from this count.\n');
    totalViolations += VIOLATIONS.hardcodedSpacing.length;
  } else {
    console.log('✅ No hardcoded spacing found\n');
  }

  console.log(`\nTotal Violations: ${totalViolations}`);

  if (totalViolations > 0) {
    console.log('\n💡 Recommendations:');
    console.log('   - Replace hex colors with CSS variables (var(--color-name))');
    console.log('   - Replace gray classes with design tokens (text-foreground, bg-muted, etc.)');
    console.log('   - Use SPACING constants from designSystem.ts for spacing');
    console.log('   - Use Icon wrapper component instead of direct lucide-react imports');
    console.log('   - See docs/active/COMPONENT_MIGRATION_GUIDE.md for detailed instructions');
    console.log('\n');
    process.exit(1);
  } else {
    console.log('\n✅ All checks passed!\n');
    process.exit(0);
  }
}

// Main execution
console.log('Scanning for design system violations...\n');

SCAN_DIRECTORIES.forEach(dir => {
  if (fs.existsSync(dir)) {
    scanDirectory(dir);
  }
});

printReport();


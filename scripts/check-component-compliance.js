#!/usr/bin/env node

/**
 * Check Single Component Compliance
 * 
 * Checks a single component file for design system compliance.
 * 
 * Usage: node scripts/check-component-compliance.js <component-path>
 * Example: node scripts/check-component-compliance.js client/src/components/Login.tsx
 */

const fs = require('fs');
const path = require('path');

const HEX_COLOR_PATTERN = /#[0-9a-fA-F]{3,6}/gi;
const GRAY_CLASS_PATTERN = /(bg-gray-|text-gray-|border-gray-)[\d]+/g;
const SPACING_PATTERN = /(?:gap-|space-y-|space-x-|p-|px-|py-|pt-|pb-|pl-|pr-|m-|mx-|my-|mt-|mb-|ml-|mr-)[\d]+/g;
const DIRECT_LUCIDE_IMPORT = /from\s+['"]lucide-react['"]/g;
const DESIGN_SYSTEM_IMPORT = /from\s+['"]@\/lib\/designSystem['"]/g;
const ICON_WRAPPER_IMPORT = /from\s+['"]@\/components\/ui\/Icon['"]|from\s+['"]\.\.\/ui\/Icon['"]|from\s+['"]\.\/ui\/Icon['"]/g;
const SPACING_USAGE = /SPACING\./g;
const COLORS_USAGE = /COLORS\./g;

function checkComponent(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const violations = {
    colors: [],
    spacing: [],
    icons: [],
  };

  const compliance = {
    usesSpacing: SPACING_USAGE.test(content),
    usesColors: COLORS_USAGE.test(content),
    usesIconWrapper: ICON_WRAPPER_IMPORT.test(content),
    usesDesignSystem: DESIGN_SYSTEM_IMPORT.test(content),
    usesCssVariables: /var\(--[^)]+\)/.test(content),
  };

  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    // Check for hex colors
    const hexMatches = line.match(HEX_COLOR_PATTERN);
    if (hexMatches && !line.includes('//') && !line.includes('/*') && !line.includes('var(--')) {
      if (!line.includes('brandingColor') && !line.includes('organization') && !line.includes('getUserColor')) {
        violations.colors.push({
          line: lineNumber,
          content: line.trim(),
          type: 'hex_color',
        });
      }
    }

    // Check for gray classes
    const grayMatches = line.match(GRAY_CLASS_PATTERN);
    if (grayMatches) {
      violations.colors.push({
        line: lineNumber,
        content: line.trim(),
        type: 'gray_class',
      });
    }

    // Check for direct lucide-react imports
    if (DIRECT_LUCIDE_IMPORT.test(line)) {
      violations.icons.push({
        line: lineNumber,
        content: line.trim(),
        type: 'direct_import',
      });
    }

    // Check for hardcoded spacing
    const spacingMatches = line.match(SPACING_PATTERN);
    if (spacingMatches && !line.includes('SPACING') && !line.includes('designSystem')) {
      // Filter out icon sizes (h-4 w-4, etc.)
      if (!line.match(/h-[\d]+|w-[\d]+/)) {
        violations.spacing.push({
          line: lineNumber,
          content: line.trim(),
          type: 'hardcoded_spacing',
        });
      }
    }
  });

  const totalViolations = violations.colors.length + violations.spacing.length + violations.icons.length;
  const isCompliant = totalViolations === 0;

  // Print report
  console.log(`\n📋 Compliance Report: ${filePath}\n`);
  console.log(`Status: ${isCompliant ? '✅ Compliant' : '❌ Non-Compliant'}`);
  console.log(`\nCompliance:`);
  console.log(`  Uses SPACING: ${compliance.usesSpacing ? '✅' : '❌'}`);
  console.log(`  Uses COLORS: ${compliance.usesColors ? '✅' : '❌'}`);
  console.log(`  Uses Icon Wrapper: ${compliance.usesIconWrapper ? '✅' : '❌'}`);
  console.log(`  Uses Design System: ${compliance.usesDesignSystem ? '✅' : '❌'}`);
  console.log(`  Uses CSS Variables: ${compliance.usesCssVariables ? '✅' : '❌'}`);
  
  console.log(`\nViolations (${totalViolations} total):`);
  
  if (violations.colors.length > 0) {
    console.log(`\n  Color Violations (${violations.colors.length}):`);
    violations.colors.slice(0, 5).forEach(v => {
      console.log(`    Line ${v.line}: ${v.content.substring(0, 60)}`);
    });
    if (violations.colors.length > 5) {
      console.log(`    ... and ${violations.colors.length - 5} more`);
    }
  }
  
  if (violations.spacing.length > 0) {
    console.log(`\n  Spacing Violations (${violations.spacing.length}):`);
    violations.spacing.slice(0, 5).forEach(v => {
      console.log(`    Line ${v.line}: ${v.content.substring(0, 60)}`);
    });
    if (violations.spacing.length > 5) {
      console.log(`    ... and ${violations.spacing.length - 5} more`);
    }
  }
  
  if (violations.icons.length > 0) {
    console.log(`\n  Icon Violations (${violations.icons.length}):`);
    violations.icons.forEach(v => {
      console.log(`    Line ${v.line}: ${v.content}`);
    });
  }

  if (totalViolations === 0) {
    console.log(`\n✅ No violations found!`);
  } else {
    console.log(`\n💡 See docs/active/COMPONENT_MIGRATION_GUIDE.md for migration instructions`);
  }

  process.exit(isCompliant ? 0 : 1);
}

// Get component path from command line
const componentPath = process.argv[2];

if (!componentPath) {
  console.error('❌ Usage: node scripts/check-component-compliance.js <component-path>');
  console.error('   Example: node scripts/check-component-compliance.js client/src/components/Login.tsx');
  process.exit(1);
}

checkComponent(componentPath);


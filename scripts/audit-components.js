#!/usr/bin/env node

/**
 * Comprehensive Component Audit Script
 * 
 * Scans all components and checks compliance with centralized design system:
 * - SPACING constants from designSystem.ts
 * - COLORS constants from designSystem.ts
 * - CSS variables usage
 * - Icon wrapper component usage
 * - Direct lucide-react imports (violations)
 * - Hardcoded hex colors (violations)
 * - Hardcoded gray classes (violations)
 * - Hardcoded spacing values (violations)
 * 
 * Usage: node scripts/audit-components.js
 */

const fs = require('fs');
const path = require('path');

const COMPONENTS_DIR = path.join(__dirname, '../client/src/components');
const RESULTS = {
  components: [],
  summary: {
    total: 0,
    compliant: 0,
    nonCompliant: 0,
    violations: {
      colors: 0,
      spacing: 0,
      icons: 0,
      patterns: 0,
    },
  },
};

// Patterns to check
const HEX_COLOR_PATTERN = /#[0-9a-fA-F]{3,6}/gi;
const GRAY_CLASS_PATTERN = /(bg-gray-|text-gray-|border-gray-)[\d]+/g;
const SPACING_PATTERN = /(?:gap-|space-y-|space-x-|p-|px-|py-|pt-|pb-|pl-|pr-|m-|mx-|my-|mt-|mb-|ml-|mr-)[\d]+/g;
const DIRECT_LUCIDE_IMPORT = /from\s+['"]lucide-react['"]/g;
const DESIGN_SYSTEM_IMPORT = /from\s+['"]@\/lib\/designSystem['"]/g;
const ICON_WRAPPER_IMPORT = /from\s+['"]@\/components\/ui\/Icon['"]|from\s+['"]\.\.\/ui\/Icon['"]|from\s+['"]\.\/ui\/Icon['"]/g;
const SPACING_USAGE = /SPACING\./g;
const COLORS_USAGE = /COLORS\./g;

// Files to exclude
const EXCLUDE_PATTERNS = [
  /node_modules/,
  /\.git/,
  /build/,
  /coverage/,
  /\.next/,
  /dist/,
  /\.test\./,
  /\.spec\./,
];

function shouldExcludeFile(filePath) {
  return EXCLUDE_PATTERNS.some(pattern => pattern.test(filePath));
}

function analyzeComponent(filePath) {
  if (shouldExcludeFile(filePath) || (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts'))) {
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(path.join(__dirname, '..'), filePath);
  
  const violations = {
    colors: [],
    spacing: [],
    icons: [],
    patterns: [],
  };

  const compliance = {
    usesSpacing: false,
    usesColors: false,
    usesIconWrapper: false,
    usesDesignSystem: false,
    usesCssVariables: false,
  };

  const lines = content.split('\n');

  // Check for design system imports
  if (DESIGN_SYSTEM_IMPORT.test(content)) {
    compliance.usesDesignSystem = true;
  }

  // Check for Icon wrapper usage
  if (ICON_WRAPPER_IMPORT.test(content)) {
    compliance.usesIconWrapper = true;
  }

  // Check for SPACING usage
  if (SPACING_USAGE.test(content)) {
    compliance.usesSpacing = true;
  }

  // Check for COLORS usage
  if (COLORS_USAGE.test(content)) {
    compliance.usesColors = true;
  }

  // Check for CSS variables (var(--...))
  if (/var\(--[^)]+\)/.test(content)) {
    compliance.usesCssVariables = true;
  }

  // Find violations
  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    // Check for hex colors (excluding comments and CSS variable definitions)
    const hexMatches = line.match(HEX_COLOR_PATTERN);
    if (hexMatches && !line.includes('//') && !line.includes('/*') && !line.includes('var(--')) {
      // Exclude legitimate cases (user-provided branding colors)
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

    // Check for hardcoded spacing (basic check - may have false positives)
    const spacingMatches = line.match(SPACING_PATTERN);
    if (spacingMatches && !line.includes('SPACING') && !line.includes('designSystem')) {
      // Only flag if it's clearly a hardcoded value
      violations.spacing.push({
        line: lineNumber,
        content: line.trim(),
        type: 'hardcoded_spacing',
      });
    }
  });

  const totalViolations = 
    violations.colors.length + 
    violations.spacing.length + 
    violations.icons.length + 
    violations.patterns.length;

  const isCompliant = totalViolations === 0 && 
    (compliance.usesSpacing || compliance.usesColors || compliance.usesIconWrapper || compliance.usesDesignSystem);

  return {
    path: relativePath,
    violations,
    compliance,
    isCompliant,
    violationCount: totalViolations,
  };
}

function categorizeComponent(componentPath) {
  const pathLower = componentPath.toLowerCase();
  
  // High-visibility components
  if (pathLower.includes('layout') || 
      pathLower.includes('appheader') || 
      pathLower.includes('applayout') ||
      pathLower.includes('appfooter') ||
      pathLower.includes('login') ||
      pathLower.includes('apploadingscreen') ||
      pathLower.includes('documenteditor') ||
      pathLower.includes('documentcard') ||
      pathLower.includes('votinginterface') ||
      pathLower.includes('activityfeed') ||
      pathLower.includes('organizationdashboard')) {
    return 'high';
  }
  
  // Medium-visibility components
  if (pathLower.includes('dialog') || 
      pathLower.includes('modal') ||
      pathLower.includes('governance') ||
      pathLower.includes('shared') ||
      pathLower.includes('tab')) {
    return 'medium';
  }
  
  // Low-visibility components
  return 'low';
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
      const analysis = analyzeComponent(fullPath);
      if (analysis) {
        analysis.visibility = categorizeComponent(analysis.path);
        RESULTS.components.push(analysis);
        RESULTS.summary.total++;
        
        if (analysis.isCompliant) {
          RESULTS.summary.compliant++;
        } else {
          RESULTS.summary.nonCompliant++;
        }
        
        RESULTS.summary.violations.colors += analysis.violations.colors.length;
        RESULTS.summary.violations.spacing += analysis.violations.spacing.length;
        RESULTS.summary.violations.icons += analysis.violations.icons.length;
        RESULTS.summary.violations.patterns += analysis.violations.patterns.length;
      }
    }
  }
}

function generateReport() {
  const report = {
    generatedAt: new Date().toISOString(),
    summary: RESULTS.summary,
    components: RESULTS.components.sort((a, b) => {
      // Sort by visibility (high > medium > low), then by violation count
      const visibilityOrder = { high: 0, medium: 1, low: 2 };
      if (visibilityOrder[a.visibility] !== visibilityOrder[b.visibility]) {
        return visibilityOrder[a.visibility] - visibilityOrder[b.visibility];
      }
      return b.violationCount - a.violationCount;
    }),
  };

  return JSON.stringify(report, null, 2);
}

// Main execution
console.log('Scanning components for design system compliance...\n');

scanDirectory(COMPONENTS_DIR);

const report = generateReport();
const reportPath = path.join(__dirname, '../docs/active/COMPONENT_AUDIT_REPORT.json');
fs.writeFileSync(reportPath, report, 'utf8');

console.log('=== Component Audit Summary ===\n');
console.log(`Total Components: ${RESULTS.summary.total}`);
console.log(`Compliant: ${RESULTS.summary.compliant}`);
console.log(`Non-Compliant: ${RESULTS.summary.nonCompliant}`);
console.log(`\nViolations:`);
console.log(`  Colors: ${RESULTS.summary.violations.colors}`);
console.log(`  Spacing: ${RESULTS.summary.violations.spacing}`);
console.log(`  Icons: ${RESULTS.summary.violations.icons}`);
console.log(`  Patterns: ${RESULTS.summary.violations.patterns}`);
console.log(`\nReport saved to: ${reportPath}`);

// Exit with error code if there are violations
process.exit(RESULTS.summary.nonCompliant > 0 ? 1 : 0);


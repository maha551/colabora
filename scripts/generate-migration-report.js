#!/usr/bin/env node

/**
 * Generate Migration Status Report
 * 
 * Reads the component audit report and generates a migration status report
 * showing progress, remaining work, and recommendations.
 * 
 * Usage: node scripts/generate-migration-report.js
 */

const fs = require('fs');
const path = require('path');

const AUDIT_REPORT_PATH = path.join(__dirname, '../docs/active/COMPONENT_AUDIT_REPORT.json');
const OUTPUT_PATH = path.join(__dirname, '../docs/active/COMPONENT_AUDIT_PROGRESS.md');

function generateProgressReport() {
  if (!fs.existsSync(AUDIT_REPORT_PATH)) {
    console.error('❌ Audit report not found. Run audit-components.js first.');
    process.exit(1);
  }

  const auditData = JSON.parse(fs.readFileSync(AUDIT_REPORT_PATH, 'utf8'));
  
  const tiers = {
    tier1: [], // Critical
    tier2: [], // High
    tier3: [], // Medium
    tier4: [], // Low
  };

  // Categorize components by priority
  auditData.components.forEach(component => {
    const pathLower = component.path.toLowerCase();
    
    // Tier 1: Layout and core UI
    if (pathLower.includes('layout') || 
        pathLower.includes('appheader') || 
        pathLower.includes('applayout') ||
        pathLower.includes('appfooter') ||
        pathLower.includes('login') ||
        pathLower.includes('apploadingscreen')) {
      tiers.tier1.push(component);
    }
    // Tier 2: Document editing and core features
    else if (pathLower.includes('documenteditor') ||
             pathLower.includes('documentcard') ||
             pathLower.includes('votinginterface') ||
             pathLower.includes('activityfeed') ||
             pathLower.includes('organizationdashboard')) {
      tiers.tier2.push(component);
    }
    // Tier 3: Governance, organization management, shared
    else if (pathLower.includes('governance') ||
             pathLower.includes('organizationmanagement') ||
             pathLower.includes('shared')) {
      tiers.tier3.push(component);
    }
    // Tier 4: Everything else
    else {
      tiers.tier4.push(component);
    }
  });

  // Generate markdown report
  const report = `# Component Migration Progress

**Generated:** ${new Date().toISOString().split('T')[0]}  
**Last Audit:** ${auditData.generatedAt.split('T')[0]}

---

## Summary

| Tier | Components | Status | Progress |
|------|------------|--------|----------|
| **Tier 1 (Critical)** | ${tiers.tier1.length} | Not Started | 0% |
| **Tier 2 (High)** | ${tiers.tier2.length} | Not Started | 0% |
| **Tier 3 (Medium)** | ${tiers.tier3.length} | Not Started | 0% |
| **Tier 4 (Low)** | ${tiers.tier4.length} | Not Started | 0% |
| **Total** | ${auditData.summary.total} | Not Started | 0% |

---

## Tier 1: Critical Priority

Components seen on every page or critical to core workflows.

| Component | Violations | Status | Notes |
|-----------|------------|--------|-------|
${tiers.tier1.map(c => `| \`${c.path}\` | Colors: ${c.violations.colors.length}, Spacing: ${c.violations.spacing.length}, Icons: ${c.violations.icons.length} | ⏳ Pending | - |`).join('\n')}

---

## Tier 2: High Priority

Frequently used components in primary user workflows.

| Component | Violations | Status | Notes |
|-----------|------------|--------|-------|
${tiers.tier2.map(c => `| \`${c.path}\` | Colors: ${c.violations.colors.length}, Spacing: ${c.violations.spacing.length}, Icons: ${c.violations.icons.length} | ⏳ Pending | - |`).join('\n')}

---

## Tier 3: Medium Priority

Important but less frequently accessed components.

| Component | Violations | Status | Notes |
|-----------|------------|--------|-------|
${tiers.tier3.slice(0, 20).map(c => `| \`${c.path}\` | Colors: ${c.violations.colors.length}, Spacing: ${c.violations.spacing.length}, Icons: ${c.violations.icons.length} | ⏳ Pending | - |`).join('\n')}
${tiers.tier3.length > 20 ? `\n... and ${tiers.tier3.length - 20} more components` : ''}

---

## Tier 4: Low Priority

Utility components and internal helpers.

| Component | Violations | Status | Notes |
|-----------|------------|--------|-------|
${tiers.tier4.slice(0, 10).map(c => `| \`${c.path}\` | Colors: ${c.violations.colors.length}, Spacing: ${c.violations.spacing.length}, Icons: ${c.violations.icons.length} | ⏳ Pending | - |`).join('\n')}
${tiers.tier4.length > 10 ? `\n... and ${tiers.tier4.length - 10} more components` : ''}

---

## Status Legend

- ⏳ **Pending** - Not yet migrated
- 🔄 **In Progress** - Currently being migrated
- ✅ **Completed** - Migration complete and validated
- ⚠️ **Blocked** - Migration blocked by dependencies or issues
- ❌ **Failed** - Migration failed validation

---

## Next Steps

1. Start with Tier 1 components (critical priority)
2. Follow the migration guide: \`docs/active/COMPONENT_MIGRATION_GUIDE.md\`
3. Update this report as you complete migrations
4. Run validation after each migration: \`node scripts/validate-design-system.js\`

---

## Notes

- Update the Status column as you work on components
- Add notes for any exceptions or special considerations
- Run \`node scripts/audit-components.js\` periodically to refresh violation counts
`;

  fs.writeFileSync(OUTPUT_PATH, report, 'utf8');
  console.log(`✅ Migration progress report generated: ${OUTPUT_PATH}`);
}

generateProgressReport();


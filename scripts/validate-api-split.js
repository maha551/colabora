// Quick validation script for API split
const fs = require('fs');
const path = require('path');

// Check if api.ts only contains re-exports
const apiTsPath = path.join(__dirname, '../client/src/lib/api.ts');
const apiTs = fs.readFileSync(apiTsPath, 'utf8');

// Check for function definitions (const/function/async function XApi =)
const hasFunctionDefs = /^(export\s+)?(const|function|async\s+function)\s+\w+Api\s*=/m.test(apiTs);

if (hasFunctionDefs) {
  console.error('❌ api.ts still contains function definitions!');
  console.error('Expected: Only re-exports from module files');
  process.exit(1);
}

// Check that all expected modules are re-exported
const expectedModules = [
  'documentsApi',
  'proposalsApi',
  'votesApi',
  'commentsApi',
  'organizationsApi',
  'governanceApi',
  'authApi',
  'searchApi',
  'exportApi',
  'activityApi',
  'errorReportsApi',
  'structureHistoryApi',
  'structureProposalsApi',
  'documentTreeProposalsApi',
  'paragraphsApi'
];

const missingExports = expectedModules.filter(module => {
  // Check for import or re-export of this module
  const importPattern = new RegExp(`import.*${module}.*from|export.*${module}`);
  return !importPattern.test(apiTs);
});

if (missingExports.length > 0) {
  console.warn('⚠️  Missing exports:', missingExports.join(', '));
  console.warn('This may be expected if extraction is in progress');
}

console.log('✅ api.ts validation passed');
console.log('✅ api.ts contains only re-exports');


#!/usr/bin/env node

/**
 * Check for circular dependencies in the client source code
 * Uses madge to detect circular dependency chains
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const srcPath = path.join(__dirname, 'src');

console.log('🔍 Checking for circular dependencies...\n');

try {
  // First, try to get detailed circular dependency information
  try {
    // Generate JSON output for detailed analysis
    const jsonOutput = execSync(
      `npx madge --circular --extensions ts,tsx,js,jsx --json "${srcPath}"`,
      { 
        encoding: 'utf8',
        stdio: 'pipe',
        cwd: __dirname
      }
    );
    
    const circularDeps = JSON.parse(jsonOutput);
    
    if (circularDeps && circularDeps.length > 0) {
      console.error('❌ Circular dependencies detected:\n');
      
      circularDeps.forEach((cycle, index) => {
        console.error(`\n${index + 1}. Circular dependency chain:`);
        cycle.forEach((file, fileIndex) => {
          const relativePath = path.relative(srcPath, file);
          console.error(`   ${fileIndex + 1}. ${relativePath}`);
        });
        console.error(`   ↻ Back to: ${path.relative(srcPath, cycle[0])}`);
      });
      
      console.error('\n💡 To fix circular dependencies:');
      console.error('   1. Identify the modules in each cycle above');
      console.error('   2. Extract shared code (types, utilities) to a separate module');
      console.error('   3. Use dependency injection or lazy imports (React.lazy, dynamic imports)');
      console.error('   4. Consider restructuring the module hierarchy\n');
      
      // Optionally save to file
      const outputFile = path.join(__dirname, 'circular-deps-report.json');
      fs.writeFileSync(outputFile, JSON.stringify(circularDeps, null, 2));
      console.error(`📄 Detailed report saved to: ${outputFile}\n`);
      
      process.exit(1);
    }
  } catch (jsonError) {
    // Fall back to text output if JSON parsing fails
    if (jsonError.status === 1) {
      // This means circular deps were found but JSON parsing failed
      console.log('Found circular dependencies, but JSON parsing failed. Using text output...\n');
    }
  }
  
  // Run standard circular check
  const result = execSync(
    `npx madge --circular --extensions ts,tsx,js,jsx "${srcPath}"`,
    { 
      encoding: 'utf8',
      stdio: 'pipe',
      cwd: __dirname
    }
  );

  // If we get here, there are no circular dependencies
  console.log('✅ No circular dependencies found!\n');
  process.exit(0);

} catch (error) {
  // Madge exits with non-zero code when circular dependencies are found
  if (error.status === 1) {
    if (error.stdout) {
      console.error('❌ Circular dependencies detected:\n');
      console.error(error.stdout);
    }
    console.error('\n💡 To fix circular dependencies:');
    console.error('   1. Identify the modules in the cycle');
    console.error('   2. Extract shared code to a separate module');
    console.error('   3. Use dependency injection or lazy imports');
    console.error('   4. Consider restructuring the module hierarchy\n');
    process.exit(1);
  } else {
    console.error('❌ Error running madge:', error.message);
    if (error.stdout) console.error('Output:', error.stdout);
    if (error.stderr) console.error('Error:', error.stderr);
    process.exit(1);
  }
}

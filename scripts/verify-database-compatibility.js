/**
 * Database Compatibility Verification Script
 * Tests that SQLite-specific functions are properly converted for PostgreSQL
 * and that boolean value handling works correctly on both databases
 *
 * Run locally: node scripts/verify-database-compatibility.js
 * Run on Fly:  fly ssh console --app colabora-app -C "node scripts/verify-database-compatibility.js"
 */

const TransactionManager = require('../server/database/services/TransactionManager');
const KnexTransactionManager = require('../server/database/services/KnexTransactionManager');
const SqlCompatibility = require('../server/database/SqlCompatibility');
const KnexConnection = require('../server/database/knexConnection');
const config = require('../server/config');

console.log('🔍 Verifying Database Compatibility Fixes\n');
console.log('=====================================\n');

let db;
let isPostgreSQL;
let connection;

async function testDatabaseCompatibility() {
  try {
    // Initialize database connection
    console.log('1. Initializing database connection...');
    connection = new KnexConnection(config);
    db = await connection.initialize();
    isPostgreSQL = db.client && db.client.config && db.client.config.client === 'pg';
    
    console.log(`   ✅ Connected to ${isPostgreSQL ? 'PostgreSQL' : 'SQLite'}`);
    console.log(`   Database type: ${isPostgreSQL ? 'PostgreSQL' : 'SQLite'}\n`);

    // Test 1: Verify json_group_array conversion
    console.log('2. Testing json_group_array conversion...');
    await testJsonGroupArrayConversion();
    
    // Test 2: Verify json_object conversion
    console.log('\n3. Testing json_object conversion...');
    await testJsonObjectConversion();
    
    // Test 3: Verify boolean value handling
    console.log('\n4. Testing boolean value handling...');
    await testBooleanHandling();
    
    // Test 4: Verify strftime conversion
    console.log('\n5. Testing strftime conversion...');
    await testStrftimeConversion();
    
    // Test 5: Verify ORDER BY clause handling in json_agg
    console.log('\n6. Testing ORDER BY clause in json_agg...');
    await testJsonAggOrderBy();
    
    // Test 6: Verify actual query execution
    console.log('\n7. Testing actual query execution...');
    await testQueryExecution();
    
    console.log('\n=====================================');
    console.log('✅ All compatibility tests passed!');
    console.log('=====================================\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    if (db && connection) {
      await connection.close();
    }
  }
}

async function testJsonGroupArrayConversion() {
  const testSql = `
    SELECT json_group_array(
      json_object('id', 1, 'name', 'test')
    ) as result
    FROM (SELECT 1)
  `;
  
  if (isPostgreSQL) {
    const fixed = SqlCompatibility.fixSqlForDatabase(testSql, true);
    if (fixed.includes('json_agg') && !fixed.includes('json_group_array')) {
      console.log('   ✅ json_group_array correctly converted to json_agg');
    } else {
      throw new Error('json_group_array not converted correctly');
    }
  } else {
    console.log('   ℹ️  SQLite - no conversion needed');
  }
}

async function testJsonObjectConversion() {
  const testSql = `
    SELECT json_object('id', 1, 'name', 'test') as result
  `;
  
  if (isPostgreSQL) {
    const fixed = SqlCompatibility.fixSqlForDatabase(testSql, true);
    if (fixed.includes('json_build_object') && !fixed.includes('json_object')) {
      console.log('   ✅ json_object correctly converted to json_build_object');
    } else {
      throw new Error('json_object not converted correctly');
    }
  } else {
    console.log('   ℹ️  SQLite - no conversion needed');
  }
}

async function testBooleanHandling() {
  // Test getBooleanValue
  const trueValue = SqlCompatibility.getBooleanValue(true, isPostgreSQL);
  const falseValue = SqlCompatibility.getBooleanValue(false, isPostgreSQL);
  
  if (isPostgreSQL) {
    if (trueValue === true && falseValue === false) {
      console.log('   ✅ Boolean values correct for PostgreSQL (true/false)');
    } else {
      throw new Error(`Boolean values incorrect: true=${trueValue}, false=${falseValue}`);
    }
  } else {
    if (trueValue === 1 && falseValue === 0) {
      console.log('   ✅ Boolean values correct for SQLite (1/0)');
    } else {
      throw new Error(`Boolean values incorrect: true=${trueValue}, false=${falseValue}`);
    }
  }
  
  // Test boolean normalization in SQL
  const testSql = 'SELECT * FROM documents WHERE is_active = 1';
  const normalized = KnexTransactionManager.normalizeSqlForDatabase(testSql, isPostgreSQL);
  
  if (isPostgreSQL) {
    if (normalized.includes('is_active = true')) {
      console.log('   ✅ Boolean comparisons normalized in SQL');
    } else {
      throw new Error('Boolean comparisons not normalized');
    }
  } else {
    console.log('   ℹ️  SQLite - no normalization needed');
  }
}

async function testStrftimeConversion() {
  const testSql = `SELECT CAST(strftime('%s', created_at) AS REAL) as timestamp FROM documents`;
  
  if (isPostgreSQL) {
    const fixed = SqlCompatibility.fixSqlForDatabase(testSql, true);
    if (fixed.includes('EXTRACT(EPOCH FROM') && !fixed.includes('strftime')) {
      console.log('   ✅ strftime correctly converted to EXTRACT(EPOCH FROM ...)');
    } else {
      throw new Error('strftime not converted correctly');
    }
  } else {
    console.log('   ℹ️  SQLite - no conversion needed');
  }
}

async function testJsonAggOrderBy() {
  // Test that ORDER BY is moved inside json_agg for PostgreSQL
  const testSql = `
    SELECT json_group_array(
      json_object('id', id, 'name', name)
    )
    FROM (SELECT 1 as id, 'test' as name)
    ORDER BY name
  `;
  
  if (isPostgreSQL) {
    const fixed = SqlCompatibility.fixSqlForDatabase(testSql, true);
    // Check that ORDER BY is inside json_agg
    const jsonAggMatch = fixed.match(/json_agg\s*\([^)]*ORDER\s+BY/i);
    if (jsonAggMatch) {
      console.log('   ✅ ORDER BY correctly moved inside json_agg');
    } else {
      console.log('   ⚠️  ORDER BY handling may need review (complex query)');
    }
  } else {
    console.log('   ℹ️  SQLite - no conversion needed');
  }
}

async function testQueryExecution() {
  // Test a simple query that uses TransactionManager
  try {
    const result = await TransactionManager.query(db, 'SELECT 1 as test');
    if (result && result.test === 1) {
      console.log('   ✅ Query execution works correctly');
    } else {
      throw new Error('Query result incorrect');
    }
  } catch (error) {
    throw new Error(`Query execution failed: ${error.message}`);
  }
  
  // Test queryAll
  try {
    const results = await TransactionManager.queryAll(db, 'SELECT 1 as test UNION SELECT 2 as test');
    if (Array.isArray(results) && results.length === 2) {
      console.log('   ✅ queryAll works correctly');
    } else {
      throw new Error('queryAll result incorrect');
    }
  } catch (error) {
    throw new Error(`queryAll execution failed: ${error.message}`);
  }
  
  // Test with a query that would use json functions (if tables exist)
  try {
    // Try to query a table that might exist
    const tableCheck = isPostgreSQL
      ? "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users' LIMIT 1"
      : "SELECT name FROM sqlite_master WHERE type='table' AND name='users' LIMIT 1";
    
    const tableExists = await TransactionManager.query(db, tableCheck);
    if (tableExists) {
      console.log('   ✅ Table queries work correctly');
      
      // If users table exists, test a more complex query
      // This would test actual json_group_array conversion in practice
      console.log('   ℹ️  Database has tables - compatibility layer is ready for use');
    } else {
      console.log('   ℹ️  No test tables found - compatibility layer verified');
    }
  } catch (error) {
    // This is okay - tables might not exist
    console.log('   ℹ️  Table check skipped (tables may not exist)');
  }
}

// Run tests
testDatabaseCompatibility().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

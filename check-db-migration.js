const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

console.log('🔍 Checking database migration status...\n');

// Database path (same as in server)
const dbPath = process.env.DATABASE_URL || path.join(__dirname, 'colabora.db');

console.log(`📍 Database path: ${dbPath}`);

// Connect to database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to database\n');
});

// Check for required tables
const requiredTables = [
  'organizations',
  'organization_members',
  'organization_votes',
  'vote_ballots',
  'organization_audit',
  'documents'
];

let checksCompleted = 0;
let missingTables = [];

function checkTable(tableName) {
  db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`, (err, row) => {
    if (err) {
      console.error(`❌ Error checking table ${tableName}:`, err.message);
    } else if (!row) {
      console.log(`❌ Table '${tableName}' is missing`);
      missingTables.push(tableName);
    } else {
      console.log(`✅ Table '${tableName}' exists`);
    }

    checksCompleted++;
    if (checksCompleted === requiredTables.length) {
      showResults();
    }
  });
}

function showResults() {
  console.log(`\n📊 Migration Status:`);
  console.log(`- Total tables checked: ${requiredTables.length}`);
  console.log(`- Missing tables: ${missingTables.length}`);

  if (missingTables.length > 0) {
    console.log(`\n⚠️ Missing tables: ${missingTables.join(', ')}`);
    console.log(`\n🔧 To fix this, run the migration script:`);
    console.log(`   node run-migration.js`);

    // Try to create missing tables
    console.log(`\n🔄 Attempting to create missing tables...`);
    createMissingTables();
  } else {
    console.log(`\n🎉 All required tables exist! Database is ready.`);
    db.close();
  }
}

function createMissingTables() {
  // Read migration file
  const migrationPath = path.join(__dirname, 'migration-organizations.sql');

  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    db.close();
    return;
  }

  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  // Split into individual statements
  const statements = migrationSQL
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

  console.log(`📋 Found ${statements.length} migration statements to execute`);

  let completedStatements = 0;
  let errors = [];

  function executeNext() {
    if (completedStatements >= statements.length) {
      console.log('\n✅ Database migration completed!');
      if (errors.length > 0) {
        console.log(`⚠️ ${errors.length} statements had errors (may be expected for existing tables)`);
      }
      db.close();
      return;
    }

    const statement = statements[completedStatements];
    console.log(`🔄 Executing statement ${completedStatements + 1}/${statements.length}`);

    db.run(statement, (err) => {
      if (err) {
        // Some errors are expected (like "table already exists")
        if (err.message.includes('already exists')) {
          console.log(`⚠️ Statement ${completedStatements + 1} skipped (table exists)`);
        } else {
          console.error(`❌ Migration statement ${completedStatements + 1} failed:`, err.message);
          errors.push({
            statement: completedStatements + 1,
            error: err.message
          });
        }
      } else {
        console.log(`✅ Statement ${completedStatements + 1} completed`);
      }

      completedStatements++;
      executeNext();
    });
  }

  executeNext();
}

// Start checking tables
requiredTables.forEach(tableName => {
  checkTable(tableName);
});

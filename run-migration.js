const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

console.log('🔄 Running database migration for organization features...\n');

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

// Read migration file
const migrationPath = path.join(__dirname, 'migration-organizations.sql');

if (!fs.existsSync(migrationPath)) {
  console.error(`❌ Migration file not found: ${migrationPath}`);
  db.close();
  process.exit(1);
}

const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

// Split into individual statements
const statements = migrationSQL
  .split(';')
  .map(stmt => stmt.trim())
  .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

console.log(`📋 Found ${statements.length} migration statements to execute\n`);

let completedStatements = 0;
let errors = [];

// Execute statements sequentially
function executeNext() {
  if (completedStatements >= statements.length) {
    console.log('\n✅ Database migration completed!');
    console.log(`📊 Results:`);
    console.log(`- Statements executed: ${completedStatements}`);
    console.log(`- Errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log(`\n⚠️ Errors (some may be expected for existing tables):`);
      errors.forEach(err => {
        console.log(`  ${err.statement}: ${err.error}`);
      });
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
          sql: statement.substring(0, 100) + '...',
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

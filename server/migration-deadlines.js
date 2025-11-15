// Database migration to add deadline and status fields to documents table
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../colabora.db');
const db = new sqlite3.Database(dbPath);

console.log('Running database migration for document deadlines...');

const migrations = [
  `ALTER TABLE documents ADD COLUMN voting_deadline DATETIME`,
  `ALTER TABLE documents ADD COLUMN status_deadline DATETIME`,
  `ALTER TABLE documents ADD COLUMN deadline_extensions INTEGER DEFAULT 0`,
  `ALTER TABLE documents ADD COLUMN max_extensions INTEGER DEFAULT 3`,
  `ALTER TABLE documents ADD COLUMN hierarchy_level INTEGER DEFAULT 1 CHECK(hierarchy_level BETWEEN 1 AND 3)`,
  `ALTER TABLE documents ADD COLUMN sort_order INTEGER DEFAULT 0`,
  // Add document-level voting table
  `CREATE TABLE IF NOT EXISTS document_votes (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    vote TEXT CHECK(vote IN ('PRO', 'NEUTRAL', 'CONTRA')) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(document_id, user_id)
  )`
];

let completed = 0;
const total = migrations.length;

function runNextMigration() {
  if (completed >= total) {
    console.log('✅ All migrations completed successfully');
    db.close();
    return;
  }

  const sql = migrations[completed];
  console.log(`Running migration ${completed + 1}/${total}: ${sql.split(' ')[2]}...`);

  db.run(sql, (err) => {
    if (err) {
      // Ignore "duplicate column name" errors - column might already exist
      if (err.message.includes('duplicate column name') || err.message.includes('already exists')) {
        console.log(`⚠️  Column/table already exists, skipping: ${sql.split(' ')[2]}`);
      } else {
        console.error('❌ Migration failed:', err.message);
        db.close();
        process.exit(1);
      }
    } else {
      console.log(`✅ Migration ${completed + 1} completed`);
    }

    completed++;
    runNextMigration();
  });
}

runNextMigration();

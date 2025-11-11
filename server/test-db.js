const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Test database connection
console.log('Testing database connection...');

const dbPath = path.join(__dirname, '../colabora.db');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }

  console.log('✅ Database connection successful');

  // Test if our new tables exist
  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'organization%'", (err, rows) => {
    if (err) {
      console.error('Error checking tables:', err);
      db.close();
      return;
    }

    console.log('Organization tables found:', rows.map(r => r.name));

    // Test a simple query
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
      if (err) {
        console.error('Error querying users:', err);
      } else {
        console.log('✅ Users table has', row.count, 'records');
      }

      db.close();
      console.log('✅ Database test completed');
    });
  });
});

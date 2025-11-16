const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./colabora.db');

console.log('Checking database schemas...\n');

// Check organizations table
db.all("PRAGMA table_info(organizations)", [], (err, rows) => {
  if (err) {
    console.error('Error getting organizations schema:', err);
  } else {
    console.log('Organizations table schema:');
    rows.forEach(row => {
      console.log(`  ${row.name}: ${row.type}`);
    });
  }

  // Check documents table
  db.all("PRAGMA table_info(documents)", [], (err, rows) => {
    if (err) {
      console.error('Error getting documents schema:', err);
    } else {
      console.log('\nDocuments table schema:');
      rows.forEach(row => {
        console.log(`  ${row.name}: ${row.type}`);
      });
    }
    db.close();
  });
});
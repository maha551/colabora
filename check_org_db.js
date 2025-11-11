const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'server', 'colabora.db');
const db = new sqlite3.Database(dbPath);

console.log('Checking organization tables...');
db.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%organization%'", (err, tables) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    return;
  }

  console.log('Organization-related tables:');
  tables.forEach(table => {
    console.log('  -', table.name);
  });

  if (tables.length === 0) {
    console.log('❌ No organization tables found - this explains the 500 error!');
    console.log('Need to run database migrations to create organization tables');
  } else {
    console.log('✅ Organization tables exist');
  }

  db.close();
});

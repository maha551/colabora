const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'colabora.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    return;
  }

  console.log('All tables:');
  tables.forEach(table => {
    console.log('  -', table.name);
  });

  const orgTables = tables.filter(t => t.name.includes('organization'));
  console.log('\nOrganization tables:', orgTables.length);

  if (orgTables.length === 0) {
    console.log('❌ No organization tables found!');
  }

  db.close();
});

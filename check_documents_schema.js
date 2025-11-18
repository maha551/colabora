const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./colabora.db');

db.all("PRAGMA table_info(documents)", (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Documents table schema:');
    rows.forEach(row => {
      console.log(`- ${row.name}: ${row.type}${row.notnull ? ' NOT NULL' : ''}${row.dflt_value ? ' DEFAULT ' + row.dflt_value : ''}`);
    });
  }
  db.close();
});

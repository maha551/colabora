const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./colabora.db');

db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Existing tables:');
    rows.forEach(row => console.log('- ' + row.name));
  }
  db.close();
});

const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./colabora.db');

console.log('Checking and updating database schema...');

// Add role column if it doesn't exist
db.run('ALTER TABLE users ADD COLUMN role TEXT DEFAULT \'user\'', (err) => {
  if (err && !err.message.includes('duplicate column name')) {
    console.error('Error adding role column:', err);
  } else {
    console.log('✅ Role column added/ensured');
  }

  // Check schema
  db.all("PRAGMA table_info(users)", (err, cols) => {
    if (err) {
      console.error('Error checking users table:', err);
    } else {
      console.log('Users table columns:', cols.map(c => c.name));
    }

    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
      if (err) {
        console.error('Error getting tables:', err);
      } else {
        console.log('Tables:', tables.map(t => t.name));
      }
      db.close();
    });
  });
});

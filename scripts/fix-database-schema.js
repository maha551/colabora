const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../server/colabora.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Fixing database schema...');

// Add missing columns
const columnsToAdd = [
  { name: 'password_hash', sql: 'ALTER TABLE users ADD COLUMN password_hash TEXT' },
  { name: 'role', sql: 'ALTER TABLE users ADD COLUMN role TEXT DEFAULT "user"' }
];

let completed = 0;
const total = columnsToAdd.length;

columnsToAdd.forEach(({ name, sql }) => {
  db.run(sql, (err) => {
    if (err) {
      if (err.message.includes('duplicate column')) {
        console.log(`✅ Column '${name}' already exists`);
      } else {
        console.error(`❌ Error adding column '${name}':`, err.message);
      }
    } else {
      console.log(`✅ Added column '${name}'`);
    }
    
    completed++;
    if (completed === total) {
      // Verify all columns exist
      db.all('PRAGMA table_info(users)', (err, rows) => {
        if (err) {
          console.error('❌ Error checking table:', err);
          db.close();
          process.exit(1);
        }
        
        const columns = rows.map(r => r.name);
        console.log('\n📊 Current users table columns:');
        console.log(columns.join(', '));
        
        const required = ['id', 'name', 'email', 'password_hash', 'avatar', 'bio', 'role', 'created_at', 'updated_at'];
        const missing = required.filter(col => !columns.includes(col));
        
        if (missing.length > 0) {
          console.log('\n❌ Missing columns:', missing.join(', '));
          db.close();
          process.exit(1);
        } else {
          console.log('\n✅ All required columns exist!');
          db.close();
          process.exit(0);
        }
      });
    }
  });
});


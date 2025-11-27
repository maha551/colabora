const sqlite3 = require('sqlite3');
const path = require('path');
const { hashPassword } = require('../server/middleware/auth');

// Use the root database file (where server actually looks)
const dbPath = path.join(__dirname, '../colabora.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Fixing root database (colabora.db)...');
console.log('Database path:', dbPath);

// Demo users
const demoUsers = [
  { id: 'cmgxlfj9z0000orjgnfy3revt', name: 'Alice Johnson', email: 'alice@example.com', password: 'SecurePass123!', role: 'user' },
  { id: 'cmgxlfj9z0000orjgnfy3revu', name: 'Bob Smith', email: 'bob@example.com', password: 'SecurePass123!', role: 'user' },
  { id: 'cmgxlfj9z0000orjgnfy3revv', name: 'Charlie Brown', email: 'charlie@example.com', password: 'SecurePass123!', role: 'user' },
  { id: 'cmgxlfj9z0000orjgnfy3revw', name: 'Diana Prince', email: 'diana@example.com', password: 'SecurePass123!', role: 'user' },
  { id: 'admin-user-001', name: 'Colabora Admin', email: 'admin@colabora.local', password: 'AdminSecurePass123!', role: 'admin' }
];

async function fixDatabase() {
  return new Promise((resolve, reject) => {
    // Step 1: Add missing columns
    console.log('\n📋 Adding missing columns...');
    
    db.run('ALTER TABLE users ADD COLUMN bio TEXT', (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('❌ Error adding bio:', err.message);
      } else {
        console.log('✅ bio column OK');
      }
      
      // Step 2: Delete all existing users
      console.log('\n🗑️  Clearing existing users...');
      db.run('DELETE FROM users', (err) => {
        if (err) {
          console.error('❌ Error deleting users:', err);
          reject(err);
          return;
        }
        console.log('✅ Cleared existing users');
        
        // Step 3: Create demo users
        console.log('\n👥 Creating demo users...');
        let completed = 0;
        const total = demoUsers.length;
        
        demoUsers.forEach(async (userData) => {
          try {
            const hashedPassword = await hashPassword(userData.password);
            
            db.run(
              'INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
              [userData.id, userData.name, userData.email, hashedPassword, userData.role],
              function(err) {
                if (err) {
                  console.error(`❌ Error creating user ${userData.name}:`, err.message);
                } else {
                  console.log(`✅ Created user: ${userData.name} (${userData.email}) - ${userData.role}`);
                }
                
                completed++;
                if (completed === total) {
                  console.log('\n🎉 Database setup complete!');
                  console.log('\n👥 DEMO USER CREDENTIALS:');
                  demoUsers.forEach(user => {
                    console.log(`   ${user.name}: ${user.email} / ${user.password}`);
                  });
                  console.log('');
                  db.close();
                  resolve();
                }
              }
            );
          } catch (error) {
            console.error(`❌ Error hashing password for ${userData.name}:`, error);
            completed++;
            if (completed === total) {
              db.close();
              reject(error);
            }
          }
        });
      });
    });
  });
}

fixDatabase().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});


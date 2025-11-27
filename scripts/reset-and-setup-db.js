const sqlite3 = require('sqlite3');
const path = require('path');
const { hashPassword } = require('../server/middleware/auth');

const dbPath = path.join(__dirname, '../server/colabora.db');
const db = new sqlite3.Database(dbPath);

console.log('🔄 Resetting and setting up database...');

// Demo users
const demoUsers = [
  { id: 'cmgxlfj9z0000orjgnfy3revt', name: 'Alice Johnson', email: 'alice@example.com', password: 'SecurePass123!', role: 'user' },
  { id: 'cmgxlfj9z0000orjgnfy3revu', name: 'Bob Smith', email: 'bob@example.com', password: 'SecurePass123!', role: 'user' },
  { id: 'cmgxlfj9z0000orjgnfy3revv', name: 'Charlie Brown', email: 'charlie@example.com', password: 'SecurePass123!', role: 'user' },
  { id: 'cmgxlfj9z0000orjgnfy3revw', name: 'Diana Prince', email: 'diana@example.com', password: 'SecurePass123!', role: 'user' },
  { id: 'admin-user-001', name: 'Colabora Admin', email: 'admin@colabora.local', password: 'AdminSecurePass123!', role: 'admin' }
];

async function setupDatabase() {
  return new Promise((resolve, reject) => {
    // Delete all existing users
    db.run('DELETE FROM users', (err) => {
      if (err) {
        console.error('Error deleting users:', err);
        reject(err);
        return;
      }
      console.log('✅ Cleared existing users');
      
      // Create demo users
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
}

setupDatabase().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});


const sqlite3 = require('sqlite3');
const path = require('path');
const { verifyPassword } = require('../server/middleware/auth');

const dbPath = path.join(__dirname, '../server/colabora.db');
const db = new sqlite3.Database(dbPath);

const email = 'alice@example.com';
const password = 'SecurePass123!';

console.log('🧪 Testing login logic...');

// Test 1: Check if user exists
db.get('SELECT id, name, email, password_hash, avatar, COALESCE(bio, "") as bio, role FROM users WHERE email = ?', [email], async (err, user) => {
  if (err) {
    console.error('❌ Database error:', err);
    db.close();
    process.exit(1);
  }

  if (!user) {
    console.error('❌ User not found');
    db.close();
    process.exit(1);
  }

  console.log('✅ User found:', user.name);
  console.log('   Email:', user.email);
  console.log('   Role:', user.role);
  console.log('   Has password_hash:', !!user.password_hash);

  // Test 2: Verify password
  try {
    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (isValidPassword) {
      console.log('✅ Password verification: SUCCESS');
    } else {
      console.log('❌ Password verification: FAILED');
    }
  } catch (error) {
    console.error('❌ Password verification error:', error);
  }

  db.close();
});


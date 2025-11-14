const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { hashPassword } = require('../server/middleware/auth');

console.log('🔧 Setting up demo users for Colabora...');

// Database path - use same path as production
const dbPath = process.env.DATABASE_URL ?
  (process.env.DATABASE_URL.startsWith('sqlite:///') ?
    process.env.DATABASE_URL.replace('sqlite:///', '') :
    process.env.DATABASE_URL) :
  path.join(__dirname, '../colabora.db');

const db = new sqlite3.Database(dbPath);

// Demo users data
const demoUsers = [
  { id: 'cmgxlfj9z0000orjgnfy3revt', name: 'Alice Johnson', email: 'alice@example.com', password: 'SecurePass123!' },
  { id: 'cmgxlfj9z0000orjgnfy3revu', name: 'Bob Smith', email: 'bob@example.com', password: 'SecurePass123!' },
  { id: 'cmgxlfj9z0000orjgnfy3revv', name: 'Charlie Brown', email: 'charlie@example.com', password: 'SecurePass123!' },
  { id: 'cmgxlfj9z0000orjgnfy3revw', name: 'Diana Prince', email: 'diana@example.com', password: 'SecurePass123!' }
];

// Database initialization function
async function initializeDatabase(db) {
  console.log('📊 Ensuring database schema exists for demo users...');

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Create users table (if not exists)
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      avatar TEXT,
      bio TEXT,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  // Execute table creation sequentially
  for (const sql of tables) {
    await new Promise((resolve, reject) => {
      db.run(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Ensure role column exists (migration)
  await new Promise((resolve) => {
    db.run('ALTER TABLE users ADD COLUMN role TEXT DEFAULT \'user\'', (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding role column:', err);
      }
      resolve();
    });
  });

  console.log('✅ Database schema ready for demo users');
}

async function setupDemoUsers() {
  try {
    // Initialize database schema first
    await initializeDatabase(db);

    console.log('🔍 Checking existing demo users...');

    // Check which demo users already exist
    const existingUsers = [];
    for (const user of demoUsers) {
      const existing = await new Promise((resolve, reject) => {
        db.get('SELECT id, name, email FROM users WHERE email = ?', [user.email], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      if (existing) {
        existingUsers.push(existing);
        console.log(`⚠️  Demo user already exists: ${existing.name} (${existing.email})`);
      }
    }

    if (existingUsers.length === demoUsers.length) {
      console.log('ℹ️  All demo users already exist. Nothing to do.');
      return;
    }

    // Create missing demo users
    for (const userData of demoUsers) {
      // Check if this user already exists
      const existing = existingUsers.find(u => u.email === userData.email);
      if (existing) continue;

      console.log(`Creating demo user: ${userData.name} (${userData.email})`);

      const hashedPassword = await hashPassword(userData.password);

      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
          [userData.id, userData.name, userData.email, hashedPassword, 'user'],
          function(err) {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      console.log(`✅ Created demo user: ${userData.name}`);
    }

    console.log('');
    console.log('🎉 Demo users setup complete!');
    console.log('');
    console.log('👥 DEMO USER CREDENTIALS:');
    demoUsers.forEach(user => {
      console.log(`   ${user.name}: ${user.email} / ${user.password}`);
    });
    console.log('');
    console.log('🚀 You can now log in with any of these demo accounts!');

  } catch (error) {
    console.error('❌ Error setting up demo users:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

setupDemoUsers();

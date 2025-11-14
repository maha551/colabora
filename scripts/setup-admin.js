const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { hashPassword } = require('../server/middleware/auth');

console.log('🔧 Setting up admin user for Colabora...');

// Database path - use same path as production
const dbPath = process.env.DATABASE_URL ?
  (process.env.DATABASE_URL.startsWith('sqlite:///') ?
    process.env.DATABASE_URL.replace('sqlite:///', '') :
    process.env.DATABASE_URL) :
  path.join(__dirname, '../colabora.db');

const db = new sqlite3.Database(dbPath);

// Database initialization function
async function initializeDatabase(db) {
  console.log('📊 Initializing database schema for admin setup...');

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Create users table first (needed for admin user)
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

  console.log('✅ Database schema initialized for admin setup');
}

async function setupAdmin() {
  try {
    // Initialize database schema first
    await initializeDatabase(db);

    // Now check if admin user already exists
    const existingAdmin = await new Promise((resolve, reject) => {
      db.get('SELECT id, name, email FROM users WHERE role = ?', ['admin'], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (existingAdmin) {
      console.log('⚠️  Admin user already exists:', existingAdmin);
      console.log('   Name:', existingAdmin.name);
      console.log('   Email:', existingAdmin.email);
      console.log('   ID:', existingAdmin.id);
      console.log('');
      console.log('If you need to reset the admin user, delete it from the database first.');
      return;
    }

    // Create admin user
    const adminData = {
      id: require('uuid').v4(),
      name: 'Colabora Admin',
      email: 'admin@colabora.local',
      password: 'AdminSecurePass123!',
      role: 'admin'
    };

    console.log('Creating admin user...');
    console.log('Name:', adminData.name);
    console.log('Email:', adminData.email);
    console.log('ID:', adminData.id);

    const hashedPassword = await hashPassword(adminData.password);

    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
        [adminData.id, adminData.name, adminData.email, hashedPassword, adminData.role],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    console.log('');
    console.log('✅ Admin user created successfully!');
    console.log('');
    console.log('🔐 LOGIN CREDENTIALS:');
    console.log('   Email: admin@colabora.local');
    console.log('   Password: AdminSecurePass123!');
    console.log('');
    console.log('⚠️  IMPORTANT SECURITY NOTES:');
    console.log('   1. Change the default password immediately after first login');
    console.log('   2. Set SESSION_SECRET and JWT_SECRET environment variables');
    console.log('   3. Use strong, unique secrets in production');
    console.log('   4. Consider enabling 2FA for admin accounts');
    console.log('');
    console.log('🚀 Admin user is ready for organization setup!');

  } catch (error) {
    console.error('❌ Error setting up admin user:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

setupAdmin();

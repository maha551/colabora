/**
 * Explicit admin setup script.
 * Requires credentials from environment variables.
 */

require('dotenv').config();

const knex = require('knex');
const UserService = require('../server/database/services/UserService');
const { hashPassword } = require('../server/middleware/auth');

const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_SETUP_EMAIL = process.env.ADMIN_SETUP_EMAIL;
const ADMIN_SETUP_PASSWORD = process.env.ADMIN_SETUP_PASSWORD;
const ADMIN_SETUP_NAME = process.env.ADMIN_SETUP_NAME || 'Colabora Admin';

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  process.exit(1);
}

if (!ADMIN_SETUP_EMAIL || !ADMIN_SETUP_PASSWORD) {
  console.error('ERROR: ADMIN_SETUP_EMAIL and ADMIN_SETUP_PASSWORD are required.');
  process.exit(1);
}

if (ADMIN_SETUP_PASSWORD.length < 12) {
  console.error('ERROR: ADMIN_SETUP_PASSWORD must be at least 12 characters.');
  process.exit(1);
}

const isPostgreSQL = DATABASE_URL.startsWith('postgresql://') || DATABASE_URL.startsWith('postgres://');
const isSQLite = DATABASE_URL.endsWith('.db') || DATABASE_URL.startsWith('sqlite:///') || DATABASE_URL.startsWith('./');

let dbConfig;
if (isPostgreSQL) {
  dbConfig = { client: 'pg', connection: DATABASE_URL };
} else if (isSQLite) {
  const dbPath = DATABASE_URL.startsWith('sqlite:///')
    ? DATABASE_URL.replace('sqlite:///', '')
    : DATABASE_URL;
  dbConfig = { client: 'better-sqlite3', connection: { filename: dbPath } };
} else {
  dbConfig = { client: 'better-sqlite3', connection: { filename: DATABASE_URL } };
}

const db = knex(dbConfig);

async function setupAdmin() {
  try {
    await db.raw('SELECT 1');

    const existingByEmail = await UserService.findByEmail(db, ADMIN_SETUP_EMAIL);
    const anyAdmin = await db('users').where('role', 'admin').first();
    if (existingByEmail || anyAdmin) {
      const admin = existingByEmail || anyAdmin;
      console.log('Admin user already exists.');
      console.log(`Existing admin email: ${admin.email}`);
      return;
    }

    const passwordHash = await hashPassword(ADMIN_SETUP_PASSWORD);
    const userId = await UserService.create(db, {
      name: ADMIN_SETUP_NAME,
      email: ADMIN_SETUP_EMAIL,
      passwordHash,
      role: 'admin'
    });

    console.log(`Admin user created: ${ADMIN_SETUP_EMAIL}`);
    console.log(`User ID: ${userId}`);
  } catch (error) {
    console.error(`Admin setup failed: ${error.message}`);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

setupAdmin().catch(error => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});

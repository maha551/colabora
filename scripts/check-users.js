/**
 * Quick script to check users in database
 */
require('dotenv').config();
const knex = require('knex');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const isPostgreSQL = DATABASE_URL.startsWith('postgresql://') || DATABASE_URL.startsWith('postgres://');
const db = knex({
  client: isPostgreSQL ? 'pg' : 'better-sqlite3',
  connection: isPostgreSQL ? DATABASE_URL : { filename: DATABASE_URL },
  pool: { min: 1, max: 1 }
});

async function checkUsers() {
  try {
    const users = await db('users').select('email', 'role', 'name', 'created_at');
    console.log(`\nFound ${users.length} users in database:\n`);
    users.forEach(u => {
      console.log(`  - ${u.email} (${u.role}) - ${u.name}`);
    });
    console.log('');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await db.destroy();
  }
}

checkUsers();

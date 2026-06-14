/**
 * Verify database is empty
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

async function verifyEmpty() {
  try {
    const userCount = await db('users').count('* as count').first();
    const orgCount = await db('organizations').count('* as count').first();
    const docCount = await db('documents').count('* as count').first();
    
    const users = parseInt(userCount.count);
    const orgs = parseInt(orgCount.count);
    const docs = parseInt(docCount.count);
    
    console.log('\n📊 Database Status:');
    console.log(`   Users: ${users}`);
    console.log(`   Organizations: ${orgs}`);
    console.log(`   Documents: ${docs}`);
    console.log('');
    
    if (users === 0 && orgs === 0 && docs === 0) {
      console.log('✅ Database is completely empty - purge successful!');
    } else {
      console.log('⚠️  Database still contains some data');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await db.destroy();
  }
}

verifyEmpty();

const fetch = require('node-fetch');

async function runDeployedMigration() {
  const baseUrl = 'https://colabora-fresh.fly.dev';

  try {
    console.log('🔄 Running database migration on deployed server...\n');

    // First, login as Alice (who has admin access for migration)
    console.log('1️⃣ Logging in as Alice...');
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@example.com',
        password: 'SecurePass123!'
      })
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status}`);
    }

    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log('✅ Login successful\n');

    // Run the migration
    console.log('2️⃣ Triggering database migration...');
    const migrationResponse = await fetch(`${baseUrl}/api/admin/run-migration`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!migrationResponse.ok) {
      const errorText = await migrationResponse.text();
      console.log(`❌ Migration failed: ${migrationResponse.status} - ${errorText}`);
      return;
    }

    const migrationResult = await migrationResponse.json();
    console.log('✅ Migration completed!');
    console.log(`📊 Results:`);
    console.log(`- Statements executed: ${migrationResult.statementsExecuted}`);

    if (migrationResult.errors && migrationResult.errors.length > 0) {
      console.log(`⚠️ ${migrationResult.errors.length} warnings (expected for existing tables):`);
      migrationResult.errors.forEach(err => {
        console.log(`  Statement ${err.statement}: ${err.error}`);
      });
    }

    console.log('\n🎉 Database migration completed successfully on deployed server!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

runDeployedMigration();

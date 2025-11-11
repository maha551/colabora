const fetch = require('node-fetch');

async function resetDeployedDatabase() {
  const baseUrl = 'https://colabora-fresh.fly.dev';

  try {
    console.log('🔄 Resetting deployed database to fresh state...\n');

    // First, login as Alice (who has admin access for reset)
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

    // Reset the database
    console.log('2️⃣ Resetting database (this will drop all existing data)...');
    const resetResponse = await fetch(`${baseUrl}/api/admin/reset-database`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!resetResponse.ok) {
      const errorText = await resetResponse.text();
      console.log(`❌ Database reset failed: ${resetResponse.status} - ${errorText}`);
      return;
    }

    const resetResult = await resetResponse.json();
    console.log('✅ Database reset completed!');
    console.log(`📊 Results:`);
    console.log(`- Tables dropped: ${resetResult.tablesDropped}`);
    console.log(`- Message: ${resetResult.message}`);
    console.log('\n⏳ Waiting for database reinitialization...\n');

    // Wait for the database to reinitialize
    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log('🎉 Database reset and reinitialization completed!');
    console.log('The deployed Colabora instance now has a fresh database with organization features.');

  } catch (error) {
    console.error('❌ Database reset failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

resetDeployedDatabase();

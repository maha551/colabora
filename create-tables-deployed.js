const fetch = require('node-fetch');

async function createTablesDeployed() {
  const baseUrl = 'https://colabora-fresh.fly.dev';

  try {
    console.log('🔄 Creating all tables on deployed server...\n');

    // First, login as Alice (who has admin access)
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

    // Create all tables
    console.log('2️⃣ Creating all database tables...');
    const createResponse = await fetch(`${baseUrl}/api/admin/create-tables`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.log(`❌ Table creation failed: ${createResponse.status} - ${errorText}`);
      return;
    }

    const createResult = await createResponse.json();
    console.log('✅ Tables created successfully!');
    console.log(`📊 Results:`);
    console.log(`- Tables created: ${createResult.tablesCreated}`);
    console.log(`- Users inserted: ${createResult.usersInserted}`);
    console.log(`- Message: ${createResult.message}`);
    console.log('\n🎉 All tables created and demo data inserted!');

  } catch (error) {
    console.error('❌ Table creation failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

createTablesDeployed();

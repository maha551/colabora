const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('/data/colabora.db');

console.log('🔍 Checking ALL users in the deployed database...\n');

db.all('SELECT id, name, email, created_at FROM users ORDER BY created_at DESC', [], (err, users) => {
  if (err) {
    console.error('Error checking users:', err);
    return;
  }

  console.log(`Found ${users.length} users:`);
  users.forEach((user, index) => {
    console.log(`${index + 1}. ${user.name} (${user.email})`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Created: ${user.created_at}`);
    console.log('');
  });

  // Check for users with UUID IDs
  const uuidUsers = users.filter(u => u.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i));
  const simpleIdUsers = users.filter(u => !u.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i));

  console.log('📊 User ID Analysis:');
  console.log(`   UUID-style IDs: ${uuidUsers.length}`);
  console.log(`   Simple IDs: ${simpleIdUsers.length}`);

  if (uuidUsers.length > 0) {
    console.log('\n🚨 Found users with UUID IDs - this explains the login issue!');
    uuidUsers.forEach(user => {
      console.log(`   - ${user.name} (${user.email}) - ID: ${user.id}`);
    });
  }

  // Check alice users specifically
  const aliceUsers = users.filter(u => u.email === 'alice@example.com');
  console.log(`\n👤 Users with alice@example.com: ${aliceUsers.length}`);
  aliceUsers.forEach(user => {
    console.log(`   - ID: ${user.id}, Created: ${user.created_at}`);
  });

  db.close();
});

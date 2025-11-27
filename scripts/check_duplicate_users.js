const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('/data/colabora.db');

console.log('🔍 Checking for duplicate users...\n');

// Check for duplicate emails
db.all('SELECT email, COUNT(*) as count FROM users GROUP BY email HAVING COUNT(*) > 1', [], (err, duplicates) => {
  if (err) {
    console.error('Error checking duplicates:', err);
    return;
  }

  if (duplicates.length > 0) {
    console.log('❌ Found duplicate emails:');
    duplicates.forEach(dup => {
      console.log(`  - ${dup.email}: ${dup.count} users`);
    });
  } else {
    console.log('✅ No duplicate emails found');
  }

  // Check all users with alice email
  db.all('SELECT * FROM users WHERE email = ?', ['alice@example.com'], (err, users) => {
    if (err) {
      console.error('Error checking alice users:', err);
      return;
    }

    console.log(`\n👤 Users with email alice@example.com: ${users.length}`);
    users.forEach(user => {
      console.log(`  - ID: ${user.id}, Name: ${user.name}, Created: ${user.created_at}`);
    });

    // Check if password hashes are different
    if (users.length > 1) {
      console.log('\n🔐 Password hashes:');
      users.forEach((user, index) => {
        console.log(`  User ${index + 1} (${user.id}): ${user.password_hash ? user.password_hash.substring(0, 20) + '...' : 'NULL'}`);
      });
    }

    db.close();
  });
});

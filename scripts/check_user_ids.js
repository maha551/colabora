const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('/data/colabora.db');

console.log('🔍 Checking user IDs in database...\n');

// Check all users
db.all('SELECT id, name, email FROM users ORDER BY name', [], (err, users) => {
  if (err) {
    console.error('Error checking users:', err);
    return;
  }

  console.log('👥 All users in database:');
  users.forEach(user => {
    console.log(`  - ${user.name} (${user.email}) - ID: ${user.id}`);
  });

  // Check if alice@example.com exists
  const alice = users.find(u => u.email === 'alice@example.com');
  if (alice) {
    console.log(`\n✅ Alice Johnson found with ID: ${alice.id}`);

    // Test documents query with Alice's actual ID
    const userId = alice.id;
    console.log(`\n🔍 Testing documents query with Alice's actual ID: ${userId}`);

    const query = `
      SELECT DISTINCT d.*,
             u.name as owner_name,
             u.email as owner_email
      FROM documents d
      LEFT JOIN document_collaborators dc ON d.id = dc.document_id
      LEFT JOIN organizations o ON d.organization_id = o.id
      LEFT JOIN organization_members om ON o.id = om.organization_id AND om.user_id = ? AND om.status = 'active'
      JOIN users u ON d.owner_id = u.id
      WHERE d.owner_id = ?
         OR dc.user_id = ?
         OR (d.ownership_type = 'organizational' AND om.user_id IS NOT NULL)
      ORDER BY d.updated_at DESC
    `;

    db.all(query, [userId, userId, userId], (err, documents) => {
      if (err) {
        console.error('❌ Query error:', err);
      } else {
        console.log(`✅ Query returned ${documents.length} documents for Alice`);
        documents.forEach(doc => {
          console.log(`  - "${doc.title}" (ID: ${doc.id})`);
        });
      }

      db.close();
    });

  } else {
    console.log('\n❌ Alice Johnson not found in database!');
  }
});

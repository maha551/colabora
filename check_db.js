const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./colabora.db');

console.log('Checking database schema...');

// Get all tables
db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
  if (err) {
    console.error('Error:', err);
    return;
  }

  console.log('\nTables found:');
  rows.forEach(row => {
    console.log(`- ${row.name}`);
  });

  // Check organizations table
  if (rows.some(r => r.name === 'organizations')) {
    console.log('\nChecking organizations table...');
    db.all("SELECT id, name, description, representatives FROM organizations LIMIT 5", [], (err, orgs) => {
      if (err) {
        console.error('Error getting organizations:', err);
      } else {
        console.log(`Found ${orgs.length} organizations:`);
        orgs.forEach(org => {
          console.log(`  - ${org.name} (${org.id}): ${org.description || 'No description'}`);
          console.log(`    Reps: ${org.representatives ? JSON.parse(org.representatives).length : 0}`);
        });
      }

      // Check documents table
      if (rows.some(r => r.name === 'documents')) {
        console.log('\nChecking documents table...');
        db.all("SELECT id, title, organization_id, parent_id FROM documents LIMIT 10", [], (err, docs) => {
          if (err) {
            console.error('Error getting documents:', err);
          } else {
            console.log(`Found ${docs.length} documents:`);
            docs.forEach(doc => {
              console.log(`  - ${doc.title} (${doc.id})`);
              console.log(`    Org: ${doc.organization_id || 'Personal'}, Parent: ${doc.parent_id || 'None'}`);
            });
          }
          db.close();
        });
      } else {
        db.close();
      }
    });
  } else {
    console.log('No organizations table found');
    db.close();
  }
});
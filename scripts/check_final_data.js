const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('/data/colabora.db');

console.log('🔍 Checking final database state...\n');

Promise.all([
  new Promise(resolve => db.get('SELECT COUNT(*) as count FROM users', (err, row) => resolve(row?.count || 0))),
  new Promise(resolve => db.get('SELECT COUNT(*) as count FROM documents', (err, row) => resolve(row?.count || 0))),
  new Promise(resolve => db.get('SELECT COUNT(*) as count FROM organizations', (err, row) => resolve(row?.count || 0))),
  new Promise(resolve => db.get('SELECT COUNT(*) as count FROM paragraphs', (err, row) => resolve(row?.count || 0))),
  new Promise(resolve => db.get('SELECT COUNT(*) as count FROM proposals WHERE approved = 1', (err, row) => resolve(row?.count || 0))),
]).then(([users, docs, orgs, paras, proposals]) => {
  console.log(`👥 Users: ${users}`);
  console.log(`📄 Documents: ${docs}`);
  console.log(`🏢 Organizations: ${orgs}`);
  console.log(`📝 Paragraphs: ${paras}`);
  console.log(`✅ Approved Proposals: ${proposals}`);

  if (users === 0) {
    console.log('\n❌ NO DATA FOUND - Database is empty!');
    console.log('Need to reseed the database with demo data.');
  } else if (docs === 0) {
    console.log('\n⚠️ Users exist but no documents found.');
    console.log('Need to create demo documents.');
  } else {
    console.log('\n✅ Database has data.');

    // Check document details
    db.all('SELECT d.*, u.name as owner_name FROM documents d JOIN users u ON d.owner_id = u.id', [], (err, docs) => {
      if (err) {
        console.error('Error getting documents:', err);
      } else {
        console.log('\n📋 Documents:');
        docs.forEach(doc => {
          console.log(`  - "${doc.title}" by ${doc.owner_name} (${doc.owner_id})`);
        });
      }
      db.close();
    });
  }
}).catch(err => {
  console.error('❌ Database error:', err);
  db.close();
});

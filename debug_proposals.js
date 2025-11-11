const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DATABASE_URL || path.join(__dirname, 'colabora.db');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }

  console.log('Connected to database successfully');

  // Check if structure_proposals table exists
  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='structure_proposals'", (err, tables) => {
    if (err) {
      console.error('Error checking tables:', err);
      db.close();
      return;
    }

    if (tables.length === 0) {
      console.log('❌ structure_proposals table does not exist');
      db.close();
      return;
    }

    console.log('✅ structure_proposals table exists');

    // Check for active proposals
    db.all("SELECT id, title, applied, created_at FROM structure_proposals WHERE applied = 0", (err, proposals) => {
      if (err) {
        console.error('Error querying proposals:', err);
        db.close();
        return;
      }

      console.log('Active proposals found:', proposals.length);
      if (proposals.length > 0) {
        console.log('Active proposals:');
        proposals.forEach(p => {
          console.log('  - ID:', p.id, 'Title:', p.title, 'Applied:', p.applied, 'Created:', p.created_at);
        });
      } else {
        console.log('✅ No active proposals found');
      }

      // Also check total proposals
      db.get("SELECT COUNT(*) as total FROM structure_proposals", (err, result) => {
        if (err) {
          console.error('Error counting total proposals:', err);
        } else {
          console.log('Total proposals in database:', result.total);
        }
        db.close();
      });
    });
  });
});

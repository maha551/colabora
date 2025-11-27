/**
 * Migration to create organization_representatives table
 * Representatives are currently stored as JSON in organizations.representatives
 * This table will allow proper querying and indexing
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('../config');

const dbPath = config.DATABASE_URL || path.join(__dirname, '../../colabora.db');
const db = new sqlite3.Database(dbPath);

console.log('Creating organization_representatives table...\n');

// Create the table
db.run(`CREATE TABLE IF NOT EXISTS organization_representatives (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT CHECK(status IN ('active', 'inactive', 'removed')) DEFAULT 'active',
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  removed_at DATETIME,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(organization_id, user_id)
)`, (err) => {
  if (err) {
    if (err.message.includes('already exists')) {
      console.log('⚠️  Table organization_representatives already exists');
    } else {
      console.error('❌ Error creating table:', err);
      db.close();
      process.exit(1);
    }
  } else {
    console.log('✅ Table organization_representatives created');
  }

  // Migrate existing data from JSON column
  console.log('\nMigrating representatives from JSON column to table...');
  
  db.all('SELECT id, representatives FROM organizations', [], (err, orgs) => {
    if (err) {
      console.error('❌ Error fetching organizations:', err);
      db.close();
      process.exit(1);
    }

    if (!orgs || orgs.length === 0) {
      console.log('⚠️  No organizations found to migrate');
      db.close();
      return;
    }

    let migrated = 0;
    let total = 0;

    orgs.forEach(org => {
      try {
        const representatives = JSON.parse(org.representatives || '[]');
        total += representatives.length;

        representatives.forEach((userId, index) => {
          const repId = require('uuid').v4();
          db.run(`INSERT OR IGNORE INTO organization_representatives 
                  (id, organization_id, user_id, status, added_at) 
                  VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
            [repId, org.id, userId], (insertErr) => {
            if (insertErr) {
              if (!insertErr.message.includes('UNIQUE constraint')) {
                console.error(`❌ Error migrating rep ${userId} for org ${org.id}:`, insertErr.message);
              }
            } else {
              migrated++;
            }

            // Check if we're done
            if (migrated + (total - migrated) === total) {
              console.log(`✅ Migrated ${migrated} representatives from ${orgs.length} organizations`);
              db.close();
            }
          });
        });

        // If no representatives, we're done with this org
        if (representatives.length === 0) {
          total--;
        }
      } catch (parseErr) {
        console.error(`❌ Error parsing representatives for org ${org.id}:`, parseErr.message);
      }
    });

    if (total === 0) {
      console.log('⚠️  No representatives found to migrate');
      db.close();
    }
  });
});


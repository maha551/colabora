/**
 * Database Migration for Organization Branding
 * Adds branding fields (color, logo, title) to organizations table
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('../config');

const dbPath = config.DATABASE_URL || path.join(__dirname, '../../colabora.db');
const db = new sqlite3.Database(dbPath);

console.log('Running database migration for organization branding...');

// Helper function to generate random professional color
function generateDefaultBrandingColor() {
  const colors = [
    '#3B82F6', '#10B981', '#8B5CF6', '#06B6D4',
    '#F59E0B', '#EF4444', '#6366F1', '#14B8A6'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

const migrations = [
  // Add branding columns to organizations table
  `ALTER TABLE organizations ADD COLUMN branding_color TEXT`,
  `ALTER TABLE organizations ADD COLUMN branding_logo_url TEXT`,
  `ALTER TABLE organizations ADD COLUMN branding_title TEXT`
];

let completed = 0;
const total = migrations.length;

function runNextMigration() {
  if (completed >= total) {
    console.log('✅ All migrations completed successfully');
    
    // Set default colors for existing organizations
    console.log('Setting default colors for existing organizations...');
    
    db.all('SELECT id FROM organizations WHERE branding_color IS NULL', [], (err, orgs) => {
      if (err) {
        console.error('Error fetching organizations:', err.message);
        db.close();
        return;
      }

      if (orgs.length === 0) {
        console.log('No organizations need default colors');
        db.close();
        return;
      }

      let updated = 0;
      const totalOrgs = orgs.length;

      orgs.forEach((org) => {
        const defaultColor = generateDefaultBrandingColor();
        db.run(
          'UPDATE organizations SET branding_color = ? WHERE id = ?',
          [defaultColor, org.id],
          function(updateErr) {
            if (updateErr) {
              console.error(`Error updating organization ${org.id}:`, updateErr.message);
            } else {
              updated++;
              if (updated === totalOrgs) {
                console.log(`✅ Set default colors for ${updated} organization(s)`);
                db.close();
              }
            }
          }
        );
      });
    });
    return;
  }

  const sql = migrations[completed];
  const migrationName = sql.split(' ').slice(0, 3).join(' ');
  console.log(`Running migration ${completed + 1}/${total}: ${migrationName}...`);

  db.run(sql, (err) => {
    if (err) {
      // Ignore "duplicate column name" or "already exists" errors
      if (err.message.includes('duplicate column name') || 
          err.message.includes('already exists')) {
        console.log(`⚠️  Column already exists, skipping: ${migrationName}`);
      } else {
        console.error('❌ Migration failed:', err.message);
        console.error('SQL:', sql);
        db.close();
        process.exit(1);
      }
    } else {
      console.log(`✅ Migration ${completed + 1} completed`);
    }

    completed++;
    runNextMigration();
  });
}

runNextMigration();

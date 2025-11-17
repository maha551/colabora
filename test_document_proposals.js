const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./colabora.db');

const organizationId = 'eaf5d8d5-a4a5-46c4-b44c-21259301e563';

const query = `SELECT dp.*, u.name as user_name, u.email as user_email FROM document_proposals dp JOIN users u ON dp.proposed_by_user_id = u.id WHERE dp.organization_id = ? ORDER BY dp.created_at DESC`;

db.all(query, [organizationId], (err, proposalRows) => {
  if (err) {
    console.error('Error fetching document proposals:', err);
    return;
  }

  console.log('Found', proposalRows.length, 'proposals');
  if (proposalRows.length > 0) {
    console.log('Sample proposal:', JSON.stringify(proposalRows[0], null, 2));
  }

  db.close();
});
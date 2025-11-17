const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./colabora.db');

const proposalIds = ['ca5252a1-a481-4a04-96be-676f645d9f8a'];
const placeholders = proposalIds.map(() => '?').join(',');
const query = `
  SELECT dpv.*, u.name as voter_name, u.email as voter_email
  FROM document_proposal_votes dpv
  JOIN users u ON dpv.user_id = u.id
  WHERE dpv.document_proposal_id IN (${placeholders})
  ORDER BY dpv.created_at ASC
`;

console.log('Query:', query);
console.log('Params:', proposalIds);

db.all(query, proposalIds, (err, voteRows) => {
  if (err) {
    console.error('Error fetching proposal votes:', err);
    return;
  }

  console.log('Found', voteRows.length, 'votes');
  if (voteRows.length > 0) {
    console.log('Sample vote:', JSON.stringify(voteRows[0], null, 2));
  }

  db.close();
});

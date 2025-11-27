const sqlite3 = require('sqlite3').verbose();

// Completely reset and reseed the database
const db = new sqlite3.Database('/data/colabora.db');

console.log('🔄 Completely resetting and reseeding database...\n');

// Delete all existing data
async function clearDatabase() {
  console.log('🗑️  Clearing existing data...');

  const tables = ['votes', 'comments', 'history', 'proposals', 'paragraphs',
                  'document_collaborators', 'documents', 'organization_members',
                  'organization_governance_rules', 'organizations', 'users'];

  for (const table of tables) {
    await runQuery(`DELETE FROM ${table}`);
    console.log(`   Cleared ${table}`);
  }
}

async function resetAutoIncrement() {
  console.log('🔄 Resetting auto-increment counters...');

  // SQLite doesn't have auto-increment reset, but we can use a workaround
  await runQuery(`DELETE FROM sqlite_sequence`);
}

async function seedFreshData() {
  console.log('🌱 Seeding fresh demo data...');

  // Users
  const users = [
    { id: 'user-1', name: 'Alice Johnson', email: 'alice@example.com', password_hash: '$2b$10$hashedpassword1' },
    { id: 'user-2', name: 'Bob Smith', email: 'bob@example.com', password_hash: '$2b$10$hashedpassword2' },
    { id: 'user-3', name: 'Charlie Brown', email: 'charlie@example.com', password_hash: '$2b$10$hashedpassword3' },
    { id: 'user-4', name: 'Diana Prince', email: 'diana@example.com', password_hash: '$2b$10$hashedpassword4' }
  ];

  for (const user of users) {
    await runQuery(
      'INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [user.id, user.name, user.email, user.password_hash, 'user']
    );
  }

  // Document
  await runQuery(
    `INSERT INTO documents
     (id, title, description, owner_id, acceptance_threshold, ownership_type,
      structure_proposals_enabled, voting_anonymous, voting_threshold,
      min_voters_required, vote_change_allowed, proposal_period_days,
      voting_period_days, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'demo-doc-1',
      'Collaborative Constitution Draft',
      'A collaborative draft of organizational principles',
      'user-1',
      75.0,
      'personal',
      0, 0, 0.5, null, 1, 30, 7, 'draft'
    ]
  );

  // Collaborators
  await runQuery('INSERT INTO document_collaborators (document_id, user_id) VALUES (?, ?)', ['demo-doc-1', 'user-2']);
  await runQuery('INSERT INTO document_collaborators (document_id, user_id) VALUES (?, ?)', ['demo-doc-1', 'user-3']);
  await runQuery('INSERT INTO document_collaborators (document_id, user_id) VALUES (?, ?)', ['demo-doc-1', 'user-4']);

  // Paragraphs
  await runQuery(
    'INSERT INTO paragraphs (id, document_id, title, text, order_index) VALUES (?, ?, ?, ?, ?)',
    ['para-1', 'demo-doc-1', 'Preamble',
     'We the people, in order to form a more perfect union, establish justice, insure domestic tranquility, provide for the common defence, promote the general welfare, and secure the blessings of liberty to ourselves and our posterity, do ordain and establish this Constitution for the collaborative organization.',
     0]
  );

  await runQuery(
    'INSERT INTO paragraphs (id, document_id, title, text, order_index) VALUES (?, ?, ?, ?, ?)',
    ['para-2', 'demo-doc-1', 'Article I - Legislative Branch',
     'All legislative powers herein granted shall be vested in a Congress of the organization, which shall consist of a Senate and House of Representatives.',
     1]
  );

  // Proposals
  const proposal1Id = 'prop-' + Date.now() + '-1';
  const proposal2Id = 'prop-' + Date.now() + '-2';

  await runQuery(
    'INSERT INTO proposals (id, paragraph_id, user_id, text, type, approved) VALUES (?, ?, ?, ?, ?, ?)',
    [proposal1Id, 'para-1', 'user-1',
     'We the people, in order to form a more perfect union, establish justice, insure domestic tranquility, provide for the common defence, promote the general welfare, and secure the blessings of liberty to ourselves and our posterity, do ordain and establish this Constitution for the collaborative organization. [AGREED: This preamble has been collaboratively approved through our voting system.]',
     'BODY', 1]
  );

  await runQuery(
    'INSERT INTO proposals (id, paragraph_id, user_id, text, type, approved) VALUES (?, ?, ?, ?, ?, ?)',
    [proposal2Id, 'para-2', 'user-2',
     'All legislative powers herein granted shall be vested in a Congress of the organization, which shall consist of a Senate and House of Representatives. [AGREED: This article has been collaboratively approved through our voting system.]',
     'BODY', 1]
  );

  // Votes
  const voters = ['user-1', 'user-2', 'user-3', 'user-4'];
  for (const userId of voters) {
    const voteId = 'vote-' + Date.now() + '-' + Math.random();
    await runQuery('INSERT INTO votes (id, proposal_id, user_id, vote) VALUES (?, ?, ?, ?)',
      [voteId, proposal1Id, userId, 'PRO']);
  }

  const proposal2Voters = ['user-1', 'user-2', 'user-3'];
  for (const userId of proposal2Voters) {
    const voteId = 'vote2-' + Date.now() + '-' + Math.random();
    await runQuery('INSERT INTO votes (id, proposal_id, user_id, vote) VALUES (?, ?, ?, ?)',
      [voteId, proposal2Id, userId, 'PRO']);
  }

  // History
  await runQuery(
    'INSERT INTO history (id, paragraph_id, user_id, old_text, new_text, approval_percentage, proposal_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['hist-' + Date.now() + '-1', 'para-1', 'user-1',
     'We the people, in order to form a more perfect union, establish justice, insure domestic tranquility, provide for the common defence, promote the general welfare, and secure the blessings of liberty to ourselves and our posterity, do ordain and establish this Constitution for the collaborative organization.',
     'We the people, in order to form a more perfect union, establish justice, insure domestic tranquility, provide for the common defence, promote the general welfare, and secure the blessings of liberty to ourselves and our posterity, do ordain and establish this Constitution for the collaborative organization. [AGREED: This preamble has been collaboratively approved through our voting system.]',
     100.0, proposal1Id]
  );

  await runQuery(
    'INSERT INTO history (id, paragraph_id, user_id, old_text, new_text, approval_percentage, proposal_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['hist-' + Date.now() + '-2', 'para-2', 'user-2',
     'All legislative powers herein granted shall be vested in a Congress of the organization, which shall consist of a Senate and House of Representatives.',
     'All legislative powers herein granted shall be vested in a Congress of the organization, which shall consist of a Senate and House of Representatives. [AGREED: This article has been collaboratively approved through our voting system.]',
     75.0, proposal2Id]
  );
}

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function verifyReset() {
  console.log('\n🔍 Verifying reset and reseed...');

  const results = await Promise.all([
    new Promise(resolve => db.get('SELECT COUNT(*) as count FROM users', (err, row) => resolve(row?.count || 0))),
    new Promise(resolve => db.get('SELECT COUNT(*) as count FROM documents', (err, row) => resolve(row?.count || 0))),
    new Promise(resolve => db.get('SELECT COUNT(*) as count FROM paragraphs', (err, row) => resolve(row?.count || 0))),
    new Promise(resolve => db.get('SELECT COUNT(*) as count FROM proposals WHERE approved = 1', (err, row) => resolve(row?.count || 0))),
    new Promise(resolve => db.get('SELECT COUNT(*) as count FROM history', (err, row) => resolve(row?.count || 0))),
    new Promise(resolve => db.get('SELECT COUNT(*) as count FROM votes', (err, row) => resolve(row?.count || 0)))
  ]);

  console.log(`👥 Users: ${results[0]}`);
  console.log(`📄 Documents: ${results[1]}`);
  console.log(`📝 Paragraphs: ${results[2]}`);
  console.log(`✅ Approved Proposals: ${results[3]}`);
  console.log(`📋 History Entries: ${results[4]}`);
  console.log(`🗳️ Votes: ${results[5]}`);
}

async function run() {
  try {
    await clearDatabase();
    await resetAutoIncrement();
    await seedFreshData();
    await verifyReset();

    console.log('\n🎉 Database completely reset and reseeded!');
    console.log('The login and document issues should now be resolved.');
  } catch (error) {
    console.error('❌ Reset failed:', error);
  } finally {
    db.close();
  }
}

run();

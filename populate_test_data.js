const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database('./colabora.db');

console.log('🌱 Populating database with test data...');

// Helper function to hash password
async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

// Create test users
async function createTestUsers() {
  console.log('Creating test users...');

  const users = [
    {
      id: 'cmgxlfj9z0000orjgnfy3revt',
      name: 'Alice Johnson',
      email: 'alice@example.com',
      password: 'SecurePass123!'
    },
    {
      id: 'cmgxlfj9z0000orjgnfy3revu',
      name: 'Bob Smith',
      email: 'bob@example.com',
      password: 'SecurePass123!'
    },
    {
      id: 'cmgxlfj9z0000orjgnfy3revv',
      name: 'Charlie Brown',
      email: 'charlie@example.com',
      password: 'SecurePass123!'
    },
    {
      id: 'cmgxlfj9z0000orjgnfy3revw',
      name: 'Diana Prince',
      email: 'diana@example.com',
      password: 'SecurePass123!'
    }
  ];

  for (const user of users) {
    const hashedPassword = await hashPassword(user.password);
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT OR IGNORE INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
        [user.id, user.name, user.email, hashedPassword],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  console.log('✅ Test users created');
}

// Create test organization
async function createTestOrganization() {
  console.log('Creating test organization...');

  const adminId = 'aaeaa22d-3d46-4a5a-9c37-0a442a96f002'; // From setup-admin
  const orgId = uuidv4();
  const representatives = [
    'cmgxlfj9z0000orjgnfy3revt', // Alice
    'cmgxlfj9z0000orjgnfy3revu', // Bob
    'cmgxlfj9z0000orjgnfy3revv'  // Charlie
  ];

  // Create organization
  await new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO organizations (id, name, description, representatives, membership_policy, voting_threshold, is_active, created_by_admin_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [orgId, 'Test Constitutional Assembly', 'A test organization for demonstrating collaborative document creation', JSON.stringify(representatives), 'invitation', 0.5, 1, adminId],
      function(err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  // Add representatives as members
  for (const repId of representatives) {
    const memberId = uuidv4();
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO organization_members (id, organization_id, user_id, status, joined_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
        [memberId, orgId, repId, 'active'],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  console.log('✅ Test organization created with ID:', orgId);
  return orgId;
}

// Create hierarchical documents
async function createTestDocuments(orgId) {
  console.log('Creating test documents...');

  const aliceId = 'cmgxlfj9z0000orjgnfy3revt';

  // Create root documents
  const constitutionId = uuidv4();
  const bylawsId = uuidv4();

  const documents = [
    {
      id: constitutionId,
      title: 'Constitution',
      description: 'The fundamental governing document',
      ownerId: aliceId,
      organizationId: orgId,
      parentId: null,
      status: 'proposal',
      proposalDeadline: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year from now
    },
    {
      id: bylawsId,
      title: 'Bylaws',
      description: 'Operational rules and procedures',
      ownerId: aliceId,
      organizationId: orgId,
      parentId: null,
      status: 'draft'
    }
  ];

  for (const doc of documents) {
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO documents (
          id, title, description, owner_id, collaborators, ownership_type, creator_ids,
          organization_id, parent_id, status, proposal_deadline, acceptance_threshold,
          voting_anonymous, voting_anonymity_locked, vote_change_allowed,
          structure_proposals_enabled, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          doc.id, doc.title, doc.description, doc.ownerId, JSON.stringify([]), 'organizational',
          JSON.stringify([doc.ownerId]), doc.organizationId, doc.parentId, doc.status,
          doc.proposalDeadline, 75, 0, 0, 1, 1
        ],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Create child documents
  const preambleId = uuidv4();
  const articlesId = uuidv4();

  const childDocuments = [
    {
      id: preambleId,
      title: 'Preamble',
      description: 'Introduction and purpose statement',
      ownerId: aliceId,
      organizationId: orgId,
      parentId: constitutionId,
      status: 'proposal'
    },
    {
      id: articlesId,
      title: 'Articles',
      description: 'Main body of the constitution',
      ownerId: aliceId,
      organizationId: orgId,
      parentId: constitutionId,
      status: 'draft'
    }
  ];

  for (const doc of childDocuments) {
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO documents (
          id, title, description, owner_id, collaborators, ownership_type, creator_ids,
          organization_id, parent_id, status, acceptance_threshold, voting_anonymous,
          voting_anonymity_locked, vote_change_allowed, structure_proposals_enabled, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          doc.id, doc.title, doc.description, doc.ownerId, JSON.stringify([]), 'organizational',
          JSON.stringify([doc.ownerId]), doc.organizationId, doc.parentId, doc.status,
          75, 0, 0, 1, 1
        ],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Create document proposals
  const proposalId = uuidv4();
  await new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO document_proposals (
        id, organization_id, title, description, proposed_by_user_id, contributors
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [proposalId, orgId, 'Code of Ethics', 'Ethical guidelines for the organization', aliceId, JSON.stringify([])],
      function(err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  console.log('✅ Test documents created');
}

async function main() {
  try {
    await createTestUsers();
    const orgId = await createTestOrganization();
    await createTestDocuments(orgId);

    console.log('🎉 Test data populated successfully!');
    console.log('\nTest accounts:');
    console.log('Admin: admin@colabora.local / AdminSecurePass123!');
    console.log('Alice: alice@example.com / SecurePass123!');
    console.log('Bob: bob@example.com / SecurePass123!');
    console.log('Charlie: charlie@example.com / SecurePass123!');
    console.log('Diana: diana@example.com / SecurePass123!');

  } catch (error) {
    console.error('❌ Error populating test data:', error);
  } finally {
    db.close();
  }
}

main();

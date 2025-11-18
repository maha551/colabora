const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./colabora.db');

console.log('Creating test documents for tree visualization...');

// First, get an organization and user
db.get("SELECT id, name FROM organizations WHERE is_active = 1 LIMIT 1", (err, org) => {
  if (err) {
    console.error('Error getting organization:', err);
    return;
  }

  if (!org) {
    console.log('No active organizations found');
    return;
  }

  console.log(`Using organization: ${org.name} (${org.id})`);

  db.get("SELECT id, name FROM users LIMIT 1", (err, user) => {
    if (err) {
      console.error('Error getting user:', err);
      return;
    }

    if (!user) {
      console.log('No users found');
      return;
    }

    console.log(`Using user: ${user.name} (${user.id})`);

    // Make sure user is a member of the organization
    db.run("INSERT OR REPLACE INTO organization_members (id, organization_id, user_id, status) VALUES (?, ?, ?, 'active')",
      [require('uuid').v4(), org.id, user.id], (err) => {
        if (err) {
          console.error('Error adding membership:', err);
          return;
        }

        console.log('Ensured user is organization member');

        // Create a hierarchical structure of documents
        createDocumentHierarchy(org, user);
      });
  });
});

function createDocumentHierarchy(org, user) {
  const documents = [
    // Root level documents
    { title: 'Company Policies', description: 'Main company policy documents', parentId: null },
    { title: 'Project Documentation', description: 'Project-related documents', parentId: null },

    // Children of Company Policies
    { title: 'HR Policies', description: 'Human resources policies', parentId: null }, // Will be set after creation
    { title: 'IT Policies', description: 'Information technology policies', parentId: null }, // Will be set after creation

    // Children of HR Policies
    { title: 'Code of Conduct', description: 'Employee code of conduct', parentId: null }, // Will be set after creation
    { title: 'Leave Policy', description: 'Vacation and leave policies', parentId: null }, // Will be set after creation

    // Children of Project Documentation
    { title: 'API Documentation', description: 'API reference and guides', parentId: null }, // Will be set after creation
    { title: 'Development Guidelines', description: 'Coding standards and practices', parentId: null }, // Will be set after creation
  ];

  let companyPoliciesId = null;
  let hrPoliciesId = null;
  let projectDocsId = null;

  // Create documents sequentially
  createNextDocument(0);

  function createNextDocument(index) {
    if (index >= documents.length) {
      console.log('✅ All test documents created successfully!');
      console.log('\n📋 Document Hierarchy:');
      console.log('├── Company Policies');
      console.log('│   ├── HR Policies');
      console.log('│   │   ├── Code of Conduct');
      console.log('│   │   └── Leave Policy');
      console.log('│   └── IT Policies');
      console.log('└── Project Documentation');
      console.log('    ├── API Documentation');
      console.log('    └── Development Guidelines');
      db.close();
      return;
    }

    const doc = documents[index];
    const documentId = require('uuid').v4();

    // Set parentId based on document title
    let parentId = doc.parentId;
    if (doc.title === 'HR Policies' || doc.title === 'IT Policies') {
      parentId = companyPoliciesId;
    } else if (doc.title === 'Code of Conduct' || doc.title === 'Leave Policy') {
      parentId = hrPoliciesId;
    } else if (doc.title === 'API Documentation' || doc.title === 'Development Guidelines') {
      parentId = projectDocsId;
    }

    const sql = `
      INSERT INTO documents (
        id, title, description, owner_id, ownership_type, organization_id, parent_id,
        acceptance_threshold, voting_anonymous, voting_anonymity_locked, vote_change_allowed,
        structure_proposals_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;

    const params = [
      documentId, doc.title, doc.description, user.id, 'organizational', org.id, parentId,
      75, 0, 0, 1, 0
    ];

    db.run(sql, params, function(err) {
      if (err) {
        console.error(`❌ Error creating document "${doc.title}":`, err);
        return;
      }

      console.log(`✓ Created: ${doc.title}${parentId ? ` (child of ${getParentTitle(parentId)})` : ''}`);

      // Store IDs for parent relationships
      if (doc.title === 'Company Policies') {
        companyPoliciesId = documentId;
      } else if (doc.title === 'HR Policies') {
        hrPoliciesId = documentId;
      } else if (doc.title === 'Project Documentation') {
        projectDocsId = documentId;
      }

      // Create initial paragraph
      const paragraphId = require('uuid').v4();
      db.run(`
        INSERT INTO paragraphs (
          id, document_id, title, text, order_index, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [paragraphId, documentId, doc.title, doc.description || doc.title, -1], (err) => {
        if (err) {
          console.error(`Error creating paragraph for ${doc.title}:`, err);
        }

        // Add organization members as collaborators (excluding owner)
        addCollaborators(documentId, org.id, user.id, () => {
          createNextDocument(index + 1);
        });
      });
    });
  }

  function addCollaborators(documentId, orgId, ownerId, callback) {
    db.all(`
      SELECT user_id FROM organization_members
      WHERE organization_id = ? AND status = 'active' AND user_id != ?
    `, [orgId, ownerId], (err, members) => {
      if (err || members.length === 0) {
        callback();
        return;
      }

      let added = 0;
      members.forEach(member => {
        const collabId = require('uuid').v4();
        db.run(`
          INSERT INTO document_collaborators (id, document_id, user_id)
          VALUES (?, ?, ?)
        `, [collabId, documentId, member.user_id], (err) => {
          if (err) {
            console.error(`Error adding collaborator:`, err);
          }
          added++;
          if (added >= members.length) {
            callback();
          }
        });
      });
    });
  }

  function getParentTitle(parentId) {
    if (parentId === companyPoliciesId) return 'Company Policies';
    if (parentId === hrPoliciesId) return 'HR Policies';
    if (parentId === projectDocsId) return 'Project Documentation';
    return 'Unknown';
  }
}

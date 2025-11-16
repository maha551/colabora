const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { metricsCollector } = require('../middleware/monitoring');
const { documentValidation } = require('../middleware/validation');
const { requireAuth, requireDocumentAccess } = require('../middleware/auth');

const router = express.Router();

// Get all documents for current user (as owner or collaborator)
router.get('/', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;

  const query = `
    SELECT DISTINCT d.*,
           u.name as owner_name,
           u.email as owner_email,
           o.name as organization_name
    FROM documents d
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id
    LEFT JOIN organizations o ON d.organization_id = o.id
    LEFT JOIN organization_members om ON o.id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    JOIN users u ON d.owner_id = u.id
    WHERE d.owner_id = ?
       OR dc.user_id = ?
       OR (d.ownership_type = 'organizational' AND om.user_id IS NOT NULL)
    ORDER BY d.updated_at DESC
  `;

  console.log('Executing documents query for user:', userId);
  console.log('Query:', query);

  // Execute main documents query first
  db.all(query, [userId, userId, userId], (err, documents) => {
    if (err) {
      console.error('Error fetching documents:', err);
      return res.status(500).json({ error: 'Failed to fetch documents' });
    }

    console.log('Found', documents.length, 'documents for user');

    // Now we can use the documents to build other queries
    const documentIds = documents.map(doc => doc.id);
    const orgIds = [...new Set(documents.filter(doc => doc.organization_id).map(doc => doc.organization_id))];

    // Fetch all collaborators in batch
    let collabQuery, collabParams;
    if (documentIds.length > 0) {
      collabQuery = `
        SELECT
          dc.document_id,
          dc.id as collaborator_id,
          dc.user_id,
          dc.created_at,
          u.name as user_name,
          u.email as user_email
        FROM document_collaborators dc
        JOIN users u ON dc.user_id = u.id
        WHERE dc.document_id IN (${documentIds.map(() => '?').join(',')})
      `;
      collabParams = documentIds;
    }

    // Fetch organizational collaborators in batch
    let orgCollabQuery, orgCollabParams;
    if (orgIds.length > 0) {
      orgCollabQuery = `
        SELECT
          om.organization_id,
          u.id as user_id,
          u.name as user_name,
          u.email as user_email,
          'auto' as collaborator_type
        FROM organization_members om
        JOIN users u ON om.user_id = u.id
        WHERE om.organization_id IN (${orgIds.map(() => '?').join(',')}) AND om.status = 'active'
        ORDER BY u.name
      `;
      orgCollabParams = orgIds;
    }

    // Fetch stats for all documents in batch (only if we have documents)
    let statsQuery, statsParams = [];
    if (documentIds.length > 0) {
      statsQuery = `
        SELECT
          p.document_id,
          COUNT(DISTINCT p.id) as paragraph_count,
          COUNT(DISTINCT pr.id) as proposal_count
        FROM paragraphs p
        LEFT JOIN proposals pr ON p.id = pr.paragraph_id
        WHERE p.document_id IN (${documentIds.map(() => '?').join(',')})
        GROUP BY p.document_id
      `;
      statsParams = documentIds;
    }

    // Execute all queries in parallel
    const queryPromises = [];

    if (collabQuery) {
      queryPromises.push(new Promise((resolve, reject) => {
        db.all(collabQuery, collabParams, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      }));
    } else {
      queryPromises.push(Promise.resolve([]));
    }

    if (orgCollabQuery) {
      queryPromises.push(new Promise((resolve, reject) => {
        db.all(orgCollabQuery, orgCollabParams, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      }));
    } else {
      queryPromises.push(Promise.resolve([]));
    }

    if (statsQuery) {
      queryPromises.push(new Promise((resolve, reject) => {
        db.all(statsQuery, statsParams, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      }));
    } else {
      queryPromises.push(Promise.resolve([]));
    }

    Promise.all(queryPromises).then(([collaborators, orgCollaborators, stats]) => {
      // Process collaborators and build response
      const collabMap = new Map();
      const orgCollabMap = new Map();
      const statsMap = new Map();

      // Build collaborator maps
    collaborators.forEach(collab => {
      if (!collabMap.has(collab.document_id)) {
        collabMap.set(collab.document_id, []);
      }
      collabMap.get(collab.document_id).push({
                  id: collab.collaborator_id,
                  document_id: collab.document_id,
                  user_id: collab.user_id,
                  created_at: collab.created_at,
                  user: {
                    id: collab.user_id,
                    name: collab.user_name,
                    email: collab.user_email
                  }
      });
    });

    orgCollaborators.forEach(collab => {
      if (!orgCollabMap.has(collab.organization_id)) {
        orgCollabMap.set(collab.organization_id, []);
      }
      orgCollabMap.get(collab.organization_id).push({
        id: collab.user_id,
        user_id: collab.user_id,
        user: {
          id: collab.user_id,
          name: collab.user_name,
          email: collab.user_email
        },
        collaborator_type: 'auto'
      });
    });

    // Build stats map
    stats.forEach(stat => {
      statsMap.set(stat.document_id, {
        paragraphCount: stat.paragraph_count || 0,
        proposalCount: stat.proposal_count || 0
      });
    });

    // Process documents
    const processedDocuments = documents.map(doc => {
      const docStats = statsMap.get(doc.id) || { paragraphCount: 0, proposalCount: 0 };
      let docCollaborators = [];

      if (doc.ownership_type === 'organizational' && doc.organization_id) {
        docCollaborators = orgCollabMap.get(doc.organization_id) || [];
      } else {
        docCollaborators = collabMap.get(doc.id) || [];
      }

      // Create minimal paragraph objects for counting
      const paragraphs = Array.from({ length: docStats.paragraphCount }, (_, index) => ({
              id: `para-${doc.id}-${index}`,
        proposals: index === 0 ? Array.from({ length: docStats.proposalCount }, () => ({})) : []
            }));

      return {
              ...doc,
              parentId: doc.parent_id || undefined,
              status: doc.status || 'draft',
              proposalDeadline: doc.proposal_deadline || undefined,
              owner: {
                id: doc.owner_id,
                name: doc.owner_name,
                email: doc.owner_email
              },
        collaborators: docCollaborators,
              paragraphs: paragraphs,
              organization: doc.organization_id ? {
                id: doc.organization_id,
                name: doc.organization_name
              } : undefined,
              options: {
                acceptanceThreshold: doc.acceptance_threshold || 75.0,
                votingAnonymous: doc.voting_anonymous === 1,
                structureProposalsEnabled: doc.structure_proposals_enabled === 1,
                votingAnonymityLocked: doc.voting_anonymity_locked === 1,
                voteChangeAllowed: doc.vote_change_allowed === 1
              }
      };
            });

      res.json({ documents: processedDocuments });
    }).catch(err => {
      console.error('Error fetching document data:', err);
      return res.status(500).json({ error: 'Failed to fetch documents' });
    });
  });
});

// Get a specific document with full details
router.get('/:id', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.id;
  const userId = req.user.id;

  const accessQuery = `
    SELECT d.*,
           u.name as owner_name,
           u.email as owner_email
    FROM documents d
    JOIN users u ON d.owner_id = u.id
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id
    WHERE d.id = ? AND (d.owner_id = ? OR dc.user_id = ?)
  `;

  db.get(accessQuery, [documentId, userId, userId], (err, document) => {
    if (err) {
      console.error('Error fetching document:', err);
      return res.status(500).json({ error: 'Failed to fetch document' });
    }

    if (!document) {
      return res.status(404).json({ error: 'Document not found or access denied' });
    }


    const paragraphsQuery = `
      SELECT p.*
      FROM paragraphs p
      WHERE p.document_id = ?
      ORDER BY p.order_index
    `;

    db.all(paragraphsQuery, [documentId], (err, paragraphs) => {
      if (err) {
        console.error('Error fetching paragraphs:', err);
        return res.status(500).json({ error: 'Failed to fetch document content' });
      }

      const buildParagraphData = (para) => {
        return new Promise((resolve) => {
          const proposalsQuery = `
            SELECT pr.*,
                   u.name as user_name,
                   u.email as user_email
            FROM proposals pr
            LEFT JOIN users u ON pr.user_id = u.id
            WHERE pr.paragraph_id = ?
            ORDER BY pr.created_at ASC
          `;

          db.all(proposalsQuery, [para.id], (proposalErr, proposals) => {
            if (proposalErr) {
              console.error('Error fetching proposals:', proposalErr);
              return resolve({
                ...para,
                order: para.order_index,
                heading_level: para.heading_level,
                proposals: [],
                suggestions: [],
                history: []
              });
            }

            const enrichProposal = (prop) => {
              return new Promise((resolveProposal) => {
                // Get document voting_anonymous setting
                db.get(`SELECT voting_anonymous FROM documents WHERE id = ?`, [documentId], (docErr, doc) => {
                  const isAnonymous = doc?.voting_anonymous === 1;

                  const votesQuery = `
                    SELECT v.*,
                           u.name as user_name,
                           u.email as user_email
                    FROM votes v
                    LEFT JOIN users u ON v.user_id = u.id
                    WHERE v.proposal_id = ?
                    ORDER BY v.created_at ASC
                  `;

                  const commentsQuery = `
                    SELECT c.*,
                           u.name as user_name,
                           u.email as user_email,
                           pc.user_id as parent_user_id,
                           pu.name as parent_user_name
                    FROM comments c
                    LEFT JOIN users u ON c.user_id = u.id
                    LEFT JOIN comments pc ON c.parent_id = pc.id
                    LEFT JOIN users pu ON pc.user_id = pu.id
                    WHERE c.proposal_id = ?
                    ORDER BY c.created_at ASC
                  `;

                  const historyQuery = `
                    SELECT 
                      h.id,
                      h.paragraph_id,
                      h.user_id,
                      h.old_text,
                      h.new_text,
                      h.approval_percentage,
                      h.proposal_id,
                      h.created_at,
                      h.heading_level,
                      u.name as user_name,
                      u.email as user_email,
                      pr.type as proposal_type
                    FROM history h
                    JOIN users u ON h.user_id = u.id
                    LEFT JOIN proposals pr ON h.proposal_id = pr.id
                    WHERE h.paragraph_id = ?
                    ORDER BY h.created_at DESC
                  `;

                  const fetchVotes = new Promise((resolveVotes) => {
                    db.all(votesQuery, [prop.id], (votesErr, voteRows) => {
                      if (votesErr) {
                        console.error('Error fetching votes:', votesErr);
                        return resolveVotes([]);
                      }

                      const votes = (voteRows || []).map((vote) => {
                        const voteData = {
                          ...vote,
                          proposalId: vote.proposal_id,
                          vote: vote.vote
                        };

                        // Hide user info if voting is anonymous
                        if (!isAnonymous) {
                          voteData.userId = vote.user_id;
                          voteData.user = {
                            id: vote.user_id,
                            name: vote.user_name,
                            email: vote.user_email
                          };
                        } else {
                          // In anonymous mode, only include userId for the current user's own vote
                          // This allows users to see their own vote while hiding others
                          if (vote.user_id === userId) {
                            voteData.userId = vote.user_id;
                          }
                          // Don't include user object or userId for other users
                        }

                        return voteData;
                      });

                      resolveVotes(votes);
                    });
                  });

                const fetchComments = new Promise((resolveComments) => {
                  db.all(commentsQuery, [prop.id], (commentsErr, commentRows) => {
                    if (commentsErr) {
                      console.error('Error fetching comments:', commentsErr);
                      return resolveComments([]);
                    }

                    const comments = (commentRows || []).map((comment) => ({
                      ...comment,
                      user: {
                        id: comment.user_id,
                        name: comment.user_name,
                        email: comment.user_email
                      },
                      parent: comment.parent_id ? {
                        id: comment.parent_id,
                        user: {
                          id: comment.parent_user_id,
                          name: comment.parent_user_name
                        }
                      } : null,
                      replies: []
                    }));

                    resolveComments(comments);
                  });
                });

                  Promise.all([fetchVotes, fetchComments]).then(([votes, comments]) => {
                    resolveProposal({
                      ...prop,
                      heading_level: prop.heading_level,
                      user: {
                        id: prop.user_id,
                        name: prop.user_name,
                        email: prop.user_email
                      },
                      votes,
                      comments
                    });
                  });
                });
              });
            };

            Promise.all(proposals.map(enrichProposal)).then((enrichedProposals) => {
              db.all(
                `
                SELECT 
                  h.id,
                  h.paragraph_id,
                  h.user_id,
                  h.old_text,
                  h.new_text,
                  h.approval_percentage,
                  h.proposal_id,
                  h.created_at,
                  h.heading_level,
                  u.name as user_name,
                  u.email as user_email,
                  pr.type as proposal_type
                FROM history h
                JOIN users u ON h.user_id = u.id
                LEFT JOIN proposals pr ON h.proposal_id = pr.id
                WHERE h.paragraph_id = ?
                ORDER BY h.created_at DESC
              `,
                [para.id],
                (historyErr, historyRows) => {
                  if (historyErr) {
                    console.error('Error fetching history:', historyErr);
                  }

                  const historyEntries = (historyRows || []).map((entry) => ({
                    id: entry.id,
                    paragraph_id: entry.paragraph_id,
                    paragraphId: entry.paragraph_id,
                    userId: entry.user_id,
                    oldText: entry.old_text,
                    newText: entry.new_text,
                    text: entry.new_text,
                    approvalPercentage: entry.approval_percentage != null ? Number(entry.approval_percentage) : 100,
                    proposalId: entry.proposal_id,
                    acceptedAt: entry.created_at,
                    createdAt: entry.created_at,
                    type: entry.proposal_type || 'BODY',
                    heading_level: entry.heading_level,
                    user: {
                      id: entry.user_id,
                      name: entry.user_name,
                      email: entry.user_email
                    }
                  }));

                  resolve({
                    ...para,
                    order: para.order_index,
                    heading_level: para.heading_level,
                    proposals: enrichedProposals,
                    suggestions: enrichedProposals,
                    history: historyEntries
                  });
                }
              );
            });
          });
        });
      };

      Promise.all(paragraphs.map(buildParagraphData)).then((paragraphData) => {
        const collabQuery = `
          SELECT 
            dc.id as collaborator_id,
            dc.document_id,
            dc.user_id,
            dc.created_at,
            u.name as user_name,
            u.email as user_email
          FROM document_collaborators dc
          JOIN users u ON dc.user_id = u.id
          WHERE dc.document_id = ?
        `;

        db.all(collabQuery, [documentId], (collabErr, collaborators) => {
          if (collabErr) {
            console.error('Error fetching collaborators:', collabErr);
            return res.status(500).json({ error: 'Failed to fetch collaborators' });
          }

          const normalizedCollaborators = (collaborators || []).map(collab => ({
            id: collab.collaborator_id,
            document_id: collab.document_id,
            user_id: collab.user_id,
            created_at: collab.created_at,
            user: {
              id: collab.user_id,
              name: collab.user_name,
              email: collab.user_email
            }
          }));

          const result = {
            ...document,
            parentId: document.parent_id || undefined,
            status: document.status || 'draft',
            proposalDeadline: document.proposal_deadline || undefined,
            owner: {
              id: document.owner_id,
              name: document.owner_name,
              email: document.owner_email
            },
            collaborators: normalizedCollaborators,
            paragraphs: paragraphData,
            options: {
              acceptanceThreshold: document.acceptance_threshold || 75.0,
              votingAnonymous: document.voting_anonymous === 1,
              votingAnonymityLocked: document.voting_anonymity_locked === 1,
              voteChangeAllowed: document.vote_change_allowed === 1
            }
          };

          res.json({ document: result });
        });
      });
    });
  });
});

// Create a new document
router.post('/', requireAuth, documentValidation.create, async (req, res) => {
  console.log(`[${new Date().toISOString()}] POST /api/documents - Creating document`);
  console.log('Request body:', req.body);
  console.log('User:', req.user ? req.user.name : 'No user');

  const db = req.app.locals.db;
  const { title, description, options, ownershipType = 'personal', organizationId, creatorIds, parentId } = req.body;
  const userId = req.user.id;

  if (!title || title.trim() === '') {
    console.log('Document creation failed: Title is required');
    return res.status(400).json({ error: 'Title is required' });
  }

  // Validate ownership type and permissions
  if (ownershipType === 'shared') {
    if (!creatorIds || !Array.isArray(creatorIds) || creatorIds.length < 1) {
      return res.status(400).json({ error: 'Shared documents require at least 1 creator' });
    }
    // Automatically add current user to creatorIds if not already included
    if (!creatorIds.includes(userId)) {
      creatorIds.push(userId);
    }
    if (creatorIds.length < 2) {
      return res.status(400).json({ error: 'Shared documents require at least 2 creators' });
    }
  }

  // For organizational documents, check representative status
  if (ownershipType === 'organizational') {
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required for organizational documents' });
    }
    db.get(`
      SELECT representatives FROM organizations
      WHERE id = ? AND representatives LIKE '%' || ? || '%' AND is_active = 1
    `, [organizationId, userId], async (err, org) => {
      if (err || !org) {
        return res.status(403).json({ error: 'Only organization representatives can create organizational documents' });
      }

      try {
        // If parentId is provided, validate it before creating document
        if (parentId) {
          const parentDoc = await new Promise((resolve, reject) => {
            db.get('SELECT id, organization_id, ownership_type FROM documents WHERE id = ?', [parentId], (parentErr, row) => {
              if (parentErr) reject(parentErr);
              else resolve(row);
            });
          });

          if (!parentDoc) {
            return res.status(400).json({ error: 'Parent document not found' });
          }

          // Validate parent belongs to same organization
          if (parentDoc.organization_id !== organizationId) {
            return res.status(400).json({ error: 'Parent document must belong to the same organization' });
          }

          // Validate parent ownership type matches
          if (parentDoc.ownership_type !== ownershipType) {
            return res.status(400).json({ error: 'Parent document must have the same ownership type' });
          }
        }

        await createDocument();
      } catch (error) {
        console.error('Error in organizational document creation:', error);
        return res.status(500).json({ error: 'Failed to create organizational document' });
      }
    });
    return; // Don't continue execution, wait for async callback
  }

  // Validate parent document if provided (for non-organizational documents)
  if (parentId) {
    db.get('SELECT id, organization_id, ownership_type FROM documents WHERE id = ?', [parentId], async (err, parentDoc) => {
      if (err || !parentDoc) {
        return res.status(400).json({ error: 'Parent document not found' });
      }

      // Validate parent ownership type matches
      if (parentDoc.ownership_type !== ownershipType) {
        return res.status(400).json({ error: 'Parent document must have the same ownership type' });
      }

      try {
        await createDocument();
      } catch (error) {
        console.error('Error in document creation:', error);
        return res.status(500).json({ error: 'Failed to create document' });
      }
    });
    return; // Don't continue execution, wait for async callback
  }

  // For non-organizational documents without parent, create immediately
  (async () => {
    try {
      await createDocument();
    } catch (error) {
      console.error('Error in document creation:', error);
      return res.status(500).json({ error: 'Failed to create document' });
    }
  })();

  async function createDocument() {
    // Parse and validate options for all document types (personal, shared, organizational)
    let acceptanceThreshold, votingAnonymous, votingAnonymityLocked, voteChangeAllowed, structureProposalsEnabled;

    // For organizational documents, first inherit organization governance rules
    if (ownershipType === 'organizational') {
      try {
        // Fetch organization governance rules
        const orgRules = await new Promise((resolve, reject) => {
          db.get(`
            SELECT
              voting_threshold,
              voting_anonymous,
              voting_anonymity_locked,
              vote_change_allowed,
              representative_term_months
            FROM organization_governance_rules
            WHERE organization_id = ?
          `, [organizationId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });

        if (orgRules) {
          console.log('Applying organization governance rules:', orgRules);
          // Apply organization rules as defaults, but allow explicit overrides
          acceptanceThreshold = options?.acceptanceThreshold !== undefined
            ? Math.min(100, Math.max(0, parseFloat(options.acceptanceThreshold)))
            : (orgRules.voting_threshold * 100); // Convert decimal to percentage

          votingAnonymous = options?.votingAnonymous !== undefined
            ? (options.votingAnonymous ? 1 : 0)
            : (orgRules.voting_anonymous ? 1 : 0);

          votingAnonymityLocked = options?.votingAnonymityLocked !== undefined
            ? (options.votingAnonymityLocked ? 1 : 0)
            : (orgRules.voting_anonymity_locked ? 1 : 0);

          voteChangeAllowed = options?.voteChangeAllowed !== undefined
            ? (options.voteChangeAllowed ? 1 : 0)
            : (orgRules.vote_change_allowed ? 1 : 0);

          // Structure proposals enabled by default for organizational docs
          structureProposalsEnabled = options?.structureProposalsEnabled !== undefined
            ? (options.structureProposalsEnabled ? 1 : 0)
            : 1; // Enable by default for organizational docs
        } else {
          console.log('No organization governance rules found, using defaults');
          // Fall back to default values if no org rules exist
          acceptanceThreshold = options?.acceptanceThreshold !== undefined
            ? Math.min(100, Math.max(0, parseFloat(options.acceptanceThreshold)))
            : 75.0;

          votingAnonymous = options?.votingAnonymous === true ? 1 : 0;
          votingAnonymityLocked = options?.votingAnonymityLocked === true ? 1 : 0;
          voteChangeAllowed = options?.voteChangeAllowed !== false ? 1 : 0;
          structureProposalsEnabled = options?.structureProposalsEnabled === true ? 1 : 0;
        }
      } catch (error) {
        console.error('Error fetching organization governance rules:', error);
        // Fall back to default values on error
        acceptanceThreshold = options?.acceptanceThreshold !== undefined
          ? Math.min(100, Math.max(0, parseFloat(options.acceptanceThreshold)))
          : 75.0;

        votingAnonymous = options?.votingAnonymous === true ? 1 : 0;
        votingAnonymityLocked = options?.votingAnonymityLocked === true ? 1 : 0;
        voteChangeAllowed = options?.voteChangeAllowed !== false ? 1 : 0;
        structureProposalsEnabled = options?.structureProposalsEnabled === true ? 1 : 0;
      }
    } else {
      // For personal and shared documents, use provided options or defaults
      const validThresholds = [50, 75, 90, 100];
      const requestedThreshold = options?.acceptanceThreshold !== undefined
        ? parseFloat(options.acceptanceThreshold)
        : 75.0;
      acceptanceThreshold = validThresholds.includes(requestedThreshold)
        ? requestedThreshold
        : 75.0;

      // Extract document options with defaults
      votingAnonymous = options?.votingAnonymous === true ? 1 : 0;
      votingAnonymityLocked = options?.votingAnonymityLocked === true ? 1 : 0;
      voteChangeAllowed = options?.voteChangeAllowed !== false ? 1 : 0; // Default to true
      structureProposalsEnabled = options?.structureProposalsEnabled === true ? 1 : 0;
    }

    const documentId = uuidv4();
    const trimmedTitle = title.trim();
    const trimmedDescription = description ? description.trim() : null;

    console.log('Creating document with ID:', documentId);
    console.log('Title:', trimmedTitle);
    console.log('Ownership type:', ownershipType);
    console.log('Parent ID:', parentId || 'none');

    // Build the SQL query based on ownership type
    let sql, params;

    if (ownershipType === 'shared') {
      // For shared documents, store creator IDs as JSON
      sql = `
        INSERT INTO documents (
          id, title, description, owner_id, ownership_type, creator_ids, organization_id, parent_id,
          acceptance_threshold, voting_anonymous, voting_anonymity_locked, vote_change_allowed,
          structure_proposals_enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;
      params = [
        documentId, trimmedTitle, trimmedDescription, userId, ownershipType, JSON.stringify(creatorIds), null, parentId || null,
        acceptanceThreshold, votingAnonymous, votingAnonymityLocked, voteChangeAllowed, structureProposalsEnabled
      ];
    } else if (ownershipType === 'organizational') {
      // For organizational documents, set organization_id
      sql = `
        INSERT INTO documents (
          id, title, description, owner_id, ownership_type, creator_ids, organization_id, parent_id,
          acceptance_threshold, voting_anonymous, voting_anonymity_locked, vote_change_allowed,
          structure_proposals_enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;
      params = [
        documentId, trimmedTitle, trimmedDescription, userId, ownershipType, null, organizationId, parentId || null,
        acceptanceThreshold, votingAnonymous, votingAnonymityLocked, voteChangeAllowed, structureProposalsEnabled
      ];
    } else {
      // For personal documents (default)
      sql = `
        INSERT INTO documents (
          id, title, description, owner_id, ownership_type, creator_ids, organization_id, parent_id,
          acceptance_threshold, voting_anonymous, voting_anonymity_locked, vote_change_allowed,
          structure_proposals_enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;
      params = [
        documentId, trimmedTitle, trimmedDescription, userId, ownershipType, null, null, parentId || null,
        acceptanceThreshold, votingAnonymous, votingAnonymityLocked, voteChangeAllowed, structureProposalsEnabled
      ];
    }

    // Use transaction for atomic document creation
    try {
      db.run('BEGIN TRANSACTION', (beginErr) => {
        if (beginErr) {
          console.error('Error beginning transaction:', beginErr);
          console.error('Transaction begin error details:', beginErr.message);
          console.error('Transaction begin error code:', beginErr.code);
          return res.status(500).json({
            error: 'Failed to create document',
            details: beginErr.message,
            code: beginErr.code
          });
        }

        db.run(sql, params, function(err) {
          if (err) {
            console.error('Error creating document:', err);
            console.error('SQL Error details:', err.message);
            console.error('SQL Error code:', err.code);
            console.error('SQL:', sql);
            console.error('Params:', params);
            db.run('ROLLBACK', (rollbackErr) => {
              if (rollbackErr) {
                console.error('Error during rollback after document creation failure:', rollbackErr);
              }
              // Send error response
              if (!res.headersSent) {
                return res.status(500).json({
                  error: 'Failed to create document',
                  details: err.message,
                  code: err.code
                });
              } else {
                console.error('Response already sent, cannot send error response');
              }
            });
            return;
          }

        console.log('Document created in database, now creating initial paragraph...');

        // Declare responseSent and sendResponse BEFORE they're used
        let responseSent = false; // Prevent multiple responses
        
        function sendResponse() {
          // Prevent multiple responses
          if (responseSent) {
            console.warn('Attempted to send response multiple times for document creation');
            return;
          }
          
          // Get user details for owner information
          db.get('SELECT name, email FROM users WHERE id = ?', [userId], (err, user) => {
            if (err) {
              console.error('Error fetching user details:', err);
              console.error('User ID:', userId);
              if (!responseSent) {
                responseSent = true;
                return res.status(500).json({ 
                  error: 'Failed to create document',
                  details: 'Error fetching user details: ' + err.message
                });
              }
              return;
            }

            if (!user) {
              console.error('User not found:', userId);
              if (!responseSent) {
                responseSent = true;
                return res.status(500).json({ 
                  error: 'Failed to create document',
                  details: 'User not found'
                });
              }
              return;
            }

            const result = {
              id: documentId,
              title: trimmedTitle,
              description: trimmedDescription,
              ownerId: userId,
              parentId: parentId || undefined,
              status: 'draft', // New documents start as draft
              owner: {
                id: userId,
                name: user.name,
                email: user.email
              },
              ownershipType,
              organizationId: ownershipType === 'organizational' ? organizationId : null,
              options: {
                acceptanceThreshold,
                votingAnonymous: votingAnonymous === 1,
                votingAnonymityLocked: votingAnonymityLocked === 1,
                voteChangeAllowed: voteChangeAllowed === 1,
                structureProposalsEnabled: structureProposalsEnabled === 1
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            console.log('Document created successfully:', { id: documentId, title: trimmedTitle });

            // Record business metrics
            try {
              metricsCollector.recordBusinessEvent('document_created', {
                documentId,
                ownerId: userId,
                ownershipType,
                organizationId: ownershipType === 'organizational' ? organizationId : null
              });
            } catch (metricsErr) {
              console.error('Error recording metrics:', metricsErr);
              // Don't fail the request if metrics fail
            }

            if (!responseSent) {
              responseSent = true;
              res.status(201).json({ document: result });
            }
          });
        }

        // Create initial title paragraph - CRITICAL: must succeed
        const paragraphId = uuidv4();
        db.run(`
          INSERT INTO paragraphs (
            id, document_id, title, text, order_index, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [paragraphId, documentId, trimmedTitle, trimmedDescription || trimmedTitle, -1], function(err) {
          if (err) {
            console.error('Error creating title paragraph:', err);
            console.error('Paragraph creation error details:', err.message);
            console.error('Paragraph creation SQL error code:', err.code);
            console.error('Document ID:', documentId);
            console.error('Paragraph ID:', paragraphId);
            db.run('ROLLBACK', (rollbackErr) => {
              if (rollbackErr) {
                console.error('Error during rollback:', rollbackErr);
              }
              if (!responseSent) {
                responseSent = true;
                return res.status(500).json({
                  error: 'Failed to create document: title paragraph creation failed',
                  details: err.message,
                  code: err.code
                });
              }
            });
            return;
          }

          // Add creators as collaborators if it's a shared document
          if (ownershipType === 'shared' && creatorIds) {
            // Serialize collaborator additions (SQLite doesn't handle concurrent writes well in transactions)
            const collaboratorsToAdd = creatorIds.filter(creatorId => creatorId !== userId); // Don't add owner as collaborator
            
            if (collaboratorsToAdd.length === 0) {
              // No collaborators to add, commit transaction
              db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  console.error('Error committing transaction:', commitErr);
                  console.error('Commit error details:', commitErr.message);
                  db.run('ROLLBACK', (rollbackErr) => {
                    if (rollbackErr) {
                      console.error('Error during rollback after commit failure:', rollbackErr);
                    }
                    if (!res.headersSent) {
                      return res.status(500).json({ 
                        error: 'Failed to create document: commit failed',
                        details: commitErr.message
                      });
                    }
                  });
                  return;
                }
                sendResponse();
              });
            } else {
              // Add collaborators sequentially
              let collaboratorIndex = 0;
              
              const addNextCollaborator = () => {
                if (collaboratorIndex >= collaboratorsToAdd.length) {
                  // All collaborators added successfully, commit transaction
                  db.run('COMMIT', (commitErr) => {
                    if (commitErr) {
                      console.error('Error committing transaction:', commitErr);
                      console.error('Commit error details:', commitErr.message);
                      db.run('ROLLBACK', (rollbackErr) => {
                        if (rollbackErr) {
                          console.error('Error during rollback after commit failure:', rollbackErr);
                        }
                        if (!res.headersSent) {
                          return res.status(500).json({ 
                            error: 'Failed to create document: commit failed',
                            details: commitErr.message
                          });
                        }
                      });
                      return;
                    }
                    sendResponse();
                  });
                  return;
                }
                
                const creatorId = collaboratorsToAdd[collaboratorIndex];
                const collabId = uuidv4();
                db.run(`
                  INSERT INTO document_collaborators (id, document_id, user_id)
                  VALUES (?, ?, ?)
                `, [collabId, documentId, creatorId], function(err) {
                  if (err) {
                    console.error('Error adding collaborator:', creatorId, err);
                    console.error('Collaborator addition error details:', err.message);
                    db.run('ROLLBACK', (rollbackErr) => {
                      if (rollbackErr) {
                        console.error('Error during rollback after collaborator addition failure:', rollbackErr);
                      }
                      if (!res.headersSent) {
                        return res.status(500).json({
                          error: 'Failed to create document: collaborator addition failed',
                          details: err.message
                        });
                      }
                    });
                    return;
                  }
                  collaboratorIndex++;
                  addNextCollaborator();
                });
              };
              
              addNextCollaborator();
            }
          } else if (ownershipType === 'organizational') {
            // For organizational documents, add all active organization members as collaborators
            db.all(`
              SELECT user_id FROM organization_members
              WHERE organization_id = ? AND status = 'active'
            `, [organizationId], (membersErr, members) => {
              if (membersErr) {
                console.error('Error fetching organization members:', membersErr);
                db.run('ROLLBACK', (rollbackErr) => {
                  if (rollbackErr) {
                    console.error('Error during rollback after member fetch failure:', rollbackErr);
                  }
                  if (!res.headersSent) {
                    return res.status(500).json({
                      error: 'Failed to create document: member fetch failed',
                      details: membersErr.message
                    });
                  }
                });
                return;
              }

              if (members.length === 0) {
                // No members to add as collaborators, just commit
                db.run('COMMIT', (commitErr) => {
                  if (commitErr) {
                    console.error('Error committing transaction:', commitErr);
                    db.run('ROLLBACK', (rollbackErr) => {
                      if (rollbackErr) {
                        console.error('Error during rollback after commit failure:', rollbackErr);
                      }
                      if (!res.headersSent) {
                        return res.status(500).json({
                          error: 'Failed to create document: commit failed',
                          details: commitErr.message
                        });
                      }
                    });
                    return;
                  }
                  console.log(`Created organizational document ${documentId} - no members to add as collaborators`);
                  sendResponse();
                });
                return;
              }

              // Add all organization members as collaborators
              let collaboratorIndex = 0;
              const totalCollaborators = members.length;

              const addNextCollaborator = () => {
                if (collaboratorIndex >= totalCollaborators) {
                  // All collaborators added successfully, commit transaction
                  db.run('COMMIT', (commitErr) => {
                    if (commitErr) {
                      console.error('Error committing transaction:', commitErr);
                      db.run('ROLLBACK', (rollbackErr) => {
                        if (rollbackErr) {
                          console.error('Error during rollback after commit failure:', rollbackErr);
                        }
                        if (!res.headersSent) {
                          return res.status(500).json({
                            error: 'Failed to create document: commit failed',
                            details: commitErr.message
                          });
                        }
                      });
                      return;
                    }
                    console.log(`Created organizational document ${documentId} - added ${totalCollaborators} collaborators`);
                    sendResponse();
                  });
                  return;
                }

                const memberId = members[collaboratorIndex].user_id;
                const collabId = uuidv4();
                db.run(`
                  INSERT INTO document_collaborators (id, document_id, user_id)
                  VALUES (?, ?, ?)
                `, [collabId, documentId, memberId], function(err) {
                  if (err) {
                    console.error('Error adding organizational collaborator:', memberId, err);
                    db.run('ROLLBACK', (rollbackErr) => {
                      if (rollbackErr) {
                        console.error('Error during rollback after collaborator addition failure:', rollbackErr);
                      }
                      if (!res.headersSent) {
                        return res.status(500).json({
                          error: 'Failed to create document: collaborator addition failed',
                          details: err.message
                        });
                      }
                    });
                    return;
                  }
                  collaboratorIndex++;
                  addNextCollaborator();
                });
              };

              addNextCollaborator();
            });
          } else {
            // For personal documents, no collaborators to add, commit transaction
            db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                console.error('Error committing transaction:', commitErr);
                console.error('Commit error details:', commitErr.message);
                db.run('ROLLBACK', (rollbackErr) => {
                  if (rollbackErr) {
                    console.error('Error during rollback after commit failure:', rollbackErr);
                  }
                  if (!res.headersSent) {
                    return res.status(500).json({
                      error: 'Failed to create document: commit failed',
                      details: commitErr.message
                    });
                  }
                });
                return;
              }
              sendResponse();
            });
          }
        });
      });
    });
    } catch (unexpectedErr) {
      console.error('Unexpected error in document creation:', unexpectedErr);
      console.error('Error stack:', unexpectedErr.stack);
      // Try to rollback if transaction was started
      try {
        db.run('ROLLBACK', () => {});
      } catch (rollbackErr) {
        console.error('Error during emergency rollback:', rollbackErr);
      }
      return res.status(500).json({
        error: 'Failed to create document',
        details: unexpectedErr.message || 'Unexpected error occurred',
        type: 'unexpected_error'
      });
    }
  }
});

// Update document title
router.put('/:id', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.id;
  const { title } = req.body;
  const userId = req.user.id;

  if (!title || title.trim() === '') {
    return res.status(400).json({ error: 'Title is required' });
  }

  // Check if user owns this document
  db.get(`
    SELECT owner_id FROM documents WHERE id = ?
  `, [documentId], (err, document) => {
    if (err) {
      console.error('Error fetching document:', err);
      return res.status(500).json({ error: 'Failed to update document' });
    }

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.owner_id !== userId) {
      return res.status(403).json({ error: 'Only document owner can update document' });
    }

    db.run(`
      UPDATE documents SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [title.trim(), documentId], function(err) {
      if (err) {
        console.error('Error updating document:', err);
        return res.status(500).json({ error: 'Failed to update document' });
      }

      res.json({ message: 'Document updated successfully' });
    });
  });
});

// Delete a document
router.delete('/:id', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.id;
  const userId = req.user.id;

  // Check if user owns this document
  db.get(`
    SELECT owner_id FROM documents WHERE id = ?
  `, [documentId], (err, document) => {
    if (err) {
      console.error('Error fetching document:', err);
      return res.status(500).json({ error: 'Failed to delete document' });
    }

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.owner_id !== userId) {
      return res.status(403).json({ error: 'Only document owner can delete document' });
    }

    // Delete document and all related data (cascade delete)
    db.run('DELETE FROM documents WHERE id = ?', [documentId], function(err) {
      if (err) {
        console.error('Error deleting document:', err);
        return res.status(500).json({ error: 'Failed to delete document' });
      }

      res.json({ message: 'Document deleted successfully' });
    });
  });
});

// Add collaborator to document
router.post('/:id/collaborators', requireAuth, (req, res) => {
  console.log(`[${new Date().toISOString()}] POST /api/documents/${req.params.id}/collaborators - Adding collaborator`);
  console.log('Current user:', req.user.id, 'Adding user:', req.body.userId);

  const db = req.app.locals.db;
  const documentId = req.params.id;
  const currentUserId = req.user.id;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  // Check if current user is the document owner
  db.get(`
    SELECT owner_id FROM documents WHERE id = ?
  `, [documentId], (err, document) => {
    if (err) {
      console.error('Error fetching document:', err);
      return res.status(500).json({ error: 'Failed to add collaborator' });
    }

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.owner_id !== currentUserId) {
      return res.status(403).json({ error: 'Only document owner can manage collaborators' });
    }

    // Check if user exists
    db.get(`
      SELECT id, name, email FROM users WHERE id = ?
    `, [userId], (err, user) => {
      if (err) {
        console.error('Error fetching user:', err);
        return res.status(500).json({ error: 'Failed to add collaborator' });
      }

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if user is already a collaborator or owner
      if (document.owner_id === userId) {
        return res.status(400).json({ error: 'User is already the document owner' });
      }

      db.get(`
        SELECT id FROM document_collaborators WHERE document_id = ? AND user_id = ?
      `, [documentId, userId], (err, existing) => {
        if (err) {
          console.error('Error checking existing collaborator:', err);
          return res.status(500).json({ error: 'Failed to add collaborator' });
        }

        if (existing) {
          return res.status(400).json({ error: 'User is already a collaborator' });
        }

        // Add collaborator
        const collaboratorId = uuidv4();
        db.run(`
          INSERT INTO document_collaborators (id, document_id, user_id)
          VALUES (?, ?, ?)
        `, [collaboratorId, documentId, userId], function(err) {
          if (err) {
            console.error('Error adding collaborator:', err);
            return res.status(500).json({ error: 'Failed to add collaborator' });
          }

          // Update document timestamp
          db.run(`
            UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `, [documentId], function(err) {
            if (err) {
              console.error('Error updating document timestamp:', err);
            }
          });

          console.log('Collaborator added successfully:', userId, 'to document:', documentId);
          res.status(201).json({
            collaborator: {
              id: collaboratorId,
              documentId,
              userId,
              createdAt: new Date().toISOString(),
              user: {
                id: user.id,
                name: user.name,
                email: user.email
              }
            }
          });
        });
      });
    });
  });
});

// Remove collaborator from document
router.delete('/:id/collaborators/:userId', requireAuth, (req, res) => {
  console.log(`[${new Date().toISOString()}] DELETE /api/documents/${req.params.id}/collaborators/${req.params.userId} - Removing collaborator`);
  console.log('Current user:', req.user.id, 'Removing user:', req.params.userId);

  const db = req.app.locals.db;
  const documentId = req.params.id;
  const collaboratorUserId = req.params.userId;
  const currentUserId = req.user.id;

  // Check if current user is the document owner
  db.get(`
    SELECT owner_id FROM documents WHERE id = ?
  `, [documentId], (err, document) => {
    if (err) {
      console.error('Error fetching document:', err);
      return res.status(500).json({ error: 'Failed to remove collaborator' });
    }

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.owner_id !== currentUserId) {
      return res.status(403).json({ error: 'Only document owner can manage collaborators' });
    }

    // Cannot remove the owner
    if (document.owner_id === collaboratorUserId) {
      return res.status(400).json({ error: 'Cannot remove document owner' });
    }

    // Remove collaborator
    db.run(`
      DELETE FROM document_collaborators WHERE document_id = ? AND user_id = ?
    `, [documentId, collaboratorUserId], function(err) {
      if (err) {
        console.error('Error removing collaborator:', err);
        return res.status(500).json({ error: 'Failed to remove collaborator' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Collaborator not found' });
      }

      // Update document timestamp
      db.run(`
        UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `, [documentId], function(err) {
        if (err) {
          console.error('Error updating document timestamp:', err);
        }
      });

      console.log('Collaborator removed successfully:', collaboratorUserId, 'from document:', documentId);
      res.json({ message: 'Collaborator removed successfully' });
    });
  });
});

// Get all documents owned by a specific organization
router.get('/organization/:organizationId', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;

  // First check if user is a member of the organization
  const membershipQuery = `
    SELECT om.status, o.is_active
    FROM organization_members om
    JOIN organizations o ON om.organization_id = o.id
    WHERE om.organization_id = ? AND om.user_id = ? AND om.status = 'active' AND o.is_active = 1
  `;

  db.get(membershipQuery, [organizationId, userId], (err, membership) => {
    if (err) {
      console.error('Error checking organization membership:', err);
      return res.status(500).json({ error: 'Failed to verify organization access' });
    }

    if (!membership) {
      return res.status(403).json({ error: 'Access denied: not a member of this organization' });
    }

    // Get all organizational documents
    const documentsQuery = `
      SELECT d.*,
             u.name as owner_name,
             u.email as owner_email,
             o.name as organization_name
      FROM documents d
      JOIN users u ON d.owner_id = u.id
      JOIN organizations o ON d.organization_id = o.id
      WHERE d.ownership_type = 'organizational'
        AND d.organization_id = ?
        AND o.is_active = 1
      ORDER BY d.parent_id NULLS FIRST, d.created_at ASC
    `;

    db.all(documentsQuery, [organizationId], (err, documents) => {
      if (err) {
        console.error('Error fetching organization documents:', err);
        return res.status(500).json({
          error: 'Failed to fetch organization documents',
          details: err.message
        });
      }

      console.log(`Found ${documents ? documents.length : 0} documents for organization ${organizationId}`);

      // Process documents with collaborators (for organizational docs, all org members are auto-collaborators)
      const documentsWithCollaborators = documents.map(doc => {
        return new Promise((resolve) => {
          if (doc.ownership_type === 'organizational') {
            // For organizational documents, all active organization members are automatically collaborators
            db.all(`
              SELECT
                u.id as user_id,
                u.name as user_name,
                u.email as user_email,
                'auto' as collaborator_type
              FROM organization_members om
              JOIN users u ON om.user_id = u.id
              WHERE om.organization_id = ? AND om.status = 'active'
              ORDER BY u.name
            `, [doc.organization_id], (err, collaborators) => {
              if (err) {
                console.error('Error fetching organization members for document:', doc.id, err);
                return resolve({
                  ...doc,
                  parentId: doc.parent_id || undefined,
                  status: doc.status || 'draft',
                  proposalDeadline: doc.proposal_deadline || undefined,
                  owner: {
                    id: doc.owner_id,
                    name: doc.owner_name,
                    email: doc.owner_email
                  },
                  collaborators: [],
                  organization: {
                    id: doc.organization_id,
                    name: doc.organization_name
                  },
                  options: {
                    acceptanceThreshold: doc.acceptance_threshold,
                    votingAnonymous: doc.voting_anonymous === 1,
                    votingAnonymityLocked: doc.voting_anonymity_locked === 1,
                    voteChangeAllowed: doc.vote_change_allowed === 1,
                    structureProposalsEnabled: doc.structure_proposals_enabled === 1
                  }
                });
              }

              resolve({
                ...doc,
                parentId: doc.parent_id || undefined,
                status: doc.status || 'draft',
                proposalDeadline: doc.proposal_deadline || undefined,
                owner: {
                  id: doc.owner_id,
                  name: doc.owner_name,
                  email: doc.owner_email
                },
                collaborators: collaborators || [],
                organization: {
                  id: doc.organization_id,
                  name: doc.organization_name
                },
                options: {
                  acceptanceThreshold: doc.acceptance_threshold,
                  votingAnonymous: doc.voting_anonymous === 1,
                  votingAnonymityLocked: doc.voting_anonymity_locked === 1,
                  voteChangeAllowed: doc.vote_change_allowed === 1,
                  structureProposalsEnabled: doc.structure_proposals_enabled === 1
                }
              });
            });
          } else {
            // For non-organizational documents, fetch stored collaborators
            db.all(`
              SELECT
                dc.id as collaborator_id,
                dc.document_id,
                dc.user_id,
                dc.created_at,
                u.name as user_name,
                u.email as user_email
              FROM document_collaborators dc
              JOIN users u ON dc.user_id = u.id
              WHERE dc.document_id = ?
            `, [doc.id], (err, collaborators) => {
              if (err) {
                console.error('Error fetching collaborators for document:', doc.id, err);
                return resolve({
                  ...doc,
                  parentId: doc.parent_id || undefined,
                  owner: {
                    id: doc.owner_id,
                    name: doc.owner_name,
                    email: doc.owner_email
                  },
                  collaborators: [],
                  organization: doc.organization_id ? {
                    id: doc.organization_id,
                    name: doc.organization_name
                  } : null,
                  options: {
                    acceptanceThreshold: doc.acceptance_threshold,
                    votingAnonymous: doc.voting_anonymous === 1,
                    votingAnonymityLocked: doc.voting_anonymity_locked === 1,
                    voteChangeAllowed: doc.vote_change_allowed === 1,
                    structureProposalsEnabled: doc.structure_proposals_enabled === 1
                  }
                });
              }

              // Transform collaborators to match expected format
              const transformedCollaborators = (collaborators || []).map(collab => ({
                id: collab.user_id,
                name: collab.user_name,
                email: collab.user_email
              }));

              resolve({
                ...doc,
                parentId: doc.parent_id || undefined,
                status: doc.status || 'draft',
                proposalDeadline: doc.proposal_deadline || undefined,
                owner: {
                  id: doc.owner_id,
                  name: doc.owner_name,
                  email: doc.owner_email
                },
                collaborators: transformedCollaborators,
                organization: doc.organization_id ? {
                  id: doc.organization_id,
                  name: doc.organization_name
                } : null,
                options: {
                  acceptanceThreshold: doc.acceptance_threshold,
                  votingAnonymous: doc.voting_anonymous === 1,
                  votingAnonymityLocked: doc.voting_anonymity_locked === 1,
                  voteChangeAllowed: doc.vote_change_allowed === 1,
                  structureProposalsEnabled: doc.structure_proposals_enabled === 1
                }
              });
            });
          }
        });
      });

      Promise.all(documentsWithCollaborators).then(processedDocuments => {
        res.json({
          documents: processedDocuments,
          organizationId: organizationId
        });
      }).catch(err => {
        console.error('Error processing documents:', err);
        res.status(500).json({ error: 'Failed to process documents' });
      });
    });
  });
});

// Vote on entire document (document-level vote)
router.post('/:id/vote', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.id;
  const userId = req.user.id;
  const { vote } = req.body;

  if (!['PRO', 'NEUTRAL', 'CONTRA'].includes(vote)) {
    return res.status(400).json({ error: 'Invalid vote type. Must be PRO, NEUTRAL, or CONTRA' });
  }

  // Check if document exists and user has access
  db.get(`SELECT id, vote_change_allowed, status FROM documents WHERE id = ?`, [documentId], (err, document) => {
    if (err) {
      console.error('Error fetching document:', err);
      return res.status(500).json({ error: 'Failed to fetch document' });
    }

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check if user already voted
    db.get(`SELECT id, vote FROM document_votes WHERE document_id = ? AND user_id = ?`, 
      [documentId, userId], (err, existingVote) => {
      if (err) {
        console.error('Error checking existing vote:', err);
        return res.status(500).json({ error: 'Failed to check existing vote' });
      }

      if (existingVote) {
        // Check if vote changes are allowed
        if (!document.vote_change_allowed || document.vote_change_allowed === 0) {
          return res.status(403).json({ 
            error: 'Votes are locked for this document. You cannot change your vote.' 
          });
        }

        // Update existing vote
        db.run(`UPDATE document_votes SET vote = ?, updated_at = CURRENT_TIMESTAMP WHERE document_id = ? AND user_id = ?`,
          [vote, documentId, userId], function(err) {
          if (err) {
            console.error('Error updating vote:', err);
            return res.status(500).json({ error: 'Failed to update vote' });
          }

          // Check if document should be marked as agreed
          checkDocumentAgreementStatus(db, documentId);

          res.json({ message: 'Vote updated successfully' });
        });
      } else {
        // Insert new vote
        const { v4: uuidv4 } = require('uuid');
        const voteId = uuidv4();
        
        db.run(`INSERT INTO document_votes (id, document_id, user_id, vote) VALUES (?, ?, ?, ?)`,
          [voteId, documentId, userId, vote], function(err) {
          if (err) {
            console.error('Error casting vote:', err);
            return res.status(500).json({ error: 'Failed to cast vote' });
          }

          // Check if document should be marked as agreed
          checkDocumentAgreementStatus(db, documentId);

          res.json({ message: 'Vote recorded successfully', voteId });
        });
      }
    });
  });
});

// Get document-level votes
router.get('/:id/votes', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.id;
  const userId = req.user.id;

  // Get document to check voting anonymity
  db.get(`SELECT voting_anonymous FROM documents WHERE id = ?`, [documentId], (docErr, doc) => {
    if (docErr) {
      console.error('Error fetching document:', docErr);
      return res.status(500).json({ error: 'Failed to fetch document' });
    }

    const isAnonymous = doc?.voting_anonymous === 1;

    const votesQuery = isAnonymous
      ? `SELECT id, vote, created_at, updated_at FROM document_votes WHERE document_id = ?`
      : `SELECT dv.id, dv.vote, dv.created_at, dv.updated_at, u.id as user_id, u.name as user_name, u.email as user_email
         FROM document_votes dv
         JOIN users u ON dv.user_id = u.id
         WHERE dv.document_id = ?`;

    db.all(votesQuery, [documentId], (err, votes) => {
      if (err) {
        console.error('Error fetching votes:', err);
        return res.status(500).json({ error: 'Failed to fetch votes' });
      }

      const formattedVotes = votes.map(vote => {
        if (isAnonymous) {
          return {
            id: vote.id,
            vote: vote.vote,
            createdAt: vote.created_at,
            updatedAt: vote.updated_at
          };
        } else {
          return {
            id: vote.id,
            userId: vote.user_id,
            vote: vote.vote,
            createdAt: vote.created_at,
            updatedAt: vote.updated_at,
            user: {
              id: vote.user_id,
              name: vote.user_name,
              email: vote.user_email
            }
          };
        }
      });

      res.json({ votes: formattedVotes });
    });
  });
});

// Helper function to check if document-level votes reach agreement threshold
function checkDocumentAgreementStatus(db, documentId) {
  // Get document acceptance threshold, status, and proposal deadline
  db.get(`SELECT acceptance_threshold, status, proposal_deadline FROM documents WHERE id = ?`, [documentId], (docErr, doc) => {
    if (docErr) {
      console.error('Error getting document threshold:', docErr);
      return;
    }

    if (!doc || doc.status === 'agreed') {
      // Already agreed or document not found
      return;
    }

    // Only check for agreement if document is in 'proposal' status
    if (doc.status !== 'proposal') {
      return;
    }

    // Check if proposal deadline has passed
    if (doc.proposal_deadline) {
      const deadline = new Date(doc.proposal_deadline);
      const now = new Date();
      if (now < deadline) {
        // Deadline has not passed yet - cannot agree
        return;
      }
    }

    const acceptanceThreshold = doc?.acceptance_threshold || 75.0;

    // Get total collaborators
    const collabQuery = `
      SELECT COUNT(*) as total_users
      FROM (
        SELECT owner_id as user_id FROM documents WHERE id = ?
        UNION
        SELECT user_id FROM document_collaborators WHERE document_id = ?
      )
    `;

    db.get(collabQuery, [documentId, documentId], (err, result) => {
      if (err) {
        console.error('Error getting user count:', err);
        return;
      }

      const totalUsers = result.total_users || 1;

      // Get document-level votes
      db.all(`SELECT vote FROM document_votes WHERE document_id = ?`, [documentId], (err, votes) => {
        if (err) {
          console.error('Error getting document votes:', err);
          return;
        }

        if (!votes || votes.length === 0) {
          // No votes yet
          return;
        }

        // Count PRO votes
        const proVotes = votes.filter(v => v.vote === 'PRO').length;
        const approvalPercentage = totalUsers > 0 ? (proVotes / totalUsers) * 100 : 0;

        // Check if agreement threshold is met (quorum reached)
        if (approvalPercentage >= acceptanceThreshold) {
          // Update document status to 'agreed' (deadline passed AND quorum reached)
          db.run(`UPDATE documents SET status = 'agreed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [documentId], (updateErr) => {
            if (updateErr) {
              console.error('Error updating document status to agreed:', updateErr);
            } else {
              console.log(`Document ${documentId} status updated to 'agreed' - deadline passed and document-level votes reached threshold`);
            }
          });
        }
      });
    });
  });
}

module.exports = router;
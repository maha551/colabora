const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { metricsCollector } = require('../middleware/monitoring');

const router = express.Router();

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// Get all documents for current user (as owner or collaborator)
router.get('/', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;

  const query = `
    SELECT DISTINCT d.*,
           u.name as owner_name,
           u.email as owner_email
    FROM documents d
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id
    JOIN users u ON d.owner_id = u.id
    WHERE d.owner_id = ? OR dc.user_id = ?
    ORDER BY d.updated_at DESC
  `;

  db.all(query, [userId, userId], (err, documents) => {
    if (err) {
      console.error('Error fetching documents:', err);
      return res.status(500).json({ error: 'Failed to fetch documents' });
    }

    const documentsWithCollaborators = documents.map(doc => {
      return new Promise((resolve) => {
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

        // Also fetch paragraph and proposal counts
        const statsQuery = `
          SELECT
            COUNT(DISTINCT p.id) as paragraph_count,
            COUNT(DISTINCT pr.id) as proposal_count
          FROM paragraphs p
          LEFT JOIN proposals pr ON p.id = pr.paragraph_id
          WHERE p.document_id = ?
        `;

        // Fetch collaborators
        db.all(collabQuery, [doc.id], (err, collaborators) => {
          if (err) {
            console.error('Error fetching collaborators:', err);
            return resolve({
              ...doc,
              owner: {
                id: doc.owner_id,
                name: doc.owner_name,
                email: doc.owner_email
              },
              collaborators: [],
              paragraphs: []
            });
          }

          // Fetch stats
          db.get(statsQuery, [doc.id], (statsErr, stats) => {
            if (statsErr) {
              console.error('Error fetching document stats:', statsErr);
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

            // Add paragraph and proposal counts to the document
            const paragraphCount = stats ? stats.paragraph_count : 0;
            const proposalCount = stats ? stats.proposal_count : 0;

            // Create minimal paragraph objects for counting (client expects paragraphs array)
            const paragraphs = Array.from({ length: paragraphCount }, (_, index) => ({
              id: `para-${doc.id}-${index}`,
              proposals: index === 0 ? Array.from({ length: proposalCount }, () => ({})) : []
            }));

            resolve({
              ...doc,
              owner: {
                id: doc.owner_id,
                name: doc.owner_name,
                email: doc.owner_email
              },
              collaborators: normalizedCollaborators,
              paragraphs: paragraphs
            });
          });
        });
      });
    });

    Promise.all(documentsWithCollaborators).then(results => {
      res.json({ documents: results });
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

                    const votes = (voteRows || []).map((vote) => ({
                      ...vote,
                      proposalId: vote.proposal_id,
                      userId: vote.user_id,
                      user: {
                        id: vote.user_id,
                        name: vote.user_name,
                        email: vote.user_email
                      }
                    }));

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
            owner: {
              id: document.owner_id,
              name: document.owner_name,
              email: document.owner_email
            },
            collaborators: normalizedCollaborators,
            paragraphs: paragraphData
          };

          res.json({ document: result });
        });
      });
    });
  });
});

// Create a new document
router.post('/', requireAuth, (req, res) => {
  console.log(`[${new Date().toISOString()}] POST /api/documents - Creating document`);
  console.log('Request body:', req.body);
  console.log('User:', req.user ? req.user.name : 'No user');

  const db = req.app.locals.db;
  const { title } = req.body;
  const userId = req.user.id;

  if (!title || title.trim() === '') {
    console.log('Document creation failed: Title is required');
    return res.status(400).json({ error: 'Title is required' });
  }

  const documentId = uuidv4();
  const trimmedTitle = title.trim();
  const titleParagraphId = `${documentId}-title`;

  db.run(`
    INSERT INTO documents (id, title, owner_id) VALUES (?, ?, ?)
  `, [documentId, trimmedTitle, userId], function(err) {
    if (err) {
      console.error('Error creating document:', err);
      return res.status(500).json({ error: 'Failed to create document' });
    }

    db.run(`
      INSERT OR IGNORE INTO paragraphs (id, document_id, title, text, order_index)
      VALUES (?, ?, ?, ?, -1)
    `, [titleParagraphId, documentId, trimmedTitle, trimmedTitle], (insertErr) => {
      if (insertErr) {
        console.error('Error ensuring document title paragraph:', insertErr);
      }

      db.run(`
        UPDATE paragraphs
        SET title = ?,
            text = CASE
              WHEN text IS NULL OR text = '' THEN ?
              ELSE text
            END,
            order_index = -1
        WHERE id = ?
      `, [trimmedTitle, trimmedTitle, titleParagraphId], (updateErr) => {
        if (updateErr) {
          console.error('Error updating document title paragraph:', updateErr);
        }

        // Return the created document
        db.get(`
          SELECT d.*,
                 u.name as owner_name,
                 u.email as owner_email
          FROM documents d
          JOIN users u ON d.owner_id = u.id
          WHERE d.id = ?
        `, [documentId], (err, document) => {
          if (err) {
            console.log('Document creation failed - could not retrieve:', err);
            return res.status(500).json({ error: 'Document created but failed to retrieve' });
          }

          const result = {
            ...document,
            owner: {
              id: document.owner_id,
              name: document.owner_name,
              email: document.owner_email
            },
            collaborators: []
          };

          console.log('Document created successfully:', { id: documentId, title: trimmedTitle });

          // Record business metrics
          metricsCollector.recordBusinessEvent('document_created', {
            documentId,
            ownerId: userId,
            title: trimmedTitle
          });

          res.status(201).json({ document: result });
        });
      });
    });
  });
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

module.exports = router;
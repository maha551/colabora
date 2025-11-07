const express = require('express');
const { v4: uuidv4 } = require('uuid');

const router = express.Router({ mergeParams: true });

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// Middleware to check document access (owner or collaborator)
const requireDocumentAccess = (req, res, next) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const userId = req.user.id;

  // First check if user is owner
  db.get('SELECT id FROM documents WHERE id = ? AND owner_id = ?', [documentId, userId], (err, ownerDoc) => {
    if (err) {
      console.error('Error checking owner access:', err);
      return res.status(500).json({ error: 'Access check failed' });
    }

    if (ownerDoc) {
      return next();
    }

    // Check if user is collaborator
    db.get('SELECT id FROM document_collaborators WHERE document_id = ? AND user_id = ?', [documentId, userId], (err, collabDoc) => {
      if (err) {
        console.error('Error checking collaborator access:', err);
        return res.status(500).json({ error: 'Access check failed' });
      }

      if (collabDoc) {
        return next();
      }

      return res.status(403).json({ error: 'Access denied to this document' });
    });
  });
};

// Create a new proposal/suggestion
router.post('/', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const paragraphId = req.params.paragraphId;
  const { text, type = 'BODY', headingLevel } = req.body;
  const userId = req.user.id;

  const normalizedHeadingLevel = type === 'TITLE' && headingLevel && ['h1', 'h2', 'h3'].includes(headingLevel.toLowerCase())
    ? headingLevel.toLowerCase()
    : null;

  if (!text || text.trim() === '') {
    return res.status(400).json({ error: 'Text is required' });
  }

  // Verify paragraph exists and belongs to document
  console.log('Checking paragraph:', paragraphId, 'in document:', documentId);

  db.get(`
    SELECT * FROM paragraphs WHERE id = ? AND document_id = ?
  `, [paragraphId, documentId], (err, paragraph) => {
    if (err) {
      console.error('Error checking paragraph:', err);
      return res.status(500).json({ error: 'Failed to create proposal' });
    }

    console.log('Paragraph check result:', paragraph);
    if (!paragraph) {
      console.log('Paragraph not found for id:', paragraphId, 'document:', documentId);
      return res.status(404).json({ error: 'Paragraph not found' });
    }

    const proposalId = uuidv4();

    db.run(`
      INSERT INTO proposals (id, paragraph_id, user_id, text, type, heading_level)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [proposalId, paragraphId, userId, text.trim(), type, normalizedHeadingLevel], function(err) {
      if (err) {
        console.error('Error creating proposal:', err);
        return res.status(500).json({ error: 'Failed to create proposal' });
      }

      // Update document timestamp
      db.run(`
        UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `, [documentId]);

      // Return the created proposal with user info
      db.get(`
        SELECT p.*,
               u.name as user_name,
               u.email as user_email
        FROM proposals p
        JOIN users u ON p.user_id = u.id
        WHERE p.id = ?
      `, [proposalId], (err, proposal) => {
        if (err) {
          return res.status(500).json({ error: 'Proposal created but failed to retrieve' });
        }

        const result = {
          ...proposal,
          user: {
            id: proposal.user_id,
            name: proposal.user_name,
            email: proposal.user_email
          },
          votes: [],
          comments: []
        };

        res.status(201).json({ proposal: result });
      });
    });
  });
});

// Get all proposals for a paragraph (this is mainly handled in the documents route, but keeping for completeness)
router.get('/', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const paragraphId = req.params.paragraphId;

  const query = `
    SELECT p.*,
           u.name as user_name,
           u.email as user_email
    FROM proposals p
    JOIN users u ON p.user_id = u.id
    WHERE p.paragraph_id = ?
    ORDER BY p.created_at DESC
  `;

  db.all(query, [paragraphId], (err, proposals) => {
    if (err) {
      console.error('Error fetching proposals:', err);
      return res.status(500).json({ error: 'Failed to fetch proposals' });
    }

    // Get votes and comments for each proposal
    const proposalsWithData = proposals.map(prop => {
      return new Promise((resolve) => {
        // Get votes
        const votesQuery = `
          SELECT v.*,
                 u.name as user_name
          FROM votes v
          JOIN users u ON v.user_id = u.id
          WHERE v.proposal_id = ?
        `;

        db.all(votesQuery, [prop.id], (err, votes) => {
          const processedVotes = votes.map(vote => ({
            ...vote,
            user: { id: vote.user_id, name: vote.user_name }
          }));

          // Get comments
          const commentsQuery = `
            SELECT c.*,
                   u.name as user_name,
                   u.email as user_email
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.proposal_id = ?
            ORDER BY c.created_at
          `;

          db.all(commentsQuery, [prop.id], (err, comments) => {
            const processedComments = comments.map(comment => ({
              ...comment,
              user: {
                id: comment.user_id,
                name: comment.user_name,
                email: comment.user_email
              }
            }));

            resolve({
              ...prop,
              user: {
                id: prop.user_id,
                name: prop.user_name,
                email: prop.user_email
              },
              votes: processedVotes,
              comments: processedComments
            });
          });
        });
      });
    });

    Promise.all(proposalsWithData).then(results => {
      res.json({ proposals: results });
    });
  });
});

module.exports = router;

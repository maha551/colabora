const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { metricsCollector } = require('../middleware/monitoring');
const { requireAuth, requireDocumentAccess } = require('../middleware/auth');
const webSocketManager = require('../modules/websocket');
const { logger } = require('../middleware/logger');

const router = express.Router({ mergeParams: true });

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

  // Check if there's an active structure proposal that would block new paragraph proposals
  const activeStructureQuery = `
    SELECT id FROM structure_proposals
    WHERE document_id = ? AND approved = 0 AND applied = 0
  `;

  db.get(activeStructureQuery, [documentId], (err, activeStructure) => {
    if (err) {
      logger.error('Error checking active structure proposals', { error: err.message, documentId });
      return res.status(500).json({ error: 'Failed to check active structure proposals' });
    }

    if (activeStructure) {
      return res.status(409).json({
        error: 'Cannot create paragraph proposals while a structure proposal is active. Please vote on or wait for the structure proposal to be resolved first.'
      });
    }

    // Verify paragraph exists and belongs to document
    logger.debug('Checking paragraph', { paragraphId, documentId });

    db.get(`
      SELECT * FROM paragraphs WHERE id = ? AND document_id = ?
    `, [paragraphId, documentId], (err, paragraph) => {
    if (err) {
      logger.error('Error checking paragraph', { error: err.message, paragraphId, documentId });
      return res.status(500).json({ error: 'Failed to create proposal' });
    }

    logger.debug('Paragraph check result', { paragraphId, documentId, found: !!paragraph });
    if (!paragraph) {
      logger.warn('Paragraph not found', { paragraphId, documentId });
      return res.status(404).json({ error: 'Paragraph not found' });
    }

    const proposalId = uuidv4();

    db.run(`
      INSERT INTO proposals (id, paragraph_id, user_id, text, type, heading_level)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [proposalId, paragraphId, userId, text.trim(), type, normalizedHeadingLevel], function(err) {
      if (err) {
        logger.error('Error creating proposal', { error: err.message, paragraphId, documentId, userId });
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

        // Record business metrics
        metricsCollector.recordBusinessEvent('proposal_created', {
          proposalId,
          paragraphId,
          userId,
          type,
          documentId
        });

        // Broadcast real-time update via WebSocket
        webSocketManager.broadcastProposalUpdate(documentId, paragraphId, result);

        res.status(201).json({ proposal: result });
      });
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
      logger.error('Error fetching proposals', { error: err.message, paragraphId, documentId });
      return res.status(500).json({ error: 'Failed to fetch proposals' });
    }

    // Get document voting_anonymous setting first
    const documentId = req.params.documentId;
    db.get(`SELECT voting_anonymous FROM documents WHERE id = (SELECT document_id FROM paragraphs WHERE id = ?)`, [paragraphId], (docErr, doc) => {
      const isAnonymous = doc?.voting_anonymous === 1;
      const userId = req.user.id;

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
            const processedVotes = votes.map(vote => {
              const voteData = { ...vote };
              // Hide user info if voting is anonymous
              if (!isAnonymous) {
                voteData.user = { id: vote.user_id, name: vote.user_name };
              } else {
                // In anonymous mode, only include userId for the current user's own vote
                if (vote.user_id === userId) {
                  voteData.userId = vote.user_id;
                }
                // Don't include user object for other users
              }
              return voteData;
            });

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
});

module.exports = router;

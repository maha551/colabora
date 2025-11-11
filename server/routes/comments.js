const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { metricsCollector } = require('../middleware/monitoring');
const { requireAuth, requireDocumentAccess } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// Add a comment to a proposal
router.post('/', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const paragraphId = req.params.paragraphId;
  const proposalId = req.params.proposalId;
  const { text, parentId } = req.body;
  const userId = req.user.id;

  if (!text || text.trim() === '') {
    return res.status(400).json({ error: 'Comment text is required' });
  }

  // Verify proposal exists and belongs to the correct paragraph and document
  const verifyQuery = `
    SELECT p.id, p.paragraph_id
    FROM proposals p
    JOIN paragraphs pr ON p.paragraph_id = pr.id
    WHERE p.id = ? AND pr.id = ? AND pr.document_id = ?
  `;

  db.get(verifyQuery, [proposalId, paragraphId, documentId], (err, proposal) => {
    if (err) {
      console.error('Error verifying proposal:', err);
      return res.status(500).json({ error: 'Failed to add comment' });
    }

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // If parentId is provided, verify it exists and belongs to the same proposal
    if (parentId) {
      db.get(`
        SELECT id FROM comments WHERE id = ? AND proposal_id = ?
      `, [parentId, proposalId], (err, parentComment) => {
        if (err) {
          console.error('Error verifying parent comment:', err);
          return res.status(500).json({ error: 'Failed to add comment' });
        }

        if (!parentComment) {
          return res.status(400).json({ error: 'Parent comment not found or does not belong to this proposal' });
        }

        createComment();
      });
    } else {
      createComment();
    }

    function createComment() {
      const commentId = uuidv4();

      db.run(`
        INSERT INTO comments (id, proposal_id, user_id, text, parent_id)
        VALUES (?, ?, ?, ?, ?)
      `, [commentId, proposalId, userId, text.trim(), parentId || null], function(err) {
        if (err) {
          console.error('Error adding comment:', err);
          return res.status(500).json({ error: 'Failed to add comment' });
        }

        // Update document timestamp
        db.run(`
          UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `, [documentId]);

        // Return the created comment with user info
        db.get(`
          SELECT c.*,
                 u.name as user_name,
                 u.email as user_email,
                 pc.user_id as parent_user_id,
                 pu.name as parent_user_name
          FROM comments c
          JOIN users u ON c.user_id = u.id
          LEFT JOIN comments pc ON c.parent_id = pc.id
          LEFT JOIN users pu ON pc.user_id = pu.id
          WHERE c.id = ?
        `, [commentId], (err, comment) => {
          if (err) {
            return res.status(500).json({ error: 'Comment added but failed to retrieve' });
          }

          const result = {
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
            replies: [] // Will be populated by frontend if needed
          };

          // Record business metrics
          metricsCollector.recordBusinessEvent('comment_posted', {
            commentId,
            proposalId,
            userId,
            parentId,
            documentId
          });

          res.status(201).json({ comment: result });
        });
      });
    }
  });
});

// Get all comments for a proposal (mainly handled in documents route, but keeping for completeness)
router.get('/', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const proposalId = req.params.proposalId;

  const query = `
    SELECT c.*,
           u.name as user_name,
           u.email as user_email,
           pc.user_id as parent_user_id,
           pu.name as parent_user_name
    FROM comments c
    JOIN users u ON c.user_id = u.id
    LEFT JOIN comments pc ON c.parent_id = pc.id
    LEFT JOIN users pu ON pc.user_id = pu.id
    WHERE c.proposal_id = ?
    ORDER BY c.created_at ASC
  `;

  db.all(query, [proposalId], (err, comments) => {
    if (err) {
      console.error('Error fetching comments:', err);
      return res.status(500).json({ error: 'Failed to fetch comments' });
    }

    // Process comments to include replies
    const processedComments = comments.map(comment => ({
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
      replies: comments.filter(c => c.parent_id === comment.id).map(reply => ({
        id: reply.id,
        user: { id: reply.user_id, name: reply.user_name }
      }))
    }));

    res.json({ comments: processedComments });
  });
});

module.exports = router;

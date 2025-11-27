const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { logger } = require('../middleware/logger');
const router = express.Router();

// GET /api/pending-votes - Get all proposals that need the current user's vote
router.get('/', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;

  // Get all documents the user has access to
  const documentsQuery = `
    SELECT d.id, d.title
    FROM documents d
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id
    WHERE d.owner_id = ? OR dc.user_id = ?
  `;

  db.all(documentsQuery, [userId, userId], (err, documents) => {
    if (err) {
      logger.error('Error fetching documents', { error: err.message, userId });
      return res.status(500).json({ error: 'Failed to fetch documents' });
    }

    if (documents.length === 0) {
      return res.json({ proposals: [] });
    }

    const documentIds = documents.map(d => d.id);
    const placeholders = documentIds.map(() => '?').join(',');

    // Get all proposals from these documents that:
    // 1. Are not approved yet
    // 2. User hasn't voted on
    const proposalsQuery = `
      SELECT 
        p.id,
        p.paragraph_id,
        p.user_id,
        p.text as proposed_text,
        p.type,
        p.heading_level,
        p.created_at,
        u.name as user_name,
        u.email as user_email,
        u.avatar as user_avatar,
        par.text as current_text,
        par.title as paragraph_title,
        par.heading_level as paragraph_heading_level,
        par.document_id,
        d.title as document_title,
        (SELECT COUNT(*) FROM votes v WHERE v.proposal_id = p.id) as total_votes,
        (SELECT COUNT(*) FROM votes v WHERE v.proposal_id = p.id AND v.vote = 'PRO') as pro_votes,
        (SELECT COUNT(*) FROM votes v WHERE v.proposal_id = p.id AND v.vote = 'CONTRA') as contra_votes,
        (SELECT COUNT(*) FROM votes v WHERE v.proposal_id = p.id AND v.vote = 'NEUTRAL') as neutral_votes,
        (SELECT COUNT(*) + 1 FROM document_collaborators dc WHERE dc.document_id = d.id) as total_users
      FROM proposals p
      JOIN users u ON p.user_id = u.id
      JOIN paragraphs par ON p.paragraph_id = par.id
      JOIN documents d ON par.document_id = d.id
      WHERE par.document_id IN (${placeholders})
        AND p.approved = 0
        AND p.id NOT IN (
          SELECT proposal_id FROM votes WHERE user_id = ?
        )
      ORDER BY p.created_at DESC
    `;

    db.all(proposalsQuery, [...documentIds, userId], (err, proposals) => {
      if (err) {
        logger.error('Error fetching proposals', { error: err.message, userId, documentCount: documents.length });
        return res.status(500).json({ error: 'Failed to fetch proposals' });
      }

      // Format the proposals
      const formattedProposals = proposals.map(proposal => ({
        id: proposal.id,
        paragraphId: proposal.paragraph_id,
        documentId: proposal.document_id,
        documentTitle: proposal.document_title,
        paragraphTitle: proposal.paragraph_title,
        proposedText: proposal.proposed_text,
        currentText: proposal.current_text,
        type: proposal.type,
        headingLevel: proposal.heading_level || proposal.paragraph_heading_level,
        createdAt: proposal.created_at,
        user: {
          id: proposal.user_id,
          name: proposal.user_name,
          email: proposal.user_email,
          avatar: proposal.user_avatar,
        },
        votes: {
          total: proposal.total_votes || 0,
          pro: proposal.pro_votes || 0,
          contra: proposal.contra_votes || 0,
          neutral: proposal.neutral_votes || 0,
        },
        totalUsers: proposal.total_users || 1,
      }));

      res.json({ proposals: formattedProposals });
    });
  });
});

module.exports = router;


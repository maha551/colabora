const express = require('express');
const router = express.Router();

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// GET /api/agreed-versions - Get recently accepted proposal versions
router.get('/', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;
  const since = req.query.since; // Optional timestamp filter for "new since last visit"

  try {
    // Get all documents the user has access to
    const documentsQuery = `
      SELECT d.id, d.title
      FROM documents d
      LEFT JOIN document_collaborators dc ON d.id = dc.document_id
      WHERE d.owner_id = ? OR dc.user_id = ?
    `;

    const documents = await getAllDocuments(db, documentsQuery, [userId, userId]);

    if (documents.length === 0) {
      return res.json({ versions: [] });
    }

    const documentIds = documents.map(d => d.id);
    const placeholders = documentIds.map(() => '?').join(',');

    // Build query with optional time filter
    let timeFilter = '';
    let params = documentIds;

    if (since) {
      timeFilter = ' AND h.created_at > ?';
      params = [...documentIds, since];
    }

    // Get recently accepted versions with real approval data
    const query = `
      SELECT
        h.id,
        h.paragraph_id,
        h.new_text as accepted_text,
        h.old_text as previous_text,
        h.approval_percentage,
        h.created_at as accepted_at,
        h.proposal_id,

        -- Document and paragraph info
        d.id as document_id,
        d.title as document_title,
        p.title as paragraph_title,
        p.text as current_paragraph_text,

        -- User who accepted the proposal
        u.id as user_id,
        u.name as user_name,
        u.avatar as user_avatar,

        -- Additional context: total votes for this proposal
        (SELECT COUNT(*) FROM votes v WHERE v.proposal_id = h.proposal_id) as total_votes,
        (SELECT COUNT(*) FROM votes v WHERE v.proposal_id = h.proposal_id AND v.vote = 'PRO') as pro_votes

      FROM history h
      JOIN paragraphs p ON h.paragraph_id = p.id
      JOIN documents d ON p.document_id = d.id
      JOIN users u ON h.user_id = u.id

      WHERE p.document_id IN (${placeholders})
        AND h.approval_percentage >= 75  -- Only highly approved changes
        ${timeFilter}

      ORDER BY h.created_at DESC
      LIMIT 20
    `;

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('Error fetching agreed versions:', err);
        return res.status(500).json({ error: 'Failed to fetch agreed versions' });
      }

      // Format the results
      const formattedVersions = rows.map(row => ({
        id: `agreed-${row.id}`,
        documentId: row.document_id,
        documentTitle: row.document_title,
        paragraphTitle: row.paragraph_title,
        acceptedText: row.accepted_text,
        previousText: row.previous_text || 'Previous version not available',
        approvalPercentage: row.approval_percentage,
        acceptedAt: row.accepted_at,
        userName: row.user_name,
        userId: row.user_id,
        userAvatar: row.user_avatar,
        // Additional metadata
        totalVotes: row.total_votes || 0,
        proVotes: row.pro_votes || 0,
      }));

      console.log(`📋 Found ${formattedVersions.length} agreed versions for user ${userId}`);
      res.json({ versions: formattedVersions });
    });

  } catch (error) {
    console.error('Error in agreed versions API:', error);
    res.status(500).json({ error: 'Failed to fetch agreed versions' });
  }
});

// Helper function to get all documents for a user
function getAllDocuments(db, query, params) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

module.exports = router;

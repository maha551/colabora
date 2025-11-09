const express = require('express');
const router = express.Router({ mergeParams: true });

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// GET /api/documents/:documentId/activity - Get recent activity for a document
router.get('/', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const { documentId } = req.params;
  const userId = req.user.id;

  // First verify user has access to this document
  const checkAccessQuery = `
    SELECT d.id 
    FROM documents d
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id
    WHERE d.id = ? 
      AND (d.owner_id = ? OR dc.user_id = ?)
  `;

  db.get(checkAccessQuery, [documentId, userId, userId], (err, doc) => {
    if (err) {
      console.error('Database error checking document access:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!doc) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get document acceptance threshold
    db.get(`SELECT acceptance_threshold FROM documents WHERE id = ?`, [documentId], (docErr, document) => {
      if (docErr) {
        console.error('Error fetching document threshold:', docErr);
        return res.status(500).json({ error: 'Failed to fetch document threshold' });
      }

      const acceptanceThreshold = document?.acceptance_threshold || 75.0;

      // Get activities from multiple sources
      const activitiesQuery = `
        SELECT 
          'proposal_created' as type,
          p.id,
          p.user_id as userId,
          u.name as userName,
          u.avatar as userAvatar,
          pr.title as paragraphTitle,
          p.text as proposalText,
          p.created_at as timestamp
        FROM proposals p
        JOIN paragraphs pr ON p.paragraph_id = pr.id
        JOIN users u ON p.user_id = u.id
        WHERE pr.document_id = ?

        UNION ALL

        SELECT 
          'proposal_accepted' as type,
          h.id,
          h.user_id as userId,
          u.name as userName,
          u.avatar as userAvatar,
          pr.title as paragraphTitle,
          h.new_text as proposalText,
          h.created_at as timestamp
        FROM history h
        JOIN paragraphs pr ON h.paragraph_id = pr.id
        JOIN users u ON h.user_id = u.id
        WHERE pr.document_id = ? AND h.approval_percentage >= ?

      UNION ALL

      SELECT 
        'vote_cast' as type,
        v.id,
        v.user_id as userId,
        u.name as userName,
        u.avatar as userAvatar,
        pr.title as paragraphTitle,
        v.vote as voteType,
        v.created_at as timestamp,
        d.voting_anonymous
      FROM votes v
      JOIN proposals p ON v.proposal_id = p.id
      JOIN paragraphs pr ON p.paragraph_id = pr.id
      JOIN documents d ON pr.document_id = d.id
      LEFT JOIN users u ON v.user_id = u.id AND d.voting_anonymous = 0
      WHERE pr.document_id = ?

      UNION ALL

      SELECT 
        'comment_added' as type,
        c.id,
        c.user_id as userId,
        u.name as userName,
        u.avatar as userAvatar,
        pr.title as paragraphTitle,
        c.text as commentText,
        c.created_at as timestamp
      FROM comments c
      JOIN proposals p ON c.proposal_id = p.id
      JOIN paragraphs pr ON p.paragraph_id = pr.id
      JOIN users u ON c.user_id = u.id
      WHERE pr.document_id = ?

      UNION ALL

      SELECT
        'structure_proposal_created' as type,
        sp.id,
        sp.user_id as userId,
        u.name as userName,
        u.avatar as userAvatar,
        sp.title as paragraphTitle,
        sp.description as proposalText,
        sp.created_at as timestamp
      FROM structure_proposals sp
      JOIN users u ON sp.user_id = u.id
      WHERE sp.document_id = ?

      UNION ALL

      SELECT
        'structure_proposal_vote' as type,
        spv.id,
        spv.user_id as userId,
        u.name as userName,
        u.avatar as userAvatar,
        sp.title as paragraphTitle,
        spv.vote as voteType,
        spv.created_at as timestamp
      FROM structure_proposal_votes spv
      JOIN structure_proposals sp ON spv.structure_proposal_id = sp.id
      JOIN users u ON spv.user_id = u.id
      WHERE sp.document_id = ?

      UNION ALL

      SELECT
        'structure_proposal_approved' as type,
        sp.id,
        sp.user_id as userId,
        u.name as userName,
        u.avatar as userAvatar,
        sp.title as paragraphTitle,
        'Structure proposal approved' as proposalText,
        sp.updated_at as timestamp
      FROM structure_proposals sp
      JOIN users u ON sp.user_id = u.id
      WHERE sp.document_id = ? AND sp.approved = 1

      UNION ALL

      SELECT
        'structure_proposal_applied' as type,
        sp.id,
        sp.user_id as userId,
        u.name as userName,
        u.avatar as userAvatar,
        sp.title as paragraphTitle,
        'Structure changes applied' as proposalText,
        sp.updated_at as timestamp
      FROM structure_proposals sp
      JOIN users u ON sp.user_id = u.id
      WHERE sp.document_id = ? AND sp.applied = 1

      ORDER BY timestamp DESC
      LIMIT 50
    `;

    db.all(
      activitiesQuery,
      [documentId, documentId, acceptanceThreshold, documentId, documentId, documentId, documentId],
      (err, activities) => {
        if (err) {
          console.error('Error fetching activities:', err);
          return res.status(500).json({ error: 'Failed to fetch activities' });
        }

        // Transform the data to match frontend expectations
        const formattedActivities = activities.map(activity => {
          // Hide user info for vote_cast activities if voting is anonymous
          const isVoteCast = activity.type === 'vote_cast';
          const isAnonymous = activity.voting_anonymous === 1;
          
          return {
            id: activity.id,
            type: activity.type,
            userId: (isVoteCast && isAnonymous) ? undefined : activity.userId,
            userName: (isVoteCast && isAnonymous) ? undefined : activity.userName,
            userAvatar: (isVoteCast && isAnonymous) ? undefined : activity.userAvatar,
            paragraphTitle: activity.paragraphTitle,
            proposalText: activity.proposalText,
            voteType: activity.voteType,
            commentText: activity.commentText,
            timestamp: activity.timestamp,
          };
        });

        res.json({ activities: formattedActivities });
      }
    );
    });
  });
});

module.exports = router;


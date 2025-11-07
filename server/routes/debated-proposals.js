const express = require('express');
const router = express.Router();

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// GET /api/debated-proposals - Get most debated proposals for user's documents
router.get('/', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;

  try {
    // Get all documents the user has access to
    const documentsQuery = `
      SELECT d.id, d.title,
             (SELECT COUNT(*) + 1 FROM document_collaborators dc WHERE dc.document_id = d.id) as userCount
      FROM documents d
      LEFT JOIN document_collaborators dc ON d.id = dc.document_id
      WHERE d.owner_id = ? OR dc.user_id = ?
    `;

    const documents = await getAllDocuments(db, documentsQuery, [userId, userId]);

    if (documents.length === 0) {
      return res.json({ proposals: [] });
    }

    const documentIds = documents.map(d => d.id);

    // Get debated proposals with engagement scoring
    const debatedProposals = await calculateDebatedProposals(db, documentIds, documents);

    // Return top 10 most debated proposals
    res.json({ proposals: debatedProposals.slice(0, 10) });

  } catch (error) {
    console.error('Error in debated proposals API:', error);
    res.status(500).json({ error: 'Failed to fetch debated proposals' });
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

// Calculate debated proposals with engagement scoring
async function calculateDebatedProposals(db, documentIds, documents) {
  if (documentIds.length === 0) return [];

  const placeholders = documentIds.map(() => '?').join(',');

  const query = `
    SELECT
      p.id,
      p.paragraph_id,
      p.user_id,
      p.text as proposed_text,
      p.type,
      p.heading_level,
      p.created_at,

      -- User info
      u.name as user_name,
      u.email as user_email,
      u.avatar as user_avatar,

      -- Document and paragraph info
      d.title as document_title,
      par.text as current_text,
      par.title as paragraph_title,
      par.document_id,

      -- Engagement metrics
      COALESCE(comment_counts.comment_count, 0) as comment_count,
      COALESCE(vote_counts.total_votes, 0) as total_votes,
      COALESCE(vote_counts.pro_votes, 0) as pro_votes,
      COALESCE(vote_counts.contra_votes, 0) as contra_votes,
      COALESCE(vote_counts.neutral_votes, 0) as neutral_votes,

      -- Time factor for scoring
      ((julianday('now') - julianday(p.created_at)) * 24) as hours_old

    FROM proposals p
    JOIN users u ON p.user_id = u.id
    JOIN paragraphs par ON p.paragraph_id = par.id
    JOIN documents d ON par.document_id = d.id

    -- Left join for comment counts
    LEFT JOIN (
      SELECT proposal_id, COUNT(*) as comment_count
      FROM comments
      GROUP BY proposal_id
    ) comment_counts ON p.id = comment_counts.proposal_id

    -- Left join for vote counts
    LEFT JOIN (
      SELECT
        proposal_id,
        COUNT(*) as total_votes,
        SUM(CASE WHEN vote = 'PRO' THEN 1 ELSE 0 END) as pro_votes,
        SUM(CASE WHEN vote = 'CONTRA' THEN 1 ELSE 0 END) as contra_votes,
        SUM(CASE WHEN vote = 'NEUTRAL' THEN 1 ELSE 0 END) as neutral_votes
      FROM votes
      GROUP BY proposal_id
    ) vote_counts ON p.id = vote_counts.proposal_id

    WHERE par.document_id IN (${placeholders})
      AND p.approved = 0
      AND p.created_at > datetime('now', '-30 days')  -- Only recent proposals

    ORDER BY p.created_at DESC
  `;

  return new Promise((resolve, reject) => {
    db.all(query, documentIds, (err, rows) => {
      if (err) {
        console.error('Error querying debated proposals:', err);
        return reject(err);
      }

      if (rows.length === 0) {
        resolve([]);
        return;
      }

      // Get proposal IDs for comments query
      const proposalIds = rows.map(row => row.id);
      const commentPlaceholders = proposalIds.map(() => '?').join(',');

      // Query for comments
      const commentsQuery = `
        SELECT c.proposal_id, c.id, c.user_id, c.text, c.created_at,
               u.name as user_name, u.avatar as user_avatar
        FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.proposal_id IN (${commentPlaceholders})
        ORDER BY c.created_at ASC
      `;

      db.all(commentsQuery, proposalIds, (commentErr, commentRows) => {
        if (commentErr) {
          console.error('Error querying comments:', commentErr);
          return reject(commentErr);
        }

        // Group comments by proposal_id
        const commentsByProposal = {};
        commentRows.forEach(comment => {
          if (!commentsByProposal[comment.proposal_id]) {
            commentsByProposal[comment.proposal_id] = [];
          }
          commentsByProposal[comment.proposal_id].push({
            id: comment.id,
            text: comment.text,
            createdAt: comment.created_at,
            user: {
              id: comment.user_id,
              name: comment.user_name,
              avatar: comment.user_avatar,
            }
          });
        });

        // Calculate debate scores and format results
        const scoredProposals = rows.map(row => {
          const debateScore = calculateDebateScore(row);
          const document = documents.find(d => d.id === row.document_id);

          return {
            id: row.id,
            debateScore: Math.round(debateScore * 100) / 100, // Round to 2 decimal places
            commentCount: row.comment_count,
            controversyScore: row.total_votes > 0 ?
              Math.round((row.pro_votes / row.total_votes) * (row.contra_votes / row.total_votes) * 400) / 100 : 0,
            engagement: {
              comments: row.comment_count,
              proPercentage: row.total_votes > 0 ? Math.round((row.pro_votes / row.total_votes) * 100) : 0,
              contraPercentage: row.total_votes > 0 ? Math.round((row.contra_votes / row.total_votes) * 100) : 0,
              neutralPercentage: row.total_votes > 0 ?
                Math.round(((row.neutral_votes) / row.total_votes) * 100) : 0,
            },
            comments: commentsByProposal[row.id] || [],
            // Include all existing proposal fields
            paragraphId: row.paragraph_id,
            documentId: row.document_id,
            documentTitle: row.document_title,
            paragraphTitle: row.paragraph_title,
            proposedText: row.proposed_text,
            currentText: row.current_text,
            type: row.type,
            headingLevel: row.heading_level,
            createdAt: row.created_at,
            user: {
              id: row.user_id,
              name: row.user_name,
              email: row.user_email,
              avatar: row.user_avatar,
            },
            votes: {
              total: row.total_votes,
              pro: row.pro_votes,
              contra: row.contra_votes,
              neutral: row.neutral_votes,
            },
            totalUsers: document ? document.userCount : 1,
          };
        });

        // Sort by debate score descending
        scoredProposals.sort((a, b) => b.debateScore - a.debateScore);

        resolve(scoredProposals);
      });
    });
  });
}

// Calculate debate score based on multiple factors
function calculateDebateScore(row) {
  const commentFactor = (row.comment_count || 0) * 2.0; // Comments are valuable engagement

  // Controversy factor: high when both PRO and CONTRA votes are significant
  const controversyFactor = row.total_votes > 0 ?
    (row.pro_votes / row.total_votes) * (row.contra_votes / row.total_votes) * 4.0 : 0;

  // Time decay factor: newer proposals get slight boost, very old ones are penalized
  const hoursOld = row.hours_old || 0;
  let timeFactor;
  if (hoursOld < 24) {
    timeFactor = 1.2; // Fresh proposals get boost
  } else if (hoursOld < 168) { // 7 days
    timeFactor = 1.0; // Normal time factor
  } else {
    timeFactor = Math.max(0.1, 1.0 - (hoursOld - 168) / 720); // Gradual decay after 7 days
  }

  // Participation factor: more votes = more engagement
  const participationFactor = Math.min(row.total_votes / 5, 2.0); // Cap at 2.0 for proposals with 5+ votes

  const totalScore = (commentFactor + controversyFactor + participationFactor) * timeFactor;

  return totalScore;
}

module.exports = router;

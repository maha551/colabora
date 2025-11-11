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

// Middleware to check for active structure proposals that would prevent modifications
const checkNoActiveStructureProposals = (req, res, next) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;

  // Check if there are any active (unapplied) structure proposals for this document
  const activeProposalQuery = `
    SELECT COUNT(*) as count FROM structure_proposals
    WHERE document_id = ? AND applied = 0
  `;

  db.get(activeProposalQuery, [documentId], (err, result) => {
    if (err) {
      // If table doesn't exist, allow the operation (table will be created on first use)
      if (err.code === 'SQLITE_ERROR' && err.message.includes('no such table')) {
        console.log('Structure proposals table does not exist yet, allowing paragraph modification');
        return next();
      }
      console.error('Error checking for active structure proposals:', err);
      return res.status(500).json({ error: 'Failed to check document status' });
    }

    if (result && result.count > 0) {
      return res.status(409).json({
        error: 'Cannot modify paragraphs while there are active structure proposals. Please resolve all pending structure proposals before making changes.',
        activeProposals: result.count
      });
    }

    // No active proposals, allow the operation
    next();
  });
};

// Middleware to check document access (owner or collaborator)
const requireDocumentAccess = (req, res, next) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const userId = req.user ? req.user.id : 'no-user';

  console.log(`Access check for document ${documentId}, user ${userId}`);

  if (!req.user) {
    console.log('Access denied: No user authenticated');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const query = `
    SELECT d.id, d.owner_id FROM documents d
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id
    WHERE d.id = ? AND (d.owner_id = ? OR dc.user_id = ?)
  `;

  db.get(query, [documentId, userId, userId], (err, document) => {
    if (err) {
      console.error('Error checking document access:', err);
      return res.status(500).json({ error: 'Access check failed' });
    }

    if (!document) {
      console.log(`Access denied for document ${documentId}: user ${userId} is not owner/collaborator`);

      // Additional debug: check if document exists at all
      db.get('SELECT id, owner_id FROM documents WHERE id = ?', [documentId], (docErr, docResult) => {
        if (docErr) {
          console.error('Error checking if document exists:', docErr);
        } else if (docResult) {
          console.log(`Document exists, owned by: ${docResult.owner_id}`);
        } else {
          console.log('Document does not exist');
        }
      });

      return res.status(403).json({ error: 'Access denied to this document' });
    }

    console.log(`Access granted for document ${documentId} to user ${userId}`);
    next();
  });
};

// Get contextual paragraphs around a specific paragraph
router.get('/context/:paragraphId', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const paragraphId = req.params.paragraphId;
  const contextSize = parseInt(req.query.context) || 2; // Number of paragraphs before/after

  // First get the target paragraph's order
  db.get(
    'SELECT order_index FROM paragraphs WHERE id = ? AND document_id = ?',
    [paragraphId, documentId],
    (err, targetPara) => {
      if (err) {
        console.error('Error finding target paragraph:', err);
        return res.status(500).json({ error: 'Failed to find target paragraph' });
      }

      if (!targetPara) {
        return res.status(404).json({ error: 'Target paragraph not found' });
      }

      const targetOrder = targetPara.order_index;
      const minOrder = Math.max(0, targetOrder - contextSize);
      const maxOrder = targetOrder + contextSize;
      const userId = req.user.id;

      // Get document voting_anonymous setting
      db.get(`SELECT voting_anonymous FROM documents WHERE id = ?`, [documentId], (docErr, doc) => {
        const isAnonymous = doc?.voting_anonymous === 1;

        // Get paragraphs in the context window
        db.all(
        `
        SELECT
          p.*,
          json_group_array(
            json_object(
              'id', pr.id,
              'user_id', pr.user_id,
              'text', pr.text,
              'type', pr.type,
              'heading_level', pr.heading_level,
              'votes', (
                SELECT json_group_array(
                  json_object('user_id', v.user_id, 'vote', v.vote)
                )
                FROM votes v WHERE v.proposal_id = pr.id
              ),
              'comments', (
                SELECT json_group_array(
                  json_object(
                    'id', c.id,
                    'user_id', c.user_id,
                    'text', c.text,
                    'parent_id', c.parent_id,
                    'created_at', c.created_at,
                    'updated_at', c.updated_at
                  )
                )
                FROM comments c WHERE c.proposal_id = pr.id
              ),
              'created_at', pr.created_at,
              'approved', pr.approved
            )
          ) as proposals_json
        FROM paragraphs p
        LEFT JOIN proposals pr ON p.id = pr.paragraph_id
        WHERE p.document_id = ? AND p.order_index BETWEEN ? AND ?
        GROUP BY p.id
        ORDER BY p.order_index
        `,
        [documentId, minOrder, maxOrder],
        (err, rows) => {
          if (err) {
            console.error('Error fetching contextual paragraphs:', err);
            return res.status(500).json({ error: 'Failed to fetch contextual paragraphs' });
          }

          // Process the results
          const paragraphs = rows.map(row => {
            let proposals = [];
            try {
              if (row.proposals_json && row.proposals_json !== '[null]') {
                proposals = JSON.parse(row.proposals_json).filter(p => p.id !== null);
              }
            } catch (e) {
              console.error('Error parsing proposals JSON:', e);
            }

            return {
              id: row.id,
              document_id: row.document_id,
              title: row.title,
              text: row.text,
              heading_level: row.heading_level,
              order: row.order_index,
              isDocumentTitle: row.order_index < 0,
              proposals: proposals.map(p => {
                let votes = p.votes ? JSON.parse(p.votes).filter(v => v.user_id) : [];
                // Filter user_id from votes if voting is anonymous
                if (isAnonymous) {
                  votes = votes.map(v => {
                    // Only include user_id for the current user's own vote
                    if (v.user_id === userId) {
                      return { userId: v.user_id, vote: v.vote };
                    }
                    return { vote: v.vote }; // Remove user_id for other users
                  });
                }
                return {
                  ...p,
                  votes,
                  comments: p.comments ? JSON.parse(p.comments).filter(c => c.id) : []
                };
              })
            };
          });

          res.json({
            paragraphs,
            targetParagraphId: paragraphId,
            contextWindow: { min: minOrder, max: maxOrder, target: targetOrder }
          });
        }
      );
      });
    }
  );
});

// Get all paragraphs for a document
router.get('/', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const userId = req.user.id;

  // Get document voting_anonymous setting
  db.get(`SELECT voting_anonymous FROM documents WHERE id = ?`, [documentId], (docErr, doc) => {
    const isAnonymous = doc?.voting_anonymous === 1;

    db.all(
    `
    SELECT
      p.*,
      json_group_array(
        json_object(
          'id', pr.id,
          'user_id', pr.user_id,
          'text', pr.text,
          'type', pr.type,
          'heading_level', pr.heading_level,
          'votes', (
            SELECT json_group_array(
              json_object('user_id', v.user_id, 'vote', v.vote)
            )
            FROM votes v WHERE v.proposal_id = pr.id
          ),
          'comments', (
            SELECT json_group_array(
              json_object(
                'id', c.id,
                'user_id', c.user_id,
                'text', c.text,
                'parent_id', c.parent_id,
                'created_at', c.created_at,
                'updated_at', c.updated_at
              )
            )
            FROM comments c WHERE c.proposal_id = pr.id
          ),
          'created_at', pr.created_at,
          'updated_at', pr.updated_at
        )
      ) as proposals_json,
      json_group_array(
        json_object(
          'id', h.id,
          'paragraph_id', h.paragraph_id,
          'user_id', h.user_id,
          'old_text', h.old_text,
          'new_text', h.new_text,
          'approval_percentage', h.approval_percentage,
          'proposal_id', h.proposal_id,
          'accepted_at', h.accepted_at
        )
      ) as history_json
    FROM paragraphs p
    LEFT JOIN proposals pr ON p.id = pr.paragraph_id
    LEFT JOIN history h ON p.id = h.paragraph_id
    WHERE p.document_id = ?
    GROUP BY p.id
    ORDER BY p.order_index ASC, p.created_at ASC
  `,
    [documentId],
    (err, rows) => {
      if (err) {
        console.error('Error fetching paragraphs:', err);
        return res.status(500).json({ error: 'Failed to fetch paragraphs' });
      }

      // Parse the JSON strings back to objects
      const paragraphs = rows.map(row => {
        let proposals = [];
        if (row.proposals_json && row.proposals_json !== '[null]') {
          proposals = JSON.parse(row.proposals_json).filter(p => p.id !== null);
          // Filter user_id from votes if voting is anonymous
          if (isAnonymous) {
            proposals = proposals.map(p => {
              if (p.votes) {
                const votes = JSON.parse(p.votes);
                p.votes = votes.map(v => {
                  // Only include user_id for the current user's own vote
                  if (v.user_id === userId) {
                    return { userId: v.user_id, vote: v.vote };
                  }
                  return { vote: v.vote }; // Remove user_id for other users
                });
              }
              return p;
            });
          }
        }
        
        return {
          ...row,
          proposals,
          history: row.history_json && row.history_json !== '[null]'
            ? JSON.parse(row.history_json).filter(h => h.id !== null)
            : []
        };
      });

      res.json({ paragraphs });
    }
  );
  });
});

function normalizeParagraphOrder(db, documentId) {
  return new Promise((resolve, reject) => {
    // First, check if normalization is actually needed
    db.all(
      `
      SELECT id, order_index, created_at
      FROM paragraphs
      WHERE document_id = ?
        AND (order_index IS NULL OR order_index >= 0)
      ORDER BY order_index ASC, created_at ASC, id ASC
    `,
      [documentId],
      (err, rows) => {
        if (err) {
          console.error('Error fetching paragraphs for normalization check:', err);
          return reject(err);
        }

        if (!rows || rows.length === 0) {
          return resolve();
        }

        // Check if any paragraphs have duplicate or too-close order_index values
        let needsNormalization = false;
        const usedOrders = new Set();

        for (let i = 0; i < rows.length; i++) {
          const currentOrder = rows[i].order_index || 0;

          // Check for duplicates or orders that are too close (less than 1 apart)
          if (usedOrders.has(currentOrder) ||
              (i > 0 && Math.abs(currentOrder - (rows[i-1].order_index || 0)) < 1)) {
            needsNormalization = true;
            break;
          }

          usedOrders.add(currentOrder);
        }

        if (!needsNormalization) {
          console.log('Paragraph order normalization not needed for document:', documentId);
          return resolve();
        }

        console.log('Normalizing paragraph order for document:', documentId);

        // Only normalize if there are conflicts
        let index = 0;
        const updateNext = () => {
          if (index >= rows.length) {
            resolve();
            return;
          }

          const row = rows[index];
          const newOrder = index * 10; // Use larger gaps to allow insertions

          db.run(
            `
            UPDATE paragraphs SET order_index = ? WHERE id = ?
          `,
            [newOrder, row.id],
            (updateErr) => {
              if (updateErr) {
                console.error('Error normalizing paragraph order:', updateErr);
                reject(updateErr);
                return;
              }

              index += 1;
              updateNext();
            }
          );
        };

        updateNext();
      }
    );
  });
}

// Create a new paragraph
router.post('/', requireAuth, requireDocumentAccess, checkNoActiveStructureProposals, (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const { title, text, order, order_index, asSuggestion, headingLevel } = req.body;

  console.log(`Creating paragraph in document ${documentId} for user ${req.user.id}`);
  console.log('Request body:', { title, text, order, asSuggestion, headingLevel });

  const bodyText = (text || '').trim();
  const headingText = title && typeof title === 'string' ? title.trim() : null;
  const createAsSuggestion = Boolean(asSuggestion);
  const normalizedHeadingLevel = ['h1', 'h2', 'h3'].includes((headingLevel || '').toLowerCase())
    ? headingLevel.toLowerCase()
    : (createAsSuggestion ? null : 'h2');

  // For suggestions, we need either text or title
  // For regular paragraphs, we need text
  if (!createAsSuggestion && bodyText === '') {
    return res.status(400).json({ error: 'Text is required' });
  }
  if (createAsSuggestion && bodyText === '' && !headingText) {
    return res.status(400).json({ error: 'Either text or title is required for suggestions' });
  }

  const paragraphId = uuidv4();
  const orderIndex = typeof (order ?? order_index) === 'number' ? (order ?? order_index) : 0;

  const paragraphTitle = createAsSuggestion ? null : headingText;
  const paragraphBody = createAsSuggestion ? '' : bodyText;
  const paragraphHeadingLevel = createAsSuggestion ? null : normalizedHeadingLevel;

  db.run(
    `
    INSERT INTO paragraphs (id, document_id, title, heading_level, text, order_index)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
    [paragraphId, documentId, paragraphTitle, paragraphHeadingLevel, paragraphBody, orderIndex],
    function (err) {
      if (err) {
        console.error('Error creating paragraph:', err);
        return res.status(500).json({ error: 'Failed to create paragraph' });
      }

      const finalizeResponse = () => {
        db.get(
          `
          SELECT * FROM paragraphs WHERE id = ?
        `,
          [paragraphId],
          (fetchErr, paragraph) => {
            if (fetchErr) {
              return res.status(500).json({ error: 'Paragraph created but failed to retrieve' });
            }

            res.status(201).json({ paragraph });
          }
        );
      };

      const completeCreation = () => {
        db.run(
          `
          UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `,
          [documentId]
        );

        normalizeParagraphOrder(db, documentId)
          .catch((normalizeErr) => {
            console.error('Failed to normalize paragraph order:', normalizeErr);
          })
          .finally(() => finalizeResponse());
      };

      const createProposals = () => {
        const tasks = [];

        const createBodyProposal = () =>
          new Promise((resolve, reject) => {
            const proposalId = uuidv4();
            db.run(
              `
              INSERT INTO proposals (id, paragraph_id, user_id, text, type, heading_level)
              VALUES (?, ?, ?, ?, ?, ?)
            `,
              [proposalId, paragraphId, req.user.id, bodyText, 'BODY', null],
              (proposalErr) => {
                if (proposalErr) {
                  console.error('Error creating body proposal:', proposalErr);
                  reject(proposalErr);
                } else {
                  resolve();
                }
              }
            );
          });

        tasks.push(createBodyProposal());

        if (headingText) {
          const createHeadingProposal = () =>
            new Promise((resolve, reject) => {
              const headingProposalId = uuidv4();
              db.run(
                `
                INSERT INTO proposals (id, paragraph_id, user_id, text, type, heading_level)
                VALUES (?, ?, ?, ?, ?, ?)
              `,
                [headingProposalId, paragraphId, req.user.id, headingText, 'TITLE', normalizedHeadingLevel || 'h2'],
                (proposalErr) => {
                  if (proposalErr) {
                    console.error('Error creating heading proposal:', proposalErr);
                    reject(proposalErr);
                  } else {
                    resolve();
                  }
                }
              );
            });

          tasks.push(createHeadingProposal());
        }

        return Promise.all(tasks);
      };

      if (createAsSuggestion) {
        db.run('BEGIN TRANSACTION', (beginErr) => {
          if (beginErr) {
            console.error('Failed to begin transaction for paragraph suggestion:', beginErr);
            db.run(
              `
              DELETE FROM paragraphs WHERE id = ?
            `,
              [paragraphId],
              () => res.status(500).json({ error: 'Failed to create paragraph suggestion' })
            );
            return;
          }

          createProposals()
            .then(() => {
              db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  console.error('Failed to commit paragraph suggestion transaction:', commitErr);
                  db.run('ROLLBACK', () => {
                    db.run(
                      `
                      DELETE FROM paragraphs WHERE id = ?
                    `,
                      [paragraphId],
                      () => res.status(500).json({ error: 'Failed to create paragraph suggestion' })
                    );
                  });
                  return;
                }

                completeCreation();
              });
            })
            .catch((proposalErr) => {
              console.error('Failed to create paragraph suggestion:', proposalErr);
              db.run('ROLLBACK', () => {
                db.run(
                  `
                  DELETE FROM paragraphs WHERE id = ?
                `,
                  [paragraphId],
                  () => res.status(500).json({ error: 'Failed to create paragraph suggestion' })
                );
              });
            });
        });
      } else {
        completeCreation();
      }
    }
  );
});

// Update a paragraph
router.put('/:paragraphId', requireAuth, requireDocumentAccess, checkNoActiveStructureProposals, (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const paragraphId = req.params.paragraphId;
  const { title, text, order } = req.body;

  if (!text || text.trim() === '') {
    return res.status(400).json({ error: 'Text is required' });
  }

  // Get current paragraph for history
  db.get(`
    SELECT text FROM paragraphs WHERE id = ? AND document_id = ?
  `, [paragraphId, documentId], (err, currentParagraph) => {
    if (err) {
      console.error('Error fetching current paragraph:', err);
      return res.status(500).json({ error: 'Failed to update paragraph' });
    }

    if (!currentParagraph) {
      return res.status(404).json({ error: 'Paragraph not found' });
    }

    // Update paragraph
    const updateData = {
      title: title || null,
      text: text.trim(),
      order_index: order !== undefined ? order : undefined
    };

    let updateQuery = 'UPDATE paragraphs SET ';
    const params = [];
    const updates = [];

    if (updateData.title !== undefined) {
      updates.push('title = ?');
      params.push(updateData.title);
    }
    if (updateData.text !== undefined) {
      updates.push('text = ?');
      params.push(updateData.text);
    }
    if (updateData.order_index !== undefined) {
      updates.push('order_index = ?');
      params.push(updateData.order_index);
    }
    updates.push('updated_at = CURRENT_TIMESTAMP');

    updateQuery += updates.join(', ') + ' WHERE id = ? AND document_id = ?';
    params.push(paragraphId, documentId);

    db.run(updateQuery, params, function(err) {
      if (err) {
        console.error('Error updating paragraph:', err);
        return res.status(500).json({ error: 'Failed to update paragraph' });
      }

      // Create history entry if text changed
      if (currentParagraph.text !== text.trim()) {
        const historyId = uuidv4();
        db.run(`
          INSERT INTO history (id, paragraph_id, user_id, old_text, new_text, approval_percentage, proposal_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [historyId, paragraphId, req.user.id, currentParagraph.text, text.trim(), 0, null]);
      }

      // Update document timestamp
      db.run(`
        UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `, [documentId]);

      res.json({ message: 'Paragraph updated successfully' });
    });
  });
});

// Delete a paragraph
router.delete('/:paragraphId', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const paragraphId = req.params.paragraphId;

  db.run(`
    DELETE FROM paragraphs WHERE id = ? AND document_id = ?
  `, [paragraphId, documentId], function(err) {
    if (err) {
      console.error('Error deleting paragraph:', err);
      return res.status(500).json({ error: 'Failed to delete paragraph' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Paragraph not found' });
    }

    db.run(
      `
      UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `,
      [documentId],
      () => {
        normalizeParagraphOrder(db, documentId)
          .catch((normalizeErr) => {
            console.error('Failed to normalize paragraph order after deletion:', normalizeErr);
          })
          .finally(() => {
            res.json({ message: 'Paragraph deleted successfully' });
          });
      }
    );
  });
});

module.exports = router;

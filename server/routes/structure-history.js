const express = require('express');
const router = express.Router({ mergeParams: true });
const { requireAuth, requireDocumentAccess } = require('../middleware/auth');

// GET /api/documents/:documentId/structure-history - Get document structure versions
router.get('/', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;

  const query = `
    SELECT dsv.*,
           u.name as created_by_name,
           u.avatar as created_by_avatar,
           sp.title as proposal_title
    FROM document_structure_versions dsv
    JOIN users u ON dsv.created_by = u.id
    LEFT JOIN structure_proposals sp ON dsv.related_proposal_id = sp.id
    WHERE dsv.document_id = ?
    ORDER BY dsv.version_number DESC
  `;

  db.all(query, [documentId], (err, versions) => {
    if (err) {
      // If table doesn't exist, return empty array
      if (err.code === 'SQLITE_ERROR' && err.message.includes('no such table')) {
        console.log('Structure history tables do not exist yet, returning empty array');
        return res.json({ versions: [] });
      }
      console.error('Error fetching structure versions:', err);
      return res.status(500).json({ error: 'Failed to fetch structure history' });
    }

    // Format the versions
    const formattedVersions = versions.map(version => ({
      id: version.id,
      versionNumber: version.version_number,
      name: version.name,
      description: version.description,
      createdBy: {
        id: version.created_by,
        name: version.created_by_name,
        avatar: version.created_by_avatar
      },
      changeType: version.change_type,
      proposalTitle: version.proposal_title,
      createdAt: version.created_at,
      structureSnapshot: JSON.parse(version.structure_snapshot)
    }));

    res.json({ versions: formattedVersions });
  });
});

// GET /api/documents/:documentId/structure-history/:versionId - Get detailed change log for a version
router.get('/:versionId', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const { documentId, versionId } = req.params;

  // Get version info
  const versionQuery = `
    SELECT dsv.*,
           u.name as created_by_name,
           u.avatar as created_by_avatar,
           sp.title as proposal_title
    FROM document_structure_versions dsv
    JOIN users u ON dsv.created_by = u.id
    LEFT JOIN structure_proposals sp ON dsv.related_proposal_id = sp.id
    WHERE dsv.id = ? AND dsv.document_id = ?
  `;

  db.get(versionQuery, [versionId, documentId], (err, version) => {
    if (err) {
      console.error('Error fetching version:', err);
      return res.status(500).json({ error: 'Failed to fetch version' });
    }

    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    // Get change log
    const changeLogQuery = `
      SELECT scl.*,
             p.title as paragraph_title,
             p.text as current_paragraph_text
      FROM structure_change_log scl
      LEFT JOIN paragraphs p ON scl.paragraph_id = p.id
      WHERE scl.version_id = ?
      ORDER BY scl.created_at ASC
    `;

    db.all(changeLogQuery, [versionId], (logErr, changes) => {
      if (logErr) {
        console.error('Error fetching change log:', logErr);
        return res.status(500).json({ error: 'Failed to fetch change log' });
      }

      // Format changes
      const formattedChanges = changes.map(change => ({
        id: change.id,
        operationType: change.operation_type,
        paragraphId: change.paragraph_id,
        paragraphTitle: change.paragraph_title,
        currentText: change.current_paragraph_text,
        oldData: JSON.parse(change.old_data || '[]'),
        newData: JSON.parse(change.new_data || '{}'),
        metadata: JSON.parse(change.operation_metadata || '{}'),
        createdAt: change.created_at
      }));

      const formattedVersion = {
        id: version.id,
        versionNumber: version.version_number,
        name: version.name,
        description: version.description,
        createdBy: {
          id: version.created_by,
          name: version.created_by_name,
          avatar: version.created_by_avatar
        },
        changeType: version.change_type,
        proposalTitle: version.proposal_title,
        createdAt: version.created_at,
        structureSnapshot: JSON.parse(version.structure_snapshot),
        changes: formattedChanges
      };

      res.json({ version: formattedVersion });
    });
  });
});

// POST /api/documents/:documentId/structure-history/:versionId/restore - Restore document to a previous version
router.post('/:versionId/restore', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const { documentId, versionId } = req.params;
  const userId = req.user.id;

  // Check if user is document owner (only owner can restore)
  db.get('SELECT owner_id FROM documents WHERE id = ?', [documentId], (err, document) => {
    if (err) {
      console.error('Error checking document ownership:', err);
      return res.status(500).json({ error: 'Failed to check document ownership' });
    }

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.owner_id !== userId) {
      return res.status(403).json({ error: 'Only document owner can restore versions' });
    }

    // Get the version to restore
    const versionQuery = `
      SELECT structure_snapshot FROM document_structure_versions
      WHERE id = ? AND document_id = ?
    `;

    db.get(versionQuery, [versionId, documentId], (verErr, version) => {
      if (verErr) {
        console.error('Error fetching version:', verErr);
        return res.status(500).json({ error: 'Failed to fetch version' });
      }

      if (!version) {
        return res.status(404).json({ error: 'Version not found' });
      }

      const snapshot = JSON.parse(version.structure_snapshot);

      // Create a new version before restoring (backup current state)
      const currentBackupId = require('uuid').v4();
      const backupQuery = `
        SELECT id, text, title, order_index, heading_level, created_at, updated_at
        FROM paragraphs
        WHERE document_id = ?
        ORDER BY order_index ASC
      `;

      db.all(backupQuery, [documentId], (backupErr, currentParagraphs) => {
        if (backupErr) {
          console.error('Error backing up current state:', backupErr);
          return res.status(500).json({ error: 'Failed to backup current state' });
        }

        // Get next version number for backup
        db.get('SELECT MAX(version_number) as max_version FROM document_structure_versions WHERE document_id = ?',
          [documentId], (verNumErr, result) => {
          if (verNumErr) {
            console.error('Error getting version number:', verNumErr);
            return res.status(500).json({ error: 'Failed to get version number' });
          }

          const backupVersionNumber = (result?.max_version || 0) + 1;

          // Create backup version
          db.run(`
            INSERT INTO document_structure_versions (
              id, document_id, version_number, created_by, structure_snapshot,
              change_type, description
            ) VALUES (?, ?, ?, ?, ?, 'manual', 'Backup before restore')
          `, [
            currentBackupId,
            documentId,
            backupVersionNumber,
            userId,
            JSON.stringify(currentParagraphs.map(p => ({
              id: p.id,
              text: p.text,
              title: p.title,
              orderIndex: p.order_index,
              headingLevel: p.heading_level,
              createdAt: p.created_at,
              updatedAt: p.updated_at
            })))
          ], (backupInsertErr) => {
            if (backupInsertErr) {
              console.error('Error creating backup:', backupInsertErr);
              return res.status(500).json({ error: 'Failed to create backup' });
            }

            // Now restore the snapshot
            restoreDocumentStructure(db, documentId, snapshot, (restoreErr) => {
              if (restoreErr) {
                console.error('Error restoring document:', restoreErr);
                return res.status(500).json({ error: 'Failed to restore document' });
              }

              // Create a change log entry for the restore operation
              const restoreVersionNumber = backupVersionNumber + 1;
              const restoreVersionId = require('uuid').v4();

              db.run(`
                INSERT INTO document_structure_versions (
                  id, document_id, version_number, created_by, structure_snapshot,
                  change_type, description
                ) VALUES (?, ?, ?, ?, ?, 'manual', 'Restored to version ${version.version_number}')
              `, [
                restoreVersionId,
                documentId,
                restoreVersionNumber,
                userId,
                JSON.stringify(snapshot)
              ], (restoreInsertErr) => {
                if (restoreInsertErr) {
                  console.error('Error creating restore version:', restoreInsertErr);
                  // Don't fail the whole operation for this
                }

                res.json({
                  message: 'Document restored successfully',
                  backupVersionId: currentBackupId,
                  restoredVersionId: restoreVersionId
                });
              });
            });
          });
        });
      });
    });
  });
});

// Helper function to restore document structure from snapshot
function restoreDocumentStructure(db, documentId, snapshot, callback) {
  // First, mark all existing paragraphs as deleted (soft delete)
  db.run('UPDATE paragraphs SET text = "" WHERE document_id = ?', [documentId], (deleteErr) => {
    if (deleteErr) {
      console.error('Error clearing existing paragraphs:', deleteErr);
      return callback(deleteErr);
    }

    // Then restore from snapshot
    let completed = 0;
    const total = snapshot.length;

    if (total === 0) {
      return callback();
    }

    snapshot.forEach(paragraph => {
      // Update existing paragraph or create new one
      db.run(`
        UPDATE paragraphs
        SET text = ?, title = ?, order_index = ?, heading_level = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND document_id = ?
      `, [
        paragraph.text,
        paragraph.title,
        paragraph.orderIndex,
        paragraph.headingLevel,
        paragraph.id,
        documentId
      ], function(updateErr) {
        if (updateErr) {
          console.error('Error updating paragraph:', updateErr);
          return callback(updateErr);
        }

        // If no rows were updated, insert new paragraph
        if (this.changes === 0) {
          db.run(`
            INSERT INTO paragraphs (id, document_id, text, title, order_index, heading_level)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [
            paragraph.id,
            documentId,
            paragraph.text,
            paragraph.title,
            paragraph.orderIndex,
            paragraph.headingLevel
          ], (insertErr) => {
            if (insertErr) {
              console.error('Error inserting paragraph:', insertErr);
              return callback(insertErr);
            }

            completed++;
            if (completed === total) {
              callback();
            }
          });
        } else {
          completed++;
          if (completed === total) {
            callback();
          }
        }
      });
    });
  });
}

module.exports = router;

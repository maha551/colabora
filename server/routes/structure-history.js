const express = require('express');
const router = express.Router({ mergeParams: true });
const { requireAuth, requireDocumentAccess } = require('../middleware/auth');
const { logger } = require('../middleware/logger');
const { safeJsonParse, safeJsonParseArray, safeJsonParseObject } = require('../utils/jsonUtils');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const TransactionManager = require('../database/services/TransactionManager');
const { getUserId } = require('../utils/routeHelpers');

// Middleware to check if structure proposals are enabled for the document
const requireStructureProposalsEnabled = asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;

  const document = await TransactionManager.query(db, 'SELECT structure_proposals_enabled FROM documents WHERE id = ?', [documentId]);

  if (!document) {
    throw ApiError.notFound('Document not found');
  }

  // structure_proposals_enabled is a Postgres boolean.
  if (document.structure_proposals_enabled !== true && document.structure_proposals_enabled !== 1) {
    throw ApiError.forbidden('Structure history is not available for this document');
  }

  next();
});

// GET /api/documents/:documentId/structure-history - Get document structure versions
router.get('/', requireAuth, requireDocumentAccess, requireStructureProposalsEnabled, asyncHandler(async (req, res) => {
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

  let versions;
  try {
    versions = await TransactionManager.queryAll(db, query, [documentId]);
  } catch (err) {
    // If table doesn't exist, return empty array
    if (err.message && err.message.includes('no such table')) {
      logger.debug('Structure history tables do not exist yet, returning empty array', { documentId });
      return res.json({ versions: [] });
    }
    logger.error('Error fetching structure versions', { error: err.message, documentId });
    throw ApiError.database('Failed to fetch structure history');
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
    structureSnapshot: safeJsonParse(version.structure_snapshot, null)
  })).filter(v => v.structureSnapshot !== null);

  res.json({ versions: formattedVersions });
}));

// GET /api/documents/:documentId/structure-history/:versionId - Get detailed change log for a version
router.get('/:versionId', requireAuth, requireDocumentAccess, requireStructureProposalsEnabled, asyncHandler(async (req, res) => {
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

  const version = await TransactionManager.query(db, versionQuery, [versionId, documentId]);

  if (!version) {
    throw ApiError.notFound('Version not found');
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

  const changes = await TransactionManager.queryAll(db, changeLogQuery, [versionId]);

  // Format changes
  const formattedChanges = changes.map(change => ({
    id: change.id,
    operationType: change.operation_type,
    paragraphId: change.paragraph_id,
    paragraphTitle: change.paragraph_title,
    currentText: change.current_paragraph_text,
    oldData: safeJsonParseArray(change.old_data),
    newData: safeJsonParseObject(change.new_data),
    metadata: safeJsonParseObject(change.operation_metadata),
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
    structureSnapshot: safeJsonParse(version.structure_snapshot, null),
    changes: formattedChanges
  };

  res.json({ version: formattedVersion });
}));

// POST /api/documents/:documentId/structure-history/:versionId/restore - Restore document to a previous version
router.post('/:versionId/restore', requireAuth, requireDocumentAccess, requireStructureProposalsEnabled, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { documentId, versionId } = req.params;
  const userId = getUserId(req);

  // Check if user is document owner (only owner can restore) or representative (for org docs)
  const document = await TransactionManager.query(db, 'SELECT owner_id, ownership_type, organization_id FROM documents WHERE id = ?', [documentId]);

  if (!document) {
    throw ApiError.notFound('Document not found');
  }

  // For organizational documents, check if user is representative
  if (document.ownership_type === 'organizational' && document.organization_id) {
    const isRep = await TransactionManager.query(db, `
      SELECT COUNT(*) as count FROM organization_representatives
      WHERE organization_id = ? AND user_id = ? AND status = 'active'
    `, [document.organization_id, userId]);
    if (!isRep || (isRep.count || 0) === 0) {
      throw ApiError.forbidden('Only representatives can restore versions');
    }
  } else {
    // For personal/shared documents, check owner_id
    if (document.owner_id !== userId) {
      throw ApiError.forbidden('Only document owner can restore versions');
    }
  }

  // Get the version to restore
  const version = await TransactionManager.query(db, `
    SELECT structure_snapshot, version_number FROM document_structure_versions
    WHERE id = ? AND document_id = ?
  `, [versionId, documentId]);

  if (!version) {
    throw ApiError.notFound('Version not found');
  }

  const snapshot = safeJsonParse(version.structure_snapshot, null);
  if (!snapshot) {
    logger.error('Invalid structure_snapshot for restore', { versionId, documentId });
    throw ApiError.database('Invalid snapshot data');
  }

  // Create a new version before restoring (backup current state)
  const currentBackupId = require('uuid').v4();
  const currentParagraphs = await TransactionManager.queryAll(db, `
    SELECT id, text, title, order_index, heading_level, created_at, updated_at
    FROM paragraphs
    WHERE document_id = ?
    ORDER BY order_index ASC
  `, [documentId]);

  // Get next version number for backup
  const result = await TransactionManager.query(db, 'SELECT MAX(version_number) as max_version FROM document_structure_versions WHERE document_id = ?', [documentId]);
  const backupVersionNumber = (result?.max_version || 0) + 1;

  // Create backup version
  await TransactionManager.execute(db, `
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
  ]);

  // Now restore the snapshot
  await restoreDocumentStructure(db, documentId, snapshot);

  // Create a change log entry for the restore operation
  const restoreVersionNumber = backupVersionNumber + 1;
  const restoreVersionId = require('uuid').v4();

  try {
    await TransactionManager.execute(db, `
      INSERT INTO document_structure_versions (
        id, document_id, version_number, created_by, structure_snapshot,
        change_type, description
      ) VALUES (?, ?, ?, ?, ?, 'manual', ?)
    `, [
      restoreVersionId,
      documentId,
      restoreVersionNumber,
      userId,
      JSON.stringify(snapshot),
      `Restored to version ${version.version_number}`
    ]);
  } catch (restoreInsertErr) {
    logger.error('Error creating restore version', { error: restoreInsertErr.message, documentId, versionId });
    // Don't fail the whole operation for this
  }

  res.json({
    message: 'Document restored successfully',
    backupVersionId: currentBackupId,
    restoredVersionId: restoreVersionId
  });
}));

// Helper function to restore document structure from snapshot
async function restoreDocumentStructure(db, documentId, snapshot) {
  // First, mark all existing paragraphs as deleted (soft delete)
  await TransactionManager.execute(db, 'UPDATE paragraphs SET text = \'\' WHERE document_id = ?', [documentId]);

  // Then restore from snapshot
  if (snapshot.length === 0) {
    return;
  }

  // Use transaction for atomic restore
  await TransactionManager.executeInTransaction(db, async (db) => {
    for (const paragraph of snapshot) {
      // Try to update existing paragraph first
      const updateResult = await TransactionManager.execute(db, `
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
      ]);

      // If no rows were updated, insert new paragraph
      if (updateResult.changes === 0) {
        await TransactionManager.execute(db, `
          INSERT INTO paragraphs (id, document_id, text, title, order_index, heading_level)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          paragraph.id,
          documentId,
          paragraph.text,
          paragraph.title,
          paragraph.orderIndex,
          paragraph.headingLevel
        ]);
      }
    }
  });
}

module.exports = router;

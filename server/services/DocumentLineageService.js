'use strict';

const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../database/services/TransactionManager');
const { ApiError } = require('../middleware/errorHandler');
const { isRepresentative } = require('../modules/permissions');

async function resolveTargetOrg(db, sourceOrgId, explicitTargetOrgId = null) {
  if (explicitTargetOrgId) return explicitTargetOrgId;
  const row = await TransactionManager.query(
    db,
    'SELECT primary_parent_id FROM organizations WHERE id = ?',
    [sourceOrgId]
  );
  return row?.primary_parent_id || null;
}

async function cloneDocumentToOrgAsDraft(db, sourceDocId, targetOrgId, userId) {
  const source = await TransactionManager.query(
    db,
    'SELECT title, description FROM documents WHERE id = ?',
    [sourceDocId]
  );
  if (!source) throw ApiError.notFound('Source document');

  const derivedId = uuidv4();
  await TransactionManager.execute(
    db,
    `INSERT INTO documents (id, title, description, organization_id, ownership_type, status, created_by_user_id, ratification_scope, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'organizational', 'draft', ?, 'pending_upstream', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [derivedId, source.title, source.description || null, targetOrgId, userId]
  );

  const paragraphs = await TransactionManager.queryAll(
    db,
    'SELECT title, text, sort_order, heading_level FROM paragraphs WHERE document_id = ? ORDER BY sort_order ASC',
    [sourceDocId]
  );
  for (const p of paragraphs) {
    await TransactionManager.execute(
      db,
      `INSERT INTO paragraphs (id, document_id, title, text, sort_order, heading_level, created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [uuidv4(), derivedId, p.title, p.text, p.sort_order, p.heading_level, userId]
    );
  }
  return derivedId;
}

async function submitForRatification(db, sourceDocId, userId, options = {}, req = null) {
  const doc = await TransactionManager.query(
    db,
    'SELECT id, organization_id, status FROM documents WHERE id = ?',
    [sourceDocId]
  );
  if (!doc) throw ApiError.notFound('Document');
  const isRep = await isRepresentative(db, userId, doc.organization_id);
  if (!isRep) throw ApiError.forbidden('Only representatives can submit for ratification', 'NOT_REPRESENTATIVE');
  if (doc.status !== 'agreed') {
    throw ApiError.validation('Only agreed documents can be submitted for ratification', null, 'INVALID_DOCUMENT_STATUS');
  }

  const targetOrgId = await resolveTargetOrg(db, doc.organization_id, options.targetOrgId || options.target_org_id);
  if (!targetOrgId) throw ApiError.validation('No ratification target organization configured', null, 'NO_RATIFICATION_TARGET');

  const derivedDocId = await cloneDocumentToOrgAsDraft(db, sourceDocId, targetOrgId, userId);
  const lineageId = uuidv4();
  await TransactionManager.execute(
    db,
    `INSERT INTO document_lineage
       (id, source_document_id, source_organization_id, derived_document_id, derived_organization_id, status, submitted_at, submitted_by_user_id)
     VALUES (?, ?, ?, ?, ?, 'pending_ratification', CURRENT_TIMESTAMP, ?)`,
    [lineageId, sourceDocId, doc.organization_id, derivedDocId, targetOrgId, userId]
  );
  await TransactionManager.execute(
    db,
    'UPDATE documents SET source_lineage_id = ?, ratification_scope = ? WHERE id = ?',
    [lineageId, 'pending_upstream', derivedDocId]
  );

  return {
    lineageId,
    derivedDocumentId: derivedDocId,
    targetOrganizationId: targetOrgId,
  };
}

async function updateLineageStatus(db, lineageId, status) {
  const allowed = ['pending_ratification', 'ratified', 'rejected', 'superseded', 'withdrawn'];
  if (!allowed.includes(status)) throw ApiError.validation('Invalid lineage status');
  await TransactionManager.execute(
    db,
    `UPDATE document_lineage SET status = ?, ratified_at = CASE WHEN ? = 'ratified' THEN CURRENT_TIMESTAMP ELSE ratified_at END WHERE id = ?`,
    [status, status, lineageId]
  );
  if (status === 'ratified') {
    const row = await TransactionManager.query(db, 'SELECT derived_document_id FROM document_lineage WHERE id = ?', [lineageId]);
    if (row?.derived_document_id) {
      await TransactionManager.execute(db, `UPDATE documents SET ratification_scope = 'ratified_upstream' WHERE id = ?`, [row.derived_document_id]);
    }
  }
  return { lineageId, status };
}

module.exports = {
  resolveTargetOrg,
  cloneDocumentToOrgAsDraft,
  submitForRatification,
  updateLineageStatus,
};

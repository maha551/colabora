/**
 * Structure Proposal Validation Utilities
 * Validates structure proposal operations before creation
 */

const { ApiError } = require('../middleware/errorHandler');
const TransactionManager = require('../database/services/TransactionManager');
const { extractOperationFields } = require('./fieldExtractor');
const { safeJsonParseArray } = require('./jsonUtils');

/**
 * Validate that all paragraphs referenced in operations exist in the document
 * @param {Object} db - Database connection
 * @param {string} documentId - Document ID
 * @param {Array} operations - Array of operation objects
 * @throws {ApiError} If any paragraph doesn't exist
 */
async function validateOperationsParagraphsExist(db, documentId, operations) {
  if (!operations || operations.length === 0) {
    return; // No operations to validate
  }

  // Collect all paragraph IDs referenced in operations
  const paragraphIds = new Set();
  
  for (const op of operations) {
    const {
      operationType,
      targetParagraphId,
      sourceParagraphIds
    } = extractOperationFields(op);

    // Collect target paragraph ID (for most operations)
    if (targetParagraphId) {
      paragraphIds.add(targetParagraphId);
    }

    // Collect source paragraph IDs (for MERGE operations)
    if (sourceParagraphIds) {
      const sourceIds = safeJsonParseArray(sourceParagraphIds);
      if (Array.isArray(sourceIds)) {
        sourceIds.forEach(id => paragraphIds.add(id));
      }
    }
  }

  if (paragraphIds.size === 0) {
    return; // No paragraphs to validate (e.g., INSERT_NEW only)
  }

  // Validate all paragraphs exist in the document
  const idsArray = Array.from(paragraphIds);
  const placeholders = idsArray.map(() => '?').join(',');
  
  const existingParagraphs = await TransactionManager.queryAll(db, `
    SELECT id FROM paragraphs
    WHERE id IN (${placeholders}) AND document_id = ?
  `, [...idsArray, documentId]);

  const existingIds = new Set(existingParagraphs.map(p => p.id));
  const missingIds = idsArray.filter(id => !existingIds.has(id));

  if (missingIds.length > 0) {
    throw ApiError.validation(
      `The following paragraphs do not exist in this document: ${missingIds.join(', ')}`,
      { missingParagraphIds: missingIds, documentId },
      'PARAGRAPHS_NOT_FOUND'
    );
  }
}

/**
 * Detect conflicts between operations in a structure proposal
 * @param {Array} operations - Array of operation objects
 * @returns {{hasConflicts: boolean, conflicts: string[]}} Conflict detection result
 */
function detectOperationConflicts(operations) {
  if (!operations || operations.length === 0) {
    return { hasConflicts: false, conflicts: [] };
  }

  const conflicts = [];
  const deletedParagraphs = new Set();
  const mergedParagraphs = new Set(); // Paragraphs that are sources in MERGE operations
  const targetParagraphs = new Map(); // paragraphId -> operation types affecting it

  // First pass: identify deleted and merged paragraphs
  for (const op of operations) {
    const { operationType, targetParagraphId, sourceParagraphIds } = extractOperationFields(op);

    if (operationType === 'DELETE' && targetParagraphId) {
      deletedParagraphs.add(targetParagraphId);
    }

    if (operationType === 'MERGE' && sourceParagraphIds) {
      const sourceIds = safeJsonParseArray(sourceParagraphIds);
      if (Array.isArray(sourceIds)) {
        sourceIds.forEach(id => mergedParagraphs.add(id));
      }
    }
  }

  // Second pass: detect conflicts
  for (const op of operations) {
    const { operationType, targetParagraphId, sourceParagraphIds } = extractOperationFields(op);

    // Check if target paragraph is deleted
    if (targetParagraphId && deletedParagraphs.has(targetParagraphId)) {
      if (operationType !== 'DELETE') {
        conflicts.push(`Operation ${operationType} targets paragraph ${targetParagraphId} which is also being deleted`);
      }
    }

    // Check if target paragraph is merged (as source)
    if (targetParagraphId && mergedParagraphs.has(targetParagraphId)) {
      if (operationType !== 'MERGE') {
        conflicts.push(`Operation ${operationType} targets paragraph ${targetParagraphId} which is also being merged as a source`);
      }
    }

    // Check if source paragraphs in MERGE are deleted
    if (operationType === 'MERGE' && sourceParagraphIds) {
      const sourceIds = safeJsonParseArray(sourceParagraphIds);
      if (Array.isArray(sourceIds)) {
        sourceIds.forEach(id => {
          if (deletedParagraphs.has(id)) {
            conflicts.push(`MERGE operation includes paragraph ${id} which is also being deleted`);
          }
        });
      }
    }

    // Track operations affecting the same paragraph
    if (targetParagraphId) {
      if (!targetParagraphs.has(targetParagraphId)) {
        targetParagraphs.set(targetParagraphId, []);
      }
      targetParagraphs.get(targetParagraphId).push(operationType);
    }
  }

  // Check for multiple operations on the same paragraph (some combinations are invalid)
  for (const [paragraphId, operationTypes] of targetParagraphs.entries()) {
    if (operationTypes.length > 1) {
      // Multiple operations on same paragraph - check if combination is valid
      const hasDelete = operationTypes.includes('DELETE');
      const hasMerge = operationTypes.includes('MERGE');
      const hasMove = operationTypes.includes('MOVE');
      const hasRename = operationTypes.includes('RENAME_HEADING');
      const hasChangeLevel = operationTypes.includes('CHANGE_HEADING_LEVEL');

      // DELETE conflicts with everything except itself
      if (hasDelete && operationTypes.length > 1) {
        conflicts.push(`Paragraph ${paragraphId} is affected by DELETE and other operations: ${operationTypes.join(', ')}`);
      }

      // MERGE as source conflicts with other operations (except when it's the target)
      // This is handled above in the mergedParagraphs check

      // MOVE + RENAME or MOVE + CHANGE_HEADING_LEVEL is OK
      // RENAME + CHANGE_HEADING_LEVEL is OK
      // But DELETE + anything is not OK (already checked)
    }
  }

  return {
    hasConflicts: conflicts.length > 0,
    conflicts
  };
}

/**
 * Build set of paragraph IDs touched by a list of operations (for overlap detection).
 * Excludes INSERT_NEW which does not reference existing paragraphs.
 * @param {Array} operations - Array of operation objects
 * @returns {Set<string>} Set of paragraph IDs
 */
function getParagraphIdsTouchedByOperations(operations) {
  const ids = new Set();
  if (!operations || operations.length === 0) return ids;
  for (const op of operations) {
    const { operationType, targetParagraphId, sourceParagraphIds } = extractOperationFields(op);
    if (operationType === 'INSERT_NEW') continue;
    if (targetParagraphId) ids.add(targetParagraphId);
    if (sourceParagraphIds) {
      const sourceIds = safeJsonParseArray(sourceParagraphIds);
      if (Array.isArray(sourceIds)) sourceIds.forEach(id => ids.add(id));
    }
  }
  return ids;
}

/**
 * Detect if new proposal's operations overlap with any pending structure proposal on the same document.
 * @param {Object} db - Database connection (or transaction)
 * @param {string} documentId - Document ID
 * @param {Array} newOperations - Array of operation objects for the new proposal
 * @returns {Promise<{hasConflicts: boolean, conflicts: string[]}>}
 */
async function detectConflictsWithPendingProposals(db, documentId, newOperations) {
  const newIds = getParagraphIdsTouchedByOperations(newOperations);
  if (newIds.size === 0) return { hasConflicts: false, conflicts: [] };

  const pendingOps = await TransactionManager.queryAll(db, `
    SELECT so.source_paragraph_ids, so.target_paragraph_id
    FROM structure_operations so
    JOIN structure_proposals sp ON so.structure_proposal_id = sp.id
    WHERE sp.document_id = ? AND sp.applied = false
      AND (sp.status IS NULL OR sp.status NOT IN ('approved', 'rejected'))
  `, [documentId]);

  const pendingIds = new Set();
  for (const row of pendingOps) {
    if (row.target_paragraph_id) pendingIds.add(row.target_paragraph_id);
    if (row.source_paragraph_ids) {
      const sourceIds = safeJsonParseArray(row.source_paragraph_ids);
      if (Array.isArray(sourceIds)) sourceIds.forEach(id => pendingIds.add(id));
    }
  }

  const overlapping = [...newIds].filter(id => pendingIds.has(id));
  if (overlapping.length === 0) return { hasConflicts: false, conflicts: [] };
  return {
    hasConflicts: true,
    conflicts: overlapping.map(id => `Paragraph ${id} is already targeted by another pending structure proposal`)
  };
}

module.exports = {
  validateOperationsParagraphsExist,
  detectOperationConflicts,
  detectConflictsWithPendingProposals,
  getParagraphIdsTouchedByOperations
};

/**
 * Document integrity validation utilities
 * Validates that owner_id references correct table based on ownership_type
 */

const { logger } = require('../middleware/logger');

/**
 * Validate that owner_id references correct table based on ownership_type
 * @param {Object} db - Database connection
 * @param {string} documentId - Document ID to validate
 * @returns {Promise<{valid: boolean, errors: string[]}>}
 */
async function validateOwnerReference(db, documentId) {
  const doc = await db('documents')
    .select('id', 'ownership_type', 'owner_id', 'organization_id')
    .where({ id: documentId })
    .first();

  if (!doc) {
    return { valid: false, errors: ['Document not found'] };
  }

  const errors = [];

  if (doc.ownership_type === 'organizational') {
    const org = await db('organizations').select('id').where({ id: doc.owner_id }).first();
    if (!org) {
      errors.push(`Owner ID ${doc.owner_id} does not exist in organizations table`);
    }

    if (doc.owner_id !== doc.organization_id) {
      errors.push(`Owner ID ${doc.owner_id} does not match organization_id ${doc.organization_id}`);
    }
  } else {
    const user = await db('users').select('id').where({ id: doc.owner_id }).first();
    if (!user) {
      errors.push(`Owner ID ${doc.owner_id} does not exist in users table`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate all documents in database
 * @param {Object} db - Database connection
 * @returns {Promise<{total: number, valid: number, invalid: Array}>}
 */
async function validateAllDocumentOwners(db) {
  const allDocs = await db('documents').select('id', 'ownership_type', 'owner_id', 'organization_id');
  const results = { total: allDocs.length, valid: 0, invalid: [] };

  for (const doc of allDocs) {
    try {
      const validation = await validateOwnerReference(db, doc.id);
      if (validation.valid) {
        results.valid++;
      } else {
        results.invalid.push({ id: doc.id, errors: validation.errors });
      }
    } catch (validationErr) {
      logger.error('Error validating document', { documentId: doc.id, error: validationErr.message });
      results.invalid.push({ id: doc.id, errors: [`Validation error: ${validationErr.message}`] });
    }
  }

  return results;
}

module.exports = {
  validateOwnerReference,
  validateAllDocumentOwners
};


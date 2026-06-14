const { v4: uuidv4 } = require('uuid');
const { logger } = require('../middleware/logger');
const TransactionManager = require('../database/services/TransactionManager');

/**
 * Sync a single document's collaborators from active organization members
 * @param {Object} db - Database connection
 * @param {string} documentId - Document ID
 * @param {string} organizationId - Organization ID
 * @param {boolean} inTransaction - Whether already inside a transaction (default: false)
 * @returns {Promise<Object>} Stats object with added, removed, total
 */
async function syncDocumentCollaborators(knex, documentId, organizationId, inTransaction = false) {
  try {
    // Get document ownership info
    const docResult = await knex.raw('SELECT owner_id, ownership_type FROM documents WHERE id = ?', [documentId]);
    const document = (docResult.rows && docResult.rows[0]) || docResult[0] || null;

    if (!document) {
      throw new Error('Document not found');
    }

    // For organizational documents, owner_id = organization_id (organization is owner, not a user)
    // So we don't need to exclude owner_id from collaborators since it's not a user_id
    // For personal/shared documents, we would exclude owner_id, but organizational docs don't have user owners
    // Get all active organization members (ensure we only get actual users, never organization IDs)
    const activeMembersResult = await knex.raw(`
      SELECT om.user_id FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE om.organization_id = ? AND om.status = 'active'
        AND om.user_id NOT IN (SELECT id FROM organizations)
    `, [organizationId]);
    const activeMembers = activeMembersResult.rows || activeMembersResult || [];

    // Get current document collaborators (only actual users, never organizations)
    const currentCollaboratorsResult = await knex.raw(`
      SELECT dc.user_id FROM document_collaborators dc
      JOIN users u ON dc.user_id = u.id
      WHERE dc.document_id = ?
        AND dc.user_id NOT IN (SELECT id FROM organizations)
    `, [documentId]);
    const currentCollaborators = currentCollaboratorsResult.rows || currentCollaboratorsResult || [];

      const activeMemberIds = new Set(activeMembers.map(m => m.user_id));
      const currentCollaboratorIds = new Set(currentCollaborators.map(c => c.user_id));

      // Find members to add (in active members but not in collaborators)
      const membersToAdd = activeMembers.filter(m => !currentCollaboratorIds.has(m.user_id));
      
      // Find collaborators to remove (in collaborators but not in active members)
      const collaboratorsToRemove = currentCollaborators.filter(c => !activeMemberIds.has(c.user_id));

      // Execute operations (with or without transaction)
      const executeOperations = async (trx) => {
        if (membersToAdd.length === 0 && collaboratorsToRemove.length === 0) {
          return { added: 0, removed: 0, total: activeMemberIds.size };
        }

        // Add missing members as collaborators
        if (membersToAdd.length > 0) {
          const placeholders = membersToAdd.map(() => '(?, ?, ?)').join(',');
          const values = membersToAdd.flatMap(member => [uuidv4(), documentId, member.user_id]);
          
          await trx.raw(`
            INSERT INTO document_collaborators (id, document_id, user_id)
            VALUES ${placeholders}
          `, values);
        }

        // Remove collaborators who are no longer active members
        // Also remove any organization IDs that might have been incorrectly added
        if (collaboratorsToRemove.length > 0) {
          const userIdsToRemove = collaboratorsToRemove.map(c => c.user_id);
          const placeholders = userIdsToRemove.map(() => '?').join(',');

          await trx.raw(`
            DELETE FROM document_collaborators 
            WHERE document_id = ? AND user_id IN (${placeholders})
          `, [documentId, ...userIdsToRemove]);
        }

        // Safety: Remove any organization IDs that might have been incorrectly added as collaborators
        await trx.raw(`
          DELETE FROM document_collaborators 
          WHERE document_id = ? AND user_id IN (SELECT id FROM organizations)
        `, [documentId]);

        return {
          added: membersToAdd.length,
          removed: collaboratorsToRemove.length,
          total: activeMemberIds.size
        };
      };

      if (inTransaction) {
        // Already in a transaction, execute operations directly
        const result = await executeOperations(knex);
        logger.debug('Document collaborators synced', {
          documentId,
          organizationId,
          ...result,
          inTransaction: true
        });
        return result;
      } else {
        // Not in a transaction, wrap operations in Knex transaction
        const result = await TransactionManager.executeInTransaction(knex, async (trx) => {
          return await executeOperations(trx);
        });

        logger.debug('Document collaborators synced', {
          documentId,
          organizationId,
          ...result,
          inTransaction: false
        });

        return result;
      }
    } catch (error) {
      logger.error('Error in syncDocumentCollaborators', { error: error.message, documentId, organizationId });
      throw error;
    }
}

/**
 * Sync all organizational documents for an organization (batched: 1 query for members, 1 for current collaborators, then batch writes).
 * @param {Object} db - Database connection
 * @param {string} organizationId - Organization ID
 * @returns {Promise<Object>} Summary with total documents, synced, errors
 */
async function syncOrganizationDocuments(knex, organizationId) {
  try {
    const docsResult = await knex.raw(`
      SELECT id FROM documents 
      WHERE organization_id = ? AND ownership_type = 'organizational'
    `, [organizationId]);
    const docs = docsResult.rows || docsResult || [];

    if (!docs || docs.length === 0) {
      return { total: 0, synced: 0, errors: 0, details: [] };
    }

    const docIds = docs.map(d => d.id);
    const docIdPlaceholders = docIds.map(() => '?').join(',');

    const activeMembersResult = await knex.raw(`
      SELECT om.user_id FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE om.organization_id = ? AND om.status = 'active'
        AND om.user_id NOT IN (SELECT id FROM organizations)
    `, [organizationId]);
    const activeMembers = activeMembersResult.rows || activeMembersResult || [];
    const activeMemberIds = new Set(activeMembers.map(m => m.user_id));

    const currentResult = await knex.raw(`
      SELECT dc.document_id, dc.user_id FROM document_collaborators dc
      JOIN users u ON dc.user_id = u.id
      WHERE dc.document_id IN (${docIdPlaceholders})
        AND dc.user_id NOT IN (SELECT id FROM organizations)
    `, docIds);
    const currentRows = currentResult.rows || currentResult || [];
    const currentByDoc = new Map();
    for (const row of currentRows) {
      const did = row.document_id;
      if (!currentByDoc.has(did)) currentByDoc.set(did, new Set());
      currentByDoc.get(did).add(row.user_id);
    }

    const toInsert = [];
    const toRemove = [];
    const details = [];

    for (const doc of docs) {
      const currentIds = currentByDoc.get(doc.id) || new Set();
      const toAdd = activeMembers.filter(m => !currentIds.has(m.user_id));
      const toRemoveForDoc = [...currentIds].filter(uid => !activeMemberIds.has(uid));
      for (const m of toAdd) {
        toInsert.push({ documentId: doc.id, userId: m.user_id });
      }
      for (const uid of toRemoveForDoc) {
        toRemove.push({ documentId: doc.id, userId: uid });
      }
      const added = toAdd.length;
      const removed = toRemoveForDoc.length;
      details.push({
        documentId: doc.id,
        added,
        removed,
        total: activeMemberIds.size
      });
    }

    await TransactionManager.executeInTransaction(knex, async (trx) => {
      if (toInsert.length > 0) {
        const values = toInsert.flatMap(({ documentId, userId }) => [uuidv4(), documentId, userId]);
        const placeholders = toInsert.map(() => '(?, ?, ?)').join(',');
        await trx.raw(`
          INSERT INTO document_collaborators (id, document_id, user_id)
          VALUES ${placeholders}
          ON CONFLICT (document_id, user_id) DO NOTHING
        `, values);
      }
      if (toRemove.length > 0) {
        const values = toRemove.flatMap(({ documentId, userId }) => [documentId, userId]);
        const valueRows = toRemove.map(() => '(?, ?)').join(', ');
        await trx.raw(
          `DELETE FROM document_collaborators WHERE (document_id, user_id) IN (${valueRows})`,
          values
        );
      }
      await trx.raw(`
        DELETE FROM document_collaborators 
        WHERE document_id IN (${docIdPlaceholders}) AND user_id IN (SELECT id FROM organizations)
      `, docIds);
    });

    logger.debug('Organization documents synced', { organizationId, total: docs.length, synced: docs.length, errors: 0 });
    return {
      total: docs.length,
      synced: docs.length,
      errors: 0,
      details
    };
  } catch (error) {
    logger.error('Error in syncOrganizationDocuments', { error: error.message, organizationId });
    throw error;
  }
}

/**
 * Add a user as collaborator to all organizational documents
 * @param {Object} db - Database connection
 * @param {string} organizationId - Organization ID
 * @param {string} userId - User ID to add
 * @returns {Promise<number>} Count of documents affected
 */
async function addMemberToOrganizationDocuments(knex, organizationId, userId) {
  try {
    // Get all organizational documents
    // For organizational documents, owner_id = organization_id (organization is owner, not a user)
    // So no need to exclude owner_id since it's not a user_id
    const docsResult = await knex.raw(`
      SELECT d.id FROM documents d
      WHERE d.organization_id = ? 
        AND d.ownership_type = 'organizational'
    `, [organizationId]);
    const docs = docsResult.rows || docsResult || [];

    if (!docs || docs.length === 0) {
      return 0;
    }

    // Use Knex transaction for atomicity
    const count = await TransactionManager.executeInTransaction(knex, async (trx) => {
      // Batch insert user as collaborator to all documents
      const placeholders = docs.map(() => '(?, ?, ?)').join(',');
      const values = docs.flatMap(doc => [uuidv4(), doc.id, userId]);

      const columns = ['id', 'document_id', 'user_id'];
      await trx.raw(`
        INSERT INTO document_collaborators (${columns.join(', ')})
        VALUES ${placeholders}
        ON CONFLICT (document_id, user_id) DO NOTHING
      `, values);

      return docs.length;
    });

    logger.debug('Member added to organizational documents', {
      organizationId,
      userId,
      documentsAffected: count
    });

    return count;
  } catch (error) {
    logger.error('Error adding member to organizational documents', { 
      error: error.message, 
      organizationId, 
      userId 
    });
    throw error;
  }
}

/**
 * Remove a user from all organizational documents
 * @param {Object} db - Database connection
 * @param {string} organizationId - Organization ID
 * @param {string} userId - User ID to remove
 * @returns {Promise<number>} Count of documents affected
 */
async function removeMemberFromOrganizationDocuments(knex, organizationId, userId) {
  try {
    // Get all organizational documents
    const docsResult = await knex.raw(`
      SELECT id FROM documents 
      WHERE organization_id = ? AND ownership_type = 'organizational'
    `, [organizationId]);
    const docs = docsResult.rows || docsResult || [];

    if (!docs || docs.length === 0) {
      return 0;
    }

    // Use Knex transaction for atomicity
    const count = await TransactionManager.executeInTransaction(knex, async (trx) => {
      // Batch delete user from all documents
      const documentIds = docs.map(d => d.id);
      const placeholders = documentIds.map(() => '?').join(',');

      await trx.raw(`
        DELETE FROM document_collaborators 
        WHERE document_id IN (${placeholders}) AND user_id = ?
      `, [...documentIds, userId]);

      return docs.length;
    });

    logger.debug('Member removed from organizational documents', {
      organizationId,
      userId,
      documentsAffected: count
    });

    return count;
  } catch (error) {
    logger.error('Error removing member from organizational documents', { 
      error: error.message, 
      organizationId, 
      userId 
    });
    throw error;
  }
}

module.exports = {
  syncDocumentCollaborators,
  syncOrganizationDocuments,
  addMemberToOrganizationDocuments,
  removeMemberFromOrganizationDocuments
};


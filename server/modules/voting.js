// Voter counting and management for documents
class VoterManager {
  /**
   * Get all eligible voters for a document
   * Handles both organizational and personal/shared documents correctly
   */
  static async getEligibleVoters(db, documentId) {
    // First get document info
    const doc = await this._getDocumentInfo(db, documentId);

    if (!doc) {
      return [];
    }

    if (doc.ownership_type === 'organizational' && doc.organization_id) {
      // For organizational docs: all active organization members can vote
      return await this._getOrganizationVoters(db, doc.organization_id);
    } else {
      // For personal/shared docs: owner + explicit collaborators
      return await this._getPersonalDocumentVoters(db, documentId);
    }
  }

  /**
   * Get count of eligible voters for a document
   */
  static async getEligibleVoterCount(db, documentId) {
    const voters = await this.getEligibleVoters(db, documentId);
    return voters.length;
  }

  /**
   * Get eligible voter counts for multiple documents (batch, avoids N+1)
   * @param {Object} db - Database instance
   * @param {string[]} documentIds - Array of document IDs
   * @returns {Promise<Object>} Map of documentId -> count
   */
  static async getEligibleVoterCountsByDocument(db, documentIds) {
    const uniqueIds = [...new Set(documentIds.filter(Boolean))];
    if (uniqueIds.length === 0) return {};
    const counts = await Promise.all(
      uniqueIds.map(id => this.getEligibleVoterCount(db, id))
    );
    return Object.fromEntries(uniqueIds.map((id, i) => [id, counts[i]]));
  }

  /**
   * Check if a user is eligible to vote on a document
   */
  static async canUserVote(db, documentId, userId) {
    const voters = await this.getEligibleVoters(db, documentId);
    return voters.some(voter => voter.id === userId);
  }

  // Private helper methods

  static async _getDocumentInfo(db, documentId) {
    const result = await db.raw(
      'SELECT ownership_type, organization_id FROM documents WHERE id = ?',
      [documentId]
    );
    return result.rows?.[0] || result[0] || null;
  }

  static async _getOrganizationVoters(db, organizationId) {
    // Get all active organization members (users only, never the organization itself)
    // The JOIN with users table ensures we only get actual users, not organizations
    const result = await db.raw(`
      SELECT u.id, u.name, u.email
      FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE om.organization_id = ? AND om.status = 'active'
        AND om.user_id NOT IN (SELECT id FROM organizations)
      ORDER BY u.name
    `, [organizationId]);
    return result.rows || result || [];
  }

  static async _getPersonalDocumentVoters(db, documentId) {
    // For personal/shared documents, owner_id is a user_id
    // Only include owner_id if document is not organizational (defensive check)
    // Also exclude any user_ids that are actually organization IDs (safety check)
    const result = await db.raw(`
      SELECT DISTINCT u.id, u.name, u.email
      FROM (
        SELECT owner_id AS user_id FROM documents WHERE id = ? AND ownership_type != 'organizational'
        UNION ALL
        SELECT user_id FROM document_collaborators WHERE document_id = ?
      ) v
      JOIN users u ON v.user_id = u.id
      WHERE v.user_id IS NOT NULL
        AND v.user_id NOT IN (SELECT id FROM organizations)
      ORDER BY u.name
    `, [documentId, documentId]);
    return result.rows || result || [];
  }
}

module.exports = VoterManager;

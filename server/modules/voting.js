// Voter counting and management for documents
class VoterManager {
  /**
   * Get all eligible voters for a document
   * Handles both organizational and personal/shared documents correctly
   */
  static async getEligibleVoters(db, documentId) {
    // First get document info
    const doc = await this._getDocumentInfo(db, documentId);

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
   * Check if a user is eligible to vote on a document
   */
  static async canUserVote(db, documentId, userId) {
    const voters = await this.getEligibleVoters(db, documentId);
    return voters.some(voter => voter.id === userId);
  }

  // Private helper methods

  static async _getDocumentInfo(db, documentId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT ownership_type, organization_id FROM documents WHERE id = ?',
        [documentId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  static async _getOrganizationVoters(db, organizationId) {
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT u.id, u.name, u.email
        FROM organization_members om
        JOIN users u ON om.user_id = u.id
        WHERE om.organization_id = ? AND om.status = 'active'
        ORDER BY u.name
      `, [organizationId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  static async _getPersonalDocumentVoters(db, documentId) {
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT DISTINCT u.id, u.name, u.email
        FROM (
          SELECT owner_id as user_id FROM documents WHERE id = ?
          UNION
          SELECT user_id FROM document_collaborators WHERE document_id = ?
        ) v
        JOIN users u ON v.user_id = u.id
        ORDER BY u.name
      `, [documentId, documentId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
}

module.exports = VoterManager;

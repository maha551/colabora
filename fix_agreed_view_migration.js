#!/usr/bin/env node

/**
 * Data Migration Script: Fix Agreed View for Existing Documents
 *
 * This script processes all approved proposals that haven't been
 * properly reflected in the agreed view due to the bug in updateAgreedViewForParagraph.
 */

const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

// VoterManager for getting eligible voter counts
class VoterManager {
  static async getEligibleVoterCount(db, documentId) {
    const voters = await this.getEligibleVoters(db, documentId);
    return voters.length;
  }

  static async getEligibleVoters(db, documentId) {
    const doc = await this._getDocumentInfo(db, documentId);

    if (doc.ownership_type === 'organizational' && doc.organization_id) {
      return await this._getOrganizationVoters(db, doc.organization_id);
    } else {
      return await this._getPersonalDocumentVoters(db, documentId);
    }
  }

  static async _getDocumentInfo(db, documentId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT ownership_type, organization_id FROM documents WHERE id = ?',
        [documentId],
        (err, row) => {
          if (err) reject(err);
          else if (!row) {
            console.warn(`Document ${documentId} not found`);
            resolve({ ownership_type: 'personal', organization_id: null });
          }
          else resolve(row);
        }
      );
    });
  }

  static async _getOrganizationVoters(db, organizationId) {
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT u.id, u.name, u.email
        FROM users u
        JOIN organization_members om ON u.id = om.user_id
        WHERE om.organization_id = ? AND om.status = 'active'
      `, [organizationId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  static async _getPersonalDocumentVoters(db, documentId) {
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT u.id, u.name, u.email
        FROM users u
        JOIN documents d ON u.id = d.owner_id
        LEFT JOIN document_collaborators dc ON d.id = dc.document_id
        LEFT JOIN users cu ON dc.user_id = cu.id
        WHERE d.id = ?
        UNION
        SELECT cu.id, cu.name, cu.email
        FROM document_collaborators dc
        JOIN users cu ON dc.user_id = cu.id
        WHERE dc.document_id = ?
      `, [documentId, documentId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
}

async function processApprovedProposals() {
  const db = new sqlite3.Database('./colabora.db');

  console.log('🔍 Finding approved proposals that need history entries...');

  try {
    // Get all approved proposals that don't have history entries
    const approvedProposals = await new Promise((resolve, reject) => {
      db.all(`
        SELECT
          pr.id as proposal_id,
          pr.paragraph_id,
          pr.text,
          pr.type,
          pr.user_id,
          pr.heading_level,
          p.document_id,
          COUNT(CASE WHEN v.vote = 'PRO' THEN 1 END) as pro_votes
        FROM proposals pr
        JOIN paragraphs p ON pr.paragraph_id = p.id
        LEFT JOIN votes v ON pr.id = v.proposal_id
        WHERE pr.approved = 1
        AND NOT EXISTS (
          SELECT 1 FROM history h WHERE h.proposal_id = pr.id
        )
        GROUP BY pr.id, pr.paragraph_id, pr.text, pr.type, pr.user_id, pr.heading_level, p.document_id
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    console.log(`📋 Found ${approvedProposals.length} approved proposals without history entries`);

    for (const proposal of approvedProposals) {
      await processProposal(db, proposal);
    }

    console.log('✅ Migration completed successfully');

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    db.close();
  }
}

async function processProposal(db, proposal) {
  const {
    proposal_id,
    paragraph_id,
    text,
    type,
    user_id,
    heading_level,
    document_id,
    pro_votes
  } = proposal;

  try {
    console.log(`🔄 Processing proposal ${proposal_id} for paragraph ${paragraph_id}`);

    // Get eligible voter count
    const eligibleVoters = await VoterManager.getEligibleVoterCount(db, document_id);
    const approvalPercentage = eligibleVoters > 0 ? (pro_votes / eligibleVoters) * 100 : 0;

    // Get document acceptance threshold
    const doc = await new Promise((resolve, reject) => {
      db.get(`SELECT acceptance_threshold FROM documents WHERE id = ?`, [document_id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    const acceptanceThreshold = doc?.acceptance_threshold || 75.0;

    // Only process if it still meets the threshold
    if (approvalPercentage < acceptanceThreshold) {
      console.log(`⚠️  Proposal ${proposal_id} no longer meets threshold (${approvalPercentage.toFixed(1)}% < ${acceptanceThreshold}%)`);
      // Mark as not approved
      await new Promise((resolve, reject) => {
        db.run(`UPDATE proposals SET approved = 0 WHERE id = ?`, [proposal_id], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      return;
    }

    // Get current paragraph content to determine old_text
    const paragraph = await new Promise((resolve, reject) => {
      db.get(`SELECT text, title FROM paragraphs WHERE id = ?`, [paragraph_id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    const oldValue = type === 'TITLE' ? paragraph.title : paragraph.text;
    const newValue = text;

    // Create history entry
    const historyId = uuidv4();
    await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO history
        (id, paragraph_id, user_id, old_text, new_text, approval_percentage, proposal_id, heading_level, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        historyId,
        paragraph_id,
        user_id,
        oldValue,
        newValue,
        approvalPercentage,
        proposal_id,
        heading_level
      ], function(err) {
        if (err) reject(err);
        else {
          console.log(`✅ Created history entry ${historyId} for proposal ${proposal_id}`);
          resolve();
        }
      });
    });

    // Update paragraph content if needed
    if (oldValue !== newValue) {
      const updateField = type === 'TITLE' ? 'title' : 'text';
      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE paragraphs SET ${updateField} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [newValue, paragraph_id],
          function(err) {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      console.log(`📝 Updated paragraph ${paragraph_id} content`);
    }

  } catch (error) {
    console.error(`❌ Failed to process proposal ${proposal_id}:`, error);
  }
}

// Run the migration
if (require.main === module) {
  processApprovedProposals();
}

module.exports = { processApprovedProposals };

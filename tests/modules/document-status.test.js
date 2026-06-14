const DocumentStatusManager = require('../../server/modules/document-status');
const { getTestKnex } = require('../utils/db-cleanup');

describe('Document Status Module Tests', () => {
  test('exposes expected static API', () => {
    expect(typeof DocumentStatusManager.transitionToVoting).toBe('function');
    expect(typeof DocumentStatusManager.transitionToAgreed).toBe('function');
    expect(typeof DocumentStatusManager.getStatusHistory).toBe('function');
    expect(typeof DocumentStatusManager.getDocumentStatus).toBe('function');
    expect(typeof DocumentStatusManager.shouldDeferDocumentFinalization).toBe('function');
  });

  describe('shouldDeferDocumentFinalization', () => {
    const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const pastDeadline = new Date(Date.now() - 60 * 1000).toISOString();

    test('returns true when vote changes allowed and deadline is in the future', () => {
      expect(DocumentStatusManager.shouldDeferDocumentFinalization({
        vote_change_allowed: true,
        voting_deadline: futureDeadline
      })).toBe(true);
      expect(DocumentStatusManager.shouldDeferDocumentFinalization({
        vote_change_allowed: 1,
        voting_deadline: futureDeadline
      })).toBe(true);
    });

    test('returns false when vote changes are locked', () => {
      expect(DocumentStatusManager.shouldDeferDocumentFinalization({
        vote_change_allowed: false,
        voting_deadline: futureDeadline
      })).toBe(false);
      expect(DocumentStatusManager.shouldDeferDocumentFinalization({
        vote_change_allowed: 0,
        voting_deadline: futureDeadline
      })).toBe(false);
    });

    test('returns false when deadline has passed', () => {
      expect(DocumentStatusManager.shouldDeferDocumentFinalization({
        vote_change_allowed: true,
        voting_deadline: pastDeadline
      })).toBe(false);
    });

    test('returns false when voting_deadline is missing', () => {
      expect(DocumentStatusManager.shouldDeferDocumentFinalization({
        vote_change_allowed: true,
        voting_deadline: null
      })).toBe(false);
    });
  });

  test('lifecycle timestamp columns are written on transitions', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, '../../server/modules/document-status.js'),
      'utf8'
    );
    expect(source).toContain('proposal_ended_at = CURRENT_TIMESTAMP');
    expect(source).toContain('voting_ended_at = CURRENT_TIMESTAMP');
    expect(source).toContain('amendments_closed_at = CURRENT_TIMESTAMP');
  });

  test('getStatusHistory returns an array for unknown document', async () => {
    const knex = getTestKnex();
    const rows = await DocumentStatusManager.getStatusHistory(knex, '00000000-0000-4000-8000-000000000000');
    expect(Array.isArray(rows)).toBe(true);
  });
});

const {
  sanitizeSearchQuery,
  searchDocuments,
  searchParagraphs,
  searchMeetings,
  searchUnified,
  getSearchSuggestions,
} = require('../../server/modules/search');
const { getTestKnex } = require('../utils/db-cleanup');
const TransactionManager = require('../../server/database/services/TransactionManager');

jest.setTimeout(120000);

let db;

describe('Search Module Tests', () => {
  beforeAll(async () => {
    db = getTestKnex();
  });

  test('sanitizeSearchQuery strips unsafe operators', () => {
    expect(sanitizeSearchQuery('hello AND world')).toBe('hello world');
    expect(sanitizeSearchQuery('')).toBeNull();
    expect(sanitizeSearchQuery(null)).toBeNull();
  });

  test('should search documents', async () => {
    const user = await TransactionManager.query(db, "SELECT id FROM users WHERE email = 'alice@example.com' LIMIT 1");
    const results = await searchDocuments(db, 'test', { limit: 10, offset: 0 }, user?.id);
    expect(Array.isArray(results)).toBe(true);
    if (results.length > 0) {
      expect(results[0].entityType).toBe('document');
    }
  });

  test('should search paragraphs', async () => {
    const user = await TransactionManager.query(db, "SELECT id FROM users WHERE email = 'alice@example.com' LIMIT 1");
    const results = await searchParagraphs(db, 'test', { limit: 10, offset: 0 }, user?.id);
    expect(Array.isArray(results)).toBe(true);
    if (results.length > 0) {
      expect(results[0].entityType).toBe('paragraph');
      expect(results[0].paragraphId).toBeDefined();
    }
  });

  test('should search meetings', async () => {
    const user = await TransactionManager.query(db, "SELECT id FROM users WHERE email = 'alice@example.com' LIMIT 1");
    const results = await searchMeetings(db, 'meeting', { limit: 10, offset: 0 }, user?.id);
    expect(Array.isArray(results)).toBe(true);
    if (results.length > 0) {
      expect(results[0].entityType).toBe('meeting');
      expect(results[0].meetingId).toBeDefined();
    }
  });

  test('should run unified search with facets', async () => {
    const user = await TransactionManager.query(db, "SELECT id FROM users WHERE email = 'alice@example.com' LIMIT 1");
    const response = await searchUnified(db, 'test', { limit: 10, offset: 0 }, user?.id);
    expect(response).toHaveProperty('results');
    expect(response).toHaveProperty('count');
    expect(response).toHaveProperty('facets');
    expect(Array.isArray(response.results)).toBe(true);
  });

  test('should get search suggestions', async () => {
    const user = await TransactionManager.query(db, "SELECT id FROM users WHERE email = 'alice@example.com' LIMIT 1");
    const suggestions = await getSearchSuggestions(db, 'test', user?.id || '00000000-0000-4000-8000-000000000001');
    expect(Array.isArray(suggestions)).toBe(true);
    if (suggestions.length > 0) {
      expect(suggestions[0]).toHaveProperty('text');
      expect(suggestions[0]).toHaveProperty('entityType');
    }
  });

  test('should handle empty query', async () => {
    const user = await TransactionManager.query(db, "SELECT id FROM users WHERE email = 'alice@example.com' LIMIT 1");
    const results = await searchDocuments(db, '', { limit: 10, offset: 0 }, user?.id);
    expect(results).toEqual([]);
    const unified = await searchUnified(db, '', {}, user?.id);
    expect(unified.results).toEqual([]);
    expect(unified.count).toBe(0);
  });
});

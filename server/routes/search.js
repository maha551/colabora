const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { searchUnified, getSearchSuggestions } = require('../modules/search');
const { logger } = require('../middleware/logger');
const { queryValidation } = require('../middleware/validation');
const { getUserId } = require('../utils/routeHelpers');

/**
 * Unified search across documents, paragraphs, and meetings.
 * GET /api/search?q=<query>&types=document,paragraph,meeting&organizationId=&status=&dateFrom=&dateTo=&authorId=&limit=&offset=
 */
router.get('/', requireAuth, ...queryValidation.search, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { q, organizationId, status, dateFrom, dateTo, authorId, limit, offset, types, documentId } = req.query;
  const userId = getUserId(req);

  try {
    const { results, count, facets } = await searchUnified(db, q, {
      organizationId,
      status,
      dateFrom,
      dateTo,
      authorId,
      documentId,
      types,
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0,
    }, userId);

    logger.info('Search performed', {
      query: q,
      resultCount: results.length,
      totalCount: count,
      facets,
      userId,
    });

    res.json({
      results,
      count,
      facets,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Search error', { error: error.message, query: q, userId, stack: error.stack });
    throw ApiError.database('Search failed', { originalError: error.message }, 'SEARCH_FAILED');
  }
}));

/**
 * Get search suggestions/autocomplete
 * GET /api/search/suggestions?q=<prefix>
 */
router.get('/suggestions', requireAuth, ...queryValidation.searchSuggestions, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { q, organizationId } = req.query;
  const userId = getUserId(req);

  if (!q || q.trim().length < 2) {
    return res.json({ suggestions: [] });
  }

  try {
    const suggestions = await getSearchSuggestions(db, q, userId, {
      organizationId: organizationId || undefined,
      limit: 10,
    });
    res.json({ suggestions });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Suggestion error', { error: error.message, query: q, stack: error.stack });
    throw ApiError.database('Failed to get suggestions', { originalError: error.message }, 'GET_SUGGESTIONS_FAILED');
  }
}));

module.exports = router;

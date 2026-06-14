'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { query, validationResult } = require('express-validator');
const GeocodingService = require('../services/GeocodingService');
const { logger } = require('../middleware/logger');

const router = express.Router();

/**
 * GET /api/geocode/search?q=...
 * Returns city-level place suggestions for manual location picker.
 * Auth required; rate limit should be applied at app level (e.g. 10/min per user).
 */
router.get(
  '/search',
  requireAuth,
  query('q')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Query must be 2–200 characters'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 20 })
    .toInt()
    .withMessage('Limit must be 1–20'),
  asyncHandler(async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(ApiError.validation(errors.array()[0]?.msg || 'Validation failed', null, 'VALIDATION_ERROR'));
    }
    const q = (req.query.q || '').trim();
    const limit = Math.min(20, parseInt(req.query.limit, 10) || 10);
    if (q.length < 2) {
      return res.json({ results: [] });
    }
    const results = await GeocodingService.searchCity(q, limit);
    res.json({ results });
  })
);

module.exports = router;

/**
 * Organization member locations (my-location, member-locations aggregate).
 * Mounted under /api/organizations so paths are /:organizationId/my-location and /:organizationId/member-locations.
 */

const express = require('express');
const { requireAuth, requireOrganizationMember } = require('../../middleware/auth');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');
const { paramValidation } = require('../../middleware/validation');
const { getUserId } = require('../../utils/routeHelpers');
const MemberLocationService = require('../../services/MemberLocationService');
const GeocodingService = require('../../services/GeocodingService');
const { logger } = require('../../middleware/logger');

const router = express.Router({ mergeParams: true });

// GET my location for this organization
router.get(
  '/:organizationId/my-location',
  requireAuth,
  requireOrganizationMember,
  ...paramValidation.organizationId,
  asyncHandler(async (req, res, next) => {
    const db = req.app.locals.knex || req.app.locals.db;
    const userId = getUserId(req);
    const { organizationId } = req.params;
    const location = await MemberLocationService.getMyLocation(db, userId, organizationId);
    res.json({ location: location || null });
  })
);

// PUT my location (manual or auto)
router.put(
  '/:organizationId/my-location',
  requireAuth,
  requireOrganizationMember,
  ...paramValidation.organizationId,
  asyncHandler(async (req, res, next) => {
    const db = req.app.locals.knex || req.app.locals.db;
    const userId = getUserId(req);
    const { organizationId } = req.params;
    const body = req.body || {};
    // transformRequest converts body to snake_case; support both for compatibility
    const useCurrentLocation = body.use_current_location === true || body.useCurrentLocation === true;
    const latitude = body.latitude != null ? Number(body.latitude) : NaN;
    const longitude = body.longitude != null ? Number(body.longitude) : NaN;
    const showOnMap = body.show_on_map !== undefined ? body.show_on_map !== false : body.showOnMap !== false;

    if (useCurrentLocation) {
      if (Number.isNaN(latitude) || Number.isNaN(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return next(ApiError.validation('Invalid latitude or longitude for current location', null, 'INVALID_COORDINATES'));
      }
      const reversed = await GeocodingService.reverseGeocode(latitude, longitude);
      if (!reversed) {
        return next(ApiError.validation('Could not resolve location to a city. Try setting your city manually.', null, 'GEOCODE_FAILED'));
      }
      const result = await MemberLocationService.setMyLocation(db, userId, organizationId, {
        city: reversed.city,
        region: reversed.region,
        countryCode: reversed.countryCode,
        latitude: reversed.latitude,
        longitude: reversed.longitude,
        source: 'auto',
        showOnMap
      });
      if (result.throttle) {
        return res.status(429).json({
          error: 'Location can only be updated once per day when using current location.',
          code: 'LOCATION_UPDATE_ONCE_PER_DAY'
        });
      }
      return res.json({ success: true, location: result.location });
    }

    // Manual or "update showOnMap only" (body is snake_case after transformRequest)
    const city = typeof body.city === 'string' ? body.city.trim() : '';
    const region = body.region != null ? String(body.region).trim() : null;
    const countryCodeRaw = body.country_code ?? body.countryCode;
    const countryCode = typeof countryCodeRaw === 'string' ? countryCodeRaw.trim().toLowerCase() : '';
    const latManual = body.latitude != null ? Number(body.latitude) : NaN;
    const lngManual = body.longitude != null ? Number(body.longitude) : NaN;
    const hasValidLocation = city && countryCode.length === 2 && !Number.isNaN(latManual) && !Number.isNaN(lngManual) &&
      latManual >= -90 && latManual <= 90 && lngManual >= -180 && lngManual <= 180;

    if (!hasValidLocation) {
      const existing = await MemberLocationService.getMyLocation(db, userId, organizationId);
      const existingValid = existing && existing.city && existing.countryCode && existing.countryCode.length === 2;
      const showOnMapSent = body.show_on_map !== undefined || body.showOnMap !== undefined;
      if (showOnMapSent && existingValid) {
        const result = await MemberLocationService.setMyLocation(db, userId, organizationId, {
          city: existing.city,
          region: existing.region,
          countryCode: existing.countryCode,
          latitude: existing.latitude,
          longitude: existing.longitude,
          source: existing.source || 'manual',
          showOnMap
        });
        return res.json({ success: true, location: result.location });
      }
      return next(ApiError.validation('City and country code (2 letters) are required', null, 'VALIDATION_ERROR'));
    }
    const result = await MemberLocationService.setMyLocation(db, userId, organizationId, {
      city,
      region: region || null,
      countryCode,
      latitude: latManual,
      longitude: lngManual,
      source: body.source === 'auto' ? 'auto' : 'manual',
      showOnMap
    });
    res.json({ success: true, location: result.location });
  })
);

// GET aggregated member locations (anonymous, by city)
router.get(
  '/:organizationId/member-locations',
  requireAuth,
  requireOrganizationMember,
  ...paramValidation.organizationId,
  asyncHandler(async (req, res, next) => {
    const db = req.app.locals.knex || req.app.locals.db;
    const { organizationId } = req.params;
    const cities = await MemberLocationService.getAggregatedMemberLocations(db, organizationId);
    res.json({ cities });
  })
);

module.exports = router;

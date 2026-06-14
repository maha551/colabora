'use strict';

const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../database/services/TransactionManager');
const { logger } = require('../middleware/logger');

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Get current user's location for an organization.
 * @param {Object} db - Knex/db instance
 * @param {string} userId
 * @param {string} organizationId
 * @returns {Promise<Object|null>} { city, region, countryCode, latitude, longitude, source, showOnMap, locationUpdatedAt } or null
 */
async function getMyLocation(db, userId, organizationId) {
  const row = await TransactionManager.query(db,
    `SELECT city, region, country_code, latitude, longitude, source, show_on_map, location_updated_at
     FROM member_locations
     WHERE user_id = ? AND organization_id = ?`,
    [userId, organizationId]
  );
  if (!row) return null;
  return {
    city: row.city,
    region: row.region || null,
    countryCode: row.country_code,
    latitude: row.latitude,
    longitude: row.longitude,
    source: row.source,
    showOnMap: !!row.show_on_map,
    locationUpdatedAt: row.location_updated_at
  };
}

/**
 * Set or update current user's location for an organization.
 * For auto source: enforces at most one update per 24 hours.
 * @param {Object} db - Knex/db instance
 * @param {string} userId
 * @param {string} organizationId
 * @param {{ city: string, region?: string, countryCode: string, latitude: number, longitude: number, source: 'manual'|'auto', showOnMap?: boolean }} data
 * @returns {{ throttle: boolean }|{ location: Object }} throttle true if 24h not elapsed for auto; otherwise { location }
 */
async function setMyLocation(db, userId, organizationId, data) {
  const now = new Date().toISOString();
  const showOnMap = data.showOnMap !== false;
  const showOnMapVal = !!showOnMap;

  if (data.source === 'auto') {
    const existing = await TransactionManager.query(db,
      `SELECT location_updated_at FROM member_locations WHERE user_id = ? AND organization_id = ? AND source = ?`,
      [userId, organizationId, 'auto']
    );
    if (existing && existing.location_updated_at) {
      const updatedAt = new Date(existing.location_updated_at).getTime();
      if (Date.now() - updatedAt < TWENTY_FOUR_HOURS_MS) {
        return { throttle: true };
      }
    }
  }

  const existingRow = await TransactionManager.query(db,
    'SELECT id FROM member_locations WHERE user_id = ? AND organization_id = ?',
    [userId, organizationId]
  );

  if (existingRow) {
    await TransactionManager.execute(db,
      `UPDATE member_locations SET
        city = ?, region = ?, country_code = ?, latitude = ?, longitude = ?,
        source = ?, show_on_map = ?, location_updated_at = ?, updated_at = ?
       WHERE user_id = ? AND organization_id = ?`,
      [
        data.city,
        data.region || null,
        data.countryCode,
        data.latitude,
        data.longitude,
        data.source,
        showOnMapVal,
        now,
        now,
        userId,
        organizationId
      ]
    );
  } else {
    const id = uuidv4();
    await TransactionManager.execute(db,
      `INSERT INTO member_locations (
        id, user_id, organization_id, city, region, country_code,
        latitude, longitude, source, show_on_map, location_updated_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        organizationId,
        data.city,
        data.region || null,
        data.countryCode,
        data.latitude,
        data.longitude,
        data.source,
        showOnMapVal,
        now,
        now,
        now
      ]
    );
  }

  const location = {
    city: data.city,
    region: data.region || null,
    countryCode: data.countryCode,
    latitude: data.latitude,
    longitude: data.longitude,
    source: data.source,
    showOnMap,
    locationUpdatedAt: now
  };
  return { location };
}

/**
 * Get aggregated member locations by city for an organization (anonymous).
 * Only includes rows where show_on_map is true.
 * @param {Object} db - Knex/db instance
 * @param {string} organizationId
 * @returns {Promise<Array<{ city: string, region: string|null, countryCode: string, latitude: number, longitude: number, count: number }>>}
 */
async function getAggregatedMemberLocations(db, organizationId) {
  const showOnMapVal = true;

  const rows = await TransactionManager.queryAll(db,
    `SELECT city, region, country_code, latitude, longitude, COUNT(*) AS count
     FROM member_locations
     WHERE organization_id = ? AND show_on_map = ?
     GROUP BY city, region, country_code, latitude, longitude
     ORDER BY count DESC, city`,
    [organizationId, showOnMapVal]
  );

  return rows.map((r) => ({
    city: r.city,
    region: r.region || null,
    countryCode: r.country_code,
    latitude: r.latitude,
    longitude: r.longitude,
    count: typeof r.count === 'number' ? r.count : parseInt(r.count, 10)
  }));
}

module.exports = {
  getMyLocation,
  setMyLocation,
  getAggregatedMemberLocations
};

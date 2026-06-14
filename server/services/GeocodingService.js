'use strict';

/**
 * Geocoding via Nominatim (search + reverse). Rate limit 1 req/s; reverse cached 24h.
 * Verify: node scripts/verify-nominatim.js
 * Policy/403/alternatives: docs/active/NOMINATIM_GEOCODING.md
 */
const https = require('https');
const { logger } = require('../middleware/logger');

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = process.env.NOMINATIM_USER_AGENT || 'ColaboraApp/1.0 (member locations; https://github.com/your-org/colabora)';
const NOMINATIM_REFERER = process.env.NOMINATIM_REFERER || process.env.APP_URL || '';
const MIN_INTERVAL_MS = 1100; // Slightly over 1 req/sec for Nominatim policy
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h for reverse cache
const REQUEST_TIMEOUT_MS = 10000;

let lastRequestTime = 0;
const reverseCache = new Map();

function roundCoord(val, decimals = 2) {
  return Math.round(val * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

function cacheKey(lat, lng) {
  return `${roundCoord(lat)}_${roundCoord(lng)}`;
}

function waitForRateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    return new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
  }
  return Promise.resolve();
}

function setLastRequestTime() {
  lastRequestTime = Date.now();
}

function get(url) {
  const headers = { 'User-Agent': USER_AGENT };
  if (NOMINATIM_REFERER) headers['Referer'] = NOMINATIM_REFERER;
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (ch) => { data += ch; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Nominatim returned ${res.statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error('Invalid JSON from Nominatim'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('Nominatim request timeout'));
    });
  });
}

/**
 * Extract city-level name from Nominatim address object (jsonv2).
 * Prefer city, then town, then village, then municipality, then state.
 */
function extractCity(address) {
  if (!address || typeof address !== 'object') return null;
  return address.city || address.town || address.village || address.municipality || address.state || address.county || null;
}

function extractRegion(address) {
  if (!address || typeof address !== 'object') return null;
  return address.state || address.county || address.region || null;
}

/**
 * Reverse geocode (lat, lng) to city-level info.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<{ city: string, region: string|null, countryCode: string, latitude: number, longitude: number }|null>}
 */
async function reverseGeocode(lat, lng) {
  const key = cacheKey(lat, lng);
  const cached = reverseCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  await waitForRateLimit();
  setLastRequestTime();

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'jsonv2',
    addressdetails: '1',
    zoom: '10' // city-level
  });
  const url = `${NOMINATIM_BASE}/reverse?${params.toString()}`;

  try {
    const result = await get(url);
    if (!result || Array.isArray(result)) {
      return null;
    }
    const addr = result.address || {};
    const city = extractCity(addr);
    const countryCode = (addr.country_code || '').toLowerCase();
    if (!city || !countryCode) {
      logger.warn('Nominatim reverse: missing city or country_code', { lat, lng, address: addr });
      return null;
    }
    const latitude = parseFloat(result.lat);
    const longitude = parseFloat(result.lon);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return null;
    }
    const data = {
      city,
      region: extractRegion(addr) || null,
      countryCode,
      latitude,
      longitude
    };
    reverseCache.set(key, { data, at: Date.now() });
    return data;
  } catch (err) {
    logger.warn('Nominatim reverse geocode failed', { lat, lng, error: err.message });
    return null;
  }
}

/**
 * Search for places by query string (city search for manual picker).
 * @param {string} query - Search string
 * @param {number} limit - Max results (default 10, max 40)
 * @returns {Promise<Array<{ city: string, region: string|null, countryCode: string, latitude: number, longitude: number, displayName: string }>>}
 */
async function searchCity(query, limit = 10) {
  const q = (query || '').trim();
  if (!q || q.length < 2) {
    return [];
  }

  await waitForRateLimit();
  setLastRequestTime();

  const params = new URLSearchParams({
    q: q,
    format: 'jsonv2',
    addressdetails: '1',
    limit: String(Math.min(40, Math.max(1, limit)))
  });
  const url = `${NOMINATIM_BASE}/search?${params.toString()}`;

  try {
    const raw = await get(url);
    const results = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.results) ? raw.results : []);
    if (results.length === 0 && raw && !Array.isArray(raw)) {
      logger.debug('Nominatim search returned non-array', { query: q, keys: Object.keys(raw) });
    }
    return results
      .map((r) => {
        const addr = r.address || {};
        const lat = parseFloat(r.lat);
        const lon = parseFloat(r.lon);
        if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
        const displayName = (r.display_name || '').trim();
        if (!displayName) return null;
        const cityFromAddr = extractCity(addr);
        let countryCode = (addr.country_code || '').toLowerCase().trim();
        if (countryCode.length !== 2) {
          const country = (addr.country || '').trim();
          if (country.length >= 2) countryCode = country.slice(0, 2).toLowerCase();
          else countryCode = 'xx';
        }
        const city = cityFromAddr || (displayName ? displayName.split(',')[0].trim() : null) || addr.state || addr.county || 'Unknown';
        return {
          city,
          region: extractRegion(addr) || null,
          countryCode,
          latitude: lat,
          longitude: lon,
          displayName: displayName || `${city}, ${countryCode}`
        };
      })
      .filter(Boolean);
  } catch (err) {
    logger.warn('Nominatim search failed', { query: q, error: err.message });
    return [];
  }
}

module.exports = {
  reverseGeocode,
  searchCity
};

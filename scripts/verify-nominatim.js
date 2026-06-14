#!/usr/bin/env node
'use strict';

/**
 * Verify Nominatim integration: same URL and parsing as GeocodingService.
 * Run: node scripts/verify-nominatim.js
 * Optional: NOMINATIM_REFERER or APP_URL for Referer header (can help avoid 403).
 * No auth or DB required; hits Nominatim directly.
 * See docs/active/NOMINATIM_GEOCODING.md for 403 / policy notes.
 */

const https = require('https');

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = process.env.NOMINATIM_USER_AGENT || 'ColaboraApp/1.0 (member locations; https://github.com/your-org/colabora)';
const REFERER = process.env.NOMINATIM_REFERER || process.env.APP_URL || '';

function get(url) {
  const headers = { 'User-Agent': USER_AGENT };
  if (REFERER) headers['Referer'] = REFERER;
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (ch) => { data += ch; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Nominatim returned ${res.statusCode}: ${data.slice(0, 300)}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function extractCity(address) {
  if (!address || typeof address !== 'object') return null;
  return address.city || address.town || address.village || address.municipality || address.state || address.county || null;
}

function extractRegion(address) {
  if (!address || typeof address !== 'object') return null;
  return address.state || address.county || address.region || null;
}

async function searchCity(query, limit = 5) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: String(limit)
  });
  const url = `${NOMINATIM_BASE}/search?${params.toString()}`;
  console.log('Request URL:', url);
  const raw = await get(url);
  const results = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.results) ? raw.results : []);
  console.log('Raw type:', Array.isArray(raw) ? 'array' : typeof raw, 'length:', results.length);
  if (results.length > 0) {
    console.log('First raw result keys:', Object.keys(results[0]));
    console.log('First result sample:', JSON.stringify({
      lat: results[0].lat,
      lon: results[0].lon,
      display_name: (results[0].display_name || '').slice(0, 80),
      address: results[0].address
    }, null, 2));
  }
  const mapped = results
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
  return mapped;
}

async function main() {
  const queries = ['Berlin', 'London', 'Madrid'];
  for (const q of queries) {
    console.log('\n--- Query:', q, '---');
    try {
      const results = await searchCity(q, 3);
      console.log('Parsed results:', results.length);
      results.forEach((r, i) => console.log(`  ${i + 1}. ${r.city}, ${r.countryCode} (${r.latitude}, ${r.longitude})`));
      if (results.length === 0) console.log('  (none – check raw response above)');
      await new Promise((r) => setTimeout(r, 1100));
    } catch (err) {
      console.error('Error:', err.message);
      if (err.message.includes('403')) {
        console.error('  Tip: Set APP_URL or NOMINATIM_REFERER. Nominatim may block autocomplete-style use; see docs/active/NOMINATIM_GEOCODING.md');
      }
    }
  }
  console.log('\nDone.');
}

main();

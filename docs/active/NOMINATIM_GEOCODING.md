# Nominatim geocoding integration

## What we use it for

- **Search (city picker):** `GET /search?q=Berlin&format=jsonv2&addressdetails=1&limit=...` — user types a city name, we return place suggestions (city, region, countryCode, lat/lon).
- **Reverse geocode:** `GET /reverse?lat=...&lon=...&format=jsonv2&addressdetails=1&zoom=10` — “Use current location” converts coordinates to a city-level label.

Implementation: `server/services/GeocodingService.js`. Rate limit: 1 request per second; reverse results cached 24h.

## Verification

To confirm the integration works against the live API (same URL and parsing as the app):

```bash
node scripts/verify-nominatim.js
```

This hits `nominatim.openstreetmap.org` for “Berlin”, “London”, “Madrid” and prints raw response + parsed results. No auth or DB required.

## 403 “Access denied”

If you see **403** from Nominatim:

1. **Headers:** They require a valid **User-Agent** (and often **Referer**). We send:
   - `User-Agent`: from `NOMINATIM_USER_AGENT` or default `ColaboraApp/1.0 (member locations; https://github.com/...)`
   - `Referer`: from `NOMINATIM_REFERER` or `APP_URL` (optional but recommended)
   Set `APP_URL` (or `NOMINATIM_REFERER`) in production to your app’s public URL so the Referer is valid.

2. **Usage policy:** [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/) states:
   - **“Auto-complete search … you must not implement”** using their public API.
   Our “city search” is effectively autocomplete (user types, we suggest). So the public instance may block or rate-limit this use. If 403 persists with correct headers and low request rate, treat it as policy restriction.

## Alternatives if Nominatim blocks us

- **Self-hosted Nominatim:** [Install your own instance](https://nominatim.org/release-docs/latest/admin/Installation/) and point the app at it (e.g. via a future `GEOCODE_API_URL` env).
- **Photon (Komoot):** OSM-based, [photon.komoot.io](https://photon.komoot.io/), different API shape; would need a small adapter in `GeocodingService`.
- **Other providers:** Mapbox, Here, etc. (often need API keys and have different terms).

## Summary

- **Integration:** Correct (search + reverse, jsonv2, addressdetails, rate limit, parsing).
- **Proof it can find cities:** Run `node scripts/verify-nominatim.js`; if you get 200 and parsed results, the pipeline works.
- **“No city found” / 403 in production:** Usually either missing/invalid Referer or User-Agent, or Nominatim policy (autocomplete not allowed on public API). Set `APP_URL`/Referer and consider self-hosted Nominatim or another provider for the city picker.

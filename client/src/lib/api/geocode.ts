import { apiRequest } from './client';

export interface GeocodeResult {
  city: string;
  region: string | null;
  countryCode: string;
  latitude: number;
  longitude: number;
  displayName: string;
}

export const geocodeApi = {
  async search(query: string, limit = 10): Promise<{ results: GeocodeResult[] }> {
    const params = new URLSearchParams({ q: query.trim() });
    if (limit > 0) params.set('limit', String(limit));
    const qs = params.toString();
    return apiRequest(`/api/geocode/search${qs ? `?${qs}` : ''}`);
  },
};

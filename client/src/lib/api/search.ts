// Search API functions
import { apiRequest } from './client';
import type { SearchFilters, SearchResults, SearchSuggestion } from '../../types';

export const searchApi = {
  async search(query: string, filters?: SearchFilters): Promise<SearchResults> {
    const params = new URLSearchParams({ q: query });
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        if (key === 'types' && Array.isArray(value)) {
          if (value.length > 0) {
            params.append('types', value.join(','));
          }
          return;
        }
        params.append(key, value.toString());
      });
    }
    return apiRequest<SearchResults>(`/api/search?${params.toString()}`);
  },

  async getSuggestions(query: string, organizationId?: string): Promise<{ suggestions: SearchSuggestion[] }> {
    const params = new URLSearchParams({ q: query });
    if (organizationId) {
      params.append('organizationId', organizationId);
    }
    return apiRequest<{ suggestions: SearchSuggestion[] }>(`/api/search/suggestions?${params.toString()}`);
  },
};

// Export API - handles blob responses
import { ApiError } from './client';

// Helper to get auth token (duplicated here to avoid circular dependency)
function getAuthToken(): string | null {
  return localStorage.getItem('authToken')
}

// Use import.meta.env for Vite (not process.env)
// In development, use relative URLs to leverage Vite's proxy (avoids CORS issues)
// In production, also use relative URLs (same origin)
const API_BASE_URL = ''

export const exportApi = {
  async exportDocument(documentId: string, format: 'pdf' | 'markdown' | 'docx', version?: 'official' | 'with_amendments'): Promise<Blob> {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const versionParam = version ? `&version=${version}` : '';
    const response = await fetch(`${API_BASE_URL}/api/export/documents/${documentId}?format=${format}${versionParam}`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      let errorMessage = 'Export failed';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        errorMessage = `Export failed: ${response.status} ${response.statusText}`;
      }
      throw new ApiError(errorMessage, response.status, `/api/export/documents/${documentId}`);
    }

    return await response.blob();
  }
}


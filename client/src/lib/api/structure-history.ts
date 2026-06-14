// Structure History API functions
import { apiRequest } from './client';
import type { StructureVersionsResponse, StructureVersionResponse, RestoreVersionResponse } from './types';

export const structureHistoryApi = {
  // Get document structure versions
  async getStructureVersions(documentId: string): Promise<StructureVersionsResponse> {
    return apiRequest<StructureVersionsResponse>(`/api/documents/${documentId}/structure-history`)
  },

  // Get detailed change log for a version
  async getStructureVersion(documentId: string, versionId: string): Promise<StructureVersionResponse> {
    return apiRequest<StructureVersionResponse>(`/api/documents/${documentId}/structure-history/${versionId}`)
  },

  // Restore document to a previous version
  async restoreStructureVersion(documentId: string, versionId: string): Promise<RestoreVersionResponse> {
    return apiRequest<RestoreVersionResponse>(`/api/documents/${documentId}/structure-history/${versionId}/restore`, {
      method: 'POST'
    })
  }
}


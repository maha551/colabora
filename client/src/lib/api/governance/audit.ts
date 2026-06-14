// Audit Logs API functions
import { apiRequest } from '../client';
import type { 
  AuditLogsResponse,
  AuditStatsResponse
} from '../types';

export const auditLogsApi = {
  async getAuditLogs(organizationId: string, filters?: {
    actionType?: string;
    performedBy?: string;
    affectedUser?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<AuditLogsResponse> {
    const queryParams = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
    }
    const query = queryParams.toString();
    return apiRequest<AuditLogsResponse>(`/api/governance/${organizationId}/audit-logs${query ? `?${query}` : ''}`)
  },

  async getAuditStats(organizationId: string, days?: number): Promise<AuditStatsResponse> {
    const query = days ? `?days=${days}` : '';
    return apiRequest<AuditStatsResponse>(`/api/governance/${organizationId}/audit-stats${query}`)
  },

  async exportAuditLogs(organizationId: string, filters?: {
    startDate?: string;
    endDate?: string;
    format?: 'csv' | 'json';
  }): Promise<unknown> {
    const queryParams = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
    }
    const query = queryParams.toString();
    return apiRequest<unknown>(`/api/governance/${organizationId}/audit-export${query ? `?${query}` : ''}`)
  },

  async getPublicAuditLogs(organizationId: string, filters?: {
    actionType?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<AuditLogsResponse> {
    const queryParams = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
    }
    const query = queryParams.toString();
    return apiRequest<AuditLogsResponse>(`/api/governance/${organizationId}/public-audit-logs${query ? `?${query}` : ''}`)
  },
};


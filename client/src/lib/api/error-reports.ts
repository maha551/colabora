// Error Reports API functions
import { apiRequest } from './client';
import type { ErrorReportSubmission, ErrorReportsResponse, ErrorReportResponse, ErrorReportStats, ErrorReport } from './types';

export const errorReportsApi = {
  async submitReport(report: ErrorReportSubmission): Promise<{ id: string; message: string }> {
    return apiRequest<{ id: string; message: string }>(
      '/api/error-reports',
      { method: 'POST', body: JSON.stringify(report) },
      2,
      true
    );
  },

  async getReports(status?: string, limit = 50, offset = 0): Promise<ErrorReportsResponse> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    params.append('limit', limit.toString());
    params.append('offset', offset.toString());
    return apiRequest<ErrorReportsResponse>(`/api/error-reports?${params.toString()}`);
  },

  async getReport(id: string): Promise<ErrorReportResponse> {
    return apiRequest<ErrorReportResponse>(`/api/error-reports/${id}`);
  },

  async updateReport(
    id: string,
    updates: {
      status?: ErrorReport['status'];
      priority?: ErrorReport['priority'];
      assigned_to?: string;
      resolution_notes?: string;
    }
  ): Promise<{ message: string }> {
    return apiRequest<{ message: string }>(`/api/error-reports/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async getStats(): Promise<ErrorReportStats> {
    return apiRequest<ErrorReportStats>('/api/error-reports/stats/summary');
  },
}


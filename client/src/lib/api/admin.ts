import { apiRequest } from './client';
import type {
  AdminDashboardResponse,
  AdminOrganizationsResponse,
  AdminOrganizationDetailResponse,
  AdminUsersResponse,
  AdminUserDetailResponse,
  PlatformAuditResponse,
  PlatformAuditStats,
  RateLimitsResponse,
  DocumentIntegrityResponse,
} from './types/admin';
import type { Organization } from '../../types';

export const adminApi = {
  getDashboard(): Promise<AdminDashboardResponse> {
    return apiRequest<AdminDashboardResponse>('/api/admin/dashboard');
  },

  listOrganizations(): Promise<AdminOrganizationsResponse> {
    return apiRequest<AdminOrganizationsResponse>('/api/admin/organizations');
  },

  createOrganization(body: Record<string, unknown>): Promise<{ success: boolean; message?: string; organization: Organization }> {
    return apiRequest('/api/admin/organizations', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  getOrganization(id: string): Promise<AdminOrganizationDetailResponse> {
    return apiRequest<AdminOrganizationDetailResponse>(`/api/admin/organizations/${id}`);
  },

  updateOrganization(
    id: string,
    body: Partial<{
      name: string;
      description: string;
      membershipPolicy: 'open' | 'invitation';
      votingThreshold: number;
      brandingColor: string;
    }>
  ): Promise<{ success: boolean; organization: Organization }> {
    return apiRequest(`/api/admin/organizations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  setOrganizationStatus(id: string, isActive: boolean): Promise<{ success: boolean; message: string }> {
    return apiRequest(`/api/admin/organizations/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    });
  },

  deleteOrganization(id: string, confirmName: string, force = false): Promise<{ success: boolean; message: string }> {
    return apiRequest(`/api/admin/organizations/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ confirmName, force }),
    });
  },

  inviteRepresentatives(organizationId: string, emails: string[]): Promise<{ success: boolean; invitations: number }> {
    return apiRequest(`/api/admin/organizations/${organizationId}/representatives/invite`, {
      method: 'POST',
      body: JSON.stringify({ emails }),
    });
  },

  inviteMembers(organizationId: string, emails: string[]): Promise<{ success: boolean; invitations: number }> {
    return apiRequest(`/api/admin/organizations/${organizationId}/members/invite`, {
      method: 'POST',
      body: JSON.stringify({ emails }),
    });
  },

  addMember(organizationId: string, userId: string): Promise<{ success: boolean }> {
    return apiRequest(`/api/admin/organizations/${organizationId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },

  removeMember(organizationId: string, userId: string): Promise<{ success: boolean }> {
    return apiRequest(`/api/admin/organizations/${organizationId}/members/${userId}`, {
      method: 'DELETE',
    });
  },

  addRepresentative(organizationId: string, newRepresentativeId: string): Promise<{ success: boolean }> {
    return apiRequest(`/api/admin/organizations/${organizationId}/representatives`, {
      method: 'POST',
      body: JSON.stringify({ newRepresentativeId }),
    });
  },

  listUsers(): Promise<AdminUsersResponse> {
    return apiRequest<AdminUsersResponse>('/api/admin/users');
  },

  getUser(id: string): Promise<AdminUserDetailResponse> {
    return apiRequest<AdminUserDetailResponse>(`/api/admin/users/${id}`);
  },

  updateUserStatus(id: string, isActive: boolean, reason?: string): Promise<{ success: boolean; message: string }> {
    return apiRequest(`/api/admin/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive, reason }),
    });
  },

  promoteAdmin(userId: string): Promise<{ success: boolean; message: string }> {
    return apiRequest(`/api/admin/promote-admin/${userId}`, { method: 'POST' });
  },

  demoteAdmin(userId: string): Promise<{ success: boolean; message: string }> {
    return apiRequest(`/api/admin/demote-admin/${userId}`, { method: 'POST' });
  },

  getAuditLogs(options?: { action?: string; adminUserId?: string; limit?: number; offset?: number }): Promise<PlatformAuditResponse> {
    const params = new URLSearchParams();
    if (options?.action) params.append('action', options.action);
    if (options?.adminUserId) params.append('adminUserId', options.adminUserId);
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));
    const qs = params.toString();
    return apiRequest<PlatformAuditResponse>(`/api/admin/audit${qs ? `?${qs}` : ''}`);
  },

  getAuditStats(): Promise<PlatformAuditStats> {
    return apiRequest<PlatformAuditStats>('/api/admin/audit/stats/summary');
  },

  listRateLimits(ip?: string): Promise<RateLimitsResponse> {
    const qs = ip ? `?ip=${encodeURIComponent(ip)}` : '';
    return apiRequest<RateLimitsResponse>(`/api/admin/rate-limits${qs}`);
  },

  clearRateLimits(ip?: string): Promise<{ success: boolean; message: string; deleted: number }> {
    return apiRequest('/api/admin/rate-limits/clear', {
      method: 'POST',
      body: JSON.stringify(ip ? { ip } : {}),
    });
  },

  runDocumentIntegrityCheck(): Promise<DocumentIntegrityResponse> {
    return apiRequest<DocumentIntegrityResponse>('/api/documents/integrity-check');
  },
};

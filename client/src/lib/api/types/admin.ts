import type { Organization } from '../../../types';

export interface AdminDashboardStats {
  totalUsers: number;
  totalOrganizations: number;
  totalDocuments: number;
  activeOrganizations: number;
}

export interface AdminDashboardResponse {
  success: boolean;
  stats: AdminDashboardStats;
  adminUser: {
    id: string;
    name: string;
    email: string;
  };
}

export interface AdminUserListItem {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt?: string;
  created_at?: string;
  organizationsCount: number;
  isActive: boolean;
  suspendedAt?: string | null;
}

export interface AdminUsersResponse {
  success: boolean;
  users: AdminUserListItem[];
}

export interface AdminUserDetail {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string | null;
  createdAt: string;
  isActive: boolean;
  suspendedAt?: string | null;
  suspendedBy?: string | null;
  suspensionReason?: string | null;
  organizations: Array<{
    organizationId: string;
    organizationName: string;
    status: string;
    joinedAt: string;
  }>;
}

export interface AdminUserDetailResponse {
  success: boolean;
  user: AdminUserDetail;
}

export interface AdminOrganizationListItem {
  id: string;
  name: string;
  description?: string | null;
  memberCount: number;
  documentCount: number;
  isActive: boolean;
  createdByName: string;
  createdAt?: string | null;
}

export interface AdminOrganizationsResponse {
  success: boolean;
  organizations: AdminOrganizationListItem[];
}

export interface AdminOrganizationDetailResponse {
  success: boolean;
  organization: Organization;
  members?: Organization['members'];
}

export interface PlatformAuditEntry {
  id: string;
  adminUserId: string;
  adminName?: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  createdAt: string;
}

export interface PlatformAuditResponse {
  success: boolean;
  actions: PlatformAuditEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface PlatformAuditStats {
  success: boolean;
  total: number;
  byAction: Record<string, number>;
}

export interface RateLimitEntry {
  key: string;
  hits: number;
  ttlSeconds: number;
  ttlMinutes: number;
  expiresIn: string;
}

export interface RateLimitsResponse {
  success: boolean;
  count: number;
  rateLimits: RateLimitEntry[];
}

export interface DocumentIntegrityResponse {
  summary: {
    total: number;
    valid: number;
    invalid: number;
  };
  invalidDocuments: Array<{
    id: string;
    title?: string;
    reason?: string;
  }>;
}

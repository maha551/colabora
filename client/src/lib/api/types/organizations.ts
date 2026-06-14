// Organization API Response Types
import type { 
  Organization,
  OrganizationVote,
  User
} from "../../../types";
import type { MessageResponse } from './common';

export interface OrganizationsResponse {
  organizations: Organization[];
}

export interface OrganizationResponse {
  organization: Organization;
}

export interface InviteMembersResponse extends MessageResponse {
  success: boolean;
  invitations: number;
  failed: number;
  failedEmails?: Array<{
    email: string;
    error: string;
    invitationId?: string;
    invitationLink?: string;
  }>;
  invitationLinks?: Array<{
    email: string;
    link: string;
  }>;
}

export interface AdminDashboardResponse {
  totalUsers: number;
  totalOrganizations: number;
  activeOrganizations: number;
  [key: string]: unknown;
}

export interface AdminUsersResponse {
  users: User[];
}

export interface OrganizationVotesResponse {
  votes: OrganizationVote[];
}


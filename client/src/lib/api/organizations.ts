// Organization API functions
import { apiRequest } from './client';
import type {
  DocumentsResponse,
  Comment
} from '../../types';
import type { 
  OrganizationResponse, 
  OrganizationsResponse, 
  AdminDashboardResponse, 
  AdminUsersResponse,
  OrganizationVotesResponse,
  InviteMembersResponse,
  MessageResponse
} from './types';

// Define createOrganizationAdmin separately to avoid forward reference issues
async function createOrganizationAdmin(
  name: string,
  representatives: string[],
  options?: {
    description?: string;
    membershipPolicy?: 'open' | 'invitation';
    votingThreshold?: number;
    governanceRules?: {
      representativeTermMonths?: number;
      electionVotingMethod?: 'simple_majority' | 'ranked_choice' | 'approval';
      electionQuorumPercentage?: number;
      defaultVotingDeadlineHours?: number;
      documentProposalPeriodDays?: number;
      paragraphProposalCutoffDays?: number;
    };
  }
): Promise<OrganizationResponse> {
  return apiRequest<OrganizationResponse>('/api/admin/organizations', {
    method: 'POST',
    body: JSON.stringify({
      name,
      representatives,
      description: options?.description,
      membershipPolicy: options?.membershipPolicy || 'invitation',
      votingThreshold: options?.votingThreshold || 0.75,
      governanceRules: options?.governanceRules
    }),
  })
}

export const organizationsApi = {
  // Create organization (requires admin privileges)
  async createOrganization(
    name: string,
    description?: string,
    representatives?: string[],
    membershipPolicy?: 'open' | 'invitation',
    _votingEnabled?: boolean,
    votingThreshold?: number
  ): Promise<OrganizationResponse> {
    return createOrganizationAdmin(name, representatives || [], {
      description,
      membershipPolicy: membershipPolicy || 'invitation',
      votingThreshold: votingThreshold || 0.75
    })
  },

  // Get user's organizations
  async getOrganizations(): Promise<OrganizationsResponse> {
    return apiRequest<OrganizationsResponse>('/api/organizations')
  },

  async getOrganizationAncestors(organizationId: string): Promise<{
    ancestors: Array<{ id: string; name: string; treeDepth: number }>;
  }> {
    return apiRequest(`/api/organizations/${organizationId}/ancestors`);
  },

  async getOrganizationChildren(organizationId: string): Promise<{
    children: Array<{ id: string; name: string; treeDepth: number; participationProfile: string }>;
  }> {
    return apiRequest(`/api/organizations/${organizationId}/children`);
  },

  // Get organization details
  async getOrganization(organizationId: string): Promise<OrganizationResponse> {
    return apiRequest<OrganizationResponse>(`/api/organizations/${organizationId}`)
  },

  // Get organization documents (includeMinutes: true adds meeting minutes to the list)
  async getOrganizationDocuments(
    organizationId: string,
    options?: { includeMinutes?: boolean }
  ): Promise<DocumentsResponse> {
    const includeMinutes = options?.includeMinutes !== false;
    const query = includeMinutes ? '?includeMinutes=true' : '';
    return apiRequest<DocumentsResponse>(`/api/documents/organization/${organizationId}${query}`)
  },

  // Admin API functions
  async getAdminDashboard(): Promise<AdminDashboardResponse> {
    return apiRequest<AdminDashboardResponse>('/api/admin/dashboard')
  },

  createOrganizationAdmin,

  async getAllOrganizationsAdmin(): Promise<OrganizationsResponse> {
    return apiRequest<OrganizationsResponse>('/api/admin/organizations')
  },

  // Invite representatives (admin only)
  async inviteRepresentatives(organizationId: string, emails: string[]): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/admin/organizations/${organizationId}/representatives/invite`, {
      method: 'POST',
      body: JSON.stringify({ emails }),
    })
  },

  async updateOrganizationStatus(id: string, isActive: boolean): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/admin/organizations/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    })
  },

  async getAllUsersAdmin(): Promise<AdminUsersResponse> {
    return apiRequest<AdminUsersResponse>('/api/admin/users')
  },

  async promoteUserToAdmin(userId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/admin/promote-admin/${userId}`, {
      method: 'POST',
    })
  },

  async setOverviewPin(
    organizationId: string,
    eventId: string | null
  ): Promise<{
    success: boolean;
    overviewPinnedEventId: string | null;
    overviewPinnedAt: string | null;
    overviewPinnedByUserId: string | null;
    overviewPinnedEvent: import('./calendar').CalendarEvent | null;
  }> {
    return apiRequest(`/api/organizations/${organizationId}/overview-pin`, {
      method: 'PUT',
      body: JSON.stringify({ eventId }),
    });
  },

  // Update organization
  async updateOrganization(organizationId: string, updates: {
    name?: string,
    description?: string,
    membershipPolicy?: 'open' | 'invitation',
    votingThreshold?: number,
    brandingColor?: string,
    brandingLogoUrl?: string,
    brandingTitle?: string,
    brandingBannerUrl?: string,
    iconSet?: 'lucide' | 'tabler' | 'heroicons',
    fontFamily?: 'inter' | 'work-sans' | 'poppins' | 'merriweather'
  }): Promise<OrganizationResponse> {
    return apiRequest<OrganizationResponse>(`/api/organizations/${organizationId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
  },

  // Nominate new representative
  async nominateRepresentative(organizationId: string, newRepresentativeId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/organizations/${organizationId}/representatives`, {
      method: 'POST',
      body: JSON.stringify({ newRepresentativeId }),
    })
  },

  // Initiate mistrust vote for representative removal
  async initiateMistrustVote(organizationId: string, repId: string): Promise<{
    success: boolean;
    message: string;
    vote: {
      id: string;
      organizationId: string;
      title: string;
      voteType: string;
      status: string;
      threshold: number;
      quorumPercentage: number;
    };
  }> {
    return apiRequest(`/api/governance/${organizationId}/representatives/${repId}/mistrust-vote`, {
      method: 'POST',
    })
  },

  // Complete organization vote
  async completeOrganizationVote(organizationId: string, voteId: string): Promise<{
    success: boolean;
    vote: {
      id: string;
      status: string;
      approvalRate: number;
      totalVotes: number;
      quorumMet: boolean;
      approvalMet: boolean;
      passed: boolean;
    };
  }> {
    return apiRequest(`/api/organizations/${organizationId}/votes/${voteId}/complete`, {
      method: 'POST',
    })
  },

  // Invite members
  async inviteMembers(organizationId: string, emails: string[]): Promise<InviteMembersResponse> {
    return apiRequest<InviteMembersResponse>(`/api/organizations/${organizationId}/members/invite`, {
      method: 'POST',
      body: JSON.stringify({ emails }),
    })
  },

  // Get invitation history
  async getInvitations(organizationId: string): Promise<{
    success: boolean;
    invitations: Array<{
      id: string;
      email: string;
      invitationType: 'member' | 'representative';
      status: 'pending' | 'accepted' | 'expired' | 'cancelled';
      expiresAt: string;
      acceptedAt: string | null;
      createdAt: string;
      inviterName: string | null;
      acceptedByName: string | null;
      isExpired: boolean;
    }>;
    count: number;
  }> {
    return apiRequest(`/api/organizations/${organizationId}/invitations`)
  },

  // Resend invitation email
  async resendInvitation(organizationId: string, invitationId: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
    invitationLink?: string;
  }> {
    return apiRequest(`/api/organizations/${organizationId}/invitations/${invitationId}/resend`, {
      method: 'POST',
    })
  },

  // Add member
  async addMember(organizationId: string, userId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/organizations/${organizationId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    })
  },

  // Remove member
  async removeMember(organizationId: string, userId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/organizations/${organizationId}/members/${userId}`, {
      method: 'DELETE',
    })
  },

  // Leave organization (self-service)
  async leaveOrganization(organizationId: string): Promise<{
    success: boolean;
    electionCreated?: boolean;
    electionId?: string;
  }> {
    return apiRequest(`/api/organizations/${organizationId}/leave`, {
      method: 'POST',
    })
  },

  // Get organization votes
  async getOrganizationVotes(organizationId: string): Promise<OrganizationVotesResponse> {
    return apiRequest<OrganizationVotesResponse>(`/api/organizations/${organizationId}/votes`)
  },

  // Create organization vote
  async createOrganizationVote(organizationId: string, title: string, description?: string, voteType?: string, targetDocumentId?: string, votingStartDate?: string, votingEndDate?: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/organizations/${organizationId}/votes`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        description,
        voteType,
        targetDocumentId,
        votingStartDate,
        votingEndDate
      }),
    })
  },

  async proposeSubgroup(
    organizationId: string,
    body: {
      name: string;
      description?: string;
      visibility?: string;
      profile?: string;
      sourceMeetingDecisionId?: string;
    }
  ): Promise<{ mode: 'vote_proposed' | 'created'; vote?: { id: string }; organization?: { id: string } }> {
    return apiRequest(`/api/organizations/${organizationId}/subgroups`, {
      method: 'POST',
      body: JSON.stringify({
        name: body.name,
        ...(body.description != null && { description: body.description }),
        ...(body.visibility != null && { visibility: body.visibility }),
        ...(body.profile != null && { profile: body.profile }),
        ...(body.sourceMeetingDecisionId != null && { source_meeting_decision_id: body.sourceMeetingDecisionId }),
      }),
    });
  },

  async getParticipations(organizationId: string, kind?: string): Promise<{ participations: Array<{
    id: string;
    organizationId: string;
    userId: string | null;
    participationKind: string;
  }> }> {
    const query = kind ? `?kind=${encodeURIComponent(kind)}` : '';
    return apiRequest(`/api/organizations/${organizationId}/participations${query}`);
  },

  async getParticipationGraph(organizationId: string): Promise<{
    nodes: Array<{ id: string; name: string; kind: string }>;
    edges: Array<{ id: string; sourceOrgId: string; targetOrgId: string; relationshipType: string }>;
    layout: Record<string, unknown>;
  }> {
    return apiRequest(`/api/organizations/${organizationId}/participation-graph`);
  },

  async saveParticipationGraphLayout(organizationId: string, layout: Record<string, unknown>): Promise<{ success: boolean }> {
    return apiRequest(`/api/organizations/${organizationId}/participation-graph/layout`, {
      method: 'PUT',
      body: JSON.stringify({ layout }),
    });
  },

  // Approve vote (representatives only)
  async approveVote(organizationId: string, voteId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/organizations/${organizationId}/votes/${voteId}/approve`, {
      method: 'POST',
    })
  },

  // Decline vote (representatives only)
  async declineVote(organizationId: string, voteId: string, reason: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/organizations/${organizationId}/votes/${voteId}/decline`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
  },

  // Cast vote in organization vote
  async castVote(organizationId: string, voteId: string, choice: 'yes' | 'no' | 'abstain'): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/organizations/${organizationId}/votes/${voteId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ choice }),
    })
  },

  // Organization vote comments
  async getVoteComments(
    organizationId: string,
    voteId: string,
    options?: { limit?: number; offset?: number; sort?: 'newest' | 'top' }
  ): Promise<{ comments: Comment[]; total: number; limit: number; offset: number }> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    if (options?.sort) params.set('sort', options.sort);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/api/organizations/${organizationId}/votes/${voteId}/comments${query}`);
  },

  async addVoteComment(
    organizationId: string,
    voteId: string,
    data: { text: string; parentId?: string }
  ): Promise<{ message: string; comment: Comment }> {
    const body: { text: string; parentId?: string } = { text: data.text };
    if (data.parentId) body.parentId = data.parentId;
    return apiRequest(`/api/organizations/${organizationId}/votes/${voteId}/comments`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async updateVoteComment(
    organizationId: string,
    voteId: string,
    commentId: string,
    data: { text: string }
  ): Promise<{ message: string; comment: Comment }> {
    return apiRequest(`/api/organizations/${organizationId}/votes/${voteId}/comments/${commentId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteVoteComment(
    organizationId: string,
    voteId: string,
    commentId: string
  ): Promise<{ message: string; comment: Comment | null }> {
    return apiRequest(`/api/organizations/${organizationId}/votes/${voteId}/comments/${commentId}`, {
      method: 'DELETE',
    });
  },

  // Member locations (city-level, anonymous map)
  async getMyLocation(organizationId: string): Promise<{ location: import('../../types').MemberLocation | null }> {
    return apiRequest(`/api/organizations/${organizationId}/my-location`);
  },

  async setMyLocation(
    organizationId: string,
    payload:
      | { useCurrentLocation: true; latitude: number; longitude: number; showOnMap?: boolean }
      | {
          city: string;
          region?: string | null;
          countryCode: string;
          latitude: number;
          longitude: number;
          source: 'manual';
          showOnMap?: boolean;
        }
  ): Promise<{ success: boolean; location: import('../../types').MemberLocation }> {
    return apiRequest(`/api/organizations/${organizationId}/my-location`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async getMemberLocations(organizationId: string): Promise<{ cities: import('../../types').CityAggregate[] }> {
    return apiRequest(`/api/organizations/${organizationId}/member-locations`);
  },
}


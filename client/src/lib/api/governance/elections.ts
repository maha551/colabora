// Elections API functions
import { apiRequest } from '../client';
import type { 
  ElectionsResponse, 
  VotingAnalyticsResponse, 
  ElectionResultsResponse,
  MessageResponse
} from '../types';
import type { Comment } from '@/types';

export const electionsApi = {
  // Elections
  async createElection(organizationId: string, electionData: {
    title: string;
    description?: string;
    positionsAvailable: number;
    termMonths?: number;
  }): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/governance/${organizationId}/elections`, {
      method: 'POST',
      body: JSON.stringify(electionData),
    })
  },

  async getElections(organizationId: string): Promise<ElectionsResponse> {
    return apiRequest<ElectionsResponse>(`/api/governance/${organizationId}/elections`)
  },

  async startElection(organizationId: string, electionId: string, votingData: {
    votingStartDate?: string;
    votingEndDate: string;
  }): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/governance/${organizationId}/elections/${electionId}/start`, {
      method: 'POST',
      body: JSON.stringify(votingData),
    })
  },

  async nominateCandidate(organizationId: string, electionId: string, nominationData: {
    candidateUserId: string;
    nominationStatement?: string;
  }): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/governance/${organizationId}/elections/${electionId}/candidates`, {
      method: 'POST',
      body: JSON.stringify(nominationData),
    })
  },

  async acceptNomination(organizationId: string, electionId: string, candidateId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/governance/${organizationId}/elections/${electionId}/candidates/${candidateId}/accept`, {
      method: 'POST',
    })
  },

  async castElectionVote(organizationId: string, electionId: string, voteData: {
    candidateRanking: string[]; // Array of candidate IDs in order of preference
  }): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/governance/${organizationId}/elections/${electionId}/vote`, {
      method: 'POST',
      body: JSON.stringify(voteData),
    })
  },

  async updateElectionPhase(organizationId: string, electionId: string, newPhase: 'nomination' | 'voting'): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/governance/${organizationId}/elections/${electionId}/update-phase`, {
      method: 'POST',
      body: JSON.stringify({ newPhase }),
    })
  },

  async completeElection(organizationId: string, electionId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/governance/${organizationId}/elections/${electionId}/complete`, {
      method: 'POST',
    })
  },

  /** Cancel election (rep or creator). Allowed when status is draft, announced, nomination, active, or voting. */
  async cancelElection(organizationId: string, electionId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/governance/${organizationId}/elections/${electionId}/cancel`, {
      method: 'POST',
    })
  },

  // Representative Resignation
  async resignAsRepresentative(organizationId: string, repId: string): Promise<{
    success: boolean;
    message: string;
    electionCreated: boolean;
    electionId?: string;
  }> {
    return apiRequest(`/api/governance/${organizationId}/representatives/${repId}/resign`, {
      method: 'POST',
    })
  },

  async getPendingResignations(organizationId: string): Promise<{
    pendingResignations: Array<{
      id: string;
      userId: string;
      userName?: string;
      userEmail?: string;
      resignationRequestedAt: string;
      replacementElectionId?: string;
      failedElectionAttempts?: number;
      electionStatus?: string;
      electionTitle?: string;
    }>;
  }> {
    return apiRequest(`/api/governance/${organizationId}/representatives/pending-resignations`)
  },

  // Phase Management
  async checkElectionPhaseTransitions(organizationId: string): Promise<{
    success: boolean;
    message: string;
    advancedCount: number;
    advancedElections: Array<{
      electionId: string;
      oldPhase: string;
      newPhase: string;
    }>;
  }> {
    return apiRequest(`/api/governance/${organizationId}/elections/check-phase-transitions`, {
      method: 'POST',
    })
  },

  async forceElectionPhase(organizationId: string, electionId: string, newPhase: 'nomination' | 'voting' | 'completed'): Promise<{
    success: boolean;
    message: string;
    election: {
      id: string;
      status: string;
    };
  }> {
    return apiRequest(`/api/governance/${organizationId}/elections/${electionId}/force-phase`, {
      method: 'POST',
      body: JSON.stringify({ newPhase }),
    })
  },

  // Analytics
  async getVotingAnalytics(organizationId: string, period?: 'month' | 'quarter' | 'year'): Promise<VotingAnalyticsResponse> {
    const query = period ? `?period=${period}` : '';
    return apiRequest<VotingAnalyticsResponse>(`/api/governance/${organizationId}/analytics${query}`)
  },

  // Election Results
  async getElectionResults(organizationId: string, electionId: string): Promise<ElectionResultsResponse> {
    return apiRequest<ElectionResultsResponse>(`/api/governance/${organizationId}/elections/${electionId}/results`)
  },

  // Get user's vote status for an election
  async getUserElectionVoteStatus(organizationId: string, electionId: string): Promise<{
    hasVoted: boolean;
    voteData?: {
      candidateRanking?: string[];
      approvedCandidates?: string[];
      candidateId?: string;
    };
  }> {
    return apiRequest(`/api/governance/${organizationId}/elections/${electionId}/user-vote-status`)
  },

  // Election comments
  async getComments(
    organizationId: string,
    electionId: string,
    options?: { limit?: number; offset?: number; sort?: 'newest' | 'top' }
  ): Promise<{ comments: Comment[]; total: number; limit: number; offset: number }> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    if (options?.sort) params.set('sort', options.sort || 'newest');
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/api/governance/${organizationId}/elections/${electionId}/comments${query}`);
  },

  async addComment(
    organizationId: string,
    electionId: string,
    data: { text: string; parentId?: string }
  ): Promise<{ message: string; comment: Comment }> {
    const body: { text: string; parentId?: string } = { text: data.text };
    if (data.parentId) body.parentId = data.parentId;
    return apiRequest(`/api/governance/${organizationId}/elections/${electionId}/comments`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async updateComment(
    organizationId: string,
    electionId: string,
    commentId: string,
    data: { text: string }
  ): Promise<{ message: string; comment: Comment }> {
    return apiRequest(`/api/governance/${organizationId}/elections/${electionId}/comments/${commentId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteComment(
    organizationId: string,
    electionId: string,
    commentId: string
  ): Promise<{ message: string; comment: Comment | null }> {
    return apiRequest(`/api/governance/${organizationId}/elections/${electionId}/comments/${commentId}`, {
      method: 'DELETE',
    });
  },
};


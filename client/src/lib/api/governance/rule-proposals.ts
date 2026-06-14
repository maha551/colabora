// Rule Proposals API functions
import { apiRequest } from '../client';
import type { 
  RuleProposalsResponse,
  MessageResponse,
  Comment
} from '../types';

export const ruleProposalsApi = {
  async getRuleProposals(organizationId: string): Promise<RuleProposalsResponse> {
    return apiRequest<RuleProposalsResponse>(`/api/governance/${organizationId}/rule-proposals`)
  },

  async createRuleProposal(organizationId: string, proposalData: {
    title: string;
    description?: string;
    ruleField: string;
    proposedValue: unknown;
    options?: Array<{
      optionTitle: string;
      optionDescription?: string;
      proposedValue: unknown;
    }>;
  }): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/governance/${organizationId}/rule-proposals`, {
      method: 'POST',
      body: JSON.stringify(proposalData),
    })
  },

  async startRuleProposalVoting(organizationId: string, proposalId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/governance/${organizationId}/rule-proposals/${proposalId}/start-voting`, {
      method: 'POST',
    })
  },

  async declineRuleProposal(organizationId: string, proposalId: string, reason: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/governance/${organizationId}/rule-proposals/${proposalId}/decline`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
  },

  async withdrawRuleProposal(organizationId: string, proposalId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/governance/${organizationId}/rule-proposals/${proposalId}/withdraw`, {
      method: 'POST',
    })
  },

  async voteOnRuleProposal(organizationId: string, proposalId: string, voteData: {
    vote?: 'PRO' | 'NEUTRAL' | 'CONTRA';
    selectedOptionId?: string;
    voteChoice?: 'yes' | 'no' | 'abstain';
  }): Promise<MessageResponse> {
    // Align with other vote APIs: always send 'vote' (PRO/NEUTRAL/CONTRA) as primary field.
    // Server accepts both vote and voteChoice; vote matches structure/paragraph/document APIs.
    const body: Record<string, unknown> = { ...voteData };
    if (!body.vote && body.voteChoice != null) {
      const vc = body.voteChoice;
      body.vote = (vc === 'yes' || vc === 'PRO') ? 'PRO' : (vc === 'no' || vc === 'CONTRA') ? 'CONTRA' : 'NEUTRAL';
    }
    return apiRequest<MessageResponse>(`/api/governance/${organizationId}/rule-proposals/${proposalId}/vote`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async completeRuleProposal(organizationId: string, proposalId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/governance/${organizationId}/rule-proposals/${proposalId}/complete`, {
      method: 'POST',
    })
  },

  // Rule proposal comments (organization-scoped)
  async getComments(
    organizationId: string,
    proposalId: string,
    options?: { limit?: number; offset?: number; sort?: 'newest' | 'top' }
  ): Promise<{ comments: Comment[]; total: number; limit: number; offset: number }> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    if (options?.sort) params.set('sort', options.sort);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ comments: Comment[]; total: number; limit: number; offset: number }>(
      `/api/governance/${organizationId}/rule-proposals/${proposalId}/comments${query}`
    );
  },

  async addComment(
    organizationId: string,
    proposalId: string,
    data: { text: string; parentId?: string }
  ): Promise<{ message: string; comment: Comment }> {
    const body: { text: string; parentId?: string } = { text: data.text };
    if (data.parentId) body.parentId = data.parentId;
    return apiRequest<{ message: string; comment: Comment }>(
      `/api/governance/${organizationId}/rule-proposals/${proposalId}/comments`,
      { method: 'POST', body: JSON.stringify(body) }
    );
  },

  async updateComment(
    organizationId: string,
    proposalId: string,
    commentId: string,
    data: { text: string }
  ): Promise<{ message: string; comment: Comment }> {
    return apiRequest<{ message: string; comment: Comment }>(
      `/api/governance/${organizationId}/rule-proposals/${proposalId}/comments/${commentId}`,
      { method: 'PUT', body: JSON.stringify(data) }
    );
  },

  async deleteComment(
    organizationId: string,
    proposalId: string,
    commentId: string
  ): Promise<{ message: string; comment: Comment | null }> {
    return apiRequest<{ message: string; comment: Comment | null }>(
      `/api/governance/${organizationId}/rule-proposals/${proposalId}/comments/${commentId}`,
      { method: 'DELETE' }
    );
  },
};


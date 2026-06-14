// Activity Feed API functions
import { apiRequest } from './client';
import type { AgreedVersionsResponse, AgreedHistoryResponse, DebatedProposalsResponse, PendingVotesResponse, DecisionsResponse, PendingDecisionsResponse } from './types';

export const activityApi = {
  // Get agreed versions (recently accepted proposals)
  async getAgreedVersions(since?: string): Promise<AgreedVersionsResponse> {
    const params = new URLSearchParams();
    if (since) {
      params.append('since', since);
    }
    const queryString = params.toString();
    return apiRequest<AgreedVersionsResponse>(`/api/agreed-versions${queryString ? `?${queryString}` : ''}`)
  },

  // Get aggregated history entries from all documents
  async getAgreedHistory(params?: {
    limit?: number;
    offset?: number;
    documentId?: string;
    since?: string;
  }): Promise<AgreedHistoryResponse> {
    const searchParams = new URLSearchParams();
    if (params?.limit !== undefined) {
      searchParams.append('limit', String(params.limit));
    }
    if (params?.offset !== undefined) {
      searchParams.append('offset', String(params.offset));
    }
    if (params?.documentId) {
      searchParams.append('documentId', params.documentId);
    }
    if (params?.since) {
      searchParams.append('since', params.since);
    }
    const queryString = searchParams.toString();
    return apiRequest<AgreedHistoryResponse>(`/api/agreed-versions/history${queryString ? `?${queryString}` : ''}`)
  },

  // Get most debated proposals
  async getDebatedProposals(): Promise<DebatedProposalsResponse> {
    return apiRequest<DebatedProposalsResponse>('/api/debated-proposals')
  },

  // Get pending votes (proposals awaiting user's vote)
  async getPendingVotes(): Promise<PendingVotesResponse> {
    return apiRequest<PendingVotesResponse>('/api/pending-votes')
  },

  // Get all open decisions (paragraph proposals, elections, org votes, rule/structure proposals)
  async getPendingDecisions(params?: {
    limit?: number;
    offset?: number;
    kind?: string;
    documentId?: string;
    organizationId?: string;
  }): Promise<PendingDecisionsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.limit !== undefined) searchParams.append('limit', String(params.limit));
    if (params?.offset !== undefined) searchParams.append('offset', String(params.offset));
    if (params?.kind) searchParams.append('kind', params.kind);
    if (params?.documentId) searchParams.append('documentId', params.documentId);
    if (params?.organizationId) searchParams.append('organizationId', params.organizationId);
    const queryString = searchParams.toString();
    return apiRequest<PendingDecisionsResponse>(`/api/pending-decisions${queryString ? `?${queryString}` : ''}`);
  },

  // Get unified decisions timeline (paragraph changes, rule proposals, elections, org votes, etc.)
  async getDecisions(params?: {
    limit?: number;
    offset?: number;
    documentId?: string;
    organizationId?: string;
    kind?: string;
  }): Promise<DecisionsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.limit !== undefined) {
      searchParams.append('limit', String(params.limit));
    }
    if (params?.offset !== undefined) {
      searchParams.append('offset', String(params.offset));
    }
    if (params?.documentId) {
      searchParams.append('documentId', params.documentId);
    }
    if (params?.organizationId) {
      searchParams.append('organizationId', params.organizationId);
    }
    if (params?.kind) {
      searchParams.append('kind', params.kind);
    }
    const queryString = searchParams.toString();
    return apiRequest<DecisionsResponse>(`/api/decisions${queryString ? `?${queryString}` : ''}`);
  },
}


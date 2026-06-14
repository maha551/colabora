/**
 * Vote verification and ballot export API (Agent E verifier, Agent B/C/D endpoints).
 */

import { apiRequest } from './client';

export interface VerifyResult {
  match: boolean;
  contestId: string;
  voteType: string;
  verificationKind?: 'pro_contra' | 'election' | 'meeting_options';
  computed?: { pro: number; contra: number; neutral: number; total: number; optionCounts?: Record<string, number> };
  announcedResult?: { pro: number; contra: number; neutral: number; total: number };
  announcedOptionCounts?: Record<string, number>;
  diff?: { pro: number; contra: number; neutral: number; total: number };
  ballotCount?: number;
  announcedBallotCount?: number;
  candidateDiff?: Record<string, number>;
  optionDiff?: Record<string, number>;
}

export interface VerifiableContest {
  voteType: string;
  contestId: string;
  title: string;
  closedAt: string | null;
  statusLabel?: string;
  documentId?: string;
  meetingId?: string;
}

export interface ContestsListResponse {
  contests: VerifiableContest[];
  total: number;
  limit: number;
  offset: number;
}

export interface UserVoteReceipt {
  id: string;
  userId: string;
  organizationId: string;
  voteType: string;
  contestId: string;
  receiptId: string;
  contestTitle?: string;
  voteRecordedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BallotExportResponse {
  contestId: string;
  voteType: string;
  ballots: Array<{
    contestId: string;
    choice: string;
    createdAt: string;
    receiptId?: string;
    voteHash?: string;
    userId?: string;
  }>;
  closedAt: string | null;
  announcedResult?: { pro: number; contra: number; neutral: number; total: number };
  announcedOptionCounts?: Record<string, number>;
}

export interface VoteLogEntry {
  logSequenceId: number;
  previousEntryHash: string;
  voteType: string;
  contestId: string;
  choice: string;
  timestamp: string;
  voteHash?: string;
  receiptId?: string;
  createdAt: string;
}

export interface VoteLogResponse {
  entries: VoteLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface ReceiptsResponse {
  receiptIds: string[];
  voteHashes: string[];
}

export const verificationApi = {
  async verify(voteType: string, contestId: string): Promise<VerifyResult> {
    const params = new URLSearchParams({ voteType, contestId });
    return apiRequest<VerifyResult>(`/api/verification/verify?${params.toString()}`);
  },

  async getBallots(voteType: string, contestId: string): Promise<BallotExportResponse> {
    const params = new URLSearchParams({ voteType, contestId });
    return apiRequest<BallotExportResponse>(`/api/verification/ballots?${params.toString()}`);
  },

  async listContests(
    organizationId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<ContestsListResponse> {
    const search = new URLSearchParams({ organizationId });
    if (params?.limit != null) search.set('limit', String(params.limit));
    if (params?.offset != null) search.set('offset', String(params.offset));
    return apiRequest<ContestsListResponse>(`/api/verification/contests?${search.toString()}`);
  },

  async saveMyReceipt(body: {
    organizationId: string;
    voteType: string;
    contestId: string;
    receiptId: string;
    contestTitle?: string;
    voteRecordedAt?: string;
  }): Promise<{ success: boolean; receipt: UserVoteReceipt }> {
    return apiRequest('/api/vote-verification/my-receipts', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async listMyReceipts(
    organizationId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<{ receipts: UserVoteReceipt[]; total: number; limit: number; offset: number }> {
    const search = new URLSearchParams({ organizationId });
    if (params?.limit != null) search.set('limit', String(params.limit));
    if (params?.offset != null) search.set('offset', String(params.offset));
    return apiRequest(`/api/vote-verification/my-receipts?${search.toString()}`);
  },

  async getLog(params: {
    voteType?: string;
    contestId?: string;
    limit?: number;
    offset?: number;
  }): Promise<VoteLogResponse> {
    const search = new URLSearchParams();
    if (params.voteType) search.set('voteType', params.voteType);
    if (params.contestId) search.set('contestId', params.contestId);
    if (params.limit != null) search.set('limit', String(params.limit));
    if (params.offset != null) search.set('offset', String(params.offset));
    const query = search.toString();
    return apiRequest<VoteLogResponse>(`/api/vote-verification/log${query ? `?${query}` : ''}`);
  },

  async getLogChain(organizationId: string, limit?: number): Promise<{ entries: VoteLogEntry[]; total: number; limit: number }> {
    const params = new URLSearchParams({ organizationId });
    if (limit != null) params.set('limit', String(limit));
    return apiRequest<{ entries: VoteLogEntry[]; total: number; limit: number }>(
      `/api/vote-verification/log/chain?${params.toString()}`
    );
  },

  async getReceipts(voteType: string, contestId: string): Promise<ReceiptsResponse> {
    const params = new URLSearchParams({ voteType, contestId });
    return apiRequest<ReceiptsResponse>(`/api/vote-verification/receipts?${params.toString()}`);
  },
};

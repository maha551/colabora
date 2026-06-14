// Vote API functions
import { apiRequest, invalidateCache } from './client';
import type { VoteResponse } from './types';

export const votesApi = {
  // Cast or update a vote on a proposal
  async castVote(
    documentId: string,
    paragraphId: string,
    proposalId: string,
    vote: 'PRO' | 'NEUTRAL' | 'CONTRA'
  ): Promise<VoteResponse> {
    const result = await apiRequest<VoteResponse>(`/api/documents/${documentId}/paragraphs/${paragraphId}/proposals/${proposalId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote }),
    })
    // Invalidate document cache since votes affect proposal approval status
    invalidateCache(`/api/documents/${documentId}`)
    return result
  },
}


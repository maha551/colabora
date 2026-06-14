// Proposal API functions
import { apiRequest, invalidateCache } from './client';
import type { HeadingLevel } from '../../types';
import type { ProposalResponse, MessageResponse } from './types';

export const proposalsApi = {
  // Create a new proposal
  async createProposal(
    documentId: string,
    paragraphId: string,
    data: {
      text: string
      type: 'BODY' | 'TITLE'
      headingLevel?: HeadingLevel
    }
  ): Promise<ProposalResponse> {
    const result = await apiRequest<ProposalResponse>(`/api/documents/${documentId}/paragraphs/${paragraphId}/proposals`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    // Invalidate document cache since proposals are part of document state
    invalidateCache(`/api/documents/${documentId}`)
    return result
  },

  // Delete a proposal
  async deleteProposal(
    documentId: string,
    paragraphId: string,
    proposalId: string
  ): Promise<MessageResponse> {
    const result = await apiRequest<MessageResponse>(`/api/documents/${documentId}/paragraphs/${paragraphId}/proposals/${proposalId}`, {
      method: 'DELETE',
    })
    // Invalidate document cache since proposals are part of document state
    invalidateCache(`/api/documents/${documentId}`)
    return result
  },
}


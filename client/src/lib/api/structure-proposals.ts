// Structure Proposals API functions
import { apiRequest } from './client';
import { logger } from '../logger';
import type { StructureOperation } from '../../types';
import type { StructureProposalsResponse, StructureProposalResponse, MessageResponse, StructureProposalVoteResponse } from './types';
import type { CommentResponse } from './types/documents';

export const structureProposalsApi = {
  // Get all structure proposals for a document
  async getStructureProposals(documentId: string): Promise<StructureProposalsResponse> {
    logger.log('API: getStructureProposals called for document:', documentId);
    try {
      const result = await apiRequest<StructureProposalsResponse>(`/api/documents/${documentId}/structure-proposals`);
      logger.log('API: getStructureProposals success:', result);
      return result;
    } catch (error) {
      logger.error('API: getStructureProposals failed:', error);
      throw error;
    }
  },

  // Get a specific structure proposal
  async getStructureProposal(documentId: string, proposalId: string): Promise<StructureProposalResponse> {
    return apiRequest<StructureProposalResponse>(`/api/documents/${documentId}/structure-proposals/${proposalId}`)
  },

  // Create a new structure proposal
  async createStructureProposal(
    documentId: string,
    title: string,
    description: string | undefined,
    operations: StructureOperation[]
  ): Promise<StructureProposalResponse> {
    return apiRequest<StructureProposalResponse>(`/api/documents/${documentId}/structure-proposals`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        description,
        operations
      }),
    })
  },

  // Vote on a structure proposal
  async voteOnStructureProposal(
    documentId: string,
    proposalId: string,
    vote: 'PRO' | 'NEUTRAL' | 'CONTRA'
  ): Promise<StructureProposalVoteResponse> {
    return apiRequest<StructureProposalVoteResponse>(`/api/documents/${documentId}/structure-proposals/${proposalId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote }),
    })
  },

  // Delete/cancel a structure proposal
  async deleteStructureProposal(documentId: string, proposalId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/documents/${documentId}/structure-proposals/${proposalId}`, {
      method: 'DELETE'
    })
  },

  // Complete vote on structure proposal (close voting, evaluate outcome, apply if approved)
  async completeStructureProposal(
    documentId: string,
    proposalId: string
  ): Promise<{ message: string; applied: boolean; outcome: string }> {
    return apiRequest<{ message: string; applied: boolean; outcome: string }>(
      `/api/documents/${documentId}/structure-proposals/${proposalId}/complete`,
      { method: 'POST' }
    );
  },

  // Add comment to structure proposal
  async addCommentToStructureProposal(
    documentId: string,
    proposalId: string,
    text: string,
    parentId?: string
  ): Promise<CommentResponse> {
    return apiRequest<CommentResponse>(`/api/documents/${documentId}/structure-proposals/${proposalId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text, parentId }),
    })
  },
}


// Document Tree Proposals API functions
import { apiRequest } from './client';
import type { TreeProposalOperation, TreeProposalsResponse, TreeProposalResponse } from '../../types';
import type { MessageResponse, StructureProposalVoteResponse } from './types';

export const documentTreeProposalsApi = {
  // Get all tree proposals for a document
  async getProposals(documentId: string): Promise<TreeProposalsResponse> {
    return apiRequest<TreeProposalsResponse>(`/api/document-tree-proposals/${documentId}`)
  },

  // Create a tree proposal
  async createProposal(operation: TreeProposalOperation): Promise<TreeProposalResponse> {
    return apiRequest<TreeProposalResponse>('/api/document-tree-proposals', {
      method: 'POST',
      body: JSON.stringify(operation),
    })
  },

  // Vote on a tree proposal
  async voteOnProposal(proposalId: string, vote: 'PRO' | 'NEUTRAL' | 'CONTRA'): Promise<StructureProposalVoteResponse> {
    return apiRequest<StructureProposalVoteResponse>(`/api/document-tree-proposals/${proposalId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote }),
    })
  },

  // Complete vote (close voting, evaluate outcome, apply if approved)
  async completeTreeProposal(proposalId: string): Promise<{ success: boolean; message: string; outcome: string; applied: boolean }> {
    return apiRequest(`/api/document-tree-proposals/${proposalId}/complete`, {
      method: 'POST',
    })
  },

  // Cancel/delete a proposal
  async cancelProposal(proposalId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/document-tree-proposals/${proposalId}`, {
      method: 'DELETE',
    })
  },
}


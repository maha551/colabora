// Document API functions
import { apiRequest, invalidateCache } from './client';
import { logger } from '../logger';
import type { Document } from '../../types';

// Response types (temporary - should be moved to types file)
interface DocumentResponse {
  document: Document;
}

interface DocumentsResponse {
  documents: Document[];
}

interface BatchDocumentsResponse {
  documents: Array<{
    id: string;
    title: string;
    paragraphs: Array<{
      id: string;
      text?: string;
      title?: string;
      order?: number;
      history?: unknown[];
    }>;
  }>;
  notFound?: string[];
  errors?: Record<string, string>;
}

interface MessageResponse {
  success: boolean;
  message: string;
}

interface DocumentVotesResponse {
  votes: Array<{
    id: string;
    userId: string;
    vote: string;
    createdAt: string;
    user?: {
      id: string;
      name: string;
      email: string;
    };
  }>;
}

interface VotingStatusResponse {
  document: Document & {
    organizationName?: string;
    acceptanceThreshold?: number;
    voteChangeAllowed?: boolean;
    votingAnonymous?: boolean;
  };
  voting: {
    totalVotes: number;
    totalEligibleVoters: number;
    quorumRequired: number;
    quorumMet: boolean;
    voteBreakdown: {
      PRO: number;
      NEUTRAL: number;
      CONTRA: number;
    };
    approvalRate: number;
    canVote: boolean;
    userVote?: 'PRO' | 'NEUTRAL' | 'CONTRA';
  };
}

interface StatusHistoryResponse {
  history: Array<{
    status: string;
    changedAt: string;
    changedBy: {
      id: string;
      name: string;
    };
  }>;
}

interface DeletionStatusResponse {
  proposed: boolean;
  proposedAt?: string;
  proposedBy?: string;
  voteDeadline?: string;
  votes?: {
    PRO: number;
    NEUTRAL: number;
    CONTRA: number;
  };
}

export const documentsApi = {
  // Get all documents for current user
  async getDocuments(): Promise<DocumentsResponse> {
    return apiRequest<DocumentsResponse>('/api/documents')
  },

  // Get a specific document with full details
  async getDocument(id: string): Promise<DocumentResponse> {
    return apiRequest<DocumentResponse>(`/api/documents/${id}`)
  },

  // Get agreed view of a document (lightweight - only history, no proposals/votes/comments)
  async getAgreedDocument(
    id: string,
    options?: { view?: 'accepted' | 'amended'; includePending?: boolean }
  ): Promise<DocumentResponse> {
    const view = options?.view ?? (options?.includePending ? 'amended' : 'accepted');
    const params = view === 'amended' ? '?view=amended' : '';
    return apiRequest<DocumentResponse>(`/api/documents/${id}/agreed${params}`);
  },

  // Amendment summary (pending paragraph, structure, tree proposal counts)
  async getAmendmentSummary(documentId: string): Promise<{ paragraphProposals: number; structureProposals: number; treeProposals: number }> {
    return apiRequest<{ paragraphProposals: number; structureProposals: number; treeProposals: number }>(`/api/documents/${documentId}/amendment-summary`);
  },

  // Close amendments on an agreed document (representatives only)
  async closeAmendments(documentId: string): Promise<{
    message: string;
    adoptionVoteCreated?: boolean;
    voteId?: string;
  }> {
    const result = await apiRequest<{
      message: string;
      adoptionVoteCreated?: boolean;
      voteId?: string;
    }>(`/api/documents/${documentId}/close-amendments`, {
      method: 'POST',
    });
    invalidateCache('/api/documents');
    invalidateCache(`/api/documents/${documentId}`);
    return result;
  },

  // Batch fetch documents (lightweight - for activity feed)
  async getDocumentsBatch(documentIds: string[]): Promise<BatchDocumentsResponse> {
    return apiRequest<BatchDocumentsResponse>('/api/documents/batch', {
      method: 'POST',
      body: JSON.stringify({ documentIds })
    })
  },

  // Create a new document
  async createDocument(
    title: string,
    description?: string,
    contributors?: string[],
    options?: {
      acceptanceThreshold?: number;
      votingAnonymous?: boolean;
      votingAnonymityLocked?: boolean;
      voteChangeAllowed?: boolean;
      structureProposalsEnabled?: boolean;
      parentId?: string;
      positionType?: 'root' | 'child' | 'above_sibling' | 'below_sibling';
      referenceDocumentId?: string;
    },
    ownershipType?: 'personal' | 'shared' | 'organizational',
    organizationId?: string
  ): Promise<DocumentResponse> {
    // Extract parentId, positionType, and referenceDocumentId from options
    // parentId should NOT be in options - it goes at root level
    const { parentId, positionType, referenceDocumentId, ...optionsWithoutPosition } = options || {};
    
    // Defensive check: if organizationId is provided, ensure ownershipType is organizational
    let finalOwnershipType = ownershipType || 'personal';
    if (organizationId && finalOwnershipType !== 'organizational') {
      finalOwnershipType = 'organizational';
    }
    
    // For organizational documents, governance rules provide document settings
    // (acceptanceThreshold, votingAnonymous, etc.), so we should NOT send these in options
    // Only send position-related fields (positionType, referenceDocumentId) if needed
    let finalOptions: Record<string, unknown> = {};
    if (finalOwnershipType === 'organizational') {
      // For organizational documents, only include position-related fields
      if (positionType) {
        finalOptions.positionType = positionType;
      }
      if (referenceDocumentId) {
        finalOptions.referenceDocumentId = referenceDocumentId;
      }
      // Explicitly exclude governance-related fields - they come from governance rules
      // Do NOT include: acceptanceThreshold, votingAnonymous, votingAnonymityLocked, 
      // voteChangeAllowed, structureProposalsEnabled
    } else {
      // For personal/shared documents, include all provided options (except parentId which goes at root)
      finalOptions = { ...optionsWithoutPosition };
      if (positionType) {
        finalOptions.positionType = positionType;
      }
      if (referenceDocumentId) {
        finalOptions.referenceDocumentId = referenceDocumentId;
      }
    }
    
    // Validate organizationId for organizational documents BEFORE building request body
    if (finalOwnershipType === 'organizational') {
      if (!organizationId || organizationId.trim() === '') {
        logger.error('Organization ID is missing or empty for organizational document', {
          title,
          ownershipType,
          organizationId,
          organizationIdType: typeof organizationId
        });
        throw new Error('Organization ID is required for organizational documents');
      }
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(organizationId.trim())) {
        logger.error('Organization ID is not a valid UUID', {
          title,
          organizationId,
          organizationIdLength: organizationId?.length
        });
        throw new Error('Organization ID must be a valid UUID');
      }
    }
    
    // Build request body
    const requestBody: Record<string, unknown> = {
      title,
      ownershipType: finalOwnershipType,
    };
    
    // Only include optional fields if they have values
    if (description) {
      requestBody.description = description;
    }
    
    // Only include options if it has actual properties (not empty object)
    // Filter out undefined values to avoid sending empty options
    const cleanedOptions = Object.fromEntries(
      Object.entries(finalOptions).filter(([_, value]) => value !== undefined && value !== null)
    );
    if (Object.keys(cleanedOptions).length > 0) {
      requestBody.options = cleanedOptions;
    }
    
    if (parentId) {
      requestBody.parentId = parentId;
    }
    
    // Handle organizationId based on ownershipType
    // For organizational documents, organizationId is required (already validated above)
    if (finalOwnershipType === 'organizational') {
      // organizationId is already validated above, so we can safely add it
      requestBody.organizationId = organizationId!.trim();
    }
    
    // For shared documents, send contributors as creatorIds
    if (ownershipType === 'shared' && contributors && contributors.length > 0) {
      requestBody.creatorIds = contributors;
    }

    // Log request body for debugging validation errors
    logger.debug('Creating document with request body:', {
      title: requestBody.title,
      ownershipType: requestBody.ownershipType,
      organizationId: requestBody.organizationId,
      hasParentId: !!requestBody.parentId,
      hasOptions: !!requestBody.options,
      optionsKeys: requestBody.options ? Object.keys(requestBody.options) : [],
      fullBody: requestBody
    });

    const response = await apiRequest<DocumentResponse>('/api/documents', {
      method: 'POST',
      body: JSON.stringify(requestBody)
    });

    // Invalidate documents list cache
    invalidateCache('/api/documents');
    
    return response;
  },

  // Update a document
  async updateDocument(id: string, updates: Partial<Document>): Promise<DocumentResponse> {
    const response = await apiRequest<DocumentResponse>(`/api/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });

    // Invalidate caches
    invalidateCache('/api/documents');
    invalidateCache(`/api/documents/${id}`);
    
    return response;
  },

  // Update document title (legacy method - use updateDocument instead)
  async updateDocumentTitle(id: string, title: string): Promise<DocumentResponse> {
    return this.updateDocument(id, { title } as Partial<Document>);
  },

  // Delete a document
  async deleteDocument(id: string): Promise<{ success: boolean; message: string }> {
    const result = await apiRequest<{ success: boolean; message: string }>(`/api/documents/${id}`, {
      method: 'DELETE',
    });
    // Invalidate caches
    invalidateCache('/api/documents');
    invalidateCache(/\/api\/documents\/organization\/.*/);
    invalidateCache(`/api/documents/${id}`);
    return result;
  },

  // Add collaborator to document
  async addCollaborator(documentId: string, userIdOrEmail: string, options?: { useEmail?: boolean }): Promise<{ success: boolean; message: string }> {
    const body = options?.useEmail 
      ? { email: userIdOrEmail }
      : { userId: userIdOrEmail };
    
    return apiRequest<{ success: boolean; message: string }>(`/api/documents/${documentId}/collaborators`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  // Remove collaborator from document
  async removeCollaborator(documentId: string, userId: string): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>(`/api/documents/${documentId}/collaborators/${userId}`, {
      method: 'DELETE',
    });
  },

  // Invite collaborators to document via email
  async inviteCollaborators(documentId: string, emails: string[]): Promise<{
    success: boolean;
    invitations: number;
    failed: number;
    failedEmails?: Array<{ email: string; error: string; invitationLink?: string }>;
    invitationLinks?: Array<{ email: string; link: string }>;
    message: string;
  }> {
    return apiRequest(`/api/documents/${documentId}/invitations`, {
      method: 'POST',
      body: JSON.stringify({ emails }),
    });
  },

  // Get all invitations for a document
  async getInvitations(documentId: string): Promise<{
    invitations: Array<{
      id: string;
      document_id: string;
      email: string;
      invitation_token: string;
      status: 'pending' | 'accepted' | 'expired' | 'cancelled';
      expires_at: string;
      accepted_at: string | null;
      created_at: string;
      invited_by: string;
      inviter_name: string | null;
      accepted_by_name: string | null;
      isExpired: boolean;
    }>;
  }> {
    return apiRequest(`/api/documents/${documentId}/invitations`);
  },

  // Validate document invitation token
  async validateDocumentInvitation(token: string): Promise<{
    valid: boolean;
    invitation?: {
      id: string;
      documentId: string;
      documentTitle: string;
      email: string;
      inviterName: string | null;
      expiresAt: string;
      createdAt: string;
    };
    userExists?: boolean;
    error?: string;
    expired?: boolean;
    status?: string;
  }> {
    return apiRequest(`/api/documents/invitations/validate/${token}`);
  },

  // Accept document invitation (for logged-in users)
  async acceptDocumentInvitation(token: string): Promise<{
    success: boolean;
    message: string;
    documentId: string;
    documentTitle: string;
  }> {
    return apiRequest(`/api/documents/invitations/${token}/accept`, {
      method: 'POST',
    });
  },

  // Vote on a document (document-level voting)
  async voteOnDocument(documentId: string, vote: 'PRO' | 'NEUTRAL' | 'CONTRA'): Promise<{ message: string; voteId: string; votes: DocumentVotesResponse['votes']; vote: 'PRO' | 'NEUTRAL' | 'CONTRA'; isAnonymous?: boolean }> {
    return apiRequest<{ message: string; voteId: string; votes: DocumentVotesResponse['votes']; vote: 'PRO' | 'NEUTRAL' | 'CONTRA'; isAnonymous?: boolean }>(`/api/documents/${documentId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote }),
    });
  },

  // Get document votes
  async getDocumentVotes(documentId: string): Promise<{ votes: Array<{ id: string; userId: string; vote: string; createdAt: string; user?: { id: string; name: string; email: string } }> }> {
    return apiRequest(`/api/documents/${documentId}/votes`);
  },

  // Get voting status for organizational documents
  async getVotingStatus(documentId: string): Promise<{
    document: Document & {
      organizationName?: string;
      acceptanceThreshold?: number;
      voteChangeAllowed?: boolean;
      votingAnonymous?: boolean;
    };
    voting: {
      totalVotes: number;
      totalEligibleVoters: number;
      quorumRequired: number;
      quorumMet: boolean;
      voteBreakdown: {
        PRO: number;
        NEUTRAL: number;
        CONTRA: number;
      };
      approvalRate: number;
      canVote: boolean;
      userVote?: 'PRO' | 'NEUTRAL' | 'CONTRA';
    };
  }> {
    return apiRequest(`/api/documents/${documentId}/voting-status`);
  },

  // Get document status history
  async getStatusHistory(documentId: string): Promise<{
    history: Array<{
      status: string;
      changedAt: string;
      changedBy: {
        id: string;
        name: string;
      };
    }>;
  }> {
    return apiRequest(`/api/documents/${documentId}/status-history`);
  },

  // Start voting period (admin/owner only)
  async startVoting(documentId: string): Promise<{ success: boolean; message: string }> {
    const result = await apiRequest<{ success: boolean; message: string }>(`/api/documents/${documentId}/start-voting`, {
      method: 'POST'
    });
    invalidateCache(`/api/documents/${documentId}`);
    invalidateCache('/api/documents');
    return result;
  },

  // Complete voting period (rep/owner can complete early when quorum met)
  async completeVoting(documentId: string): Promise<{ success: boolean; message: string }> {
    const result = await apiRequest<{ success: boolean; message: string }>(`/api/documents/${documentId}/complete-voting`, {
      method: 'POST'
    });
    invalidateCache(`/api/documents/${documentId}`);
    invalidateCache('/api/documents');
    return result;
  },

  // Document deletion workflow
  async proposeDeletion(documentId: string): Promise<{ success: boolean; message: string }> {
    const result = await apiRequest<{ success: boolean; message: string }>(`/api/documents/${documentId}/propose-deletion`, {
      method: 'POST'
    });
    invalidateCache(`/api/documents/${documentId}`);
    invalidateCache('/api/documents');
    return result;
  },

  async voteDeletion(documentId: string, vote: 'PRO' | 'NEUTRAL' | 'CONTRA'): Promise<{ success: boolean; message: string }> {
    const result = await apiRequest<{ success: boolean; message: string }>(`/api/documents/${documentId}/vote-deletion`, {
      method: 'POST',
      body: JSON.stringify({ vote })
    });
    invalidateCache(`/api/documents/${documentId}`);
    invalidateCache('/api/documents');
    return result;
  },

  async completeDeletionVote(documentId: string): Promise<{ success: boolean; message: string }> {
    const result = await apiRequest<{ success: boolean; message: string }>(`/api/documents/${documentId}/complete-deletion-vote`, {
      method: 'POST'
    });
    invalidateCache(`/api/documents/${documentId}`);
    invalidateCache('/api/documents');
    return result;
  },

  async cancelDeletion(documentId: string): Promise<{ success: boolean; message: string }> {
    const result = await apiRequest<{ success: boolean; message: string }>(`/api/documents/${documentId}/cancel-deletion`, {
      method: 'POST'
    });
    invalidateCache(`/api/documents/${documentId}`);
    invalidateCache('/api/documents');
    return result;
  },

  async getDeletionStatus(documentId: string): Promise<{
    proposed: boolean;
    proposedAt?: string;
    proposedBy?: string;
    voteDeadline?: string;
    votes?: {
      PRO: number;
      NEUTRAL: number;
      CONTRA: number;
    };
  }> {
    return apiRequest(`/api/documents/${documentId}/deletion-status`);
  }
};


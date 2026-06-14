// Comment API functions
import { apiRequest } from './client';
import type { Comment } from '../../types';
import type { CommentResponse } from './types';

export const commentsApi = {
  // Add a comment to a proposal
  async addComment(
    documentId: string,
    paragraphId: string,
    proposalId: string,
    data: {
      text: string
      parentId?: string
    }
  ): Promise<CommentResponse> {
    // Ensure parentId is included in body if provided (JSON.stringify omits undefined)
    const bodyData: { text: string; parentId?: string } = { text: data.text };
    if (data.parentId) {
      bodyData.parentId = data.parentId;
    }
    return apiRequest<CommentResponse>(`/api/documents/${documentId}/paragraphs/${paragraphId}/proposals/${proposalId}/comments`, {
      method: 'POST',
      body: JSON.stringify(bodyData),
    })
  },

  // Update a comment
  async updateComment(
    documentId: string,
    paragraphId: string,
    proposalId: string,
    commentId: string,
    data: {
      text: string
    }
  ): Promise<CommentResponse> {
    return apiRequest<CommentResponse>(`/api/documents/${documentId}/paragraphs/${paragraphId}/proposals/${proposalId}/comments/${commentId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  // Delete a comment
  async deleteComment(
    documentId: string,
    paragraphId: string,
    proposalId: string,
    commentId: string
  ): Promise<CommentResponse> {
    return apiRequest<CommentResponse>(`/api/documents/${documentId}/paragraphs/${paragraphId}/proposals/${proposalId}/comments/${commentId}`, {
      method: 'DELETE',
    })
  },

  // Get comments with pagination
  async getComments(
    documentId: string,
    paragraphId: string,
    proposalId: string,
    options?: {
      limit?: number
      offset?: number
      sort?: 'newest' | 'top'
    }
  ): Promise<{ comments: Comment[]; total: number; limit: number; offset: number }> {
    const params = new URLSearchParams()
    if (options?.limit) params.append('limit', options.limit.toString())
    if (options?.offset) params.append('offset', options.offset.toString())
    if (options?.sort) params.append('sort', options.sort)
    const query = params.toString() ? `?${params.toString()}` : ''
    return apiRequest<{ comments: Comment[]; total: number; limit: number; offset: number }>(`/api/documents/${documentId}/paragraphs/${paragraphId}/proposals/${proposalId}/comments${query}`, {
      method: 'GET',
    })
  },

  /** Upvote a comment (flatter API: server resolves comment → document). Returns new count and user state. */
  async upvoteComment(commentId: string): Promise<{ upvoteCount: number; userUpvoted: boolean }> {
    return apiRequest<{ upvoteCount: number; userUpvoted: boolean }>(`/api/comments/${commentId}/upvote`, {
      method: 'POST',
    })
  },

  /** Remove upvote from a comment. */
  async removeUpvoteComment(commentId: string): Promise<{ upvoteCount: number; userUpvoted: boolean }> {
    return apiRequest<{ upvoteCount: number; userUpvoted: boolean }>(`/api/comments/${commentId}/upvote`, {
      method: 'DELETE',
    })
  },
}


// Paragraph API functions
import { apiRequest, invalidateCache } from './client';
import { logger } from '../logger';
import type { HeadingLevel } from '../../types';
import type { ParagraphResponse, MessageResponse } from './types';

export const paragraphsApi = {
  // Create a new paragraph
  // Note: All user-created paragraphs are suggestions (empty paragraph + proposal)
  // asSuggestion defaults to true on backend if not provided
  async createParagraph(
    documentId: string,
    data: {
      title?: string
      text?: string
      order?: number // Optional; backend computes MAX(order_index)+10 if omitted
      asSuggestion?: boolean // Defaults to true - all user-created paragraphs are suggestions
      headingLevel?: HeadingLevel
    }
  ): Promise<ParagraphResponse> {
    logger.log(`Creating paragraph in document ${documentId}:`, data)
    const result = await apiRequest<ParagraphResponse>(`/api/documents/${documentId}/paragraphs`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    // Invalidate document cache so fresh data is fetched on next load
    invalidateCache(`/api/documents/${documentId}`)
    return result
  },

  // Update a paragraph
  async updateParagraph(
    documentId: string,
    paragraphId: string,
    data: {
      title?: string
      text?: string
      order?: number
      headingLevel?: HeadingLevel
    }
  ): Promise<ParagraphResponse> {
    const result = await apiRequest<ParagraphResponse>(`/api/documents/${documentId}/paragraphs/${paragraphId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    // Invalidate document cache so fresh data is fetched on next load
    invalidateCache(`/api/documents/${documentId}`)
    return result
  },

  // Delete a paragraph
  async deleteParagraph(documentId: string, paragraphId: string): Promise<MessageResponse> {
    const result = await apiRequest<MessageResponse>(`/api/documents/${documentId}/paragraphs/${paragraphId}`, {
      method: 'DELETE',
    })
    // Invalidate document cache so fresh data is fetched on next load
    invalidateCache(`/api/documents/${documentId}`)
    return result
  },
}


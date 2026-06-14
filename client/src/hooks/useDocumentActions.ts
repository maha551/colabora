// Custom hook for document actions (editing, collaborators, sharing)
// Extracted from App.tsx to reduce complexity and improve modularity

import { useCallback } from 'react';
import { paragraphsApi } from '../lib/api';
import { toast } from 'sonner';
import { logger } from '../lib/logger';
import type { Document, User, ElementType, HeadingLevel } from '../types';

interface UseDocumentActionsOptions {
  currentDocument: Document | null;
  reloadDocument: (force?: boolean) => Promise<void>;
}

export function useDocumentActions({
  currentDocument,
  reloadDocument,
}: UseDocumentActionsOptions) {
  // Add element (paragraph) to document
  const handleAddElement = useCallback(async (
    elementType: ElementType,
    options?: {
      text?: string;
      title?: string;
      headingLevel?: HeadingLevel;
      order?: number;
    }
  ) => {
    if (!currentDocument) return;

    try {
      if (elementType !== 'paragraph') {
        return;
      }

      const bodyText = options?.text?.trim();
      const titleText = options?.title?.trim();

      // Note: Content validation is already done in DocumentEditor.tsx for better UX
      // This is just a safety check - backend validation will also catch empty content

      // Order calculation: DocumentEditor always provides order, but keep fallback as defensive measure
      const order = options?.order ?? (() => {
        const allOrders = currentDocument.paragraphs.map((p) => (typeof p.order === 'number' ? p.order : 0));
        return allOrders.length ? Math.max(...allOrders) + 1 : 0;
      })();

      // Build request body conditionally - only include fields that have actual values
      // This ensures validation receives either valid content or no field at all (not undefined)
      const requestBody: {
        order: number;
        asSuggestion: boolean;
        text?: string;
        title?: string;
        headingLevel?: HeadingLevel;
      } = {
        order: order,
        asSuggestion: true, // Always true for user-created paragraphs
      };

      // Only include text or title if they have non-empty values
      if (bodyText && bodyText.length > 0) {
        requestBody.text = bodyText;
      }
      if (titleText && titleText.length > 0) {
        requestBody.title = titleText;
        if (options?.headingLevel) {
          requestBody.headingLevel = options.headingLevel;
        }
      }

      // Validate that at least one content field is provided
      if (!requestBody.text && !requestBody.title) {
        throw new Error('Either text or title is required for paragraph creation.');
      }

      await paragraphsApi.createParagraph(currentDocument.id, requestBody);

      // Reload document
      await reloadDocument();
      toast.success('Paragraph suggestion created');
    } catch (err) {
      logger.error('Failed to create paragraph', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create paragraph');
      throw err;
    }
  }, [currentDocument, reloadDocument]);

  // Collaborator management
  const handleCollaboratorAdded = useCallback(async (user: User) => {
    logger.log('onCollaboratorAdded called with user:', user);
    // Refresh the document data to show the new collaborator
    try {
      logger.log('Refreshing document after adding collaborator...');
      await reloadDocument();
      if (currentDocument) {
        logger.log('Updated document collaborators count:', currentDocument.collaborators.length);
      }
    } catch (error) {
      logger.error('Failed to refresh document after adding collaborator:', error);
    }
  }, [currentDocument, reloadDocument]);

  const handleCollaboratorRemoved = useCallback(async (userId: string) => {
    logger.log('onCollaboratorRemoved called with userId:', userId);
    // Refresh the document data to show removed collaborator
    try {
      logger.log('Refreshing document after removing collaborator...');
      await reloadDocument();
      if (currentDocument) {
        logger.log('Updated document collaborators count:', currentDocument.collaborators.length);
      }
    } catch (error) {
      logger.error('Failed to refresh document after removing collaborator:', error);
    }
  }, [currentDocument, reloadDocument]);

  // Note: handleAddComment has been moved to App.tsx as a consolidated handler
  // This removes duplication and provides a single source of truth for comment creation
  // Components that need the 5-param signature (ActivityFeedView, DashboardTab) use the handler from App.tsx
  // Components with document context (SuggestionCard) use handleComment from useDocumentOperations

  // Document sharing
  const handleShareDocument = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}#document/${currentDocument?.id}`;
    navigator.clipboard.writeText(url);
    toast.success('Document link copied to clipboard!');
  }, [currentDocument?.id]);

  return {
    handleAddElement,
    handleCollaboratorAdded,
    handleCollaboratorRemoved,
    handleShareDocument,
  };
}


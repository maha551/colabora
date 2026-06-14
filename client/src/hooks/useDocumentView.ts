import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Document, Paragraph, HeadingLevel, User } from '../types';
import { documentsApi } from '../lib/api';
import { toast } from 'sonner';
import { logger } from '../lib/logger';
import { normalizeComment } from '../utils/optimisticUpdates';
import { replaceHash } from '../lib/hashRoutes';

export function useDocumentView() {
  const { t } = useTranslation('documents');
  const [currentDocument, setCurrentDocument] = useState<Document | null>(null);
  const [documentLoadKey, setDocumentLoadKey] = useState<number>(Date.now());
  const [loading, setLoading] = useState(false);

  // Helper function to map API response to Document type
  const mapDocumentWithSuggestions = useCallback((document: unknown): Document | null => {
    if (!document || typeof document !== 'object') return null;

    const doc = document as Record<string, unknown>;

    const normalizedParagraphs = ((doc.paragraphs as unknown[]) || []).map((paragraph: unknown) => {
      const para = paragraph as Record<string, unknown>;
      const rawSuggestions = (para.proposals as unknown[]) || (para.suggestions as unknown[]) || [];
      const proposals = rawSuggestions.map((proposal: unknown) => {
        const prop = proposal as Record<string, unknown>;
        return {
          ...prop,
          approved: Boolean(prop.approved),
          headingLevel: (prop.headingLevel || (prop.type === 'TITLE' ? 'h2' : undefined)) as HeadingLevel | undefined,
          votes: ((prop.votes as unknown[]) || []).map((vote: unknown) => {
            const v = vote as Record<string, unknown>;
            return {
              ...v,
              createdAt: (v.createdAt || null) as string | null,
            };
          }),
          comments: ((prop.comments as unknown[]) || []).map((comment: unknown) => {
            // Use normalizeComment to ensure consistent format (handles parentId, snake_case, etc.)
            return normalizeComment(comment as any);
          }),
        };
      });

      const history = ((para.history as unknown[]) || []).map((entry: unknown) => {
        const e = entry as Record<string, unknown>;
        // Use acceptedAt from API (transformed from accepted_at), fallback to createdAt
        const acceptedAtSource = (e.acceptedAt ?? e.createdAt ?? null) as string | null;
        return {
          id: e.id as string,
          paragraphId: (e.paragraphId || para.id) as string,
          userId: e.userId as string,
          text: (e.text ?? e.newText ?? para.text) as string,
          oldText: (e.oldText ?? null) as string | null,
          proposalId: (e.proposalId ?? null) as string | null,
          acceptedAt: acceptedAtSource ? new Date(acceptedAtSource) : new Date(),
          approvalPercentage: Number(e.approvalPercentage ?? 0),
          type: (e.type || e.proposalType || 'BODY') as string,
          headingLevel: (e.headingLevel || (e.type === 'TITLE' ? 'h2' : undefined)) as HeadingLevel | undefined,
          user: (e.user as Record<string, unknown>) || {
            id: e.userId as string,
            name: (e.userName || '') as string,
            email: e.userEmail as string,
          },
        };
      });

      const orderIndex = Number(para.order ?? para.orderIndex ?? 0);
      const isDocumentTitle = orderIndex < 0 || (typeof para.id === 'string' && para.id.endsWith('-title'));
      const paragraphTitle = (para.title ?? null) as string | null;
      const paragraphText = (para.text ?? '') as string;
      const headingLevel = (para.headingLevel ?? (isDocumentTitle ? 'h1' : null)) as HeadingLevel | null;

      return {
        ...para,
        title: paragraphTitle ?? undefined,
        text: paragraphText,
        order: orderIndex,
        isDocumentTitle,
        headingLevel,
        proposals,
        suggestions: proposals,
        history,
      } as Paragraph;
    });

    const sortedParagraphs = normalizedParagraphs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const owner = (doc.owner as Record<string, unknown>) || {
      id: doc.ownerId as string,
      name: doc.ownerName as string,
      email: doc.ownerEmail as string,
    };

    const collaborators = ((doc.collaborators as unknown[]) || []).map((collaborator: unknown) => {
      const collab = collaborator as Record<string, unknown>;
      return {
        id: collab.id as string,
        documentId: (collab.documentId || doc.id) as string,
        userId: (collab.userId || (collab.user as Record<string, unknown>)?.id) as string,
        createdAt: (collab.createdAt || null) as string | null,
        user: (collab.user as Record<string, unknown>) || {
          id: collab.userId as string,
          name: (collab.userName || '') as string,
          email: collab.userEmail as string,
        },
      };
    });

    return {
      ...doc,
      ownerId: (doc.ownerId || owner.id) as string,
      owner,
      collaborators,
      paragraphs: sortedParagraphs,
    } as Document;
  }, []);

  // AbortController ref to cancel in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load document by ID with race condition protection
  const loadDocumentById = useCallback(async (documentId: string, currentUser: User | null) => {
    if (!currentUser) {
      logger.warn('Cannot load document: user not authenticated');
      return;
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      setLoading(true);
      const response = await documentsApi.getDocument(documentId);
      
      // Check if request was cancelled
      if (abortController.signal.aborted) {
        logger.debug('Document load cancelled', { documentId });
        return;
      }

      const normalizedDocument = mapDocumentWithSuggestions(response.document);

      if (normalizedDocument) {
        // Recalculate vote counts from votes array for all proposals (ensure sync)
        // This ensures partialVoteCounts always matches votes array after document load
        const documentWithValidatedVotes = {
          ...normalizedDocument,
          paragraphs: normalizedDocument.paragraphs.map(para => ({
            ...para,
            proposals: para.proposals.map(prop => {
              // Calculate vote counts from votes array (source of truth)
              const proCount = prop.votes.filter(v => v.vote === 'PRO').length;
              const neutralCount = prop.votes.filter(v => v.vote === 'NEUTRAL').length;
              const contraCount = prop.votes.filter(v => v.vote === 'CONTRA').length;
              const totalVotes = prop.votes.length;
              
              return {
                ...prop,
                // Update partialVoteCounts to match votes array
                partialVoteCounts: {
                  pro: proCount,
                  neutral: neutralCount,
                  contra: contraCount,
                  total: totalVotes
                }
              };
            }),
            suggestions: para.proposals.map(prop => {
              // Also update suggestions array (same data)
              const proCount = prop.votes.filter(v => v.vote === 'PRO').length;
              const neutralCount = prop.votes.filter(v => v.vote === 'NEUTRAL').length;
              const contraCount = prop.votes.filter(v => v.vote === 'CONTRA').length;
              const totalVotes = prop.votes.length;
              
              return {
                ...prop,
                partialVoteCounts: {
                  pro: proCount,
                  neutral: neutralCount,
                  contra: contraCount,
                  total: totalVotes
                }
              };
            })
          }))
        };
        
        setCurrentDocument(documentWithValidatedVotes);
        setDocumentLoadKey(Date.now()); // Force remount of all components to collapse comments
        // Don't show success toast - loading state is enough feedback
      } else {
        throw new Error('Failed to load document');
      }
    } catch (err: unknown) {
      // Ignore abort errors
      if (err instanceof Error && err.name === 'AbortError') {
        logger.debug('Document load aborted', { documentId });
        return;
      }

      // Check if request was cancelled
      if (abortController.signal.aborted) {
        return;
      }

      logger.error('Failed to load document by ID:', err);
      setCurrentDocument(null);

      // Clear URL hash if document couldn't be loaded (replace so we don't add history entry)
      replaceHash('#/activity');

      const errorMessage = err instanceof Error ? err.message : '';
      if (errorMessage.includes('404')) {
        toast.error(t('documentNotFound'));
      } else if (errorMessage.includes('403')) {
        toast.error(t('noAccessToDocument'));
      } else {
        toast.error(t('failedToLoadDocument'));
      }
    } finally {
      // Only update loading state if this request wasn't cancelled
      if (!abortController.signal.aborted) {
        setLoading(false);
      }
      // Clear abort controller if this was the active request
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  }, [mapDocumentWithSuggestions, t]);

  // Handle document selection
  const selectDocument = useCallback(async (document: Document) => {
    try {
      setLoading(true);
      const response = await documentsApi.getDocument(document.id);
      if (response && response.document) {
        const normalizedDocument = mapDocumentWithSuggestions(response.document);
        setCurrentDocument(normalizedDocument);
        setDocumentLoadKey(Date.now()); // Force remount of all components to collapse comments
        // URL hash is set by navigation layer (useAppNavigation handleDocumentSelect)
      }
    } catch (err: unknown) {
      logger.error('Failed to load document:', err);
      toast.error(t('failedToLoadDocument'));
    } finally {
      setLoading(false);
    }
  }, [mapDocumentWithSuggestions, t]);

  // Clear current document (URL is updated by navigation layer when user navigates away)
  const clearDocument = useCallback(() => {
    setCurrentDocument(null);
  }, []);

  // Force reload document
  // skipLoadKeyUpdate: if true, don't update documentLoadKey (prevents component remounts during polling)
  const reloadDocument = useCallback(async (skipLoadKeyUpdate: boolean = false) => {
    if (!currentDocument) return;

    try {
      const response = await documentsApi.getDocument(currentDocument.id);
      if (response && response.document) {
        const normalizedDocument = mapDocumentWithSuggestions(response.document);
        setCurrentDocument(normalizedDocument);
        // Only update load key if explicitly requested (for user actions, not polling)
        if (!skipLoadKeyUpdate) {
          setDocumentLoadKey(Date.now());
        }
      }
    } catch (err: unknown) {
      logger.error('Failed to reload document:', err);
      // Don't show error toast during polling to avoid spam
      if (!skipLoadKeyUpdate) {
        toast.error(t('failedToReloadDocument'));
      }
    }
  }, [currentDocument, mapDocumentWithSuggestions, t]);

  return {
    currentDocument,
    documentLoadKey,
    loading,
    loadDocumentById,
    selectDocument,
    clearDocument,
    reloadDocument,
    updateDocument: setCurrentDocument,
    mapDocumentWithSuggestions,
  };
}

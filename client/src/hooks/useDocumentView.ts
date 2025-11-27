import { useState, useCallback } from 'react';
import { Document, Paragraph, HeadingLevel, User } from '../types';
import { documentsApi } from '../lib/api';
import { toast } from 'sonner';

export function useDocumentView() {
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
          headingLevel: (prop.headingLevel || prop.heading_level || (prop.type === 'TITLE' ? 'h2' : undefined)) as HeadingLevel | undefined,
          votes: ((prop.votes as unknown[]) || []).map((vote: unknown) => {
            const v = vote as Record<string, unknown>;
            return {
              ...v,
              createdAt: (v.createdAt || v.created_at || null) as string | null,
            };
          }),
          comments: ((prop.comments as unknown[]) || []).map((comment: unknown) => {
            const c = comment as Record<string, unknown>;
            return {
              ...c,
              createdAt: (c.createdAt || c.created_at || null) as string | null,
              updatedAt: (c.updatedAt || c.updated_at || null) as string | null,
            };
          }),
        };
      });

      const history = ((para.history as unknown[]) || []).map((entry: unknown) => {
        const e = entry as Record<string, unknown>;
        const acceptedAtSource = (e.acceptedAt || e.createdAt || e.updatedAt || null) as string | null;
        return {
          id: e.id as string,
          paragraphId: (e.paragraphId || para.id) as string,
          userId: e.userId as string,
          text: (e.text ?? e.newText ?? para.text) as string,
          oldText: (e.oldText ?? e.old_text ?? null) as string | null,
          proposalId: (e.proposalId ?? e.proposal_id ?? null) as string | null,
          acceptedAt: acceptedAtSource ? new Date(acceptedAtSource) : new Date(),
          approvalPercentage: Number(e.approvalPercentage ?? e.approval_percentage ?? 0),
          type: (e.type || e.proposalType || 'BODY') as string,
          headingLevel: (e.headingLevel || e.heading_level || (e.type === 'TITLE' ? 'h2' : undefined)) as HeadingLevel | undefined,
          user: (e.user as Record<string, unknown>) || {
            id: e.userId as string,
            name: (e.userName || '') as string,
            email: e.userEmail as string,
          },
        };
      });

      const orderIndex = Number(para.order ?? para.orderIndex ?? para.order_index ?? 0);
      const isDocumentTitle = orderIndex < 0 || (typeof para.id === 'string' && para.id.endsWith('-title'));
      const paragraphTitle = (para.title ?? null) as string | null;
      const paragraphText = (para.text ?? '') as string;
      const headingLevel = (para.headingLevel ?? para.heading_level ?? (isDocumentTitle ? 'h1' : null)) as HeadingLevel | null;

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
      id: (doc.ownerId || doc.owner_id) as string,
      name: (doc.ownerName || doc.owner_name) as string,
      email: (doc.ownerEmail || doc.owner_email) as string,
    };

    const collaborators = ((doc.collaborators as unknown[]) || []).map((collaborator: unknown) => {
      const collab = collaborator as Record<string, unknown>;
      return {
        id: collab.id as string,
        documentId: (collab.documentId || collab.document_id || doc.id) as string,
        userId: (collab.userId || collab.user_id || (collab.user as Record<string, unknown>)?.id) as string,
        createdAt: (collab.createdAt || collab.created_at || null) as string | null,
        user: (collab.user as Record<string, unknown>) || {
          id: (collab.userId || collab.user_id) as string,
          name: (collab.userName || collab.user_name || '') as string,
          email: (collab.userEmail || collab.user_email) as string,
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

  // Load document by ID
  const loadDocumentById = useCallback(async (documentId: string, currentUser: User | null) => {
    if (!currentUser) {
      console.warn('Cannot load document: user not authenticated');
      return;
    }

    try {
      setLoading(true);
      const response = await documentsApi.getDocument(documentId);
      const normalizedDocument = mapDocumentWithSuggestions(response.document);

      if (normalizedDocument) {
        setCurrentDocument(normalizedDocument);
        setDocumentLoadKey(Date.now()); // Force remount of all components to collapse comments
        toast.success(`Loaded document: ${normalizedDocument.title}`);
      } else {
        throw new Error('Failed to load document');
      }
    } catch (err: unknown) {
      console.error('Failed to load document by ID:', err);
      setCurrentDocument(null);

      // Clear URL hash if document couldn't be loaded
      window.location.hash = '';

      const errorMessage = err instanceof Error ? err.message : '';
      if (errorMessage.includes('404')) {
        toast.error('Document not found');
      } else if (errorMessage.includes('403')) {
        toast.error('You do not have access to this document');
      } else {
        toast.error('Failed to load document');
      }
    } finally {
      setLoading(false);
    }
  }, [mapDocumentWithSuggestions]);

  // Handle document selection
  const selectDocument = useCallback(async (document: Document) => {
    try {
      setLoading(true);
      const response = await documentsApi.getDocument(document.id);
      if (response && response.document) {
        const normalizedDocument = mapDocumentWithSuggestions(response.document);
        setCurrentDocument(normalizedDocument);
        setDocumentLoadKey(Date.now()); // Force remount of all components to collapse comments
        // Update URL hash for sharing
        window.location.hash = `#document/${document.id}`;
      }
    } catch (err: unknown) {
      console.error('Failed to load document:', err);
      toast.error('Failed to load document');
    } finally {
      setLoading(false);
    }
  }, [mapDocumentWithSuggestions]);

  // Clear current document
  const clearDocument = useCallback(() => {
    setCurrentDocument(null);
    // Clear URL hash when navigating away from document
    window.location.hash = '';
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
      console.error('Failed to reload document:', err);
      // Don't show error toast during polling to avoid spam
      if (!skipLoadKeyUpdate) {
        toast.error('Failed to reload document');
      }
    }
  }, [currentDocument, mapDocumentWithSuggestions]);

  // Function to update document state directly (for WebSocket updates)
  const updateDocument = useCallback((updater: (doc: Document | null) => Document | null) => {
    setCurrentDocument(prev => updater(prev));
  }, []);

  return {
    currentDocument,
    documentLoadKey,
    loading,
    loadDocumentById,
    selectDocument,
    clearDocument,
    reloadDocument,
    updateDocument,
    mapDocumentWithSuggestions,
  };
}

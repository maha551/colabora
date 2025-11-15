import { useState, useCallback } from 'react';
import { Document } from '../types';
import { documentsApi } from '../lib/api';
import { toast } from 'sonner';

export function useDocumentView() {
  const [currentDocument, setCurrentDocument] = useState<Document | null>(null);
  const [documentLoadKey, setDocumentLoadKey] = useState<number>(Date.now());
  const [loading, setLoading] = useState(false);

  // Helper function to map API response to Document type
  const mapDocumentWithSuggestions = useCallback((document: any): Document | null => {
    if (!document) return null;

    const normalizedParagraphs = (document.paragraphs || []).map((paragraph: any) => {
      const rawSuggestions = paragraph.proposals || paragraph.suggestions || [];
      const proposals = rawSuggestions.map((proposal: any) => ({
        ...proposal,
        approved: Boolean(proposal.approved),
        headingLevel: (proposal.headingLevel || proposal.heading_level || (proposal.type === 'TITLE' ? 'h2' : undefined)),
        votes: (proposal.votes || []).map((vote: any) => ({
          ...vote,
          createdAt: vote.createdAt || vote.created_at || null,
        })),
        comments: (proposal.comments || []).map((comment: any) => ({
          ...comment,
          createdAt: comment.createdAt || comment.created_at || null,
          updatedAt: comment.updatedAt || comment.updated_at || null,
        })),
      }));

      const history = (paragraph.history || []).map((entry: any) => {
        const acceptedAtSource = entry.acceptedAt || entry.createdAt || entry.updatedAt || null;
        return {
          id: entry.id,
          paragraphId: entry.paragraphId || paragraph.id,
          userId: entry.userId,
          text: entry.text ?? entry.newText ?? paragraph.text,
          oldText: entry.oldText ?? entry.old_text ?? null,
          proposalId: entry.proposalId ?? entry.proposal_id ?? null,
          acceptedAt: acceptedAtSource ? new Date(acceptedAtSource) : new Date(),
          approvalPercentage: Number(entry.approvalPercentage ?? entry.approval_percentage ?? 0),
          type: entry.type || entry.proposalType || 'BODY',
          headingLevel: (entry.headingLevel || entry.heading_level || (entry.type === 'TITLE' ? 'h2' : undefined)),
          user: entry.user || {
            id: entry.userId,
            name: entry.userName || '',
            email: entry.userEmail,
          },
        };
      });

      const orderIndex = Number(paragraph.order ?? paragraph.orderIndex ?? paragraph.order_index ?? 0);
      const isDocumentTitle = orderIndex < 0 || (typeof paragraph.id === 'string' && paragraph.id.endsWith('-title'));
      const paragraphTitle = paragraph.title ?? null;
      const paragraphText = paragraph.text ?? '';
      const headingLevel = (paragraph.headingLevel ?? paragraph.heading_level ?? (isDocumentTitle ? 'h1' : null));

      return {
        ...paragraph,
        title: paragraphTitle ?? undefined,
        text: paragraphText,
        order: orderIndex,
        isDocumentTitle,
        headingLevel,
        proposals,
        suggestions: proposals,
        history,
      };
    });

    const sortedParagraphs = normalizedParagraphs.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));

    const owner = document.owner || {
      id: document.ownerId || document.owner_id,
      name: document.ownerName || document.owner_name,
      email: document.ownerEmail || document.owner_email,
    };

    const collaborators = (document.collaborators || []).map((collaborator: any) => ({
      id: collaborator.id,
      documentId: collaborator.documentId || collaborator.document_id || document.id,
      userId: collaborator.userId || collaborator.user_id || collaborator.user?.id,
      createdAt: collaborator.createdAt || collaborator.created_at || null,
      user: collaborator.user || {
        id: collaborator.userId || collaborator.user_id,
        name: collaborator.userName || collaborator.user_name || '',
        email: collaborator.userEmail || collaborator.user_email || '',
      },
    }));

    return {
      ...document,
      ownerId: document.ownerId || owner.id,
      owner,
      collaborators,
      paragraphs: sortedParagraphs,
    } as Document;
  }, []);

  // Load document by ID
  const loadDocumentById = useCallback(async (documentId: string, currentUser: any) => {
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
    } catch (err: any) {
      console.error('Failed to load document by ID:', err);
      setCurrentDocument(null);

      // Clear URL hash if document couldn't be loaded
      window.location.hash = '';

      if (err.message?.includes('404')) {
        toast.error('Document not found');
      } else if (err.message?.includes('403')) {
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
    } catch (err: any) {
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
  const reloadDocument = useCallback(async () => {
    if (!currentDocument) return;

    try {
      const response = await documentsApi.getDocument(currentDocument.id);
      if (response && response.document) {
        const normalizedDocument = mapDocumentWithSuggestions(response.document);
        setCurrentDocument(normalizedDocument);
        setDocumentLoadKey(Date.now());
      }
    } catch (err: any) {
      console.error('Failed to reload document:', err);
      toast.error('Failed to reload document');
    }
  }, [currentDocument, mapDocumentWithSuggestions]);

  return {
    currentDocument,
    documentLoadKey,
    loading,
    loadDocumentById,
    selectDocument,
    clearDocument,
    reloadDocument,
    mapDocumentWithSuggestions,
  };
}

import { useState, useCallback, useEffect, useRef } from 'react';
import { Document } from '../types';
import { documentsApi } from '../lib/api';
import { toast } from 'sonner';

import { User } from '../types';

export function useDocuments(currentUser: User | null) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false); // Prevent duplicate simultaneous requests

  // Load documents
  const loadDocuments = useCallback(async (user?: User | null) => {
    // Prevent duplicate simultaneous requests
    if (loadingRef.current) {
      console.log('loadDocuments already in progress, skipping duplicate request...');
      return;
    }

    const userToUse = user || currentUser;
    if (!userToUse) {
      console.log('No user available for loadDocuments');
      setLoading(false);
      return;
    }

    loadingRef.current = true;
    console.log('Loading documents for user:', userToUse.name);
    setLoading(true);
    setError(null);

    try {
      const response = await documentsApi.getDocuments();
      console.log('Documents API response:', response);

      if (response && response.documents) {
        console.log('Setting documents:', response.documents.length, 'documents');
        console.log('Documents data:', response.documents.map(d => ({ id: d.id, title: d.title })));
        setDocuments(response.documents);
        console.log('Documents state updated');
      } else {
        console.log('Invalid API response:', response);
        setError('Invalid API response');
        toast.error('Invalid API response');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load documents';
      console.error('loadDocuments error:', errorMessage, err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [currentUser]);

  // Create document
  const createDocument = useCallback(async (
    title: string,
    description?: string,
    contributors?: string[],
    options?: {
      acceptanceThreshold?: number;
      votingAnonymous?: boolean;
      votingAnonymityLocked?: boolean;
      voteChangeAllowed?: boolean;
      structureProposalsEnabled?: boolean;
    },
    ownershipType?: 'personal' | 'shared' | 'organizational',
    organizationId?: string
  ) => {
    try {
      console.log('Creating document:', title, 'with contributors:', contributors, 'with options:', options, 'ownership:', ownershipType, 'org:', organizationId);
      const response = await documentsApi.createDocument(title, description, contributors, options, ownershipType, organizationId);
      console.log('Document creation response:', response);

      // Add collaborators if specified
      if (contributors && contributors.length > 0 && response.document?.id) {
        console.log('Adding contributors:', contributors);
        for (const contributorId of contributors) {
          try {
            await documentsApi.addCollaborator(response.document.id, contributorId);
            console.log('Added contributor:', contributorId);
          } catch (error) {
            console.error('Failed to add contributor:', contributorId, error);
          }
        }
      }

      toast.success('Document created successfully');
      console.log('Reloading documents...');
      await loadDocuments(); // Reload documents list
      console.log('Documents reloaded');
    } catch (err: unknown) {
      console.error('Document creation failed:', err);
      toast.error('Failed to create document');
      throw err; // Re-throw to let the dashboard handle the error
    }
  }, [loadDocuments]);

  // Delete document
  const deleteDocument = useCallback(async (documentId: string) => {
    try {
      await documentsApi.deleteDocument(documentId);
      await loadDocuments(); // Reload documents list
    } catch (err: unknown) {
      console.error('Failed to delete document:', err);
      toast.error('Failed to delete document');
      throw err; // Re-throw to let the dashboard handle the error
    }
  }, [loadDocuments]);

  // Update documents list when user changes
  // Note: loadDocuments is NOT in deps to prevent infinite loops
  // It's stable because it only depends on currentUser
  useEffect(() => {
    if (currentUser) {
      loadDocuments(currentUser);
    } else {
      setDocuments([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]); // Only depend on currentUser, not loadDocuments

  return {
    documents,
    loading,
    error,
    loadDocuments,
    createDocument,
    deleteDocument,
  };
}

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Document } from '../types';
import { documentsApi } from '../lib/api';
import { toast } from 'sonner';

import { User } from '../types';
import { logger } from '../lib/logger';

export function useDocuments(currentUser: User | null) {
  const { t } = useTranslation('documents');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false); // Prevent duplicate simultaneous requests

  // Load documents
  const loadDocuments = useCallback(async (user?: User | null, force: boolean = false) => {
    // Prevent duplicate simultaneous requests (unless forced)
    if (loadingRef.current && !force) {
      return;
    }

    const userToUse = user || currentUser;
    if (!userToUse) {
      setLoading(false);
      return;
    }

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const response = await documentsApi.getDocuments();

      if (response && response.documents) {
        setDocuments(response.documents);
      } else {
        setError(t('invalidApiResponse'));
        toast.error(t('invalidApiResponse'));
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('failedToLoadDocuments');
      logger.error('loadDocuments error:', errorMessage, err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [currentUser, t]);

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
      const response = await documentsApi.createDocument(title, description, contributors, options, ownershipType, organizationId);

      // Add collaborators if specified (skip for organizational - collaborators are auto-synced)
      if (contributors && contributors.length > 0 && response.document?.id && ownershipType !== 'organizational') {
        for (const contributorId of contributors) {
          try {
            await documentsApi.addCollaborator(response.document.id, contributorId);
          } catch (error) {
            logger.error('Failed to invite contributor:', contributorId, error);
          }
        }
      }

      toast.success(t('dashboard.documentCreated'));
      // Force reload to ensure consistency and get full document data
      // Use force=true to reload even if a load is in progress
      await loadDocuments(undefined, true);
    } catch (err: unknown) {
      logger.error('Document creation failed:', err);
      toast.error(t('dashboard.failedToCreate'));
      throw err; // Re-throw to let the dashboard handle the error
    }
  }, [loadDocuments, t]);

  // Delete document
  const deleteDocument = useCallback(async (documentId: string) => {
    try {
      await documentsApi.deleteDocument(documentId);
      await loadDocuments(); // Reload documents list
    } catch (err: unknown) {
      logger.error('Failed to delete document:', err);
      toast.error(t('dashboard.failedToDelete'));
      throw err; // Re-throw to let the dashboard handle the error
    }
  }, [loadDocuments, t]);

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

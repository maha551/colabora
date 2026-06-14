// Custom hook for structure proposal management
// Extracted from App.tsx to reduce complexity and improve modularity

import { useState, useEffect, useRef, useCallback } from 'react';
import { structureProposalsApi } from '../lib/api';
import { logger } from '../lib/logger';
import type { StructureProposal, Document } from '../types';

interface UseStructureProposalsOptions {
  currentDocument: Document | null;
  reloadDocument: (force?: boolean) => Promise<void>;
}

export function useStructureProposals({
  currentDocument,
  reloadDocument,
}: UseStructureProposalsOptions) {
  const [structureProposals, setStructureProposals] = useState<StructureProposal[]>([]);
  const [showStructureProposalMode, setShowStructureProposalMode] = useState(false);
  const loadStructureProposalsRef = useRef<{ loading: boolean; lastLoadTime: number }>({ loading: false, lastLoadTime: 0 });

  // Load structure proposals for current document
  const loadStructureProposals = useCallback(async () => {
    if (!currentDocument) return;

    // Prevent duplicate simultaneous requests
    const now = Date.now();
    if (loadStructureProposalsRef.current.loading) {
      logger.log('loadStructureProposals already in progress, skipping...');
      return;
    }
    
    // Debounce: don't load more than once per 2 seconds
    if (now - loadStructureProposalsRef.current.lastLoadTime < 2000) {
      logger.log('loadStructureProposals debounced, skipping...');
      return;
    }

    loadStructureProposalsRef.current.loading = true;
    loadStructureProposalsRef.current.lastLoadTime = now;

    try {
      const response = await structureProposalsApi.getStructureProposals(currentDocument.id);
      setStructureProposals(response.structureProposals || []);
    } catch (error) {
      logger.error('Failed to load structure proposals:', error);
      setStructureProposals([]);
    } finally {
      loadStructureProposalsRef.current.loading = false;
    }
  }, [currentDocument?.id]); // Only depend on document ID, not the whole object

  // Refresh structure proposals
  const refreshStructureProposals = useCallback(() => {
    loadStructureProposals();
  }, [loadStructureProposals]);

  // Load structure proposals when document ID changes (not on every document update)
  useEffect(() => {
    if (currentDocument?.id) {
      loadStructureProposals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDocument?.id]); // Only depend on document ID, not the whole object

  // Refresh callback after structure proposal completed (close voting + apply)
  const onStructureProposalCompleted = useCallback(async (proposalId: string) => {
    await reloadDocument();
    refreshStructureProposals();
  }, [reloadDocument, refreshStructureProposals]);

  const handleCreateStructureProposal = useCallback(() => {
    setShowStructureProposalMode(true);
  }, []);

  const handleCloseStructureProposalMode = useCallback(() => {
    setShowStructureProposalMode(false);
  }, []);

  return {
    structureProposals,
    showStructureProposalMode,
    loadStructureProposals,
    refreshStructureProposals,
    onStructureProposalCompleted,
    handleCreateStructureProposal,
    handleCloseStructureProposalMode,
  };
}


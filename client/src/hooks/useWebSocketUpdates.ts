// Custom hook for WebSocket update processing
// Orchestrator: composes sub-hooks from hooks/ws/

import { useRef, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useWebSocket, DocumentUpdate } from './useWebSocket';
import { logger } from '../lib/logger';
import type { Document, User, AppView } from '../types';
import { useVotingStore } from '../stores/useVotingStore';
import { useRealTimeStore } from '../stores/useRealTimeStore';
import { useDocumentStore } from '../stores/useDocumentStore';
import { useVoteUpdates } from './ws/useVoteUpdates';
import { useCommentUpdates } from './ws/useCommentUpdates';
import { useProposalUpdates } from './ws/useProposalUpdates';
import { useParagraphUpdates } from './ws/useParagraphUpdates';
import { useStructureUpdates } from './ws/useStructureUpdates';
import { useLifecycleUpdates } from './ws/useLifecycleUpdates';
import { useBatchedUpdates } from './ws/useBatchedUpdates';
import { useUpdateQueue } from './ws/useUpdateQueue';
import { useFallbackPolling } from './ws/useFallbackPolling';
import type { WebSocketUpdatesContext } from './ws/types';

interface UseWebSocketUpdatesOptions {
  currentDocument: Document | null;
  currentUser: User | null;
  currentView: AppView;
  documents: Document[];
  updateDocument: React.Dispatch<React.SetStateAction<Document | null>>;
  reloadDocument: (force?: boolean) => Promise<void>;
  loadDocumentById: (documentId: string, user: User) => Promise<void>;
  onAgreedViewRefresh?: () => void; // Optional callback for agreed view refresh
}

export function useWebSocketUpdates({
  currentDocument,
  currentUser,
  currentView,
  documents,
  updateDocument,
  reloadDocument,
  loadDocumentById,
  onAgreedViewRefresh,
}: UseWebSocketUpdatesOptions) {
  const { t } = useTranslation('common');
  const realTimeUpdatesEnabled = useRealTimeStore((s) => s.realTimeUpdatesEnabled);
  const setRealTimeUpdatesEnabledStore = useRealTimeStore((s) => s.setRealTimeUpdatesEnabled);
  const queuedUpdates = useRealTimeStore((s) => s.queuedUpdates);
  const setQueuedUpdatesStore = useRealTimeStore((s) => s.setQueuedUpdates);
  const clearQueuedUpdatesStore = useRealTimeStore((s) => s.clearQueuedUpdates);
  const setVotingState = useVotingStore((s) => s.setVotingState);
  const queuedUpdatesRef = useRef<DocumentUpdate[]>([]);
  const lastUpdateTimeRef = useRef<number>(Date.now());
  const activityFeedUpdateHandlerRef = useRef<((update: DocumentUpdate) => void) | null>(null);
  const pendingOperationsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const ctx = useMemo<WebSocketUpdatesContext>(
    () => ({
      updateDocument,
      reloadDocument,
      currentDocument,
      currentUser,
      currentView,
      onAgreedViewRefresh,
      onAgreedViewParagraphUpdate: (documentId, paragraphId, payload) => {
        useDocumentStore.getState().updateAgreedViewParagraph(documentId, paragraphId, payload);
      },
      setVotingState,
      t,
      pendingOperationsRef,
    }),
    [
      updateDocument,
      reloadDocument,
      currentDocument,
      currentUser,
      currentView,
      onAgreedViewRefresh,
      setVotingState,
      t,
    ]
  );
  const handleVote = useVoteUpdates(ctx);
  const handleComment = useCommentUpdates(ctx);
  const handleProposal = useProposalUpdates(ctx);
  const handleParagraph = useParagraphUpdates(ctx);
  const handleStructure = useStructureUpdates(ctx);
  const handleLifecycle = useLifecycleUpdates(ctx);

  const {
    processUpdateInternal,
    processBatchedUpdates,
    getUpdatePriority,
    updateQueueRef,
    batchTimeoutRef,
    BATCH_DELAY_MS,
  } = useBatchedUpdates(
    { handleVote, handleComment, handleProposal, handleParagraph, handleStructure, handleLifecycle },
    reloadDocument,
    t
  );

  const { applyQueuedUpdates, handleRealTimeToggle } = useUpdateQueue(
    processUpdateInternal,
    queuedUpdatesRef,
    setQueuedUpdatesStore,
    setRealTimeUpdatesEnabledStore
  );

  // Real-time updates via WebSocket (replaces polling)
  const handleDocumentUpdate = useCallback((update: DocumentUpdate) => {
    // Track that we received an update
    lastUpdateTimeRef.current = Date.now();
    
    // Debug logging - log all WebSocket updates to verify they're received
    logger.log('🔔 WebSocket update received:', {
      eventType: update.eventType,
      documentId: update.documentId,
      currentDocumentId: currentDocument?.id,
      currentView,
      hasData: !!update.data,
      timestamp: update.timestamp,
      realTimeUpdatesEnabled
    });
    
    // Check if we're loading this document (via hash)
    const hash = window.location.hash;
    const hashDocumentId = hash.startsWith('#document/') ? hash.replace('#document/', '') : null;
    const isDocumentBeingLoaded = hashDocumentId === update.documentId;
    
    // If document is null but we're loading it (or it matches hash), trigger reload to get fresh data
    if (!currentDocument) {
      if (isDocumentBeingLoaded) {
        logger.log('📦 Document is loading, will reload after load completes to get fresh data');
        // If document is loading, wait a bit then reload to ensure we get the update
        // This handles the case where update arrives before document finishes loading
        setTimeout(() => {
          if (hashDocumentId && currentUser) {
            loadDocumentById(hashDocumentId, currentUser).catch(err => {
              logger.error('Failed to reload document after update:', err);
            });
          }
        }, 500);
        return;
      }
      logger.log('❌ Update ignored - no current document and not loading this document');
      return;
    }
    
    // Only process if document ID matches
    if (update.documentId !== currentDocument.id) {
      logger.log('❌ Update ignored - wrong document');
      return;
    }

    // If real-time updates are disabled, queue the update instead of applying it
    if (!realTimeUpdatesEnabled) {
      logger.log('⏸️ Real-time updates paused, queuing update');
      const newQueue = [...queuedUpdatesRef.current, update];
      queuedUpdatesRef.current = newQueue;
      setQueuedUpdatesStore(newQueue);

      // Prevent queue from growing too large (fallback to API fetch if >100)
      if (newQueue.length > 100) {
        logger.warn('⚠️ Update queue too large (>100), falling back to API fetch');
        reloadDocument(true).catch(err => {
          logger.error('Failed to reload after queue overflow:', err);
        });
        queuedUpdatesRef.current = [];
        setQueuedUpdatesStore([]);
      }
      return;
    }

    // Determine update priority
    const priority = getUpdatePriority(update);
    
    // Process high-priority updates immediately (votes, comments)
    if (priority === 'high') {
      processUpdateInternal(update);
      return;
    }
    
    // Queue normal/low-priority updates for batching
    updateQueueRef.current.push(update);
    
    // Clear existing timeout
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
    }
    
    // Schedule batch processing
    batchTimeoutRef.current = setTimeout(() => {
      processBatchedUpdates();
      batchTimeoutRef.current = null;
    }, BATCH_DELAY_MS);
  }, [currentDocument, currentUser, currentView, realTimeUpdatesEnabled, processUpdateInternal, loadDocumentById, getUpdatePriority, processBatchedUpdates]);

  // Handler for activity feed WebSocket updates - will be passed to ActivityFeedView
  const handleActivityFeedUpdate = useCallback((update: DocumentUpdate) => {
    // Forward WebSocket updates to ActivityFeedView
    if (activityFeedUpdateHandlerRef.current) {
      activityFeedUpdateHandlerRef.current(update);
    }
  }, []);

  // Callback to receive handler from ActivityFeedView
  const setActivityFeedUpdateHandler = useCallback((handler: (update: DocumentUpdate) => void) => {
    activityFeedUpdateHandlerRef.current = handler;
  }, []);

  // Connect WebSocket when viewing a document OR activity feed
  const activityFeedDocumentIds = currentView === 'activity' && documents.length > 0
    ? documents.map(doc => doc.id)
    : undefined;
  
  const { connectionState } = useWebSocket({
    documentId: currentView === 'document' && currentDocument ? currentDocument.id : null,
    documentIds: activityFeedDocumentIds,
    userId: currentUser?.id || null,
    authToken: localStorage.getItem('authToken'),
    onDocumentUpdate: currentView === 'activity' ? handleActivityFeedUpdate : handleDocumentUpdate,
    activityFeedMode: currentView === 'activity' // Use activity feed room when in activity view
  });

  useFallbackPolling(
    currentView,
    currentDocument?.id,
    connectionState,
    reloadDocument,
    lastUpdateTimeRef
  );

  // Keep queuedUpdatesRef synchronized with queuedUpdates state
  useEffect(() => {
    queuedUpdatesRef.current = queuedUpdates;
  }, [queuedUpdates]);

  useEffect(() => {
    return () => {
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
        batchTimeoutRef.current = null;
      }
      if (updateQueueRef.current.length > 0) processBatchedUpdates();
    };
  }, [processBatchedUpdates]);

  return {
    realTimeUpdatesEnabled,
    setRealTimeUpdatesEnabled: handleRealTimeToggle,
    queuedUpdates,
    applyQueuedUpdates,
    setActivityFeedUpdateHandler,
  };
}


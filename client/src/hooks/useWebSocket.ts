import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Vote, Comment, Proposal, Paragraph, DocumentVote } from '../types';
import { logger } from '../lib/logger';
import { toast } from 'sonner';

// WebSocket update data types based on event type
export type DocumentUpdateEventType = 
  | 'vote' 
  | 'comment' 
  | 'proposal' 
  | 'paragraph' 
  | 'paragraph-created'
  | 'paragraph-updated'
  | 'document-vote' 
  | 'document-status-changed' 
  | 'proposal-cutoff-reached' 
  | 'deletion-proposed' 
  | 'deletion-vote' 
  | 'deletion-cancelled' 
  | 'document-deleted' 
  | 'deletion-vote-rejected' 
  | 'rule-proposal-approved'
  | 'governance-rules-updated'
  | 'structure-proposal-created'
  | 'structure-proposal-vote'
  | 'structure-proposal-completed'
  | 'tree-proposal-created'
  | 'tree-proposal-vote'
  | 'document-tree-proposal-completed'
  | 'deletion-vote-completed'
  | 'comment-upvote'
  | 'document-updated';

// Union type for WebSocket event data based on event type
export type DocumentUpdateData =
  | { type: 'vote'; proposalId: string; paragraphId: string; vote: { voteId: string; userId: string; vote: 'PRO' | 'NEUTRAL' | 'CONTRA'; action: string; allVotes: Vote[]; isAnonymous: boolean } }
  | { type: 'comment'; proposalId: string; paragraphId: string; comment: Comment }
  | { type: 'proposal'; paragraphId: string; proposal: Proposal }
  | { type: 'paragraph'; paragraphId: string; paragraph: Paragraph }
  | { type: 'paragraph-created'; paragraphId: string; paragraph: Paragraph }
  | { type: 'paragraph-updated'; paragraphId: string; text?: string; title?: string; headingLevel?: string }
  | { type: 'document-vote'; votes: DocumentVote[] }
  | { type: 'document-status-changed'; oldStatus: string; newStatus: string }
  | { type: 'proposal-cutoff-reached'; proposalsLocked: boolean; message?: string }
  | { type: 'deletion-proposed'; deletionProposedBy: string; deletionVoteDeadline: string }
  | { type: 'deletion-vote'; documentId: string; voteId: string; userId: string; vote: 'PRO' | 'NEUTRAL' | 'CONTRA'; action: string; allVotes: Array<{ id: string; userId: string; vote: 'PRO' | 'NEUTRAL' | 'CONTRA'; createdAt: string; user?: { id: string; name: string; email: string } }>; isAnonymous: boolean }
  | { type: 'deletion-cancelled' }
  | { type: 'document-deleted' }
  | { type: 'deletion-vote-rejected' }
  | { type: 'rule-proposal-approved' }
  | { type: 'governance-rules-updated'; organizationId: string }
  | { type: 'structure-proposal-vote'; proposalId: string; voteId: string; userId: string; vote: 'PRO' | 'NEUTRAL' | 'CONTRA'; action: string; allVotes: Array<{ id: string; userId: string; vote: 'PRO' | 'NEUTRAL' | 'CONTRA'; createdAt: string; user?: { id: string; name: string; email: string } }>; isAnonymous: boolean }
  | { type: 'tree-proposal-vote'; proposalId: string; documentId?: string; voteId: string; userId: string; vote: 'PRO' | 'NEUTRAL' | 'CONTRA'; action: string; allVotes: Array<{ id: string; userId: string; vote: 'PRO' | 'NEUTRAL' | 'CONTRA'; createdAt: string; user?: { id: string; name: string; email: string } }>; isAnonymous: boolean }
  | { type: 'structure-proposal-created'; proposalId: string; title?: string; userId?: string; operationCount?: number; approved?: boolean }
  | { type: 'tree-proposal-created'; proposalId?: string; documentId?: string; userId?: string }
  | { type: 'structure-proposal-completed'; proposalId: string; documentId?: string; applied?: boolean; outcome?: string; userId?: string }
  | { type: 'document-tree-proposal-completed'; proposalId?: string; documentId?: string; applied?: boolean; outcome?: string; userId?: string }
  | { type: 'deletion-vote-completed'; documentId?: string; outcome?: string }
  | { type: 'comment-upvote'; commentId?: string; proposalId?: string; upvoteCount?: number }
  | { type: 'document-updated'; amendmentsOpen?: boolean };

export interface DocumentUpdate {
  documentId: string;
  eventType: DocumentUpdateEventType;
  data: DocumentUpdateData;
  timestamp: string;
}

interface UseWebSocketOptions {
  documentId: string | null;
  documentIds?: string[]; // For subscribing to multiple documents (e.g., activity feed)
  userId: string | null;
  authToken: string | null;
  onDocumentUpdate: (update: DocumentUpdate) => void;
  activityFeedMode?: boolean; // If true, subscribe to activity feed room instead of individual document rooms
}

export function useWebSocket({
  documentId,
  documentIds,
  userId,
  authToken,
  onDocumentUpdate,
  activityFeedMode = false
}: UseWebSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const isConnectedRef = useRef(false);
  const currentDocumentIdRef = useRef<string | null>(null);
  const subscribedDocumentIdsRef = useRef<Set<string>>(new Set());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onDocumentUpdateRef = useRef(onDocumentUpdate);
  const connectionErrorRef = useRef<string | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const lastConnectionAttemptRef = useRef<number>(0);
  
  // Expose connection state for UI
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Keep the callback ref updated
  useEffect(() => {
    onDocumentUpdateRef.current = onDocumentUpdate;
  }, [onDocumentUpdate]);

  const connect = useCallback(() => {
    // For activity feed, we need userId and authToken but documentId can be null
    // For document view, we need documentId, userId, and authToken
    const needsConnection = (documentId || (documentIds && documentIds.length > 0)) && userId && authToken;
    if (!needsConnection) {
      return;
    }

    // If already connected and subscribing to the same documents, don't reconnect
    const currentTargetDocId = documentId || (documentIds && documentIds.length === 1 ? documentIds[0] : null);
    if (isConnectedRef.current && socketRef.current && currentDocumentIdRef.current === currentTargetDocId) {
      // Check if we need to update subscriptions for multiple documents
      if (documentIds && documentIds.length > 0) {
        const currentSubs = Array.from(subscribedDocumentIdsRef.current);
        const needsUpdate = documentIds.some(id => !currentSubs.includes(id)) || 
                           currentSubs.some(id => !documentIds.includes(id));
        if (!needsUpdate) {
          return; // Already subscribed to all needed documents
        }
      } else {
        return; // Single document, already connected
      }
    }

    // Clear any pending reconnection attempts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Disconnect existing socket if connecting to a different document (single document mode)
    // For multiple documents, we'll update subscriptions instead
    const targetDocId = documentId || (documentIds && documentIds.length === 1 ? documentIds[0] : null);
    if (socketRef.current) {
      // Remove all event listeners before disconnecting to prevent memory leaks
      socketRef.current.removeAllListeners();
      if (currentDocumentIdRef.current && currentDocumentIdRef.current !== targetDocId && !documentIds) {
        socketRef.current.disconnect();
        socketRef.current = null;
        isConnectedRef.current = false;
        subscribedDocumentIdsRef.current.clear();
      }
    }

    // Connect to WebSocket server
    // In development, Vite proxy doesn't handle WebSocket, so connect directly to server
    // In production, use same origin
    const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';
    const wsUrl = import.meta.env.PROD
      ? window.location.origin // In production, use same origin
      : 'http://localhost:3000'; // Direct connection for development (WebSocket can't use HTTP proxy)
    
    // Update connection state
    setConnectionState('connecting');
    setConnectionError(null);
    connectionErrorRef.current = null;
    lastConnectionAttemptRef.current = Date.now();
    
    const socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000, // Increased max delay for better backoff
      reconnectionAttempts: Infinity,
      timeout: 20000,
      auth: {
        token: authToken
      }
    });

    socket.on('connect', () => {
      const targetDocId = documentId || (documentIds && documentIds.length === 1 ? documentIds[0] : null);
      logger.log('✅ WebSocket connected, socket ID:', socket.id, 'document:', targetDocId, 'multiple:', !!documentIds);
      isConnectedRef.current = true;
      currentDocumentIdRef.current = targetDocId;
      reconnectAttemptsRef.current = 0;
      
      // Update connection state
      setConnectionState('connected');
      setConnectionError(null);
      connectionErrorRef.current = null;
      
      // Show success toast only if we had previous errors
      if (reconnectAttemptsRef.current > 0) {
        toast.success('Real-time updates reconnected');
      }

      // Register session with server (server expects this)
      socket.emit('register-session');
      logger.log('📝 Registered WebSocket session with server');

      // Subscribe to document updates
      if (activityFeedMode && documentIds && documentIds.length > 0) {
        // Subscribe to activity feed room (more efficient than individual document rooms)
        socket.emit('subscribe-activity-feed', documentIds);
        subscribedDocumentIdsRef.current.clear();
        documentIds.forEach(docId => {
          subscribedDocumentIdsRef.current.add(docId);
        });
        logger.log(`📡 Subscribed to activity feed room with ${documentIds.length} documents`);
      } else if (documentIds && documentIds.length > 0) {
        // Subscribe to multiple documents (legacy mode - individual document rooms)
        subscribedDocumentIdsRef.current.clear();
        documentIds.forEach(docId => {
          socket.emit('subscribe-document', docId);
          subscribedDocumentIdsRef.current.add(docId);
          logger.log('📡 Subscribing to document:', docId, 'socket:', socket.id);
        });
        logger.log(`📡 Subscribed to ${documentIds.length} documents for activity feed`);
      } else if (documentId) {
        // Subscribe to single document (document view mode)
        socket.emit('subscribe-document', documentId);
        subscribedDocumentIdsRef.current.clear();
        subscribedDocumentIdsRef.current.add(documentId);
        logger.log('📡 Subscribing to document:', documentId, 'socket:', socket.id);
      }
    });

    socket.on('disconnect', (reason) => {
      logger.log('WebSocket disconnected:', reason);
      isConnectedRef.current = false;
      
      // Update connection state based on reason
      if (reason === 'io client disconnect') {
        setConnectionState('disconnected');
        currentDocumentIdRef.current = null;
      } else {
        // Server disconnect or transport close - will attempt reconnect
        setConnectionState('connecting');
      }
      
      // Only clear document ID if it was a manual disconnect
      if (reason === 'io client disconnect') {
        currentDocumentIdRef.current = null;
      }
    });

    socket.on('reconnect', (attemptNumber) => {
      logger.log(`WebSocket reconnected after ${attemptNumber} attempts`);
      isConnectedRef.current = true;
      reconnectAttemptsRef.current = 0;
      
      // Update connection state
      setConnectionState('connected');
      setConnectionError(null);
      connectionErrorRef.current = null;
      
      // Show success message
      toast.success('Real-time updates reconnected');
      
      // Re-register session and re-subscribe after reconnection
      socket.emit('register-session');
      logger.log('📝 Re-registered WebSocket session after reconnect');
      
      // Re-subscribe to all documents
      if (activityFeedMode && documentIds && documentIds.length > 0) {
        socket.emit('subscribe-activity-feed', documentIds);
        logger.log(`📡 Re-subscribed to activity feed room with ${documentIds.length} documents`);
      } else if (documentIds && documentIds.length > 0) {
        documentIds.forEach(docId => {
          socket.emit('subscribe-document', docId);
          logger.log('📡 Re-subscribed to document:', docId);
        });
      } else if (documentId) {
        socket.emit('subscribe-document', documentId);
        logger.log('📡 Re-subscribed to document:', documentId);
      }
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      reconnectAttemptsRef.current = attemptNumber;
      logger.log(`WebSocket reconnection attempt ${attemptNumber}`);
      
      // Update state to show we're trying to reconnect
      setConnectionState('connecting');
      
      // Show warning after multiple attempts
      if (attemptNumber === 3) {
        const errorMsg = isDevelopment
          ? 'Unable to connect to real-time updates. Please ensure the backend server is running on port 3000.'
          : 'Real-time updates are reconnecting...';
        setConnectionError(errorMsg);
        toast.warning(errorMsg, { duration: 5000 });
      }
    });

    socket.on('reconnect_error', (error) => {
      reconnectAttemptsRef.current++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('WebSocket reconnection error:', error);
      setConnectionState('error');
      setConnectionError(errorMessage);
      connectionErrorRef.current = errorMessage;
    });

    socket.on('reconnect_failed', () => {
      logger.error('WebSocket reconnection failed');
      isConnectedRef.current = false;
      setConnectionState('error');
      const errorMsg = isDevelopment
        ? 'Failed to connect to real-time updates. Please ensure the backend server is running on port 3000.'
        : 'Real-time updates connection failed. Please refresh the page.';
      setConnectionError(errorMsg);
      connectionErrorRef.current = errorMsg;
      toast.error(errorMsg, { duration: 10000 });
    });

    socket.on('connect_error', (error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('WebSocket connection error:', error);
      isConnectedRef.current = false;
      setConnectionState('error');
      
      // Provide helpful error message
      const helpfulError = isDevelopment
        ? `Cannot connect to WebSocket server. Please ensure the backend server is running on port 3000 (run 'npm run dev' in the project root). Error: ${errorMessage}`
        : `Real-time updates connection failed: ${errorMessage}`;
      
      setConnectionError(helpfulError);
      connectionErrorRef.current = helpfulError;
      
      // Show error toast only on first connection attempt (not on reconnects)
      const timeSinceLastAttempt = Date.now() - lastConnectionAttemptRef.current;
      if (timeSinceLastAttempt > 5000) { // Only show if it's been more than 5 seconds since last attempt
        toast.error(helpfulError, { duration: 10000 });
      }
    });

    // Listen for subscription errors from server
    socket.on('subscription-error', (error: { type?: string; id?: string; error?: string }) => {
      logger.error('WebSocket subscription error:', {
        type: error.type,
        id: error.id,
        error: error.error,
        socketId: socket.id
      });
      toast.warning(error.error || 'Could not subscribe to real-time updates for this document.', { duration: 5000 });
    });

    // Listen for document updates
    socket.on('document-update', (update) => {
      logger.log('📨 Received document update:', {
        eventType: update.eventType,
        documentId: update.documentId,
        timestamp: update.timestamp,
        hasData: !!update.data
      });
      try {
        onDocumentUpdateRef.current(update);
      } catch (error) {
        logger.error('Error handling document update', { error, update });
      }
    });

    // Listen for activity feed updates (when in activity feed mode)
    socket.on('activity-feed-update', (update) => {
      logger.log('📨 Received activity feed update:', {
        eventType: update.eventType,
        documentId: update.documentId,
        timestamp: update.timestamp,
        hasData: !!update.data
      });
      try {
        // Activity feed updates use the same DocumentUpdate format
        onDocumentUpdateRef.current(update);
      } catch (error) {
        logger.error('Error handling activity feed update', { error, update });
      }
    });

    socketRef.current = socket;
  }, [documentId, documentIds, userId, authToken, activityFeedMode]);

  const disconnect = useCallback(() => {
    try {
      // Clear any pending reconnection attempts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (socketRef.current) {
        try {
          // Remove all event listeners before disconnecting
          socketRef.current.off('connect');
          socketRef.current.off('disconnect');
          socketRef.current.off('reconnect');
          socketRef.current.off('reconnect_attempt');
          socketRef.current.off('reconnect_error');
          socketRef.current.off('reconnect_failed');
          socketRef.current.off('connect_error');
          socketRef.current.off('subscription-error');
          socketRef.current.off('document-update');
          socketRef.current.off('activity-feed-update');

          // Unsubscribe from all documents and activity feed
          if (activityFeedMode) {
            try {
              socketRef.current?.emit('unsubscribe-activity-feed');
            } catch (err) {
              logger.error('Error unsubscribing from activity feed during cleanup', { error: err });
            }
          } else {
            subscribedDocumentIdsRef.current.forEach(docId => {
              try {
                socketRef.current?.emit('unsubscribe-document', docId);
              } catch (err) {
                logger.error('Error unsubscribing from document during cleanup', { error: err, docId });
              }
            });
          }
          subscribedDocumentIdsRef.current.clear();
          
          socketRef.current.disconnect();
        } catch (err) {
          logger.error('Error during socket disconnect', { error: err });
        } finally {
          socketRef.current = null;
          isConnectedRef.current = false;
          currentDocumentIdRef.current = null;
        }
      }
    } catch (error) {
      logger.error('Error in disconnect cleanup', { error });
      // Ensure cleanup state even if errors occur
      socketRef.current = null;
      isConnectedRef.current = false;
      currentDocumentIdRef.current = null;
      subscribedDocumentIdsRef.current.clear();
    }
  }, []);

  useEffect(() => {
    const hasDocuments = documentId || (documentIds && documentIds.length > 0);
    if (hasDocuments && userId && authToken) {
      // Connect if documents changed or not connected
      const prevDocId = currentDocumentIdRef.current;
      const targetDocId = documentId || (documentIds && documentIds.length === 1 ? documentIds[0] : null);
      const needsReconnect = prevDocId !== targetDocId || !isConnectedRef.current;
      
      // For multiple documents, check if subscriptions need updating
      if (documentIds && documentIds.length > 0) {
        const currentSubs = Array.from(subscribedDocumentIdsRef.current);
        const needsUpdate = documentIds.some(id => !currentSubs.includes(id)) || 
                           currentSubs.some(id => !documentIds.includes(id));
        if (needsReconnect || needsUpdate) {
          connect();
        }
      } else if (needsReconnect) {
        connect();
      }
    } else {
      // Disconnect if we don't have required params
      if (isConnectedRef.current) {
        disconnect();
      }
    }

    // Cleanup function - runs when effect dependencies change or component unmounts
    return () => {
      // Capture current values at cleanup time
      const cleanupDocId = currentDocumentIdRef.current;
      const cleanupIsConnected = isConnectedRef.current;
      const targetDocId = documentId || (documentIds && documentIds.length === 1 ? documentIds[0] : null);
      
      // Only disconnect if:
      // 1. We're unmounting (no documents)
      // 2. Document actually changed (cleanupDocId !== targetDocId)
      // Don't disconnect if documents are the same (just a re-render)
      if ((!hasDocuments && cleanupIsConnected) || 
          (cleanupDocId && cleanupDocId !== targetDocId && cleanupIsConnected && !documentIds)) {
        disconnect();
      }
    };
    }, [documentId, documentIds, userId, authToken, activityFeedMode, connect, disconnect]);

  return {
    isConnected: isConnectedRef.current,
    socket: socketRef.current,
    connectionState,
    connectionError,
    reconnectAttempts: reconnectAttemptsRef.current
  };
}


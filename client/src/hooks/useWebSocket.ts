import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// WebSocket update data types based on event type
export type DocumentUpdateEventType = 
  | 'vote' 
  | 'comment' 
  | 'proposal' 
  | 'paragraph' 
  | 'document-vote' 
  | 'document-status-changed' 
  | 'proposal-cutoff-reached' 
  | 'deletion-proposed' 
  | 'deletion-vote' 
  | 'deletion-cancelled' 
  | 'document-deleted' 
  | 'deletion-vote-rejected' 
  | 'rule-proposal-approved';

export interface DocumentUpdate {
  documentId: string;
  eventType: DocumentUpdateEventType;
  data: unknown; // Data structure varies by eventType
  timestamp: string;
}

interface UseWebSocketOptions {
  documentId: string | null;
  documentIds?: string[]; // For subscribing to multiple documents (e.g., activity feed)
  userId: string | null;
  authToken: string | null;
  onDocumentUpdate: (update: DocumentUpdate) => void;
}

export function useWebSocket({
  documentId,
  documentIds,
  userId,
  authToken,
  onDocumentUpdate
}: UseWebSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const isConnectedRef = useRef(false);
  const currentDocumentIdRef = useRef<string | null>(null);
  const subscribedDocumentIdsRef = useRef<Set<string>>(new Set());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onDocumentUpdateRef = useRef(onDocumentUpdate);

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
    if (socketRef.current && currentDocumentIdRef.current && currentDocumentIdRef.current !== targetDocId && !documentIds) {
      socketRef.current.disconnect();
      socketRef.current = null;
      isConnectedRef.current = false;
      subscribedDocumentIdsRef.current.clear();
    }

    // Connect to WebSocket server (use same URL pattern as API)
    // Use import.meta.env for Vite (not process.env)
    const wsUrl = import.meta.env.PROD
      ? window.location.origin // In production, use same origin
      : 'http://localhost:3000'; // Direct connection for development
    const socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
      auth: {
        token: authToken
      }
    });

    socket.on('connect', () => {
      const targetDocId = documentId || (documentIds && documentIds.length === 1 ? documentIds[0] : null);
      console.log('✅ WebSocket connected, socket ID:', socket.id, 'document:', targetDocId, 'multiple:', !!documentIds);
      isConnectedRef.current = true;
      currentDocumentIdRef.current = targetDocId;

      // Authenticate with server
      socket.emit('authenticate', {
        token: authToken,
        userId
      });

      // Subscribe to document updates
      if (documentIds && documentIds.length > 0) {
        // Subscribe to multiple documents (activity feed mode)
        subscribedDocumentIdsRef.current.clear();
        documentIds.forEach(docId => {
          socket.emit('subscribe-document', docId);
          subscribedDocumentIdsRef.current.add(docId);
          console.log('📡 Subscribed to document:', docId);
        });
      } else if (documentId) {
        // Subscribe to single document (document view mode)
        socket.emit('subscribe-document', documentId);
        subscribedDocumentIdsRef.current.clear();
        subscribedDocumentIdsRef.current.add(documentId);
        console.log('📡 Subscribed to document:', documentId);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      isConnectedRef.current = false;
      
      // Only clear document ID if it was a manual disconnect
      if (reason === 'io client disconnect') {
        currentDocumentIdRef.current = null;
      }
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log(`WebSocket reconnected after ${attemptNumber} attempts`);
      isConnectedRef.current = true;
      
      // Re-authenticate and re-subscribe after reconnection
      socket.emit('authenticate', {
        token: authToken,
        userId
      });
      
      // Re-subscribe to all documents
      if (documentIds && documentIds.length > 0) {
        documentIds.forEach(docId => {
          socket.emit('subscribe-document', docId);
        });
      } else if (documentId) {
        socket.emit('subscribe-document', documentId);
      }
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`WebSocket reconnection attempt ${attemptNumber}`);
    });

    socket.on('reconnect_error', (error) => {
      console.error('WebSocket reconnection error:', error);
    });

    socket.on('reconnect_failed', () => {
      console.error('WebSocket reconnection failed');
      isConnectedRef.current = false;
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      isConnectedRef.current = false;
    });

    // Listen for document updates
    socket.on('document-update', (update) => {
      console.log('📨 Received document update:', {
        eventType: update.eventType,
        documentId: update.documentId,
        timestamp: update.timestamp,
        hasData: !!update.data
      });
      onDocumentUpdateRef.current(update);
    });

    socketRef.current = socket;
  }, [documentId, documentIds, userId, authToken]);

  const disconnect = useCallback(() => {
    // Clear any pending reconnection attempts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (socketRef.current) {
      // Remove all event listeners before disconnecting
      socketRef.current.off('connect');
      socketRef.current.off('disconnect');
      socketRef.current.off('reconnect');
      socketRef.current.off('reconnect_attempt');
      socketRef.current.off('reconnect_error');
      socketRef.current.off('reconnect_failed');
      socketRef.current.off('connect_error');
      socketRef.current.off('document-update');

      // Unsubscribe from all documents
      subscribedDocumentIdsRef.current.forEach(docId => {
        socketRef.current?.emit('unsubscribe-document', docId);
      });
      subscribedDocumentIdsRef.current.clear();
      socketRef.current.disconnect();
      socketRef.current = null;
      isConnectedRef.current = false;
      currentDocumentIdRef.current = null;
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
  }, [documentId, documentIds, userId, authToken, connect, disconnect]);

  return {
    isConnected: isConnectedRef.current,
    socket: socketRef.current
  };
}


import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// Organization WebSocket update data types based on event type
export type OrganizationUpdateEventType = 
  | 'governance-rules-updated' 
  | 'election-created' 
  | 'election-updated' 
  | 'election-completed' 
  | 'member-added' 
  | 'member-removed' 
  | 'member-invited' 
  | 'rule-proposal-created' 
  | 'rule-proposal-approved';

export interface OrganizationUpdate {
  organizationId: string;
  eventType: OrganizationUpdateEventType;
  data: unknown; // Data structure varies by eventType
  timestamp: string;
}

interface UseOrganizationWebSocketOptions {
  organizationId: string | null;
  userId: string | null;
  authToken: string | null;
  onOrganizationUpdate: (update: OrganizationUpdate) => void;
}

export function useOrganizationWebSocket({
  organizationId,
  userId,
  authToken,
  onOrganizationUpdate
}: UseOrganizationWebSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const isConnectedRef = useRef(false);
  const currentOrganizationIdRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onOrganizationUpdateRef = useRef(onOrganizationUpdate);

  // Keep the callback ref updated
  useEffect(() => {
    onOrganizationUpdateRef.current = onOrganizationUpdate;
  }, [onOrganizationUpdate]);

  const connect = useCallback(() => {
    if (!organizationId || !userId || !authToken) {
      return;
    }

    // If already connected to the same organization, don't reconnect
    if (isConnectedRef.current && socketRef.current && currentOrganizationIdRef.current === organizationId) {
      return;
    }

    // Clear any pending reconnection attempts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Disconnect existing socket if connecting to a different organization
    if (socketRef.current && currentOrganizationIdRef.current !== organizationId) {
      socketRef.current.disconnect();
      socketRef.current = null;
      isConnectedRef.current = false;
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
      console.log('Organization WebSocket connected');
      isConnectedRef.current = true;
      currentOrganizationIdRef.current = organizationId;

      // Authenticate with server
      socket.emit('authenticate', {
        token: authToken,
        userId
      });

      // Subscribe to organization updates
      socket.emit('subscribe-organization', organizationId);
    });

    socket.on('disconnect', (reason) => {
      console.log('Organization WebSocket disconnected:', reason);
      isConnectedRef.current = false;
      
      // Only clear organization ID if it was a manual disconnect
      if (reason === 'io client disconnect') {
        currentOrganizationIdRef.current = null;
      }
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log(`Organization WebSocket reconnected after ${attemptNumber} attempts`);
      isConnectedRef.current = true;
      
      // Re-authenticate and re-subscribe after reconnection
      socket.emit('authenticate', {
        token: authToken,
        userId
      });
      
      if (organizationId) {
        socket.emit('subscribe-organization', organizationId);
      }
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`Organization WebSocket reconnection attempt ${attemptNumber}`);
    });

    socket.on('reconnect_error', (error) => {
      console.error('Organization WebSocket reconnection error:', error);
    });

    socket.on('reconnect_failed', () => {
      console.error('Organization WebSocket reconnection failed');
      isConnectedRef.current = false;
    });

    socket.on('connect_error', (error) => {
      console.error('Organization WebSocket connection error:', error);
      isConnectedRef.current = false;
    });

    // Listen for organization updates
    socket.on('organization-update', (update) => {
      console.log('Received organization update:', update);
      onOrganizationUpdateRef.current(update);
    });

    socketRef.current = socket;
  }, [organizationId, userId, authToken]);

  const disconnect = useCallback(() => {
    // Clear any pending reconnection attempts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (socketRef.current) {
      if (currentOrganizationIdRef.current) {
        socketRef.current.emit('unsubscribe-organization', currentOrganizationIdRef.current);
      }
      socketRef.current.disconnect();
      socketRef.current = null;
      isConnectedRef.current = false;
      currentOrganizationIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (organizationId && userId && authToken) {
      // Only connect if organization changed or not connected
      const prevOrgId = currentOrganizationIdRef.current;
      if (prevOrgId !== organizationId || !isConnectedRef.current) {
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
      const cleanupOrgId = currentOrganizationIdRef.current;
      const cleanupIsConnected = isConnectedRef.current;
      
      // Only disconnect if:
      // 1. We're unmounting (organizationId becomes null)
      // 2. Organization actually changed (cleanupOrgId !== organizationId)
      // Don't disconnect if organizationId is the same (just a re-render)
      if ((!organizationId && cleanupIsConnected) || 
          (cleanupOrgId && cleanupOrgId !== organizationId && cleanupIsConnected)) {
        disconnect();
      }
    };
  }, [organizationId, userId, authToken]);

  return {
    isConnected: isConnectedRef.current,
    socket: socketRef.current
  };
}


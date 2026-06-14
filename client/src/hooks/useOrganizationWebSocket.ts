import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Organization, GovernanceRule, Election, OrganizationMember, GovernanceRuleValue, DocumentVote, Comment, Vote } from '../types';
import { logger } from '../lib/logger';
import { toast } from 'sonner';

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
  | 'rule-proposal-approved'
  | 'rule-proposal-rejected'
  | 'rule-proposal-declined'
  | 'rule-proposal-withdrawn'
  | 'rule-proposal-expired'
  | 'rule-proposal-vote-cast'
  | 'rule-proposal-voting-started'
  | 'branding-updated'
  | 'document-created'
  | 'document-status-changed'
  | 'document-vote'
  | 'proposal-vote'
  | 'proposal-comment'
  | 'structure-proposal-comment'
  | 'structure-proposal-vote'
  | 'structure-proposal-completed'
  | 'tree-proposal-vote'
  | 'document-tree-proposal-completed'
  | 'deletion-vote-completed'
  | 'representative-resignation-pending'
  | 'representative-resignation-finalized'
  | 'organization-vote-cast'
  | 'organization-vote-created'
  | 'organization-vote-completed'
  | 'vote-declined'
  | 'document-updated'
  | 'overview-pin-updated'
  | 'scheduling-poll-opened'
  | 'scheduling-poll-participation-closed'
  | 'scheduling-poll-deadline-extended';

// Union type for organization WebSocket event data
export type OrganizationUpdateData =
  | { type: 'governance-rules-updated'; rules: GovernanceRule }
  | { type: 'election-created'; election: Election }
  | { type: 'election-updated'; election: Election }
  | { type: 'election-completed'; election: Election }
  | { type: 'member-added'; member: OrganizationMember }
  | { type: 'member-removed'; memberId: string }
  | { type: 'member-invited'; email: string }
  | { type: 'rule-proposal-created'; organizationId: string; proposalId: string; ruleField: string; title: string; hasOptions: boolean; optionCount?: number }
  | { type: 'rule-proposal-approved'; organizationId: string; proposalId: string; ruleField: string; newValue: GovernanceRuleValue; approvalRate: number }
  | { type: 'rule-proposal-rejected'; organizationId: string; proposalId: string; approvalRate: number; threshold: number }
  | { type: 'rule-proposal-declined'; organizationId: string; proposalId: string; title: string }
  | { type: 'rule-proposal-withdrawn'; organizationId: string; proposalId: string; title: string }
  | { type: 'rule-proposal-expired'; organizationId: string; proposalId: string; status: string }
  | { type: 'rule-proposal-vote-cast'; proposalId: string; organizationId: string; userId: string; selectedOptionId?: string; voteChoice?: 'yes' | 'no' | 'abstain' }
  | { type: 'rule-proposal-voting-started'; organizationId: string; proposalId: string; title: string; ruleField: string; votingEndsAt: string; totalVoters: number }
  | { type: 'branding-updated'; organization: Organization }
  | { type: 'document-created'; documentId: string }
  | { type: 'document-status-changed'; documentId: string; oldStatus: string; newStatus: string; reason?: string }
  | { type: 'document-vote'; documentId: string; votes: DocumentVote[]; action: 'cast' | 'updated' }
  | { type: 'proposal-vote'; documentId: string; proposalId: string; paragraphId: string; voteId: string; userId: string; vote: 'PRO' | 'NEUTRAL' | 'CONTRA'; action: 'cast' | 'updated'; allVotes: Vote[]; isAnonymous: boolean }
  | { type: 'proposal-comment'; documentId: string; proposalId: string; paragraphId: string; comment: Comment; action: 'created' | 'updated' | 'deleted' }
  | { type: 'structure-proposal-comment'; documentId: string; proposalId: string; comment: Comment; action: 'created' | 'updated' | 'deleted' }
  | { type: 'structure-proposal-completed'; documentId: string; proposalId: string; applied: boolean; outcome: string }
  | { type: 'document-tree-proposal-completed'; documentId: string; proposalId: string; applied: boolean; outcome: string }
  | { type: 'deletion-vote-completed'; documentId: string; outcome: string }
  | { type: 'representative-resignation-pending'; organizationId: string; userId: string; electionId?: string }
  | { type: 'representative-resignation-finalized'; organizationId: string; electionId?: string; finalizedResignations?: string[] }
  | { type: 'organization-vote-cast'; organizationId: string; voteId: string; userId: string; vote: 'yes' | 'no' | 'abstain'; action: 'cast'; allVotes: Vote[]; isAnonymous: boolean }
  | { type: 'organization-vote-created'; organizationId: string; voteId: string; title: string; voteType: string }
  | { type: 'organization-vote-completed'; organizationId: string; voteId: string; status: string; passed: boolean }
  | { type: 'vote-declined'; voteId: string; organizationId: string }
  | { type: 'document-updated'; documentId: string; amendmentsOpen?: boolean }
  | {
      type: 'overview-pin-updated';
      organizationId: string;
      overviewPinnedEventId: string | null;
      overviewPinnedAt: string | null;
      overviewPinnedByUserId: string | null;
      overviewPinnedEvent: import('../lib/api/calendar').CalendarEvent | null;
      updatedBy?: string;
    };

export interface OrganizationUpdate {
  organizationId: string;
  eventType: OrganizationUpdateEventType;
  data: OrganizationUpdateData;
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
  const connectionErrorRef = useRef<string | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const lastConnectionAttemptRef = useRef<number>(0);
  
  // Expose connection state for UI
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);

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
    if (socketRef.current) {
      // Remove all event listeners before disconnecting to prevent memory leaks
      socketRef.current.removeAllListeners();
      if (currentOrganizationIdRef.current !== organizationId) {
        socketRef.current.disconnect();
        socketRef.current = null;
        isConnectedRef.current = false;
      }
    }

    // Connect to WebSocket server (use same URL pattern as API)
    // Use import.meta.env for Vite (not process.env)
    const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';
    const wsUrl = import.meta.env.PROD
      ? window.location.origin // In production, use same origin
      : 'http://localhost:3000'; // Direct connection for development
    
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
      logger.log('Organization WebSocket connected');
      isConnectedRef.current = true;
      currentOrganizationIdRef.current = organizationId;
      reconnectAttemptsRef.current = 0;
      
      // Update connection state
      setConnectionState('connected');
      setConnectionError(null);
      connectionErrorRef.current = null;
      
      // Show success toast only if we had previous errors
      if (reconnectAttemptsRef.current > 0) {
        toast.success('Organization real-time updates reconnected');
      }

      // Authenticate with server
      socket.emit('authenticate', {
        token: authToken,
        userId
      });

      // Subscribe to organization updates
      socket.emit('subscribe-organization', organizationId);
    });

    socket.on('disconnect', (reason) => {
      logger.log('Organization WebSocket disconnected:', reason);
      isConnectedRef.current = false;
      
      // Update connection state based on reason
      if (reason === 'io client disconnect') {
        setConnectionState('disconnected');
        currentOrganizationIdRef.current = null;
      } else {
        // Server disconnect or transport close - will attempt reconnect
        setConnectionState('connecting');
      }
      
      // Only clear organization ID if it was a manual disconnect
      if (reason === 'io client disconnect') {
        currentOrganizationIdRef.current = null;
      }
    });

    socket.on('reconnect', (attemptNumber) => {
      logger.log(`Organization WebSocket reconnected after ${attemptNumber} attempts`);
      isConnectedRef.current = true;
      reconnectAttemptsRef.current = 0;
      
      // Update connection state
      setConnectionState('connected');
      setConnectionError(null);
      connectionErrorRef.current = null;
      
      // Show success message
      toast.success('Organization real-time updates reconnected');
      
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
      reconnectAttemptsRef.current = attemptNumber;
      logger.log(`Organization WebSocket reconnection attempt ${attemptNumber}`);
      
      // Update state to show we're trying to reconnect
      setConnectionState('connecting');
      
      // Show warning after multiple attempts
      if (attemptNumber === 3) {
        const errorMsg = isDevelopment
          ? 'Unable to connect to organization real-time updates. Please ensure the backend server is running on port 3000.'
          : 'Organization real-time updates are reconnecting...';
        setConnectionError(errorMsg);
        toast.warning(errorMsg, { duration: 5000 });
      }
    });

    socket.on('reconnect_error', (error) => {
      reconnectAttemptsRef.current++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Organization WebSocket reconnection error:', error);
      setConnectionState('error');
      setConnectionError(errorMessage);
      connectionErrorRef.current = errorMessage;
    });

    socket.on('reconnect_failed', () => {
      logger.error('Organization WebSocket reconnection failed');
      isConnectedRef.current = false;
      setConnectionState('error');
      const errorMsg = isDevelopment
        ? 'Failed to connect to organization real-time updates. Please ensure the backend server is running on port 3000.'
        : 'Organization real-time updates connection failed. Please refresh the page.';
      setConnectionError(errorMsg);
      connectionErrorRef.current = errorMsg;
      toast.error(errorMsg, { duration: 10000 });
    });

    socket.on('connect_error', (error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Organization WebSocket connection error:', error);
      isConnectedRef.current = false;
      setConnectionState('error');
      
      // Provide helpful error message
      const helpfulError = isDevelopment
        ? `Cannot connect to WebSocket server. Please ensure the backend server is running on port 3000 (run 'npm run dev' in the project root). Error: ${errorMessage}`
        : `Organization real-time updates connection failed: ${errorMessage}`;
      
      setConnectionError(helpfulError);
      connectionErrorRef.current = helpfulError;
      
      // Show error toast only on first connection attempt (not on reconnects)
      const timeSinceLastAttempt = Date.now() - lastConnectionAttemptRef.current;
      if (timeSinceLastAttempt > 5000) { // Only show if it's been more than 5 seconds since last attempt
        toast.error(helpfulError, { duration: 10000 });
      }
    });

    socket.on('subscription-error', (error: { type?: string; id?: string; error?: string }) => {
      logger.error('Organization WebSocket subscription error:', { type: error.type, id: error.id, error: error.error });
      toast.warning(error.error || 'Could not subscribe to organization updates.', { duration: 5000 });
    });

    // Listen for organization updates
    socket.on('organization-update', (update) => {
      logger.log('Received organization update:', update);
      try {
        onOrganizationUpdateRef.current(update);
      } catch (error) {
        logger.error('Error handling organization update', { error, update });
      }
    });

    socketRef.current = socket;
  }, [organizationId, userId, authToken]);

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
          socketRef.current.off('organization-update');

          if (currentOrganizationIdRef.current) {
            try {
              socketRef.current.emit('unsubscribe-organization', currentOrganizationIdRef.current);
            } catch (err) {
              logger.error('Error unsubscribing from organization during cleanup', { error: err, organizationId: currentOrganizationIdRef.current });
            }
          }
          
          socketRef.current.disconnect();
        } catch (err) {
          logger.error('Error during socket disconnect', { error: err });
        } finally {
          socketRef.current = null;
          isConnectedRef.current = false;
          currentOrganizationIdRef.current = null;
        }
      }
    } catch (error) {
      logger.error('Error in disconnect cleanup', { error });
      // Ensure cleanup state even if errors occur
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
    // Note: connect and disconnect are useCallback hooks that depend on the same values
    // (organizationId, userId, authToken) or are stable (disconnect has empty deps).
    // Including them here ensures the effect re-runs when they change, which is safe
    // since they're already memoized and will only change when their deps change.
  }, [organizationId, userId, authToken, connect, disconnect]);

  return {
    isConnected: isConnectedRef.current,
    socket: socketRef.current,
    connectionState,
    connectionError,
    reconnectAttempts: reconnectAttemptsRef.current
  };
}


import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { logger } from '../lib/logger';
import { toast } from 'sonner';
import type { MeetingUpdateData } from '../lib/api/types/meetingMinutes';

export interface MeetingUpdatePayload {
  eventType: string;
  data: MeetingUpdateData | null;
  timestamp: string;
}

interface UseMeetingWebSocketOptions {
  meetingId: string | null;
  organizationId: string | null;
  userId: string | null;
  authToken: string | null;
}

export function useMeetingWebSocket({
  meetingId,
  organizationId,
  userId,
  authToken,
}: UseMeetingWebSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const isConnectedRef = useRef(false);
  const currentMeetingIdRef = useRef<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<MeetingUpdatePayload | null>(null);

  const connect = useCallback(() => {
    if (!meetingId || !userId || !authToken || !organizationId) {
      return;
    }

    if (
      isConnectedRef.current &&
      socketRef.current &&
      currentMeetingIdRef.current === meetingId
    ) {
      return;
    }

    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      if (currentMeetingIdRef.current !== meetingId) {
        socketRef.current.emit('unsubscribe-meeting', currentMeetingIdRef.current);
        socketRef.current.disconnect();
        socketRef.current = null;
        isConnectedRef.current = false;
      }
    }

    const wsUrl =
      import.meta.env.PROD ? window.location.origin : 'http://localhost:3000';

    const socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
      auth: { token: authToken },
    });

    socket.on('connect', () => {
      logger.log('Meeting WebSocket connected, meeting:', meetingId);
      isConnectedRef.current = true;
      currentMeetingIdRef.current = meetingId;
      setIsConnected(true);

      socket.emit('authenticate', { token: authToken, userId });
      socket.emit('subscribe-meeting', meetingId);
    });

    socket.on('disconnect', (reason) => {
      logger.log('Meeting WebSocket disconnected:', reason);
      isConnectedRef.current = false;
      setIsConnected(false);
      if (reason === 'io client disconnect') {
        currentMeetingIdRef.current = null;
      }
    });

    socket.on('reconnect', () => {
      isConnectedRef.current = true;
      setIsConnected(true);
      socket.emit('authenticate', { token: authToken, userId });
      if (meetingId) {
        socket.emit('subscribe-meeting', meetingId);
      }
    });

    const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';
    socket.on('connect_error', (error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Meeting WebSocket connection error:', error);
      isConnectedRef.current = false;
      setIsConnected(false);
      const helpfulError = isDevelopment
        ? `Meeting live updates could not connect. Ensure the backend is running on port 3000. Error: ${errorMessage}`
        : `Meeting live updates could not connect: ${errorMessage}`;
      toast.error(helpfulError, { duration: 10000 });
    });

    socket.on('reconnect_attempt', (attemptNumber: number) => {
      if (attemptNumber === 3) {
        const msg = isDevelopment
          ? 'Unable to connect to meeting updates. Ensure the backend is running on port 3000.'
          : 'Meeting updates are reconnecting…';
        toast.warning(msg, { duration: 5000 });
      }
    });

    socket.on('reconnect_failed', () => {
      logger.error('Meeting WebSocket reconnection failed');
      isConnectedRef.current = false;
      setIsConnected(false);
      const msg = isDevelopment
        ? 'Meeting live updates connection failed. Ensure the backend is running on port 3000.'
        : 'Meeting live updates connection failed. Please refresh the page.';
      toast.error(msg, { duration: 10000 });
    });

    socket.on('subscription-error', (error: { type?: string; id?: string; error?: string }) => {
      logger.error('Meeting WebSocket subscription error:', { type: error.type, id: error.id, error: error.error });
      toast.warning(error.error || 'Could not subscribe to this meeting\'s updates.', { duration: 5000 });
    });

    socket.on('meeting-update', (payload: MeetingUpdatePayload) => {
      logger.log('Meeting update received:', payload.eventType, payload.timestamp);
      setLastUpdate(payload);
    });

    socketRef.current = socket;
  }, [meetingId, organizationId, userId, authToken]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      try {
        const mid = currentMeetingIdRef.current;
        if (mid) {
          socketRef.current.emit('unsubscribe-meeting', mid);
        }
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
      } catch (err) {
        logger.error('Meeting WebSocket disconnect error', { error: err });
      } finally {
        socketRef.current = null;
        isConnectedRef.current = false;
        currentMeetingIdRef.current = null;
        setIsConnected(false);
      }
    }
  }, []);

  useEffect(() => {
    if (meetingId && userId && authToken && organizationId) {
      connect();
    } else {
      if (isConnectedRef.current) {
        disconnect();
      }
    }

    return () => {
      const cleanupMid = currentMeetingIdRef.current;
      const cleanupConnected = isConnectedRef.current;
      if (
        (!meetingId && cleanupConnected) ||
        (cleanupMid && cleanupMid !== meetingId && cleanupConnected)
      ) {
        disconnect();
      }
    };
  }, [meetingId, organizationId, userId, authToken, connect, disconnect]);

  return {
    socket: socketRef.current,
    isConnected,
    lastUpdate,
  };
}

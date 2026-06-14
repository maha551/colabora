/**
 * Connection Status Component
 * Displays database connection status to users
 */

import React, { useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { toast } from 'sonner';
import { COLORS, RADIUS } from '../lib/designSystem';
import { cn } from './ui/utils';

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'error' | 'unknown';

interface ConnectionStatusProps {
  /** Whether to show the status indicator */
  showIndicator?: boolean;
  /** Whether to show toast notifications */
  showToasts?: boolean;
  /** Custom className */
  className?: string;
}

let globalConnectionStatus: ConnectionStatus = 'unknown';
const statusListeners: Set<(status: ConnectionStatus) => void> = new Set();
let lastStatusChange: number = Date.now();
let consecutiveFailures: number = 0;

/**
 * Update global connection status
 */
export function updateConnectionStatus(status: ConnectionStatus) {
  const previousStatus = globalConnectionStatus;
  globalConnectionStatus = status;
  lastStatusChange = Date.now();

  // Track consecutive failures
  if (status === 'error' || status === 'disconnected') {
    consecutiveFailures++;
  } else if (status === 'connected') {
    consecutiveFailures = 0;
  }

  // Notify all listeners
  statusListeners.forEach(listener => {
    try {
      listener(status);
    } catch (error) {
      console.error('Error in connection status listener:', error);
    }
  });

  // Show toast for significant status changes
  if (previousStatus !== status) {
    if (status === 'disconnected' || status === 'error') {
      toast.error('Database connection lost. Attempting to reconnect...', {
        duration: 5000,
        id: 'db-connection-lost'
      });
    } else if (status === 'connected' && (previousStatus === 'disconnected' || previousStatus === 'error' || previousStatus === 'reconnecting')) {
      toast.success('Database connection restored', {
        duration: 3000,
        id: 'db-connection-restored'
      });
    } else if (status === 'reconnecting' && previousStatus !== 'reconnecting') {
      toast.info('Reconnecting to database...', {
        duration: 3000,
        id: 'db-reconnecting'
      });
    }
  }
}

/**
 * Get current connection status
 */
export function getConnectionStatus(): ConnectionStatus {
  return globalConnectionStatus;
}

/**
 * Subscribe to connection status changes
 */
export function subscribeToConnectionStatus(listener: (status: ConnectionStatus) => void): () => void {
  statusListeners.add(listener);
  // Immediately call with current status
  listener(globalConnectionStatus);
  
  // Return unsubscribe function
  return () => {
    statusListeners.delete(listener);
  };
}

/**
 * Monitor database connection health
 */
export function startConnectionMonitoring() {
  let isMonitoring = false;
  
  const checkConnection = async () => {
    if (isMonitoring) return;
    isMonitoring = true;

    try {
      const response = await fetch('/api/health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (response.ok) {
        const data = await response.json();
        if (data.database === 'connected') {
          updateConnectionStatus('connected');
        } else if (data.database === 'error') {
          updateConnectionStatus('error');
        } else {
          updateConnectionStatus('reconnecting');
        }
      } else {
        updateConnectionStatus('error');
      }
    } catch (error) {
      // Network error or timeout
      if (error instanceof Error && error.name === 'AbortError') {
        updateConnectionStatus('error');
      } else {
        updateConnectionStatus('disconnected');
      }
    } finally {
      isMonitoring = false;
    }
  };

  // Check immediately
  checkConnection();

  // Check every 30 seconds
  const interval = setInterval(checkConnection, 30000);

  return () => {
    clearInterval(interval);
  };
}

/**
 * Connection Status Indicator Component
 */
export function ConnectionStatusIndicator({ 
  showIndicator = true, 
  showToasts = true,
  className = '' 
}: ConnectionStatusProps) {
  const [status, setStatus] = useState<ConnectionStatus>(globalConnectionStatus);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Subscribe to status changes
    const unsubscribe = subscribeToConnectionStatus((newStatus) => {
      setStatus(newStatus);
      // Show indicator if not connected
      setIsVisible(newStatus !== 'connected' && newStatus !== 'unknown');
    });

    // Start monitoring if not already started
    const stopMonitoring = startConnectionMonitoring();

    return () => {
      unsubscribe();
      stopMonitoring();
    };
  }, []);

  if (!showIndicator || !isVisible) {
    return null;
  }

  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          iconName: 'CheckCircle2' as const,
          color: COLORS.status.success,
          bgColor: COLORS.statusBg.success,
          borderColor: 'border-[var(--status-approved-border)]',
          message: 'Connected',
          description: 'Database connection is active'
        };
      case 'reconnecting':
        return {
          iconName: 'Loader2' as const,
          color: COLORS.status.warning,
          bgColor: COLORS.statusBg.warning,
          borderColor: 'border-[var(--status-pending-border)]',
          message: 'Reconnecting...',
          description: 'Attempting to restore database connection',
          animate: true
        };
      case 'disconnected':
        return {
          iconName: 'WifiOff' as const,
          color: COLORS.status.active,
          bgColor: COLORS.statusBg.active,
          borderColor: 'border-[var(--status-proposed-border)]',
          message: 'Disconnected',
          description: 'Database connection lost'
        };
      case 'error':
        return {
          iconName: 'AlertCircle' as const,
          color: COLORS.status.error,
          bgColor: COLORS.statusBg.error,
          borderColor: 'border-[var(--status-rejected-border)]',
          message: 'Connection Error',
          description: 'Unable to connect to database'
        };
      default:
        return {
          iconName: 'Wifi' as const,
          color: 'text-muted-foreground',
          bgColor: COLORS.bg.muted,
          borderColor: COLORS.border.standard,
          message: 'Unknown',
          description: 'Connection status unknown'
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div
      className={cn(RADIUS.panel, "fixed bottom-4 right-4 z-50 flex items-center gap-2 border px-3 py-2 shadow-lg", config.bgColor, config.borderColor, className)}
      role="status"
      aria-live="polite"
      aria-label={`Database connection: ${config.message}`}
    >
      <Icon
        name={config.iconName}
        forceDefault
        className={`h-4 w-4 ${config.color} ${config.animate ? 'animate-spin' : ''}`}
        aria-hidden="true"
      />
      <div className="flex flex-col">
        <span className={`text-sm font-medium ${config.color}`}>
          {config.message}
        </span>
        <span className="text-xs text-muted-foreground">
          {config.description}
        </span>
      </div>
    </div>
  );
}

/**
 * Connection Status Badge (smaller, inline version)
 */
export function ConnectionStatusBadge({ className = '' }: { className?: string }) {
  const [status, setStatus] = useState<ConnectionStatus>(globalConnectionStatus);

  useEffect(() => {
    const unsubscribe = subscribeToConnectionStatus(setStatus);
    const stopMonitoring = startConnectionMonitoring();
    return () => {
      unsubscribe();
      stopMonitoring();
    };
  }, []);

  if (status === 'connected' || status === 'unknown') {
    return null;
  }

  const getStatusConfig = () => {
    switch (status) {
      case 'reconnecting':
        return {
          iconName: 'Loader2' as const,
          color: COLORS.status.warning,
          message: 'Reconnecting...',
          animate: true
        };
      case 'disconnected':
        return {
          iconName: 'WifiOff' as const,
          color: COLORS.status.active,
          message: 'Disconnected'
        };
      case 'error':
        return {
          iconName: 'AlertCircle' as const,
          color: COLORS.status.error,
          message: 'Connection Error'
        };
      default:
        return null;
    }
  };

  const config = getStatusConfig();
  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${config.color} ${className}`}
      role="status"
      aria-label={`Database: ${config.message}`}
    >
      <Icon
        name={config.iconName}
        forceDefault
        className={`h-3 w-3 ${config.animate ? 'animate-spin' : ''}`}
        aria-hidden="true"
      />
      <span>{config.message}</span>
    </span>
  );
}

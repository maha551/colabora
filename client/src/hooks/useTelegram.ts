import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "../lib/logger";
import type {
  TelegramLinkTokenResponse,
  TelegramStatusResponse,
} from "../types/notifications";

export type TelegramDisplayStatus =
  | "loading"
  | "not_configured"
  | "not_linked"
  | "linked"
  | "linking";

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("authToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchTelegramStatus(): Promise<TelegramStatusResponse> {
  const response = await fetch("/api/notifications/telegram/status", {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch Telegram status");
  }
  return response.json();
}

export function useTelegram() {
  const [status, setStatus] = useState<TelegramStatusResponse | null>(null);
  const [botConfigured, setBotConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState(false);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    setLinking(false);
  }, []);

  const refresh =
    useCallback(async (): Promise<TelegramStatusResponse | null> => {
      const token = localStorage.getItem("authToken");
      if (!token) {
        setStatus(null);
        setLoading(false);
        return null;
      }

      try {
        const data = await fetchTelegramStatus();
        setStatus(data);
        if (data.linked) {
          stopPolling();
        }
        return data;
      } catch (error) {
        logger.error("Error refreshing Telegram status:", error);
        return null;
      } finally {
        setLoading(false);
      }
    }, [stopPolling]);

  useEffect(() => {
    void refresh();
    return () => {
      stopPolling();
    };
  }, [refresh, stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    setLinking(true);

    pollIntervalRef.current = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    pollTimeoutRef.current = setTimeout(() => {
      stopPolling();
    }, POLL_TIMEOUT_MS);
  }, [refresh, stopPolling]);

  const connect = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      const response = await fetch("/api/notifications/telegram/link-token", {
        method: "POST",
        headers: getAuthHeaders(),
      });

      if (response.status === 503) {
        setBotConfigured(false);
        return false;
      }

      if (!response.ok) {
        throw new Error("Failed to create Telegram link token");
      }

      setBotConfigured(true);
      const data: TelegramLinkTokenResponse = await response.json();
      window.open(data.deepLink, "_blank", "noopener,noreferrer");
      startPolling();
      return true;
    } catch (error) {
      logger.error("Error connecting Telegram:", error);
      throw error;
    } finally {
      setBusy(false);
    }
  }, [startPolling]);

  const disconnect = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      const response = await fetch("/api/notifications/telegram/disconnect", {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error("Failed to disconnect Telegram");
      }
      stopPolling();
      await refresh();
    } catch (error) {
      logger.error("Error disconnecting Telegram:", error);
      throw error;
    } finally {
      setBusy(false);
    }
  }, [refresh, stopPolling]);

  const displayStatus: TelegramDisplayStatus = (() => {
    if (loading) return "loading";
    if (botConfigured === false) return "not_configured";
    if (linking && !status?.linked) return "linking";
    if (status?.linked) return "linked";
    return "not_linked";
  })();

  return {
    status,
    displayStatus,
    loading,
    busy,
    linking,
    connect,
    disconnect,
    refresh,
  };
}

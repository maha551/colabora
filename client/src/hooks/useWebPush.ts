import { useCallback, useEffect, useState } from 'react';
import { logger } from '../lib/logger';
import type { PushSubscriptionPayload, PushSubscriptionStatus } from '../types/notifications';

export type WebPushDisplayStatus = 'unsupported' | 'blocked' | 'not_subscribed' | 'subscribed' | 'loading';

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function subscriptionToPayload(subscription: PushSubscription): PushSubscriptionPayload {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Invalid push subscription');
  }
  return {
    endpoint: json.endpoint,
    keys: {
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
  };
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Register the Colabora service worker at app bootstrap. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isWebPushSupported()) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (error) {
    logger.warn('Service worker registration failed:', error);
    return null;
  }
}

async function fetchVapidPublicKey(): Promise<{ enabled: boolean; publicKey: string | null }> {
  const response = await fetch('/api/notifications/push/vapid-public-key');
  if (!response.ok) {
    throw new Error('Failed to fetch VAPID public key');
  }
  return response.json();
}

async function fetchPushStatus(): Promise<PushSubscriptionStatus> {
  const response = await fetch('/api/notifications/push/status', {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error('Failed to fetch push status');
  }
  return response.json();
}

async function postSubscription(subscription: PushSubscription): Promise<void> {
  const response = await fetch('/api/notifications/push/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ subscription: subscriptionToPayload(subscription) }),
  });
  if (!response.ok) {
    throw new Error('Failed to register push subscription');
  }
}

async function deleteSubscription(endpoint: string): Promise<void> {
  const response = await fetch('/api/notifications/push/subscribe', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ endpoint }),
  });
  if (!response.ok) {
    throw new Error('Failed to revoke push subscription');
  }
}

export function useWebPush() {
  const supported = isWebPushSupported();
  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : 'denied'
  );
  const [vapidEnabled, setVapidEnabled] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<PushSubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!supported) {
      setLoading(false);
      return;
    }

    setPermission(Notification.permission);

    try {
      const vapid = await fetchVapidPublicKey();
      setVapidEnabled(vapid.enabled);
      setPublicKey(vapid.publicKey);

      const token = localStorage.getItem('authToken');
      if (token) {
        const status = await fetchPushStatus();
        setServerStatus(status);
      } else {
        setServerStatus(null);
      }
    } catch (error) {
      logger.error('Error refreshing web push state:', error);
    } finally {
      setLoading(false);
    }
  }, [supported]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const getLocalSubscription = useCallback(async (): Promise<PushSubscription | null> => {
    if (!supported) return null;
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
  }, [supported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported || !publicKey) {
      return false;
    }

    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result !== 'granted') {
        return false;
      }

      await registerServiceWorker();
      const registration = await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      await postSubscription(subscription);
      const status = await fetchPushStatus();
      setServerStatus(status);
      return true;
    } catch (error) {
      logger.error('Error subscribing to web push:', error);
      throw error;
    } finally {
      setBusy(false);
    }
  }, [supported, publicKey]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!supported) return;

    setBusy(true);
    try {
      const subscription = await getLocalSubscription();
      if (subscription) {
        await deleteSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      const status = await fetchPushStatus();
      setServerStatus(status);
    } catch (error) {
      logger.error('Error unsubscribing from web push:', error);
      throw error;
    } finally {
      setBusy(false);
    }
  }, [supported, getLocalSubscription]);

  const displayStatus: WebPushDisplayStatus = (() => {
    if (loading) return 'loading';
    if (!supported || !vapidEnabled) return 'unsupported';
    if (permission === 'denied') return 'blocked';
    if (serverStatus?.subscribed) return 'subscribed';
    return 'not_subscribed';
  })();

  return {
    supported,
    vapidEnabled,
    permission,
    serverStatus,
    displayStatus,
    loading,
    busy,
    subscribe,
    unsubscribe,
    refresh,
    getLocalSubscription,
  };
}

import { useEffect, useState } from 'react';
import { configApi } from '../lib/api/config';

let cachedPromise: Promise<boolean> | null = null;

function fetchVideoRoomCreationEnabled(): Promise<boolean> {
  if (!cachedPromise) {
    cachedPromise = configApi
      .getPublicConfig()
      .then((config) => config.videoRoomCreationEnabled)
      .catch(() => false);
  }
  return cachedPromise;
}

export function useVideoRoomCreationEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchVideoRoomCreationEnabled().then((value) => {
      if (!cancelled) setEnabled(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}

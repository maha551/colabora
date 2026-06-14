import { useEffect, useState } from 'react';
import { configApi, type PublicConfigResponse } from '../lib/api/config';

export type PublicSiteConfig = PublicConfigResponse;

let cachedConfig: PublicSiteConfig | null = null;
let fetchPromise: Promise<PublicSiteConfig> | null = null;

async function loadPublicConfig(): Promise<PublicSiteConfig> {
  if (cachedConfig) return cachedConfig;
  if (!fetchPromise) {
    fetchPromise = configApi.getPublicConfig().then((data) => {
      cachedConfig = data;
      return data;
    });
  }
  return fetchPromise;
}

export function usePublicConfig() {
  const [config, setConfig] = useState<PublicSiteConfig | null>(cachedConfig);
  const [loading, setLoading] = useState(!cachedConfig);

  useEffect(() => {
    let cancelled = false;
    void loadPublicConfig()
      .then((data) => {
        if (!cancelled) {
          setConfig(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { config, loading };
}

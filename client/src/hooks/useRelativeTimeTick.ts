import { useState, useEffect } from 'react';

const DEFAULT_INTERVAL_MS = 60_000;

/** Re-render consumers on an interval so relative time labels stay current. */
export function useRelativeTimeTick(intervalMs = DEFAULT_INTERVAL_MS): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

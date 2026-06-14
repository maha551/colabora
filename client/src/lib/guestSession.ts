const STORAGE_PREFIX = 'colabora_guest_poll_';

export interface GuestSessionData {
  sessionToken: string;
  displayName: string;
}

function storageKey(pollToken: string): string {
  return `${STORAGE_PREFIX}${pollToken}`;
}

export function loadGuestSession(pollToken: string): GuestSessionData | null {
  try {
    const raw = localStorage.getItem(storageKey(pollToken));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestSessionData;
    if (!parsed?.sessionToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGuestSession(pollToken: string, data: GuestSessionData): void {
  try {
    localStorage.setItem(storageKey(pollToken), JSON.stringify(data));
  } catch {
    // ignore quota errors
  }
}

export function clearGuestSession(pollToken: string): void {
  try {
    localStorage.removeItem(storageKey(pollToken));
  } catch {
    // ignore
  }
}

/**
 * Public info / legal page pathname routing.
 * Mounted at /info and /info/:slug — handled in App.tsx before auth gate.
 */

export const INFO_SLUGS = ['privacy', 'terms', 'imprint', 'about', 'contact'] as const;

export type InfoSlug = (typeof INFO_SLUGS)[number];

export type InfoPage = 'hub' | InfoSlug;

export type ParsedInfoPath =
  | { kind: 'hub' }
  | { kind: 'page'; slug: InfoSlug }
  | { kind: 'notFound' };

export function isInfoSlug(value: string): value is InfoSlug {
  return (INFO_SLUGS as readonly string[]).includes(value);
}

/**
 * Parse pathname into an info route, or null if not under /info.
 */
export function parseInfoPath(pathname: string): ParsedInfoPath | null {
  const normalized = (pathname || '').replace(/\/$/, '') || '/';
  if (normalized === '/info') {
    return { kind: 'hub' };
  }
  const match = normalized.match(/^\/info\/([^/]+)$/);
  if (!match) {
    return null;
  }
  const slug = match[1]!;
  if (isInfoSlug(slug)) {
    return { kind: 'page', slug };
  }
  return { kind: 'notFound' };
}

export function buildInfoPath(page: InfoPage): string {
  if (page === 'hub') return '/info';
  return `/info/${page}`;
}

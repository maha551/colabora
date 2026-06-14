import { describe, expect, it } from 'vitest';
import { buildInfoPath, isInfoSlug, parseInfoPath } from '../infoRoutes';

describe('infoRoutes', () => {
  it('parses hub path', () => {
    expect(parseInfoPath('/info')).toEqual({ kind: 'hub' });
    expect(parseInfoPath('/info/')).toEqual({ kind: 'hub' });
  });

  it('parses known slugs', () => {
    expect(parseInfoPath('/info/privacy')).toEqual({ kind: 'page', slug: 'privacy' });
    expect(parseInfoPath('/info/contact/')).toEqual({ kind: 'page', slug: 'contact' });
  });

  it('returns notFound for unknown slug under /info', () => {
    expect(parseInfoPath('/info/unknown-page')).toEqual({ kind: 'notFound' });
  });

  it('returns null for non-info paths', () => {
    expect(parseInfoPath('/')).toBeNull();
    expect(parseInfoPath('/activity')).toBeNull();
  });

  it('builds info paths', () => {
    expect(buildInfoPath('hub')).toBe('/info');
    expect(buildInfoPath('terms')).toBe('/info/terms');
  });

  it('validates slugs', () => {
    expect(isInfoSlug('privacy')).toBe(true);
    expect(isInfoSlug('foo')).toBe(false);
  });
});

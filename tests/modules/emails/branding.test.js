const { resolveAppBranding, resolveOrgBranding } = require('../../../server/emails/branding');

describe('email branding', () => {
  test('resolveAppBranding returns defaults', () => {
    const b = resolveAppBranding();
    expect(b.appName).toBe('Colabora');
    expect(b.primaryColor).toBe('#0969DA');
    expect(b.logoUrl).toMatch(/logo-light\.png$/);
  });

  test('resolveOrgBranding merges org fields', () => {
    const b = resolveOrgBranding({
      name: 'Acme',
      brandingColor: '#ff0000',
      brandingLogoUrl: 'https://example.com/logo.png',
      brandingTitle: 'Acme Co',
    });
    expect(b.primaryColor).toBe('#ff0000');
    expect(b.logoUrl).toBe('https://example.com/logo.png');
    expect(b.displayTitle).toBe('Acme Co');
    expect(b.fromName).toBe('Acme via Colabora');
    expect(b.orgName).toBe('Acme');
  });

  test('resolveOrgBranding falls back when org null', () => {
    const b = resolveOrgBranding(null);
    expect(b.fromName).toBe('Colabora');
  });
});

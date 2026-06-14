const { buildEmailHtml, buildEmailText } = require('../../../server/emails/layout');
const { resolveAppBranding } = require('../../../server/emails/branding');

describe('email layout', () => {
  test('buildEmailHtml includes preheader and CTA', () => {
    const html = buildEmailHtml({
      preheader: 'Test preheader',
      branding: resolveAppBranding(),
      heading: 'Test heading',
      bodyHtml: '<p>Body</p>',
      primaryCta: { href: 'https://example.com/go', label: 'Go' },
      locale: 'en',
    });
    expect(html).toContain('Test preheader');
    expect(html).toContain('Test heading');
    expect(html).toContain('https://example.com/go');
    expect(html).toContain('min-height: 44px');
  });

  test('buildEmailText mirrors content', () => {
    const text = buildEmailText({
      preheader: 'Preview',
      heading: 'Hello',
      bodyText: 'Welcome',
      primaryCta: { href: 'https://example.com', label: 'Open' },
      locale: 'en',
    });
    expect(text).toContain('Preview');
    expect(text).toContain('Welcome');
    expect(text).toContain('https://example.com');
  });
});

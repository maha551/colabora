const fs = require('fs');
const path = require('path');
const { t, resolveLocale, formatRelativeDeadline, localeFromUserRow } = require('../../../server/emails/i18n');

describe('email i18n', () => {
  test('locale bundles resolve from public or build output', () => {
    const publicBundle = path.join(__dirname, '../../../client/public/locales/en/emails.json');
    const buildBundle = path.join(__dirname, '../../../client/build/locales/en/emails.json');
    expect(fs.existsSync(publicBundle) || fs.existsSync(buildBundle)).toBe(true);
    expect(t('en', 'invitation.heading')).toBe("You're invited!");
    expect(t('en', 'common.hello')).toBe('Hello');
  });

  test('t interpolates variables', () => {
    const subject = t('en', 'invitation.subject', { orgName: 'Acme', role: 'member' });
    expect(subject).toContain('Acme');
    expect(subject).toContain('member');
  });

  test('resolveLocale falls back to en', () => {
    expect(resolveLocale({ preferences: { locale: 'de' } })).toBe('de');
    expect(resolveLocale({ preferences: { locale: 'invalid' } })).toBe('en');
    expect(resolveLocale(null)).toBe('en');
  });

  test('localeFromUserRow parses preferences JSON', () => {
    expect(localeFromUserRow({ preferences: '{"locale":"fr"}' })).toBe('fr');
    expect(localeFromUserRow({ preferences: { locale: 'es' } })).toBe('es');
  });

  test('formatRelativeDeadline returns string', () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const text = formatRelativeDeadline('en', future);
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });
});

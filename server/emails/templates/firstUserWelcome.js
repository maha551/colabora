const { buildEmailHtml, buildEmailText } = require('../layout');
const { t } = require('../i18n');
const urls = require('../urls');
const { resolveAppBranding } = require('../branding');
const { callout } = require('../components');

function render({ userName, locale = 'en' }) {
  const branding = resolveAppBranding();
  const dashboardUrl = urls.activity('first_user_welcome');
  const subject = t(locale, 'firstUserWelcome.subject');
  const preheader = t(locale, 'firstUserWelcome.preheader');

  const bodyHtml = `
    <p style="font-size: 16px; margin-top: 0;">${t(locale, 'common.helloName', { name: userName })},</p>
    <p style="font-size: 16px;">${t(locale, 'firstUserWelcome.body')}</p>
    ${callout({
      variant: 'info',
      html: `<strong>${t(locale, 'firstUserWelcome.expectTitle')}</strong><br>${t(locale, 'firstUserWelcome.expectBody')}`,
    })}
    ${callout({
      variant: 'warning',
      html: t(locale, 'firstUserWelcome.betaNote'),
    })}`;

  const bodyText = [
    t(locale, 'firstUserWelcome.body'),
    t(locale, 'firstUserWelcome.expectTitle'),
    t(locale, 'firstUserWelcome.expectBody'),
    t(locale, 'firstUserWelcome.betaNote'),
    t(locale, 'firstUserWelcome.earlyAdopter'),
  ].join('\n\n');

  return {
    subject,
    preheader,
    htmlContent: buildEmailHtml({
      preheader,
      branding,
      heading: t(locale, 'firstUserWelcome.heading'),
      bodyHtml,
      primaryCta: { href: dashboardUrl, label: t(locale, 'firstUserWelcome.cta') },
      locale,
      footerExtras: `<p style="font-size: 14px; color: #666; margin-top: 16px;">${t(locale, 'firstUserWelcome.earlyAdopter')}</p>`,
    }),
    textContent: buildEmailText({
      preheader,
      heading: t(locale, 'firstUserWelcome.heading'),
      bodyText,
      primaryCta: { href: dashboardUrl, label: t(locale, 'firstUserWelcome.cta') },
      locale,
    }),
  };
}

module.exports = { render };

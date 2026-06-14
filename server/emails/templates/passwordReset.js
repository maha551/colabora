const { buildEmailHtml, buildEmailText } = require('../layout');
const { t } = require('../i18n');
const urls = require('../urls');
const { resolveAppBranding } = require('../branding');
const { callout } = require('../components');

function render({ userName, resetToken, locale = 'en' }) {
  const branding = resolveAppBranding();
  const resetLink = urls.resetPassword(resetToken);
  const subject = t(locale, 'passwordReset.subject');
  const preheader = t(locale, 'passwordReset.preheader');

  const bodyHtml = `
    <p style="font-size: 16px; margin-top: 0;">${t(locale, 'common.helloName', { name: userName })},</p>
    <p style="font-size: 16px;">${t(locale, 'passwordReset.body')}</p>
    ${callout({
      variant: 'warning',
      html: `<strong>${t(locale, 'passwordReset.important')}</strong> ${t(locale, 'common.didNotRequest')}`,
    })}`;

  const bodyText = [
    t(locale, 'passwordReset.body'),
    t(locale, 'passwordReset.important'),
    t(locale, 'common.didNotRequest'),
  ].join('\n\n');

  return {
    subject,
    preheader,
    htmlContent: buildEmailHtml({
      preheader,
      branding,
      heading: t(locale, 'passwordReset.heading'),
      bodyHtml,
      primaryCta: { href: resetLink, label: t(locale, 'passwordReset.cta') },
      secondaryLink: { href: resetLink },
      locale,
    }),
    textContent: buildEmailText({
      preheader,
      heading: t(locale, 'passwordReset.heading'),
      bodyText,
      primaryCta: { href: resetLink, label: t(locale, 'passwordReset.cta') },
      secondaryLink: { href: resetLink },
      locale,
    }),
  };
}

module.exports = { render };

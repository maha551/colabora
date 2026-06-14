const { buildEmailHtml, buildEmailText } = require('../layout');
const { t } = require('../i18n');
const urls = require('../urls');
const { resolveAppBranding } = require('../branding');

function render({
  email,
  documentTitle,
  invitationToken,
  inviterName,
  locale = 'en',
}) {
  const branding = resolveAppBranding();
  const invitationLink = urls.register(invitationToken, email, 'document');
  const subject = t(locale, 'documentInvitation.subject', { documentTitle });
  const preheader = t(locale, 'documentInvitation.preheader', { inviterName });

  const bodyHtml = `
    <p style="font-size: 16px; margin-top: 0;">${t(locale, 'common.hello')},</p>
    <p style="font-size: 16px;">${t(locale, 'documentInvitation.body', { inviterName, documentTitle })}</p>
    <p style="font-size: 16px;">${t(locale, 'documentInvitation.description')}</p>
    <p style="font-size: 14px; color: #666; margin-top: 24px;">${t(locale, 'common.expiresIn7Days')} ${t(locale, 'common.ignoreIfUnexpected')}</p>`;

  const bodyText = [
    t(locale, 'documentInvitation.body', { inviterName, documentTitle }),
    t(locale, 'documentInvitation.description'),
    `${t(locale, 'documentInvitation.cta')}: ${invitationLink}`,
    t(locale, 'common.expiresIn7Days'),
  ].join('\n\n');

  return {
    subject,
    preheader,
    htmlContent: buildEmailHtml({
      preheader,
      branding,
      heading: t(locale, 'documentInvitation.heading'),
      bodyHtml,
      primaryCta: { href: invitationLink, label: t(locale, 'documentInvitation.cta') },
      secondaryLink: { href: invitationLink },
      locale,
    }),
    textContent: buildEmailText({
      preheader,
      heading: t(locale, 'documentInvitation.heading'),
      bodyText,
      primaryCta: { href: invitationLink, label: t(locale, 'documentInvitation.cta') },
      secondaryLink: { href: invitationLink },
      locale,
    }),
  };
}

module.exports = { render };

const { COLORS, TYPOGRAPHY, LAYOUT } = require('./tokens');
const { escapeHtml, headerColorForVariant, bulletproofButton } = require('./components');
const { t } = require('./i18n');
const urls = require('./urls');

/**
 * Build complete HTML email document.
 */
function buildEmailHtml({
  preheader,
  branding,
  headerVariant = 'default',
  heading,
  bodyHtml,
  primaryCta,
  secondaryLink,
  footerExtras,
  locale = 'en',
  showPreferencesLink = false,
}) {
  const b = branding || {};
  const headerColor = headerColorForVariant(headerVariant, b);
  const logoUrl = b.logoUrl;
  const logoAlt = b.useOrgBranding && b.orgName ? `${b.orgName} logo` : 'Colabora logo';

  const ctaHtml = primaryCta?.href && primaryCta?.label
    ? bulletproofButton({ href: primaryCta.href, label: primaryCta.label, color: b.primaryColor })
    : '';

  const secondaryHtml = secondaryLink?.href
    ? `
      <p style="font-size: ${TYPOGRAPHY.smallSize}; color: ${COLORS.textMuted}; margin-top: 24px; font-family: ${TYPOGRAPHY.fontFamily};">
        ${escapeHtml(secondaryLink.prefix || t(locale, 'common.copyLink'))}
      </p>
      <p style="font-size: ${TYPOGRAPHY.footerSize}; color: ${COLORS.textMuted}; word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 4px; font-family: ${TYPOGRAPHY.fontFamily};">
        <a href="${escapeHtml(secondaryLink.href)}" style="color: ${COLORS.link};">${escapeHtml(secondaryLink.href)}</a>
      </p>`
    : '';

  const prefsLink = showPreferencesLink
    ? `<p style="margin: 5px 0 0 0; font-family: ${TYPOGRAPHY.fontFamily};"><a href="${escapeHtml(urls.settings())}" style="color: ${COLORS.link};">${escapeHtml(t(locale, 'common.managePreferences'))}</a></p>`
    : '';

  const footerOrg = b.orgName
    ? t(locale, 'common.sentOnBehalfOf', { orgName: b.orgName })
    : t(locale, 'common.sentByColabora');

  const preheaderText = escapeHtml(preheader || '');

  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(heading || '')}</title>
  <style>
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; padding: 12px !important; }
      .email-body { padding: 20px !important; }
      .email-heading { font-size: 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${COLORS.canvas}; font-family: ${TYPOGRAPHY.fontFamily};">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">${preheaderText}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${COLORS.canvas};">
    <tr>
      <td align="center" style="padding: 20px 12px;" class="email-container">
        <table role="presentation" width="${LAYOUT.maxWidth}" cellspacing="0" cellpadding="0" border="0" style="max-width: ${LAYOUT.maxWidth}px; width: 100%;">
          <tr>
            <td style="background: ${headerColor}; padding: 24px 30px; text-align: center; border-radius: ${LAYOUT.borderRadius}px ${LAYOUT.borderRadius}px 0 0;">
              ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(logoAlt)}" width="48" height="48" style="display: block; margin: 0 auto 12px; max-height: 48px; width: auto;" />` : ''}
              <h1 class="email-heading" style="color: #ffffff; margin: 0; font-size: ${TYPOGRAPHY.headingSize}; font-family: ${TYPOGRAPHY.fontFamily};">${escapeHtml(heading || '')}</h1>
            </td>
          </tr>
          <tr>
            <td class="email-body" style="background: ${COLORS.card}; padding: 30px; border: 1px solid ${COLORS.border}; border-top: none; border-radius: 0 0 ${LAYOUT.borderRadius}px ${LAYOUT.borderRadius}px;">
              ${bodyHtml || ''}
              ${ctaHtml}
              ${secondaryHtml}
              ${footerExtras || ''}
            </td>
          </tr>
        </table>
        <table role="presentation" width="${LAYOUT.maxWidth}" cellspacing="0" cellpadding="0" border="0" style="max-width: ${LAYOUT.maxWidth}px; width: 100%;">
          <tr>
            <td style="text-align: center; padding: 20px; color: ${COLORS.textMuted}; font-size: ${TYPOGRAPHY.footerSize}; font-family: ${TYPOGRAPHY.fontFamily};">
              <p style="margin: 0;">${escapeHtml(t(locale, 'common.footerAutomated'))}</p>
              <p style="margin: 5px 0 0 0;">${escapeHtml(footerOrg)}</p>
              ${prefsLink}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildEmailText({
  preheader,
  heading,
  bodyText,
  primaryCta,
  secondaryLink,
  footerExtras,
  locale = 'en',
  showPreferencesLink = false,
}) {
  const lines = [];
  if (preheader) lines.push(preheader, '');
  if (heading) lines.push(heading, '');
  if (bodyText) lines.push(bodyText, '');
  if (primaryCta?.href && primaryCta?.label) {
    lines.push(`${primaryCta.label}: ${primaryCta.href}`, '');
  }
  if (secondaryLink?.href) {
    lines.push(`${secondaryLink.prefix || t(locale, 'common.copyLink')}: ${secondaryLink.href}`, '');
  }
  if (footerExtras) lines.push(footerExtras, '');
  lines.push(t(locale, 'common.footerAutomated'));
  if (showPreferencesLink) {
    lines.push(`${t(locale, 'common.managePreferences')}: ${urls.settings()}`);
  }
  return lines.join('\n').trim();
}

module.exports = {
  buildEmailHtml,
  buildEmailText,
};

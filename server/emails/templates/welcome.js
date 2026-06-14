const { buildEmailHtml, buildEmailText } = require('../layout');
const { t } = require('../i18n');
const urls = require('../urls');
const { resolveOrgBranding } = require('../branding');

function render({
  userName,
  organizationName,
  locale = 'en',
  org,
  organizationId,
}) {
  const branding = resolveOrgBranding(org || { name: organizationName });
  const dashboardUrl = organizationId
    ? urls.orgDashboard(organizationId, 'welcome')
    : urls.activity('welcome');
  const subject = t(locale, 'welcome.subject', { orgName: organizationName });
  const preheader = t(locale, 'welcome.preheader');

  const bodyHtml = `
    <p style="font-size: 16px; margin-top: 0;">${t(locale, 'common.helloName', { name: userName })},</p>
    <p style="font-size: 16px;">${t(locale, 'welcome.body', { orgName: organizationName })}</p>
    <p style="font-size: 16px;">${t(locale, 'welcome.description')}</p>`;

  const bodyText = [
    t(locale, 'welcome.body', { orgName: organizationName }),
    t(locale, 'welcome.description'),
  ].join('\n\n');

  return {
    subject,
    preheader,
    htmlContent: buildEmailHtml({
      preheader,
      branding,
      heading: t(locale, 'welcome.heading'),
      bodyHtml,
      primaryCta: { href: dashboardUrl, label: t(locale, 'welcome.cta') },
      locale,
    }),
    textContent: buildEmailText({
      preheader,
      heading: t(locale, 'welcome.heading'),
      bodyText,
      primaryCta: { href: dashboardUrl, label: t(locale, 'welcome.cta') },
      locale,
    }),
  };
}

module.exports = { render };

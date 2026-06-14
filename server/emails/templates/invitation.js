const { buildEmailHtml, buildEmailText } = require('../layout');
const { t } = require('../i18n');
const urls = require('../urls');
const { resolveOrgBranding } = require('../branding');

function render({
  email,
  organizationName,
  invitationToken,
  inviterName,
  invitationType = 'member',
  locale = 'en',
  org,
}) {
  const branding = resolveOrgBranding(org || { name: organizationName });
  const role = invitationType === 'representative'
    ? t(locale, 'invitation.roleRepresentative')
    : t(locale, 'invitation.roleMember');
  const roleDescription = invitationType === 'representative'
    ? t(locale, 'invitation.roleRepresentativeDescription')
    : t(locale, 'invitation.roleMemberDescription');
  const invitationLink = urls.register(invitationToken, email);
  const subject = t(locale, 'invitation.subject', { orgName: organizationName, role });
  const preheader = t(locale, 'invitation.preheader', { role });

  const bodyHtml = `
    <p style="font-size: 16px; margin-top: 0;">${t(locale, 'common.hello')},</p>
    <p style="font-size: 16px;">${t(locale, 'invitation.body', { inviterName, orgName: organizationName, role })}</p>
    <p style="font-size: 16px;">${roleDescription}</p>
    <p style="font-size: 14px; color: #666; margin-top: 24px;">${t(locale, 'common.expiresIn7Days')} ${t(locale, 'common.ignoreIfUnexpected')}</p>`;

  const bodyText = [
    t(locale, 'invitation.body', { inviterName, orgName: organizationName, role }),
    roleDescription,
    `${t(locale, 'invitation.cta')}: ${invitationLink}`,
    t(locale, 'common.expiresIn7Days'),
  ].join('\n\n');

  return {
    subject,
    preheader,
    htmlContent: buildEmailHtml({
      preheader,
      branding,
      heading: t(locale, 'invitation.heading'),
      bodyHtml,
      primaryCta: { href: invitationLink, label: t(locale, 'invitation.cta') },
      secondaryLink: { href: invitationLink },
      locale,
    }),
    textContent: buildEmailText({
      preheader,
      heading: t(locale, 'invitation.heading'),
      bodyText,
      primaryCta: { href: invitationLink, label: t(locale, 'invitation.cta') },
      secondaryLink: { href: invitationLink },
      locale,
    }),
  };
}

module.exports = { render };

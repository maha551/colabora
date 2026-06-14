const { buildEmailHtml, buildEmailText } = require('../layout');
const { t, formatDateTime } = require('../i18n');
const { resolveOrgBranding } = require('../branding');
const { callout } = require('../components');

function votingTypeKey(votingType) {
  const map = {
    document: 'votingStarted.typeDocument',
    rule_proposal: 'votingStarted.typeRuleProposal',
    election: 'votingStarted.typeElection',
    scheduling_poll: 'votingStarted.typeSchedulingPoll',
  };
  return map[votingType] || 'votingStarted.typeDefault';
}

function render({ eventData, locale = 'en' }) {
  const { title, votingDeadline, participationDeadline, link, organizationName, votingType } = eventData;
  const deadline = votingDeadline || participationDeadline;
  const branding = resolveOrgBranding(organizationName ? { name: organizationName } : null);
  const votingTypeText = t(locale, votingTypeKey(votingType));
  const formattedDate = formatDateTime(locale, deadline);
  const orgSuffix = organizationName
    ? t(locale, 'votingStarted.orgIn', { orgName: organizationName })
    : '';
  const subject = t(locale, 'votingStarted.subject', { title });
  const preheader = t(locale, 'votingStarted.preheader', { deadline: formattedDate });

  const bodyHtml = `
    <p style="font-size: 16px; margin-top: 0;">${t(locale, 'common.hello')},</p>
    <p style="font-size: 16px;">${t(locale, 'votingStarted.body', { votingType: votingTypeText, title, orgSuffix })}</p>
    ${callout({
      variant: 'voting',
      html: `<strong>${t(locale, 'votingStarted.deadlineLabel')}:</strong> ${formattedDate}`,
    })}
    <p style="font-size: 16px;">${t(locale, 'votingStarted.participation')}</p>`;

  const bodyText = [
    t(locale, 'votingStarted.body', { votingType: votingTypeText, title, orgSuffix }),
    `${t(locale, 'votingStarted.deadlineLabel')}: ${formattedDate}`,
    t(locale, 'votingStarted.participation'),
  ].join('\n\n');

  return {
    subject,
    preheader,
    htmlContent: buildEmailHtml({
      preheader,
      branding,
      headerVariant: 'voting',
      heading: t(locale, 'votingStarted.heading'),
      bodyHtml,
      primaryCta: { href: link, label: t(locale, 'votingStarted.cta') },
      locale,
    }),
    textContent: buildEmailText({
      preheader,
      heading: t(locale, 'votingStarted.heading'),
      bodyText,
      primaryCta: { href: link, label: t(locale, 'votingStarted.cta') },
      locale,
    }),
  };
}

module.exports = { render, votingTypeKey };

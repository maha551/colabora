const { buildEmailHtml, buildEmailText } = require('../layout');
const { t, formatDateTime } = require('../i18n');
const { resolveOrgBranding } = require('../branding');
const { callout } = require('../components');

function deadlineTypeKey(deadlineType) {
  const map = {
    voting: 'deadlineReminder.typeVoting',
    rule_proposal: 'deadlineReminder.typeRuleProposal',
    election_voting: 'deadlineReminder.typeElectionVoting',
    election_nomination: 'deadlineReminder.typeElectionNomination',
    scheduling_poll: 'deadlineReminder.typeSchedulingPoll',
  };
  return map[deadlineType] || 'deadlineReminder.typeDefault';
}

function render({ eventData, locale = 'en' }) {
  const { title, deadline, deadlineType, link, organizationName } = eventData;
  const branding = resolveOrgBranding(organizationName ? { name: organizationName } : null);
  const deadlineTypeText = t(locale, deadlineTypeKey(deadlineType));
  const formattedDate = formatDateTime(locale, deadline);
  const orgSuffix = organizationName
    ? t(locale, 'deadlineReminder.orgIn', { orgName: organizationName })
    : '';
  const subject = t(locale, 'deadlineReminder.subject', { title, deadlineType: deadlineTypeText });
  const preheader = t(locale, 'deadlineReminder.preheader', { deadline: formattedDate });

  const bodyHtml = `
    <p style="font-size: 16px; margin-top: 0;">${t(locale, 'common.hello')},</p>
    <p style="font-size: 16px;">${t(locale, 'deadlineReminder.body', { deadlineType: deadlineTypeText, title, orgSuffix })}</p>
    ${callout({
      variant: 'deadline',
      html: `<strong>${t(locale, 'deadlineReminder.deadlineLabel')}:</strong> ${formattedDate}`,
    })}
    <p style="font-size: 16px;">${t(locale, 'deadlineReminder.action')}</p>`;

  const bodyText = [
    t(locale, 'deadlineReminder.body', { deadlineType: deadlineTypeText, title, orgSuffix }),
    `${t(locale, 'deadlineReminder.deadlineLabel')}: ${formattedDate}`,
    t(locale, 'deadlineReminder.action'),
  ].join('\n\n');

  return {
    subject,
    preheader,
    htmlContent: buildEmailHtml({
      preheader,
      branding,
      headerVariant: 'deadline',
      heading: t(locale, 'deadlineReminder.heading'),
      bodyHtml,
      primaryCta: { href: link, label: t(locale, 'deadlineReminder.cta') },
      locale,
    }),
    textContent: buildEmailText({
      preheader,
      heading: t(locale, 'deadlineReminder.heading'),
      bodyText,
      primaryCta: { href: link, label: t(locale, 'deadlineReminder.cta') },
      locale,
    }),
  };
}

module.exports = { render, deadlineTypeKey };

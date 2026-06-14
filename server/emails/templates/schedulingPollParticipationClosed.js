const { buildEmailHtml, buildEmailText } = require('../layout');
const { t, formatDateTime } = require('../i18n');
const { resolveOrgBranding } = require('../branding');
const { callout } = require('../components');

function render({ eventData, locale = 'en' }) {
  const {
    title,
    participationSummary,
    suggestedSlot,
    closedReason,
    link,
    organizationName
  } = eventData;
  const branding = resolveOrgBranding(organizationName ? { name: organizationName } : null);
  const orgSuffix = organizationName
    ? t(locale, 'schedulingPollParticipationClosed.orgIn', { orgName: organizationName })
    : '';
  const reasonKey = closedReason === 'manual'
    ? 'schedulingPollParticipationClosed.reasonManual'
    : 'schedulingPollParticipationClosed.reasonDeadline';
  const reasonText = t(locale, reasonKey);
  const subject = t(locale, 'schedulingPollParticipationClosed.subject', { title });
  const preheader = t(locale, 'schedulingPollParticipationClosed.preheader', { reason: reasonText });

  const summary = participationSummary || {};
  const summaryLine = t(locale, 'schedulingPollParticipationClosed.summary', {
    responded: summary.respondedCount ?? 0,
    total: summary.memberCount ?? 0,
    guests: summary.guestCount ?? 0
  });

  let suggestedHtml = '';
  let suggestedText = '';
  if (suggestedSlot?.startAt) {
    const slotDate = formatDateTime(locale, suggestedSlot.startAt);
    suggestedHtml = callout({
      variant: 'info',
      html: `<strong>${t(locale, 'schedulingPollParticipationClosed.suggestedSlot')}:</strong> ${slotDate} (${suggestedSlot.yesCount ?? 0} ${t(locale, 'schedulingPollParticipationClosed.yesVotes')})`
    });
    suggestedText = `${t(locale, 'schedulingPollParticipationClosed.suggestedSlot')}: ${slotDate}`;
  }

  const bodyHtml = `
    <p style="font-size: 16px; margin-top: 0;">${t(locale, 'common.hello')},</p>
    <p style="font-size: 16px;">${t(locale, 'schedulingPollParticipationClosed.body', { title, orgSuffix, reason: reasonText })}</p>
    ${callout({ variant: 'deadline', html: summaryLine })}
    ${suggestedHtml}
    <p style="font-size: 16px;">${t(locale, 'schedulingPollParticipationClosed.action')}</p>`;

  const bodyText = [
    t(locale, 'schedulingPollParticipationClosed.body', { title, orgSuffix, reason: reasonText }),
    summaryLine,
    suggestedText,
    t(locale, 'schedulingPollParticipationClosed.action'),
  ].filter(Boolean).join('\n\n');

  return {
    subject,
    preheader,
    htmlContent: buildEmailHtml({
      preheader,
      branding,
      headerVariant: 'deadline',
      heading: t(locale, 'schedulingPollParticipationClosed.heading'),
      bodyHtml,
      primaryCta: { href: link, label: t(locale, 'schedulingPollParticipationClosed.cta') },
      locale,
    }),
    textContent: buildEmailText({
      preheader,
      heading: t(locale, 'schedulingPollParticipationClosed.heading'),
      bodyText,
      primaryCta: { href: link, label: t(locale, 'schedulingPollParticipationClosed.cta') },
      locale,
    }),
  };
}

module.exports = { render };

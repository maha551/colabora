const { buildEmailHtml, buildEmailText } = require('../layout');
const { t } = require('../i18n');
const { resolveAppBranding } = require('../branding');
const { callout, escapeHtml } = require('../components');

function render({
  proposerName,
  representativeName,
  itemTitle,
  itemType,
  reason,
  locale = 'en',
}) {
  const branding = resolveAppBranding();
  const isVote = itemType === 'organization_vote';
  const subject = t(locale, isVote ? 'representativeRejection.subjectVote' : 'representativeRejection.subjectProposal');
  const preheader = t(locale, 'representativeRejection.preheader', { representativeName });
  const bodyKey = isVote ? 'representativeRejection.bodyVote' : 'representativeRejection.bodyProposal';
  const safeReason = escapeHtml(reason || '').replace(/\n/g, '<br>');

  const bodyHtml = `
    <p style="font-size: 16px; margin-top: 0;">${t(locale, 'common.helloName', { name: proposerName })},</p>
    <p style="font-size: 16px;">${t(locale, bodyKey, { itemTitle })}</p>
    <p style="font-size: 16px;"><strong>${t(locale, 'representativeRejection.representative')}:</strong> ${escapeHtml(representativeName)}</p>
    ${callout({
      variant: 'danger',
      html: `<strong>${t(locale, 'representativeRejection.reason')}:</strong><br>${safeReason}`,
    })}
    <p style="font-size: 14px; color: #666;">${t(locale, 'representativeRejection.retry')}</p>`;

  const bodyText = [
    t(locale, bodyKey, { itemTitle }),
    `${t(locale, 'representativeRejection.representative')}: ${representativeName}`,
    `${t(locale, 'representativeRejection.reason')}:\n${reason || ''}`,
    t(locale, 'representativeRejection.retry'),
  ].join('\n\n');

  return {
    subject,
    preheader,
    htmlContent: buildEmailHtml({
      preheader,
      branding,
      headerVariant: 'danger',
      heading: t(locale, 'representativeRejection.heading'),
      bodyHtml,
      locale,
    }),
    textContent: buildEmailText({
      preheader,
      heading: t(locale, 'representativeRejection.heading'),
      bodyText,
      locale,
    }),
  };
}

module.exports = { render };

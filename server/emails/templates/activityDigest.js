const { buildEmailHtml, buildEmailText } = require('../layout');
const { t } = require('../i18n');
const urls = require('../urls');
const { resolveAppBranding } = require('../branding');
const { digestItem, digestSection } = require('../components');

function groupEvents(events) {
  const grouped = {
    proposals: [],
    documents: [],
    rule_proposals: [],
    elections: [],
    status_changes: [],
    other: [],
  };
  events.forEach((event) => {
    if (event.type === 'proposal_created') grouped.proposals.push(event);
    else if (event.type === 'document_created') grouped.documents.push(event);
    else if (event.type === 'rule_proposal_created' || event.type === 'rule_proposal_approved' || event.type === 'rule_proposal_rejected') {
      grouped.rule_proposals.push(event);
    } else if (event.type === 'election_created' || event.type === 'election_completed') {
      grouped.elections.push(event);
    } else if (event.type === 'document_status_changed') grouped.status_changes.push(event);
    else grouped.other.push(event);
  });
  return grouped;
}

function renderSection(locale, events, titleKey, branding) {
  if (!events.length) return '';
  const itemsHtml = events.map((e) => {
    const orgSuffix = e.organizationName ? ` · ${e.organizationName}` : '';
    return digestItem({
      title: e.title || t(locale, 'activityDigest.untitled'),
      meta: e.message ? `${e.message}${orgSuffix}` : orgSuffix.replace(/^ · /, ''),
      link: e.link,
      linkLabel: t(locale, 'common.viewArrow'),
      linkColor: branding.primaryColor,
    });
  }).join('');
  return digestSection({
    title: t(locale, titleKey),
    count: events.length,
    itemsHtml,
  });
}

function render({ events, frequency, locale = 'en' }) {
  const branding = resolveAppBranding();
  const isWeekly = frequency === 'weekly';
  const subject = t(locale, isWeekly ? 'activityDigest.subjectWeekly' : 'activityDigest.subjectMonthly');
  const preheader = t(locale, 'activityDigest.preheader', {
    period: t(locale, isWeekly ? 'activityDigest.periodWeekly' : 'activityDigest.periodMonthly'),
  });
  const grouped = groupEvents(events || []);
  const htmlSections =
    renderSection(locale, grouped.proposals, 'activityDigest.sectionProposals', branding) +
    renderSection(locale, grouped.documents, 'activityDigest.sectionDocuments', branding) +
    renderSection(locale, grouped.rule_proposals, 'activityDigest.sectionRuleProposals', branding) +
    renderSection(locale, grouped.elections, 'activityDigest.sectionElections', branding) +
    renderSection(locale, grouped.status_changes, 'activityDigest.sectionStatus', branding);

  const dashboardUrl = urls.activity(isWeekly ? 'weekly_digest' : 'monthly_digest');
  const period = t(locale, isWeekly ? 'activityDigest.periodWeekly' : 'activityDigest.periodMonthly');

  const bodyHtml = `
    <p style="font-size: 16px; margin-top: 0;">${t(locale, 'common.hello')},</p>
    <p style="font-size: 16px;">${t(locale, 'activityDigest.intro', { period })}</p>
    ${htmlSections || `<p style="font-size: 16px; color: #666;">${t(locale, 'common.noActivity')}</p>`}
    <p style="font-size: 14px; color: #666; margin-top: 16px;">${t(locale, 'activityDigest.prefsNote')}</p>`;

  const textLines = (events || []).map(
    (e) => `- ${e.title || e.type}: ${e.message || ''}${e.organizationName ? ` (${e.organizationName})` : ''}${e.link ? ` (${e.link})` : ''}`
  );

  const bodyText = [
    t(locale, 'activityDigest.intro', { period }),
    ...textLines,
    t(locale, 'activityDigest.prefsNote'),
  ].join('\n');

  return {
    subject,
    preheader,
    htmlContent: buildEmailHtml({
      preheader,
      branding,
      heading: t(locale, isWeekly ? 'activityDigest.headingWeekly' : 'activityDigest.headingMonthly'),
      bodyHtml,
      primaryCta: { href: dashboardUrl, label: t(locale, 'activityDigest.cta') },
      locale,
      showPreferencesLink: true,
    }),
    textContent: buildEmailText({
      preheader,
      heading: t(locale, isWeekly ? 'activityDigest.headingWeekly' : 'activityDigest.headingMonthly'),
      bodyText,
      primaryCta: { href: dashboardUrl, label: t(locale, 'activityDigest.cta') },
      locale,
      showPreferencesLink: true,
    }),
  };
}

module.exports = { render, groupEvents };

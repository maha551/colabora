const { buildEmailHtml, buildEmailText } = require('../layout');
const { t, formatRelativeDeadline } = require('../i18n');
const urls = require('../urls');
const { resolveAppBranding } = require('../branding');
const { digestItem, digestSection, callout } = require('../components');

const CAP_PER_SECTION = 5;

function renderSection(locale, items, titleKey, ctaKey, branding) {
  if (!items || items.length === 0) return { html: '', textLines: [] };
  const visible = items.slice(0, CAP_PER_SECTION);
  const overflow = items.length - CAP_PER_SECTION;
  const overflowOrgId = overflow > 0
    ? (items[CAP_PER_SECTION]?.organizationId || visible[visible.length - 1]?.organizationId)
    : null;
  const overflowOrg = overflow > 0
    ? (items[CAP_PER_SECTION]?.organizationName || visible[visible.length - 1]?.organizationName)
    : null;
  const moreLink = overflowOrgId ? urls.orgTab(overflowOrgId, 'dashboard') : urls.activity('deadlines_digest');

  const itemsHtml = visible.map((item) => {
    const meta = `${formatRelativeDeadline(locale, item.deadline)}${item.organizationName ? ` · ${item.organizationName}` : ''}`;
    return digestItem({
      title: item.title || t(locale, 'activityDigest.untitled'),
      meta,
      link: item.link,
      linkLabel: `${t(locale, ctaKey)} →`,
      linkColor: branding.primaryColor,
    });
  }).join('');

  const orgSuffix = overflowOrg ? ` in ${overflowOrg}` : '';
  const overflowHtml = overflow > 0
    ? `<p style="margin: 8px 0 0 0; font-size: 14px; color: #666;">${t(locale, 'common.andMore', { count: overflow, orgSuffix })} <a href="${moreLink}" style="color: ${branding.primaryColor};">${t(locale, 'common.viewAll')}</a></p>`
    : '';

  const textLines = visible.map(
    (item) => `  - ${item.title || t(locale, 'activityDigest.untitled')}: ${formatRelativeDeadline(locale, item.deadline)}${item.organizationName ? ` (${item.organizationName})` : ''} – ${item.link}`
  );
  if (overflow > 0) textLines.push(`  ${t(locale, 'common.andMore', { count: overflow, orgSuffix })}`);

  return {
    html: digestSection({
      title: t(locale, titleKey),
      count: items.length,
      itemsHtml,
      overflowHtml,
    }),
    textLines: [t(locale, titleKey) + ':', ...textLines],
  };
}

function render(sections, options = {}) {
  const { userName, primaryOrgName, locale = 'en' } = options;
  const docs = sections.documentsVoting || [];
  const rules = sections.ruleProposals || [];
  const electionV = sections.electionVoting || [];
  const electionN = sections.electionNomination || [];
  const schedulingPolls = sections.schedulingPolls || [];
  const total = docs.length + rules.length + electionV.length + electionN.length + schedulingPolls.length;

  if (total === 0) {
    return { subject: '', htmlContent: '', textContent: '', preheader: '' };
  }

  const branding = resolveAppBranding();
  let subject;
  if (total === 1) {
    subject = t(locale, 'deadlinesDigest.subjectOne');
  } else if (primaryOrgName) {
    subject = t(locale, 'deadlinesDigest.subjectManyOrg', { count: total, orgName: primaryOrgName });
  } else {
    subject = t(locale, 'deadlinesDigest.subjectMany', { count: total });
  }
  const preheader = t(locale, 'deadlinesDigest.preheader');
  const greeting = userName ? t(locale, 'common.helloName', { name: userName }) : t(locale, 'common.hello');

  const allItems = [...docs, ...rules, ...electionV, ...electionN, ...schedulingPolls]
    .map((item) => ({ ...item, _at: new Date(item.deadline).getTime() }));
  allItems.sort((a, b) => a._at - b._at);
  const firstItem = allItems[0];

  const firstCalloutHtml = firstItem
    ? callout({
      variant: 'deadline',
      html: `<strong>${t(locale, 'deadlinesDigest.firstDeadline')}:</strong> <a href="${firstItem.link}" style="color: #92400e;">${firstItem.title || t(locale, 'activityDigest.untitled')}</a> – ${formatRelativeDeadline(locale, firstItem.deadline)}${firstItem.organizationName ? ` in ${firstItem.organizationName}` : ''}<br><a href="${firstItem.link}" style="color: ${branding.primaryColor}; font-weight: 600;">${t(locale, 'common.open')} →</a>`,
    })
    : '';

  const s1 = renderSection(locale, docs, 'deadlinesDigest.sectionDocuments', 'common.vote', branding);
  const s2 = renderSection(locale, rules, 'deadlinesDigest.sectionRules', 'common.viewAndVote', branding);
  const s3 = renderSection(locale, electionV, 'deadlinesDigest.sectionElectionVoting', 'common.vote', branding);
  const s4 = renderSection(locale, electionN, 'deadlinesDigest.sectionElectionNomination', 'common.nominate', branding);
  const s5 = renderSection(locale, schedulingPolls, 'deadlinesDigest.sectionSchedulingPolls', 'common.respond', branding);

  const dashboardUrl = urls.activity('deadlines_digest');
  const bodyHtml = `
    <p style="font-size: 16px; margin-top: 0;">${greeting}</p>
    <p style="font-size: 16px;">${t(locale, 'deadlinesDigest.intro')}</p>
    ${firstCalloutHtml}
    ${s1.html}${s2.html}${s3.html}${s4.html}${s5.html}
    <p style="font-size: 14px; color: #666; margin-top: 16px;">${t(locale, 'deadlinesDigest.prefsNote')}</p>`;

  const textContent = [
    subject,
    '',
    preheader,
    '',
    greeting,
    t(locale, 'deadlinesDigest.intro'),
    '',
    ...s1.textLines,
    ...s2.textLines,
    ...s3.textLines,
    ...s4.textLines,
    ...s5.textLines,
    '',
    `${t(locale, 'common.viewDashboard')}: ${dashboardUrl}`,
    '',
    t(locale, 'deadlinesDigest.prefsNote'),
    `${t(locale, 'common.managePreferences')}: ${urls.settings()}`,
  ].join('\n');

  return {
    subject,
    preheader,
    htmlContent: buildEmailHtml({
      preheader,
      branding,
      headerVariant: 'deadline',
      heading: t(locale, 'deadlinesDigest.heading'),
      bodyHtml,
      primaryCta: { href: dashboardUrl, label: t(locale, 'common.viewDashboard') },
      locale,
      showPreferencesLink: true,
    }),
    textContent: buildEmailText({
      preheader,
      heading: t(locale, 'deadlinesDigest.heading'),
      bodyText: textContent,
      primaryCta: { href: dashboardUrl, label: t(locale, 'common.viewDashboard') },
      locale,
      showPreferencesLink: true,
    }),
  };
}

module.exports = { render, CAP_PER_SECTION };

/**
 * Shared notification content renderer for push, telegram, and other plain-text channels.
 * Reuses email i18n keys where possible; short-form copy lives in notifications.json.
 */

const config = require('../config');
const urls = require('../emails/urls');
const { t, tn, formatShortDateTime } = require('../emails/i18n');
const { votingTypeKey } = require('../emails/templates/votingStarted');
const { deadlineTypeKey } = require('../emails/templates/deadlineReminder');

const IMMEDIATE_EVENT_TYPES = [
  'voting_deadline_approaching',
  'voting_started',
  'rule_proposal_deadline_approaching',
  'election_deadline_approaching',
  'election_nomination_deadline_approaching',
  'scheduling_poll_opened',
  'scheduling_poll_participation_closed',
  'scheduling_poll_deadline_approaching',
];

const DEADLINE_EVENT_TYPE_MAP = {
  voting_deadline_approaching: 'voting',
  rule_proposal_deadline_approaching: 'rule_proposal',
  election_deadline_approaching: 'election_voting',
  election_nomination_deadline_approaching: 'election_nomination',
  scheduling_poll_deadline_approaching: 'scheduling_poll',
};

function resolveTitle(eventData, locale) {
  return eventData.title || t(locale, 'activityDigest.untitled');
}

function resolveLink(eventData) {
  if (typeof eventData.link === 'string' && eventData.link) {
    return eventData.link;
  }
  return urls.appRoot();
}

function orgSuffix(locale, organizationName, keyPrefix) {
  return organizationName
    ? t(locale, `${keyPrefix}.orgIn`, { orgName: organizationName })
    : '';
}

function renderDigestSummary(eventData, locale) {
  const events = Array.isArray(eventData.events) ? eventData.events : [];
  const count = events.length;
  const frequency = eventData.frequency === 'weekly' ? 'weekly' : 'monthly';
  const frequencyLabel = tn(locale, `digest.frequency.${frequency}`) || frequency;
  const vars = { count, frequency: frequencyLabel };
  const subject = tn(locale, 'digest.subject', vars) || `${count} updates — ${frequencyLabel} digest`;
  const title = tn(locale, 'digest.title', vars) || subject;
  const body = tn(locale, 'digest.body', vars)
    || `You have ${count} new updates. Open your activity digest to review.`;
  const url = urls.activity(frequency === 'weekly' ? 'weekly_digest' : 'monthly_digest');

  return {
    subject,
    title,
    body,
    url,
    locale,
    eventType: 'digest_summary',
  };
}

function renderVotingStarted(eventData, locale, eventType = 'voting_started') {
  const title = resolveTitle(eventData, locale);
  const votingTypeText = t(locale, votingTypeKey(eventData.votingType));
  const deadline = eventData.votingDeadline
    ? formatShortDateTime(locale, eventData.votingDeadline)
    : '';
  const suffix = orgSuffix(locale, eventData.organizationName, 'votingStarted');
  const subject = t(locale, 'votingStarted.subject', { title });
  const body = tn(locale, 'immediate.votingStarted.body', {
    votingType: votingTypeText,
    title,
    orgSuffix: suffix,
    deadline,
  }) || [
    t(locale, 'votingStarted.body', { votingType: votingTypeText, title, orgSuffix: suffix }),
    deadline ? `${t(locale, 'votingStarted.deadlineLabel')}: ${deadline}` : '',
  ].filter(Boolean).join(' ');

  return {
    subject,
    title: subject,
    body,
    url: resolveLink(eventData),
    locale,
    eventType,
  };
}

function renderDeadlineApproaching(eventType, eventData, locale) {
  const title = resolveTitle(eventData, locale);
  const deadlineType = eventData.deadlineType || DEADLINE_EVENT_TYPE_MAP[eventType];
  const deadlineTypeText = t(locale, deadlineTypeKey(deadlineType));
  const formattedDeadline = eventData.deadline
    ? formatShortDateTime(locale, eventData.deadline)
    : '';
  const suffix = orgSuffix(locale, eventData.organizationName, 'deadlineReminder');
  const subject = t(locale, 'deadlineReminder.subject', { title, deadlineType: deadlineTypeText });
  const body = tn(locale, 'immediate.deadlineApproaching.body', {
    deadlineType: deadlineTypeText,
    title,
    orgSuffix: suffix,
    deadline: formattedDeadline,
  }) || [
    t(locale, 'deadlineReminder.body', { deadlineType: deadlineTypeText, title, orgSuffix: suffix }),
    formattedDeadline ? `${t(locale, 'deadlineReminder.deadlineLabel')}: ${formattedDeadline}` : '',
  ].filter(Boolean).join(' ');

  return {
    subject,
    title: subject,
    body,
    url: resolveLink(eventData),
    locale,
    eventType,
  };
}

function renderFallbackImmediate(eventType, eventData, locale) {
  const appName = config.APP_NAME || 'Colabora';
  const title = eventData.title || eventType.replace(/_/g, ' ');
  const body = eventData.message
    || eventData.description
    || tn(locale, 'fallback.body', { appName })
    || `You have a new notification from ${appName}.`;

  return {
    subject: title,
    title,
    body,
    url: resolveLink(eventData),
    locale,
    eventType,
  };
}

function renderImmediate(eventType, eventData, locale) {
  if (eventType === 'voting_started' || eventType === 'scheduling_poll_opened') {
    return renderVotingStarted({
      ...eventData,
      votingType: eventType === 'scheduling_poll_opened' ? 'scheduling_poll' : eventData.votingType,
      votingDeadline: eventData.votingDeadline || eventData.participationDeadline,
    }, locale, eventType);
  }
  if (DEADLINE_EVENT_TYPE_MAP[eventType]) {
    return renderDeadlineApproaching(eventType, eventData, locale);
  }
  if (IMMEDIATE_EVENT_TYPES.includes(eventType)) {
    return renderFallbackImmediate(eventType, eventData, locale);
  }
  return renderFallbackImmediate(eventType, eventData, locale);
}

/**
 * @param {string} eventType
 * @param {object} eventData
 * @param {string} [locale='en']
 * @param {'plain'|'html'} [_format='plain']
 * @param {'immediate'|'digest'} [kind='immediate']
 * @returns {{ subject: string, title: string, body: string, url: string, locale: string, eventType: string }}
 */
function renderNotificationContent(eventType, eventData = {}, locale = 'en', _format = 'plain', kind = 'immediate') {
  if (kind === 'digest' || eventType === 'digest_summary') {
    return renderDigestSummary(eventData, locale);
  }
  return renderImmediate(eventType, eventData, locale);
}

module.exports = {
  renderNotificationContent,
  DEADLINE_EVENT_TYPE_MAP,
  IMMEDIATE_EVENT_TYPES,
};

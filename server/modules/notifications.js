/**
 * Notification Service Module
 * Handles notification preferences, digest queueing, and notification sending
 */

const { v4: uuidv4 } = require('uuid');
const { logger } = require('../middleware/logger');
const { formatDeadlinesApproachingDigest, sendDeadlinesDigestEmail } = require('./emailService');
const urls = require('../emails/urls');
const { localeFromUserRow } = require('../emails/i18n');
const TransactionManager = require('../database/services/TransactionManager');
const {
  dispatchImmediate,
  dispatchDigest,
  readChannelPreferences,
  getDefaultChannelPreferences,
  parseChannelPreferencesJson,
  channelPreferencesFromLegacyRow,
} = require('./notificationChannels');
const { getAllChannels } = require('./notificationChannels/registry');

// Event types that require immediate notification
const IMMEDIATE_EVENT_TYPES = [
  'voting_deadline_approaching',
  'voting_started',
  'rule_proposal_deadline_approaching',
  'election_deadline_approaching',
  'election_nomination_deadline_approaching'
];

// Event types that go to digest
const DIGEST_EVENT_TYPES = [
  'proposal_created',
  'document_status_changed',
  'rule_proposal_created',
  'rule_proposal_approved',
  'rule_proposal_rejected',
  'election_created',
  'election_completed',
  'document_created',
  'comment_added'
];

/**
 * @param {import('./notificationChannels/types').ChannelPreferencesMap} channelPrefs
 * @param {'immediate'|'digest'} kind
 * @returns {boolean}
 */
function anyChannelCanDeliver(channelPrefs, kind) {
  return getAllChannels().some(
    (channel) => channel.isConfigured() && channel.canDeliver(channelPrefs, kind)
  );
}

/**
 * @param {import('./notificationChannels/types').ChannelPreferencesMap} channelPrefs
 * @returns {boolean}
 */
function anyChannelWantsDigest(channelPrefs) {
  return anyChannelCanDeliver(channelPrefs, 'digest');
}

/**
 * Get user notification preferences
 * @param {Object} db - Database instance
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User preferences
 */
async function getNotificationPreferences(knex, userId) {
  try {
    let row;
    try {
      row = await TransactionManager.query(knex, `
        SELECT 
          email_enabled,
          immediate_notifications_enabled,
          digest_frequency,
          digest_last_sent,
          deadline_digest_last_sent,
          channel_preferences
        FROM notification_preferences
        WHERE user_id = ?
      `, [userId]);
    } catch (colErr) {
      if (colErr.message && (colErr.message.includes('no such column') || colErr.message.includes('deadline_digest_last_sent') || colErr.message.includes('channel_preferences'))) {
        row = await TransactionManager.query(knex, `
          SELECT email_enabled, immediate_notifications_enabled, digest_frequency, digest_last_sent
          FROM notification_preferences WHERE user_id = ?
        `, [userId]);
        if (row) row.deadline_digest_last_sent = null;
      } else {
        throw colErr;
      }
    }

    if (row) {
      const channelPreferences = row.channel_preferences != null
        ? parseChannelPreferencesJson(row.channel_preferences)
        : channelPreferencesFromLegacyRow(row);

      return {
        emailEnabled: row.email_enabled === 1 || row.email_enabled === true,
        immediateNotificationsEnabled: row.immediate_notifications_enabled === 1 || row.immediate_notifications_enabled === true,
        digestFrequency: row.digest_frequency || 'monthly',
        digestLastSent: row.digest_last_sent,
        deadlineDigestLastSent: row.deadline_digest_last_sent != null ? row.deadline_digest_last_sent : null,
        channelPreferences,
      };
    }
    return {
      emailEnabled: true,
      immediateNotificationsEnabled: true,
      digestFrequency: 'monthly',
      digestLastSent: null,
      deadlineDigestLastSent: null,
      channelPreferences: getDefaultChannelPreferences(),
    };
  } catch (error) {
    logger.error('Error fetching notification preferences', { error: error.message, userId });
    throw error;
  }
}

/**
 * Initialize default notification preferences for a user
 * @param {Object} db - Database instance
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
async function initializeUserPreferences(knex, userId) {
  try {
    const values = [userId, true, true, 'monthly'];
    const insertSql = `
      INSERT INTO notification_preferences (user_id, email_enabled, immediate_notifications_enabled, digest_frequency)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (user_id) DO NOTHING
    `;
    await TransactionManager.execute(knex, insertSql, values);
  } catch (error) {
    logger.error('Error initializing notification preferences', { error: error.message, userId });
    throw error;
  }
}

/**
 * Check if immediate notification should be sent
 * @param {Object} db - Database instance
 * @param {string} userId - User ID
 * @param {string} eventType - Event type
 * @returns {Promise<boolean>} True if should send
 */
async function shouldSendImmediateNotification(knex, userId, eventType) {
  if (!IMMEDIATE_EVENT_TYPES.includes(eventType)) {
    return false;
  }

  try {
    const channelPrefs = await readChannelPreferences(knex, userId);
    return anyChannelCanDeliver(channelPrefs, 'immediate');
  } catch (error) {
    logger.error('Error checking immediate notification preference', { error: error.message, userId });
    return false;
  }
}

/**
 * Queue event for digest email
 * @param {Object} db - Database instance
 * @param {string} userId - User ID
 * @param {string} eventType - Event type
 * @param {Object} eventData - Event data
 * @returns {Promise<void>}
 */
async function queueForDigest(knex, userId, eventType, eventData) {
  if (!DIGEST_EVENT_TYPES.includes(eventType)) {
    logger.debug('Event type not eligible for digest', { eventType });
    return;
  }

  try {
    // Initialize preferences if they don't exist
    await initializeUserPreferences(knex, userId);

    // Check if any channel wants digest summaries
    const channelPrefs = await readChannelPreferences(knex, userId);
    if (!anyChannelWantsDigest(channelPrefs)) {
      logger.debug('User has digest notifications disabled on all channels', {
        userId,
        digestFrequency: channelPrefs.email?.digestFrequency,
      });
      return;
    }

    const queueId = uuidv4();
    const eventDataJson = JSON.stringify(eventData);

    try {
      await TransactionManager.execute(knex,
        `INSERT INTO notification_digest_queue (id, user_id, event_type, event_data)
         VALUES (?, ?, ?, ?)`,
        [queueId, userId, eventType, eventDataJson]
      );
      logger.debug('Event queued for digest', { userId, eventType, queueId });
    } catch (error) {
      logger.error('Error queueing event for digest', { error: error.message, userId, eventType });
      throw error;
    }
  } catch (error) {
    logger.error('Error in queueForDigest', { error: error.message, userId, eventType });
    // Don't throw - digest queueing is non-critical
  }
}

/**
 * Send immediate notification if enabled
 * @param {Object} db - Database instance
 * @param {string} userId - User ID
 * @param {string} eventType - Event type
 * @param {Object} eventData - Event data
 * @returns {Promise<void>}
 */
async function sendImmediateNotificationIfEnabled(knex, userId, eventType, eventData) {
  try {
    // Initialize preferences if they don't exist
    await initializeUserPreferences(knex, userId);

    const shouldSend = await shouldSendImmediateNotification(knex, userId, eventType);
    if (!shouldSend) {
      logger.debug('Immediate notification not enabled for user', { userId, eventType });
      return;
    }

    await dispatchImmediate(knex, userId, eventType, eventData);
  } catch (error) {
    logger.error('Error sending immediate notification', { error: error.message, userId, eventType });
    // Don't throw - notifications are non-critical
  }
}

/**
 * Get digest events for a user since a given date
 * @param {Object} db - Database instance
 * @param {string} userId - User ID
 * @param {Date} sinceDate - Date to get events since
 * @returns {Promise<Array>} Array of event objects
 */
async function getDigestEventsForUser(knex, userId, sinceDate) {
  try {
    const rows = await TransactionManager.queryAll(knex,
      `SELECT event_type, event_data, created_at
       FROM notification_digest_queue
       WHERE user_id = ? AND created_at >= ?
       ORDER BY created_at ASC`,
      [userId, sinceDate.toISOString()]
    );
    return rows.map(row => ({
      type: row.event_type,
      ...JSON.parse(row.event_data),
      createdAt: row.created_at
    }));
  } catch (error) {
    logger.error('Error fetching digest events', { error: error.message, userId });
    throw error;
  }
}

/**
 * Clear digest queue for a user
 * @param {Object} db - Database instance
 * @param {string} userId - User ID
 * @param {Date} beforeDate - Clear events before this date
 * @returns {Promise<void>}
 */
async function clearDigestQueue(knex, userId, beforeDate) {
  try {
    await TransactionManager.execute(knex,
      `DELETE FROM notification_digest_queue
       WHERE user_id = ? AND created_at < ?`,
      [userId, beforeDate.toISOString()]
    );
  } catch (error) {
    logger.error('Error clearing digest queue', { error: error.message, userId });
    throw error;
  }
}

/**
 * Mark digest as sent for a user
 * @param {Object} db - Database instance
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
async function markDigestSent(knex, userId) {
  try {
    await TransactionManager.execute(knex,
      `UPDATE notification_preferences
       SET digest_last_sent = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      [userId]
    );
  } catch (error) {
    logger.error('Error marking digest as sent', { error: error.message, userId });
    throw error;
  }
}

/**
 * Check if digest is due for a user and send if needed
 * @param {Object} db - Database instance
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if digest was sent
 */
async function sendDigestIfDue(knex, userId) {
  try {
    const prefs = await getNotificationPreferences(knex, userId);
    const channelPrefs = prefs.channelPreferences || await readChannelPreferences(knex, userId);

    if (!anyChannelWantsDigest(channelPrefs)) {
      return false;
    }

    // Calculate when digest should be sent
    const now = new Date();
    let lastSentDate = prefs.digestLastSent ? new Date(prefs.digestLastSent) : null;
    
    // If never sent, use user creation date or 30 days ago as fallback
    if (!lastSentDate) {
      const userRow = await TransactionManager.query(knex, 'SELECT created_at FROM users WHERE id = ?', [userId]);
      lastSentDate = userRow?.created_at ? new Date(userRow.created_at) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Calculate next send date based on frequency
    const daysSinceLastSent = Math.floor((now - lastSentDate) / (1000 * 60 * 60 * 24));
    const daysRequired = prefs.digestFrequency === 'weekly' ? 7 : 30;

    if (daysSinceLastSent < daysRequired) {
      logger.debug('Digest not due yet', { userId, daysSinceLastSent, daysRequired });
      return false;
    }

    // Get events since last sent
    const events = await getDigestEventsForUser(knex, userId, lastSentDate);
    
    if (events.length === 0) {
      logger.debug('No events to include in digest', { userId });
      // Still mark as sent to avoid checking again
      await markDigestSent(knex, userId);
      return false;
    }

    const user = await TransactionManager.query(knex, 'SELECT id, email, name, preferences FROM users WHERE id = ?', [userId]);
    if (!user) {
      logger.warn('User not found for digest', { userId });
      return false;
    }

    // Email digest via emailService, then push/telegram via dispatcher
    const emailChannel = getAllChannels().find((channel) => channel.id === 'email');
    if (emailChannel?.isConfigured() && emailChannel.canDeliver(channelPrefs, 'digest') && user.email) {
      await emailChannel.deliverDigest(knex, user, {
        digestEvents: events,
        digestFrequency: prefs.digestFrequency,
        locale: localeFromUserRow(user),
      });
    }

    await dispatchDigest(knex, userId, events, prefs.digestFrequency, { skipChannels: ['email'] });

    // Clear old events from queue and mark as sent
    await clearDigestQueue(knex, userId, now);
    await markDigestSent(knex, userId);

    logger.info('Digest notifications sent', { userId, eventCount: events.length, frequency: prefs.digestFrequency });
    return true;
  } catch (error) {
    logger.error('Error sending digest if due', { error: error.message, userId });
    return false;
  }
}

/**
 * Get all approaching deadlines (next 7 days) grouped by user
 * @param {Object} knex - Database instance
 * @returns {Promise<Map<string, Object>>} Map of userId -> { documentsVoting, ruleProposals, electionVoting, electionNomination }
 */
async function getApproachingDeadlinesByUser(knex) {
  const now = new Date();
  const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nowIso = now.toISOString();
  const weekIso = oneWeekFromNow.toISOString();
  const userMap = new Map();

  function addToUser(userId, section, item) {
    if (!userMap.has(userId)) {
      userMap.set(userId, {
        documentsVoting: [],
        ruleProposals: [],
        electionVoting: [],
        electionNomination: []
      });
    }
    const sections = userMap.get(userId);
    const arr = sections[section];
    if (arr) arr.push(item);
  }

  // Documents in voting
  try {
    const documents = await TransactionManager.queryAll(knex, `
      SELECT d.id, d.title, d.voting_deadline, d.organization_id, o.name as org_name
      FROM documents d
      LEFT JOIN organizations o ON d.organization_id = o.id
      WHERE d.status = 'voting'
        AND d.voting_deadline IS NOT NULL
        AND d.voting_deadline > ?
        AND d.voting_deadline <= ?
    `, [nowIso, weekIso]);
    for (const doc of documents) {
      const members = await TransactionManager.queryAll(knex, `
        SELECT user_id FROM organization_members WHERE organization_id = ? AND status = 'active'
      `, [doc.organization_id]);
      const item = {
        title: doc.title,
        deadline: doc.voting_deadline,
        link: urls.document(doc.id),
        organizationName: doc.org_name || null,
        organizationId: doc.organization_id || null
      };
      for (const m of members) {
        addToUser(m.user_id, 'documentsVoting', item);
      }
    }
  } catch (err) {
    logger.error('Error fetching documents for deadlines digest', { error: err.message });
  }

  // Rule proposals
  try {
    const proposals = await TransactionManager.queryAll(knex, `
      SELECT grp.id, grp.title, grp.voting_ends_at, grp.organization_id, o.name as org_name
      FROM governance_rule_proposals grp
      LEFT JOIN organizations o ON grp.organization_id = o.id
      WHERE grp.status = 'active'
        AND grp.voting_ends_at IS NOT NULL
        AND grp.voting_ends_at > ?
        AND grp.voting_ends_at <= ?
    `, [nowIso, weekIso]);
    for (const p of proposals) {
      const members = await TransactionManager.queryAll(knex, `
        SELECT user_id FROM organization_members WHERE organization_id = ? AND status = 'active'
      `, [p.organization_id]);
      const item = {
        title: p.title || 'Rule Proposal',
        deadline: p.voting_ends_at,
        link: urls.orgTab(p.organization_id, 'governance'),
        organizationName: p.org_name || null,
        organizationId: p.organization_id || null
      };
      for (const m of members) {
        addToUser(m.user_id, 'ruleProposals', item);
      }
    }
  } catch (err) {
    if (err.message && err.message.includes('no such table')) {
      logger.debug('governance_rule_proposals table not found, skipping rule proposals');
    } else {
      logger.error('Error fetching rule proposals for deadlines digest', { error: err.message });
    }
  }

  // Elections – voting
  try {
    const elections = await TransactionManager.queryAll(knex, `
      SELECT re.id, re.election_title, re.voting_ends_at, re.organization_id, o.name as org_name
      FROM representative_elections re
      LEFT JOIN organizations o ON re.organization_id = o.id
      WHERE re.status = 'voting'
        AND re.voting_ends_at IS NOT NULL
        AND re.voting_ends_at > ?
        AND re.voting_ends_at <= ?
    `, [nowIso, weekIso]);
    for (const e of elections) {
      const members = await TransactionManager.queryAll(knex, `
        SELECT user_id FROM organization_members WHERE organization_id = ? AND status = 'active'
      `, [e.organization_id]);
      const item = {
        title: e.election_title || 'Election',
        deadline: e.voting_ends_at,
        link: urls.orgTab(e.organization_id, 'governance'),
        organizationName: e.org_name || null,
        organizationId: e.organization_id || null
      };
      for (const m of members) {
        addToUser(m.user_id, 'electionVoting', item);
      }
    }
  } catch (err) {
    if (err.message && err.message.includes('no such table')) {
      logger.debug('representative_elections table not found, skipping election voting');
    } else {
      logger.error('Error fetching elections for deadlines digest', { error: err.message });
    }
  }

  // Elections – nomination
  try {
    const nominations = await TransactionManager.queryAll(knex, `
      SELECT re.id, re.election_title, re.nomination_ends_at, re.organization_id, o.name as org_name
      FROM representative_elections re
      LEFT JOIN organizations o ON re.organization_id = o.id
      WHERE re.status IN ('draft', 'nomination')
        AND re.nomination_ends_at IS NOT NULL
        AND re.nomination_ends_at > ?
        AND re.nomination_ends_at <= ?
    `, [nowIso, weekIso]);
    for (const e of nominations) {
      const members = await TransactionManager.queryAll(knex, `
        SELECT user_id FROM organization_members WHERE organization_id = ? AND status = 'active'
      `, [e.organization_id]);
      const item = {
        title: e.election_title || 'Election',
        deadline: e.nomination_ends_at,
        link: urls.orgTab(e.organization_id, 'governance'),
        organizationName: e.org_name || null,
        organizationId: e.organization_id || null
      };
      for (const m of members) {
        addToUser(m.user_id, 'electionNomination', item);
      }
    }
  } catch (err) {
    if (err.message && err.message.includes('no such table')) {
      logger.debug('representative_elections table not found, skipping nomination deadlines');
    } else {
      logger.error('Error fetching nomination deadlines for digest', { error: err.message });
    }
  }

  // Sort each section by deadline ascending
  for (const sections of userMap.values()) {
    for (const key of ['documentsVoting', 'ruleProposals', 'electionVoting', 'electionNomination']) {
      const arr = sections[key];
      if (arr && arr.length) {
        arr.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
      }
    }
  }

  return userMap;
}

/**
 * Send deadlines digest for a user if due (prefs enabled, not already sent today)
 * @param {Object} knex - Database instance
 * @param {string} userId - User ID
 * @param {Object} sections - { documentsVoting, ruleProposals, electionVoting, electionNomination }
 * @returns {Promise<boolean>} True if email was sent
 */
async function sendDeadlinesDigestIfDue(knex, userId, sections) {
  const docs = sections.documentsVoting || [];
  const rules = sections.ruleProposals || [];
  const electionV = sections.electionVoting || [];
  const electionN = sections.electionNomination || [];
  const total = docs.length + rules.length + electionV.length + electionN.length;
  if (total === 0) return false;

  try {
    await initializeUserPreferences(knex, userId);
    const prefs = await getNotificationPreferences(knex, userId);
    if (!prefs.emailEnabled || !prefs.immediateNotificationsEnabled) return false;

    const now = new Date();
    const lastSent = prefs.deadlineDigestLastSent ? new Date(prefs.deadlineDigestLastSent) : null;
    if (lastSent) {
      const lastDay = new Date(lastSent.getFullYear(), lastSent.getMonth(), lastSent.getDate()).getTime();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      if (lastDay === today) return false;
    }

    const user = await TransactionManager.query(knex, 'SELECT email, name, preferences FROM users WHERE id = ?', [userId]);
    if (!user || !user.email) return false;

    const primaryOrgName = docs[0]?.organizationName || rules[0]?.organizationName || electionV[0]?.organizationName || electionN[0]?.organizationName || null;
    const content = formatDeadlinesApproachingDigest(sections, {
      userName: user.name || null,
      primaryOrgName,
      locale: localeFromUserRow(user),
    });
    if (!content.subject) return false;

    const result = await sendDeadlinesDigestEmail(user.email, content);
    if (!result) return false;

    try {
      await TransactionManager.execute(knex, `
        UPDATE notification_preferences
        SET deadline_digest_last_sent = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `, [userId]);
    } catch (updateErr) {
      if (updateErr.message && updateErr.message.includes('deadline_digest_last_sent')) {
        logger.warn('deadline_digest_last_sent column missing; run migration add-deadline-digest-last-sent');
      } else {
        logger.error('Error updating deadline_digest_last_sent', { error: updateErr.message, userId });
      }
    }
    logger.info('Deadlines digest sent', { userId, itemCount: total });
    return true;
  } catch (error) {
    logger.error('Error sending deadlines digest', { error: error.message, userId });
    return false;
  }
}

/**
 * Notify multiple users about an event
 * @param {Object} db - Database instance
 * @param {Array<string>} userIds - Array of user IDs
 * @param {string} eventType - Event type
 * @param {Object} eventData - Event data
 * @param {boolean} isImmediate - Whether this is an immediate notification
 * @returns {Promise<void>}
 */
async function notifyUsers(knex, userIds, eventType, eventData, isImmediate = false) {
  if (!userIds || userIds.length === 0) {
    return;
  }

  const promises = userIds.map(userId => {
    if (isImmediate) {
      return sendImmediateNotificationIfEnabled(knex, userId, eventType, eventData);
    } else {
      return queueForDigest(knex, userId, eventType, eventData);
    }
  });

  await Promise.allSettled(promises);
}

module.exports = {
  getNotificationPreferences,
  initializeUserPreferences,
  shouldSendImmediateNotification,
  queueForDigest,
  sendImmediateNotificationIfEnabled,
  getDigestEventsForUser,
  clearDigestQueue,
  markDigestSent,
  sendDigestIfDue,
  getApproachingDeadlinesByUser,
  sendDeadlinesDigestIfDue,
  notifyUsers,
  IMMEDIATE_EVENT_TYPES,
  DIGEST_EVENT_TYPES,
};

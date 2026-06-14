/**
 * Scheduling poll notification helpers.
 */

const { logger } = require('../middleware/logger');
const TransactionManager = require('../database/services/TransactionManager');
const SchedulingService = require('./SchedulingService');

async function notifyPollOpened(db, { organizationId, pollId, poll, userIds }) {
  if (!userIds?.length) return;
  try {
    const notificationService = require('../modules/notifications');
    const orgRow = await TransactionManager.query(db, 'SELECT name FROM organizations WHERE id = ?', [organizationId]);
    await notificationService.notifyUsers(db, userIds, 'scheduling_poll_opened', {
      title: poll.title,
      participationDeadline: poll.participationDeadline,
      link: SchedulingService.pollDetailLink(organizationId, pollId),
      organizationName: orgRow?.name || null
    }, true);
  } catch (error) {
    logger.error('Error sending scheduling poll opened notifications', { error: error.message, pollId });
  }
}

async function notifyParticipationClosed(db, {
  organizationId, pollId, poll, participationSummary, suggestedSlot, closedReason, userIds
}) {
  if (!userIds?.length) return;
  try {
    const notificationService = require('../modules/notifications');
    const orgRow = await TransactionManager.query(db, 'SELECT name FROM organizations WHERE id = ?', [organizationId]);
    await notificationService.notifyUsers(db, userIds, 'scheduling_poll_participation_closed', {
      title: poll.title,
      participationSummary,
      suggestedSlot,
      closedReason,
      link: SchedulingService.pollDetailLink(organizationId, pollId),
      organizationName: orgRow?.name || null
    }, true);
  } catch (error) {
    logger.error('Error sending scheduling poll participation closed notifications', { error: error.message, pollId });
  }
}

async function notifyDeadlineApproaching(db, { organizationId, pollId, poll, userIds }) {
  if (!userIds?.length) return;
  try {
    const notificationService = require('../modules/notifications');
    const orgRow = await TransactionManager.query(db, 'SELECT name FROM organizations WHERE id = ?', [organizationId]);
    await notificationService.notifyUsers(db, userIds, 'scheduling_poll_deadline_approaching', {
      title: poll.title,
      deadline: poll.participationDeadline,
      deadlineType: 'scheduling_poll',
      link: SchedulingService.pollDetailLink(organizationId, pollId),
      organizationName: orgRow?.name || null
    }, true);
  } catch (error) {
    logger.error('Error sending scheduling poll deadline approaching notifications', { error: error.message, pollId });
  }
}

module.exports = {
  notifyPollOpened,
  notifyParticipationClosed,
  notifyDeadlineApproaching
};

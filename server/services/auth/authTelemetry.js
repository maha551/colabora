const { securityLogger, logger } = require('../../middleware/logger');
const { metricsCollector } = require('../../middleware/monitoring');

function safeAuthAttempt(email, success, ip, userAgent) {
  try {
    securityLogger.authAttempt(email, success, ip, userAgent);
  } catch (logError) {
    logger.warn('Failed to log auth attempt', { error: logError.message });
  }
}

function safeAuthFailure(email, reason, ip, userAgent) {
  try {
    securityLogger.authFailure(email, reason, ip, userAgent);
  } catch (logError) {
    logger.warn('Failed to log auth failure', { error: logError.message });
  }
}

function safeRecordAuthEvent(eventName, success, metadata) {
  try {
    metricsCollector.recordAuthEvent(eventName, success, metadata);
  } catch (metricsError) {
    logger.warn('Failed to record auth metrics', { error: metricsError.message });
  }
}

module.exports = {
  safeAuthAttempt,
  safeAuthFailure,
  safeRecordAuthEvent
};

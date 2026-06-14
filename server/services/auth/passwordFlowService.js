const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { hashPassword, verifyPassword } = require('../../middleware/auth');
const { logger } = require('../../middleware/logger');
const { ApiError } = require('../../middleware/errorHandler');
const TransactionManager = require('../../database/services/TransactionManager');
const { sendPasswordResetEmail } = require('../../modules/emailService');
const { localeFromUserRow } = require('../../emails/i18n');
const { getUserId } = require('../../utils/routeHelpers');
const { safeAuthAttempt, safeAuthFailure, safeRecordAuthEvent } = require('./authTelemetry');

async function handleChangePassword({ req, res, next }) {
  const db = req.app.locals.db;
  const userId = getUserId(req);
  // Accept both camelCase and snake_case (transformRequest snake-cases the body).
  const currentPassword = req.body.currentPassword || req.body.current_password;
  const newPassword = req.body.newPassword || req.body.new_password;
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || 'unknown';

  const user = await TransactionManager.query(db,
    'SELECT id, email, password_hash FROM users WHERE id = ?',
    [userId]
  );

  if (!user) {
    return next(ApiError.notFound('User', 'USER_NOT_FOUND'));
  }

  if (!user.password_hash) {
    logger.warn('User has no password_hash', { email: user.email, userId: user.id });
    safeAuthFailure(user.email, 'no_password_hash', ip, userAgent);
    return next(ApiError.auth('Current password verification failed', 'NO_PASSWORD_HASH'));
  }

  const isValidPassword = await verifyPassword(currentPassword, user.password_hash);
  if (!isValidPassword) {
    safeAuthFailure(user.email, 'invalid_current_password', ip, userAgent);
    safeRecordAuthEvent('password_change_attempt', false, { reason: 'invalid_current_password', userId: user.id });
    return next(ApiError.auth('Current password is incorrect', 'INVALID_CURRENT_PASSWORD'));
  }

  const newPasswordHash = await hashPassword(newPassword);

  await TransactionManager.execute(db,
    'UPDATE users SET password_hash = ? WHERE id = ?',
    [newPasswordHash, userId]
  );

  safeAuthAttempt(user.email, true, ip, userAgent);
  safeRecordAuthEvent('password_change_attempt', true, { userId: user.id });
  logger.info('Password changed successfully', { userId: user.id, email: user.email });

  return res.json({
    success: true,
    message: 'Password changed successfully'
  });
}

async function handleForgotPassword({ req, res }) {
  const db = req.app.locals.db;
  const { email } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || 'unknown';

  const user = await TransactionManager.query(db,
    'SELECT id, name, email, preferences FROM users WHERE LOWER(email) = LOWER(?)',
    [email]
  );

  if (user) {
    try {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const tokenId = uuidv4();
      const expirationDate = new Date(Date.now() + 3600000);

      await TransactionManager.execute(db,
        `INSERT INTO password_reset_tokens (id, user_id, token, expires_at, created_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [tokenId, user.id, resetToken, expirationDate.toISOString()]
      );

      sendPasswordResetEmail(user.email, user.name, resetToken, {
        locale: localeFromUserRow(user),
      }).catch((err) => {
        logger.warn('Failed to send password reset email', { error: err.message, userId: user.id });
      });

      safeAuthAttempt(user.email, true, ip, userAgent);
      safeRecordAuthEvent('password_reset_request', true, { userId: user.id });
      logger.info('Password reset token generated', { userId: user.id, email: user.email });
    } catch (error) {
      logger.error('Error generating password reset token', {
        error: error.message,
        stack: error.stack,
        email: user.email,
        userId: user.id
      });
    }
  } else {
    safeAuthFailure(email, 'password_reset_user_not_found', ip, userAgent);
    safeRecordAuthEvent('password_reset_request', false, { reason: 'user_not_found' });
  }

  return res.json({
    success: true,
    message: 'If an account exists with this email, a password reset link has been sent.'
  });
}

async function handleResetPassword({ req, res, next }) {
  const db = req.app.locals.db;
  const token = req.body.token;
  const newPassword = req.body.newPassword || req.body.new_password;
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || 'unknown';

  const resetToken = await TransactionManager.query(db,
    `SELECT id, user_id, token, expires_at, used_at
     FROM password_reset_tokens
     WHERE token = ?`,
    [token]
  );

  if (!resetToken) {
    safeAuthFailure('unknown', 'invalid_reset_token', ip, userAgent);
    return next(ApiError.validation('Invalid or expired reset token', null, 'INVALID_RESET_TOKEN'));
  }

  const now = new Date();
  const expiresAt = new Date(resetToken.expires_at);
  if (now > expiresAt) {
    safeAuthFailure('unknown', 'expired_reset_token', ip, userAgent);
    return next(ApiError.validation('Reset token has expired', null, 'RESET_TOKEN_EXPIRED'));
  }

  if (resetToken.used_at) {
    safeAuthFailure('unknown', 'used_reset_token', ip, userAgent);
    return next(ApiError.validation('Reset token has already been used', null, 'RESET_TOKEN_ALREADY_USED'));
  }

  const user = await TransactionManager.query(db,
    'SELECT id, email, name FROM users WHERE id = ?',
    [resetToken.user_id]
  );

  if (!user) {
    logger.error('User not found for reset token', { userId: resetToken.user_id, tokenId: resetToken.id });
    return next(ApiError.notFound('User', 'USER_NOT_FOUND'));
  }

  const newPasswordHash = await hashPassword(newPassword);

  await TransactionManager.executeInTransaction(db, async (trx) => {
    await TransactionManager.execute(trx,
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newPasswordHash, user.id]
    );

    await TransactionManager.execute(trx,
      'UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?',
      [resetToken.id]
    );

    await TransactionManager.execute(trx,
      `UPDATE password_reset_tokens
       SET used_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND id != ? AND used_at IS NULL`,
      [user.id, resetToken.id]
    );
  });

  safeAuthAttempt(user.email, true, ip, userAgent);
  safeRecordAuthEvent('password_reset_completed', true, { userId: user.id });
  logger.info('Password reset completed successfully', { userId: user.id, email: user.email });

  return res.json({
    success: true,
    message: 'Password has been reset successfully'
  });
}

module.exports = {
  handleChangePassword,
  handleForgotPassword,
  handleResetPassword
};

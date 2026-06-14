const { v4: uuidv4 } = require('uuid');
const { generateToken, hashPassword } = require('../../middleware/auth');
const { logger } = require('../../middleware/logger');
const { ApiError } = require('../../middleware/errorHandler');
const TransactionManager = require('../../database/services/TransactionManager');
const { sendWelcomeEmail, sendFirstUserWelcomeEmail } = require('../../modules/emailService');
const {
  resolveInvitationContext,
  acceptInvitationForExistingUser,
  registerNewUserWithInvitation
} = require('../invitations/registrationInvitationService');
const { safeAuthAttempt, safeRecordAuthEvent } = require('./authTelemetry');
const {
  validateRegistrationLegalConsent,
  buildUserInsertWithLegalConsent,
} = require('../../utils/legalConsent');

async function handleRegisterRequest({ req, res }) {
  const { name, email, password } = req.body;
  // transformRequest snake-cases the body; accept both spellings of the token.
  const invitationToken = req.body.invitationToken ?? req.body.invitation_token;
  const db = req.app.locals.db;
  const userId = uuidv4();
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || 'unknown';

  try {
    validateRegistrationLegalConsent(req.body);

    const invitationContext = await resolveInvitationContext(db, invitationToken, email);
    const {
      invitation,
      documentInvitation,
      organizationId,
      documentId
    } = invitationContext;

    const existingUser = await TransactionManager.query(db,
      'SELECT id, password_hash, name FROM users WHERE email = ?',
      [email]
    );

    if (existingUser) {
      if (invitationToken && (invitation || documentInvitation)) {
        const accepted = await acceptInvitationForExistingUser({
          db,
          existingUser,
          email,
          password,
          invitation,
          documentInvitation,
          req,
          ip,
          userAgent
        });
        return res.status(accepted.statusCode).json(accepted.body);
      }

      throw ApiError.validation('User with this email already exists', null, 'USER_ALREADY_EXISTS');
    }

    const passwordHash = await hashPassword(password);

    if (invitation || documentInvitation) {
      await registerNewUserWithInvitation({
        db,
        userId,
        name,
        email,
        passwordHash,
        invitation,
        organizationId,
        documentInvitation,
        documentId,
        sendWelcomeEmail
      });

      if (invitation && organizationId) {
        const responseCache = req.app.locals.responseCache;
        if (responseCache) await responseCache.del(`orgs:user:${userId}`);
      }
    } else {
      const userInsert = buildUserInsertWithLegalConsent({
        userId,
        name,
        email,
        passwordHash,
        role: 'user',
      });
      await TransactionManager.execute(db, userInsert.sql, userInsert.params);

      sendFirstUserWelcomeEmail(email, name).catch((err) => {
        logger.warn('Failed to send first user welcome email', {
          error: err.message,
          email,
          userId
        });
      });
    }

    const token = generateToken({
      id: userId,
      name,
      email
    });

    safeAuthAttempt(email, true, ip, userAgent);
    safeRecordAuthEvent('registration', true, { userId });

    return res.status(201).json({
      user: {
        id: userId,
        name,
        email
      },
      token,
      message: (invitation || documentInvitation) ? 'Registration successful and invitation accepted' : 'Registration successful',
      organizationId: organizationId || undefined,
      documentId: documentId || undefined
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Registration error', { error: error.message, stack: error.stack, email: req.body.email });
    throw ApiError.database('Registration failed', { originalError: error.message }, 'REGISTRATION_FAILED');
  }
}

module.exports = {
  handleRegisterRequest
};

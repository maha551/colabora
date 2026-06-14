const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAuth, requireAdmin, generateToken, verifyPassword } = require('../middleware/auth');
const { securityLogger, logger } = require('../middleware/logger');
const { metricsCollector } = require('../middleware/monitoring');
const { userValidation, paramValidation } = require('../middleware/validation');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const config = require('../config');
const { safeJsonParse, safeJsonParseArray, safeJsonParseObject } = require('../utils/jsonUtils');
const { camelCaseKeys } = require('../utils/dataTransform');
const { extractField } = require('../utils/fieldExtractor');
const TransactionManager = require('../database/services/TransactionManager');
const { getUserId } = require('../utils/routeHelpers');
const { handleRegisterRequest } = require('../services/auth/authRegistrationService');
const UserProfileService = require('../services/UserProfileService');
const {
  handleChangePassword,
  handleForgotPassword,
  handleResetPassword
} = require('../services/auth/passwordFlowService');

const router = express.Router();

// Login endpoint - secure authentication
router.post('/login', ...userValidation.login, asyncHandler(async (req, res) => {

  const { email, password } = req.body;
  const db = req.app.locals.db;
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || 'unknown';

  // Check if database is available
  if (!db) {
    logger.error('Database not available during login', { userId: req.body.email });
    throw ApiError.database('Authentication service unavailable', null, 'DATABASE_UNAVAILABLE');
  }

  try {
    // Find user by email (handle missing bio column gracefully)
    const user = await TransactionManager.query(db, 
      `SELECT id, name, email, password_hash, avatar, COALESCE(bio, '') as bio, role,
        COALESCE(default_home_view, 'activity') as default_home_view,
        COALESCE(preferences, '{}') as preferences,
        COALESCE(profile_data, '{}') as profile_data,
        COALESCE(is_active, true) as is_active
       FROM users WHERE email = ?`, 
      [email]
    );

    // Handle user not found
    if (!user) {
      securityLogger.authFailure(email, 'user_not_found', ip, userAgent);
      metricsCollector.recordAuthEvent('login_attempt', false, { reason: 'user_not_found' });
      throw ApiError.auth('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    // Verify password
    if (!user.password_hash) {
      logger.warn('User has no password_hash', { email: user.email, userId: user.id });
      securityLogger.authFailure(email, 'no_password_hash', ip, userAgent);
      throw ApiError.auth('Authentication failed', 'NO_PASSWORD_HASH');
    }

    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      securityLogger.authFailure(email, 'invalid_password', ip, userAgent);
      metricsCollector.recordAuthEvent('login_attempt', false, { reason: 'invalid_password', userId: user.id });
      throw ApiError.auth('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    if (user.is_active === false || user.is_active === 0) {
      securityLogger.authFailure(email, 'account_suspended', ip, userAgent);
      metricsCollector.recordAuthEvent('login_attempt', false, { reason: 'account_suspended', userId: user.id });
      throw ApiError.forbidden('Account suspended. Contact an administrator.', 'ACCOUNT_SUSPENDED');
    }

    // Generate JWT token
    let token;
    try {
      token = generateToken({
        id: user.id,
        name: user.name,
        email: user.email
      });
    } catch (tokenError) {
      logger.error('Token generation error', { error: tokenError.message, stack: tokenError.stack, userId: user.id });
      securityLogger.authFailure(email, 'token_generation_error', ip, userAgent);
      throw ApiError.auth('Authentication failed', 'TOKEN_GENERATION_ERROR');
    }

    // Log successful authentication and record metrics
    try {
      securityLogger.authAttempt(email, true, ip, userAgent);
    } catch (logError) {
      logger.warn('Failed to log auth attempt', { error: logError.message });
    }
    
    try {
      metricsCollector.recordAuthEvent('login_attempt', true, { userId: user.id });
    } catch (metricsError) {
      logger.warn('Failed to record auth metrics', { error: metricsError.message });
    }

    const preferences = safeJsonParseObject(user.preferences);
    const profileData = UserProfileService.parseProfileData(user.profile_data);
    delete user.profile_data;
    delete user.password_hash;

    res.json({
      user: {
        ...user,
        preferences,
        profileData,
        isActive: user.is_active !== false && user.is_active !== 0,
      },
      token,
      message: 'Login successful'
    });
  } catch (error) {
    // Re-throw ApiError instances
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Login error', { error: error.message, stack: error.stack, email: req.body.email });
    
    try {
      securityLogger.authFailure(email, 'system_error', ip, userAgent);
    } catch (logError) {
      logger.warn('Failed to log auth failure', { error: logError.message });
    }
    
    try {
      metricsCollector.recordAuthEvent('login_attempt', false, { error: error.message });
    } catch (metricsError) {
      logger.warn('Failed to record auth failure metrics', { error: metricsError.message });
    }
    
    // Return 401 for authentication failures, even if caused by system errors
    // This prevents clients from retrying failed login attempts
    throw ApiError.auth('Authentication failed', 'AUTH_SYSTEM_ERROR');
  }
}));

// Register endpoint - secure user registration
router.post('/register', ...userValidation.register, asyncHandler(async (req, res) => {
  await handleRegisterRequest({ req, res });
}));

// Logout endpoint
router.post('/logout', (req, res) => {
  // JWT tokens are stored client-side in localStorage
  // Client will remove the token on logout
  res.json({ message: 'Logout successful' });
});

// Get current user
router.get('/me', requireAuth, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const userId = getUserId(req);
  
  // Fetch full user data including preferences
  const user = await TransactionManager.query(db,
    `SELECT id, name, email, COALESCE(bio, '') as bio, avatar, role,
      COALESCE(preferences, '{}') as preferences,
      COALESCE(default_home_view, 'activity') as default_home_view,
      COALESCE(profile_data, '{}') as profile_data
     FROM users WHERE id = ?`,
    [userId]
  );
  
  if (!user) {
    return next(ApiError.notFound('User', 'USER_NOT_FOUND'));
  }
  
  user.preferences = safeJsonParseObject(user.preferences);
  user.profileData = UserProfileService.parseProfileData(user.profile_data);
  delete user.profile_data;
  const prefs = user.preferences || {};
  if (prefs.timezone) user.timezone = prefs.timezone;
  
  res.json({ user });
}));

// Get all demo users (for development/debugging)

// Get user profile by ID (for viewing other members' profiles)
router.get('/users/:userId', requireAuth, ...paramValidation.userId, asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return next(ApiError.auth('Not authenticated', 'NOT_AUTHENTICATED'));
  }

  const db = req.app.locals.db;
  const targetUserId = req.params.userId;
  const callerId = getUserId(req);
  const contextOrganizationId = req.query.organizationId || req.query.organization_id || null;

  const result = await UserProfileService.getProfileForViewer(db, callerId, targetUserId, contextOrganizationId);

  if (result.notFound) {
    return next(ApiError.notFound('User', 'USER_NOT_FOUND'));
  }
  if (result.forbidden) {
    return next(ApiError.forbidden(
      'You must be a member of this organization to access this area',
      'MEMBERSHIP_REQUIRED'
    ));
  }

  res.json(result);
}));

// Update user profile
router.put('/profile', requireAuth, ...userValidation.updateProfile, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  
  if (!req.user) {
    return next(ApiError.auth('Not authenticated', 'NOT_AUTHENTICATED'));
  }

  const name = extractField(req.body, 'name', 'name');
  const email = extractField(req.body, 'email', 'email');
  const bio = extractField(req.body, 'bio', 'bio');
  const avatar = extractField(req.body, 'avatar', 'avatar');
  const avatarUrl = extractField(req.body, 'avatarUrl', 'avatar_url');
  const defaultHomeView = extractField(req.body, 'defaultHomeView', 'default_home_view');
  const preferencesRaw = extractField(req.body, 'preferences', 'preferences');
  const preferences = preferencesRaw !== undefined ? camelCaseKeys(preferencesRaw) : undefined;
  const profileDataRaw = extractField(req.body, 'profileData', 'profile_data');
  const profileData = profileDataRaw !== undefined ? camelCaseKeys(profileDataRaw) : undefined;
  const userId = getUserId(req);

  const row = await TransactionManager.query(db,
    `SELECT name, email, COALESCE(bio, '') as bio, avatar,
      COALESCE(default_home_view, 'activity') as default_home_view,
      COALESCE(preferences, '{}') as preferences,
      COALESCE(profile_data, '{}') as profile_data
     FROM users WHERE id = ?`,
    [userId]
  );

  if (!row) {
    return next(ApiError.notFound('User', 'USER_NOT_FOUND'));
  }

  const nextEmail = email !== undefined ? email : row.email;
  if (email !== undefined) {
    const existingUser = await TransactionManager.query(db,
      'SELECT id FROM users WHERE email = ? AND id != ?',
      [nextEmail, userId]
    );
    if (existingUser) {
      return next(ApiError.validation('Email already in use', null, 'EMAIL_ALREADY_IN_USE'));
    }
  }

  const nextName = name !== undefined ? name : row.name;
  const nextBio = bio !== undefined ? (bio || null) : row.bio;
  const nextDefaultHomeView = defaultHomeView !== undefined ? defaultHomeView : row.default_home_view;
  const finalAvatar = avatar || avatarUrl || (avatar === undefined && avatarUrl === undefined ? row.avatar : null);

  let preferencesJson = row.preferences || '{}';
  if (preferences !== undefined) {
    try {
      const existingPrefs = safeJsonParse(row.preferences || '{}', {});
      const newPrefs = typeof preferences === 'string' ? safeJsonParse(preferences, {}) : preferences;
      preferencesJson = JSON.stringify({ ...existingPrefs, ...newPrefs });
    } catch (prefError) {
      logger.warn('Invalid preferences JSON', { error: prefError.message, userId });
      preferencesJson = row.preferences || '{}';
    }
  }

  let profileDataJson = row.profile_data || '{}';
  if (profileData !== undefined) {
    try {
      const existingProfileData = UserProfileService.parseProfileData(row.profile_data);
      const normalized = UserProfileService.validateAndNormalizeProfileData(profileData);
      const mergedProfileData = UserProfileService.mergeProfileData(existingProfileData, normalized);
      profileDataJson = JSON.stringify(mergedProfileData);
    } catch (profileError) {
      return next(ApiError.validation(profileError.message, null, 'INVALID_PROFILE_DATA'));
    }
  }

  await TransactionManager.execute(db,
    `UPDATE users
     SET name = ?, email = ?, bio = ?, avatar = ?, default_home_view = ?, preferences = ?, profile_data = ?
     WHERE id = ?`,
    [nextName, nextEmail, nextBio, finalAvatar, nextDefaultHomeView, preferencesJson, profileDataJson, userId]
  );

  const profileResult = await UserProfileService.getProfileForViewer(db, userId, userId, null);
  const userResponse = profileResult.user;
  userResponse.preferences = safeJsonParseObject(preferencesJson);
  userResponse.defaultHomeView = nextDefaultHomeView;
  userResponse.role = req.user?.role;

  req.user = userResponse;

  res.json({
    user: userResponse,
    message: 'Profile updated successfully'
  });
}));

// Change password (authenticated users)
router.put('/change-password', requireAuth, ...userValidation.changePassword, asyncHandler(async (req, res, next) => {
  await handleChangePassword({ req, res, next });
}));

// Forgot password (public endpoint)
router.post('/forgot-password', ...userValidation.forgotPassword, asyncHandler(async (req, res) => {
  await handleForgotPassword({ req, res });
}));

// Reset password (public endpoint)
router.post('/reset-password', ...userValidation.resetPassword, asyncHandler(async (req, res, next) => {
  await handleResetPassword({ req, res, next });
}));

module.exports = router;

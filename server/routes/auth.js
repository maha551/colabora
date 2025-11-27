const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { requireAuth, requireAdmin, generateToken, hashPassword, verifyPassword } = require('../middleware/auth');
const { securityLogger, logger } = require('../middleware/logger');
const { metricsCollector } = require('../middleware/monitoring');
const config = require('../config');
const demoUsers = require('../demoUsers');

const router = express.Router();

// Login endpoint - secure authentication
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  const { email, password } = req.body;
  const db = req.app.locals.db;
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || 'unknown';

  // Check if database is available
  if (!db) {
    logger.error('Database not available during login', { userId: req.body.email });
    return res.status(500).json({ error: 'Authentication service unavailable' });
  }

  try {
    // Find user by email (handle missing bio column gracefully)
    db.get('SELECT id, name, email, password_hash, avatar, COALESCE(bio, "") as bio, role FROM users WHERE email = ?', [email], async (err, user) => {
      // Handle database errors
      if (err) {
        logger.error('Database error during login', { error: err.message, stack: err.stack, email: req.body.email });
        securityLogger.authFailure(email, 'database_error', ip, userAgent);
        return res.status(500).json({ error: 'Authentication failed' });
      }

      // Handle user not found
      if (!user) {
        securityLogger.authFailure(email, 'user_not_found', ip, userAgent);
        metricsCollector.recordAuthEvent('login_attempt', false, { reason: 'user_not_found' });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Verify password (wrap in try-catch for async errors)
      try {
        if (!user.password_hash) {
          logger.warn('User has no password_hash', { email: user.email, userId: user.id });
          securityLogger.authFailure(email, 'no_password_hash', ip, userAgent);
          return res.status(500).json({ error: 'Authentication failed' });
        }

        const isValidPassword = await verifyPassword(password, user.password_hash);
        if (!isValidPassword) {
          securityLogger.authFailure(email, 'invalid_password', ip, userAgent);
          metricsCollector.recordAuthEvent('login_attempt', false, { reason: 'invalid_password', userId: user.id });
          return res.status(401).json({ error: 'Invalid credentials' });
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
          return res.status(500).json({ error: 'Authentication failed' });
        }

        // Update session for backward compatibility
        if (req.session) {
          req.session.userId = user.id;
          req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            bio: user.bio
          };
        }

        // Log successful authentication and record metrics
        securityLogger.authAttempt(email, true, ip, userAgent);
        metricsCollector.recordAuthEvent('login_attempt', true, { userId: user.id });

        res.json({
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            bio: user.bio,
            role: user.role || 'user'
          },
          token,
          message: 'Login successful'
        });
      } catch (passwordError) {
        logger.error('Password verification error', { error: passwordError.message, stack: passwordError.stack, email: req.body.email });
        securityLogger.authFailure(email, 'password_verification_error', ip, userAgent);
        metricsCollector.recordAuthEvent('login_attempt', false, { error: passwordError.message });
        return res.status(500).json({ error: 'Authentication failed' });
      }
    });
  } catch (error) {
    logger.error('Login error', { error: error.message, stack: error.stack, email: req.body.email });
    securityLogger.authFailure(email, 'system_error', ip, userAgent);
    metricsCollector.recordAuthEvent('login_attempt', false, { error: error.message });
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Register endpoint - secure user registration
router.post('/register', [
  body('name')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),

  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),

  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  const { name, email, password } = req.body;
  const db = req.app.locals.db;
  const userId = uuidv4();
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || 'unknown';

  try {
    // Check if user already exists
    db.get('SELECT id FROM users WHERE email = ?', [email], async (err, existingUser) => {
      if (err) {
        logger.error('Database error during registration check', { error: err.message, email: req.body.email });
        return res.status(500).json({ error: 'Registration failed' });
      }

      if (existingUser) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create user
      db.run(
        'INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
        [userId, name, email, passwordHash],
        function(err) {
          if (err) {
            logger.error('Database error during user creation', { error: err.message, email: req.body.email });
            return res.status(500).json({ error: 'Registration failed' });
          }

          // Generate JWT token
          const token = generateToken({
            id: userId,
            name: name,
            email: email
          });

          // Update session
          if (req.session) {
            req.session.userId = userId;
            req.session.user = {
              id: userId,
              name: name,
              email: email
            };
          }

          // Log successful registration and record metrics
          securityLogger.authAttempt(email, true, ip, userAgent);
          metricsCollector.recordAuthEvent('registration', true, { userId });

          res.status(201).json({
            user: {
              id: userId,
              name: name,
              email: email
            },
            token,
            message: 'Registration successful'
          });
        }
      );
    });
  } catch (error) {
    logger.error('Registration error', { error: error.message, stack: error.stack, email: req.body.email });
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Logout endpoint
router.post('/logout', (req, res) => {
  if (!req.session) {
    return res.json({ message: 'Logout successful' });
  }

  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out' });
    }
    res.clearCookie('colabora.sid', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });
    res.json({ message: 'Logout successful' });
  });
});

// Get current user
router.get('/me', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ user: req.user });
});

// Get all demo users (for development/debugging)
router.get('/demo-users', (req, res) => {
  res.json({ users: demoUsers });
});

// Update user profile
router.put('/profile', (req, res) => {
  const db = req.app.locals.db;
  
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { name, email, bio, avatar, avatarUrl } = req.body;
  const userId = req.user.id;

  // Validate required fields
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Check if email is already taken by another user
  db.get(
    'SELECT id FROM users WHERE email = ? AND id != ?',
    [email, userId],
    (err, existingUser) => {
      if (err) {
        logger.error('Error checking email', { error: err.message, email: req.body.email });
        return res.status(500).json({ error: 'Database error' });
      }

      if (existingUser) {
        return res.status(400).json({ error: 'Email already in use' });
      }

      // Determine which avatar to use
      const finalAvatar = avatar || avatarUrl || null;

      // Update user in database
      db.run(
        `UPDATE users 
         SET name = ?, email = ?, bio = ?, avatar = ?
         WHERE id = ?`,
        [name, email, bio || null, finalAvatar, userId],
        function(err) {
          if (err) {
            logger.error('Error updating user', { error: err.message, userId: req.user.id });
            return res.status(500).json({ error: 'Failed to update profile' });
          }

          // Fetch updated user data
          db.get(
            'SELECT id, name, email, COALESCE(bio, "") as bio, avatar FROM users WHERE id = ?',
            [userId],
            (err, updatedUser) => {
              if (err) {
                logger.error('Error fetching updated user', { error: err.message, userId: req.user.id });
                return res.status(500).json({ error: 'Failed to fetch updated profile' });
              }

              // Update session if it exists
              if (req.session) {
                req.session.user = updatedUser;
              }

              // Update req.user
              req.user = updatedUser;

              res.json({
                user: updatedUser,
                message: 'Profile updated successfully'
              });
            }
          );
        }
      );
    }
  );
});

// Promote user to admin (admin only)
router.post('/promote-admin/:userId', requireAuth, requireAdmin, (req, res) => {
  const db = req.app.locals.db;
  const { userId } = req.params;

  // Verify target user exists
  db.get('SELECT id, name, email, role FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      logger.error('Error checking user', { error: err.message, userId: req.user.id });
      return res.status(500).json({ error: 'Failed to verify user' });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ error: 'User is already an admin' });
    }

    db.run('UPDATE users SET role = ? WHERE id = ?', ['admin', userId], function(err) {
      if (err) {
        logger.error('Error promoting user to admin', { error: err.message, targetUserId: req.params.userId, userId: req.user.id });
        return res.status(500).json({ error: 'Failed to promote user' });
      }

      res.json({
        success: true,
        message: `User ${user.name} has been promoted to admin`,
        promotedUser: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: 'admin'
        }
      });
    });
  });
});

module.exports = router;

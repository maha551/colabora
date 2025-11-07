const express = require('express');
const demoUsers = require('../demoUsers');

const router = express.Router();

// Login endpoint - token-based for demo
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  // Find user by email (ignoring password for demo)
  const user = demoUsers.find(u => u.email === email);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Create a simple token (in production, use JWT)
  const token = `demo-token-${user.id}-${Date.now()}`;

  if (req.session) {
    req.session.userId = user.id;
    req.session.user = user;
  }

  res.json({
    user,
    token,
    message: 'Login successful'
  });
});

// Register endpoint - simplified for demo (just returns existing users)
router.post('/register', (req, res) => {
  const { name, email, password } = req.body;

  // Check if user already exists
  const existingUser = demoUsers.find(u => u.email === email);
  if (existingUser) {
    return res.status(400).json({ error: 'User already exists' });
  }

  // For demo, just return an error since we're using fixed demo users
  res.status(400).json({ error: 'Registration is disabled in demo mode. Use one of the demo accounts.' });
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
        console.error('Error checking email:', err);
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
            console.error('Error updating user:', err);
            return res.status(500).json({ error: 'Failed to update profile' });
          }

          // Fetch updated user data
          db.get(
            'SELECT id, name, email, bio, avatar FROM users WHERE id = ?',
            [userId],
            (err, updatedUser) => {
              if (err) {
                console.error('Error fetching updated user:', err);
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

module.exports = router;

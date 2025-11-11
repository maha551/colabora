const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../config');

// JWT token generation
function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      name: user.name
    },
    config.JWT_CONFIG.secret,
    {
      expiresIn: config.JWT_CONFIG.expiresIn,
      issuer: config.JWT_CONFIG.issuer,
      audience: config.JWT_CONFIG.audience
    }
  );
}

// JWT token verification middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_CONFIG.secret, {
      issuer: config.JWT_CONFIG.issuer,
      audience: config.JWT_CONFIG.audience
    });

    req.user = {
      id: decoded.userId,
      email: decoded.email,
      name: decoded.name
    };

    next();
  } catch (error) {
    console.error('JWT verification failed:', error.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Password hashing
async function hashPassword(password) {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

// Password verification
async function verifyPassword(password, hashedPassword) {
  return await bcrypt.compare(password, hashedPassword);
}

// Session-based auth middleware (fallback for compatibility)
function authenticateSession(req, res, next) {
  if (req.session && req.session.userId && !req.user) {
    // In production, you should validate the session user exists in DB
    req.user = req.session.user;
  }

  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  next();
}

// Combined auth middleware (token first, then session)
function requireAuth(req, res, next) {
  // Try token auth first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticateToken(req, res, next);
  }

  // Fallback to session auth
  return authenticateSession(req, res, next);
}

// Admin role check (for future use)
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // TODO: Implement role checking when user roles are added
  // if (req.user.role !== 'admin') {
  //   return res.status(403).json({ error: 'Admin access required' });
  // }

  next();
}

// Middleware to check document access (owner or collaborator)
function requireDocumentAccess(req, res, next) {
  const db = req.app.locals.db;
  const documentId = req.params.documentId || req.params.id;
  const userId = req.user.id;

  if (!documentId) {
    return res.status(400).json({ error: 'Document ID is required' });
  }

  console.log(`[ACCESS CHECK] User ${userId} accessing document ${documentId}`);

  const query = `
    SELECT d.id, d.owner_id FROM documents d
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id
    WHERE d.id = ? AND (d.owner_id = ? OR dc.user_id = ?)
  `;

  db.get(query, [documentId, userId, userId], (err, document) => {
    if (err) {
      console.error('Error checking document access:', err);
      return res.status(500).json({ error: 'Access check failed' });
    }

    console.log(`[ACCESS CHECK] Result for user ${userId}, document ${documentId}:`, document ? 'GRANTED' : 'DENIED');

    if (!document) {
      console.log(`[ACCESS DENIED] User ${userId} cannot access document ${documentId}`);
      return res.status(403).json({ error: 'Access denied to this document' });
    }

    next();
  });
}

module.exports = {
  generateToken,
  authenticateToken,
  authenticateSession,
  requireAuth,
  requireAdmin,
  requireDocumentAccess,
  hashPassword,
  verifyPassword
};

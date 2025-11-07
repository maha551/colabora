const { generateToken, verifyPassword, hashPassword, authenticateToken } = require('../../server/middleware/auth');
const jwt = require('jsonwebtoken');
const config = require('../../server/config');

describe('Authentication Middleware', () => {
  describe('Password Hashing', () => {
    test('should hash password securely', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50); // bcrypt hashes are long
    });

    test('should verify correct password', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    test('should reject incorrect password', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword('WrongPassword123!', hash);
      expect(isValid).toBe(false);
    });

    test('should reject empty password', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword('', hash);
      expect(isValid).toBe(false);
    });
  });

  describe('JWT Token Generation', () => {
    const testUser = {
      id: 'test-user-123',
      name: 'Test User',
      email: 'test@example.com'
    };

    test('should generate valid JWT token', () => {
      const token = generateToken(testUser);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT has 3 parts
    });

    test('should contain correct payload in token', () => {
      const token = generateToken(testUser);
      const decoded = jwt.verify(token, config.JWT_CONFIG.secret);

      expect(decoded.userId).toBe(testUser.id);
      expect(decoded.email).toBe(testUser.email);
      expect(decoded.name).toBe(testUser.name);
      expect(decoded.iss).toBe(config.JWT_CONFIG.issuer);
      expect(decoded.aud).toBe(config.JWT_CONFIG.audience);
    });

    test('should expire after configured time', () => {
      const token = generateToken(testUser);

      // Fast-forward time past expiration
      const futureTime = Date.now() + (config.JWT_CONFIG.expiresIn * 1000) + 1000;

      expect(() => {
        jwt.verify(token, config.JWT_CONFIG.secret, {
          clockTimestamp: futureTime / 1000
        });
      }).toThrow('jwt expired');
    });
  });

  describe('JWT Token Verification', () => {
    let mockReq, mockRes, mockNext;

    beforeEach(() => {
      mockReq = {
        headers: {}
      };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      mockNext = jest.fn();
    });

    test('should call next() with valid token', () => {
      const testUser = { id: 'test-123', name: 'Test', email: 'test@example.com' };
      const token = generateToken(testUser);

      mockReq.headers.authorization = `Bearer ${token}`;

      authenticateToken(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toEqual({
        id: testUser.id,
        name: testUser.name,
        email: testUser.email
      });
    });

    test('should reject missing authorization header', () => {
      authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Access token required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should reject malformed authorization header', () => {
      mockReq.headers.authorization = 'InvalidFormat';

      authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Access token required' });
    });

    test('should reject invalid token', () => {
      mockReq.headers.authorization = 'Bearer invalid.jwt.token';

      authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    });

    test('should reject expired token', () => {
      const testUser = { id: 'test-123', name: 'Test', email: 'test@example.com' };

      // Create token that's already expired
      const expiredToken = jwt.sign(
        {
          userId: testUser.id,
          email: testUser.email,
          name: testUser.name
        },
        config.JWT_CONFIG.secret,
        {
          expiresIn: '-1h', // Already expired
          issuer: config.JWT_CONFIG.issuer,
          audience: config.JWT_CONFIG.audience
        }
      );

      mockReq.headers.authorization = `Bearer ${expiredToken}`;

      authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    });
  });

  describe('Security Edge Cases', () => {
    test('should handle very long passwords', async () => {
      const longPassword = 'A'.repeat(1000) + '1!'; // 1002 characters
      const hash = await hashPassword(longPassword);

      expect(hash).toBeDefined();
      const isValid = await verifyPassword(longPassword, hash);
      expect(isValid).toBe(true);
    });

    test('should handle special characters in passwords', async () => {
      const specialPassword = 'P@ssw0rd!#$%^&*()_+-=[]{}|;:,.<>?';
      const hash = await hashPassword(specialPassword);

      expect(hash).toBeDefined();
      const isValid = await verifyPassword(specialPassword, hash);
      expect(isValid).toBe(true);
    });

    test('should handle unicode characters in passwords', async () => {
      const unicodePassword = 'Pässwörd123!🚀🔒';
      const hash = await hashPassword(unicodePassword);

      expect(hash).toBeDefined();
      const isValid = await verifyPassword(unicodePassword, hash);
      expect(isValid).toBe(true);
    });
  });
});

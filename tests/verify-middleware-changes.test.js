/**
 * Verification Test for Middleware Standardization
 * 
 * This test verifies that:
 * 1. All modified routes correctly import middleware from centralized module
 * 2. Routes can be loaded without errors
 * 3. Middleware functions are available
 */

describe('Middleware Standardization Verification', () => {
  test('governance.js should import requireAuth from middleware/auth', () => {
    const governance = require('../server/routes/governance');
    const { requireAuth } = require('../server/middleware/auth');
    
    // Verify the route module loads without errors
    expect(governance).toBeDefined();
    expect(requireAuth).toBeDefined();
    expect(typeof requireAuth).toBe('function');
  });

  test('organizations.js should import requireAuth and requireAdmin from middleware/auth', () => {
    const organizations = require('../server/routes/organizations');
    const { requireAuth, requireAdmin } = require('../server/middleware/auth');
    
    // Verify the route module loads without errors
    expect(organizations).toBeDefined();
    expect(requireAuth).toBeDefined();
    expect(requireAdmin).toBeDefined();
    expect(typeof requireAuth).toBe('function');
    expect(typeof requireAdmin).toBe('function');
  });

  test('activity.js should import requireAuth from middleware/auth', () => {
    const activity = require('../server/routes/activity');
    const { requireAuth } = require('../server/middleware/auth');
    
    expect(activity).toBeDefined();
    expect(requireAuth).toBeDefined();
    expect(typeof requireAuth).toBe('function');
  });

  test('agreed-versions.js should import requireAuth from middleware/auth', () => {
    const agreedVersions = require('../server/routes/agreed-versions');
    const { requireAuth } = require('../server/middleware/auth');
    
    expect(agreedVersions).toBeDefined();
    expect(requireAuth).toBeDefined();
    expect(typeof requireAuth).toBe('function');
  });

  test('debated-proposals.js should import requireAuth from middleware/auth', () => {
    const debatedProposals = require('../server/routes/debated-proposals');
    const { requireAuth } = require('../server/middleware/auth');
    
    expect(debatedProposals).toBeDefined();
    expect(requireAuth).toBeDefined();
    expect(typeof requireAuth).toBe('function');
  });

  test('pending-votes.js should import requireAuth from middleware/auth', () => {
    const pendingVotes = require('../server/routes/pending-votes');
    const { requireAuth } = require('../server/middleware/auth');
    
    expect(pendingVotes).toBeDefined();
    expect(requireAuth).toBeDefined();
    expect(typeof requireAuth).toBe('function');
  });

  test('all routes should use centralized middleware (no inline functions)', () => {
    const fs = require('fs');
    const path = require('path');
    
    const routesToCheck = [
      'server/routes/governance.js',
      'server/routes/organizations.js',
      'server/routes/activity.js',
      'server/routes/agreed-versions.js',
      'server/routes/debated-proposals.js',
      'server/routes/pending-votes.js'
    ];

    routesToCheck.forEach(routePath => {
      const fullPath = path.join(__dirname, '..', routePath);
      const content = fs.readFileSync(fullPath, 'utf8');
      
      // Check that it imports from middleware/auth
      expect(content).toMatch(/require\(['"]\.\.\/middleware\/auth['"]\)/);
      
      // Check that it does NOT define inline requireAuth
      // (should not have "const requireAuth = (req, res, next) =>" after imports)
      const afterImports = content.split('require(').slice(1).join('');
      expect(afterImports).not.toMatch(/const requireAuth\s*=\s*\(req,\s*res,\s*next\)\s*=>/);
    });
  });
});


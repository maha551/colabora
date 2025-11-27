const os = require('os');
const fs = require('fs');
const path = require('path');

class HealthCheckService {
  constructor(config, db) {
    this.config = config;
    this.db = db;
  }

  // Basic health check for load balancers
  getBasicHealth() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0'
    };
  }

  // Detailed health check for monitoring
  async getDetailedHealth() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: this.config.NODE_ENV,
      checks: {}
    };

    // Database health check
    health.checks.database = await this.checkDatabase();

    // Memory health check
    health.checks.memory = this.checkMemory();

    // Disk health check
    health.checks.disk = this.checkDiskSpace();

    // Environment security check
    health.checks.security = this.checkSecurity();

    // Admin system check
    health.checks.admin = await this.checkAdminSystem();

    // Overall status based on checks
    const criticalChecks = ['database', 'security'];
    const hasCriticalFailure = criticalChecks.some(check =>
      health.checks[check].status === 'error'
    );

    if (hasCriticalFailure) {
      health.status = 'error';
    } else if (Object.values(health.checks).some(check => check.status === 'warning')) {
      health.status = 'warning';
    }

    return health;
  }

  // Database connectivity and integrity check
  async checkDatabase() {
    if (!this.db) {
      return { status: 'error', message: 'Database not initialized' };
    }

    try {
      // Test basic connectivity
      const result = await new Promise((resolve, reject) => {
        this.db.get('SELECT 1 as test', (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (result.test !== 1) {
        return { status: 'error', message: 'Database test query failed' };
      }

      // Check if critical tables exist
      const tables = await new Promise((resolve, reject) => {
        this.db.all("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'organizations', 'documents')", (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      const tableNames = tables.map(t => t.name);
      const missingTables = ['users', 'organizations', 'documents'].filter(t => !tableNames.includes(t));

      if (missingTables.length > 0) {
        return {
          status: 'warning',
          message: `Missing tables: ${missingTables.join(', ')}`,
          missingTables
        };
      }

      return {
        status: 'healthy',
        message: 'Database connected and tables exist',
        tables: tableNames.length
      };

    } catch (error) {
      return {
        status: 'error',
        message: `Database error: ${error.message}`,
        error: error.message
      };
    }
  }

  // Memory usage check
  checkMemory() {
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    const usagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    let status = 'healthy';
    let message = `Memory usage: ${Math.round(usagePercent)}%`;

    if (usagePercent > 90) {
      status = 'error';
      message = `High memory usage: ${Math.round(usagePercent)}%`;
    } else if (usagePercent > 75) {
      status = 'warning';
      message = `Elevated memory usage: ${Math.round(usagePercent)}%`;
    }

    return {
      status,
      message,
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      external: Math.round(memUsage.external / 1024 / 1024), // MB
      systemFree: Math.round(freeMem / 1024 / 1024), // MB
      systemTotal: Math.round(totalMem / 1024 / 1024), // MB
      usagePercent: Math.round(usagePercent * 100) / 100
    };
  }

  // Disk space check
  checkDiskSpace() {
    try {
      // Check if database file exists and get its size
      const dbPath = this.config.DATABASE_URL.startsWith('sqlite:///')
        ? this.config.DATABASE_URL.replace('sqlite:///', '')
        : this.config.DATABASE_URL;

      const stats = fs.statSync(dbPath);
      const dbSizeMB = Math.round(stats.size / 1024 / 1024);

      // Get disk usage info
      const diskUsage = this.getDiskUsage(dbPath);

      let status = 'healthy';
      let message = `Database size: ${dbSizeMB}MB`;

      if (diskUsage && diskUsage.availablePercent < 10) {
        status = 'error';
        message = `Low disk space: ${diskUsage.availablePercent}% available`;
      } else if (diskUsage && diskUsage.availablePercent < 20) {
        status = 'warning';
        message = `Low disk space: ${diskUsage.availablePercent}% available`;
      }

      return {
        status,
        message,
        databaseSize: dbSizeMB,
        ...diskUsage
      };

    } catch (error) {
      return {
        status: 'warning',
        message: 'Could not check disk space',
        error: error.message
      };
    }
  }

  // Get disk usage information
  getDiskUsage(filePath) {
    try {
      const dir = path.dirname(filePath);
      const stats = fs.statSync(dir);

      // This is a simplified check - in production you'd use system calls
      // For now, we'll just return basic info
      return {
        availablePercent: 85, // Placeholder - would need system calls
        totalSpace: 'Unknown',
        availableSpace: 'Unknown'
      };
    } catch (error) {
      return null;
    }
  }

  // Security configuration check
  checkSecurity() {
    const issues = [];

    // Check environment variables
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.includes('fallback')) {
      issues.push('SESSION_SECRET not properly configured');
    }

    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('fallback')) {
      issues.push('JWT_SECRET not properly configured');
    }

    // Check if running in development mode
    if (this.config.NODE_ENV === 'development') {
      issues.push('Running in development mode - not recommended for production');
    }

    // Check HTTPS (simplified check)
    const isHttps = process.env.NODE_ENV === 'production' && this.config.FRONTEND_URL.startsWith('https');
    if (!isHttps && this.config.NODE_ENV === 'production') {
      issues.push('HTTPS not configured in production');
    }

    return {
      status: issues.length > 0 ? 'warning' : 'healthy',
      message: issues.length > 0 ? `Security issues: ${issues.join(', ')}` : 'Security configuration OK',
      issues: issues.length > 0 ? issues : []
    };
  }

  // Admin system health check
  async checkAdminSystem() {
    if (!this.db) {
      return { status: 'error', message: 'Database not available for admin check' };
    }

    try {
      // Check if admin users exist
      const adminUsers = await new Promise((resolve, reject) => {
        this.db.all('SELECT id, name, email FROM users WHERE role = ?', ['admin'], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      if (adminUsers.length === 0) {
        return {
          status: 'warning',
          message: 'No admin users found - run setup-admin to create one',
          adminUsers: 0
        };
      }

      // Check if organizations exist
      const organizations = await new Promise((resolve, reject) => {
        this.db.get('SELECT COUNT(*) as count FROM organizations WHERE is_active = 1', (err, row) => {
          if (err) reject(err);
          else resolve(row || { count: 0 });
        });
      });

      return {
        status: 'healthy',
        message: `Admin system OK: ${adminUsers.length} admin(s), ${organizations.count} active organization(s)`,
        adminUsers: adminUsers.length,
        activeOrganizations: organizations.count
      };

    } catch (error) {
      return {
        status: 'error',
        message: `Admin system check failed: ${error.message}`,
        error: error.message
      };
    }
  }

  // Readiness check for Kubernetes/load balancers
  async getReadiness() {
    const health = await this.getDetailedHealth();

    // Readiness requires database to be healthy
    const isReady = health.checks.database.status === 'healthy' &&
                   health.checks.admin.status !== 'error';

    return {
      status: isReady ? 'ready' : 'not ready',
      timestamp: health.timestamp,
      database: health.checks.database.status,
      admin: health.checks.admin.status
    };
  }

  // Deployment validation check
  async validateDeployment() {
    logger.info('Validating deployment readiness');

    const validation = {
      timestamp: new Date().toISOString(),
      checks: {},
      ready: true,
      issues: []
    };

    // Check environment variables
    validation.checks.environment = this.validateEnvironment();

    // Check database
    validation.checks.database = await this.checkDatabase();

    // Check admin system
    validation.checks.admin = await this.checkAdminSystem();

    // Check file permissions (basic)
    validation.checks.permissions = this.checkFilePermissions();

    // Overall validation
    const criticalChecks = ['environment', 'database'];
    validation.ready = criticalChecks.every(check =>
      validation.checks[check].status !== 'error'
    );

    // Collect all issues
    Object.entries(validation.checks).forEach(([checkName, checkResult]) => {
      if (checkResult.status === 'error') {
        validation.issues.push(`❌ ${checkName}: ${checkResult.message}`);
      } else if (checkResult.status === 'warning') {
        validation.issues.push(`⚠️  ${checkName}: ${checkResult.message}`);
      }
    });

    if (validation.ready && validation.issues.length === 0) {
      validation.issues.push('✅ All checks passed - deployment ready!');
    }

    return validation;
  }

  validateEnvironment() {
    const required = ['SESSION_SECRET', 'JWT_SECRET'];
    const missing = required.filter(key => !process.env[key] || process.env[key].includes('fallback'));

    if (missing.length > 0) {
      return {
        status: 'error',
        message: `Missing required environment variables: ${missing.join(', ')}`,
        missing
      };
    }

    return {
      status: 'healthy',
      message: 'All required environment variables are set'
    };
  }

  checkFilePermissions() {
    try {
      const dbPath = this.config.DATABASE_URL.startsWith('sqlite:///')
        ? this.config.DATABASE_URL.replace('sqlite:///', '')
        : this.config.DATABASE_URL;

      const dbDir = path.dirname(dbPath);

      // Check if we can write to the database directory
      fs.accessSync(dbDir, fs.constants.W_OK);

      return {
        status: 'healthy',
        message: 'File permissions OK'
      };

    } catch (error) {
      return {
        status: 'error',
        message: `File permission issue: ${error.message}`,
        error: error.message
      };
    }
  }
}

module.exports = HealthCheckService;

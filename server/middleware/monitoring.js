const config = require('../config');
const { logger, securityLogger } = require('./logger');

// Metrics storage (in production, use Redis/Prometheus)
const metrics = {
  requests: {
    total: 0,
    byEndpoint: new Map(),
    byMethod: new Map(),
    responseTimes: [],
    errors: 0
  },
  authentication: {
    loginAttempts: 0,
    loginSuccesses: 0,
    loginFailures: 0,
    registrations: 0,
    tokenRefreshes: 0
  },
  security: {
    rateLimitHits: 0,
    suspiciousActivities: 0,
    corsViolations: 0,
    sqlInjectionAttempts: 0,
    xssAttempts: 0
  },
  performance: {
    databaseQueryTimes: [],
    memoryUsage: [],
    cpuUsage: []
  },
  business: {
    documentsCreated: 0,
    proposalsCreated: 0,
    votesCast: 0,
    commentsPosted: 0,
    activeUsers: new Set()
  }
};

// Metrics collection helpers
class MetricsCollector {
  constructor() {
    this.startTime = Date.now();

    // Don't start interval in test mode to avoid Jest open handle errors
    if (process.env.NODE_ENV !== 'test') {
      this.interval = setInterval(() => this.collectSystemMetrics(), 60000); // Every minute
    }
  }

  // Collect system performance metrics
  collectSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    metrics.performance.memoryUsage.push({
      timestamp: new Date(),
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external
    });

    metrics.performance.cpuUsage.push({
      timestamp: new Date(),
      user: cpuUsage.user,
      system: cpuUsage.system
    });

    // Keep only last 60 entries (1 hour of data)
    if (metrics.performance.memoryUsage.length > 60) {
      metrics.performance.memoryUsage.shift();
      metrics.performance.cpuUsage.shift();
    }

    // Log system metrics
    logger.info('System metrics collected', {
      memory: {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heap: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB/${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
      },
      uptime: `${Math.floor(process.uptime())}s`
    });
  }

  // Record HTTP request metrics
  recordRequest(method, url, statusCode, responseTime, userId = null) {
    metrics.requests.total++;

    // Track by endpoint (normalize URLs)
    const endpoint = this.normalizeEndpoint(url);
    if (!metrics.requests.byEndpoint.has(endpoint)) {
      metrics.requests.byEndpoint.set(endpoint, { count: 0, errors: 0, avgResponseTime: 0 });
    }
    const endpointStats = metrics.requests.byEndpoint.get(endpoint);
    endpointStats.count++;
    endpointStats.avgResponseTime = (endpointStats.avgResponseTime + responseTime) / 2;

    // Track by method
    if (!metrics.requests.byMethod.has(method)) {
      metrics.requests.byMethod.set(method, 0);
    }
    metrics.requests.byMethod.set(method, metrics.requests.byMethod.get(method) + 1);

    // Track errors
    if (statusCode >= 400) {
      metrics.requests.errors++;
      endpointStats.errors++;
    }

    // Track response times (keep last 1000)
    metrics.requests.responseTimes.push(responseTime);
    if (metrics.requests.responseTimes.length > 1000) {
      metrics.requests.responseTimes.shift();
    }

    // Track active users
    if (userId) {
      metrics.business.activeUsers.add(userId);
    }
  }

  // Record authentication metrics
  recordAuthEvent(event, success = true, details = {}) {
    switch (event) {
      case 'login_attempt':
        metrics.authentication.loginAttempts++;
        if (success) {
          metrics.authentication.loginSuccesses++;
        } else {
          metrics.authentication.loginFailures++;
        }
        break;
      case 'registration':
        metrics.authentication.registrations++;
        break;
      case 'token_refresh':
        metrics.authentication.tokenRefreshes++;
        break;
    }

    logger.info(`Auth event: ${event}`, { success, ...details });
  }

  // Record security events
  recordSecurityEvent(event, details = {}) {
    switch (event) {
      case 'rate_limit_hit':
        metrics.security.rateLimitHits++;
        break;
      case 'suspicious_activity':
        metrics.security.suspiciousActivities++;
        break;
      case 'cors_violation':
        metrics.security.corsViolations++;
        break;
      case 'sql_injection_attempt':
        metrics.security.sqlInjectionAttempts++;
        break;
      case 'xss_attempt':
        metrics.security.xssAttempts++;
        break;
    }

    securityLogger.securityEvent(event, details);
  }

  // Record business metrics
  recordBusinessEvent(event, details = {}) {
    switch (event) {
      case 'document_created':
        metrics.business.documentsCreated++;
        break;
      case 'proposal_created':
        metrics.business.proposalsCreated++;
        break;
      case 'vote_cast':
        metrics.business.votesCast++;
        break;
      case 'comment_posted':
        metrics.business.commentsPosted++;
        break;
    }

    logger.info(`Business event: ${event}`, details);
  }

  // Record database query performance
  recordDatabaseQuery(query, executionTime) {
    metrics.performance.databaseQueryTimes.push({
      timestamp: new Date(),
      query: query.substring(0, 100), // Truncate long queries
      executionTime
    });

    // Keep only last 100 entries
    if (metrics.performance.databaseQueryTimes.length > 100) {
      metrics.performance.databaseQueryTimes.shift();
    }

    // Log slow queries
    if (executionTime > 1000) { // > 1 second
      logger.warn('Slow database query detected', {
        query: query.substring(0, 200),
        executionTime: `${executionTime}ms`
      });
    }
  }

  // Normalize endpoint URLs for metrics
  normalizeEndpoint(url) {
    // Remove IDs and query parameters for aggregation
    return url
      .replace(/\/[a-f0-9-]{36}/g, '/:id') // UUIDs
      .replace(/\/[0-9]+/g, '/:id') // Numeric IDs
      .replace(/\?.*$/, ''); // Query parameters
  }

  // Get current metrics summary
  getMetricsSummary() {
    const uptime = Date.now() - this.startTime;
    const avgResponseTime = metrics.requests.responseTimes.length > 0
      ? metrics.requests.responseTimes.reduce((a, b) => a + b, 0) / metrics.requests.responseTimes.length
      : 0;

    const errorRate = metrics.requests.total > 0
      ? (metrics.requests.errors / metrics.requests.total) * 100
      : 0;

    return {
      uptime: Math.floor(uptime / 1000),
      requests: {
        total: metrics.requests.total,
        averageResponseTime: Math.round(avgResponseTime),
        errorRate: Math.round(errorRate * 100) / 100,
        errors: metrics.requests.errors,
        byMethod: Object.fromEntries(metrics.requests.byMethod),
        topEndpoints: Array.from(metrics.requests.byEndpoint.entries())
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 5)
          .map(([endpoint, stats]) => ({ endpoint, ...stats }))
      },
      authentication: { ...metrics.authentication },
      security: { ...metrics.security },
      business: {
        ...metrics.business,
        activeUsers: metrics.business.activeUsers.size
      },
      performance: {
        memoryUsage: metrics.performance.memoryUsage.length > 0
          ? metrics.performance.memoryUsage[metrics.performance.memoryUsage.length - 1]
          : null,
        avgDatabaseQueryTime: metrics.performance.databaseQueryTimes.length > 0
          ? metrics.performance.databaseQueryTimes.reduce((sum, q) => sum + q.executionTime, 0) / metrics.performance.databaseQueryTimes.length
          : 0
      }
    };
  }

  // Health check with thresholds
  getHealthStatus() {
    const summary = this.getMetricsSummary();
    const alerts = [];

    // Check error rate
    if (summary.requests.errorRate > 5) {
      alerts.push({
        level: 'warning',
        message: `High error rate: ${summary.requests.errorRate}%`
      });
    }

    // Check response time
    if (summary.requests.averageResponseTime > 2000) {
      alerts.push({
        level: 'warning',
        message: `Slow response time: ${summary.requests.averageResponseTime}ms`
      });
    }

    // Check memory usage
    const memUsage = summary.performance.memoryUsage;
    if (memUsage && memUsage.heapUsed / memUsage.heapTotal > 0.9) {
      alerts.push({
        level: 'critical',
        message: 'High memory usage detected'
      });
    }

    // Check security events
    if (summary.security.rateLimitHits > 10) {
      alerts.push({
        level: 'warning',
        message: `High rate limiting: ${summary.security.rateLimitHits} hits`
      });
    }

    return {
      status: alerts.some(a => a.level === 'critical') ? 'critical' :
              alerts.some(a => a.level === 'warning') ? 'warning' : 'healthy',
      alerts,
      metrics: summary
    };
  }

  // Cleanup on shutdown
  shutdown() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }
}

// Create singleton instance
const metricsCollector = new MetricsCollector();

// Middleware for request monitoring
function requestMetrics(req, res, next) {
  const startTime = Date.now();

  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const userId = req.user?.id;

    metricsCollector.recordRequest(
      req.method,
      req.originalUrl,
      res.statusCode,
      responseTime,
      userId
    );
  });

  next();
}

// Database query monitoring wrapper
function monitorDatabaseQuery(query, params = []) {
  return function(originalFunction) {
    return function(...args) {
      const startTime = Date.now();
      const callback = args[args.length - 1];

      // Wrap the callback to measure execution time
      args[args.length - 1] = function(...callbackArgs) {
        const executionTime = Date.now() - startTime;
        metricsCollector.recordDatabaseQuery(query, executionTime);

        // Call original callback
        callback.apply(this, callbackArgs);
      };

      return originalFunction.apply(this, args);
    };
  };
}

module.exports = {
  metricsCollector,
  requestMetrics,
  monitorDatabaseQuery
};

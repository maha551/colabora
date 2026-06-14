/**
 * HTTP Agent Configuration
 * Configures global HTTP/HTTPS agents with connection pooling for better performance
 * and to prevent connection exhaustion under load.
 */

const http = require('http');
const https = require('https');
const { logger } = require('../middleware/logger');

// Configure global HTTP agents with connection pooling
// These will be used by all HTTP/HTTPS requests in the application (including Resend API)
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000, // Keep connections alive for 1 second
  maxSockets: 50, // Maximum number of sockets per host
  maxFreeSockets: 10, // Maximum number of free sockets to keep open
  timeout: 60000, // Socket timeout in milliseconds
  scheduling: 'fifo' // First-in-first-out scheduling
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
  scheduling: 'fifo'
});

/**
 * Initialize global HTTP agents
 * This should be called early in application startup, before any HTTP requests are made
 */
function initializeHttpAgents() {
  // Set global agents for Node.js HTTP/HTTPS requests
  // These will be used by libraries like Resend SDK, fetch, axios, etc.
  global.httpAgent = httpAgent;
  global.httpsAgent = httpsAgent;
  
  // Also set as default agents for the http and https modules
  // This ensures all HTTP requests use connection pooling
  http.globalAgent = httpAgent;
  https.globalAgent = httpsAgent;
  
  logger.info('HTTP agents configured with connection pooling', {
    maxSockets: 50,
    maxFreeSockets: 10,
    keepAlive: true,
    timeout: 60000
  });
}

/**
 * Get HTTP agent instance
 * @returns {http.Agent}
 */
function getHttpAgent() {
  return httpAgent;
}

/**
 * Get HTTPS agent instance
 * @returns {https.Agent}
 */
function getHttpsAgent() {
  return httpsAgent;
}

/**
 * Get agent statistics for monitoring
 * @returns {Object} Agent statistics
 */
function getAgentStats() {
  return {
    http: {
      requests: httpAgent.requests || {},
      sockets: httpAgent.sockets || {},
      freeSockets: httpAgent.freeSockets || {}
    },
    https: {
      requests: httpsAgent.requests || {},
      sockets: httpsAgent.sockets || {},
      freeSockets: httpsAgent.freeSockets || {}
    }
  };
}

/**
 * Destroy all agents (useful for graceful shutdown)
 */
function destroyAgents() {
  httpAgent.destroy();
  httpsAgent.destroy();
  logger.info('HTTP agents destroyed');
}

module.exports = {
  initializeHttpAgents,
  getHttpAgent,
  getHttpsAgent,
  getAgentStats,
  destroyAgents
};

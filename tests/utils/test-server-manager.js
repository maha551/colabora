/**
 * Test Server Manager
 * Manages server lifecycle for tests with proper isolation
 */

const { startApplication } = require('../../server/bootstrap');
const http = require('http');

class TestServerManager {
  constructor() {
    this.servers = new Map();
    this.portCounter = 4000; // Start from 4000 to avoid conflicts with other services
    this.reservedPorts = new Set();
  }

  /**
   * Get next available port
   * @returns {number} Port number
   */
  getNextPort() {
    let port = this.portCounter++;
    // Ensure port is not reserved
    while (this.reservedPorts.has(port)) {
      port = this.portCounter++;
    }
    this.reservedPorts.add(port);
    return port;
  }

  /**
   * Release a port reservation
   * @param {number} port - Port number to release
   */
  releasePort(port) {
    this.reservedPorts.delete(port);
  }

  /**
   * Start a test server
   * @param {Object} options - Server options
   * @param {number} options.port - Port number (auto-assigned if not provided)
   * @param {string} options.testName - Test name for identification
   * @returns {Promise<Object>} Server instance and metadata
   */
  async startServer(options = {}) {
    const port = options.port || this.getNextPort();
    const testName = options.testName || `test-${Date.now()}`;

    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.PORT = port.toString();

    try {
      const server = await startApplication({
        port,
        returnServer: true
      });

      // Wait for server to be ready
      await this.waitForServer(port, 10000);

      const serverInfo = {
        server,
        port,
        testName,
        url: `http://localhost:${port}`
      };

      this.servers.set(testName, serverInfo);

      return serverInfo;
    } catch (error) {
      throw new Error(`Failed to start test server on port ${port}: ${error.message}`);
    }
  }

  /**
   * Wait for server to be ready
   * @param {number} port - Port number
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<void>}
   */
  async waitForServer(port, timeout = 10000) {
    const startTime = Date.now();
    const url = `http://localhost:${port}/api/health`;

    while (Date.now() - startTime < timeout) {
      try {
        await new Promise((resolve, reject) => {
          http.get(url, (res) => {
            if (res.statusCode === 200) {
              resolve();
            } else {
              reject(new Error(`Server returned ${res.statusCode}`));
            }
          }).on('error', reject);
        });
        return;
      } catch (error) {
        // Server not ready yet, wait and retry
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    throw new Error(`Server did not become ready within ${timeout}ms`);
  }

  /**
   * Stop a specific test server
   * @param {string} testName - Test name
   * @param {number} timeout - Timeout for server shutdown in milliseconds
   * @returns {Promise<void>}
   */
  async stopServer(testName, timeout = 10000) {
    const serverInfo = this.servers.get(testName);
    if (!serverInfo) {
      return;
    }

    try {
      // Close WebSocket connections if available
      if (serverInfo.server && serverInfo.server._serverManager) {
        try {
          const webSocketManager = require('../../server/modules/websocket');
          if (webSocketManager && webSocketManager.io) {
            webSocketManager.io.close();
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } catch (wsError) {
          // WebSocket may not be initialized, ignore
        }
      }

      // Stop scheduler if available
      if (serverInfo.server && serverInfo.server._scheduler) {
        try {
          if (typeof serverInfo.server._scheduler.stop === 'function') {
            serverInfo.server._scheduler.stop();
          }
        } catch (schedulerError) {
          console.warn(`Error stopping scheduler for ${testName}:`, schedulerError.message);
        }
      }

      // Close database connection if available
      if (serverInfo.server && serverInfo.server._dbManager) {
        try {
          await Promise.race([
            serverInfo.server._dbManager.close(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
          ]);
        } catch (dbError) {
          if (dbError.message !== 'Timeout') {
            console.warn(`Error closing database for ${testName}:`, dbError.message);
          }
        }
      }

      // Close server with timeout
      await Promise.race([
        new Promise((resolve, reject) => {
          if (serverInfo.server && typeof serverInfo.server.close === 'function') {
            serverInfo.server.close((err) => {
              if (err) {
                console.warn(`Error closing server ${testName}:`, err.message);
                reject(err);
              } else {
                resolve();
              }
            });
          } else {
            resolve();
          }
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Server shutdown timeout')), timeout))
      ]).catch((error) => {
        if (error.message === 'Server shutdown timeout') {
          console.warn(`Server ${testName} did not close within ${timeout}ms, forcing cleanup`);
        } else {
          throw error;
        }
      });

      // Release port reservation
      this.releasePort(serverInfo.port);

      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 200));

      this.servers.delete(testName);
    } catch (error) {
      console.warn(`Error stopping server ${testName}:`, error.message);
      // Still remove from map and release port to prevent leaks
      if (serverInfo) {
        this.releasePort(serverInfo.port);
      }
      this.servers.delete(testName);
    }
  }

  /**
   * Stop all test servers
   * @returns {Promise<void>}
   */
  async stopAllServers() {
    const stopPromises = Array.from(this.servers.keys()).map(testName =>
      this.stopServer(testName)
    );

    await Promise.all(stopPromises);
  }

  /**
   * Get server info by test name
   * @param {string} testName - Test name
   * @returns {Object|undefined} Server info
   */
  getServer(testName) {
    return this.servers.get(testName);
  }

  /**
   * Check if server is running
   * @param {string} testName - Test name
   * @returns {boolean} True if server is running
   */
  isServerRunning(testName) {
    return this.servers.has(testName);
  }
}

// Singleton instance
const testServerManager = new TestServerManager();

// Cleanup on process exit
process.on('exit', () => {
  testServerManager.stopAllServers().catch(() => {});
});

process.on('SIGINT', async () => {
  await testServerManager.stopAllServers();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await testServerManager.stopAllServers();
  process.exit(0);
});

module.exports = testServerManager;


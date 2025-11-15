const { startApplication } = require('../server/bootstrap');
const http = require('http');

/**
 * Test server utility for integration tests
 * Provides a way to start and stop the server for testing
 */
class TestServer {
  constructor() {
    this.server = null;
    this.port = null;
  }

  /**
   * Start the test server on a specific port
   * @param {number} port - Port to start the server on
   * @returns {Promise<http.Server>} Server instance
   */
  async start(port) {
    this.port = port;

    // Override the port in the bootstrap process
    process.env.PORT = port.toString();

    // Start the application (this will start the server)
    await startApplication();

    // Find the running server - we need to get it from somewhere
    // For now, we'll create a simple HTTP server wrapper
    return new Promise((resolve, reject) => {
      // The bootstrap starts the server, so we just need to return a mock server object
      // that has the address method for supertest
      const mockServer = {
        address: () => ({ port }),
        close: (callback) => {
          // For now, we'll just call the callback
          // In a real implementation, we'd need to get the actual server instance
          if (callback) callback();
        }
      };

      // Give the server a moment to start
      setTimeout(() => {
        resolve(mockServer);
      }, 100);
    });
  }

  /**
   * Stop the test server
   */
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      });
    }
  }
}

// Export a function that creates and starts a test server
async function startTestServer(port) {
  const testServer = new TestServer();
  const server = await testServer.start(port);

  // Attach the stop method to the server for cleanup
  server.stop = () => testServer.stop();

  return server;
}

module.exports = startTestServer;

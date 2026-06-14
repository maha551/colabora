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
    const { startApplication } = require('../server/bootstrap');
    this.server = await startApplication({ port, returnServer: true });
    return this.server;
  }

  /**
   * Stop the test server
   * Uses the underlying close() handle from bootstrap's mock server.
   * Avoids reading server.stop because tests attach a stop alias that points
   * back to TestServer.stop, which would otherwise cause infinite recursion.
   */
  async stop() {
    if (!this.server) {
      return;
    }
    const target = this.server;
    this.server = null;
    // Bootstrap test mode uses supertest with an unbound server (no listen()). Closing it throws ERR_SERVER_NOT_RUNNING.
    if (!target.listening) {
      return;
    }
    return new Promise((resolve, reject) => {
      try {
        target.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }
}

// Export a function that creates and starts a test server
async function startTestServer(port) {
  const testServer = new TestServer();
  const effectivePort = port || 3101;
  const server = await testServer.start(effectivePort);

  // Bootstrap sets stop() to release scheduler, DB pool, and health-monitor interval.
  // TestServer.stop only closes the HTTP server — must run both or Jest leaks handles / DB.
  const releaseBootstrapResources = server.stop;

  server.stop = async () => {
    await new Promise((resolve, reject) => {
      if (typeof releaseBootstrapResources === 'function') {
        releaseBootstrapResources((err) => (err ? reject(err) : resolve()));
      } else {
        resolve();
      }
    });
    await testServer.stop();
  };

  return server;
}

module.exports = startTestServer;

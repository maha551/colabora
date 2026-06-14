/**
 * Colabora Server Entry Point
 *
 * Delegates to bootstrap.startApplication(). Loading bootstrap alone does not start the server
 * when the entry file is this module — Node sets require.main to index.js, not bootstrap.js.
 */

const { startApplication } = require('./bootstrap');

if (require.main === module) {
  startApplication().catch((error) => {
    console.error('Critical error during application startup', error);
    process.exit(1);
  });
} else {
  module.exports = startApplication;
}

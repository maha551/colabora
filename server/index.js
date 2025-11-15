/**
 * Colabora Server Entry Point
 *
 * This file serves as the main entry point for the Colabora application.
 * It delegates to the bootstrap module for clean initialization and startup.
 */

// For testing: export the startApplication function
if (require.main === module) {
  // This file is being run directly (normal startup)
  require('./bootstrap');
} else {
  // This file is being required (for testing)
  module.exports = require('./bootstrap').startApplication;
}

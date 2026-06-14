const crypto = require('crypto');

function generateAnonymousToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { generateAnonymousToken };

const config = require('../config');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Validate registration legal consent payload.
 * @param {{ acceptedTerms?: boolean, termsVersion?: string, privacyVersion?: string }} body
 */
function validateRegistrationLegalConsent(body) {
  const acceptedTerms = body.accepted_terms ?? body.acceptedTerms;
  const termsVersion = body.terms_version ?? body.termsVersion;
  const privacyVersion = body.privacy_version ?? body.privacyVersion;

  const accepted = acceptedTerms === true || acceptedTerms === 1 || acceptedTerms === '1' || acceptedTerms === 'true';
  if (!accepted) {
    throw ApiError.validation(
      'You must accept the Terms of use and acknowledge the Privacy policy',
      null,
      'LEGAL_CONSENT_REQUIRED'
    );
  }

  if (termsVersion !== config.TERMS_VERSION) {
    throw ApiError.validation(
      'Terms of use have been updated. Please refresh the page and try again.',
      null,
      'TERMS_VERSION_MISMATCH'
    );
  }

  if (privacyVersion !== config.PRIVACY_VERSION) {
    throw ApiError.validation(
      'Privacy policy has been updated. Please refresh the page and try again.',
      null,
      'PRIVACY_VERSION_MISMATCH'
    );
  }
}

/** Build INSERT for new user with legal consent timestamps. */
function buildUserInsertWithLegalConsent({ userId, name, email, passwordHash, role = 'user' }) {
  return {
    sql: `INSERT INTO users (id, name, email, password_hash, role, terms_accepted_at, terms_version, privacy_version, created_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, CURRENT_TIMESTAMP)`,
    params: [userId, name, email, passwordHash, role, config.TERMS_VERSION, config.PRIVACY_VERSION],
  };
}

module.exports = {
  validateRegistrationLegalConsent,
  buildUserInsertWithLegalConsent,
};

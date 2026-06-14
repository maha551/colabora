/**
 * Public contact form — email delivery only (no DB persistence).
 * Mounted at /api/public/contact
 */

const express = require('express');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');
const { logger } = require('../../middleware/logger');
const { contactValidation } = require('../../middleware/validation');
const { sendContactFormEmail } = require('../../modules/emailService');
const config = require('../../config');

const router = express.Router();

router.post('/', ...contactValidation.create, asyncHandler(async (req, res) => {
  res.type('application/json');

  const { name, email, subject, message, website } = req.body;

  // Honeypot — pretend success for bots
  if (website && String(website).trim()) {
    logger.info('Contact form honeypot triggered', { ip: req.ip });
    return res.status(200).json({ message: 'Message sent successfully' });
  }

  const to = config.CONTACT_EMAIL || config.ADMIN_BOOTSTRAP_EMAIL;
  if (!to && config.NODE_ENV === 'production') {
    throw ApiError.serviceUnavailable('Contact email is not configured', null, 'CONTACT_NOT_CONFIGURED');
  }

  try {
    await sendContactFormEmail({
      to,
      name,
      email,
      subject,
      message,
      userAgent: req.get('User-Agent') || 'unknown',
      ip: req.ip || req.connection?.remoteAddress,
    });
  } catch (err) {
    // Email delivery is best-effort outside production (e.g. when no email
    // provider is configured in dev/test/CI). Surface failures only in production.
    if (config.NODE_ENV === 'production') {
      throw err;
    }
    logger.warn('Contact form email delivery failed (non-production)', { error: err.message });
  }

  res.status(200).json({ message: 'Message sent successfully' });
}));

module.exports = router;

/**
 * Public app configuration (non-secret server capabilities).
 */

const express = require('express');
const config = require('../config');

const router = express.Router();

router.get('/public', (req, res) => {
  res.json({
    videoRoomCreationEnabled: config.isVideoRoomCreationEnabled(),
    operatorName: config.SITE_OPERATOR_NAME || undefined,
    operatorAddress: config.SITE_OPERATOR_ADDRESS || undefined,
    contactEmail: config.CONTACT_EMAIL || undefined,
    termsVersion: config.TERMS_VERSION,
    privacyVersion: config.PRIVACY_VERSION,
  });
});

module.exports = router;

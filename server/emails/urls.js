const config = require('../config');

function appRoot() {
  return (config.FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');
}

/**
 * Append optional UTM params for non-sensitive links only (never use on token URLs).
 */
function withUtm(url, campaign) {
  if (!campaign) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}utm_source=transactional&utm_medium=email&utm_campaign=${encodeURIComponent(campaign)}`;
}

function document(documentId) {
  return `${appRoot()}/#document/${documentId}`;
}

function orgTab(organizationId, tab = 'dashboard') {
  return `${appRoot()}/#/organization/${organizationId}/${tab}`;
}

function activity(campaign) {
  return withUtm(`${appRoot()}/#/activity`, campaign);
}

function settings() {
  return `${appRoot()}/#/settings`;
}

function register(token, email, type) {
  let url = `${appRoot()}/register?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  if (type) {
    url += `&type=${encodeURIComponent(type)}`;
  }
  return url;
}

function resetPassword(token) {
  return `${appRoot()}/reset-password?token=${encodeURIComponent(token)}`;
}

function orgDashboard(organizationId, campaign) {
  return withUtm(orgTab(organizationId, 'dashboard'), campaign);
}

module.exports = {
  appRoot,
  withUtm,
  document,
  orgTab,
  activity,
  settings,
  register,
  resetPassword,
  orgDashboard,
};

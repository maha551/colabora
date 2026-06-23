'use strict';

const templates = require('../../docs/rfc/participation-graph-templates.json');

const PROFILES = templates.profiles || {};

function getProfile(profileId) {
  return PROFILES[profileId] || PROFILES.classical_committee || {};
}

function listProfileIds() {
  return Object.keys(PROFILES);
}

module.exports = {
  PROFILES,
  getProfile,
  listProfileIds,
};

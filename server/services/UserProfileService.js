'use strict';

const TransactionManager = require('../database/services/TransactionManager');
const { usersShareActiveOrganization } = require('../utils/permissionUtils');
const { isRepresentative } = require('../modules/permissions');
const { safeJsonParse, safeJsonParseObject } = require('../utils/jsonUtils');
const { camelCaseKeys } = require('../utils/dataTransform');

const PROFILE_VISIBILITY = ['hidden', 'org_members', 'representatives'];
const LINK_TYPES = ['website', 'linkedin', 'github', 'mastodon', 'custom'];
const CONTACT_METHODS = ['email', 'phone'];

function getDefaultContact() {
  return {
    phoneVisibility: 'hidden',
    emailVisibility: 'hidden',
    preferredMethod: 'email',
  };
}

function parseProfileData(raw) {
  if (!raw) return {};
  const parsed = typeof raw === 'string' ? safeJsonParseObject(raw) : raw;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const data = camelCaseKeys(parsed);
  if (data.contact?.preferredMethod === 'in_app') {
    data.contact.preferredMethod = 'email';
  }
  return data;
}

function mergeProfileData(existing, incoming) {
  const base = { ...existing };
  if (incoming.headline !== undefined) base.headline = incoming.headline;
  if (incoming.links !== undefined) base.links = incoming.links;
  if (incoming.contact !== undefined) {
    base.contact = { ...(base.contact || getDefaultContact()), ...incoming.contact };
  }
  if (incoming.tags !== undefined) {
    base.tags = { ...(base.tags || { interests: [], skills: [], visibility: 'org_members' }), ...incoming.tags };
  }
  return base;
}

async function callersShareActiveOrgMembership(db, callerId, targetUserId, organizationId) {
  if (!organizationId) return false;
  const row = await TransactionManager.query(db, `
    SELECT 1
    FROM organization_members om_caller
    JOIN organization_members om_target
      ON om_caller.organization_id = om_target.organization_id
    JOIN organizations o ON o.id = om_caller.organization_id AND o.is_active = true
    WHERE om_caller.organization_id = ?
      AND om_caller.user_id = ?
      AND om_target.user_id = ?
      AND om_caller.status = 'active'
      AND om_target.status = 'active'
    LIMIT 1
  `, [organizationId, callerId, targetUserId]);
  return !!row;
}

async function callerSharesOrgWithTarget(db, callerId, targetUserId, contextOrganizationId = null) {
  if (callerId === targetUserId) return true;
  if (contextOrganizationId) {
    return callersShareActiveOrgMembership(db, callerId, targetUserId, contextOrganizationId);
  }
  return usersShareActiveOrganization(db, callerId, targetUserId);
}

async function callerIsRepresentativeInSharedOrg(db, callerId, targetUserId, contextOrganizationId = null) {
  if (callerId === targetUserId) return true;

  if (contextOrganizationId) {
    const sharesOrg = await callersShareActiveOrgMembership(db, callerId, targetUserId, contextOrganizationId);
    if (!sharesOrg) return false;
    return isRepresentative(db, callerId, contextOrganizationId);
  }

  const sharedOrgs = await TransactionManager.queryAll(db, `
    SELECT om_caller.organization_id
    FROM organization_members om_caller
    JOIN organization_members om_target
      ON om_caller.organization_id = om_target.organization_id
    JOIN organizations o ON o.id = om_caller.organization_id AND o.is_active = true
    WHERE om_caller.user_id = ?
      AND om_target.user_id = ?
      AND om_caller.status = 'active'
      AND om_target.status = 'active'
  `, [callerId, targetUserId]);

  for (const row of sharedOrgs) {
    if (await isRepresentative(db, callerId, row.organization_id)) {
      return true;
    }
  }

  return false;
}

function normalizeVisibility(visibility) {
  if (visibility === null || visibility === undefined) return null;
  return String(visibility).trim().toLowerCase();
}

async function canViewWithVisibility(db, callerId, targetUserId, visibility, contextOrganizationId = null) {
  if (callerId === targetUserId) return true;
  const normalizedVisibility = normalizeVisibility(visibility);
  if (!normalizedVisibility || normalizedVisibility === 'hidden') return false;
  if (normalizedVisibility === 'org_members') {
    return callerSharesOrgWithTarget(db, callerId, targetUserId, contextOrganizationId);
  }
  if (normalizedVisibility === 'representatives') {
    return callerIsRepresentativeInSharedOrg(db, callerId, targetUserId, contextOrganizationId);
  }
  return false;
}

function normalizeTagList(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const result = [];
  for (const tag of tags) {
    const normalized = String(tag || '').trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= 10) break;
  }
  return result;
}

async function filterProfileDataForViewer(db, callerId, targetUserId, profileData, userEmail, contextOrganizationId = null) {
  if (callerId === targetUserId) {
    return profileData || {};
  }

  const filtered = {};
  const data = profileData || {};
  const viewOpts = contextOrganizationId;

  if (data.headline && (await canViewWithVisibility(db, callerId, targetUserId, 'org_members', viewOpts))) {
    filtered.headline = data.headline;
  }

  if (Array.isArray(data.links)) {
    const visibleLinks = [];
    for (const link of data.links) {
      const visibility = link.visibility ?? link.visibilityLevel ?? link.visibility_level;
      if (await canViewWithVisibility(db, callerId, targetUserId, visibility, viewOpts)) {
        visibleLinks.push(link);
      }
    }
    if (visibleLinks.length > 0) filtered.links = visibleLinks;
  }

  if (data.contact) {
    const contact = {};
    if (data.contact.phone && await canViewWithVisibility(db, callerId, targetUserId, data.contact.phoneVisibility, viewOpts)) {
      contact.phone = data.contact.phone;
    }
    if (userEmail && await canViewWithVisibility(db, callerId, targetUserId, data.contact.emailVisibility, viewOpts)) {
      contact.email = userEmail;
    }
    if (data.contact.preferredMethod && await canViewWithVisibility(db, callerId, targetUserId, 'org_members', viewOpts)) {
      contact.preferredMethod = data.contact.preferredMethod;
    }
    if (Object.keys(contact).length > 0) filtered.contact = contact;
  }

  if (data.tags) {
    const tagVisibility = data.tags.visibility || 'org_members';
    if (await canViewWithVisibility(db, callerId, targetUserId, tagVisibility, viewOpts)) {
      filtered.tags = {
        interests: data.tags.interests || [],
        skills: data.tags.skills || [],
      };
    }
  }

  return filtered;
}

async function getSharedMemberships(db, callerId, targetUserId) {
  const rows = await TransactionManager.queryAll(db, `
    SELECT
      o.id AS organization_id,
      o.name AS organization_name,
      om_target.status,
      om_target.joined_at,
      CASE WHEN orr_target.id IS NOT NULL THEN true ELSE false END AS is_representative,
      ml.city,
      ml.region,
      ml.country_code,
      ml.show_on_map
    FROM organization_members om_caller
    JOIN organization_members om_target
      ON om_caller.organization_id = om_target.organization_id
    JOIN organizations o ON om_caller.organization_id = o.id AND o.is_active = true
    LEFT JOIN organization_representatives orr_target
      ON orr_target.organization_id = om_target.organization_id
      AND orr_target.user_id = om_target.user_id
      AND orr_target.status = 'active'
    LEFT JOIN member_locations ml
      ON ml.user_id = om_target.user_id
      AND ml.organization_id = om_target.organization_id
      AND ml.show_on_map = true
    WHERE om_caller.user_id = ?
      AND om_target.user_id = ?
      AND om_caller.status = 'active'
      AND om_target.status IN ('active', 'legacy', 'suspended')
    ORDER BY o.name ASC
  `, [callerId, targetUserId]);

  return rows.map((row) => {
    const membership = {
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      isRepresentative: !!row.is_representative,
      status: row.status,
      joinedAt: row.joined_at,
    };
    if (row.city && row.country_code && row.show_on_map) {
      membership.location = {
        city: row.city,
        region: row.region || null,
        countryCode: row.country_code,
      };
    }
    return membership;
  });
}

function buildUserResponse(userRow, options = {}) {
  const {
    isSelf = false,
    profileData = {},
    timezone = null,
  } = options;

  const response = {
    id: userRow.id,
    name: userRow.name,
    bio: userRow.bio || '',
    avatar: userRow.avatar || null,
    profileData,
  };

  if (isSelf) {
    response.email = userRow.email;
    response.role = userRow.role;
    response.defaultHomeView = userRow.default_home_view || 'activity';
    response.preferences = safeJsonParseObject(userRow.preferences);
    if (timezone) response.timezone = timezone;
  } else if (timezone) {
    response.timezone = timezone;
  }

  return response;
}

async function getProfileForViewer(db, callerId, targetUserId, contextOrganizationId) {
  const isSelf = callerId === targetUserId;

  if (!isSelf) {
    const sharesOrg = await usersShareActiveOrganization(db, callerId, targetUserId);
    if (!sharesOrg) {
      return { forbidden: true };
    }
  }

  const userRow = await TransactionManager.query(db, `
    SELECT id, name, email, COALESCE(bio, '') AS bio, avatar, role,
      COALESCE(default_home_view, 'activity') AS default_home_view,
      COALESCE(preferences, '{}') AS preferences,
      COALESCE(profile_data, '{}') AS profile_data
    FROM users WHERE id = ?
  `, [targetUserId]);

  if (!userRow) return { notFound: true };

  const fullProfileData = parseProfileData(userRow.profile_data);
  const preferences = camelCaseKeys(safeJsonParseObject(userRow.preferences));
  const timezoneVisibility = preferences.timezoneVisibility || 'org_members';
  let exposedTimezone = null;

  if (isSelf || (timezoneVisibility !== 'hidden' && await callerSharesOrgWithTarget(db, callerId, targetUserId, contextOrganizationId))) {
    exposedTimezone = preferences.timezone || null;
  }

  const filteredProfileData = isSelf
    ? fullProfileData
    : await filterProfileDataForViewer(db, callerId, targetUserId, fullProfileData, userRow.email, contextOrganizationId);

  const user = buildUserResponse(userRow, {
    isSelf,
    profileData: filteredProfileData,
    timezone: exposedTimezone,
  });

  if (isSelf) {
    user.preferences = preferences;
    user.defaultHomeView = userRow.default_home_view || 'activity';
    user.role = userRow.role;
  }

  const result = { user };

  if (!isSelf) {
    const memberships = await getSharedMemberships(db, callerId, targetUserId);
    result.memberships = memberships;
    if (contextOrganizationId) {
      const contextOrganization = memberships.find((m) => m.organizationId === contextOrganizationId);
      if (contextOrganization) {
        result.contextOrganization = contextOrganization;
      }
    }
  }

  return result;
}

function validateAndNormalizeProfileData(data) {
  if (data === null || data === undefined) return {};
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('profileData must be an object');
  }

  const allowedKeys = ['headline', 'links', 'contact', 'tags'];
  for (const key of Object.keys(data)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`Unknown profileData key: ${key}`);
    }
  }

  const normalized = {};

  if (data.headline !== undefined) {
    const headline = String(data.headline).trim();
    if (headline.length > 80) throw new Error('headline must be at most 80 characters');
    normalized.headline = headline;
  }

  if (data.links !== undefined) {
    if (!Array.isArray(data.links)) throw new Error('links must be an array');
    if (data.links.length > 5) throw new Error('links must contain at most 5 items');
    normalized.links = data.links.map((link) => {
      if (!link || typeof link !== 'object') throw new Error('Each link must be an object');
      if (!LINK_TYPES.includes(link.type)) throw new Error('Invalid link type');
      const visibility = normalizeVisibility(link.visibility ?? link.visibility_level);
      if (!visibility || !PROFILE_VISIBILITY.includes(visibility)) throw new Error('Invalid link visibility');
      const url = String(link.url || '').trim();
      if (!url.startsWith('https://')) throw new Error('Link URL must use HTTPS');
      const item = { type: link.type, url, visibility };
      if (link.type === 'custom') {
        const label = String(link.label || '').trim();
        if (!label) throw new Error('Custom links require a label');
        item.label = label;
      }
      return item;
    });
  }

  if (data.contact !== undefined) {
    if (typeof data.contact !== 'object' || Array.isArray(data.contact)) {
      throw new Error('contact must be an object');
    }
    const contact = { ...getDefaultContact(), ...data.contact };
    if (contact.phone !== undefined && contact.phone !== null && contact.phone !== '') {
      const phone = String(contact.phone).trim();
      if (phone.length > 20 || !/^[+\d\s\-()]+$/.test(phone)) {
        throw new Error('Invalid phone number format');
      }
      contact.phone = phone;
    } else {
      delete contact.phone;
    }
    if (!PROFILE_VISIBILITY.includes(contact.phoneVisibility)) throw new Error('Invalid phoneVisibility');
    if (!PROFILE_VISIBILITY.includes(contact.emailVisibility)) throw new Error('Invalid emailVisibility');
    if (contact.preferredMethod === 'in_app') {
      contact.preferredMethod = 'email';
    }
    if (!CONTACT_METHODS.includes(contact.preferredMethod)) {
      throw new Error('Invalid preferredMethod');
    }
    normalized.contact = contact;
  }

  if (data.tags !== undefined) {
    if (typeof data.tags !== 'object' || Array.isArray(data.tags)) {
      throw new Error('tags must be an object');
    }
    const visibility = data.tags.visibility || 'org_members';
    if (!PROFILE_VISIBILITY.includes(visibility)) throw new Error('Invalid tags visibility');
    normalized.tags = {
      interests: normalizeTagList(data.tags.interests),
      skills: normalizeTagList(data.tags.skills),
      visibility,
    };
    for (const tag of [...normalized.tags.interests, ...normalized.tags.skills]) {
      if (tag.length > 40) throw new Error('Each tag must be at most 40 characters');
      if (!/^[a-z0-9][a-z0-9\s\-]*$/.test(tag)) {
        throw new Error('Tags may only contain letters, numbers, spaces, and hyphens');
      }
    }
  }

  return normalized;
}

module.exports = {
  PROFILE_VISIBILITY,
  LINK_TYPES,
  CONTACT_METHODS,
  getDefaultContact,
  parseProfileData,
  mergeProfileData,
  filterProfileDataForViewer,
  getSharedMemberships,
  getProfileForViewer,
  validateAndNormalizeProfileData,
  normalizeTagList,
  canViewWithVisibility,
};

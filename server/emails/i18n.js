const fs = require('fs');
const path = require('path');

const VALID_LOCALE_CODES = [
  'en', 'es', 'fr', 'de', 'ar', 'ru', 'zh', 'pt', 'hi', 'ja', 'id', 'tr', 'vi', 'ko', 'it', 'pl', 'nl', 'fa', 'ur',
];

const APP_ROOT = path.join(__dirname, '..', '..');
const LOCALES_ROOT_CANDIDATES = [
  path.join(APP_ROOT, 'client', 'build', 'locales'),
  path.join(APP_ROOT, 'client', 'public', 'locales'),
];
const cache = new Map();
const notificationsCache = new Map();

function resolveLocalesRoot() {
  for (const dir of LOCALES_ROOT_CANDIDATES) {
    if (fs.existsSync(path.join(dir, 'en', 'emails.json'))) return dir;
  }
  return LOCALES_ROOT_CANDIDATES[LOCALES_ROOT_CANDIDATES.length - 1];
}

let localesRoot = resolveLocalesRoot();

function normalizeLocale(locale) {
  if (!locale || typeof locale !== 'string') return 'en';
  const code = locale.trim().toLowerCase().split('-')[0];
  return VALID_LOCALE_CODES.includes(code) ? code : 'en';
}

function loadLocaleBundle(locale) {
  const code = normalizeLocale(locale);
  if (cache.has(code)) return cache.get(code);

  const filePath = path.join(localesRoot, code, 'emails.json');
  let bundle = {};
  try {
    if (fs.existsSync(filePath)) {
      bundle = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } else if (code !== 'en') {
      return loadLocaleBundle('en');
    }
  } catch {
    if (code !== 'en') return loadLocaleBundle('en');
  }

  cache.set(code, bundle);
  return bundle;
}

function getNested(obj, keyPath) {
  return keyPath.split('.').reduce((acc, part) => {
    if (acc && typeof acc === 'object' && part in acc) return acc[part];
    return undefined;
  }, obj);
}

function interpolate(template, vars = {}) {
  if (typeof template !== 'string') return '';
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = vars[key];
    return val !== undefined && val !== null ? String(val) : '';
  });
}

/**
 * Translate a dot-path key from emails.json
 * @param {string} locale
 * @param {string} key - e.g. "invitation.subject"
 * @param {Object} vars
 */
function t(locale, key, vars = {}) {
  const bundle = loadLocaleBundle(locale);
  let value = getNested(bundle, key);
  if (value === undefined && normalizeLocale(locale) !== 'en') {
    value = getNested(loadLocaleBundle('en'), key);
  }
  if (value === undefined) return key;
  return interpolate(value, vars);
}

function loadNotificationsBundle(locale) {
  const code = normalizeLocale(locale);
  if (notificationsCache.has(code)) return notificationsCache.get(code);

  const filePath = path.join(localesRoot, code, 'notifications.json');
  let bundle = {};
  try {
    if (fs.existsSync(filePath)) {
      bundle = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } else if (code !== 'en') {
      return loadNotificationsBundle('en');
    }
  } catch {
    if (code !== 'en') return loadNotificationsBundle('en');
  }

  notificationsCache.set(code, bundle);
  return bundle;
}

/**
 * Translate a dot-path key from notifications.json (short-form push/telegram copy).
 * @param {string} locale
 * @param {string} key
 * @param {Object} vars
 * @returns {string|undefined}
 */
function tn(locale, key, vars = {}) {
  const bundle = loadNotificationsBundle(locale);
  let value = getNested(bundle, key);
  if (value === undefined && normalizeLocale(locale) !== 'en') {
    value = getNested(loadNotificationsBundle('en'), key);
  }
  if (value === undefined) return undefined;
  return interpolate(value, vars);
}

function resolveLocale(userOrLocale) {
  if (typeof userOrLocale === 'string') return normalizeLocale(userOrLocale);
  if (!userOrLocale) return 'en';
  const prefs = userOrLocale.preferences;
  const locale = typeof prefs === 'string' ? prefs : prefs?.locale;
  return normalizeLocale(locale);
}

function formatDateTime(locale, date) {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat(normalizeLocale(locale), {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function formatShortDateTime(locale, date) {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat(normalizeLocale(locale), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function formatRelativeDeadline(locale, deadline) {
  const d = new Date(deadline);
  const now = new Date();
  const diffMs = d - now;
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays > 0) {
    return diffDays === 1
      ? t(locale, 'common.inOneDay')
      : t(locale, 'common.inDays', { count: diffDays });
  }
  if (diffMs > 0) {
    return formatShortDateTime(locale, d);
  }
  return formatShortDateTime(locale, d);
}

function clearLocaleCache() {
  localesRoot = resolveLocalesRoot();
  cache.clear();
  notificationsCache.clear();
}

/**
 * Resolve locale from a users table row (preferences JSON column).
 */
function localeFromUserRow(userRow) {
  if (!userRow) return 'en';
  let prefs = userRow.preferences;
  if (typeof prefs === 'string') {
    try {
      prefs = JSON.parse(prefs || '{}');
    } catch {
      prefs = {};
    }
  }
  return resolveLocale({ preferences: prefs || {} });
}

module.exports = {
  VALID_LOCALE_CODES,
  normalizeLocale,
  t,
  tn,
  resolveLocale,
  localeFromUserRow,
  formatDateTime,
  formatShortDateTime,
  formatRelativeDeadline,
  clearLocaleCache,
};

const config = require('../config');
const { appRoot } = require('./urls');

const DEFAULT_ORGANIZATION_COLOR = '#3B82F6';

const COLORS = {
  primary: '#0969DA',
  canvas: '#f4f4f5',
  card: '#ffffff',
  text: '#1a1a1a',
  textMuted: '#6b7280',
  border: '#e0e0e0',
  deadline: '#f59e0b',
  deadlineBg: '#fef3c7',
  deadlineText: '#92400e',
  voting: '#10b981',
  votingBg: '#d1fae5',
  votingText: '#065f46',
  danger: '#dc2626',
  dangerBg: '#fef2f2',
  dangerText: '#991b1b',
  link: '#0969DA',
};

const TYPOGRAPHY = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  bodySize: '16px',
  smallSize: '14px',
  footerSize: '12px',
  headingSize: '24px',
  sectionHeadingSize: '18px',
};

const LAYOUT = {
  maxWidth: 600,
  buttonMinHeight: 44,
  borderRadius: 8,
  buttonRadius: 6,
};

function defaultLogoUrl() {
  if (config.APP_LOGO_URL) return config.APP_LOGO_URL;
  return `${appRoot()}/logo-light.png`;
}

module.exports = {
  DEFAULT_ORGANIZATION_COLOR,
  COLORS,
  TYPOGRAPHY,
  LAYOUT,
  defaultLogoUrl,
};

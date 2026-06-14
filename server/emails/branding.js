const config = require('../config');
const { DEFAULT_ORGANIZATION_COLOR, defaultLogoUrl } = require('./tokens');

function resolveAppBranding() {
  return {
    appName: 'Colabora',
    primaryColor: '#0969DA',
    logoUrl: defaultLogoUrl(),
    fromName: config.RESEND_FROM_NAME || 'Colabora',
    displayTitle: 'Colabora',
    useOrgBranding: false,
    orgName: null,
  };
}

/**
 * Merge organization branding onto app defaults.
 * @param {Object|null} org - { name, brandingColor, brandingLogoUrl, brandingTitle }
 */
function resolveOrgBranding(org) {
  const app = resolveAppBranding();
  if (!org) return app;

  const orgName = org.name || org.organizationName || null;
  return {
    ...app,
    primaryColor: org.brandingColor || org.branding_color || DEFAULT_ORGANIZATION_COLOR,
    logoUrl: org.brandingLogoUrl || org.branding_logo_url || app.logoUrl,
    displayTitle: org.brandingTitle || org.branding_title || orgName || app.displayTitle,
    useOrgBranding: !!(org.brandingLogoUrl || org.branding_logo_url || org.brandingColor || org.branding_color),
    orgName,
    fromName: orgName ? `${orgName} via Colabora` : app.fromName,
  };
}

/**
 * Build from org row fields as returned by OrganizationService.
 */
function brandingFromOrgRow(row) {
  if (!row) return resolveAppBranding();
  return resolveOrgBranding({
    name: row.name,
    brandingColor: row.branding_color || row.brandingColor,
    brandingLogoUrl: row.branding_logo_url || row.brandingLogoUrl,
    brandingTitle: row.branding_title || row.brandingTitle,
  });
}

module.exports = {
  resolveAppBranding,
  resolveOrgBranding,
  brandingFromOrgRow,
};

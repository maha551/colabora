# Organization Design Customization Feature

**Status:** ✅ Implemented  
**Last Updated:** 2025-01-27

## Overview

Representatives can now customize the icon set and font family for their organization. These settings apply only in **organization territory** (when viewing the organization management area or an organizational document that belongs to that org). In **personal views** the app always uses default styling (e.g. Lucide icons). Personal views are: activity, documents, profile, organizations, admin, search, report-issue, member-profile; the list is defined in [client/src/utils/organizationTerritory.ts](client/src/utils/organizationTerritory.ts) as `PERSONAL_VIEWS` and `isPersonalView()`. Any new `AppView` value must be classified there as personal or org-related.

Users can also customize the font family for their personal documents (documents that don't belong to an organization) through their profile settings.

## Features

### Icon Set Selection
- **Available Options:**
  - `lucide` - Modern, minimal, tech-focused (default)
  - `tabler` - Warmer, more rounded, human-friendly
  - `heroicons` - Softer, approachable, friendly

### Font Family Selection
- **Available Options:**
  - `inter` - Friendly, modern, highly readable (default)
  - `work-sans` - Humanist, approachable
  - `poppins` - Friendly, rounded
  - `merriweather` - Warm serif (for document content)

## Implementation Details

### Database
- Added `icon_set` and `font_family` columns to `organizations` table
- Migration script: `server/migrations/add-organization-design-customization.js`
- **Note:** Run migration manually: `node server/migrations/add-organization-design-customization.js`

### Backend
- Validation rules added in `server/middleware/validation.js`
- API endpoint updated in `server/routes/organizations.js`
- WebSocket broadcasting includes `iconSet` and `fontFamily`
- All organization responses include these fields

### Frontend
- Type definitions updated in `client/src/types/index.ts` (Organization and User types)
- API client updated in `client/src/lib/api.ts`
- Font imports added to `client/src/index.css` (Bunny Fonts)
- CSS variables and classes for font families
- Icon loader utility: `client/src/lib/iconLoader.ts`
- Design context provider: `client/src/contexts/OrganizationDesignContext.tsx` (supports both organization and user fonts)
- Branding dialog extended: `client/src/components/OrganizationManagement/OrganizationBrandingDialog.tsx`
- User profile extended: `client/src/components/UserProfile.tsx` (font selector for personal documents)
- RepresentativesTab displays current settings

### Dependencies Added
- `@tabler/icons-react` - Tabler icon library
- `@heroicons/react` - Heroicons library

## Usage

### For Representatives

1. Navigate to Organization Management → Representatives Tab
2. Click "Customize" in the Organization Design section
3. Select Icon Set from dropdown
4. Select Font Family from dropdown
5. Click "Save Changes"

### For Users (Personal Documents)

1. Navigate to Profile (via user menu)
2. Scroll to "Font Family (Personal Documents)" section
3. Select your preferred font from the dropdown
4. Click "Save Changes"
5. The selected font will apply when viewing personal documents (documents that don't belong to an organization)

### How It Works

**Organization Fonts and Icons:**
- Settings are stored per organization in the database
- Design settings (font, icon set) apply only when in **organization territory** (organization view or org document view that matches the context org)
- In **personal views** (activity, documents, profile, organizations, admin, search, report-issue, member-profile), the app always uses defaults (e.g. Lucide icons, system/user font); see `PERSONAL_VIEWS` and `isPersonalView()` in organizationTerritory.ts
- Font family is applied via CSS classes on the document root when in org territory
- Icon set is exposed as `effectiveIconSet` from `useOrganizationDesign()`; the `<Icon>` component uses it so icons are territory- and view-aware
- Changes broadcast via WebSocket to all connected users
- Settings persist across sessions

**Personal Document Fonts:**
- Font preference is stored in user preferences (`users.preferences.fontFamily`)
- Applies automatically when viewing personal documents (documents with `ownershipType === 'personal'` and no `organizationId`)
- Priority: Organization font > User font (for personal docs) > System default
- Font applies globally to both UI and document content

## Technical Architecture

### Design Context Provider
- Wraps the entire app in `App.tsx`
- Determines active organization: `selectedOrganization` > `documentOrganization` > `primaryOrganization`
- Applies font family to `document.documentElement`
- Provides design settings via React Context
- Font priority: Organization font > User font (for personal documents) > System default
- Automatically detects personal documents and applies user font preference when no organization is active

### Icon Loading
- Dynamic icon loader supports lazy loading
- Falls back to Lucide if selected library unavailable
- Icon mapping utility for cross-library compatibility

### Font Loading
- Bunny Fonts loaded via `@import` in CSS
- CSS variables for each font family
- CSS classes for applying fonts: `.org-font-{family}`
- Applied dynamically based on active organization

## Migration

To add the new columns to existing databases:

```bash
node server/migrations/add-organization-design-customization.js
```

The migration is idempotent and safe to run multiple times.

## Future Enhancements

- Components can use `useOrganizationDesign()` hook to access icon set
- Dynamic icon component that switches based on organization context
- Preview of icon set and font in the dialog
- Per-user override option for organization fonts (if needed)

---

**See Also:**
- `docs/active/DESIGN_SYSTEM_AND_ICONS.md` - Complete design system documentation

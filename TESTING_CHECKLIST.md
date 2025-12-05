# Organization Branding Header - Testing Checklist

## Pre-Testing Requirements

### 1. Run Database Migration
```bash
node server/migrations/add-organization-branding.js
```

**Expected Result:**
- Migration adds 3 columns to organizations table
- Existing organizations get random default colors assigned
- Migration is idempotent (can run multiple times safely)

### 2. Verify Migration Success
- Check database: `SELECT branding_color, branding_logo_url, branding_title FROM organizations LIMIT 5;`
- All existing organizations should have a `branding_color` value
- `branding_logo_url` and `branding_title` should be NULL for legacy orgs

## Backward Compatibility Tests

### ✅ Legacy Organizations (No Branding Fields)
1. **Before Migration:**
   - Organizations without branding fields should still work
   - Frontend uses fallback color `#3B82F6` if `brandingColor` is null/undefined
   - Frontend uses organization name if `brandingTitle` is null/undefined
   - Logo is optional (won't render if null/undefined)

2. **After Migration:**
   - All legacy organizations should have default colors assigned
   - Header should display with default color
   - No errors in console

### ✅ Frontend Fallbacks
- **Color:** `organization.brandingColor || '#3B82F6'` ✅
- **Title:** `organization.brandingTitle || organization.name` ✅
- **Logo:** Only renders if `organization.brandingLogoUrl` exists ✅
- **Text Color:** Auto-calculates based on background (handles null) ✅

### ✅ Backend Null Handling
- GET endpoint returns `null` for missing branding fields (not `undefined`)
- PUT endpoint accepts `null` to clear branding fields
- Migration sets default colors for existing organizations

## Feature Tests

### 1. Organization Header Display
- [ ] Header appears ABOVE main AppHeader when viewing organization
- [ ] Header shows correct background color
- [ ] Header shows logo if uploaded
- [ ] Header shows custom title or organization name
- [ ] Text color is readable (auto-calculated)
- [ ] Header is responsive on mobile/tablet

### 2. Branding Customization (Representatives Only)
- [ ] "Customize Branding" button appears in Dashboard for representatives
- [ ] Button does NOT appear for regular members
- [ ] Dialog opens with current branding values
- [ ] Preview updates in real-time

### 3. Color Picker
- [ ] Hex input accepts valid colors (#RRGGBB format)
- [ ] Color picker works
- [ ] Invalid colors show error message
- [ ] Preview updates when color changes

### 4. Logo Upload
- [ ] File input accepts images only
- [ ] Max 5MB validation works
- [ ] Preview shows before upload
- [ ] Remove logo button works
- [ ] Broken images are hidden gracefully

### 5. Title Input
- [ ] Optional field (can be empty)
- [ ] Max 100 characters enforced
- [ ] Falls back to organization name if empty

### 6. Save & Update
- [ ] Save button updates organization
- [ ] Success toast appears
- [ ] Header updates immediately
- [ ] WebSocket broadcasts update to other clients
- [ ] Other clients see update in real-time

### 7. WebSocket Updates
- [ ] Branding update broadcasts to all connected clients
- [ ] Clients receive `branding-updated` event
- [ ] Organization state refreshes automatically
- [ ] Toast notification appears on other clients

## Edge Cases

### 1. Legacy Organizations
- [ ] Organizations created before migration work correctly
- [ ] Default colors are assigned during migration
- [ ] No errors when viewing legacy organizations

### 2. Null/Undefined Values
- [ ] `brandingColor` null → uses default `#3B82F6`
- [ ] `brandingLogoUrl` null → logo not displayed
- [ ] `brandingTitle` null → uses organization name

### 3. Invalid Data
- [ ] Invalid hex color shows error
- [ ] Too large logo file shows error
- [ ] Non-image file shows error
- [ ] Title > 100 chars shows error

### 4. Permissions
- [ ] Only representatives can edit branding
- [ ] Regular members cannot see "Customize Branding" button
- [ ] API rejects non-representative update attempts

### 5. Multiple Organizations
- [ ] Switching between organizations shows correct branding
- [ ] Each organization has its own branding
- [ ] No cross-contamination of branding data

## Performance Tests

- [ ] Logo upload doesn't block UI (async)
- [ ] Large logos (5MB) upload successfully
- [ ] WebSocket updates are fast (< 1 second)
- [ ] No memory leaks with multiple organization switches

## Browser Compatibility

- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari
- [ ] Mobile browsers (iOS Safari, Chrome Mobile)

## Security Tests

- [ ] Only representatives can update branding (backend validation)
- [ ] Logo upload validates file type (server-side)
- [ ] Logo upload validates file size (server-side)
- [ ] Color validation prevents XSS (hex format only)
- [ ] Title is sanitized (express-validator)

## Migration Safety

- [ ] Migration can run multiple times (idempotent)
- [ ] Migration doesn't break existing organizations
- [ ] Migration sets defaults for all legacy organizations
- [ ] Migration handles errors gracefully

## Ready for Testing? ✅

**Yes, ready for testing!** All backward compatibility measures are in place:

1. ✅ Migration handles legacy organizations
2. ✅ Frontend has fallbacks for null/undefined values
3. ✅ Backend returns null (not undefined) for missing fields
4. ✅ All components handle missing branding gracefully
5. ✅ Default colors assigned during migration
6. ✅ Idempotent migration (safe to run multiple times)

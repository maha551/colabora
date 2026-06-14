# Error Reporting System

## Overview

The error reporting system allows users to submit bug reports and error information directly from the production application. These reports are collected in the database and can be viewed and managed by administrators.

## Features

- **Header Button**: A bug report button appears in the application header (top-right on desktop, bottom-right on mobile)
- **User-Friendly Dialog**: Users can submit detailed error reports with:
  - Title and description
  - Error messages and stack traces
  - Screenshots (captured or uploaded)
  - Console logs
  - Browser information
  - Current page URL
- **Admin Dashboard**: Administrators can view, filter, and manage error reports
- **Production Ready**: Works in production on Fly.io

## Setup

### 1. Run Database Migration

Run the migration to create the `error_reports` table:

```bash
node server/migrations/add-error-reports-table.js
```

### 2. Environment Variables

The error reporting button is enabled by default in production. To control visibility:

- **Disable in production**: Set `VITE_DISABLE_ERROR_REPORTING=true`
- **Enable in development**: Set `VITE_ENABLE_ERROR_REPORTING=true`

### 3. Verify Backend Route

The route is automatically registered in `server/bootstrap.js`. The endpoint is available at:
- `POST /api/error-reports` - Submit a new error report
- `GET /api/error-reports` - Get all reports (admin only)
- `GET /api/error-reports/:id` - Get specific report (admin only)
- `PATCH /api/error-reports/:id` - Update report status (admin only)
- `GET /api/error-reports/stats/summary` - Get statistics (admin only)

## Usage

### For Users

1. Click the bug icon button in the header (top-right on desktop, bottom-right on mobile)
2. Fill out the error report form:
   - **Title**: Brief description of the issue
   - **Description**: Detailed explanation of what happened
   - **Error Message/Stack**: Automatically populated if an error occurred
   - **Screenshot**: Click "Capture Screenshot" or upload an image
   - **Console Logs**: Optionally add relevant console output
3. Click "Submit Report"

### For Administrators

1. Navigate to Admin Dashboard
2. Click on the "Error Reports" tab
3. View statistics and filter reports by status
4. Click "View" on any report to see full details
5. Update status and priority as you work on issues
6. Mark reports as "Resolved" when fixed

## Database Schema

The `error_reports` table stores:

- `id` - Unique identifier
- `user_id` - User who submitted (if authenticated)
- `user_email` - Email of submitter
- `title` - Report title
- `description` - Detailed description
- `error_message` - Error message (if any)
- `error_stack` - Stack trace (if any)
- `url` - Page URL where error occurred
- `user_agent` - Browser user agent
- `browser_info` - JSON with browser details
- `screen_resolution` - Screen resolution
- `console_logs` - Console output
- `screenshot_url` - Base64 encoded screenshot
- `status` - new, in_progress, resolved, dismissed
- `priority` - low, medium, high, critical
- `assigned_to` - Admin user ID (if assigned)
- `resolution_notes` - Notes about resolution
- `created_at` - Timestamp
- `updated_at` - Last update timestamp
- `resolved_at` - Resolution timestamp

## Integration with Error Boundary

The `ErrorBoundary` component can automatically capture errors and pass them to the error report dialog. To enable this:

```tsx
<ErrorBoundary
  onError={(error, errorInfo) => {
    // Error is automatically logged
    // User can click the report button to submit
  }}
>
  {/* Your app */}
</ErrorBoundary>
```

## Screenshot Capture

The system supports screenshot capture using `html2canvas`. To enable:

1. Install html2canvas (optional - fallback to manual upload if not available):
   ```bash
   npm install html2canvas
   ```

2. The dialog will automatically use html2canvas if available, otherwise users can upload screenshots manually.

## Future Enhancements

Potential improvements:
- Email notifications for new critical reports
- Automatic error grouping/deduplication
- Integration with external bug tracking systems
- Analytics dashboard for error trends
- User feedback on resolved issues


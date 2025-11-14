# Colabora Admin Setup Guide

This guide explains how to set up and use the dedicated admin user system for Colabora.

## Overview

Colabora now uses a **dedicated admin user** system where admins are the only users who can create and manage organizations. This provides better security and separation of concerns.

## Admin User Creation

### Initial Setup

1. **Set Environment Variables** (Required for security):
   ```bash
   export SESSION_SECRET="your-secure-session-secret-here"
   export JWT_SECRET="your-secure-jwt-secret-here"
   ```

2. **Create the Admin User**:
   ```bash
   npm run setup-admin
   ```

   This creates an admin user with:
   - **Email**: `admin@colabora.local`
   - **Password**: `AdminSecurePass123!`
   - **Role**: `admin`

   ⚠️ **IMPORTANT**: Change the password immediately after first login!

### Admin User Capabilities

The admin user can:

1. **Create Organizations**: Set up new organizations with representatives
2. **Manage Organization Status**: Activate/deactivate organizations
3. **View System Statistics**: Dashboard with user/org counts
4. **Promote Other Users to Admin**: Create additional admin users
5. **Access Admin-Only Endpoints**: Database reset, table creation, etc.

## Admin Dashboard

After logging in as admin, you'll have access to:

- **Organization Management**: Create, view, and deactivate organizations
- **User Management**: View all users and promote to admin
- **System Statistics**: Overview of users, organizations, and documents

## API Endpoints (Admin Only)

### Organization Management
```http
POST /api/admin/organizations
GET /api/admin/organizations
PATCH /api/admin/organizations/:id/status
```

### User Management
```http
GET /api/admin/users
POST /api/admin/promote-admin/:userId
```

### System Management
```http
GET /api/admin/dashboard
POST /api/admin/reset-database
POST /api/admin/create-tables
```

## Security Best Practices

1. **Environment Variables**: Always set `SESSION_SECRET` and `JWT_SECRET`
2. **Password Security**: Use strong, unique passwords for admin accounts
3. **Access Control**: Admin role is verified from database, not JWT tokens
4. **Audit Logging**: All admin actions are logged for security tracking
5. **Two-Factor Authentication**: Consider enabling 2FA for admin accounts

## Creating Organizations

As an admin, you can create organizations by specifying:

- **Organization Name**: Display name for the organization
- **Description**: Optional description
- **Membership Policy**: `open` or `invitation`
- **Voting Threshold**: Percentage required for decisions (0.0-1.0)
- **First Representative**: Initial organization representative

## Promoting Additional Admins

To create more admin users:

1. Go to Admin Dashboard → Users
2. Find the user you want to promote
3. Click "Promote to Admin"

This is useful for organizations that need multiple people with admin access.

## Migration from Old System

If you were using the old hardcoded admin system:

1. The hardcoded checks have been removed
2. All admin functions now require proper authentication
3. Use `npm run setup-admin` to create the new admin user
4. Remove any hardcoded user IDs from your code

## Troubleshooting

### Admin user not created
- Ensure database tables exist: `npm run setup-admin` will create them if needed
- Check that environment variables are set correctly

### Cannot access admin endpoints
- Verify you're logged in as an admin user
- Check that your user has `role = 'admin'` in the database
- Ensure JWT token is valid (not expired)

### Organization creation fails
- Verify the representative user exists
- Check that all required fields are provided
- Ensure database constraints are satisfied

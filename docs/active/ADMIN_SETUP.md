# Colabora Admin Setup Guide

This guide explains how to set up and use the dedicated admin user system for Colabora.

## Overview

Colabora uses a **dedicated admin user** system where admins are the only users who can create organizations at the platform level. Admins can also manage users, organizations, and platform operations through the Admin Dashboard.

## Admin User Creation

### Initial Setup

1. **Set environment variables** (required):
   ```bash
   export SESSION_SECRET="your-secure-session-secret-here"
   export JWT_SECRET="your-secure-jwt-secret-here"
   export DATABASE_URL="postgresql://..."
   export ADMIN_SETUP_EMAIL="admin@yourdomain.com"
   export ADMIN_SETUP_PASSWORD="your-secure-password-min-12-chars"
   ```

2. **Run migrations**:
   ```bash
   npm run db:migrate
   ```

3. **Create the admin user**:
   ```bash
   npm run setup-admin
   ```

   ⚠️ **IMPORTANT**: Change the password immediately after first login.

### Admin Capabilities

- Create organizations (with representatives, governance rules, email invites)
- Manage organizations (settings, members, representatives, deactivate, hard delete)
- View system statistics
- Promote/demote admin users
- Suspend/unsuspend user accounts
- Triage error reports
- View platform audit log
- Clear rate limits and run document integrity checks

## Admin Dashboard

Tabs available after login as admin:

- **Organizations** — list, manage (drill-down panel), activate/deactivate
- **Users** — list, promote, demote, suspend
- **Operations** — rate limits, document integrity check
- **Platform Audit** — searchable admin action log
- **Error Reports** — user-submitted bug reports

## API Endpoints (Admin Only)

### Dashboard & organizations
```http
GET  /api/admin/dashboard
GET  /api/admin/organizations
POST /api/admin/organizations
GET  /api/admin/organizations/:id
PUT  /api/admin/organizations/:id
PATCH /api/admin/organizations/:id/status
DELETE /api/admin/organizations/:id          # hard delete (body: confirmName, force?)
POST /api/admin/organizations/:id/members
DELETE /api/admin/organizations/:id/members/:userId
POST /api/admin/organizations/:id/members/invite
POST /api/admin/organizations/:id/representatives
POST /api/admin/organizations/:id/representatives/invite
```

### Users
```http
GET   /api/admin/users
GET   /api/admin/users/:id
PATCH /api/admin/users/:id/status          # body: { isActive, reason? }
POST  /api/admin/promote-admin/:userId
POST  /api/admin/demote-admin/:userId
```

### Audit & operations
```http
GET  /api/admin/audit
GET  /api/admin/audit/stats/summary
GET  /api/admin/rate-limits
POST /api/admin/rate-limits/clear
GET  /api/documents/integrity-check
```

## Organization deletion

- **Soft delete (deactivate)**: `PATCH /api/admin/organizations/:id/status` with `{ "isActive": false }`
- **Hard delete**: Organization must be inactive first. Send `DELETE /api/admin/organizations/:id` with `{ "confirmName": "<exact org name>", "force": true }` if documents or active members exist.

## User suspension

Suspended users cannot log in. Use `PATCH /api/admin/users/:id/status` with `{ "isActive": false, "reason": "..." }`.

## Security

1. Always set `SESSION_SECRET` and `JWT_SECRET`
2. Admin role is verified from the database on each request
3. Platform admin actions are logged to Winston and the `platform_audit` table
4. Cannot suspend/demote yourself or the last admin

## Troubleshooting

### Admin user not created
- Run migrations: `npm run db:migrate`
- Set `ADMIN_SETUP_EMAIL` and `ADMIN_SETUP_PASSWORD`

### Cannot access admin endpoints
- Verify `role = 'admin'` in the database
- Ensure JWT token is valid

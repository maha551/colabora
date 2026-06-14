# Field Naming Patterns and Transformation Guide

**Date:** 2025-01-27  
**Status:** Active Documentation

---

## Overview

This document explains the field naming conventions used throughout the Colabora application, how data transformation works, and when fallback patterns are necessary.

---

## Naming Conventions

### Backend (Database)
- **Format:** `snake_case`
- **Examples:** `created_at`, `user_id`, `organization_id`, `proposal_deadline`

### Frontend (TypeScript/React)
- **Format:** `camelCase`
- **Examples:** `createdAt`, `userId`, `organizationId`, `proposalDeadline`

---

## Transformation Middleware

### Request Transformation (Frontend → Backend)

**Location:** `server/middleware/transformRequest.js`

**Behavior:**
- Converts all incoming request body properties from `camelCase` to `snake_case`
- Applied globally to all routes (before validation and route handlers)
- Preserves special fields (passwords, tokens, etc.)

**Validation convention:** All `/api` request bodies are in snake_case when validation runs. Validation must use snake_case body keys (e.g. `parent_id`, `organization_id`, `creator_ids`). See `server/middleware/validation.js`.

**Example:**
```javascript
// Frontend sends:
{ organizationId: "123", proposalDeadline: "2025-01-01" }

// Backend receives (after transformation):
{ organization_id: "123", proposal_deadline: "2025-01-01" }
```

### Response Transformation (Backend → Frontend)

**Location:** `server/middleware/transformResponse.js`

**Behavior:**
- Converts all response properties from `snake_case` to `camelCase`
- Normalizes booleans (0/1 → true/false)
- Normalizes dates
- Applied to all `/api/*` routes

**Example:**
```javascript
// Backend returns:
{ organization_id: "123", proposal_deadline: "2025-01-01", is_active: 1 }

// Frontend receives (after transformation):
{ organizationId: "123", proposalDeadline: "2025-01-01", isActive: true }
```

---

## WebSocket Events

**Status:** ✅ **Transformed** (as of 2025-01-27)

**Location:** `server/modules/websocket.js`

**Behavior:**
- WebSocket events now use `transformForApi()` to convert data payloads to camelCase
- Event structure uses camelCase: `documentId`, `eventType`, `timestamp`
- Data payload is transformed before broadcasting

**Example:**
```javascript
// Backend broadcasts:
{
  documentId: "123",
  eventType: "vote",
  data: { proposal_id: "456", user_id: "789" },  // Before transformation
  timestamp: "2025-01-27T12:00:00Z"
}

// After transformation, frontend receives:
{
  documentId: "123",
  eventType: "vote",
  data: { proposalId: "456", userId: "789" },  // Transformed to camelCase
  timestamp: "2025-01-27T12:00:00Z"
}
```

---

## When Fallbacks Are Necessary

### ✅ **Necessary Fallbacks**

Fallback patterns (`value?.camelCase ?? value?.snake_case`) are necessary in these cases:

1. **WebSocket Events (Defensive Programming)**
   - Even though events are now transformed, keep fallbacks for:
     - Edge cases where transformation might fail
     - Backward compatibility
     - Data from different sources

2. **Optimistic Updates**
   - Local state may use different format than API responses
   - Example: `client/src/App.tsx` - comment normalization

3. **Direct Database Access**
   - If code directly accesses database results (bypassing API)
   - Should be rare, but fallbacks provide safety

4. **Legacy Data**
   - Old data formats that might not be transformed
   - Migration scenarios

### ❌ **Unnecessary Fallbacks**

Fallbacks are **NOT** necessary for:
- Standard API responses (middleware handles transformation)
- New code using API endpoints
- Data that always goes through transformation middleware

---

## Fallback Pattern

### Recommended Pattern

```typescript
// ✅ Good - Handles both formats
const value = obj.camelCase ?? obj.snake_case ?? defaultValue;

// ✅ Good - With type safety
const createdAt = document.createdAt ?? document.created_at ?? null;

// ✅ Good - For optional values
const parentId = comment.parentId ?? (comment as any).parent_id ?? null;
```

### Anti-Patterns

```typescript
// ❌ Bad - Only handles one format
const value = obj.snake_case;

// ❌ Bad - Assumes transformation always works
const value = obj.camelCase;
```

---

## Files Using Fallbacks

### Frontend Components

1. **`client/src/components/AgreedDocument.tsx`**
   - Handles history entries: `approvalPercentage ?? approval_percentage`
   - Handles proposal content: `newText ?? new_text`

2. **`client/src/components/DocumentStatusDisplay.tsx`**
   - Uses helper function: `getDocumentProperty()` with fallbacks
   - Handles: `proposalDeadline`, `votingDeadline`, `createdAt`

3. **`client/src/components/governance/PublicGovernanceDashboard.tsx`**
   - Normalizes audit log entries: `actionType || action_type`
   - Handles: `createdAt || created_at`, `performedByName || performed_by_name`

4. **`client/src/App.tsx`**
   - Comment normalization: `parentId ?? parent_id`
   - Date handling: `createdAt || created_at`

5. **`client/src/components/AdminDashboard.tsx`**
   - Extensive fallbacks for error reports
   - Handles: `createdAt ?? created_at`, `userEmail ?? user_email`, etc.

### Backend Routes

Backend routes handle both formats when:
- Processing request bodies (before transformation)
- Processing query parameters
- Handling legacy data formats

**Example:** `server/routes/documents.js`
```javascript
// Handle both camelCase (from frontend) and snake_case (after transformation)
const organizationId = req.body.organizationId || req.body.organization_id;
```

---

## Transformation Utilities

### Backend

**File:** `server/utils/dataTransform.js`

**Functions:**
- `camelCaseKeys()` - Recursively converts object keys to camelCase
- `snakeCaseKeys()` - Recursively converts object keys to snake_case
- `transformForApi()` - Full transformation (camelCase + booleans + dates)
- `transformForDatabase()` - Full transformation (snake_case + booleans)

### Frontend

**File:** `client/src/lib/api.ts`

**Functions:**
- `camelCaseKeys()` - Converts response keys to camelCase
- Applied automatically to all API responses

---

## Best Practices

### For New Code

1. **Always use camelCase in frontend**
   - TypeScript interfaces should use camelCase
   - Component props should use camelCase

2. **Trust the transformation middleware**
   - API responses are automatically transformed
   - WebSocket events are now transformed
   - Don't add unnecessary fallbacks

3. **Use fallbacks only when necessary**
   - WebSocket events (defensive programming)
   - Optimistic updates
   - Legacy data handling

### For Existing Code

1. **Keep existing fallbacks**
   - They provide defensive programming
   - Don't remove unless certain they're unnecessary

2. **Standardize fallback pattern**
   - Use: `value?.camelCase ?? value?.snake_case ?? defaultValue`
   - Document why fallback is needed

3. **Review and refactor gradually**
   - Identify truly unnecessary fallbacks
   - Remove only after thorough testing

---

## Troubleshooting

### Issue: Property is undefined

**Possible Causes:**
1. Transformation middleware not applied
2. Data source bypasses transformation
3. Property name mismatch

**Solution:**
- Check if route goes through `transformResponse` middleware
- Verify property names match (camelCase in frontend, snake_case in backend)
- Add fallback pattern if necessary

### Issue: WebSocket data in wrong format

**Status:** ✅ Fixed (as of 2025-01-27)
- WebSocket events now use `transformForApi()`
- Data payloads are transformed to camelCase

**If issue persists:**
- Check `server/modules/websocket.js` - ensure `transformForApi()` is called
- Verify fallbacks in frontend WebSocket handlers

---

## Migration Notes

### WebSocket Transformation (2025-01-27)

**Change:**
- WebSocket events now transform data payloads to camelCase
- Reduces need for fallbacks in frontend

**Impact:**
- Frontend can rely on camelCase format
- Fallbacks still recommended for defensive programming
- No breaking changes (fallbacks handle both formats)

---

## Related Files

- `server/middleware/transformRequest.js` - Request transformation
- `server/middleware/transformResponse.js` - Response transformation
- `server/utils/dataTransform.js` - Transformation utilities
- `server/modules/websocket.js` - WebSocket event broadcasting
- `client/src/lib/api.ts` - Frontend API client with transformation

---

## Summary

- **Backend:** Uses `snake_case` (database convention)
- **Frontend:** Uses `camelCase` (JavaScript convention)
- **Transformation:** Automatic via middleware for API routes
- **WebSocket:** Now transformed to camelCase (2025-01-27)
- **Fallbacks:** Necessary for WebSocket (defensive), optimistic updates, legacy data
- **Best Practice:** Trust transformation, use fallbacks defensively


# Colabora Code Patterns and Conventions

This document defines the standard patterns and conventions used throughout the Colabora codebase. All new code should follow these patterns to maintain consistency and prevent issues.

## Authentication Middleware

### ✅ **Correct Pattern: Import from Middleware**

Always import authentication middleware from the centralized module:

```javascript
const { requireAuth, requireAdmin, requireDocumentAccess } = require('../middleware/auth');

// Use in routes
router.get('/endpoint', requireAuth, (req, res) => {
  // Route handler
});
```

### ❌ **Incorrect Pattern: Inline Functions**

**DO NOT** define inline authentication functions:

```javascript
// ❌ WRONG - Don't do this
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};
```

### Why Use Centralized Middleware?

1. **Consistent Behavior**: All routes use the same authentication logic
2. **JWT + Session Support**: Centralized middleware handles both token and session auth
3. **Better Error Handling**: Uses Winston logger instead of console.error
4. **Maintainability**: Changes to auth logic only need to be made in one place
5. **Security**: Proper token verification with issuer/audience checks

### Available Middleware

- `requireAuth`: Checks if user is authenticated (JWT token or session)
- `requireAdmin`: Checks if user is authenticated AND has admin role
- `requireDocumentAccess`: Checks if user has access to a specific document (owner or collaborator)

## Error Handling

### ✅ **Correct Pattern: Use Winston Logger**

Always use the Winston logger for errors:

```javascript
const { logger } = require('../middleware/logger');

try {
  // Some operation
} catch (error) {
  logger.error('Operation failed', { 
    error: error.message, 
    stack: error.stack,
    context: { /* relevant context */ }
  });
  return res.status(500).json({ error: 'Operation failed' });
}
```

### ❌ **Incorrect Pattern: Console Logging**

**DO NOT** use console.log/error/warn for production code:

```javascript
// ❌ WRONG - Don't do this
console.error('Error:', error);
console.log('User logged in:', userId);
```

### Error Response Format

Standardize error responses:

```javascript
// For client errors (4xx)
res.status(400).json({ 
  error: 'Clear error message',
  details: 'Optional additional details'
});

// For server errors (5xx)
res.status(500).json({ 
  error: 'Internal server error',
  message: 'User-friendly message'
});
```

## Logging Patterns

### Log Levels

Use appropriate log levels:

- `logger.error()`: Errors that need attention
- `logger.warn()`: Warnings about potential issues
- `logger.info()`: Important events (auth, document creation, etc.)
- `logger.debug()`: Detailed debugging information

### Structured Logging

Always include relevant context:

```javascript
logger.info('Document created', {
  documentId: doc.id,
  userId: req.user.id,
  title: doc.title,
  ownershipType: doc.ownershipType
});
```

## Route Structure

### Standard Route Pattern

```javascript
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// GET endpoint
router.get('/endpoint', requireAuth, async (req, res) => {
  try {
    const db = req.app.locals.db;
    // Route logic
    res.json({ data: result });
  } catch (error) {
    logger.error('Route error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
```

### Route Organization

- One route file per resource (documents, users, organizations, etc.)
- Use nested routes for sub-resources (e.g., `/documents/:id/paragraphs`)
- Group related endpoints in the same file

## Database Queries

### ✅ **Correct Pattern: Parameterized Queries**

Always use parameterized queries to prevent SQL injection:

```javascript
db.get('SELECT * FROM documents WHERE id = ?', [documentId], (err, row) => {
  // Handle result
});
```

### ❌ **Incorrect Pattern: String Concatenation**

**DO NOT** concatenate user input into SQL queries:

```javascript
// ❌ WRONG - SQL injection vulnerability
db.get(`SELECT * FROM documents WHERE id = '${documentId}'`, (err, row) => {
  // ...
});
```

## Component Structure (Frontend)

### React Component Pattern

```typescript
import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

interface ComponentProps {
  // Define props interface
}

export function Component({ prop1, prop2 }: ComponentProps) {
  const { currentUser } = useAuth();
  const [state, setState] = useState<Type>(initialValue);

  useEffect(() => {
    // Side effects
  }, [dependencies]);

  const handleAction = async () => {
    try {
      // Action logic
    } catch (error) {
      console.error('Action failed:', error);
      // Handle error
    }
  };

  return (
    <div>
      {/* Component JSX */}
    </div>
  );
}
```

## WebSocket Patterns

### Broadcasting Updates

Use the WebSocket manager for real-time updates:

```javascript
const webSocketManager = require('../modules/websocket');

// After creating/updating a resource
webSocketManager.broadcastDocumentUpdate(documentId, 'eventType', {
  // Event data
});
```

### Client-Side Handling

Handle WebSocket updates in `App.tsx`:

```typescript
const handleDocumentUpdate = useCallback((update: any) => {
  if (update.eventType === 'eventType' && update.data) {
    // Update state directly (no API call needed)
    updateDocument((prevDoc) => {
      // Return updated document
    });
  }
}, [currentDocument, updateDocument]);
```

## TypeScript Patterns

### Type Definitions

Always define types for API responses and component props:

```typescript
interface Document {
  id: string;
  title: string;
  ownerId: string;
  // ... other fields
}

interface ApiResponse<T> {
  data: T;
  error?: string;
}
```

### Avoid `any` Types

**DO NOT** use `any` unless absolutely necessary:

```typescript
// ❌ WRONG
function processData(data: any) { }

// ✅ CORRECT
function processData(data: Document) { }
```

## File Organization

### Backend Structure

```
server/
├── routes/          # API route handlers
├── modules/         # Business logic modules
├── middleware/      # Express middleware
├── database/        # Database management
└── migrations/      # Database migrations
```

### Frontend Structure

```
client/src/
├── components/      # React components
├── hooks/           # Custom React hooks
├── pages/           # Page components
├── lib/             # API client and utilities
└── types/           # TypeScript type definitions
```

## Testing Patterns

### Test Structure

```javascript
describe('Feature Name', () => {
  beforeEach(() => {
    // Setup
  });

  it('should do something', async () => {
    // Test implementation
    expect(result).toBe(expected);
  });
});
```

## Summary

- ✅ Import auth middleware from `middleware/auth.js`
- ✅ Use Winston logger, not console.log
- ✅ Use parameterized database queries
- ✅ Define TypeScript types, avoid `any`
- ✅ Follow consistent error handling patterns
- ✅ Organize code by feature/resource
- ✅ Use structured logging with context

Following these patterns ensures consistency, maintainability, and prevents common issues.


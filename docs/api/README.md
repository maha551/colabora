# API Documentation

This directory contains comprehensive documentation for the Colabora API system, including frontend API modules, backend routes, WebSocket events, error handling, and client features.

## Documentation Structure

- **[FRONTEND_API.md](FRONTEND_API.md)** - Frontend API modules documentation
  - All 15 API modules with functions, types, and usage examples
  - Request/response types
  - Module organization

- **[BACKEND_ROUTES.md](BACKEND_ROUTES.md)** - Backend API routes documentation
  - All backend routes mapped to frontend modules
  - Authentication requirements
  - Route parameters and query strings

- **[WEBSOCKET_EVENTS.md](WEBSOCKET_EVENTS.md)** - WebSocket events documentation
  - Event types and payloads
  - Event handlers
  - Real-time update patterns

- **[ERROR_HANDLING.md](ERROR_HANDLING.md)** - Error handling documentation
  - Error types (ApiError, NetworkError, AuthError, RateLimitError)
  - Error response formats
  - Error handling patterns and best practices

- **[CLIENT_FEATURES.md](CLIENT_FEATURES.md)** - API client features documentation
  - `apiRequest` utility function
  - Caching and cache invalidation
  - Rate limiting
  - Request/response interceptors

## Module Organization

The API has been split into well-organized domain-specific modules for better maintainability:

### Directory Structure

```
client/src/lib/api/
├── client.ts                    # Core API client (request handling, caching, errors)
├── index.ts                     # Main entry point (re-exports all modules)
├── types/                        # API response types (split by domain)
│   ├── index.ts                 # Re-export all types
│   ├── common.ts                # Common types (MessageResponse, etc.)
│   ├── documents.ts             # Document-related response types
│   ├── organizations.ts          # Organization-related response types
│   ├── governance.ts            # Governance-related response types
│   ├── auth.ts                  # Auth-related response types
│   ├── error-reports.ts         # Error report types
│   └── activity.ts              # Activity feed types
├── governance/                   # Governance sub-modules
│   ├── index.ts                 # Main governance API
│   ├── rules.ts                 # Rules & permissions
│   ├── elections.ts             # Elections
│   ├── rule-proposals.ts        # Rule proposals
│   └── audit.ts                 # Audit logs
├── documents.ts                 # Documents API
├── paragraphs.ts                # Paragraphs API
├── proposals.ts                 # Proposals API
├── votes.ts                     # Votes API
├── comments.ts                  # Comments API
├── structure-history.ts         # Structure history API
├── structure-proposals.ts       # Structure proposals API
├── document-tree-proposals.ts   # Document tree proposals API
├── organizations.ts             # Organizations API
├── auth.ts                      # Auth API
├── search.ts                    # Search API
├── export.ts                    # Export API
├── activity.ts                  # Activity API
└── error-reports.ts             # Error reports API
```

### Importing API Modules

All API modules can be imported from the main API file (recommended):

```typescript
import { documentsApi, organizationsApi, authApi } from './lib/api';
```

Or from individual module files:

```typescript
import { documentsApi } from './lib/api/documents';
import { organizationsApi } from './lib/api/organizations';
```

### Importing Types

All API response types can be imported from the main API file:

```typescript
import type { 
  DocumentsResponse, 
  OrganizationResponse,
  GovernanceRulesResponse 
} from './lib/api';
```

Or from specific type modules:

```typescript
import type { DocumentsResponse } from './lib/api/types/documents';
import type { OrganizationResponse } from './lib/api/types/organizations';
```

### Making API Requests

All API functions return Promises and use the centralized `apiRequest` utility:

```typescript
// Example: Get all documents
const response = await documentsApi.getDocuments();
console.log(response.documents);

// Example: Create a document
const newDoc = await documentsApi.createDocument('My Document', 'Description');
```

### Error Handling

All API functions throw typed errors that should be caught:

```typescript
try {
  const doc = await documentsApi.getDocument('123');
} catch (error) {
  if (error instanceof AuthError) {
    // Handle authentication error
  } else if (error instanceof NetworkError) {
    // Handle network error
  }
}
```

## API Module Overview

The API is split into 15 domain-specific modules:

1. **documentsApi** - Document CRUD operations, voting, status management
2. **proposalsApi** - Paragraph proposal creation
3. **votesApi** - Proposal voting
4. **commentsApi** - Comment management on proposals
5. **paragraphsApi** - Paragraph CRUD operations
6. **structureProposalsApi** - Document structure change proposals
7. **structureHistoryApi** - Document structure version history
8. **documentTreeProposalsApi** - Document tree structure proposals
9. **organizationsApi** - Organization management, members, votes
10. **governanceApi** - Governance rules, elections, rule proposals (split into sub-modules)
    - Rules & permissions
    - Elections management
    - Rule proposals
    - Audit logs
11. **authApi** - Authentication, user management, invitations
12. **searchApi** - Search functionality
13. **exportApi** - Document export (PDF, Markdown, DOCX)
14. **activityApi** - Activity feed data
15. **errorReportsApi** - Error reporting and management

### Benefits of Modular Structure

- **Maintainability**: Smaller, focused modules are easier to understand and modify
- **Testability**: Individual modules can be tested in isolation
- **Discoverability**: Clear module organization makes it easier to find code
- **Performance**: Tree-shaking can eliminate unused code
- **Collaboration**: Multiple developers can work on different modules without conflicts

For detailed documentation on each module, see [FRONTEND_API.md](FRONTEND_API.md).

## Related Documentation

- [Architecture Documentation](../../ARCHITECTURE.md) - System architecture overview
- [Code Patterns](../../PATTERNS.md) - Code patterns and conventions
- [Error Reporting System](../active/ERROR_REPORTING_SYSTEM.md) - Error reporting details


# API Client Features Documentation

This document describes the API client utilities, including `apiRequest`, caching, rate limiting, and request/response handling.

## apiRequest Function

The `apiRequest` function is the core utility for making HTTP requests to the backend API. It provides:

- Automatic authentication
- Request caching
- Request deduplication
- Automatic retry logic
- Error handling
- Rate limiting
- Response transformation

### Signature

```typescript
async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
  retries: number = 2,
  skipAuth: boolean = false
): Promise<T>
```

### Parameters

- `endpoint: string` - API endpoint path (e.g., `/api/documents`)
- `options: RequestInit` - Fetch API options (method, body, headers, etc.)
- `retries: number` - Number of retry attempts (default: 2)
- `skipAuth: boolean` - Skip authentication (for login/register endpoints)

### Return Value

Returns a Promise that resolves to the response data (typed as `T`).

### Example Usage

```typescript
// GET request
const documents = await apiRequest<DocumentsResponse>('/api/documents');

// POST request
const newDoc = await apiRequest<DocumentResponse>('/api/documents', {
  method: 'POST',
  body: JSON.stringify({ title: 'My Document' })
});

// PUT request
const updated = await apiRequest<DocumentResponse>(`/api/documents/${id}`, {
  method: 'PUT',
  body: JSON.stringify({ title: 'Updated Title' })
});

// DELETE request
await apiRequest(`/api/documents/${id}`, {
  method: 'DELETE'
});
```

## Authentication

Authentication is handled automatically by `apiRequest`:

1. **Token Retrieval:** Gets JWT token from `localStorage.getItem('authToken')`
2. **Header Injection:** Adds `Authorization: Bearer <token>` header
3. **Skip Auth:** Use `skipAuth: true` for public endpoints (login, register)

### Example: Authenticated Request

```typescript
// Automatically includes auth token
const doc = await apiRequest<DocumentResponse>(`/api/documents/${id}`);
```

### Example: Unauthenticated Request

```typescript
// Skip auth for login endpoint
const response = await apiRequest<LoginResponse>('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password })
}, 2, true); // skipAuth = true
```

## Request Caching

The API client implements a TTL-based caching system for GET requests.

### Cache Configuration

- **Default TTL:** 5 minutes (300,000 ms)
- **Cache Key Format:** `METHOD:ENDPOINT:BODY`
- **Cache Scope:** Per-request (not shared across users)

### Cache Behavior

1. **GET Requests:** Automatically cached
2. **Cache Lookup:** Checks cache before making request
3. **Cache Validation:** Checks TTL before returning cached data
4. **Cache Invalidation:** Automatically invalidated on mutations

### Example: Cached Request

```typescript
// First call - makes network request
const doc1 = await apiRequest<DocumentResponse>(`/api/documents/${id}`);

// Second call within 5 minutes - returns cached data
const doc2 = await apiRequest<DocumentResponse>(`/api/documents/${id}`);
```

### Manual Cache Invalidation

```typescript
import { invalidateCache } from './lib/api';

// Invalidate specific endpoint
invalidateCache(`/api/documents/${id}`);

// Invalidate with pattern
invalidateCache(/\/api\/documents\/.*/);

// Invalidate all document caches
invalidateCache('/api/documents');
```

### Automatic Cache Invalidation

Cache is automatically invalidated when mutations occur:

- **Document mutations:** Invalidates document list and related document caches
- **Paragraph mutations:** Invalidates document cache
- **Proposal mutations:** Invalidates document cache
- **Vote mutations:** Invalidates document cache

## Request Deduplication

The API client prevents duplicate simultaneous requests:

1. **In-Flight Tracking:** Tracks requests in progress
2. **Deduplication:** Returns the same promise for duplicate requests
3. **Automatic Cleanup:** Removes from tracking when request completes

### Example: Deduplication

```typescript
// Multiple components request the same document simultaneously
const promise1 = apiRequest<DocumentResponse>(`/api/documents/${id}`);
const promise2 = apiRequest<DocumentResponse>(`/api/documents/${id}`);
const promise3 = apiRequest<DocumentResponse>(`/api/documents/${id}`);

// Only one network request is made
// All three promises resolve with the same data
```

## Automatic Retry Logic

The API client automatically retries failed requests:

### Retry Conditions

- **Network errors** (connection failures)
- **5xx server errors** (server errors)
- **Rate limit errors** (429) - with exponential backoff

### No Retry For

- **4xx client errors** (except rate limits)
- **Auth errors** (401, 403)
- **Validation errors** (400)

### Retry Configuration

- **Default Retries:** 2 attempts
- **Backoff:** Exponential (1s, 2s, 4s, etc.)
- **Timeout:** 20 seconds per attempt

### Example: Retry Behavior

```typescript
// Automatically retries on network failure
try {
  const doc = await apiRequest<DocumentResponse>(`/api/documents/${id}`);
} catch (error) {
  // Error thrown after all retries exhausted
  if (error instanceof NetworkError) {
    // Handle network error
  }
}
```

## Rate Limiting

The API client implements client-side rate limiting to prevent excessive requests.

### Rate Limit Functions

```typescript
// Check if currently rate limited
function isRateLimited(): boolean

// Clear rate limit state
function clearRateLimitState(): void
```

### Rate Limit Behavior

1. **Automatic Detection:** Detects `429 Too Many Requests` responses
2. **State Management:** Sets rate limit state (default: 30 seconds)
3. **Request Blocking:** Blocks requests while rate limited
4. **Critical Actions:** Bypasses rate limit for critical actions (voting, document creation)

### Critical Actions (Bypass Rate Limit)

These actions bypass client-side rate limiting (server still enforces limits):

- Document creation (`POST /api/documents`)
- Voting (`POST .../vote`)
- Batch document fetch (`POST /api/documents/batch`)

### Example: Rate Limit Handling

```typescript
// Check rate limit before making request
if (isRateLimited()) {
  console.log('Rate limited. Please wait.');
  return;
}

try {
  const docs = await apiRequest<DocumentsResponse>('/api/documents');
} catch (error) {
  if (error instanceof RateLimitError) {
    // Rate limit state automatically set
    // Show user-friendly message
  }
}

// Clear rate limit on logout
function handleLogout() {
  clearRateLimitState();
  // ... other logout logic
}
```

## Error Handling

The API client provides comprehensive error handling:

### Error Types

- `ApiError` - Base error class
- `NetworkError` - Network failures
- `AuthError` - Authentication failures
- `RateLimitError` - Rate limit exceeded

See [ERROR_HANDLING.md](ERROR_HANDLING.md) for detailed error handling documentation.

## Base URL Configuration

The API base URL is configured based on environment:

```typescript
const API_BASE_URL = import.meta.env.PROD
  ? '' // In production, use relative URLs
  : 'http://localhost:3000' // Direct connection for development
```

## Request/Response Transformation

### Request Transformation

Requests are sent as-is (no transformation needed on client side). The backend handles snake_case conversion.

### Response Transformation

Responses are automatically transformed from snake_case to camelCase by the backend middleware. The client receives camelCase data.

## Request Options

The `apiRequest` function accepts standard `RequestInit` options:

```typescript
await apiRequest('/api/documents', {
  method: 'POST',
  headers: {
    'Custom-Header': 'value'
  },
  body: JSON.stringify({ title: 'My Document' })
});
```

### Default Headers

The following headers are automatically added:

- `Content-Type: application/json` (for requests with body)
- `Authorization: Bearer <token>` (if authenticated)

## Response Types

All API functions use TypeScript generics for type safety:

```typescript
// Typed response
const response = await apiRequest<DocumentsResponse>('/api/documents');
// response.documents is typed as Document[]

// Untyped response (returns unknown)
const response = await apiRequest('/api/documents');
// response is typed as unknown
```

## Best Practices

1. **Use TypeScript generics** for type safety
2. **Handle errors** appropriately for each error type
3. **Use cache invalidation** after mutations
4. **Check rate limits** before making requests (for non-critical actions)
5. **Clear rate limit state** on logout
6. **Use request deduplication** (automatic, but be aware of it)
7. **Leverage caching** for frequently accessed data
8. **Use skipAuth** for public endpoints

## Performance Considerations

### Caching

- Cache reduces network requests
- Cache invalidation ensures data freshness
- Cache TTL balances freshness and performance

### Deduplication

- Prevents duplicate network requests
- Reduces server load
- Improves response times for concurrent requests

### Retry Logic

- Automatic retry improves reliability
- Exponential backoff prevents server overload
- Retry limit prevents infinite loops

## Related Documentation

- [Frontend API Documentation](FRONTEND_API.md) - API functions using `apiRequest`
- [Error Handling Documentation](ERROR_HANDLING.md) - Error types and handling
- [Backend Routes Documentation](BACKEND_ROUTES.md) - Backend API endpoints


# Error Handling Documentation

This document describes error types, error response formats, and error handling patterns in the Colabora API.

## Error Types

All API errors extend from a base `ApiError` class. The following error types are available:

### ApiError (Base Class)

Base error class for all API errors.

```typescript
class ApiError extends Error {
  statusCode: number;
  endpoint: string;
  response?: ApiErrorResponse;
  
  constructor(message: string, statusCode: number, endpoint: string, response?: ApiErrorResponse);
}
```

**Properties:**
- `message: string` - Error message
- `statusCode: number` - HTTP status code
- `endpoint: string` - API endpoint that failed
- `response?: ApiErrorResponse` - Optional structured error response

### NetworkError

Thrown when network requests fail (no response from server).

```typescript
class NetworkError extends ApiError {
  constructor(message: string, endpoint: string);
}
```

**When it occurs:**
- Network connectivity issues
- Server unreachable
- Request timeout
- CORS errors

**Example:**
```typescript
try {
  await documentsApi.getDocument('123');
} catch (error) {
  if (error instanceof NetworkError) {
    console.error('Network error:', error.message);
    // Show "Connection failed" message to user
  }
}
```

### AuthError

Thrown when authentication fails.

```typescript
class AuthError extends ApiError {
  constructor(message: string, endpoint: string, response?: ApiErrorResponse);
}
```

**When it occurs:**
- Invalid or expired JWT token
- Missing authentication token
- Insufficient permissions
- User not found

**HTTP Status Codes:**
- `401 Unauthorized` - Invalid/missing token
- `403 Forbidden` - Insufficient permissions

**Example:**
```typescript
try {
  await documentsApi.createDocument('My Doc');
} catch (error) {
  if (error instanceof AuthError) {
    // Redirect to login
    window.location.href = '/login';
  }
}
```

### RateLimitError

Thrown when rate limit is exceeded.

```typescript
class RateLimitError extends ApiError {
  retryAfter?: number; // Seconds until retry allowed
  
  constructor(message: string, endpoint: string, retryAfter?: number);
}
```

**When it occurs:**
- Too many requests in a short time period
- Server rate limiting active

**HTTP Status Code:**
- `429 Too Many Requests`

**Example:**
```typescript
try {
  await documentsApi.getDocuments();
} catch (error) {
  if (error instanceof RateLimitError) {
    const waitTime = error.retryAfter || 30;
    console.log(`Rate limited. Retry after ${waitTime} seconds`);
    // Show user-friendly message
  }
}
```

## Error Response Format

API errors return structured error responses:

```typescript
interface ApiErrorResponse {
  error: string; // Error message
  message?: string; // Additional details
  code?: string; // Error code
  details?: StructuredErrorDetails; // Structured error details
}

interface StructuredErrorDetails {
  field?: string; // Field name (for validation errors)
  value?: unknown; // Invalid value
  constraint?: string; // Validation constraint
  errors?: Array<{
    field: string;
    message: string;
  }>; // Multiple field errors
}
```

### Example Error Responses

**Validation Error:**
```json
{
  "error": "Validation failed",
  "message": "Document title is required",
  "code": "VALIDATION_ERROR",
  "details": {
    "field": "title",
    "constraint": "required"
  }
}
```

**Multiple Field Errors:**
```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": {
    "errors": [
      {
        "field": "title",
        "message": "Title is required"
      },
      {
        "field": "description",
        "message": "Description cannot exceed 1000 characters"
      }
    ]
  }
}
```

**Permission Error:**
```json
{
  "error": "Access denied",
  "message": "You do not have permission to access this document",
  "code": "PERMISSION_DENIED"
}
```

## Error Handling Patterns

### Basic Error Handling

```typescript
try {
  const document = await documentsApi.getDocument('123');
  // Use document
} catch (error) {
  if (error instanceof NetworkError) {
    // Handle network error
    showNotification('Connection failed. Please check your internet connection.');
  } else if (error instanceof AuthError) {
    // Handle authentication error
    redirectToLogin();
  } else if (error instanceof RateLimitError) {
    // Handle rate limit
    showNotification(`Too many requests. Please wait ${error.retryAfter} seconds.`);
  } else if (error instanceof ApiError) {
    // Handle other API errors
    showNotification(error.message);
  } else {
    // Handle unexpected errors
    console.error('Unexpected error:', error);
    showNotification('An unexpected error occurred.');
  }
}
```

### Error Handling with Retry

The `apiRequest` function automatically retries failed requests (up to 2 retries by default) for transient errors:

```typescript
// Automatic retry for:
// - Network errors (connection failures)
// - 5xx server errors
// - Rate limit errors (with backoff)

// No retry for:
// - 4xx client errors (except rate limits)
// - Auth errors
```

### Error Handling in React Components

```typescript
function DocumentView({ documentId }: { documentId: string }) {
  const [document, setDocument] = useState<Document | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDocument() {
      try {
        setLoading(true);
        setError(null);
        const response = await documentsApi.getDocument(documentId);
        setDocument(response.document);
      } catch (err) {
        if (err instanceof AuthError) {
          setError('Please log in to view this document');
          // Redirect to login
        } else if (err instanceof NetworkError) {
          setError('Connection failed. Please try again.');
        } else if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('An unexpected error occurred');
        }
      } finally {
        setLoading(false);
      }
    }

    loadDocument();
  }, [documentId]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;
  if (!document) return <NotFound />;

  return <DocumentContent document={document} />;
}
```

### Error Handling with Form Validation

```typescript
async function handleSubmit(formData: FormData) {
  try {
    await documentsApi.createDocument(
      formData.title,
      formData.description
    );
    // Success
  } catch (error) {
    if (error instanceof ApiError && error.response?.details) {
      const details = error.response.details;
      
      // Handle field-specific errors
      if (details.errors) {
        details.errors.forEach((fieldError) => {
          setFieldError(fieldError.field, fieldError.message);
        });
      } else if (details.field) {
        setFieldError(details.field, error.message);
      }
    } else {
      // Show general error
      setGeneralError(error.message);
    }
  }
}
```

## Rate Limiting

The API client implements automatic rate limiting:

### Rate Limit State

```typescript
// Check if currently rate limited
if (isRateLimited()) {
  // Don't make requests
  return;
}

// Clear rate limit state (e.g., on logout)
clearRateLimitState();
```

### Rate Limit Behavior

1. **Automatic Detection:** When a `429 Too Many Requests` response is received, the client sets a rate limit state
2. **Automatic Backoff:** Requests are automatically retried with exponential backoff
3. **State Persistence:** Rate limit state persists until cleared or expires (default: 30 seconds)
4. **Manual Clearing:** Call `clearRateLimitState()` to clear the rate limit (e.g., on logout)

### Example: Handling Rate Limits

```typescript
async function fetchData() {
  // Check rate limit before making request
  if (isRateLimited()) {
    showNotification('Too many requests. Please wait a moment.');
    return;
  }

  try {
    const data = await documentsApi.getDocuments();
    return data;
  } catch (error) {
    if (error instanceof RateLimitError) {
      // Rate limit state is automatically set
      // Show user-friendly message
      showNotification(`Rate limited. Retry after ${error.retryAfter || 30} seconds.`);
    }
    throw error;
  }
}
```

## Error Logging

Errors are automatically logged by the API client:

```typescript
// Errors are logged with:
// - Error message
// - Endpoint
// - Status code
// - Stack trace (in development)
```

### Custom Error Logging

```typescript
try {
  await documentsApi.getDocument('123');
} catch (error) {
  // Log to error reporting service
  if (error instanceof ApiError) {
    errorReportsApi.submitReport({
      error: error.message,
      endpoint: error.endpoint,
      statusCode: error.statusCode,
      stack: error.stack
    });
  }
  throw error;
}
```

## Best Practices

1. **Always catch errors** when calling API functions
2. **Check error types** to handle different scenarios appropriately
3. **Show user-friendly messages** instead of raw error messages
4. **Handle authentication errors** by redirecting to login
5. **Handle network errors** with retry logic or offline indicators
6. **Handle rate limits** gracefully with user feedback
7. **Log errors** for debugging and monitoring
8. **Validate form data** before submission to reduce errors
9. **Use structured error details** for field-level validation feedback
10. **Clear rate limit state** on logout

## Common Error Scenarios

### Scenario 1: Network Failure

```typescript
try {
  await documentsApi.getDocuments();
} catch (error) {
  if (error instanceof NetworkError) {
    // Show offline indicator
    // Enable retry button
    // Cache last successful response if available
  }
}
```

### Scenario 2: Authentication Expired

```typescript
try {
  await documentsApi.getDocument('123');
} catch (error) {
  if (error instanceof AuthError) {
    // Clear auth token
    localStorage.removeItem('authToken');
    // Redirect to login
    window.location.href = '/login';
  }
}
```

### Scenario 3: Validation Error

```typescript
try {
  await documentsApi.createDocument('', 'Description');
} catch (error) {
  if (error instanceof ApiError && error.response?.details) {
    const details = error.response.details;
    if (details.field === 'title') {
      setTitleError('Title is required');
    }
  }
}
```

### Scenario 4: Rate Limit

```typescript
try {
  await documentsApi.getDocuments();
} catch (error) {
  if (error instanceof RateLimitError) {
    // Show rate limit message
    // Disable submit button
    // Enable retry after delay
    setTimeout(() => {
      enableRetry();
    }, (error.retryAfter || 30) * 1000);
  }
}
```

## Related Documentation

- [Frontend API Documentation](FRONTEND_API.md) - API functions that may throw errors
- [Client Features Documentation](CLIENT_FEATURES.md) - API client implementation details
- [Backend Routes Documentation](BACKEND_ROUTES.md) - Backend error responses


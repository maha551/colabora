// Base API client with request handling, caching, and error management
import { logger } from '../logger';
import { updateConnectionStatus } from '../../components/ConnectionStatus';

// Use import.meta.env for Vite (not process.env)
// In development, use relative URLs to leverage Vite's proxy (avoids CORS issues)
// In production, also use relative URLs (same origin)
// Fallback to direct connection if proxy unavailable
const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development'
const FALLBACK_API_URL = isDevelopment ? 'http://localhost:3000' : ''
const API_BASE_URL = ''

// Connection health check state
let connectionHealthy = true
let lastConnectionCheck = 0
const CONNECTION_CHECK_INTERVAL = 30000 // Check every 30 seconds
const CONNECTION_CHECK_TIMEOUT = 5000 // 5 second timeout

/**
 * Check if backend server is available
 * @returns Promise<boolean> True if server is reachable
 */
async function checkConnectionHealth(): Promise<boolean> {
  const now = Date.now()
  // Skip if checked recently
  if (now - lastConnectionCheck < CONNECTION_CHECK_INTERVAL) {
    return connectionHealthy
  }
  
  lastConnectionCheck = now
  
  try {
    // Try health check endpoint with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), CONNECTION_CHECK_TIMEOUT)
    
    const response = await fetch(`${API_BASE_URL || FALLBACK_API_URL}/api/health/live`, {
      method: 'GET',
      signal: controller.signal,
      credentials: 'include',
    })
    
    clearTimeout(timeoutId)
    connectionHealthy = response.ok
    return connectionHealthy
  } catch (error) {
    connectionHealthy = false
    logger.warn('Connection health check failed', { error: error instanceof Error ? error.message : error })
    return false
  }
}

/**
 * Get the effective API base URL, with fallback if needed
 * @returns string API base URL
 */
function getApiBaseUrl(): string {
  // In production, always use relative URLs (same origin)
  if (!isDevelopment) {
    return API_BASE_URL
  }
  
  // In development, prefer relative URLs (Vite proxy) but have fallback
  // The fallback will be used if proxy fails
  return API_BASE_URL
}

// Helper function to get auth token
function getAuthToken(): string | null {
  return localStorage.getItem('authToken')
}

// Rate limiting state to prevent excessive retries
let rateLimitedUntil: number = 0

export function isRateLimited(): boolean {
  return Date.now() < rateLimitedUntil
}

function setRateLimited(durationMs: number = 30000) { // Default 30 seconds
  rateLimitedUntil = Date.now() + durationMs
}

/**
 * Clear rate limit state - should be called on logout
 * to prevent rate limit from persisting across user sessions
 */
export function clearRateLimitState(): void {
  rateLimitedUntil = 0
}

// Request deduplication: Track in-flight requests to prevent duplicate simultaneous calls
const inFlightRequests = new Map<string, Promise<unknown>>()

// Simple cache for GET requests with TTL (5 minutes default)
interface CacheEntry {
  data: unknown
  timestamp: number
  ttl: number
}

const requestCache = new Map<string, CacheEntry>()
const DEFAULT_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Clear all in-memory GET caches and in-flight dedupe entries.
 * Must run on logout/login so responses from one user are never reused for another.
 */
export function clearRequestCache(): void {
  requestCache.clear()
  inFlightRequests.clear()
}

function getAuthCacheScope(skipAuth: boolean): string {
  if (skipAuth) return 'anon'
  return getAuthToken() ?? 'anon'
}

// Cache keys: "authScope:METHOD:ENDPOINT:BODY"
function getCacheKey(endpoint: string, options: RequestInit, authScope: string): string {
  const method = options.method || 'GET'
  const body = options.body ? JSON.stringify(options.body) : ''
  return `${authScope}:${method}:${endpoint}:${body}`
}

// Check if cache entry is still valid
function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp < entry.ttl
}

// Invalidate cache entries matching an endpoint pattern
// Useful for invalidating document caches when paragraphs are modified
export function invalidateCache(endpointPattern: string | RegExp): void {
  const pattern = typeof endpointPattern === 'string' 
    ? new RegExp(endpointPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    : endpointPattern
  
  let invalidatedCount = 0
  for (const [key] of requestCache.entries()) {
    // Cache keys are in format: "authScope:METHOD:ENDPOINT:BODY" (BODY can be empty)
    const endpointMatch = key.match(/^[^:]+:[^:]+:(.+?)(?::|$)/)
    if (endpointMatch && pattern.test(endpointMatch[1])) {
      requestCache.delete(key)
      invalidatedCount++
    }
  }
  
  if (invalidatedCount > 0) {
    logger.log(`Invalidated ${invalidatedCount} cache entries for pattern: ${endpointPattern}`)
  }
}

// Invalidate related caches after mutations
function invalidateCacheForMutation(endpoint: string, method: string, result: unknown): void {
  // Invalidate the specific endpoint's GET cache
  invalidateCache(endpoint)
  
  // Invalidate related endpoints based on mutation type
  if (endpoint.startsWith('/api/documents')) {
    // Document mutations - invalidate document list and related document caches
    invalidateCache('/api/documents')
    
    // Extract document ID from endpoint if present
    const documentIdMatch = endpoint.match(/\/api\/documents\/([^/]+)/)
    if (documentIdMatch) {
      const documentId = documentIdMatch[1]
      // Invalidate specific document cache
      invalidateCache(`/api/documents/${documentId}`)
      // Invalidate related endpoints
      invalidateCache(`/api/documents/${documentId}/.*`)
    }
    
    // If result contains document data, also invalidate organization documents if applicable
    if (result && typeof result === 'object' && 'document' in result) {
      const doc = (result as { document?: { organizationId?: string } }).document
      if (doc?.organizationId) {
        invalidateCache(`/api/documents/organization/${doc.organizationId}`)
      }
    }
  } else if (endpoint.startsWith('/api/organizations')) {
    // Organization mutations - invalidate organization list
    invalidateCache('/api/organizations')
    
    // Extract organization ID from endpoint if present
    const orgIdMatch = endpoint.match(/\/api\/organizations\/([^/]+)/)
    if (orgIdMatch) {
      const orgId = orgIdMatch[1]
      // Invalidate specific organization cache
      invalidateCache(`/api/organizations/${orgId}`)
    }
  } else if (endpoint.startsWith('/api/documents/') && endpoint.includes('/paragraphs')) {
    // Paragraph mutations - invalidate document and paragraph caches
    const documentIdMatch = endpoint.match(/\/api\/documents\/([^/]+)/)
    if (documentIdMatch) {
      const documentId = documentIdMatch[1]
      invalidateCache(`/api/documents/${documentId}`)
      invalidateCache(`/api/documents/${documentId}/paragraphs`)
    }
  } else if (endpoint.startsWith('/api/documents/') && (endpoint.includes('/proposals') || endpoint.includes('/vote') || endpoint.includes('/comments'))) {
    // Proposal/vote/comment mutations - invalidate document cache
    const documentIdMatch = endpoint.match(/\/api\/documents\/([^/]+)/)
    if (documentIdMatch) {
      const documentId = documentIdMatch[1]
      invalidateCache(`/api/documents/${documentId}`)
      invalidateCache(`/api/documents/${documentId}/.*`)
    }
  }
  
  logger.log(`Cache invalidation triggered for ${method} ${endpoint}`)
}

// Clear expired cache entries periodically
// Use a conditional check to ensure this only runs in browser environment
// and defer initialization to avoid TDZ issues during module load
if (typeof window !== 'undefined') {
  // Defer setInterval to next tick to ensure all module initialization is complete
  setTimeout(() => {
    setInterval(() => {
      const now = Date.now()
      for (const [key, entry] of requestCache.entries()) {
        if (now - entry.timestamp >= entry.ttl) {
          requestCache.delete(key)
        }
      }
    }, 60000) // Clean up every minute
  }, 0)
}

const CAMEL_CACHE = new Map<string, string>()

function toCamelCase(key: string): string {
  if (CAMEL_CACHE.has(key)) {
    return CAMEL_CACHE.get(key) as string
  }

  const camel = key.replace(/[_-]([a-z])/gi, (_, char: string) => char.toUpperCase())
  CAMEL_CACHE.set(key, camel)
  return camel
}

function camelCaseKeys<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => camelCaseKeys(item)) as unknown as T
  }

  if (input !== null && typeof input === 'object') {
    return Object.entries(input as Record<string, unknown>).reduce((acc, [key, value]) => {
      const camelKey = toCamelCase(key)
      const transformedValue = camelCaseKeys(value)
      return { ...acc, [camelKey]: transformedValue }
    }, {} as Record<string, unknown>) as T
  }

  return input
}

// Enhanced error types for better error handling
// Error response structure from API requests (e.g., axios errors)
export interface ApiErrorResponse {
  response?: {
    data?: {
      error?: string;
      details?: string;
      field?: string;
      migrationHint?: string;
      [key: string]: unknown;
    };
    status?: number;
    [key: string]: unknown;
  };
  message?: string;
  [key: string]: unknown;
}

export interface StructuredErrorDetails {
  message?: string
  code?: string | null
  status?: number
  details?: unknown
  fieldErrors?: Record<string, string>
  reason?: string
  suggestion?: string
  [key: string]: unknown
}

export class ApiError extends Error {
  public code?: string | null
  public fieldErrors?: Record<string, string>

  constructor(
    message: string,
    public status: number,
    public endpoint: string,
    public details?: StructuredErrorDetails | unknown
  ) {
    super(message)
    this.name = 'ApiError'
    
    // Extract structured error information
    if (details && typeof details === 'object' && details !== null) {
      const structured = details as StructuredErrorDetails
      this.code = structured.code
      this.fieldErrors = structured.fieldErrors
    }
  }

  /**
   * Get field-specific error message
   */
  getFieldError(field: string): string | undefined {
    return this.fieldErrors?.[field]
  }

  /**
   * Check if error has field-specific errors
   */
  hasFieldErrors(): boolean {
    return !!this.fieldErrors && Object.keys(this.fieldErrors).length > 0
  }

  /**
   * Get all field errors as an array
   */
  getFieldErrorsArray(): Array<{ field: string; message: string }> {
    if (!this.fieldErrors) return []
    return Object.entries(this.fieldErrors).map(([field, message]) => ({
      field,
      message
    }))
  }
}

export class NetworkError extends Error {
  constructor(message: string, public endpoint: string) {
    super(message)
    this.name = 'NetworkError'
  }
}

export class AuthError extends ApiError {
  constructor(message: string, endpoint: string) {
    super(message, 401, endpoint)
    this.name = 'AuthError'
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string, endpoint: string, retryAfter?: number) {
    super(message, 429, endpoint, { retryAfter })
    this.name = 'RateLimitError'
  }
}

// Helper function to make authenticated requests with enhanced error handling
export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
  retries: number = 2,
  skipAuth: boolean = false
): Promise<T> {
  // Critical user actions should bypass client-side rate limit check
  // (server will still enforce rate limits, but we don't block user actions)
  const method = options.method || 'GET'
  const isCriticalAction = 
    (endpoint === '/api/documents' && method === 'POST') || // Document creation
    (endpoint.includes('/vote') && method === 'POST') || // Voting
    (endpoint === '/api/documents/batch' && method === 'POST'); // Batch fetch (already optimized)
  
  if (!isCriticalAction && isRateLimited()) {
    const waitTime = Math.ceil((rateLimitedUntil - Date.now()) / 1000)
    throw new RateLimitError(`Rate limited. Please wait ${waitTime} seconds before retrying.`, endpoint, waitTime)
  }
  const cacheKey = getCacheKey(endpoint, options, getAuthCacheScope(skipAuth))

  // Check cache for GET requests
  if (method === 'GET') {
    const cached = requestCache.get(cacheKey)
    if (cached && isCacheValid(cached)) {
      logger.log(`Cache hit for ${endpoint}`)
      return cached.data as T
    }
  }

  // Check for in-flight request (deduplication) - must check and set atomically
  const inFlight = inFlightRequests.get(cacheKey)
  if (inFlight) {
    logger.log(`Deduplicating request to ${endpoint}`)
    return inFlight as Promise<T>
  }

  // Create the request promise
  const requestPromise = (async (): Promise<T> => {
    const headersFromOptions = (options.headers ?? {}) as Record<string, string>
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headersFromOptions,
    }

    // Add auth token if available and not skipping auth
    const token = skipAuth ? null : getAuthToken()
    // Security: Don't log tokens, even partially
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const config: RequestInit = {
      ...options,
      headers,
      credentials: 'include',
    }

    let lastError: Error | undefined

    // Check connection health before making request (only in development, non-blocking for critical endpoints)
    // Skip health check for auth endpoints to prevent login from freezing
    const isAuthEndpoint = endpoint.includes('/api/auth/')
    if (isDevelopment && !isAuthEndpoint) {
      // Run health check but don't wait for it - make it non-blocking
      checkConnectionHealth().catch(err => {
        logger.debug('Connection health check failed (non-blocking)', { error: err.message })
      })
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      let timeoutId: NodeJS.Timeout | undefined
      try {
        // Use fallback URL if initial request fails and we're in development
        let baseUrl = getApiBaseUrl()
        if (isDevelopment && attempt > 0 && !connectionHealthy && baseUrl === '') {
          // Try direct connection as fallback
          baseUrl = FALLBACK_API_URL
          logger.log(`Attempting direct connection to ${baseUrl}${endpoint}`)
        }
        
        // Add timeout to prevent requests from hanging indefinitely
        // Use AbortController for timeout (10 seconds for auth to fail fast, 20 seconds for others)
        // Document creation gets longer timeout (60 seconds) due to potential database locking
        // Voting/complete endpoints get 90 seconds to account for lock acquisition + transaction time
        const isDocumentCreation = endpoint === '/api/documents' && method === 'POST'
        const isVotingEndpoint = endpoint.includes('/vote') && method === 'POST'
        const isCompleteEndpoint = endpoint.includes('/complete') && method === 'POST'
        const requestTimeout = isAuthEndpoint ? 10000 : (isVotingEndpoint || isCompleteEndpoint ? 90000 : (isDocumentCreation ? 60000 : 20000))
        const abortController = new AbortController()
        timeoutId = setTimeout(() => {
          abortController.abort()
        }, requestTimeout)
        
        const response = await fetch(`${baseUrl}${endpoint}`, {
          ...config,
          signal: abortController.signal
        })
        
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = undefined
        }

        if (response.status === 204) {
          return null as T
        }

        const contentType = response.headers.get('content-type') || ''
        let rawData: Record<string, unknown> = {}
        let responseText = ''

        let jsonParseFailed = false
        try {
          responseText = await response.text()

          if (responseText) {
            const shouldParseJson = contentType.includes('application/json')
            if (shouldParseJson) {
              try {
                rawData = JSON.parse(responseText) as Record<string, unknown>
              } catch (parseErr) {
                jsonParseFailed = true
                logger.warn(`Failed to parse JSON response from ${endpoint}:`, {
                  error: parseErr instanceof Error ? parseErr.message : parseErr,
                  contentType,
                  responsePreview: responseText.slice(0, 200),
                })
              }
            } else {
              // Try JSON anyway, but fall back to text payload
              try {
                rawData = JSON.parse(responseText) as Record<string, unknown>
              } catch {
                jsonParseFailed = true
                logger.warn(`Response is not JSON from ${endpoint}:`, {
                  contentType,
                  responsePreview: responseText.slice(0, 200),
                })
              }
            }
          }
        } catch (parseError) {
          jsonParseFailed = true
          logger.warn(`Failed to read response from ${endpoint}:`, {
            error: parseError instanceof Error ? parseError.message : parseError,
            contentType,
          })
        }

        // If JSON parsing failed, throw an error even if response.ok is true
        // because we can't use a response that isn't valid JSON
        if (jsonParseFailed) {
          const errorMessage = `Invalid response format: Expected JSON but received ${contentType || 'unknown content type'}`
          throw new ApiError(errorMessage, response.status || 500, endpoint, {
            contentType,
            rawBody: responseText ? responseText.slice(0, 2000) : undefined,
          })
        }

        if (!response.ok) {
          // Parse structured error response
          const errorMessage = (rawData && rawData.error)
            ? String(rawData.error)
            : `API request failed: ${response.status} ${response.statusText}`

          // Also check message field for additional error details (used for database connection errors)
          const errorMessageFull = (rawData && rawData.message)
            ? `${errorMessage}. ${rawData.message}`
            : errorMessage

          // Extract error code and details
          const errorCode = rawData?.code || null
          const errorDetails = rawData?.details || rawData

          // Extract field-specific validation errors
          const fieldErrors: Record<string, string> = {}
          
          const safeMessage = typeof errorMessage === 'string' ? errorMessage.slice(0, 200) : String(response.status)
          logger.warn('API error response', {
            endpoint,
            status: response.status,
            errorCode,
            message: safeMessage
          })
          if (import.meta.env.DEV && rawData) {
            logger.debug('Error response details (dev)', { errorDetailsType: typeof errorDetails, errorDetails, fullResponse: rawData })
          }

          if (Array.isArray(errorDetails)) {
            // Handle array of field errors (from validation middleware or route handler)
            errorDetails.forEach((detail: { field?: string; message?: string; error?: string; msg?: string }) => {
              if (detail && typeof detail === 'object') {
                const field = detail.field
                const message = detail.message || detail.msg || detail.error
                if (field && message) {
                  fieldErrors[field] = message
                }
              }
            })
          } else if (typeof errorDetails === 'object' && errorDetails !== null) {
            const detailsObj = errorDetails as { 
              validationErrors?: Array<{ field?: string; message?: string; error?: string; msg?: string }>
              details?: Array<{ field?: string; message?: string; error?: string; msg?: string }>
            }
            
            // Check for validationErrors array (from ApiError.validation)
            if (Array.isArray(detailsObj.validationErrors)) {
              logger.debug('Found validationErrors array:', detailsObj.validationErrors)
              detailsObj.validationErrors.forEach((detail) => {
                if (detail && typeof detail === 'object') {
                  const field = detail.field
                  const message = detail.message || detail.msg || detail.error
                  if (field && message) {
                    fieldErrors[field] = message
                  }
                }
              })
            }
            // Check if details contains field-specific errors (from route handler)
            else if (Array.isArray(detailsObj.details)) {
              logger.debug('Found details array:', detailsObj.details)
              detailsObj.details.forEach((detail) => {
                if (detail && typeof detail === 'object') {
                  const field = detail.field
                  const message = detail.message || detail.msg || detail.error
                  if (field && message) {
                    fieldErrors[field] = message
                  }
                }
              })
            }
          }
          
          if (Object.keys(fieldErrors).length > 0 && import.meta.env.DEV) {
            console.error('Validation field errors:', fieldErrors)
          }
          if (import.meta.env.DEV && Object.keys(fieldErrors).length === 0 && rawData) {
            console.warn('No field errors found in response. Full error:', rawData)
          }

          // Create structured error object
          const structuredError = {
            message: errorMessage,
            code: errorCode,
            status: response.status,
            details: errorDetails,
            fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined
          }

          // Check if this is a database connection issue (not an auth issue)
          // The server returns 503 with "Service temporarily unavailable" for database issues
          // Check both error and message fields to catch database connection errors
          // Also check for connection pool errors and timeout errors
          const serverMessage = rawData?.message ? String(rawData.message).toLowerCase() : ''
          const isDatabaseConnectionError = errorMessageFull.toLowerCase().includes('database connection is temporarily unavailable') ||
                                           errorMessageFull.toLowerCase().includes('service temporarily unavailable') ||
                                           errorMessageFull.toLowerCase().includes('unable to acquire a connection') ||
                                           errorMessageFull.toLowerCase().includes('connection pool') ||
                                           errorMessageFull.toLowerCase().includes('connection timeout') ||
                                           serverMessage.includes('database connection is temporarily unavailable') ||
                                           serverMessage.includes('unable to acquire a connection') ||
                                           (response.status === 503 && (errorMessageFull.toLowerCase().includes('database') || serverMessage.includes('database')))

          // Check for authentication failures (but exclude database connection errors)
          // The server may return 500 with "Authentication failed" when database is unavailable
          const isAuthFailure = !isDatabaseConnectionError && (
                                errorMessage.toLowerCase().includes('authentication failed') || 
                                errorMessage.toLowerCase().includes('invalid credentials') || 
                                errorMessage.toLowerCase().includes('authentication required') ||
                                errorMessage.toLowerCase().includes('invalid or expired token') ||
                                errorMessage.toLowerCase().includes('access token required') ||
                                (errorCode && (errorCode.includes('AUTH') || errorCode.includes('CREDENTIALS')))
                              )
          
          if (isAuthFailure) {
            // Clear invalid/expired token to prevent repeated failures
            clearRequestCache()
            localStorage.removeItem('authToken');
            // Dispatch custom event to notify auth system
            window.dispatchEvent(new Event('authTokenCleared'));
            throw new AuthError(errorMessage, endpoint)
          }

          // Create specific error types based on status
          // IMPORTANT: Only clear token on 401 if we're CERTAIN it's an auth failure, not a database error
          // Database connection errors during auth can sometimes return 401 if the error format is unexpected
          if (response.status === 401 && !isDatabaseConnectionError) {
            // 401 = Unauthorized (invalid/expired token) - only clear if NOT a database connection error
            // Check error message to ensure it's actually an auth failure
            const isDefiniteAuthFailure = errorMessage.toLowerCase().includes('authentication required') ||
                                        errorMessage.toLowerCase().includes('access token required') ||
                                        errorMessage.toLowerCase().includes('invalid or expired token') ||
                                        errorMessage.toLowerCase().includes('invalid credentials')
            
            if (isDefiniteAuthFailure) {
              clearRequestCache()
              localStorage.removeItem('authToken');
              // Dispatch custom event to notify auth system
              window.dispatchEvent(new Event('authTokenCleared'));
              throw new AuthError(errorMessage, endpoint)
            } else {
              // 401 but unclear if it's auth or database - don't clear token, just throw error
              // This prevents false logouts during database connection issues
              throw new ApiError(errorMessage, response.status, endpoint, structuredError)
            }
          } else if (response.status === 503 && !isDatabaseConnectionError) {
            // 503 = Service Unavailable - only treat as auth failure if it's not a database connection error
            // This handles cases where auth service itself is unavailable
            clearRequestCache()
            localStorage.removeItem('authToken');
            // Dispatch custom event to notify auth system
            window.dispatchEvent(new Event('authTokenCleared'));
            throw new AuthError(errorMessage, endpoint)
          } else if (response.status === 429) {
            // Rate limit - check for retryAfter in response body first, then Retry-After header, default to 15 minutes (900 seconds)
            let retryAfterSeconds = 900 // Default to 15 minutes (matches server rate limit window)
            
            // Check response body for retryAfter
            if (rawData && typeof rawData === 'object' && 'retryAfter' in rawData) {
              const bodyRetryAfter = Number(rawData.retryAfter)
              if (!isNaN(bodyRetryAfter) && bodyRetryAfter > 0) {
                retryAfterSeconds = bodyRetryAfter
              }
            } else {
              // Fall back to Retry-After header
              const retryAfterHeader = response.headers.get('Retry-After')
              if (retryAfterHeader) {
                const parsed = parseInt(retryAfterHeader, 10)
                if (!isNaN(parsed) && parsed > 0) {
                  retryAfterSeconds = parsed
                }
              }
            }
            
            const retryAfterMs = retryAfterSeconds * 1000
            setRateLimited(retryAfterMs)
            const retryAfterMinutes = Math.ceil(retryAfterSeconds / 60)
            logger.warn(`Rate limited on ${endpoint}. Blocking requests for ${retryAfterSeconds} seconds (${retryAfterMinutes} minutes).`)
            throw new RateLimitError(errorMessage, endpoint, retryAfterSeconds)
          } else {
            // Check for database connection errors (check both error codes and message content)
            // Note: isDatabaseConnectionError was already checked above for 503 status
            const isDbError = isDatabaseConnectionError ||
                             errorCode === 'DATABASE_CONNECTION_LOST' || 
                             errorCode === 'DATABASE_CONNECTION_ERROR' ||
                             (errorDetails && typeof errorDetails === 'object' && 'connectionIssue' in errorDetails) ||
                             (response.status === 503 && errorMessage.toLowerCase().includes('database connection is temporarily unavailable'));
            
            if (isDbError) {
              // Update connection status to indicate reconnection attempt
              updateConnectionStatus('reconnecting');
            } else if (errorCode === 'DATABASE_ERROR' || errorCode === 'DATABASE_BUSY') {
              // Generic database error - mark as error but may recover
              updateConnectionStatus('error');
            }
            
            // Include structured error in details
            throw new ApiError(errorMessage, response.status, endpoint, structuredError)
          }
        }

        const result = camelCaseKeys(rawData) as T

        // Update connection status to connected on successful request
        updateConnectionStatus('connected');

        // Cache successful GET requests
        if (method === 'GET') {
          requestCache.set(cacheKey, {
            data: result,
            timestamp: Date.now(),
            ttl: DEFAULT_CACHE_TTL
          })
        } else {
          // Invalidate related caches on successful mutations (POST/PUT/PATCH/DELETE)
          invalidateCacheForMutation(endpoint, method, result)
        }

        return result

      } catch (error) {
      lastError = error as Error
      
      // Clear timeout if it was set
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = undefined
      }
      
      // Check if request was aborted (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutMessage = isAuthEndpoint 
          ? 'Request timed out after 10 seconds. Please ensure the backend server is running on port 3000 (run "npm run dev" in the project root).'
          : 'Request timed out. Please try again.'
        throw new NetworkError(timeoutMessage, endpoint)
      }
      
      // Check if it's a network/connection error
      const isNetworkError = error instanceof TypeError && 
        (error.message.includes('Failed to fetch') || 
         error.message.includes('NetworkError') ||
         error.message.includes('Network request failed') ||
         error.name === 'AbortError')
      
      // Mark connection as unhealthy on network errors
      if (isNetworkError) {
        connectionHealthy = false
        updateConnectionStatus('disconnected')
        logger.warn('Network error detected, marking connection as unhealthy', { 
          endpoint, 
          attempt: attempt + 1,
          error: error.message 
        })
      }
      
      // Check for database connection errors in ApiError
      if (error instanceof ApiError) {
        const errorCode = error.code || ''
        const errorDetails = error.details as { connectionIssue?: boolean; retryable?: boolean } | undefined
        
        if (errorCode === 'DATABASE_CONNECTION_LOST' || errorCode === 'DATABASE_CONNECTION_ERROR' || errorDetails?.connectionIssue) {
          updateConnectionStatus('reconnecting')
        } else if (errorCode === 'DATABASE_ERROR' || errorCode === 'DATABASE_BUSY') {
          updateConnectionStatus('error')
        }
      }
      
      // Log error with field errors if available
      if (error instanceof ApiError && error.hasFieldErrors()) {
        logger.error(`API Request attempt ${attempt + 1} failed:`, {
          message: error.message,
          code: error.code,
          fieldErrors: error.fieldErrors,
          endpoint
        })
      }
      
      // Only log errors that aren't auth errors (to reduce log spam)
      if (!(error instanceof AuthError)) {
        if (isNetworkError && attempt === 0) {
          // Provide helpful error message for connection failures
          logger.error(`Connection failed to ${endpoint}. ${isDevelopment ? 'Is the backend server running on port 3000?' : 'Please check your network connection.'}`, {
            endpoint,
            baseUrl: getApiBaseUrl() || FALLBACK_API_URL,
            error: error.message
          })
        } else {
          logger.error(`API Request attempt ${attempt + 1} failed:`, error)
        }
      }

      // Check for database connection errors that should be retried
      const isDatabaseConnectionError = error instanceof ApiError && (
        error.code === 'DATABASE_CONNECTION_LOST' ||
        error.code === 'DATABASE_CONNECTION_ERROR' ||
        (error.details && typeof error.details === 'object' && 'connectionIssue' in error.details && (error.details as { connectionIssue?: boolean }).connectionIssue)
      );
      
      // Don't retry on auth errors or permanent client errors
      // Retry on: network errors, server errors (5xx), timeouts (408), rate limits (429), database connection errors, and specific 4xx that might be transient
      const shouldNotRetry = error instanceof AuthError ||
        error instanceof RateLimitError ||  // Don't retry rate limit errors
        (error instanceof ApiError && !isDatabaseConnectionError && (
          (error.status >= 400 && error.status < 408) ||  // 400-407 (except 408)
          (error.status >= 410 && error.status < 429) ||  // 410-428 (except 429)
          (error.status >= 430 && error.status < 500)     // 430-499
        ));
      
      // For database connection errors, use longer retry delays
      if (isDatabaseConnectionError && attempt < retries) {
        const delay = Math.min(2000 * Math.pow(2, attempt), 10000) // 2s, 4s, 8s, max 10s
        logger.log(`Database connection error - retrying in ${delay}ms...`)
        updateConnectionStatus('reconnecting')
        await new Promise(resolve => setTimeout(resolve, delay))
        continue // Retry immediately after delay
      }

      if (shouldNotRetry) {
        // Enhance network error messages
        if (isNetworkError && !(error instanceof ApiError)) {
          const helpfulMessage = isDevelopment
            ? `Cannot connect to backend server. Please ensure the server is running on port 3000 (run 'npm run dev' in the project root).`
            : `Network error: Unable to reach the server. Please check your internet connection.`
          throw new NetworkError(helpfulMessage, endpoint)
        }
        throw error;
      }

      // Check if we became rate limited during retry attempts
      if (isRateLimited()) {
        const waitTime = Math.ceil((rateLimitedUntil - Date.now()) / 1000)
        throw new RateLimitError(`Rate limited. Please wait ${waitTime} seconds before retrying.`, endpoint, waitTime)
      }

      // Wait before retrying (exponential backoff)
      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000)
        logger.log(`Retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  // If we get here, all retries failed
  if (lastError) {
    if (lastError instanceof ApiError || lastError instanceof AuthError) {
      throw lastError
    } else {
      // Network or other error - provide helpful message
      const isNetworkError = lastError instanceof TypeError && 
        (lastError.message.includes('Failed to fetch') || 
         lastError.message.includes('NetworkError') ||
         lastError.message.includes('Network request failed'))
      
      if (isNetworkError) {
        const helpfulMessage = isDevelopment
          ? `Cannot connect to backend server after ${retries + 1} attempts. Please ensure the server is running on port 3000 (run 'npm run dev' in the project root).`
          : `Network error: Unable to reach the server after ${retries + 1} attempts. Please check your internet connection.`
        throw new NetworkError(helpfulMessage, endpoint)
      } else {
        throw new NetworkError(`Network error: ${lastError.message}`, endpoint)
      }
    }
  } else {
    // This should never happen, but TypeScript requires it
    throw new NetworkError('Unknown error occurred', endpoint)
  }
  })() // End of async IIFE

  // Store in-flight request for deduplication (check again in case another request was added)
  const existing = inFlightRequests.get(cacheKey)
  if (existing) {
    // Another request was added while we were creating this one - use that instead
    return existing as Promise<T>
  }
  
  inFlightRequests.set(cacheKey, requestPromise)

  try {
    const result = await requestPromise
    return result
  } finally {
    // Remove from in-flight requests when done (only if it's still our promise)
    if (inFlightRequests.get(cacheKey) === requestPromise) {
      inFlightRequests.delete(cacheKey)
    }
  }
}

// API client for backend integration
import type { HeadingLevel } from "../types";

const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? '' // In production, use relative URLs
  : 'http://localhost:3000' // Direct connection for development

// Helper function to get auth token
function getAuthToken(): string | null {
  return localStorage.getItem('authToken')
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

// Helper function to make authenticated requests
async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const headersFromOptions = (options.headers ?? {}) as Record<string, string>
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headersFromOptions,
  }

  // Add auth token if available
  const token = getAuthToken()
  console.log(`API Request to ${endpoint}, token:`, token ? `${token.substring(0, 20)}...` : 'none')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const config: RequestInit = {
    ...options,
    headers,
    credentials: 'include',
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config)

  if (response.status === 204) {
    return null
  }

  const rawData = await response.json().catch(() => ({}))

  if (!response.ok) {
    const errorMessage = (rawData && rawData.error) ? rawData.error : `API request failed: ${response.status} ${response.statusText}`
    throw new Error(errorMessage)
  }

  return camelCaseKeys(rawData)
}

// Document API functions
export const documentsApi = {
  // Get all documents for current user
  async getDocuments() {
    return apiRequest('/api/documents')
  },

  // Get a specific document with full details
  async getDocument(id: string) {
    return apiRequest(`/api/documents/${id}`)
  },

  // Create a new document
  async createDocument(title: string) {
    return apiRequest('/api/documents', {
      method: 'POST',
      body: JSON.stringify({ title }),
    })
  },

  // Update document title
  async updateDocument(id: string, title: string) {
    return apiRequest(`/api/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ title }),
    })
  },

  // Delete a document
  async deleteDocument(id: string) {
    return apiRequest(`/api/documents/${id}`, {
      method: 'DELETE',
    })
  },

  // Add collaborator to document
  async addCollaborator(documentId: string, userId: string) {
    return apiRequest(`/api/documents/${documentId}/collaborators`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    })
  },

  // Remove collaborator from document
  async removeCollaborator(documentId: string, userId: string) {
    return apiRequest(`/api/documents/${documentId}/collaborators/${userId}`, {
      method: 'DELETE',
    })
  },
}

// Paragraph API functions
export const paragraphsApi = {
  // Create a new paragraph
  async createParagraph(
    documentId: string,
    data: {
      title?: string
      text: string
      order: number
      asSuggestion?: boolean
      headingLevel?: HeadingLevel
    }
  ) {
    console.log(`Creating paragraph in document ${documentId}:`, data)
    return apiRequest(`/api/documents/${documentId}/paragraphs`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // Update a paragraph
  async updateParagraph(
    documentId: string,
    paragraphId: string,
    data: {
      title?: string
      text?: string
      order?: number
    }
  ) {
    return apiRequest(`/api/documents/${documentId}/paragraphs/${paragraphId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  // Delete a paragraph
  async deleteParagraph(documentId: string, paragraphId: string) {
    return apiRequest(`/api/documents/${documentId}/paragraphs/${paragraphId}`, {
      method: 'DELETE',
    })
  },
}

// Proposal API functions
export const proposalsApi = {
  // Create a new proposal
  async createProposal(
    documentId: string,
    paragraphId: string,
    data: {
      text: string
      type: 'BODY' | 'TITLE'
      headingLevel?: HeadingLevel
    }
  ) {
    return apiRequest(`/api/documents/${documentId}/paragraphs/${paragraphId}/proposals`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
}

// Vote API functions
export const votesApi = {
  // Cast or update a vote on a proposal
  async castVote(
    documentId: string,
    paragraphId: string,
    proposalId: string,
    vote: 'PRO' | 'NEUTRAL' | 'CONTRA'
  ) {
    return apiRequest(`/api/documents/${documentId}/paragraphs/${paragraphId}/proposals/${proposalId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote }),
    })
  },
}

// Comment API functions
export const commentsApi = {
  // Add a comment to a proposal
  async addComment(
    documentId: string,
    paragraphId: string,
    proposalId: string,
    data: {
      text: string
      parentId?: string
    }
  ) {
    return apiRequest(`/api/documents/${documentId}/paragraphs/${paragraphId}/proposals/${proposalId}/comments`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
}

// Helper function to make unauthenticated requests (for login/register)
async function unauthenticatedRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const headersFromOptions = (options.headers ?? {}) as Record<string, string>
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headersFromOptions,
  }

  const config: RequestInit = {
    ...options,
    headers,
    credentials: 'include',
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config)

  if (response.status === 204) {
    return null
  }

  const rawData = await response.json().catch(() => ({}))

  if (!response.ok) {
    const errorMessage = (rawData && rawData.error) ? rawData.error : `API request failed: ${response.status} ${response.statusText}`
    throw new Error(errorMessage)
  }

  return camelCaseKeys(rawData)
}

// Auth API functions
export const authApi = {
  // Login
  async login(email: string, password: string) {
    return unauthenticatedRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  },

  // Register
  async register(name: string, email: string, password: string) {
    return unauthenticatedRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    })
  },

  // Get current user
  async getCurrentUser() {
    return apiRequest('/api/auth/me')
  },

  // Logout
  async logout() {
    return apiRequest('/api/auth/logout', {
      method: 'POST',
    })
  },

  // Get demo users (for development)
  async getDemoUsers() {
    return apiRequest('/api/auth/demo-users')
  },
}

// API client for backend integration
import type { HeadingLevel, StructureOperation, StructureProposal } from "../types";

const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? '' // In production, use relative URLs
  : 'http://localhost:3000' // Direct connection for development

// Helper function to get auth token
function getAuthToken(): string | null {
  return localStorage.getItem('authToken')
}

// Rate limiting state to prevent excessive retries
let rateLimitedUntil: number = 0

function isRateLimited(): boolean {
  return Date.now() < rateLimitedUntil
}

function setRateLimited(durationMs: number = 30000) { // Default 30 seconds
  rateLimitedUntil = Date.now() + durationMs
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
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public endpoint: string,
    public details?: any
  ) {
    super(message)
    this.name = 'ApiError'
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
export async function apiRequest(
  endpoint: string,
  options: RequestInit = {},
  retries: number = 2
): Promise<any> {
  // Check if we're currently rate limited
  if (isRateLimited()) {
    const waitTime = Math.ceil((rateLimitedUntil - Date.now()) / 1000)
    throw new RateLimitError(`Rate limited. Please wait ${waitTime} seconds before retrying.`, endpoint, waitTime)
  }

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

  let lastError: Error

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`API Request attempt ${attempt + 1}/${retries + 1} to ${endpoint}`)

      const response = await fetch(`${API_BASE_URL}${endpoint}`, config)

      if (response.status === 204) {
        return null
      }

      let rawData: any = {}
      try {
        rawData = await response.json()
      } catch (parseError) {
        console.warn(`Failed to parse JSON response from ${endpoint}:`, parseError)
        rawData = { error: 'Invalid response format' }
      }

      if (!response.ok) {
        const errorMessage = (rawData && rawData.error)
          ? rawData.error
          : `API request failed: ${response.status} ${response.statusText}`

        // Create specific error types based on status
        if (response.status === 401) {
          throw new AuthError(errorMessage, endpoint)
        } else if (response.status === 429) {
          // Rate limit - set rate limited state
          setRateLimited(30000) // 30 seconds
          throw new RateLimitError(errorMessage, endpoint, 30)
        } else if (response.status === 409) {
          // Conflict - special case for structure proposals
          throw new ApiError(errorMessage, response.status, endpoint, rawData)
        } else {
          throw new ApiError(errorMessage, response.status, endpoint, rawData)
        }
      }

      console.log(`API Request successful: ${endpoint}`)
      return camelCaseKeys(rawData)

    } catch (error) {
      lastError = error as Error
      console.error(`API Request attempt ${attempt + 1} failed:`, error)

      // Don't retry on auth errors or permanent client errors
      // Retry on: network errors, server errors (5xx), timeouts (408), rate limits (429), and specific 4xx that might be transient
      const shouldNotRetry = error instanceof AuthError ||
        (error instanceof ApiError && (
          (error.status >= 400 && error.status < 408) ||  // 400-407 (except 408)
          (error.status >= 410 && error.status < 429) ||  // 410-428 (except 429)
          (error.status >= 430 && error.status < 500)     // 430-499
        ));

      if (shouldNotRetry) {
        // For rate limiting (429), set rate limited state
        if (error instanceof ApiError && error.status === 429) {
          setRateLimited(30000) // 30 seconds
          console.warn(`Rate limited on ${endpoint}. Blocking requests for 30 seconds.`)
        }
        throw error;
      }

      // Wait before retrying (exponential backoff)
      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000)
        console.log(`Retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  // If we get here, all retries failed
  if (lastError instanceof ApiError || lastError instanceof AuthError) {
    throw lastError
  } else {
    // Network or other error
    throw new NetworkError(`Network error: ${lastError.message}`, endpoint)
  }
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
  async createDocument(
    title: string,
    description?: string,
    contributors?: string[],
    options?: {
      acceptanceThreshold?: number;
      votingAnonymous?: boolean;
      votingAnonymityLocked?: boolean;
      voteChangeAllowed?: boolean;
      structureProposalsEnabled?: boolean;
      parentId?: string;
    },
    ownershipType?: 'personal' | 'shared' | 'organizational',
    organizationId?: string
  ) {
    return apiRequest('/api/documents', {
      method: 'POST',
      body: JSON.stringify({
        title,
        description,
        options,
        ownershipType: ownershipType || 'personal',
        organizationId,
        parentId: options?.parentId || undefined,
        // For shared documents, send contributors as creatorIds (backend will add current user)
        creatorIds: ownershipType === 'shared' && contributors ? contributors : undefined
      }),
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

  // Vote on a document (document-level voting)
  async voteOnDocument(documentId: string, vote: 'PRO' | 'NEUTRAL' | 'CONTRA') {
    return apiRequest(`/api/documents/${documentId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote }),
    })
  },

  // Get document votes
  async getDocumentVotes(documentId: string) {
    return apiRequest(`/api/documents/${documentId}/votes`)
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
async function unapiRequest(
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

// Structure History API functions
export const structureHistoryApi = {
  // Get document structure versions
  async getStructureVersions(documentId: string): Promise<{ versions: StructureVersion[] }> {
    return apiRequest(`/api/documents/${documentId}/structure-history`)
  },

  // Get detailed change log for a version
  async getStructureVersion(documentId: string, versionId: string): Promise<{ version: StructureVersionDetail }> {
    return apiRequest(`/api/documents/${documentId}/structure-history/${versionId}`)
  },

  // Restore document to a previous version
  async restoreStructureVersion(documentId: string, versionId: string): Promise<{ message: string; backupVersionId: string; restoredVersionId: string }> {
    return apiRequest(`/api/documents/${documentId}/structure-history/${versionId}/restore`, {
      method: 'POST'
    })
  }
}

// Structure Proposals API functions
export const structureProposalsApi = {
  // Get all structure proposals for a document
  async getStructureProposals(documentId: string): Promise<{ structureProposals: StructureProposal[] }> {
    console.log('API: getStructureProposals called for document:', documentId);
    try {
      const result = await apiRequest(`/api/documents/${documentId}/structure-proposals`);
      console.log('API: getStructureProposals success:', result);
      return result;
    } catch (error) {
      console.error('API: getStructureProposals failed:', error);
      throw error;
    }
  },

  // Get a specific structure proposal
  async getStructureProposal(documentId: string, proposalId: string): Promise<{ structureProposal: StructureProposal }> {
    return apiRequest(`/api/documents/${documentId}/structure-proposals/${proposalId}`)
  },

  // Create a new structure proposal
  async createStructureProposal(
    documentId: string,
    title: string,
    description: string | undefined,
    operations: StructureOperation[]
  ): Promise<{ structureProposal: StructureProposal }> {
    return apiRequest(`/api/documents/${documentId}/structure-proposals`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        description,
        operations
      }),
    })
  },

  // Vote on a structure proposal
  async voteOnStructureProposal(
    documentId: string,
    proposalId: string,
    vote: 'PRO' | 'NEUTRAL' | 'CONTRA'
  ): Promise<{ message: string }> {
    return apiRequest(`/api/documents/${documentId}/structure-proposals/${proposalId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote }),
    })
  },

  // Delete/cancel a structure proposal
  async deleteStructureProposal(documentId: string, proposalId: string): Promise<{ message: string }> {
    return apiRequest(`/api/documents/${documentId}/structure-proposals/${proposalId}`, {
      method: 'DELETE'
    })
  },

  // Apply an approved structure proposal
  async applyStructureProposal(
    documentId: string,
    proposalId: string
  ): Promise<{ message: string }> {
    return apiRequest(`/api/documents/${documentId}/structure-proposals/${proposalId}/apply`, {
      method: 'POST',
    })
  },

  // Add comment to structure proposal
  async addCommentToStructureProposal(
    documentId: string,
    proposalId: string,
    text: string,
    parentId?: string
  ): Promise<{ message: string }> {
    return apiRequest(`/api/documents/${documentId}/structure-proposals/${proposalId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text, parentId }),
    })
  },
}

// Organization API functions
export const organizationsApi = {
  // Create organization (requires admin privileges)
  async createOrganization(
    name: string,
    description?: string,
    representatives?: string[],
    membershipPolicy?: 'open' | 'invitation',
    votingEnabled?: boolean,
    votingThreshold?: number
  ) {
    return organizationsApi.createOrganizationAdmin(name, representatives || [], {
      description,
      membershipPolicy: membershipPolicy || 'invitation',
      votingThreshold: votingThreshold || 0.75
    })
  },

  // Get user's organizations
  async getOrganizations() {
    return apiRequest('/api/organizations')
  },

  // Get organization details
  async getOrganization(organizationId: string) {
    return apiRequest(`/api/organizations/${organizationId}`)
  },

  // Get organization documents
  async getOrganizationDocuments(organizationId: string) {
    return apiRequest(`/api/documents/organization/${organizationId}`)
  },


  // Admin API functions
  async getAdminDashboard() {
    return apiRequest('/api/admin/dashboard')
  },

  async createOrganizationAdmin(
    name: string,
    representatives: string[],
    options?: {
      description?: string;
      membershipPolicy?: 'open' | 'invitation';
      votingThreshold?: number;
      governanceRules?: {
        representativeTermMonths?: number;
        electionVotingMethod?: 'simple_majority' | 'ranked_choice' | 'approval';
        electionQuorumPercentage?: number;
        defaultVotingDeadlineHours?: number;
        documentProposalPeriodDays?: number;
      };
    }
  ) {
    return apiRequest('/api/admin/organizations', {
      method: 'POST',
      body: JSON.stringify({
        name,
        representatives,
        description: options?.description,
        membershipPolicy: options?.membershipPolicy || 'invitation',
        votingThreshold: options?.votingThreshold || 0.75,
        governanceRules: options?.governanceRules
      }),
    })
  },

  async getAllOrganizationsAdmin() {
    return apiRequest('/api/admin/organizations')
  },

  async updateOrganizationStatus(id: string, isActive: boolean) {
    return apiRequest(`/api/admin/organizations/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    })
  },

  async getAllUsersAdmin() {
    return apiRequest('/api/admin/users')
  },

  async promoteUserToAdmin(userId: string) {
    return apiRequest(`/api/admin/promote-admin/${userId}`, {
      method: 'POST',
    })
  },

  // Update organization
  async updateOrganization(organizationId: string, updates: { name?: string, description?: string, membershipPolicy?: 'open' | 'invitation', votingThreshold?: number }) {
    return apiRequest(`/api/organizations/${organizationId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
  },

  // Nominate new representative
  async nominateRepresentative(organizationId: string, newRepresentativeId: string) {
    return apiRequest(`/api/organizations/${organizationId}/representatives`, {
      method: 'POST',
      body: JSON.stringify({ newRepresentativeId }),
    })
  },

  // Remove representative
  async removeRepresentative(organizationId: string, repId: string) {
    return apiRequest(`/api/organizations/${organizationId}/representatives/${repId}`, {
      method: 'DELETE',
    })
  },

  // Invite members
  async inviteMembers(organizationId: string, emails: string[]) {
    return apiRequest(`/api/organizations/${organizationId}/members/invite`, {
      method: 'POST',
      body: JSON.stringify({ emails }),
    })
  },

  // Add member
  async addMember(organizationId: string, userId: string) {
    return apiRequest(`/api/organizations/${organizationId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    })
  },

  // Remove member
  async removeMember(organizationId: string, userId: string) {
    return apiRequest(`/api/organizations/${organizationId}/members/${userId}`, {
      method: 'DELETE',
    })
  },

  // Get organization votes
  async getOrganizationVotes(organizationId: string) {
    return apiRequest(`/api/organizations/${organizationId}/votes`)
  },

  // Create organization vote
  async createOrganizationVote(organizationId: string, title: string, description?: string, voteType?: string, targetDocumentId?: string, votingStartDate?: string, votingEndDate?: string) {
    return apiRequest(`/api/organizations/${organizationId}/votes`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        description,
        voteType,
        targetDocumentId,
        votingStartDate,
        votingEndDate
      }),
    })
  },

  // Approve vote (representatives only)
  async approveVote(organizationId: string, voteId: string) {
    return apiRequest(`/api/organizations/${organizationId}/votes/${voteId}/approve`, {
      method: 'POST',
    })
  },

  // Cast vote in organization vote
  async castVote(organizationId: string, voteId: string, choice: 'yes' | 'no' | 'abstain') {
    return apiRequest(`/api/organizations/${organizationId}/votes/${voteId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ choice }),
    })
  },
}

// Governance API functions for democratic organization features
export const governanceApi = {
  // Governance Rules
  async getGovernanceRules(organizationId: string) {
    return apiRequest(`/api/governance/${organizationId}/governance-rules`)
  },

  async updateGovernanceRules(organizationId: string, updates: any) {
    return apiRequest(`/api/governance/${organizationId}/governance-rules`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
  },

  // Elections
  async createElection(organizationId: string, electionData: {
    title: string;
    description?: string;
    positionsAvailable: number;
    termMonths?: number;
  }) {
    return apiRequest(`/api/governance/${organizationId}/elections`, {
      method: 'POST',
      body: JSON.stringify(electionData),
    })
  },

  async getElections(organizationId: string) {
    return apiRequest(`/api/governance/${organizationId}/elections`)
  },

  async startElection(organizationId: string, electionId: string, votingData: {
    votingStartDate?: string;
    votingEndDate: string;
  }) {
    return apiRequest(`/api/governance/${organizationId}/elections/${electionId}/start`, {
      method: 'POST',
      body: JSON.stringify(votingData),
    })
  },

  async nominateCandidate(organizationId: string, electionId: string, nominationData: {
    candidateUserId: string;
    nominationStatement?: string;
  }) {
    return apiRequest(`/api/governance/${organizationId}/elections/${electionId}/candidates`, {
      method: 'POST',
      body: JSON.stringify(nominationData),
    })
  },

  async acceptNomination(organizationId: string, electionId: string, candidateId: string) {
    return apiRequest(`/api/governance/${organizationId}/elections/${electionId}/candidates/${candidateId}/accept`, {
      method: 'POST',
    })
  },

  async castElectionVote(organizationId: string, electionId: string, voteData: {
    candidateRanking: string[]; // Array of candidate IDs in order of preference
  }) {
    return apiRequest(`/api/governance/${organizationId}/elections/${electionId}/vote`, {
      method: 'POST',
      body: JSON.stringify(voteData),
    })
  },

  async completeElection(organizationId: string, electionId: string) {
    return apiRequest(`/api/governance/${organizationId}/elections/${electionId}/complete`, {
      method: 'POST',
    })
  },

      // Analytics
      async getVotingAnalytics(organizationId: string, period?: 'month' | 'quarter' | 'year') {
        const query = period ? `?period=${period}` : '';
        return apiRequest(`/api/governance/${organizationId}/analytics${query}`)
      },

      // Election Results
      async getElectionResults(organizationId: string, electionId: string) {
        return apiRequest(`/api/governance/${organizationId}/elections/${electionId}/results`)
      },

      // Policy Votes API
      policyVotesApi: {
        async getPolicyVotes(organizationId: string) {
          return apiRequest(`/api/governance/${organizationId}/policy-votes`)
        },

        async createPolicyVote(organizationId: string, voteData: {
          title: string;
          description?: string;
          documentId?: string;
          threshold?: number;
          deadlineHours?: number;
        }) {
          return apiRequest(`/api/governance/${organizationId}/policy-votes`, {
            method: 'POST',
            body: JSON.stringify(voteData),
          })
        },

        async voteOnPolicy(organizationId: string, voteId: string, voteChoice: 'yes' | 'no' | 'abstain') {
          return apiRequest(`/api/governance/${organizationId}/policy-votes/${voteId}/vote`, {
            method: 'POST',
            body: JSON.stringify({ vote: voteChoice }),
          })
        },
      },

      // Rule Proposals API
      ruleProposalsApi: {
        async getRuleProposals(organizationId: string) {
          return apiRequest(`/api/governance/${organizationId}/rule-proposals`)
        },

        async createRuleProposal(organizationId: string, proposalData: {
          title: string;
          description?: string;
          ruleField: string;
          proposedValue: any;
          options?: Array<{
            optionTitle: string;
            optionDescription?: string;
            proposedValue: any;
          }>;
        }) {
          return apiRequest(`/api/governance/${organizationId}/rule-proposals`, {
            method: 'POST',
            body: JSON.stringify(proposalData),
          })
        },

        async startRuleProposalVoting(organizationId: string, proposalId: string) {
          return apiRequest(`/api/governance/${organizationId}/rule-proposals/${proposalId}/start-voting`, {
            method: 'POST',
          })
        },

        async voteOnRuleProposal(organizationId: string, proposalId: string, voteData: {
          selectedOptionId?: string;
          voteChoice?: 'yes' | 'no' | 'abstain';
        }) {
          return apiRequest(`/api/governance/${organizationId}/rule-proposals/${proposalId}/vote`, {
            method: 'POST',
            body: JSON.stringify(voteData),
          })
        },

        async completeRuleProposal(organizationId: string, proposalId: string) {
          return apiRequest(`/api/governance/${organizationId}/rule-proposals/${proposalId}/complete`, {
            method: 'POST',
          })
        },
      },

      // Audit Logs API
      auditLogsApi: {
        async getAuditLogs(organizationId: string, filters?: {
          actionType?: string;
          performedBy?: string;
          affectedUser?: string;
          startDate?: string;
          endDate?: string;
          limit?: number;
          offset?: number;
        }) {
          const queryParams = new URLSearchParams();
          if (filters) {
            Object.entries(filters).forEach(([key, value]) => {
              if (value !== undefined && value !== null) {
                queryParams.append(key, value.toString());
              }
            });
          }
          const query = queryParams.toString();
          return apiRequest(`/api/governance/${organizationId}/audit-logs${query ? `?${query}` : ''}`)
        },

        async getAuditStats(organizationId: string, days?: number) {
          const query = days ? `?days=${days}` : '';
          return apiRequest(`/api/governance/${organizationId}/audit-stats${query}`)
        },

        async exportAuditLogs(organizationId: string, filters?: {
          startDate?: string;
          endDate?: string;
          format?: 'csv' | 'json';
        }) {
          const queryParams = new URLSearchParams();
          if (filters) {
            Object.entries(filters).forEach(([key, value]) => {
              if (value !== undefined && value !== null) {
                queryParams.append(key, value.toString());
              }
            });
          }
          const query = queryParams.toString();
          return apiRequest(`/api/governance/${organizationId}/audit-export${query ? `?${query}` : ''}`)
        },

        async getPublicAuditLogs(organizationId: string, filters?: {
          actionType?: string;
          startDate?: string;
          endDate?: string;
          limit?: number;
          offset?: number;
        }) {
          const queryParams = new URLSearchParams();
          if (filters) {
            Object.entries(filters).forEach(([key, value]) => {
              if (value !== undefined && value !== null) {
                queryParams.append(key, value.toString());
              }
            });
          }
          const query = queryParams.toString();
          return apiRequest(`/api/governance/${organizationId}/public-audit-logs${query ? `?${query}` : ''}`)
        },
    }
  }

// Auth API functions
export const authApi = {
  // Login
  async login(email: string, password: string) {
    return unapiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  },

  // Register
  async register(name: string, email: string, password: string) {
    return unapiRequest('/api/auth/register', {
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

// API client for backend integration
import type { 
  HeadingLevel, 
  StructureOperation, 
  StructureProposal,
  Document,
  Paragraph,
  Proposal,
  Vote,
  Comment,
  Organization,
  OrganizationGovernanceRules,
  RepresentativeElection,
  VotingAnalytics,
  StructureVersion,
  StructureVersionDetail,
  DocumentVote,
  OrganizationVote,
  User,
  TreeProposalOperation,
  TreeProposalsResponse,
  TreeProposalResponse
} from "../types";

// API Response Types
export interface DocumentsResponse {
  documents: Document[];
}

export interface DocumentResponse {
  document: Document;
}

export interface ParagraphResponse {
  paragraph: Paragraph;
}

export interface ProposalResponse {
  proposal: Proposal;
}

export interface VoteResponse {
  vote: Vote;
  message?: string;
}

export interface CommentResponse {
  comment: Comment;
  message?: string;
}

export interface OrganizationsResponse {
  organizations: Organization[];
}

export interface OrganizationResponse {
  organization: Organization;
}

export interface GovernanceRulesResponse {
  governanceRules: OrganizationGovernanceRules;
}

export interface ElectionsResponse {
  elections: RepresentativeElection[];
}

export interface VotingStatusResponse {
  document: Document & {
    organizationName?: string;
    acceptanceThreshold?: number;
    voteChangeAllowed?: boolean;
    votingAnonymous?: boolean;
  };
  voting: {
    totalVotes: number;
    totalEligibleVoters: number;
    quorumRequired: number;
    quorumMet: boolean;
    voteBreakdown: {
      PRO: number;
      NEUTRAL: number;
      CONTRA: number;
    };
    approvalRate: number;
    canVote: boolean;
    userVote?: 'PRO' | 'NEUTRAL' | 'CONTRA';
  };
}

export interface DocumentVotesResponse {
  votes: DocumentVote[];
}

export interface StatusHistoryResponse {
  history: Array<{
    status: string;
    changedAt: string;
    changedBy: {
      id: string;
      name: string;
    };
  }>;
}

export interface DeletionStatusResponse {
  deletionProposed: boolean;
  deletionProposedAt?: string;
  deletionProposedBy?: string;
  deletionVoteDeadline?: string;
  deletionVotes?: {
    PRO: number;
    NEUTRAL: number;
    CONTRA: number;
  };
}

export interface StructureProposalsResponse {
  structureProposals: StructureProposal[];
}

export interface StructureProposalResponse {
  structureProposal: StructureProposal;
}

export interface StructureVersionsResponse {
  versions: StructureVersion[];
}

export interface StructureVersionResponse {
  version: StructureVersionDetail;
}

export interface RestoreVersionResponse {
  message: string;
  backupVersionId: string;
  restoredVersionId: string;
}

export interface AuthResponse {
  user: User;
  token?: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}

export interface RegisterResponse {
  user: User;
  token: string;
}

export interface CurrentUserResponse {
  user: User;
}

export interface MessageResponse {
  message: string;
}

export interface AdminDashboardResponse {
  totalUsers: number;
  totalOrganizations: number;
  activeOrganizations: number;
  [key: string]: unknown;
}

export interface AdminUsersResponse {
  users: User[];
}

export interface OrganizationVotesResponse {
  votes: OrganizationVote[];
}

export interface VotingAnalyticsResponse {
  analytics: VotingAnalytics;
}

export interface ElectionResultsResponse {
  election: RepresentativeElection;
  results: Array<{
    candidateId: string;
    votesReceived: number;
    elected: boolean;
    electedPosition?: number;
  }>;
}

export interface PolicyVotesResponse {
  policyVotes: Array<{
    id: string;
    organizationId: string;
    title: string;
    description?: string;
    documentId?: string;
    status: string;
    thresholdPercentage: number;
    deadlineAt?: string;
    anonymousVoting: boolean;
    votesYes: number;
    votesNo: number;
    votesAbstain: number;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface RuleProposalsResponse {
  ruleProposals: Array<{
    id: string;
    organizationId: string;
    title: string;
    description?: string;
    ruleField: string;
    proposedValue: unknown;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface AuditLogsResponse {
  logs: Array<{
    id: string;
    organizationId: string;
    actionType: string;
    performedByUserId: string;
    affectedUserId?: string;
    details: string;
    ipAddress: string;
    userAgent: string;
    createdAt: string;
  }>;
  total: number;
}

export interface AuditStatsResponse {
  stats: {
    totalActions: number;
    actionsByType: Record<string, number>;
    actionsByUser: Record<string, number>;
    [key: string]: unknown;
  };
}

export interface DemoUsersResponse {
  users: User[];
}

// Use import.meta.env for Vite (not process.env)
const API_BASE_URL = import.meta.env.PROD
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
    public details?: Record<string, unknown> | unknown
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
export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
  retries: number = 2
): Promise<T> {
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
  // Security: Don't log tokens, even partially
  if (import.meta.env.DEV) {
    console.log(`API Request to ${endpoint}`)
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const config: RequestInit = {
    ...options,
    headers,
    credentials: 'include',
  }

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`API Request attempt ${attempt + 1}/${retries + 1} to ${endpoint}`)

      const response = await fetch(`${API_BASE_URL}${endpoint}`, config)

      if (response.status === 204) {
        return null as T
      }

      let rawData: Record<string, unknown> = {}
      try {
        rawData = await response.json() as Record<string, unknown>
      } catch (parseError) {
        console.warn(`Failed to parse JSON response from ${endpoint}:`, parseError)
        rawData = { error: 'Invalid response format' }
      }

      if (!response.ok) {
        const errorMessage = (rawData && rawData.error)
          ? String(rawData.error)
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
      return camelCaseKeys(rawData) as T

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
  if (lastError) {
    if (lastError instanceof ApiError || lastError instanceof AuthError) {
      throw lastError
    } else {
      // Network or other error
      throw new NetworkError(`Network error: ${lastError.message}`, endpoint)
    }
  } else {
    // This should never happen, but TypeScript requires it
    throw new NetworkError('Unknown error occurred', endpoint)
  }
}

// Document API functions
export const documentsApi = {
  // Get all documents for current user
  async getDocuments(): Promise<DocumentsResponse> {
    return apiRequest<DocumentsResponse>('/api/documents')
  },

  // Get a specific document with full details
  async getDocument(id: string): Promise<DocumentResponse> {
    return apiRequest<DocumentResponse>(`/api/documents/${id}`)
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
      positionType?: 'root' | 'child' | 'above_sibling' | 'below_sibling';
      referenceDocumentId?: string;
    },
    ownershipType?: 'personal' | 'shared' | 'organizational',
    organizationId?: string
  ): Promise<DocumentResponse> {
    // Extract parentId, positionType, and referenceDocumentId from options
    const { parentId, positionType, referenceDocumentId, ...optionsWithoutPosition } = options || {};
    
    // Build options object with position info if provided
    const finalOptions = { ...optionsWithoutPosition };
    if (positionType) {
      finalOptions.positionType = positionType;
    }
    if (referenceDocumentId) {
      finalOptions.referenceDocumentId = referenceDocumentId;
    }
    
    // Build request body, only including fields that have values
    const requestBody: Record<string, unknown> = {
      title,
      description: description || undefined,
      options: Object.keys(finalOptions).length > 0 ? finalOptions : undefined,
      ownershipType: ownershipType || 'personal',
      organizationId: organizationId || undefined,
      parentId: parentId || undefined,
    };
    
    // For shared documents, send contributors as creatorIds (backend will add current user)
    if (ownershipType === 'shared' && contributors) {
      requestBody.creatorIds = contributors;
    }
    
    // Remove undefined values
    Object.keys(requestBody).forEach(key => {
      if (requestBody[key] === undefined) {
        delete requestBody[key];
      }
    });
    
    return apiRequest<DocumentResponse>('/api/documents', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    })
  },

  // Update document title
  async updateDocument(id: string, title: string): Promise<DocumentResponse> {
    return apiRequest<DocumentResponse>(`/api/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ title }),
    })
  },

  // Delete a document
  async deleteDocument(id: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/documents/${id}`, {
      method: 'DELETE',
    })
  },

  // Add collaborator to document
  async addCollaborator(documentId: string, userId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/documents/${documentId}/collaborators`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    })
  },

  // Remove collaborator from document
  async removeCollaborator(documentId: string, userId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/documents/${documentId}/collaborators/${userId}`, {
      method: 'DELETE',
    })
  },

  // Vote on a document (document-level voting)
  async voteOnDocument(documentId: string, vote: 'PRO' | 'NEUTRAL' | 'CONTRA'): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/documents/${documentId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote }),
    })
  },

  // Get document votes
  async getDocumentVotes(documentId: string): Promise<DocumentVotesResponse> {
    return apiRequest<DocumentVotesResponse>(`/api/documents/${documentId}/votes`)
  },

  // Get voting status for organizational documents
  async getVotingStatus(documentId: string): Promise<VotingStatusResponse> {
    return apiRequest<VotingStatusResponse>(`/api/documents/${documentId}/voting-status`)
  },

  // Get document status history
  async getStatusHistory(documentId: string): Promise<StatusHistoryResponse> {
    return apiRequest<StatusHistoryResponse>(`/api/documents/${documentId}/status-history`)
  },

  // Start voting period (admin/owner only)
  async startVoting(documentId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/documents/${documentId}/start-voting`, {
      method: 'POST'
    })
  },

  // Finalize voting period (admin/owner only)
  async finalizeVoting(documentId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/documents/${documentId}/finalize-voting`, {
      method: 'POST'
    })
  },

  // Document deletion workflow
  async proposeDeletion(documentId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/documents/${documentId}/propose-deletion`, {
      method: 'POST'
    })
  },

  async voteDeletion(documentId: string, vote: 'PRO' | 'NEUTRAL' | 'CONTRA'): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/documents/${documentId}/vote-deletion`, {
      method: 'POST',
      body: JSON.stringify({ vote })
    })
  },

  async cancelDeletion(documentId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/documents/${documentId}/cancel-deletion`, {
      method: 'POST'
    })
  },

  async getDeletionStatus(documentId: string): Promise<DeletionStatusResponse> {
    return apiRequest<DeletionStatusResponse>(`/api/documents/${documentId}/deletion-status`)
  },
}

// Document Tree Proposals API functions
export const documentTreeProposalsApi = {
  // Get all tree proposals for a document
  async getProposals(documentId: string): Promise<TreeProposalsResponse> {
    return apiRequest<TreeProposalsResponse>(`/api/documents/tree-proposals/${documentId}`)
  },

  // Create a tree proposal
  async createProposal(operation: TreeProposalOperation): Promise<TreeProposalResponse> {
    return apiRequest<TreeProposalResponse>('/api/documents/tree-proposals', {
      method: 'POST',
      body: JSON.stringify(operation),
    })
  },

  // Vote on a tree proposal
  async voteOnProposal(proposalId: string, vote: 'PRO' | 'NEUTRAL' | 'CONTRA'): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/documents/tree-proposals/${proposalId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote }),
    })
  },

  // Apply an approved proposal
  async applyProposal(proposalId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/documents/tree-proposals/${proposalId}/apply`, {
      method: 'POST',
    })
  },

  // Cancel/delete a proposal
  async cancelProposal(proposalId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/documents/tree-proposals/${proposalId}`, {
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
  ): Promise<ParagraphResponse> {
    console.log(`Creating paragraph in document ${documentId}:`, data)
    return apiRequest<ParagraphResponse>(`/api/documents/${documentId}/paragraphs`, {
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
  ): Promise<ParagraphResponse> {
    return apiRequest<ParagraphResponse>(`/api/documents/${documentId}/paragraphs/${paragraphId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  // Delete a paragraph
  async deleteParagraph(documentId: string, paragraphId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/documents/${documentId}/paragraphs/${paragraphId}`, {
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
  ): Promise<ProposalResponse> {
    return apiRequest<ProposalResponse>(`/api/documents/${documentId}/paragraphs/${paragraphId}/proposals`, {
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
  ): Promise<VoteResponse> {
    return apiRequest<VoteResponse>(`/api/documents/${documentId}/paragraphs/${paragraphId}/proposals/${proposalId}/vote`, {
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
  ): Promise<CommentResponse> {
    return apiRequest<CommentResponse>(`/api/documents/${documentId}/paragraphs/${paragraphId}/proposals/${proposalId}/comments`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
}

// Helper function to make unauthenticated requests (for login/register)
async function unapiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
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
    return null as T
  }

  const rawData = await response.json().catch(() => ({})) as Record<string, unknown>

  if (!response.ok) {
    const errorMessage = (rawData && rawData.error) ? String(rawData.error) : `API request failed: ${response.status} ${response.statusText}`
    throw new Error(errorMessage)
  }

  return camelCaseKeys(rawData) as T
}

// Structure History API functions
export const structureHistoryApi = {
  // Get document structure versions
  async getStructureVersions(documentId: string): Promise<StructureVersionsResponse> {
    return apiRequest<StructureVersionsResponse>(`/api/documents/${documentId}/structure-history`)
  },

  // Get detailed change log for a version
  async getStructureVersion(documentId: string, versionId: string): Promise<StructureVersionResponse> {
    return apiRequest<StructureVersionResponse>(`/api/documents/${documentId}/structure-history/${versionId}`)
  },

  // Restore document to a previous version
  async restoreStructureVersion(documentId: string, versionId: string): Promise<RestoreVersionResponse> {
    return apiRequest<RestoreVersionResponse>(`/api/documents/${documentId}/structure-history/${versionId}/restore`, {
      method: 'POST'
    })
  }
}

// Structure Proposals API functions
export const structureProposalsApi = {
  // Get all structure proposals for a document
  async getStructureProposals(documentId: string): Promise<StructureProposalsResponse> {
    console.log('API: getStructureProposals called for document:', documentId);
    try {
      const result = await apiRequest<StructureProposalsResponse>(`/api/documents/${documentId}/structure-proposals`);
      console.log('API: getStructureProposals success:', result);
      return result;
    } catch (error) {
      console.error('API: getStructureProposals failed:', error);
      throw error;
    }
  },

  // Get a specific structure proposal
  async getStructureProposal(documentId: string, proposalId: string): Promise<StructureProposalResponse> {
    return apiRequest<StructureProposalResponse>(`/api/documents/${documentId}/structure-proposals/${proposalId}`)
  },

  // Create a new structure proposal
  async createStructureProposal(
    documentId: string,
    title: string,
    description: string | undefined,
    operations: StructureOperation[]
  ): Promise<StructureProposalResponse> {
    return apiRequest<StructureProposalResponse>(`/api/documents/${documentId}/structure-proposals`, {
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
  ): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/documents/${documentId}/structure-proposals/${proposalId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote }),
    })
  },

  // Delete/cancel a structure proposal
  async deleteStructureProposal(documentId: string, proposalId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/documents/${documentId}/structure-proposals/${proposalId}`, {
      method: 'DELETE'
    })
  },

  // Apply an approved structure proposal
  async applyStructureProposal(
    documentId: string,
    proposalId: string
  ): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/documents/${documentId}/structure-proposals/${proposalId}/apply`, {
      method: 'POST',
    })
  },

  // Add comment to structure proposal
  async addCommentToStructureProposal(
    documentId: string,
    proposalId: string,
    text: string,
    parentId?: string
  ): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/documents/${documentId}/structure-proposals/${proposalId}/comments`, {
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
    _votingEnabled?: boolean,
    votingThreshold?: number
  ): Promise<OrganizationResponse> {
    return organizationsApi.createOrganizationAdmin(name, representatives || [], {
      description,
      membershipPolicy: membershipPolicy || 'invitation',
      votingThreshold: votingThreshold || 0.75
    })
  },

  // Get user's organizations
  async getOrganizations(): Promise<OrganizationsResponse> {
    return apiRequest<OrganizationsResponse>('/api/organizations')
  },

  // Get organization details
  async getOrganization(organizationId: string): Promise<OrganizationResponse> {
    return apiRequest<OrganizationResponse>(`/api/organizations/${organizationId}`)
  },

  // Get organization documents
  async getOrganizationDocuments(organizationId: string): Promise<DocumentsResponse> {
    return apiRequest<DocumentsResponse>(`/api/documents/organization/${organizationId}`)
  },


  // Admin API functions
  async getAdminDashboard(): Promise<AdminDashboardResponse> {
    return apiRequest<AdminDashboardResponse>('/api/admin/dashboard')
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
  ): Promise<OrganizationResponse> {
    return apiRequest<OrganizationResponse>('/api/admin/organizations', {
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

  async getAllOrganizationsAdmin(): Promise<OrganizationsResponse> {
    return apiRequest<OrganizationsResponse>('/api/admin/organizations')
  },

  async updateOrganizationStatus(id: string, isActive: boolean): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/admin/organizations/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    })
  },

  async getAllUsersAdmin(): Promise<AdminUsersResponse> {
    return apiRequest<AdminUsersResponse>('/api/admin/users')
  },

  async promoteUserToAdmin(userId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/admin/promote-admin/${userId}`, {
      method: 'POST',
    })
  },

  // Update organization
  async updateOrganization(organizationId: string, updates: { 
    name?: string, 
    description?: string, 
    membershipPolicy?: 'open' | 'invitation', 
    votingThreshold?: number,
    brandingColor?: string,
    brandingLogoUrl?: string,
    brandingTitle?: string
  }): Promise<OrganizationResponse> {
    return apiRequest<OrganizationResponse>(`/api/organizations/${organizationId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
  },

  // Nominate new representative
  async nominateRepresentative(organizationId: string, newRepresentativeId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/organizations/${organizationId}/representatives`, {
      method: 'POST',
      body: JSON.stringify({ newRepresentativeId }),
    })
  },

  // Remove representative
  async removeRepresentative(organizationId: string, repId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/organizations/${organizationId}/representatives/${repId}`, {
      method: 'DELETE',
    })
  },

  // Invite members
  async inviteMembers(organizationId: string, emails: string[]): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/organizations/${organizationId}/members/invite`, {
      method: 'POST',
      body: JSON.stringify({ emails }),
    })
  },

  // Add member
  async addMember(organizationId: string, userId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/organizations/${organizationId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    })
  },

  // Remove member
  async removeMember(organizationId: string, userId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/organizations/${organizationId}/members/${userId}`, {
      method: 'DELETE',
    })
  },

  // Get organization votes
  async getOrganizationVotes(organizationId: string): Promise<OrganizationVotesResponse> {
    return apiRequest<OrganizationVotesResponse>(`/api/organizations/${organizationId}/votes`)
  },

  // Create organization vote
  async createOrganizationVote(organizationId: string, title: string, description?: string, voteType?: string, targetDocumentId?: string, votingStartDate?: string, votingEndDate?: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/organizations/${organizationId}/votes`, {
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
  async approveVote(organizationId: string, voteId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/organizations/${organizationId}/votes/${voteId}/approve`, {
      method: 'POST',
    })
  },

  // Cast vote in organization vote
  async castVote(organizationId: string, voteId: string, choice: 'yes' | 'no' | 'abstain'): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/organizations/${organizationId}/votes/${voteId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ choice }),
    })
  },
}

// Governance API functions for democratic organization features
export const governanceApi = {
  // Governance Rules
  async getGovernanceRules(organizationId: string): Promise<GovernanceRulesResponse> {
    return apiRequest<GovernanceRulesResponse>(`/api/governance/${organizationId}/governance-rules`)
  },

  // Permissions
  async getPermissions(organizationId: string): Promise<{
    success: boolean;
    permissions: {
      canProposeRules: boolean;
      canCreateDocuments: boolean;
      canInitializeElections: boolean;
      canInviteMembers: boolean;
      canManageRuleProposals: boolean;
      canVoteInElections: boolean;
      canViewAnalytics: boolean;
      canExportData: boolean;
      canManageOrganization: boolean;
    };
    context: {
      isRepresentative: boolean;
      isActiveMember: boolean;
      isAdmin: boolean;
      bootstrapMode: boolean;
      recoveryMode: boolean;
    };
  }> {
    return apiRequest(`/api/governance/${organizationId}/permissions`)
  },

  // Bootstrap Status
  async getBootstrapStatus(organizationId: string): Promise<{
    success: boolean;
    bootstrap: {
      mode: boolean;
      completedAt: string | null;
      progress: {
        completed: number;
        total: number;
        checklist: Array<{
          rule: string;
          completed: boolean;
          proposalId?: string;
        }>;
      };
      canComplete: boolean;
      daysRemaining: number | null;
    };
  }> {
    return apiRequest(`/api/governance/${organizationId}/bootstrap-status`)
  },

  // Complete Bootstrap
  async completeBootstrap(organizationId: string, confirm: boolean): Promise<{
    success: boolean;
    message: string;
    bootstrap: {
      mode: boolean;
      completedAt: string;
    };
  }> {
    return apiRequest(`/api/governance/${organizationId}/bootstrap/complete`, {
      method: 'POST',
      body: JSON.stringify({ confirm }),
    })
  },

  // Validate Rule Change
  async validateRuleChange(organizationId: string, ruleField: string, proposedValue: unknown): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    conflicts: Array<{
      type: 'dependency' | 'deadlock' | 'cooldown' | 'duplicate';
      message: string;
      details?: unknown;
    }>;
  }> {
    return apiRequest(`/api/governance/${organizationId}/validate-rule-change`, {
      method: 'POST',
      body: JSON.stringify({ ruleField, proposedValue }),
    })
  },

  // Rule History
  async getRuleHistory(organizationId: string, options?: {
    ruleField?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    success: boolean;
    history: Array<{
      id: string;
      ruleField: string;
      oldValue: unknown;
      newValue: unknown;
      changedBy: {
        userId: string;
        userName: string;
        proposalId?: string;
      };
      changedAt: string;
    }>;
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  }> {
    const params = new URLSearchParams();
    if (options?.ruleField) params.append('ruleField', options.ruleField);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    const query = params.toString();
    return apiRequest(`/api/governance/${organizationId}/rule-history${query ? `?${query}` : ''}`)
  },

  async updateGovernanceRules(organizationId: string, updates: Partial<OrganizationGovernanceRules>): Promise<GovernanceRulesResponse> {
    return apiRequest<GovernanceRulesResponse>(`/api/governance/${organizationId}/governance-rules`, {
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
  }): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/governance/${organizationId}/elections`, {
      method: 'POST',
      body: JSON.stringify(electionData),
    })
  },

  async getElections(organizationId: string): Promise<ElectionsResponse> {
    return apiRequest<ElectionsResponse>(`/api/governance/${organizationId}/elections`)
  },

  async startElection(organizationId: string, electionId: string, votingData: {
    votingStartDate?: string;
    votingEndDate: string;
  }): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/governance/${organizationId}/elections/${electionId}/start`, {
      method: 'POST',
      body: JSON.stringify(votingData),
    })
  },

  async nominateCandidate(organizationId: string, electionId: string, nominationData: {
    candidateUserId: string;
    nominationStatement?: string;
  }): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/governance/${organizationId}/elections/${electionId}/candidates`, {
      method: 'POST',
      body: JSON.stringify(nominationData),
    })
  },

  async acceptNomination(organizationId: string, electionId: string, candidateId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/governance/${organizationId}/elections/${electionId}/candidates/${candidateId}/accept`, {
      method: 'POST',
    })
  },

  async castElectionVote(organizationId: string, electionId: string, voteData: {
    candidateRanking: string[]; // Array of candidate IDs in order of preference
  }): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/governance/${organizationId}/elections/${electionId}/vote`, {
      method: 'POST',
      body: JSON.stringify(voteData),
    })
  },

  async updateElectionPhase(organizationId: string, electionId: string, newPhase: 'nomination' | 'voting'): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/governance/${organizationId}/elections/${electionId}/update-phase`, {
      method: 'POST',
      body: JSON.stringify({ newPhase }),
    })
  },

  async completeElection(organizationId: string, electionId: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>(`/api/governance/${organizationId}/elections/${electionId}/complete`, {
      method: 'POST',
    })
  },

      // Analytics
      async getVotingAnalytics(organizationId: string, period?: 'month' | 'quarter' | 'year'): Promise<VotingAnalyticsResponse> {
        const query = period ? `?period=${period}` : '';
        return apiRequest<VotingAnalyticsResponse>(`/api/governance/${organizationId}/analytics${query}`)
      },

      // Election Results
      async getElectionResults(organizationId: string, electionId: string): Promise<ElectionResultsResponse> {
        return apiRequest<ElectionResultsResponse>(`/api/governance/${organizationId}/elections/${electionId}/results`)
      },

      // Policy Votes API
      policyVotesApi: {
        async getPolicyVotes(organizationId: string): Promise<PolicyVotesResponse> {
          return apiRequest<PolicyVotesResponse>(`/api/governance/${organizationId}/policy-votes`)
        },

        async createPolicyVote(organizationId: string, voteData: {
          title: string;
          description?: string;
          documentId?: string;
          threshold?: number;
          deadlineHours?: number;
        }): Promise<MessageResponse> {
          return apiRequest<MessageResponse>(`/api/governance/${organizationId}/policy-votes`, {
            method: 'POST',
            body: JSON.stringify(voteData),
          })
        },

        async voteOnPolicy(organizationId: string, voteId: string, voteChoice: 'yes' | 'no' | 'abstain'): Promise<MessageResponse> {
          return apiRequest<MessageResponse>(`/api/governance/${organizationId}/policy-votes/${voteId}/vote`, {
            method: 'POST',
            body: JSON.stringify({ vote: voteChoice }),
          })
        },
      },

      // Rule Proposals API
      ruleProposalsApi: {
        async getRuleProposals(organizationId: string): Promise<RuleProposalsResponse> {
          return apiRequest<RuleProposalsResponse>(`/api/governance/${organizationId}/rule-proposals`)
        },

        async createRuleProposal(organizationId: string, proposalData: {
          title: string;
          description?: string;
          ruleField: string;
          proposedValue: unknown;
          options?: Array<{
            optionTitle: string;
            optionDescription?: string;
            proposedValue: unknown;
          }>;
        }): Promise<MessageResponse> {
          return apiRequest<MessageResponse>(`/api/governance/${organizationId}/rule-proposals`, {
            method: 'POST',
            body: JSON.stringify(proposalData),
          })
        },

        async startRuleProposalVoting(organizationId: string, proposalId: string): Promise<MessageResponse> {
          return apiRequest<MessageResponse>(`/api/governance/${organizationId}/rule-proposals/${proposalId}/start-voting`, {
            method: 'POST',
          })
        },

        async voteOnRuleProposal(organizationId: string, proposalId: string, voteData: {
          selectedOptionId?: string;
          voteChoice?: 'yes' | 'no' | 'abstain';
        }): Promise<MessageResponse> {
          return apiRequest<MessageResponse>(`/api/governance/${organizationId}/rule-proposals/${proposalId}/vote`, {
            method: 'POST',
            body: JSON.stringify(voteData),
          })
        },

        async completeRuleProposal(organizationId: string, proposalId: string): Promise<MessageResponse> {
          return apiRequest<MessageResponse>(`/api/governance/${organizationId}/rule-proposals/${proposalId}/complete`, {
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
        }): Promise<AuditLogsResponse> {
          const queryParams = new URLSearchParams();
          if (filters) {
            Object.entries(filters).forEach(([key, value]) => {
              if (value !== undefined && value !== null) {
                queryParams.append(key, value.toString());
              }
            });
          }
          const query = queryParams.toString();
          return apiRequest<AuditLogsResponse>(`/api/governance/${organizationId}/audit-logs${query ? `?${query}` : ''}`)
        },

        async getAuditStats(organizationId: string, days?: number): Promise<AuditStatsResponse> {
          const query = days ? `?days=${days}` : '';
          return apiRequest<AuditStatsResponse>(`/api/governance/${organizationId}/audit-stats${query}`)
        },

        async exportAuditLogs(organizationId: string, filters?: {
          startDate?: string;
          endDate?: string;
          format?: 'csv' | 'json';
        }): Promise<unknown> {
          const queryParams = new URLSearchParams();
          if (filters) {
            Object.entries(filters).forEach(([key, value]) => {
              if (value !== undefined && value !== null) {
                queryParams.append(key, value.toString());
              }
            });
          }
          const query = queryParams.toString();
          return apiRequest<unknown>(`/api/governance/${organizationId}/audit-export${query ? `?${query}` : ''}`)
        },

        async getPublicAuditLogs(organizationId: string, filters?: {
          actionType?: string;
          startDate?: string;
          endDate?: string;
          limit?: number;
          offset?: number;
        }): Promise<AuditLogsResponse> {
          const queryParams = new URLSearchParams();
          if (filters) {
            Object.entries(filters).forEach(([key, value]) => {
              if (value !== undefined && value !== null) {
                queryParams.append(key, value.toString());
              }
            });
          }
          const query = queryParams.toString();
          return apiRequest<AuditLogsResponse>(`/api/governance/${organizationId}/public-audit-logs${query ? `?${query}` : ''}`)
        },
    }
  }

// Auth API functions
export const authApi = {
  // Login
  async login(email: string, password: string): Promise<LoginResponse> {
    return unapiRequest<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  },

  // Register
  async register(name: string, email: string, password: string): Promise<RegisterResponse> {
    return unapiRequest<RegisterResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    })
  },

  // Get current user
  async getCurrentUser(): Promise<CurrentUserResponse> {
    return apiRequest<CurrentUserResponse>('/api/auth/me')
  },

  // Logout
  async logout(): Promise<MessageResponse> {
    return apiRequest<MessageResponse>('/api/auth/logout', {
      method: 'POST',
    })
  },

  // Get demo users (for development)
  async getDemoUsers(): Promise<DemoUsersResponse> {
    return apiRequest<DemoUsersResponse>('/api/auth/demo-users')
  },
}

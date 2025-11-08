import { Proposal, Suggestion, Vote, Comment, VersionHistory } from '../types';

/**
 * Activity Feed proposal structure from API
 */
export interface ActivityFeedProposal {
  id: string;
  paragraphId: string;
  documentId: string;
  documentTitle: string;
  paragraphTitle?: string;
  proposedText: string;
  currentText: string;
  type: 'BODY' | 'TITLE';
  headingLevel?: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  votes?: {
    total: number;
    pro: number;
    contra: number;
    neutral: number;
  };
  comments?: Comment[];
  totalUsers?: number;
  approved?: boolean;
  approvalPercentage?: number;
  history?: VersionHistory[];
}

/**
 * Document context for Activity Feed proposals
 */
export interface DocumentContext {
  documentId: string;
  documentTitle: string;
  paragraphId: string;
  paragraphTitle?: string;
}

/**
 * Transforms Activity Feed proposal to SuggestionCard-compatible format
 */
export function adaptProposalToSuggestion(
  proposal: ActivityFeedProposal,
  allVotes?: Vote[]
): Suggestion {
  // Transform votes array if we have individual votes
  let votes: Vote[] = allVotes || [];
  
  // If we only have vote counts, we need to fetch or create placeholder votes
  // For now, we'll create minimal vote objects from counts for display
  // Note: This is a limitation - ideally the API should return full vote objects
  if (proposal.votes && votes.length === 0 && proposal.votes.total > 0) {
    // Create placeholder votes for display purposes
    // These won't have real userIds, but will allow SuggestionCard to display correctly
    votes = [];
    let voteId = 1;
    
    // Add PRO votes
    for (let i = 0; i < proposal.votes.pro; i++) {
      votes.push({
        id: `placeholder-pro-${voteId++}`,
        proposalId: proposal.id,
        userId: `placeholder-user-${voteId}`,
        vote: 'PRO',
        createdAt: proposal.createdAt,
        user: { id: `placeholder-user-${voteId}`, name: 'User' },
      });
    }
    
    // Add NEUTRAL votes
    for (let i = 0; i < proposal.votes.neutral; i++) {
      votes.push({
        id: `placeholder-neutral-${voteId++}`,
        proposalId: proposal.id,
        userId: `placeholder-user-${voteId}`,
        vote: 'NEUTRAL',
        createdAt: proposal.createdAt,
        user: { id: `placeholder-user-${voteId}`, name: 'User' },
      });
    }
    
    // Add CONTRA votes
    for (let i = 0; i < proposal.votes.contra; i++) {
      votes.push({
        id: `placeholder-contra-${voteId++}`,
        proposalId: proposal.id,
        userId: `placeholder-user-${voteId}`,
        vote: 'CONTRA',
        createdAt: proposal.createdAt,
        user: { id: `placeholder-user-${voteId}`, name: 'User' },
      });
    }
  }

  return {
    id: proposal.id,
    paragraphId: proposal.paragraphId,
    userId: proposal.user.id,
    text: proposal.proposedText,
    type: proposal.type,
    headingLevel: proposal.headingLevel as any,
    approved: proposal.approved || false,
    createdAt: proposal.createdAt,
    updatedAt: proposal.createdAt,
    user: {
      id: proposal.user.id,
      name: proposal.user.name,
      email: proposal.user.email,
    },
    votes: votes,
    comments: proposal.comments || [],
  };
}

/**
 * Extracts document context from Activity Feed proposal
 */
export function extractDocumentContext(proposal: ActivityFeedProposal): DocumentContext {
  return {
    documentId: proposal.documentId,
    documentTitle: proposal.documentTitle,
    paragraphId: proposal.paragraphId,
    paragraphTitle: proposal.paragraphTitle,
  };
}

/**
 * Gets the original text for diff comparison
 */
export function getOriginalText(proposal: ActivityFeedProposal): string {
  return proposal.currentText || '';
}

/**
 * Agreed Version structure from API (from history table)
 */
export interface AgreedVersion {
  id: string;
  documentId: string;
  documentTitle: string;
  paragraphId: string;
  paragraphTitle?: string;
  acceptedText: string;
  previousText: string;
  approvalPercentage: number;
  acceptedAt: string;
  userName: string;
  userId: string;
  userAvatar?: string;
  totalVotes?: number;
  proVotes?: number;
  proposalId?: string;
}

/**
 * Transforms Agreed Version to SuggestionCard-compatible format
 * Note: This creates a synthetic proposal from history data
 */
export function adaptAgreedVersionToSuggestion(version: AgreedVersion): Suggestion {
  // Create synthetic votes from vote counts
  const votes: Vote[] = [];
  let voteId = 1;
  
  if (version.proVotes) {
    for (let i = 0; i < version.proVotes; i++) {
      votes.push({
        id: `agreed-pro-${voteId++}`,
        proposalId: version.proposalId || version.id,
        userId: `agreed-user-${voteId}`,
        vote: 'PRO',
        createdAt: version.acceptedAt,
        user: { id: `agreed-user-${voteId}`, name: 'User' },
      });
    }
  }

  return {
    id: version.proposalId || version.id,
    paragraphId: version.paragraphId,
    userId: version.userId,
    text: version.acceptedText,
    type: 'BODY', // Default, could be determined from paragraph
    approved: true,
    createdAt: version.acceptedAt,
    updatedAt: version.acceptedAt,
    user: {
      id: version.userId,
      name: version.userName,
      email: '',
    },
    votes: votes,
    comments: [], // Comments would need to be fetched separately
  };
}

/**
 * Extracts document context from Agreed Version
 */
export function extractDocumentContextFromVersion(version: AgreedVersion): DocumentContext {
  return {
    documentId: version.documentId,
    documentTitle: version.documentTitle,
    paragraphId: version.paragraphId,
    paragraphTitle: version.paragraphTitle,
  };
}


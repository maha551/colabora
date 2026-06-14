import { Suggestion, Vote, Comment, VersionHistory, HeadingLevel, StructureProposal, StructureProposalVote, RuleProposal, User } from '../types';

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
  votes?: Vote[] | {
    total: number;
    pro: number;
    contra: number;
    neutral: number;
  };
  userVote?: 'PRO' | 'NEUTRAL' | 'CONTRA';
  partialVoteCounts?: {
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
  otherProposals?: ActivityFeedProposal[]; // Other proposals for the same paragraph
  agreedVersion?: { // Agreed version if available for this paragraph
    text: string;
    previousText?: string;
    proposalId?: string;
    acceptedAt?: string;
    type?: 'BODY' | 'TITLE';
  };
  // Optional properties for debated proposals
  debateScore?: number;
  engagement?: {
    proPercentage?: number;
    contraPercentage?: number;
    neutralPercentage?: number;
  };
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
  // Check if proposal has actual vote objects (array) or vote counts (object)
  let votes: Vote[] = allVotes || [];
  
  // Check if proposal.votes is an array (actual vote objects from API)
  if (Array.isArray(proposal.votes)) {
    // Use the actual vote objects from the API
    votes = proposal.votes as Vote[];
  } 
  // Check if proposal.votes is an object with counts (old format)
  else if (proposal.votes && typeof proposal.votes === 'object' && 'total' in proposal.votes && votes.length === 0) {
    // Only create placeholder votes if we have counts but no actual vote objects
    // This is a fallback for backwards compatibility
    const voteCounts = proposal.votes as { total: number; pro: number; contra: number; neutral: number };
    if (voteCounts.total > 0) {
      votes = [];
      let voteId = 1;
      
      // Add PRO votes
      for (let i = 0; i < voteCounts.pro; i++) {
        votes.push({
          id: `placeholder-pro-${voteId++}`,
          proposalId: proposal.id,
          userId: `placeholder-user-${voteId}`,
          vote: 'PRO',
          createdAt: proposal.createdAt,
          user: { id: `placeholder-user-${voteId}`, name: 'User' },
          isPlaceholder: true,
        });
      }
      
      // Add NEUTRAL votes
      for (let i = 0; i < voteCounts.neutral; i++) {
        votes.push({
          id: `placeholder-neutral-${voteId++}`,
          proposalId: proposal.id,
          userId: `placeholder-user-${voteId}`,
          vote: 'NEUTRAL',
          createdAt: proposal.createdAt,
          user: { id: `placeholder-user-${voteId}`, name: 'User' },
          isPlaceholder: true,
        });
      }
      
      // Add CONTRA votes
      for (let i = 0; i < voteCounts.contra; i++) {
        votes.push({
          id: `placeholder-contra-${voteId++}`,
          proposalId: proposal.id,
          userId: `placeholder-user-${voteId}`,
          vote: 'CONTRA',
          createdAt: proposal.createdAt,
          user: { id: `placeholder-user-${voteId}`, name: 'User' },
          isPlaceholder: true,
        });
      }
    }
  }

  return {
    id: proposal.id,
    paragraphId: proposal.paragraphId,
    userId: proposal.user.id,
    text: proposal.proposedText,
    type: proposal.type,
    headingLevel: (proposal.headingLevel as HeadingLevel) || undefined,
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
 * Extracts document context from an Activity Feed proposal or Agreed Version.
 * Both types share the same document/paragraph identity fields.
 */
export function extractDocumentContext(
  source: ActivityFeedProposal | AgreedVersion
): DocumentContext {
  return {
    documentId: source.documentId,
    documentTitle: source.documentTitle,
    paragraphId: source.paragraphId,
    paragraphTitle: source.paragraphTitle,
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
  votes?: Vote[]; // Actual votes with user information
  otherProposals?: ActivityFeedProposal[]; // Other proposals for the same paragraph
  type?: 'BODY' | 'TITLE'; // Proposal type for comparison logic
}

/**
 * Transforms Agreed Version to SuggestionCard-compatible format
 * Note: This creates a synthetic proposal from history data
 */
export function adaptAgreedVersionToSuggestion(version: AgreedVersion): Suggestion {
  // Use actual votes from API if available, otherwise create synthetic votes from vote counts
  let votes: Vote[] = [];
  
  if (version.votes && Array.isArray(version.votes) && version.votes.length > 0) {
    // Use actual votes from the API (with real user IDs)
    votes = version.votes;
  } else if (version.proVotes) {
    // Fallback: Create synthetic votes from vote counts (for backwards compatibility)
    // This should only happen if the API doesn't return votes
    let voteId = 1;
    for (let i = 0; i < version.proVotes; i++) {
      votes.push({
        id: `agreed-pro-${voteId++}`,
        proposalId: version.proposalId || version.id,
        userId: `agreed-user-${voteId}`,
        vote: 'PRO',
        createdAt: version.acceptedAt,
        user: { id: `agreed-user-${voteId}`, name: 'User' },
        isPlaceholder: true,
      });
    }
  }

  // Require proposalId - it should always be present per database schema
  if (!version.proposalId) {
    console.warn('Agreed version missing proposalId, using history ID as fallback', { 
      versionId: version.id, 
      paragraphId: version.paragraphId 
    });
  }

  return {
    id: version.proposalId || version.id,
    paragraphId: version.paragraphId,
    userId: version.userId,
    text: version.acceptedText,
    type: version.type || 'BODY', // Use type from API if available
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
    ...(version.proposalId ? {} : { isHistoryFallback: true }),
  };
}

/**
 * Gets the comparison target for a proposal (agreed version or highest-voted other)
 * Priority: 1) Agreed version, 2) Highest-voted other proposal, 3) Second-highest if current is highest, 4) Original text
 */
export function getComparisonTarget(
  currentProposal: Suggestion,
  agreedVersion: { text: string; type?: 'BODY' | 'TITLE' } | null | undefined,
  otherProposals: Suggestion[],
  originalText: string
): { text: string; label: string; source: 'agreed' | 'other' | 'original' } {
  // Filter by same type
  const sameTypeProposals = otherProposals.filter(p => 
    p.type === currentProposal.type && p.id !== currentProposal.id
  );
  
  // Priority 1: Agreed version (if matching type)
  if (agreedVersion && (!agreedVersion.type || agreedVersion.type === currentProposal.type)) {
    return { text: agreedVersion.text, label: 'Agreed Version', source: 'agreed' };
  }
  
  // Priority 2: Highest-voted other proposal
  const sortedByVotes = [...sameTypeProposals].sort((a, b) => {
    const aProVotes = a.votes.filter(v => v.vote === 'PRO').length;
    const bProVotes = b.votes.filter(v => v.vote === 'PRO').length;
    if (aProVotes !== bProVotes) return bProVotes - aProVotes;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  
  if (sortedByVotes.length > 0) {
    // Check if current is highest
    const currentProVotes = currentProposal.votes.filter(v => v.vote === 'PRO').length;
    const topProVotes = sortedByVotes[0].votes.filter(v => v.vote === 'PRO').length;
    
    if (currentProVotes > topProVotes) {
      // Current is highest, use second-highest
      return sortedByVotes.length > 1 
        ? { text: sortedByVotes[1].text, label: sortedByVotes[1].user.name, source: 'other' }
        : { text: originalText, label: 'Original Text', source: 'original' };
    }
    
    return { text: sortedByVotes[0].text, label: sortedByVotes[0].user.name, source: 'other' };
  }
  
  // Fallback: original text
  return { text: originalText, label: 'Original Text', source: 'original' };
}

/**
 * Converts StructureProposalVote to Vote format
 */
function convertStructureVoteToVote(structureVote: StructureProposalVote, proposalId: string): Vote {
  return {
    id: structureVote.id,
    proposalId: proposalId,
    userId: structureVote.userId,
    vote: structureVote.vote, // Already PRO/NEUTRAL/CONTRA
    createdAt: structureVote.createdAt,
    user: structureVote.user || undefined,
  };
}

/**
 * Creates synthetic text from structure proposal operations
 */
function createStructureProposalText(structureProposal: StructureProposal): string {
  if (structureProposal.description) {
    return structureProposal.description;
  }
  
  const operations = structureProposal.operations || [];
  if (operations.length === 0) {
    return structureProposal.title;
  }
  
  const operationSummaries = operations.slice(0, 3).map(op => {
    switch (op.operationType) {
      case 'MOVE':
        return `Move section to position ${op.newPositionIndex}`;
      case 'MERGE':
        return `Merge ${op.sourceParagraphIds?.length || 0} sections into one`;
      case 'DELETE':
        return 'Mark section for deletion';
      case 'RENAME_HEADING':
        return `Rename heading to "${op.newText}"`;
      case 'CHANGE_HEADING_LEVEL':
        return `Change heading level to ${op.newHeadingLevel}`;
      case 'INSERT_NEW':
        return 'Insert new section';
      default:
        return op.operationType;
    }
  });
  
  const moreText = operations.length > 3 ? ` (+${operations.length - 3} more operations)` : '';
  return `${structureProposal.title}: ${operationSummaries.join('; ')}${moreText}`;
}

/**
 * Transforms Structure Proposal to SuggestionCard-compatible format
 */
export function adaptStructureProposalToSuggestion(
  structureProposal: StructureProposal,
  documentId: string,
  allCollaborators: User[]
): Suggestion {
  // Convert votes from StructureProposalVote[] to Vote[]
  const votes: Vote[] = structureProposal.votes.map(vote => 
    convertStructureVoteToVote(vote, structureProposal.id)
  );
  
  // Comments are already in Comment[] format, use directly
  // Ensure backward compatibility fields are set
  const comments: Comment[] = structureProposal.comments.map(comment => ({
    ...comment,
    // Ensure backward compatibility fields
    proposalId: comment.commentableType === 'proposal' ? comment.commentableId : undefined,
    structureProposalId: comment.commentableType === 'structure_proposal' ? comment.commentableId : structureProposal.id,
  }));
  
  // Create synthetic text from operations
  const syntheticText = createStructureProposalText(structureProposal);
  
  // Calculate totalUsers from collaborators
  const totalUsers = allCollaborators.length;
  
  return {
    id: structureProposal.id,
    paragraphId: '', // Structure proposals are document-scoped, not paragraph-scoped
    contextId: documentId,
    contextType: 'document',
    userId: structureProposal.userId,
    text: syntheticText,
    title: structureProposal.title,
    description: structureProposal.description,
    type: 'BODY', // Structure proposals are always BODY type
    headingLevel: undefined,
    approved: structureProposal.approved,
    createdAt: structureProposal.createdAt,
    updatedAt: structureProposal.updatedAt,
    user: {
      id: structureProposal.user.id,
      name: structureProposal.user.name,
      email: structureProposal.user.email,
      avatar: undefined,
    },
    votes: votes,
    comments: comments,
  };
}

/**
 * Normalize vote to PRO/NEUTRAL/CONTRA from either vote or voteChoice (yes/no/abstain).
 */
function normalizeVoteType(
  vote?: 'PRO' | 'NEUTRAL' | 'CONTRA',
  voteChoice?: 'yes' | 'no' | 'abstain'
): 'PRO' | 'NEUTRAL' | 'CONTRA' | null {
  if (vote) return vote;
  if (voteChoice === 'yes') return 'PRO';
  if (voteChoice === 'no') return 'CONTRA';
  if (voteChoice === 'abstain') return 'NEUTRAL';
  return null;
}

/**
 * Converts Rule Proposal vote to Vote format
 * Handles both vote (PRO/CONTRA/NEUTRAL) and voteChoice (yes/no/abstain) from API
 */
function convertRuleVoteToVote(
  ruleVote: { userId: string; vote?: 'PRO' | 'NEUTRAL' | 'CONTRA'; voteChoice?: 'yes' | 'no' | 'abstain'; selectedOptionId?: string },
  proposalId: string,
  createdAt: string
): Vote | null {
  const voteType =
    ruleVote.selectedOptionId
      ? 'PRO' // Multiple choice - treat as PRO vote
      : normalizeVoteType(ruleVote.vote, ruleVote.voteChoice);
  if (voteType === null) return null;

  return {
    id: `${proposalId}-${ruleVote.userId}`,
    proposalId: proposalId,
    userId: ruleVote.userId,
    vote: voteType,
    createdAt: createdAt,
    user: undefined, // Will be populated from allCollaborators if needed
  };
}

/**
 * Creates synthetic text from rule proposal
 */
function createRuleProposalText(ruleProposal: RuleProposal): string {
  if (ruleProposal.description) {
    return ruleProposal.description;
  }
  
  // Create text from rule change
  const ruleLabels: Record<string, string> = {
    representativeTermMonths: 'Representative Term Length',
    representativeTermLimits: 'Representative Term Limits',
    electionVotingMethod: 'Election Voting Method',
    electionQuorumPercentage: 'Election Quorum',
    electionNoticeDays: 'Election Notice Period',
    defaultVotingDeadlineHours: 'Default Voting Deadline',
    defaultQuorumPercentage: 'Default Quorum',
    defaultAcceptanceThreshold: 'Document Acceptance Threshold',
    documentProposalPeriodDays: 'Document Proposal Period',
    thresholdCalculationMethod: 'Threshold Calculation Method',
    anonymousVotingEnabled: 'Anonymous Voting',
    voteChangeAllowed: 'Vote Changes Allowed',
    representativeCanCreateVotes: 'Representatives Can Create Votes',
    representativeCanInviteMembers: 'Representatives Can Invite Members',
    representativeCanManageDocuments: 'Representatives Can Manage Documents',
    representativeApprovalRequired: 'Representative Approval Required',
    tamperProofEnabled: 'Tamper-Proof Records',
    auditTrailEnabled: 'Audit Trail',
  };
  
  const ruleLabel = ruleLabels[ruleProposal.ruleField] || ruleProposal.ruleField;
  return `${ruleLabel}: ${ruleProposal.title}`;
}

/**
 * Transforms Rule Proposal to SuggestionCard-compatible format
 */
export function adaptRuleProposalToSuggestion(
  ruleProposal: RuleProposal,
  organizationId: string,
  allCollaborators: User[],
  comments?: Comment[]
): Suggestion {
  // Convert votes from rule proposal format to Vote[]
  const votes: Vote[] = [];
  
  if (ruleProposal.votes && Array.isArray(ruleProposal.votes)) {
    ruleProposal.votes.forEach(ruleVote => {
      const vote = convertRuleVoteToVote(ruleVote, ruleProposal.id, ruleProposal.createdAt);
      if (vote) {
        // Try to find user info from allCollaborators
        const user = allCollaborators.find(u => u.id === ruleVote.userId);
        if (user) {
          vote.user = {
            id: user.id,
            name: user.name,
            email: user.email || '',
            avatar: user.avatar,
          };
        } else if (ruleVote.user) {
          vote.user = {
            id: ruleVote.user.id,
            name: ruleVote.user.name,
            email: ruleVote.user.email || '',
            avatar: undefined,
          };
        }
        votes.push(vote);
      }
    });
  } else {
    // Fallback: Create votes from vote counts (Yes/No/Abstain)
    // This is a fallback for backwards compatibility
    let voteId = 1;
    const yesCount = ruleProposal.votesYes || 0;
    const noCount = ruleProposal.votesNo || 0;
    const abstainCount = ruleProposal.votesAbstain || 0;
    
    for (let i = 0; i < yesCount; i++) {
      votes.push({
        id: `rule-pro-${voteId++}`,
        proposalId: ruleProposal.id,
        userId: `placeholder-user-${voteId}`,
        vote: 'PRO',
        createdAt: ruleProposal.createdAt,
        user: { id: `placeholder-user-${voteId}`, name: 'User' },
        isPlaceholder: true,
      });
    }
    
    for (let i = 0; i < noCount; i++) {
      votes.push({
        id: `rule-contra-${voteId++}`,
        proposalId: ruleProposal.id,
        userId: `placeholder-user-${voteId}`,
        vote: 'CONTRA',
        createdAt: ruleProposal.createdAt,
        user: { id: `placeholder-user-${voteId}`, name: 'User' },
        isPlaceholder: true,
      });
    }
    
    for (let i = 0; i < abstainCount; i++) {
      votes.push({
        id: `rule-neutral-${voteId++}`,
        proposalId: ruleProposal.id,
        userId: `placeholder-user-${voteId}`,
        vote: 'NEUTRAL',
        createdAt: ruleProposal.createdAt,
        user: { id: `placeholder-user-${voteId}`, name: 'User' },
        isPlaceholder: true,
      });
    }
  }
  
  // Use provided comments or empty array (rule proposal comments loaded by wrapper)
  const commentList: Comment[] = comments ?? [];

  // Create synthetic text
  const syntheticText = createRuleProposalText(ruleProposal);
  
  // Calculate totalUsers
  const totalUsers = ruleProposal.totalVoters || allCollaborators.length;
  
  return {
    id: ruleProposal.id,
    paragraphId: '', // Rule proposals are organization-scoped, not paragraph-scoped
    contextId: organizationId,
    contextType: 'organization',
    userId: ruleProposal.createdBy.id,
    text: syntheticText,
    title: ruleProposal.title,
    description: ruleProposal.description,
    type: 'BODY', // Rule proposals are always BODY type
    headingLevel: undefined,
    approved: ruleProposal.status === 'approved',
    createdAt: ruleProposal.createdAt,
    updatedAt: ruleProposal.updatedAt || ruleProposal.createdAt,
    user: {
      id: ruleProposal.createdBy.id,
      name: ruleProposal.createdBy.name,
      email: '', // Rule proposals don't have email in createdBy
      avatar: undefined,
    },
    votes: votes,
    comments: commentList,
  };
}


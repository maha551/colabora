// Backend API types
export type ElementType = "paragraph" | "heading";
export type HeadingLevel = "h1" | "h2" | "h3";

export interface User {
  id: string;
  name: string;
  email: string;
  role?: string;
}

export interface Vote {
  id: string;
  proposalId: string;
  userId: string;
  vote: 'PRO' | 'NEUTRAL' | 'CONTRA';
  createdAt: string;
  user?: {
    id: string;
    name: string;
  };
}

export interface Comment {
  id: string;
  proposalId: string;
  userId: string;
  text: string;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  parent?: {
    id: string;
    user: {
      id: string;
      name: string;
    };
  };
  replies: {
    id: string;
    user: {
      id: string;
      name: string;
    };
  }[];
}

export interface Proposal {
  id: string;
  paragraphId: string;
  userId: string;
  text: string;
  type: 'BODY' | 'TITLE';
  headingLevel?: HeadingLevel;
  approved: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  votes: Vote[];
  comments: Comment[];
}

export interface VersionHistory {
  id: string;
  paragraphId: string;
  userId: string;
  text: string;
  oldText?: string | null;
  proposalId?: string | null;
  acceptedAt: Date;
  approvalPercentage: number;
  type?: 'BODY' | 'TITLE' | string;
  headingLevel?: HeadingLevel;
  user: {
    id: string;
    name: string;
    email?: string;
  };
}

export interface Paragraph {
  id: string;
  documentId: string;
  title?: string;
  headingLevel?: HeadingLevel | null;
  text: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  proposals: Proposal[];
  history: VersionHistory[];
  suggestions?: Proposal[];
  isDocumentTitle?: boolean;
}

export interface DocumentCollaborator {
  id: string;
  documentId: string;
  userId: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export interface DocumentOptions {
  acceptanceThreshold: number;        // 1-100 (one-time choice)
  votingAnonymous: boolean;            // true = anonymous (closed), false = public (open)
  votingAnonymityLocked: boolean;     // if true, anonymity cannot be changed
  voteChangeAllowed: boolean;         // true = flexible, false = locked
}

export interface DocumentVote {
  id: string;
  userId?: string;
  vote: 'PRO' | 'NEUTRAL' | 'CONTRA';
  createdAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface Document {
  id: string;
  title: string;
  description?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  parentId?: string; // For hierarchical document structure
  sortOrder?: number; // Sort order for tree positioning (REAL type from database)
  ownershipType?: 'personal' | 'shared' | 'organizational'; // Document ownership type
  organizationId?: string; // Organization ID for organizational documents
  status?: 'proposal' | 'draft' | 'agreed' | 'voting' | 'rejected' | 'expired'; // Document status
  proposalDeadline?: string; // Deadline for proposal period (default 1 year from creation, configurable via governance)
  votingDeadline?: string; // Deadline for voting period
  paragraphProposalsCutoff?: string; // When to disable new paragraph proposals
  votingStartedAt?: string; // When voting period started
  adoptedAt?: string; // When document was adopted
  minVotersRequired?: number; // Minimum voters for quorum
  deletionProposedAt?: string; // When deletion was proposed
  deletionProposedBy?: string; // Who proposed deletion
  deletionVoteDeadline?: string; // Deadline for deletion vote
  structureProposalsEnabled?: boolean; // Whether structure proposals are enabled
  owner: {
    id: string;
    name: string;
    email: string;
  };
  collaborators: DocumentCollaborator[];
  paragraphs: Paragraph[];
  options?: DocumentOptions;
  documentVotes?: DocumentVote[]; // Document-level votes for real-time updates
}

// Document Tree Proposal Types
export type DocumentTreeOperationType = 'MOVE' | 'DELETE' | 'REORDER';

export interface DocumentTreeProposal {
  id: string;
  documentId: string;
  organizationId: string;
  proposedByUserId: string;
  operationType: DocumentTreeOperationType;
  targetParentId?: string;
  newOrder?: number;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  createdAt: string;
  updatedAt: string;
  proposedByName?: string;
  proposedByEmail?: string;
  votes: TreeProposalVote[];
  voteCounts: {
    pro: number;
    neutral: number;
    contra: number;
  };
}

export interface TreeProposalVote {
  id: string;
  userId: string;
  vote: 'PRO' | 'NEUTRAL' | 'CONTRA';
  createdAt: string;
  updatedAt: string;
  voterName?: string;
  voterEmail?: string;
}

export interface TreeProposalOperation {
  documentId: string;
  operationType: DocumentTreeOperationType;
  targetParentId?: string;
  newOrder?: number;
  reason?: string;
}

// Structure Proposal Types
export type StructureOperationType = 'MOVE' | 'MERGE' | 'SPLIT' | 'DELETE' | 'RENAME_HEADING' | 'CHANGE_HEADING_LEVEL' | 'INSERT_NEW';

// Operation-specific data types for complex operations
export interface SplitOperationData {
  splitAt: number; // Character position where to split
  newParagraphs: Array<{
    text: string;
    order: number;
    headingLevel?: HeadingLevel;
  }>;
}

export interface MergeOperationData {
  mergedText: string;
  mergedHeadingLevel?: HeadingLevel;
}

// Union type for operation data - allows for future operation types
export type OperationData = 
  | SplitOperationData 
  | MergeOperationData 
  | Record<string, unknown>; // Fallback for other operation types or custom data

export interface StructureOperation {
  id?: string;
  structureProposalId?: string;
  operationType: StructureOperationType;
  sourceParagraphIds?: string[]; // For merge operations
  targetParagraphId?: string;
  newPositionIndex?: number;
  newParentId?: string; // For nesting under headings
  newText?: string;
  newHeadingLevel?: HeadingLevel;
  operationData?: OperationData; // For complex operations like splits
  createdAt?: string;
}

export interface StructureProposalVote {
  id: string;
  structureProposalId: string;
  userId: string;
  vote: 'PRO' | 'NEUTRAL' | 'CONTRA';
  createdAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface StructureProposalComment {
  id: string;
  structureProposalId: string;
  userId: string;
  text: string;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  parent?: {
    id: string;
    user: {
      id: string;
      name: string;
    };
  };
  replies: {
    id: string;
    user: {
      id: string;
      name: string;
    };
  }[];
}

export interface StructureProposal {
  id: string;
  documentId: string;
  userId: string;
  title: string;
  description?: string;
  approved: boolean;
  applied: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  operations: StructureOperation[];
  votes: StructureProposalVote[];
  comments: StructureProposalComment[];
}

// Outline types for structure proposal creation
export interface OutlineItem {
  id: string;
  type: 'heading' | 'paragraph';
  title?: string;
  text: string;
  headingLevel?: HeadingLevel;
  orderIndex: number;
  isSelected?: boolean;
  isMergeCandidate?: boolean;
  isDeleteCandidate?: boolean;
}

// Structure History Types
export interface StructureVersion {
  id: string;
  versionNumber: number;
  name?: string;
  description?: string;
  createdBy: {
    id: string;
    name: string;
    avatar?: string;
  };
  changeType: 'structure_proposal' | 'manual' | 'initial';
  proposalTitle?: string;
  createdAt: string;
  structureSnapshot: StructureSnapshot[];
}

export interface StructureSnapshot {
  id: string;
  text: string;
  title?: string;
  orderIndex: number;
  headingLevel?: string;
  createdAt: string;
  updatedAt: string;
}

// Structure change data types
export interface ParagraphSnapshot {
  id: string;
  text: string;
  title?: string;
  order: number;
  headingLevel?: HeadingLevel | null;
  [key: string]: unknown; // Allow for additional fields
}

export interface StructureChangeMetadata {
  operationType: StructureOperationType;
  performedBy: string;
  timestamp: string;
  documentId?: string;
  proposalId?: string;
  [key: string]: unknown; // Allow for additional metadata fields
}

export interface StructureChange {
  id: string;
  operationType: StructureOperationType;
  paragraphId?: string;
  paragraphTitle?: string;
  currentText?: string;
  oldData: ParagraphSnapshot[]; // Array of paragraph snapshots before the change
  newData: ParagraphSnapshot | Record<string, unknown>; // Paragraph snapshot or data after the change
  metadata: StructureChangeMetadata; // Operation metadata
  createdAt: string;
}

export interface StructureVersionDetail extends StructureVersion {
  changes: StructureChange[];
}

// Organization Types
export interface Organization {
  id: string;
  name: string;
  description?: string;
  representatives: string[];
  membershipPolicy: 'open' | 'invitation';
  votingEnabled: boolean;
  votingThreshold: number;
  isActive: boolean;
  createdAt: string;
  members?: OrganizationMember[];
  brandingColor?: string;
  brandingLogoUrl?: string;
  brandingTitle?: string;
}

export interface OrganizationMember {
  id: string;
  userId: string;
  status: 'active' | 'legacy' | 'suspended';
  joinedAt: string;
  leftAt?: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
}

export interface OrganizationVote {
  id: string;
  organizationId: string;
  title: string;
  description?: string;
  voteType: 'policy' | 'document_change' | 'membership' | 'dissolution' | 'other';
  proposedByUserId: string;
  approvedByRepId?: string;
  threshold: number;
  status: 'proposed' | 'approved' | 'voting' | 'passed' | 'failed' | 'cancelled';
  votingStartsAt?: string;
  votingEndsAt?: string;
  resultYes: number;
  resultNo: number;
  resultAbstain: number;
  createdAt: string;
}

export interface VoteBallot {
  id: string;
  voteId: string;
  userId: string;
  membershipStatus: 'active' | 'legacy';
  voteChoice: 'yes' | 'no' | 'abstain';
  votedAt: string;
}

export interface OrganizationAudit {
  id: string;
  organizationId: string;
  actionType: string;
  performedByUserId: string;
  affectedUserId?: string;
  details: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

// Governance Types for Democratic Organization Features
export interface OrganizationGovernanceRules {
  id: string;
  organizationId: string;
  representativeTermMonths: number;
  representativeTermLimits?: number;
  electionVotingMethod: 'simple_majority' | 'ranked_choice' | 'approval';
  electionQuorumPercentage: number;
  electionNoticeDays: number;
  defaultVotingDeadlineHours: number;
  defaultQuorumPercentage: number;
  documentProposalPeriodDays: number;
  thresholdCalculationMethod: 'all_votes' | 'all_members';
  defaultAcceptanceThreshold: number;
  anonymousVotingEnabled: boolean;
  voteChangeAllowed: boolean;
  representativeCanCreateVotes: boolean;
  representativeCanInviteMembers: boolean;
  representativeCanManageDocuments: boolean;
  representativeApprovalRequired: boolean;
  tamperProofEnabled: boolean;
  auditTrailEnabled: boolean;
  
  // Member permission flags
  membersCanProposeRules: boolean;
  membersCanProposeRulesThreshold: number;
  membersCanCreateDocuments: boolean;
  membersCanCreateDocumentsThreshold: number;
  membersCanInitializeElections: boolean;
  membersCanInitializeElectionsThreshold: number;
  membersCanInviteMembers: boolean;
  membersCanInviteMembersThreshold: number;
  membersCanManageRuleProposals: boolean;
  membersCanManageRuleProposalsThreshold: number;
  
  // Minimum safeguards (system-enforced)
  minimumQuorumPercentage: number;
  minimumApprovalThreshold: number;
  minimumVotingPeriodHours: number;
  
  // Bootstrap mode
  bootstrapMode: boolean;
  bootstrapCompletedAt: string | null;
  
  // Recovery mode
  recoveryMode: boolean;
  recoveryModeEnteredAt: string | null;
  recoveryModeReason: string | null;
  
  // Safety tracking
  lastSuccessfulVoteAt: string | null;
  failedProposalsCount: number;
  lastFailedProposalAt: string | null;
  ruleChangesThisMonth: number;
  lastRuleChangeAt: string | null;
  
  createdAt: string;
  updatedAt: string;
}

// Bootstrap mode status
export interface BootstrapStatus {
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
}

// Recovery mode status
export interface RecoveryStatus {
  mode: boolean;
  enteredAt: string | null;
  reason: string | null;
  canExit: boolean;
}

// Rule history entry
export interface RuleHistoryEntry {
  id: string;
  ruleField: string;
  oldValue: any;
  newValue: any;
  changedBy: {
    userId: string;
    userName: string;
    proposalId?: string;
  };
  changedAt: string;
}

// Permission context
export interface PermissionContext {
  isRepresentative: boolean;
  isActiveMember: boolean;
  isAdmin: boolean;
  bootstrapMode: boolean;
  recoveryMode: boolean;
}

export interface RepresentativeElection {
  id: string;
  organizationId: string;
  electionTitle: string;
  electionDescription?: string;
  status: 'draft' | 'announced' | 'active' | 'completed' | 'cancelled';
  positionsAvailable: number;
  termStartDate?: string;
  termEndDate?: string;
  votingStartsAt?: string;
  votingEndsAt?: string;
  quorumRequired: number;
  totalVoters: number;
  votesCast: number;
  quorumMet: boolean;
  anonymousVoting: boolean;
  electionCompletedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  candidates?: ElectionCandidate[]; // Nominees/candidates for this election
}

export interface ElectionCandidate {
  id: string;
  electionId: string;
  userId: string;
  candidateStatement?: string;
  acceptedNomination: boolean;
  nominatedBy?: string;
  nominationAcceptedAt?: string;
  votesReceived: number;
  elected: boolean;
  electedPosition?: number;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
}

export interface VotingSession {
  id: string;
  organizationId: string;
  sessionType: 'election' | 'policy' | 'document' | 'membership' | 'dissolution' | 'other';
  relatedEntityId?: string;
  title: string;
  description?: string;
  status: 'draft' | 'pending_approval' | 'announced' | 'active' | 'completed' | 'cancelled' | 'failed';
  anonymousVoting: boolean;
  deadlineHours: number;
  quorumPercentage: number;
  requiredMajority: number;
  votingStartsAt?: string;
  votingEndsAt?: string;
  announcedAt?: string;
  completedAt?: string;
  eligibleVotersCount: number;
  votesCastCount: number;
  quorumMet: boolean;
  yesVotes: number;
  noVotes: number;
  abstainVotes: number;
  result?: 'pending' | 'approved' | 'rejected' | 'tied' | 'quorum_not_met' | 'cancelled';
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VoterToken {
  id: string;
  votingSessionId: string;
  userId: string;
  anonymousToken: string;
  tokenIssuedAt: string;
  tokenUsed: boolean;
  tokenUsedAt?: string;
}

// Document Tree Proposal Response Types
export interface TreeProposalsResponse {
  success: boolean;
  proposals: DocumentTreeProposal[];
}

export interface TreeProposalResponse {
  success: boolean;
  proposal: DocumentTreeProposal;
}

export interface RepresentativeTerm {
  id: string;
  organizationId: string;
  userId: string;
  termNumber: number;
  electedInElectionId?: string;
  termStartDate: string;
  termEndDate: string;
  termStatus: 'active' | 'completed' | 'removed' | 'resigned';
  removedBy?: string;
  removedAt?: string;
  removalReason?: string;
  resignedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VotingAnalytics {
  id: string;
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  totalMembers: number;
  activeVoters: number;
  totalVotesCast: number;
  averageVotesPerMember: number;
  electionsHeld: number;
  averageElectionTurnout: number;
  quorumAchievedPercentage: number;
  totalDecisionsMade: number;
  decisionsPassed: number;
  decisionsFailed: number;
  averageDecisionTimeHours: number;
  createdAt: string;
  updatedAt: string;
}

// Document proposal types removed - system replaced with direct document creation

// Alias types for backward compatibility with existing components
export type Suggestion = Proposal;
export type Suggestions = Proposal[];

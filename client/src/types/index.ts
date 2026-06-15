// Backend API types
export type ElementType = "paragraph" | "heading";
export type HeadingLevel = "h1" | "h2" | "h3";
export type AppView = 'documents' | 'activity' | 'document' | 'profile' | 'settings' |
  'member-profile' | 'organizations' | 'organization' | 'admin' | 'search' | 'report-issue';

export type ProfileVisibility = 'hidden' | 'org_members' | 'representatives';

export interface ProfileLink {
  type: 'website' | 'linkedin' | 'github' | 'mastodon' | 'custom';
  label?: string;
  url: string;
  visibility: ProfileVisibility;
}

export interface ProfileContact {
  phone?: string;
  phoneVisibility: ProfileVisibility;
  emailVisibility: ProfileVisibility;
  preferredMethod: 'email' | 'phone';
}

export interface ProfileTags {
  interests: string[];
  skills: string[];
  visibility: ProfileVisibility;
}

export interface ProfileData {
  headline?: string;
  links?: ProfileLink[];
  contact?: ProfileContact;
  tags?: ProfileTags;
}

export interface ProfileMembership {
  organizationId: string;
  organizationName: string;
  isRepresentative: boolean;
  status: 'active' | 'legacy' | 'suspended';
  joinedAt: string;
  location?: {
    city: string;
    region: string | null;
    countryCode: string;
  };
}

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
  created_at?: string;
  role?: string;
  bio?: string;
  avatar?: string;
  profileData?: ProfileData;
  timezone?: string;
  defaultHomeView?: 'activity' | 'organization';
  preferences?: {
    backButtonPosition?: 'left' | 'right';
    fontFamily?: 'inter' | 'work-sans' | 'poppins' | 'merriweather';
    timezone?: string; // IANA timezone identifier (e.g., "America/New_York", "Europe/London", "Asia/Tokyo")
    timezoneVisibility?: 'hidden' | 'org_members';
    theme?: 'light' | 'dark' | 'system';
    locale?: string; // UI language code (e.g. "en", "es", "fr")
  };
}

export interface MemberProfileResponse {
  user: User;
  memberships?: ProfileMembership[];
  contextOrganization?: ProfileMembership;
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
  /** True if vote was synthesized from counts (no real user). */
  isPlaceholder?: boolean;
}

/**
 * Partial vote counts for real-time vote bar updates
 * Used in WebSocket updates to provide instant feedback
 */
export interface PartialVoteCounts {
  pro: number;
  contra: number;
  neutral: number;
  total: number;
  userId?: string;
  vote?: 'PRO' | 'NEUTRAL' | 'CONTRA';
}

/**
 * Complete vote update data structure for WebSocket events
 * Includes both vote counts (for instant UI updates) and full vote array (for detailed display)
 */
export interface VoteUpdateData {
  voteId: string;
  userId: string;
  vote: 'PRO' | 'NEUTRAL' | 'CONTRA';
  action: 'cast' | 'updated';
  voteCounts: PartialVoteCounts;
  allVotes: Vote[];
  isAnonymous: boolean;
  approved?: boolean;
  approvalPercentage?: number;
}

export interface Comment {
  id: string;
  commentableType: 'proposal' | 'structure_proposal' | 'rule_proposal' | 'organization_vote' | 'election' | 'tree_proposal';
  commentableId: string;
  // Backward compatibility fields
  proposalId?: string; // Set if commentableType === 'proposal'
  structureProposalId?: string; // Set if commentableType === 'structure_proposal'
  userId: string;
  text: string;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  editedAt?: string | null;
  editCount?: number;
  user: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  parent?: {
    id: string;
    user: {
      id: string;
      name: string;
      avatar?: string;
    };
  };
  replies: {
    id: string;
    user: {
      id: string;
      name: string;
      avatar?: string;
    };
  }[];
  /** Number of upvotes (included when upvote feature is enabled) */
  upvoteCount?: number;
  /** Whether the current user has upvoted this comment */
  userUpvoted?: boolean;
}

// API response may include snake_case properties for backward compatibility
export interface CommentApiResponse extends Comment {
  deleted_at?: string;
  edited_at?: string;
  edit_count?: number;
  user_avatar?: string; // Top-level avatar fallback
}

export interface Proposal {
  id: string;
  paragraphId: string;
  userId: string;
  text: string;
  /** Parent context ID: document for structure proposals, organization for rule proposals; paragraph proposals use paragraphId. */
  contextId?: string;
  /** Scope of the proposal: paragraph (default), document (structure), or organization (rule). */
  contextType?: 'paragraph' | 'document' | 'organization';
  /** Optional title for proposals that have one (e.g. rule proposals, structure proposals) */
  title?: string;
  /** Optional description for proposals that have one */
  description?: string;
  type: 'BODY' | 'TITLE';
  headingLevel?: HeadingLevel;
  approved: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  votes: Vote[];
  comments: Comment[];
  commentCount?: number;
  /** Partial vote counts from WebSocket updates for instant vote bar updates */
  partialVoteCounts?: PartialVoteCounts;
  /** True when suggestion was built from history without a real proposalId. */
  isHistoryFallback?: boolean;
}

export interface VersionHistory {
  id: string;
  paragraphId: string;
  userId: string;
  text: string;
  /** Preferred display text for accepted change (camelCase from API) */
  newText?: string;
  /** Snake_case alias from some API responses */
  new_text?: string;
  oldText?: string | null;
  proposalId?: string | null;
  acceptedAt: Date | string;
  /** When the history entry was created (camelCase or snake_case from API) */
  createdAt?: Date | string;
  created_at?: string;
  approvalPercentage: number;
  type?: 'BODY' | 'TITLE' | string;
  headingLevel?: HeadingLevel;
  /** Snake_case alias from some API responses */
  heading_level?: HeadingLevel | string | null;
  user: {
    id: string;
    name: string;
    email?: string;
  };
}

/**
 * Paragraph interface - paragraphs are mutually exclusive:
 * - Heading: has `title` and `headingLevel`, `text` is empty string
 * - Body: has `text`, no `title` or `headingLevel`
 * 
 * A paragraph cannot have both title and text simultaneously.
 */
export interface Paragraph {
  id: string;
  documentId: string;
  /** For heading paragraphs only - mutually exclusive with text */
  title?: string;
  /** For heading paragraphs only - mutually exclusive with text */
  headingLevel?: HeadingLevel | null;
  /** For body paragraphs only - mutually exclusive with title/headingLevel */
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
    avatar?: string;
  };
}

export interface DocumentOptions {
  acceptanceThreshold: number;        // 1-100 (one-time choice)
  votingAnonymous: boolean;            // true = anonymous (closed), false = public (open)
  votingAnonymityLocked: boolean;     // if true, anonymity cannot be changed
  voteChangeAllowed: boolean;         // true = flexible, false = locked
  thresholdCalculationMethod?: 'all_votes' | 'all_members'; // How approval percentage is calculated
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
  proposalEndedAt?: string; // When proposal phase actually ended
  votingEndedAt?: string; // When voting actually ended
  amendmentsClosedAt?: string; // When amendment window was last closed
  amendmentAdoptionVoteId?: string | null; // Pending org vote to adopt amendment bundle
  hasAmendmentSnapshot?: boolean; // True when snapshot exists (detail endpoints)
  minVotersRequired?: number; // Minimum voters for quorum
  deletionProposedAt?: string; // When deletion was proposed
  deletionProposedBy?: string; // Who proposed deletion
  deletionVoteDeadline?: string; // Deadline for deletion vote
  structureProposalsEnabled?: boolean; // Whether structure proposals are enabled
  amendmentsOpen?: boolean; // Whether document is open for amendments (agreed docs only)
  amendmentsOpenedAt?: string; // ISO datetime when amendments were opened (agreed docs only)
  /** 'meeting_minutes' for minutes documents; omitted for standard docs */
  documentKind?: string;
  /** Set when documentKind === 'meeting_minutes'; used to open meeting view */
  meetingId?: string;
  /** When document is meeting minutes: meeting's minutes_finalized_at (from backend) */
  minutesFinalizedAt?: string | null;
  /** When document is meeting minutes: meeting's scheduled_at (from backend) for display/sort */
  meetingScheduledAt?: string;
  owner: {
    id: string;
    name: string;
    email?: string; // Optional for organizations
    avatar?: string; // Optional for organizations
    type?: 'user' | 'organization'; // Type discriminator
  };
  collaborators: DocumentCollaborator[];
  paragraphs: Paragraph[];
  options?: DocumentOptions;
  documentVotes?: DocumentVote[]; // Document-level votes for real-time updates
}

// API response may include snake_case properties for backward compatibility
export interface DocumentApiResponse extends Document {
  // Optional snake_case variants of camelCase properties
  proposal_deadline?: string;
  voting_deadline?: string;
  voting_started_at?: string;
  created_at?: string;
  updated_at?: string;
  min_voters_required?: number;
}

/** Position context for creating a document (root, child, above/below sibling). */
export interface DocumentPositionContext {
  positionType: 'root' | 'child' | 'above_sibling' | 'below_sibling';
  referenceDocumentId?: string;
  referenceDocumentTitle?: string;
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
  /** Whether participation threshold (quorum) is met for completing the vote */
  quorumMet?: boolean;
  quorumRequired?: number;
  totalEligible?: number;
  /** When set, voting ends at this time (ISO string). API returns this as votingDeadline (camelCase). Shown on card when in future. */
  votingDeadline?: string | null;
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
  comments: Comment[];
  /** Whether participation threshold (quorum) is met for Complete vote */
  quorumMet?: boolean;
  /** Minimum votes required for quorum */
  quorumRequired?: number;
  /** Whether voting has been closed (voting_deadline passed) */
  votingDeadline?: string | null;
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

// Unified History Types
export interface UnifiedHistoryEntry {
  id: string;
  type: 'structure' | 'paragraph';
  timestamp: Date;
  user: { id: string; name: string; avatar?: string };
  structureVersion?: StructureVersion;
  paragraphHistory?: VersionHistory;
  paragraph?: Paragraph;
  groupId?: string;
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
  brandingBannerUrl?: string;
  iconSet?: 'lucide' | 'tabler' | 'heroicons';
  fontFamily?: 'inter' | 'work-sans' | 'poppins' | 'merriweather';
  overviewPinnedEventId?: string | null;
  overviewPinnedAt?: string | null;
  overviewPinnedByUserId?: string | null;
  overviewPinnedEvent?: import('../lib/api/calendar').CalendarEvent | null;
  primaryParentId?: string | null;
  orgKind?: 'standard' | 'network' | 'initiative';
  participationProfile?: string;
  treeDepth?: number;
  treePath?: string;
  participationGraphRootId?: string;
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

/** Current user's stored location for an organization (city-level, for member map). */
export interface MemberLocation {
  city: string;
  region: string | null;
  countryCode: string;
  latitude: number;
  longitude: number;
  source: 'manual' | 'auto';
  showOnMap: boolean;
  locationUpdatedAt: string;
}

/** Aggregated city for the member map (anonymous count per city). */
export interface CityAggregate {
  city: string;
  region: string | null;
  countryCode: string;
  latitude: number;
  longitude: number;
  count: number;
}

export interface OrganizationVote {
  id: string;
  organizationId: string;
  title: string;
  description?: string;
  voteType: 'policy' | 'document_change' | 'document_amendment_adoption' | 'membership' | 'dissolution' | 'other' | 'representative_removal';
  proposedByUserId: string;
  approvedByRepId?: string;
  threshold: number;
  status: 'proposed' | 'approved' | 'voting' | 'passed' | 'failed' | 'cancelled';
  votingStartsAt?: string;
  votingEndsAt?: string;
  targetDocumentId?: string;
  resultYes: number;
  resultNo: number;
  resultAbstain: number;
  createdAt: string;
  /** Current user's ballot, when returned by list votes API */
  userVoteChoice?: 'yes' | 'no' | 'abstain';
}

export interface VoteBallot {
  id: string;
  voteId: string;
  userId: string;
  membershipStatus: 'active' | 'legacy';
  voteChoice: 'yes' | 'no' | 'abstain' | 'PRO' | 'CONTRA' | 'NEUTRAL';
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
  paragraphProposalCutoffDays?: number;
  thresholdCalculationMethod: 'all_votes' | 'all_members';
  defaultAcceptanceThreshold: number;
  anonymousVotingEnabled: boolean;
  voteChangeAllowed: boolean;
  defaultStructureProposalsEnabled: boolean;
  defaultVotingAnonymityLocked: boolean;
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
  membersCanInitiateMistrustVote: boolean;
  mistrustVoteThreshold: number;
  mistrustVoteQuorumPercentage: number;
  
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

// Governance rule value type - can be string, number, boolean, or null
export type GovernanceRuleValue = string | number | boolean | null;

// Rule history entry
export interface RuleHistoryEntry {
  id: string;
  ruleField: string;
  oldValue: GovernanceRuleValue;
  newValue: GovernanceRuleValue;
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
  /** API maps DB nomination→announced and voting→active (see ElectionService.js) */
  status: 'draft' | 'nomination' | 'announced' | 'voting' | 'active' | 'completed' | 'cancelled';
  positionsAvailable: number;
  termStartDate?: string;
  termEndDate?: string;
  nominationStartsAt?: string;
  nominationEndsAt?: string;
  votingStartsAt?: string;
  votingEndsAt?: string;
  quorumRequired: number;
  totalVoters: number;
  votesCast: number;
  quorumMet: boolean;
  anonymousVoting: boolean;
  electionCompletedAt?: string;
  createdBy: string;
  triggerType?: 'manual' | 'resignation' | 'term_expiration' | 'auto_scheduled';
  triggeredByTermId?: string;
  autoAdvancePhases?: boolean;
  phaseTransitionInProgress?: boolean;
  createdAt: string;
  updatedAt: string;
  candidates?: ElectionCandidate[]; // Nominees/candidates for this election
  /** For ballot export / verify: contestId = voting_session_id (only when a voting session exists). */
  votingSessionId?: string | null;
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
  resignationPending?: boolean;
  replacementElectionId?: string;
  resignationRequestedAt?: string;
  failedElectionAttempts?: number;
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

// Rule Proposal Types
// Note: GovernanceRuleValue is defined above (line 587) and exported

export interface RuleProposal {
  id: string;
  title: string;
  description?: string;
  ruleField: string;
  currentValue?: GovernanceRuleValue;
  proposedValue?: GovernanceRuleValue;
  status: 'draft' | 'active' | 'approved' | 'rejected' | 'cancelled' | 'expired';
  votingStartsAt?: string;
  votingEndsAt?: string;
  votingDeadline?: string;
  thresholdPercentage?: number;
  anonymousVoting?: boolean;
  votesYes?: number;
  votesNo?: number;
  votesAbstain?: number;
  totalVoters?: number;
  votesCast?: number;
  /** Whether participation threshold (quorum) is met for Complete vote (enriched by API). */
  quorumMet?: boolean;
  approvedAt?: string;
  implementedAt?: string;
  createdBy: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt?: string;
  options?: Array<{
    id: string;
    optionTitle: string;
    optionDescription?: string;
    proposedValue: GovernanceRuleValue;
    votesReceived?: number;
  }>;
  votes?: Array<{
    id?: string;
    userId: string;
    selectedOptionId?: string;
    voteChoice?: 'yes' | 'no' | 'abstain' | 'PRO' | 'CONTRA' | 'NEUTRAL';
    votedAt?: string;
    user?: {
      id: string;
      name: string;
      email?: string;
    };
  }>;
}

export interface RuleProposalsResponse {
  ruleProposals: RuleProposal[];
}

// API response may include snake_case properties for backward compatibility
export interface RuleProposalApiResponse extends RuleProposal {
  // Optional snake_case variants of camelCase properties
  current_rule_field?: string;
  proposed_rule_value?: GovernanceRuleValue;
  voting_ends_at?: string;
  votes_yes?: number;
  votes_no?: number;
  votes_abstain?: number;
  votes_cast?: number;
  total_voters?: number;
  created_by?: string;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

// Document proposal types removed - system replaced with direct document creation

// Alias types for backward compatibility with existing components
export type Suggestion = Proposal;
export type Suggestions = Proposal[];

// Search Types
export type SearchEntityType = 'document' | 'paragraph' | 'meeting';

export interface SearchFilters {
  organizationId?: string;
  documentId?: string;
  types?: SearchEntityType[];
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  authorId?: string;
  limit?: number;
  offset?: number;
}

export interface SearchOwner {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface SearchOrganizationRef {
  id: string;
  name: string;
}

interface SearchResultBase {
  snippet?: string;
  rank: number;
  organizationId?: string;
  organization?: SearchOrganizationRef | null;
}

export interface DocumentSearchResult extends SearchResultBase {
  entityType: 'document';
  id: string;
  title: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  owner: SearchOwner;
}

export interface ParagraphSearchResult extends SearchResultBase {
  entityType: 'paragraph';
  paragraphId: string;
  documentId: string;
  documentTitle: string;
  documentKind?: string | null;
  meetingId?: string | null;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  owner: SearchOwner;
}

export interface MeetingSearchResult extends SearchResultBase {
  entityType: 'meeting';
  meetingId: string;
  id: string;
  title: string;
  scheduledAt: string;
  location?: string | null;
  minutesDocumentId?: string | null;
}

export type SearchResult = DocumentSearchResult | ParagraphSearchResult | MeetingSearchResult;

export interface SearchSuggestion {
  text: string;
  entityType: SearchEntityType;
  entityId: string;
}

export interface SearchResults {
  results: SearchResult[];
  count: number;
  facets?: Partial<Record<SearchEntityType, number>>;
}

// WebSocket Event Types
export type WebSocketEventType = 
  | 'vote' 
  | 'comment' 
  | 'proposal' 
  | 'paragraph'
  | 'paragraph-created'
  | 'paragraph-updated'
  | 'document-vote' 
  | 'document-status-changed' 
  | 'proposal-cutoff-reached' 
  | 'deletion-proposed' 
  | 'deletion-vote' 
  | 'deletion-cancelled' 
  | 'document-deleted' 
  | 'deletion-vote-rejected' 
  | 'rule-proposal-approved'
  | 'governance-rules-updated'
  | 'structure-proposal-vote'
  | 'tree-proposal-vote';

export type OrganizationEventType =
  | 'governance-rules-updated'
  | 'election-created'
  | 'member-added'
  | 'member-removed'
  | 'representative-added'
  | 'representative-removed'
  | 'vote-created'
  | 'vote-completed'
  | 'rule-proposal-created'
  | 'rule-proposal-approved'
  | 'rule-proposal-rejected';

/**
 * Base WebSocket event structure
 * All WebSocket events follow this structure
 */
export interface WebSocketEvent {
  /** Document ID (for document events) */
  documentId?: string;
  /** Organization ID (for organization events) */
  organizationId?: string;
  /** Event type identifier */
  eventType: string;
  /** Event data payload (transformed to camelCase) */
  data: unknown;
  /** ISO timestamp of the event */
  timestamp: string;
}

/**
 * Document update event
 * Broadcast when document-related changes occur
 */
export interface DocumentUpdateEvent extends WebSocketEvent {
  documentId: string;
  eventType: WebSocketEventType;
  data: 
    | { proposalId: string; paragraphId: string; vote: VoteData }
    | { proposalId: string; paragraphId: string; comment: Comment; action?: 'created' | 'updated' | 'deleted' }
    | { paragraphId: string; proposal: Proposal }
    | { paragraphId: string; paragraph: Paragraph }
    | { paragraphId: string; paragraph: Paragraph }
    | { paragraphId: string; text?: string; title?: string; headingLevel?: string }
    | { votes: DocumentVote[]; action: 'cast' | 'updated' }
    | { oldStatus: string; newStatus: string; reason?: string; adoptedAt?: string }
    | { proposalsLocked: boolean; message?: string }
    | { deletionProposedBy: string; deletionVoteDeadline: string }
    | { documentId: string; voteId: string; userId: string; vote: 'PRO' | 'NEUTRAL' | 'CONTRA'; action: string; allVotes: DocumentVote[]; isAnonymous: boolean }
    | Record<string, unknown>;
}

/**
 * Organization update event
 * Broadcast when organization-related changes occur
 */
export interface OrganizationUpdateEvent extends WebSocketEvent {
  organizationId: string;
  eventType: OrganizationEventType | string;
  data: Record<string, unknown>;
}

/**
 * Vote data structure for WebSocket events
 * Supports both legacy format (allVotes only) and new format (voteCounts + allVotes)
 */
export interface VoteData {
  voteId: string;
  userId?: string;
  vote: 'PRO' | 'NEUTRAL' | 'CONTRA';
  action: 'cast' | 'updated';
  allVotes: Vote[];
  isAnonymous: boolean;
  createdAt?: string;
  user?: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  /** Vote counts for instant vote bar updates (new format) */
  voteCounts?: PartialVoteCounts;
  /** Legacy flag for partial updates - deprecated, use voteCounts instead */
  isPartial?: boolean;
}
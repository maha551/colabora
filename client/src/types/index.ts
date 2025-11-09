// Backend API types
export type ElementType = "paragraph" | "heading";
export type HeadingLevel = "h1" | "h2" | "h3";

export interface User {
  id: string;
  name: string;
  email: string;
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

export interface Document {
  id: string;
  title: string;
  description?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    name: string;
    email: string;
  };
  collaborators: DocumentCollaborator[];
  paragraphs: Paragraph[];
  options?: DocumentOptions;
}

// Structure Proposal Types
export type StructureOperationType = 'MOVE' | 'MERGE' | 'SPLIT' | 'DELETE' | 'RENAME_HEADING' | 'CHANGE_HEADING_LEVEL' | 'INSERT_NEW';

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
  operationData?: any; // For complex operations like splits
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

// Alias types for backward compatibility with existing components
export type Suggestion = Proposal;
export type Suggestions = Proposal[];

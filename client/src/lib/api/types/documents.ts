// Document API Response Types
import type { 
  Document,
  Paragraph,
  Proposal,
  Vote,
  Comment,
  DocumentVote,
  StructureVersion,
  StructureVersionDetail,
  VersionHistory
} from "../../../types";

export interface DocumentsResponse {
  documents: Document[];
}

export interface DocumentResponse {
  document: Document;
}

export interface BatchDocumentsResponse {
  documents: Array<{
    id: string;
    title: string;
    paragraphs: Array<{
      id: string;
      text?: string;
      title?: string;
      order?: number;
      history?: VersionHistory[];
    }>;
  }>;
  notFound?: string[];
  errors?: Record<string, string>;
}

export interface ParagraphResponse {
  paragraph: Paragraph;
}

export interface ProposalResponse {
  message: string;
  proposal: Proposal;
}

export interface VoteResponse {
  message: string;
  votes: Vote[];
  voteId: string;
  vote: 'PRO' | 'NEUTRAL' | 'CONTRA';
  isAnonymous: boolean;
}

export interface CommentResponse {
  message: string;
  comment: Comment;
}

export interface StructureProposalVoteResponse {
  message: string;
  votes: Vote[];
  voteId: string;
  vote: 'PRO' | 'NEUTRAL' | 'CONTRA';
  isAnonymous: boolean;
}

export interface DocumentVoteResponse {
  message: string;
  votes: DocumentVote[];
  voteId: string;
  vote: 'PRO' | 'NEUTRAL' | 'CONTRA';
  isAnonymous?: boolean;
}

export interface ParagraphUpdateResponse {
  message: string;
  paragraph: {
    id: string;
    text: string | null;
    title: string | null;
    headingLevel: string | null;
    orderIndex: number;
  };
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
    finalizationDeferredUntilDeadline?: boolean;
    canFinalizeEarly?: boolean;
    wouldApproveIfFinalized?: boolean;
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
  proposed: boolean;
  proposedAt?: string;
  proposedBy?: string;
  voteDeadline?: string;
  votes?: {
    total: number;
    breakdown: {
      PRO: number;
      NEUTRAL: number;
      CONTRA: number;
    };
    approvalRate: number;
  };
  eligibleVoters?: number;
  quorumRequired?: number;
  quorumMet?: boolean;
}

// Structure Proposals API Response Types
export interface StructureProposalsResponse {
  structureProposals: Array<{
    id: string;
    documentId: string;
    title: string;
    description?: string;
    operations: Array<{
      type: string;
      [key: string]: unknown;
    }>;
    status: string;
    createdAt: string;
    updatedAt: string;
    createdBy: {
      id: string;
      name: string;
      email: string;
    };
    votes?: Vote[];
    comments?: Comment[];
  }>;
}

export interface StructureProposalResponse {
  structureProposal: {
    id: string;
    documentId: string;
    title: string;
    description?: string;
    operations: Array<{
      type: string;
      [key: string]: unknown;
    }>;
    status: string;
    createdAt: string;
    updatedAt: string;
    createdBy: {
      id: string;
      name: string;
      email: string;
    };
    votes?: Vote[];
    comments?: Comment[];
  };
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


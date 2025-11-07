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
  user: {
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
}

// Alias types for backward compatibility with existing components
export type Suggestion = Proposal;
export type Suggestions = Proposal[];

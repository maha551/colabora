// Common API Response Types
// Shared types used across multiple API modules

export interface MessageResponse {
  message?: string;
  collaborator?: {
    id: string;
    documentId: string;
    userId: string;
    createdAt: string;
    user: {
      id: string;
      name: string;
      email: string;
    };
  };
}


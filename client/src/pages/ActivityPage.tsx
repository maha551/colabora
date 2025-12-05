import React from 'react';
import { Document, User, Organization } from '../types';
import { ActivityFeedView } from '../components/ActivityFeedView';
import { DocumentUpdate } from '../hooks/useWebSocket';

interface ActivityPageProps {
  documents: Document[];
  currentUser: User | null;
  onNavigateToDocument: (documentId: string) => Promise<void>;
  onAddComment: (
    proposalId: string,
    documentId: string,
    paragraphId: string,
    text: string,
    parentId?: string
  ) => Promise<void>;
  onWebSocketUpdate?: (handler: (update: DocumentUpdate) => void) => void;
  organizations: Organization[];
}

export function ActivityPage({
  documents,
  currentUser,
  onNavigateToDocument,
  onAddComment,
  onWebSocketUpdate,
  organizations,
}: ActivityPageProps) {
  return (
    <ActivityFeedView
      documents={documents}
      currentUser={currentUser}
      onNavigateToDocument={onNavigateToDocument}
      onAddComment={onAddComment}
      onWebSocketUpdate={onWebSocketUpdate}
      organizations={organizations}
    />
  );
}

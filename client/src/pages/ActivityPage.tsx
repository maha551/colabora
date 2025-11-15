import React from 'react';
import { Document } from '../types';
import { ActivityFeedView } from '../components/ActivityFeedView';

interface ActivityPageProps {
  documents: Document[];
  currentUser: any;
  onNavigateToDocument: (documentId: string) => Promise<void>;
  onAddComment: (
    proposalId: string,
    documentId: string,
    paragraphId: string,
    text: string,
    parentId?: string
  ) => Promise<void>;
}

export function ActivityPage({
  documents,
  currentUser,
  onNavigateToDocument,
  onAddComment,
}: ActivityPageProps) {
  return (
    <ActivityFeedView
      documents={documents}
      currentUser={currentUser}
      onNavigateToDocument={onNavigateToDocument}
      onAddComment={onAddComment}
    />
  );
}

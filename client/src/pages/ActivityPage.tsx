import React, { useCallback } from 'react';
import { Document, User, Organization } from '../types';
import { DocumentUpdate } from '../hooks/useWebSocket';
import { ActivityFeedView } from '../components/ActivityFeedView';
import { useVotingStore } from '../stores/useVotingStore';
import { getCurrentHash, parseHash, buildHash, pushHash } from '../lib/hashRoutes';

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
  onNavigateToOrganization?: (organizationId: string) => void;
  onNavigateToHash?: (hash: string) => void;
}

export function ActivityPage({
  documents,
  currentUser,
  onNavigateToDocument,
  onAddComment,
  onWebSocketUpdate,
  organizations,
  onNavigateToOrganization,
  onNavigateToHash,
}: ActivityPageProps) {
  const votingState = useVotingStore((s) => s.votingState);
  const setVotingState = useVotingStore((s) => s.setVotingState);

  const parsed = parseHash(getCurrentHash());
  const filterOrganizationId = parsed.activityOrganizationId ?? null;

  const handleClearOrganizationFilter = useCallback(() => {
    if (onNavigateToHash) {
      onNavigateToHash(buildHash({ view: 'activity' }));
    } else {
      pushHash('#/activity');
    }
  }, [onNavigateToHash]);

  if (!currentUser) {
    return null;
  }

  return (
    <ActivityFeedView
      documents={documents}
      currentUser={currentUser}
      onNavigateToDocument={onNavigateToDocument}
      onAddComment={onAddComment}
      onWebSocketUpdate={onWebSocketUpdate}
      organizations={organizations}
      onNavigateToOrganization={onNavigateToOrganization}
      onNavigateToHash={onNavigateToHash}
      votingState={votingState}
      setVotingState={setVotingState}
      filterOrganizationId={filterOrganizationId}
      onClearOrganizationFilter={filterOrganizationId ? handleClearOrganizationFilter : undefined}
    />
  );
}

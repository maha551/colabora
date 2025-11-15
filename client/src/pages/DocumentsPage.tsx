import React from 'react';
import { Document } from '../types';
import { DocumentDashboard } from '../components/DocumentDashboard';

interface DocumentsPageProps {
  documents: Document[];
  currentUser: any;
  onSelectDocument: (document: Document) => void;
  onCreateDocument: (
    title: string,
    description?: string,
    contributors?: string[],
    options?: {
      acceptanceThreshold?: number;
      votingAnonymous?: boolean;
      votingAnonymityLocked?: boolean;
      voteChangeAllowed?: boolean;
      structureProposalsEnabled?: boolean;
    },
    ownershipType?: 'personal' | 'shared' | 'organizational',
    organizationId?: string
  ) => Promise<void>;
  onDeleteDocument: (documentId: string) => Promise<void>;
  loading: boolean;
  isCreateDialogOpen: boolean;
  onSetCreateDialogOpen: (open: boolean) => void;
}

export function DocumentsPage({
  documents,
  currentUser,
  onSelectDocument,
  onCreateDocument,
  onDeleteDocument,
  loading,
  isCreateDialogOpen,
  onSetCreateDialogOpen,
}: DocumentsPageProps) {
  return (
    <DocumentDashboard
      documents={documents}
      currentUser={currentUser}
      onSelectDocument={onSelectDocument}
      onCreateDocument={onCreateDocument}
      onDeleteDocument={onDeleteDocument}
      loading={loading}
      isCreateDialogOpen={isCreateDialogOpen}
      onSetCreateDialogOpen={onSetCreateDialogOpen}
    />
  );
}

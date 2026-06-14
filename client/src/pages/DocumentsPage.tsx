import React from 'react';
import { Document, User, Organization } from '../types';
import { DocumentDashboard } from '../components/DocumentDashboard';

interface DocumentsPageProps {
  documents: Document[];
  currentUser: User | null;
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
  isLoading: boolean;
  documentsError?: string | null;
  onRetryDocuments?: () => void;
  isCreateDialogOpen: boolean;
  onSetCreateDialogOpen: (open: boolean) => void;
  currentOrganizationId?: string;
  organizations?: Organization[];
}

export function DocumentsPage({
  documents,
  currentUser,
  onSelectDocument,
  onCreateDocument,
  onDeleteDocument,
  isLoading,
  documentsError,
  onRetryDocuments,
  isCreateDialogOpen,
  onSetCreateDialogOpen,
  currentOrganizationId,
  organizations,
}: DocumentsPageProps) {
  return (
    <DocumentDashboard
      documents={documents}
      currentUser={currentUser}
      onSelectDocument={onSelectDocument}
      onCreateDocument={onCreateDocument}
      onDeleteDocument={onDeleteDocument}
      isLoading={isLoading}
      error={documentsError}
      onRetry={onRetryDocuments}
      isCreateDialogOpen={isCreateDialogOpen}
      onSetCreateDialogOpen={onSetCreateDialogOpen}
      currentOrganizationId={currentOrganizationId}
      organizations={organizations}
    />
  );
}

import React from 'react';
import { useTranslation } from 'react-i18next';
import { DocumentCard } from '../DocumentCard';
import { DocumentTreeGroup } from '../document-tree/DocumentTreeGroup';
import { SPACING } from '../../lib/designSystem';
import type { ContentTypeFilter } from '../../hooks/useDocumentFiltering';
import { resolveDocumentListLayout } from './documentListViewUtils';
import type { Document, Organization } from '../../types';

export interface DocumentListViewProps {
  contentTypeFilter: ContentTypeFilter;
  governanceDocuments: Document[];
  meetingMinutes: Document[];
  organizations: Organization[];
  currentUserId: string;
  onSelectDocument: (doc: Document) => void;
}

function renderDocumentCards(
  docs: Document[],
  organizations: Organization[],
  currentUserId: string,
  onSelectDocument: (doc: Document) => void
) {
  return (
    <div className={SPACING.tight.gap}>
      {docs.map((doc) => {
        const organization = organizations.find((org) => org.id === doc.organizationId);
        return (
          <DocumentCard
            key={doc.id}
            document={doc}
            currentUserId={currentUserId}
            organization={organization}
            onSelect={onSelectDocument}
            compact={false}
            showHierarchy={false}
          />
        );
      })}
    </div>
  );
}

function DocumentListViewComponent({
  contentTypeFilter,
  governanceDocuments,
  meetingMinutes,
  organizations,
  currentUserId,
  onSelectDocument,
}: DocumentListViewProps) {
  const { t: tDoc } = useTranslation('documents');
  const layout = resolveDocumentListLayout(contentTypeFilter);

  if (layout === 'flat') {
    const docs = contentTypeFilter === 'minutes' ? meetingMinutes : governanceDocuments;
    return renderDocumentCards(docs, organizations, currentUserId, onSelectDocument);
  }

  return (
    <div className={SPACING.container.vertical}>
      {governanceDocuments.length > 0 && (
        <DocumentTreeGroup
          title={tDoc('typeFilterDocuments', { defaultValue: 'Documents' })}
          count={governanceDocuments.length}
        >
          {renderDocumentCards(governanceDocuments, organizations, currentUserId, onSelectDocument)}
        </DocumentTreeGroup>
      )}

      {meetingMinutes.length > 0 && (
        <DocumentTreeGroup
          title={tDoc('typeFilterMeetingMinutes', { defaultValue: 'Meeting minutes' })}
          count={meetingMinutes.length}
        >
          {renderDocumentCards(meetingMinutes, organizations, currentUserId, onSelectDocument)}
        </DocumentTreeGroup>
      )}
    </div>
  );
}

export const DocumentListView = React.memo(DocumentListViewComponent);

import type { DecisionEntry } from '../../types/decisions';

export interface DecisionSourceGroup {
  key: string;
  label: string;
  description?: string;
  isOrg: boolean;
  isDocument: boolean;
  isMeeting?: boolean;
  documentId?: string;
  organizationId?: string;
  documentVersionId?: string;
}

function readPayloadString(payload: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return undefined;
}

export function getDecisionSourceGroup(entry: DecisionEntry): DecisionSourceGroup {
  const payload = entry.payload ?? {};

  if (entry.kind === 'meeting_decision') {
    const meetingId = readPayloadString(payload, ['meetingId']);
    const meetingTitle =
      readPayloadString(payload, ['meetingTitle']) ?? entry.documentTitle ?? 'Meeting';
    if (meetingId) {
      return {
        key: `meeting-${meetingId}`,
        label: meetingTitle,
        isOrg: false,
        isDocument: false,
        isMeeting: true,
        organizationId: entry.organizationId,
      };
    }
  }

  const documentVersionId =
    entry.documentVersionId ??
    readPayloadString(payload, ['documentVersionId', 'document_version_id', 'versionId']);

  if (documentVersionId && entry.documentId) {
    return {
      key: `docv-${entry.documentId}-${documentVersionId}`,
      label: entry.documentTitle || 'Document',
      description: `Version ${documentVersionId}`,
      isOrg: false,
      isDocument: true,
      documentId: entry.documentId,
      organizationId: entry.organizationId,
      documentVersionId,
    };
  }

  if (entry.documentId) {
    return {
      key: `doc-${entry.documentId}`,
      label: entry.documentTitle || 'Document',
      isOrg: false,
      isDocument: true,
      documentId: entry.documentId,
      organizationId: entry.organizationId,
    };
  }

  if (entry.organizationId) {
    return {
      key: `org-${entry.organizationId}`,
      label: entry.organizationName || 'Organization',
      isOrg: true,
      isDocument: false,
      organizationId: entry.organizationId,
    };
  }

  return {
    key: 'other',
    label: 'Other',
    isOrg: false,
    isDocument: false,
  };
}

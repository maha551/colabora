/**
 * Document Status Display Component
 * Shows current status and timeline for organizational documents
 */

import { useTranslation } from 'react-i18next';
import { Document, DocumentApiResponse } from '../types';
import { useTimezone } from '../hooks/useTimezone';
import { COLORS, RADIUS } from '../lib/designSystem';
import { cn } from './ui/utils';
import { Icon } from './ui/Icon';
import { getStatusPresentation } from '../lib/documentLifecycle';

function getDocumentProperty<T>(
  doc: Document | DocumentApiResponse,
  camelCase: keyof Document,
  snakeCase: keyof DocumentApiResponse
): T | undefined {
  const value = doc[camelCase];
  if (value !== undefined && value !== null) {
    return value as T;
  }
  const apiDoc = doc as DocumentApiResponse;
  return apiDoc[snakeCase] as T | undefined;
}

interface DocumentStatusDisplayProps {
  document: Document | null;
  compact?: boolean;
}

function DocumentStatusDisplay({ document, compact = false }: DocumentStatusDisplayProps) {
  const { t } = useTranslation('documents');
  const { formatDate, formatRelativeTime } = useTimezone();

  const statusInfo = getStatusPresentation(document, t, { formatRelativeTime });
  if (!statusInfo || !document) return null;

  const doc = document as DocumentApiResponse;
  const displayLabel = statusInfo.subtitle
    ? `${statusInfo.label} · ${statusInfo.subtitle}`
    : statusInfo.label;

  if (compact) {
    return (
      <span
        className={cn(
          RADIUS.pill,
          'inline-flex items-center px-2 py-1 text-xs font-medium border',
          statusInfo.bgColor,
          statusInfo.color,
          statusInfo.borderColor
        )}
      >
        <Icon name={statusInfo.iconName} className={cn('h-3 w-3 mr-1', statusInfo.color)} />
        {displayLabel}
      </span>
    );
  }

  return (
    <div className={cn(RADIUS.panel, 'border p-4', statusInfo.bgColor, statusInfo.borderColor)}>
      <div className="flex items-center space-x-3">
        <Icon name={statusInfo.iconName} className={cn('h-5 w-5 shrink-0', statusInfo.color)} />
        <div className="flex-1">
          <div className={`font-medium ${statusInfo.color}`}>{displayLabel}</div>
          <div className={cn('text-sm mt-0.5', COLORS.text.secondary)}>{statusInfo.description}</div>
        </div>

        {doc.ownershipType === 'organizational' && (
          <div className={cn('text-right text-xs', COLORS.text.secondary)}>
            {getDocumentProperty<string>(doc, 'proposalDeadline', 'proposal_deadline') && (
              <div>
                Proposed: {formatDate(getDocumentProperty<string>(doc, 'createdAt', 'created_at') || doc.createdAt)}
              </div>
            )}
            {getDocumentProperty<string>(doc, 'votingStartedAt', 'voting_started_at') && (
              <div>
                Voting started:{' '}
                {formatDate(
                  getDocumentProperty<string>(doc, 'votingStartedAt', 'voting_started_at') || doc.votingStartedAt
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {doc.status === 'voting' &&
        (() => {
          const minVoters = getDocumentProperty<number>(doc, 'minVotersRequired', 'min_voters_required');
          return minVoters ? (
            <div className="mt-1.5">
              <div className={cn('flex justify-between text-xs mb-0.5', COLORS.text.secondary)}>
                <span>Minimum voters required</span>
                <span>{minVoters}</span>
              </div>
              <div className={cn('text-xs', COLORS.text.secondary)}>
                Organization requires minimum participation for valid voting
              </div>
            </div>
          ) : null;
        })()}
    </div>
  );
}

export default DocumentStatusDisplay;

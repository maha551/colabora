import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Document, Organization } from '../types';
import { DocumentLifecycleStepper } from './DocumentLifecycleStepper';
import DocumentStatusDisplay from './DocumentStatusDisplay';
import { DocumentLifecycleCompactRow } from './DocumentLifecycleCompactRow';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Icon } from './ui/Icon';
import { OrganizationAvatar } from './shared/OrganizationAvatar';
import { resolveOrganizationAvatarData } from '../utils/organizationUtils';
import { cn } from './ui/utils';
import { useTimezone } from '../hooks/useTimezone';
import { SPACING, COLORS, RADIUS } from '../lib/designSystem';
import { getUserColor } from '../lib/userColors';
import { getDocumentOwnerStripeColor } from './documentOwnerStripe';
import { useIsMobile } from '../contexts/ScreenSizeContext';

interface DocumentCardProps {
  document: Document;
  currentUserId: string;
  organization?: Organization;
  onSelect: (document: Document) => void;
  onCreateChild?: (parentId: string) => void;
  compact?: boolean;
  showHierarchy?: boolean;
  parentPath?: Document[];
  className?: string;
}

export function DocumentCard({
  document,
  currentUserId,
  organization,
  onSelect,
  onCreateChild,
  compact = false,
  showHierarchy = false,
  parentPath,
  className,
}: DocumentCardProps) {
  const { t } = useTranslation('documents');
  const { t: tCommon } = useTranslation('common');
  const isMobile = useIsMobile();
  const [expandedStatus, setExpandedStatus] = useState(false);
  const isOwner = document.ownerId === currentUserId;
  const ownershipType = document.ownershipType || 'personal';
  const isOrganizational = ownershipType === 'organizational';
  const showOrgBadge = isOrganizational && !!organization;
  const totalCollaborators = document.collaborators.length;
  const totalSuggestions = document.paragraphs.reduce((acc, p) => acc + p.proposals.length, 0);
  const { formatDate } = useTimezone();
  const isMinutes = document.documentKind === 'meeting_minutes';
  const docMinutes = document as Document & { meetingScheduledAt?: string; minutesFinalizedAt?: string | null };
  const ownerStripeColor = getDocumentOwnerStripeColor(document, organization);
  const showOwnerInMeta = !(showOrgBadge && document.owner.type === 'organization');
  const leadingIconName = 'FileText';

  const getDocumentTypeBadge = () => {
    if (isMinutes) {
      return (
        <Badge variant="secondary" className="text-xs flex-shrink-0">
          {t('typeFilterMeetingMinutes', { defaultValue: 'Meeting minutes' })}
        </Badge>
      );
    }
    if (showOrgBadge) {
      return (
        <Badge variant="purple" className="text-xs flex-shrink-0 gap-1">
          <OrganizationAvatar organization={organization} size="xs" />
          <span className="truncate max-w-[120px] sm:max-w-none">{organization.name}</span>
        </Badge>
      );
    }
    if (ownershipType === 'shared') {
      return (
        <Badge variant="success" className="text-xs flex-shrink-0">
          <Icon name="Share" className="h-3 w-3 mr-1" />
          {t('shared')}
        </Badge>
      );
    }
    if (ownershipType === 'personal' && isOwner) {
      return (
        <Badge variant="info" className="text-xs flex-shrink-0">
          <Icon name="Folder" className="h-3 w-3 mr-1" />
          {t('personal')}
        </Badge>
      );
    }
    return null;
  };

  const renderOwnerMeta = () => {
    if (!showOwnerInMeta) return null;

    if (document.owner.type === 'organization') {
      return (
        <span className="flex items-center gap-1 truncate max-w-full">
          <OrganizationAvatar
            organization={resolveOrganizationAvatarData(organization, document.owner.name)}
            size="xs"
          />
          <span className="truncate">{document.owner.name}</span>
        </span>
      );
    }

    return (
      <span className="flex items-center gap-1 truncate max-w-full">
        <Avatar
          className="h-4 w-4 border flex-shrink-0"
          style={{ borderColor: getUserColor(document.owner.id) }}
        >
          <AvatarImage src={document.owner.avatar} />
          <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">
            {document.owner.name ? document.owner.name.split(' ').map((n) => n[0]).join('') : '?'}
          </AvatarFallback>
        </Avatar>
        <span className="truncate">{document.owner.name || tCommon('unknown')}</span>
      </span>
    );
  };

  return (
    <div
      className={cn(
        'bg-card border border-l-4 hover:border-muted-foreground/30 hover:bg-muted/50 hover:shadow-sm transition-all cursor-pointer group relative overflow-hidden',
        RADIUS.panel,
        compact ? 'min-h-16' : 'min-h-[4.5rem]',
        className
      )}
      style={{ borderLeftColor: ownerStripeColor }}
      onClick={() => onSelect(document)}
    >
      <div
        className={cn(
          'flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2',
          SPACING.card.padding,
          compact ? 'sm:flex-row sm:items-center' : 'pb-3 md:pb-4'
        )}
      >
        <div className={cn('flex items-start flex-1 min-w-0 gap-3', SPACING.content.inline)}>
          <div className="flex-shrink-0">
            <span
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center border border-border/60 bg-muted/30',
                RADIUS.control
              )}
              aria-hidden
            >
              <Icon name={leadingIconName} className="h-4 w-4 text-muted-foreground" />
            </span>
          </div>

          <div className="flex-1 min-w-0 overflow-hidden space-y-1">
            {showHierarchy && parentPath && parentPath.length > 0 && (
              <div className={cn('text-xs truncate', COLORS.text.secondary)}>
                {parentPath.map((p, i) => (
                  <span key={p.id}>
                    {p.title}
                    {i < parentPath.length - 1 && <span className="mx-1">/</span>}
                  </span>
                ))}
                <span className="mx-1">/</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
              <h3
                className={cn(
                  'text-base font-semibold truncate group-hover:text-foreground',
                  COLORS.text.primary
                )}
              >
                {document.title}
              </h3>
              {getDocumentTypeBadge()}
              {isOwner && ownershipType !== 'organizational' && (
                <Badge variant="secondary" className="text-xs flex-shrink-0">
                  <Icon name="User" className="h-3 w-3 mr-1" />
                  {t('owned')}
                </Badge>
              )}
            </div>

            {!compact && isMinutes && (
              <div
                className={cn(
                  'flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-relaxed',
                  COLORS.text.secondary
                )}
              >
                {organization && (
                  <span className="flex items-center gap-1 truncate max-w-full">
                    <OrganizationAvatar organization={organization} size="xs" />
                    <span className="truncate font-medium">{organization.name}</span>
                  </span>
                )}
                {docMinutes.meetingScheduledAt && (
                  <span
                    className={cn(
                      'flex items-center gap-1 px-1.5 py-0.5 border border-border/60 bg-muted/30',
                      RADIUS.inline
                    )}
                  >
                    <Icon name="Calendar" className="h-3 w-3 flex-shrink-0" />
                    <span className="font-medium">{formatDate(docMinutes.meetingScheduledAt)}</span>
                  </span>
                )}
                {docMinutes.minutesFinalizedAt && (
                  <span
                    className={cn(
                      'flex items-center gap-1 px-1.5 py-0.5 border border-border/60 bg-muted/30',
                      RADIUS.inline
                    )}
                  >
                    <Icon name="CheckCircle2" className="h-3 w-3 flex-shrink-0" />
                    <span className="font-medium">
                      {t('minutesFinalized', { defaultValue: 'Finalized' })}{' '}
                      {formatDate(docMinutes.minutesFinalizedAt)}
                    </span>
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Icon name="Clock" className="h-3 w-3 flex-shrink-0" />
                  <span>
                    {t('modifiedLabel')} {formatDate(document.updatedAt, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </span>
              </div>
            )}

            {!compact && !isMinutes && (
              <div
                className={cn(
                  'flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-relaxed',
                  COLORS.text.secondary
                )}
              >
                {[
                  renderOwnerMeta(),
                  totalCollaborators > 0 ? (
                    <span key="collabs">{t('collabs', { count: totalCollaborators })}</span>
                  ) : null,
                  <span key="modified">
                    {t('modifiedLabel')}{' '}
                    {formatDate(document.updatedAt, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>,
                  <span key="sections">{t('sections', { count: document.paragraphs.length })}</span>,
                  totalSuggestions > 0 ? (
                    <span key="suggestions">{t('suggestions', { count: totalSuggestions })}</span>
                  ) : null,
                ]
                  .filter(Boolean)
                  .map((item, index) => (
                    <React.Fragment key={index}>
                      {index > 0 && <span className="text-muted-foreground/50">•</span>}
                      {item}
                    </React.Fragment>
                  ))}
              </div>
            )}
          </div>
        </div>

        <div className={cn('flex-shrink-0 flex items-center gap-1', isMobile && 'self-end')}>
          {onCreateChild && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onCreateChild(document.id);
              }}
              aria-label={t('createChildDocument')}
              title={t('createChildDocument')}
            >
              <Icon name="Plus" className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(document);
            }}
          >
            {tCommon('cardActions.open')}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          'border-t border-border/60 bg-muted/10 px-4 py-2 md:px-6',
          SPACING.tight.gap
        )}
        role="region"
        aria-label={t('statusRowLabel', { defaultValue: 'Document status' })}
        onClick={(e) => e.stopPropagation()}
      >
        {expandedStatus ? (
          <>
            {isOrganizational ? (
              <div className="min-w-0 overflow-x-auto rounded border border-border/60 bg-card/50 p-2">
                <DocumentLifecycleStepper document={document} compact={false} embedInCard={false} />
              </div>
            ) : (
              <div className="rounded border border-border/60 bg-card/50 p-2">
                <DocumentStatusDisplay document={document} compact={false} />
              </div>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedStatus(false);
              }}
              className="h-8 min-w-[44px] touch-manipulation text-xs"
              aria-expanded={true}
              aria-label={t('hideStatusDetailsAria', { defaultValue: 'Hide status details' })}
            >
              <Icon name="ChevronUp" className="h-3.5 w-3.5 mr-1" aria-hidden />
              {t('hideStatusDetails', { defaultValue: 'Hide' })}
            </Button>
          </>
        ) : (
          <>
            {isOrganizational ? (
              <DocumentLifecycleCompactRow
                document={document}
                onExpandClick={() => setExpandedStatus(true)}
                expandLabel={t('showFullStatus', { defaultValue: 'Show full status' })}
                isExpanded={false}
              />
            ) : (
              <div className="flex items-center justify-between gap-2 min-w-0">
                <DocumentStatusDisplay document={document} compact={true} />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedStatus(true);
                  }}
                  className="h-8 min-w-[44px] touch-manipulation text-xs flex-shrink-0"
                  aria-expanded={false}
                  aria-label={t('showFullStatus', { defaultValue: 'Show full status' })}
                >
                  <Icon name="ChevronDown" className="h-3.5 w-3.5 mr-1" aria-hidden />
                  {t('showFullStatus', { defaultValue: 'Show full status' })}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

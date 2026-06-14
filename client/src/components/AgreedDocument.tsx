import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Document, Paragraph, VersionHistory, Organization } from "../types";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Icon } from "./ui/Icon";
import { getHeadingClass, getBodyClass, cardStyles, documentSpacing, contrastColors } from "../lib/documentStyles";
import { SPACING, COLORS, RADIUS } from "../lib/designSystem";
import { cn } from "./ui/utils";
import { logger } from '../lib/logger';
import { useTimezone } from '../hooks/useTimezone';
import { organizationsApi, documentsApi } from '../lib/api';
import { toast } from 'sonner';
import { getUserFriendlyErrorMessage } from '../utils/errorMessages';
import { MinutesDocumentView } from './MinutesDocumentView';
import { replaceHash } from '../lib/hashRoutes';


interface AgreedDocumentProps {
  document: Document;
  totalUsers: number;
  organization?: Organization | null;
  /** Canonical (accepted) vs amendment bundle preview (amended). */
  agreedViewMode?: 'accepted' | 'amended';
  onAgreedViewModeChange?: (mode: 'accepted' | 'amended') => void;
  isRepresentative?: boolean;
  /** When provided, "View vote" navigates to the organization (e.g. Dashboard) to vote on amendment request */
  onNavigateToOrganizationVotes?: (organizationId: string) => void;
}

export function AgreedDocument({
  document,
  totalUsers,
  organization,
  agreedViewMode = 'accepted',
  onAgreedViewModeChange,
  isRepresentative = false,
  onNavigateToOrganizationVotes,
}: AgreedDocumentProps) {
  const { t } = useTranslation('documents');
  const { t: tCommon } = useTranslation('common');
  const { formatDate } = useTimezone();
  const [requestingAmendment, setRequestingAmendment] = useState(false);
  const [closingAmendments, setClosingAmendments] = useState(false);
  const [showCloseConfirmDialog, setShowCloseConfirmDialog] = useState(false);
  const [hasPendingAmendmentRequest, setHasPendingAmendmentRequest] = useState(false);
  const [checkingAmendmentStatus, setCheckingAmendmentStatus] = useState(false);
  const [amendmentSummary, setAmendmentSummary] = useState<{ paragraphProposals: number; structureProposals: number; treeProposals: number } | null>(null);
  const [amendmentSummaryLoading, setAmendmentSummaryLoading] = useState(false);

  // Fetch amendment summary when document is open for amendments
  useEffect(() => {
    if (!document.id || !document.amendmentsOpen) {
      setAmendmentSummary(null);
      return;
    }
    let cancelled = false;
    setAmendmentSummaryLoading(true);
    documentsApi
      .getAmendmentSummary(document.id)
      .then((data) => {
        if (!cancelled) setAmendmentSummary(data);
      })
      .catch(() => {
        if (!cancelled) setAmendmentSummary(null);
      })
      .finally(() => {
        if (!cancelled) setAmendmentSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [document.id, document.amendmentsOpen]);

  // Deduplication: check for existing amendment request for this document
  useEffect(() => {
    if (
      !document.organizationId ||
      !document.id ||
      document.amendmentsOpen ||
      document.ownershipType !== 'organizational'
    ) {
      setHasPendingAmendmentRequest(false);
      return;
    }

    let cancelled = false;
    setCheckingAmendmentStatus(true);

    organizationsApi
      .getOrganizationVotes(document.organizationId)
      .then((res) => {
        if (cancelled) return;
        const pending = (res.votes ?? []).some(
          (v: { voteType?: string; targetDocumentId?: string; status?: string }) =>
            v.voteType === 'document_change' &&
            v.targetDocumentId === document.id &&
            ['proposed', 'approved'].includes(v.status ?? '')
        );
        setHasPendingAmendmentRequest(pending);
      })
      .catch(() => {
        if (!cancelled) setHasPendingAmendmentRequest(false);
      })
      .finally(() => {
        if (!cancelled) setCheckingAmendmentStatus(false);
      });

    return () => {
      cancelled = true;
    };
  }, [document.organizationId, document.id, document.amendmentsOpen, document.ownershipType]);

  const handleRequestAmendment = async () => {
    if (!document.organizationId || !document.id) return;
    setRequestingAmendment(true);
    try {
      await organizationsApi.createOrganizationVote(
        document.organizationId,
        `Open "${document.title}" for amendments`,
        `Request to open this document for amendment proposals. If approved, members can propose changes to the agreed content.`,
        'document_change',
        document.id
      );
      toast.success(t('amendmentRequestCreated'));
      setHasPendingAmendmentRequest(true); // Optimistic update for deduplication
    } catch (err) {
      logger.error('Failed to request amendment', err);
      toast.error(getUserFriendlyErrorMessage(err, t('failedToRequestAmendment')));
    } finally {
      setRequestingAmendment(false);
    }
  };

  const handleCloseAmendments = async () => {
    if (!document.id) return;
    setShowCloseConfirmDialog(false);
    setClosingAmendments(true);
    const loadingToast = toast.loading(t('closingAmendments'));
    try {
      const result = await documentsApi.closeAmendments(document.id);
      toast.dismiss(loadingToast);
      if (result.adoptionVoteCreated) {
        toast.success(t('amendmentsClosedAdoptionVoteCreated'));
      } else {
        toast.success(t('amendmentsClosedSuccess'));
      }
    } catch (err) {
      toast.dismiss(loadingToast);
      logger.error('Failed to close amendments', err);
      toast.error(err instanceof Error ? err.message : t('failedToCloseAmendments'));
    } finally {
      setClosingAmendments(false);
    }
  };

  // Debug logging removed - use logger if needed for debugging
  // useEffect(() => {
  //   logger.log('AgreedDocument received document update:', {
  //     documentId: document.id,
  //     paragraphCount: document.paragraphs.length,
  //     paragraphsWithHistory: document.paragraphs.filter(p => p.history && p.history.length > 0).length
  //   });
  // }, [document]);

  const sortedParagraphs = [...document.paragraphs].sort((a, b) => a.order - b.order);
  const isMinutesDocument = document.documentKind === 'meeting_minutes';

  // Only proposals that meet the acceptance threshold (with votes) appear in agreed view
  const getAllApprovedChanges = (paragraph: Paragraph) => {
    if (!paragraph.history || paragraph.history.length === 0) return [];
    const acceptanceThreshold = document.options?.acceptanceThreshold != null ? document.options.acceptanceThreshold : 75.0;
    const approvedChanges = paragraph.history
      .filter((change: VersionHistory) => {
        const approvalPct = change.approvalPercentage;
        if (approvalPct == null || Number.isNaN(approvalPct)) return false;
        const meetsThreshold = approvalPct >= acceptanceThreshold;
        // Debug logging (can be removed later)
        if (paragraph.isDocumentTitle && paragraph.history.length > 0) {
          // Debug logging removed
          // logger.debug('Title paragraph history check:', {
          //   paragraphId: paragraph.id,
          //   historyCount: paragraph.history.length,
          //   approvalPct,
          //   threshold: acceptanceThreshold,
          //   meetsThreshold,
          //   change: change
          // });
        }
        return meetsThreshold;
      });
    
    // Sort by: 1) Most votes (approvalPercentage DESC), 2) Most recent if tied (acceptedAt DESC)
    approvedChanges.sort((a: VersionHistory, b: VersionHistory) => {
      const aPct = a.approvalPercentage ?? 0;
      const bPct = b.approvalPercentage ?? 0;
      if (bPct !== aPct) {
        return bPct - aPct; // Higher approval first
      }
      // If approval is equal, most recent first
      const aDate = new Date(a.acceptedAt || a.createdAt || 0).getTime();
      const bDate = new Date(b.acceptedAt || b.createdAt || 0).getTime();
      return bDate - aDate;
    });
    
    return approvedChanges;
  };

  // Check if a paragraph has accepted changes by looking at history that meets threshold
  const hasAcceptedChanges = (paragraph: Paragraph) => {
    return getAllApprovedChanges(paragraph).length > 0;
  };

  // Winning threshold-met proposal per paragraph (amended preview prefers pending candidate)
  const getWinningProposalContent = (paragraph: Paragraph) => {
    const approvedChanges = getAllApprovedChanges(paragraph);
    if (approvedChanges.length > 0) {
      const pendingWinner =
        agreedViewMode === 'amended'
          ? approvedChanges.find(
              (c) => (c as VersionHistory & { isPending?: boolean }).isPending === true
            )
          : undefined;
      const winningChange = pendingWinner ?? approvedChanges[0];
      const text = winningChange.newText ?? winningChange.text ?? '';
      const headingLevel = winningChange.headingLevel;
      return {
        text,
        title: headingLevel ? text : undefined,
        headingLevel
      };
    }
    return null;
  };

    // Include all paragraphs with approved changes, including title paragraph (order === 1)
    const approvedParagraphs = sortedParagraphs.filter(p => hasAcceptedChanges(p));
    const hasPendingAmendments = agreedViewMode === 'amended' && approvedParagraphs.some(p => {
      const changes = getAllApprovedChanges(p);
      return (changes[0] as VersionHistory & { isPending?: boolean })?.isPending === true;
    });

    // Separate title paragraph from content paragraphs
    const titleParagraph = approvedParagraphs.find(p => p.order === 1);
    const contentParagraphs = approvedParagraphs.filter(p => p.order !== 1);
    
    // Count paragraphs with accepted changes (including title paragraph)
    const acceptedParagraphsCount = approvedParagraphs.length;
    const minutesParagraphs = sortedParagraphs.filter((paragraph) => {
      const hasTitle = typeof paragraph.title === 'string' && paragraph.title.trim().length > 0;
      const hasBody = typeof paragraph.text === 'string' && paragraph.text.trim().length > 0;
      return hasTitle || hasBody;
    });
    const displayedParagraphsCount = isMinutesDocument ? minutesParagraphs.length : approvedParagraphs.length;

  return (
    <div className={cn('min-h-screen', SPACING.layout.containPage)} role="main" aria-label={tCommon('aria.agreedDocumentView')}>
      <div className={cn('w-full max-w-full sm:max-w-3xl md:max-w-4xl lg:max-w-5xl mx-auto', documentSpacing.containerPadding, SPACING.page.top, SPACING.page.y)}>
        {/* Informational banner for agreed documents - dedicated block above content */}
        {document.status === 'agreed' && document.amendmentAdoptionVoteId && (
          <div className={cn(SPACING.section.margin, 'p-3 border', RADIUS.panel, COLORS.statusBg.info, COLORS.border.standard, SPACING.tight.gap)}>
            <p className="text-sm text-blue-800">{t('amendmentAdoptionVoteBanner')}</p>
            {onNavigateToOrganizationVotes && document.organizationId && (
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => onNavigateToOrganizationVotes(document.organizationId!)}>
                {t('viewVote')}
              </Button>
            )}
          </div>
        )}
        {document.status === 'agreed' && document.amendmentsOpen && (
          <div className={cn(SPACING.section.margin, 'p-3 border', RADIUS.panel, COLORS.statusBg.info, COLORS.border.standard, SPACING.tight.gap)}>
            <p className="text-sm text-blue-800">{t('amendmentsOpenBanner')}</p>
            {document.amendmentsOpenedAt && (
              <p className="text-xs text-blue-700 mt-1">
                {t('amendmentsOpenSince', { date: formatDate(document.amendmentsOpenedAt) })}
              </p>
            )}
            {(amendmentSummaryLoading || amendmentSummary) && (
              <p className="text-xs text-blue-700 mt-1">
                {amendmentSummaryLoading
                  ? '—'
                  : t('amendmentSummaryCounts', {
                      paragraph: amendmentSummary!.paragraphProposals,
                      structure: amendmentSummary!.structureProposals,
                      tree: amendmentSummary!.treeProposals,
                    })}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {onAgreedViewModeChange && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="agreed-view-mode"
                    checked={agreedViewMode === 'amended'}
                    onCheckedChange={(checked) => onAgreedViewModeChange(checked ? 'amended' : 'accepted')}
                  />
                  <label htmlFor="agreed-view-mode" className="text-sm text-blue-800 cursor-pointer">
                    {agreedViewMode === 'amended' ? t('agreedView.amended') : t('agreedView.accepted')}
                  </label>
                </div>
              )}
              {isRepresentative && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => hasPendingAmendments ? setShowCloseConfirmDialog(true) : handleCloseAmendments()}
                  disabled={closingAmendments}
                  className="mt-2"
                >
                  {closingAmendments ? 'Closing...' : 'Close amendments'}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className={documentSpacing.container}>

        {/* Empty State - No approved content yet */}
        {displayedParagraphsCount === 0 && (
          <div className={cn('text-center', SPACING.page.y, SPACING.content.gap)}>
            <div className="max-w-md mx-auto">
              <Icon name="FileText" className="h-16 w-16 text-muted-foreground mx-auto" />
              <h3 className="text-lg font-medium text-foreground">
                {t('noApprovedContent')}
              </h3>
              <p className="text-muted-foreground">
                {t('noApprovedContentDescription', { threshold: document.options?.acceptanceThreshold || 75 })}
              </p>
            </div>
          </div>
        )}

        {/* Paper-like Document */}
        {displayedParagraphsCount > 0 && (
          <Card className={cn(cardStyles.agreed, documentSpacing.card.document)}>
          {/* Realistic paper texture and effects */}

          <div className="absolute inset-0 pointer-events-none">
            {/* Subtle paper texture */}
            <div className="absolute inset-0 opacity-[0.015] bg-[radial-gradient(circle_at_50%_50%,rgba(0,0,0,0.1)_0%,transparent_50%)] bg-[length:20px_20px]" />

            {/* Page lines */}
            <div className="absolute inset-0 opacity-[0.03]">
              <svg width="100%" height="100%" className="absolute inset-0">
                <defs>
                  <pattern id="pageLines" patternUnits="userSpaceOnUse" width="100%" height="28">
                    <line x1="0" y1="27" x2="100%" y2="27" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#pageLines)" />
              </svg>
            </div>

            {/* Corner fold effect */}
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-transparent via-transparent to-gray-200 dark:to-gray-600 opacity-20" />
          </div>

          {/* Document Title - From Approved Paragraph History */}
          {isMinutesDocument ? (
            <div className={cn(SPACING.section.margin, 'border-b-2 border-border pb-6')}>
              <h1
                className={cn(getHeadingClass('h1', true), "text-3xl sm:text-4xl md:text-5xl", contrastColors.text.high)}
                aria-label={tCommon('aria.documentTitle')}
              >
                {document.title}
              </h1>
            </div>
          ) : titleParagraph && (() => {
            const titleContent = getWinningProposalContent(titleParagraph);
            if (titleContent && titleContent.text) {
              return (
                <div className={cn(SPACING.section.margin, 'border-b-2 border-border pb-6')}>
                  <h1 
                    className={cn(getHeadingClass('h1', true), "text-3xl sm:text-4xl md:text-5xl", contrastColors.text.high)} 
                    aria-label={tCommon('aria.documentTitle')}
                  >
                    {titleContent.text}
                  </h1>
                </div>
              );
            }
            return null;
          })()}

          {/* Document Content - Agreed State */}
          <div className={cn("relative", documentSpacing.section, contrastColors.text.high)}>
            {isMinutesDocument && document.organizationId ? (
              <MinutesDocumentView
                document={document}
                organizationId={document.organizationId}
                onNavigateToMeeting={replaceHash}
                onNavigateToHash={replaceHash}
                showDocumentChrome={false}
              />
            ) : isMinutesDocument ? null : contentParagraphs.map((paragraph, index) => {
              const approvedChanges = getAllApprovedChanges(paragraph);

              if (approvedChanges.length === 0) return null;

              // Get the highest approved change (most recent with highest approval)
              const winningChange = approvedChanges[0] as VersionHistory & { isPending?: boolean };
              const isPendingAmendment = winningChange?.isPending === true;
              
              // Handle different property names for text (new_text, newText, text)
              const displayText = winningChange.new_text ?? winningChange.newText ?? winningChange.text ?? '';
              const isHeading = winningChange.heading_level || winningChange.headingLevel;
              const headingLevel = winningChange.heading_level || winningChange.headingLevel;
              const approvalPct = winningChange.approvalPercentage ?? 0;

              // Safety check - if no text, skip this paragraph
              if (!displayText || displayText.trim() === '') {
                logger.warn('Winning change has no text:', winningChange);
                return null;
              }

              // Render as normal document content, not discussion format
              if (isHeading && headingLevel) {
                // Heading from winning proposal
                // Ensure headingLevel is a number (handle cases where it might be "h1" or already a number)
                const level = typeof headingLevel === 'string' && headingLevel.startsWith('h') 
                  ? parseInt(headingLevel.substring(1), 10) 
                  : parseInt(String(headingLevel), 10);
                const validLevel = (level >= 1 && level <= 6) ? level : 1; // Default to h1 if invalid
                
                return (
                  <div key={paragraph.id} className={cn('group flex items-start', SPACING.content.inline, 'mb-4')}>
                    <div className="flex-1">
                      {React.createElement(
                        `h${validLevel}`,
                        { 
                          className: cn(
                            getHeadingClass(validLevel),
                            "leading-tight whitespace-pre-wrap",
                            contrastColors.text.high
                          )
                        },
                        displayText.trim()
                      )}
                    </div>
                    {/* Optional metadata for transparency - shown on hover (desktop only) */}
                    <div className="hidden md:flex items-center gap-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 pt-1" aria-label={isPendingAmendment ? tCommon('agreedDocument.pendingAmendment') : tCommon('agreedDocument.approvedWithConsensus', { pct: approvalPct.toFixed(0) })}>
                      {isPendingAmendment ? (
                        <span className={contrastColors.text.low}>{tCommon('agreedDocument.pendingAmendment')}</span>
                      ) : (
                        <>
                          <Icon name="CheckCircle2" className={cn('h-3 w-3', COLORS.status.success)} aria-hidden="true" />
                          <span className={contrastColors.text.low}>{tCommon('agreedDocument.approvedWithConsensus', { pct: approvalPct.toFixed(0) })}</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              }

              // Regular paragraph from winning proposal
              return (
                <div key={paragraph.id} className={cn('group flex items-start', SPACING.content.inline, SPACING.section.margin)}>
                  <p className={cn("flex-1", getBodyClass(true), contrastColors.text.medium)}>
                    {displayText.trim()}
                  </p>
                  {/* Optional metadata for transparency - shown on hover (desktop only) */}
                  <div className="hidden md:flex items-center gap-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 pt-1" aria-label={isPendingAmendment ? tCommon('agreedDocument.pendingAmendment') : tCommon('agreedDocument.approvedWithConsensus', { pct: approvalPct.toFixed(0) })}>
                    {isPendingAmendment ? (
                      <span className={contrastColors.text.low}>{tCommon('agreedDocument.pendingAmendment')}</span>
                    ) : (
                      <>
                        <Icon name="CheckCircle2" className={cn('h-3 w-3', COLORS.status.success)} aria-hidden="true" />
                        <span className={contrastColors.text.low}>{tCommon('agreedDocument.approvedWithConsensus', { pct: approvalPct.toFixed(0) })}</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Document Footer - responsive layout */}
          <footer className="mt-8 sm:mt-12 md:mt-16 pt-6 sm:pt-8 border-t-2 border-border" aria-label={tCommon('aria.documentMetadata')}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm text-muted-foreground">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
                <span className="flex items-center gap-1">
                  <Icon name="FileText" className="h-4 w-4" />
                  {isMinutesDocument ? minutesParagraphs.length : contentParagraphs.length} approved sections
                </span>
                <span className="flex items-center gap-1">
                  <Icon name="CheckCircle2" className={cn('h-4 w-4', COLORS.status.success)} />
                  {isMinutesDocument ? minutesParagraphs.length : acceptedParagraphsCount} collaboratively modified
                </span>
              </div>
              <div className="text-left sm:text-right">
                <p className="font-medium">Collaborative Drafting Platform</p>
                <p>Generated on {formatDate(new Date())}</p>
              </div>
            </div>
            {/* Request Amendment Process - at bottom of document, any member can request */}
            {document.status === 'agreed' && !document.amendmentsOpen && document.ownershipType === 'organizational' && document.organizationId && (
              <div className="mt-6 pt-6 border-t border-border">
                {hasPendingAmendmentRequest ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Icon name="Clock" className="h-4 w-4 shrink-0" />
                    <span>{t('amendmentVoteInProgress')}</span>
                    {onNavigateToOrganizationVotes && (
                      <Button variant="link" size="sm" onClick={() => onNavigateToOrganizationVotes(document.organizationId!)} className="h-auto p-0">
                        {t('viewVote')}
                      </Button>
                    )}
                  </div>
                ) : checkingAmendmentStatus ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="h-4 w-20 animate-pulse rounded bg-muted" aria-hidden />
                    <span>{t('checkingAmendmentStatus')}</span>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRequestAmendment}
                    disabled={requestingAmendment}
                  >
                    {requestingAmendment ? t('requestingAmendment') : t('requestAmendmentProcess')}
                  </Button>
                )}
              </div>
            )}
          </footer>
        </Card>
        )}
        </div>
      </div>

      <AlertDialog open={showCloseConfirmDialog} onOpenChange={setShowCloseConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('closeAmendmentsTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {amendmentSummary &&
              amendmentSummary.paragraphProposals + amendmentSummary.structureProposals + amendmentSummary.treeProposals > 0
                ? t('closeAmendmentsConfirmWithAdoptionVote', {
                    count:
                      amendmentSummary.paragraphProposals +
                      amendmentSummary.structureProposals +
                      amendmentSummary.treeProposals,
                  })
                : t('closeAmendmentsConfirmEmpty')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={closingAmendments}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCloseAmendments} disabled={closingAmendments}>
              Close amendments
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

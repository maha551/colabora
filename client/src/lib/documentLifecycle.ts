/**
 * Single source of truth for document adoption lifecycle and amendment window UI.
 */

import { Document, DocumentApiResponse } from '../types';
import { COLORS } from './designSystem';
import { cn } from '../components/ui/utils';

export type StepState = 'completed' | 'current' | 'upcoming' | 'info';

export interface StepConfig {
  id: string;
  label: string;
  state: StepState;
  dateLines: string[];
  pearlClassName: string;
  iconName: string;
}

export type TFunctionLifecycle = (key: string, options?: Record<string, unknown>) => string;

export type AdoptionPhase = 'draft' | 'proposal' | 'voting' | 'adopted' | 'rejected' | 'expired';

export type AmendmentSubState =
  | 'closed'
  | 'open'
  | 'open_with_candidates'
  | 'adoption_vote_pending';

export type DerivedStatusFilter =
  | 'all'
  | NonNullable<Document['status']>
  | 'amendments_open'
  | 'amendments_closed'
  | 'amendment_adoption_pending';

function getDocumentProperty<T>(
  doc: Document | DocumentApiResponse,
  camelCase: keyof Document,
  snakeCase: string
): T | undefined {
  const value = doc[camelCase];
  if (value !== undefined && value !== null) return value as T;
  const apiDoc = doc as Record<string, unknown>;
  return apiDoc[snakeCase] as T | undefined;
}

export function getAdoptionPhase(doc: Document | DocumentApiResponse | null | undefined): AdoptionPhase {
  if (!doc) return 'draft';
  const status = (doc as Document).status ?? 'draft';
  if (status === 'agreed') return 'adopted';
  if (status === 'proposal' || status === 'voting' || status === 'rejected' || status === 'expired') {
    return status;
  }
  return 'draft';
}

export function getAmendmentSubState(
  doc: Document | DocumentApiResponse | null | undefined,
  candidateCount = 0
): AmendmentSubState | null {
  if (!doc || getAdoptionPhase(doc) !== 'adopted') return null;
  const adoptionVoteId = getDocumentProperty<string>(doc, 'amendmentAdoptionVoteId', 'amendment_adoption_vote_id');
  if (adoptionVoteId) return 'adoption_vote_pending';
  const amendmentsOpen =
    (doc as Document).amendmentsOpen === true ||
    (doc as Record<string, unknown>).amendments_open === 1 ||
    (doc as Record<string, unknown>).amendments_open === true;
  if (amendmentsOpen) {
    return candidateCount > 0 ? 'open_with_candidates' : 'open';
  }
  return 'closed';
}

/** Document is in read-only agreed view (discussion hidden). */
export function isDocumentReadOnly(doc: Document | null | undefined): boolean {
  if (!doc) return false;
  if (doc.status === 'rejected') return true;
  if (doc.status === 'agreed' && !doc.amendmentsOpen) return true;
  return false;
}

/** Alias used by existing tab logic. */
export function isDocumentFinalized(doc: Document | null | undefined): boolean {
  return isDocumentReadOnly(doc);
}

export function isAmendmentEditingAllowed(doc: Document | null | undefined): boolean {
  if (!doc || doc.status !== 'agreed') return false;
  return !!doc.amendmentsOpen && !doc.amendmentAdoptionVoteId;
}

export function matchesStatusFilter(
  doc: Document,
  filter: DerivedStatusFilter
): boolean {
  if (filter === 'all') return true;
  if (filter === 'amendments_open') {
    return doc.status === 'agreed' && !!doc.amendmentsOpen && !doc.amendmentAdoptionVoteId;
  }
  if (filter === 'amendments_closed') {
    return doc.status === 'agreed' && !doc.amendmentsOpen && !doc.amendmentAdoptionVoteId;
  }
  if (filter === 'amendment_adoption_pending') {
    return doc.status === 'agreed' && !!doc.amendmentAdoptionVoteId;
  }
  return (doc.status || 'draft') === filter;
}

export interface StatusPresentation {
  primaryLabel: string;
  label: string;
  subtitle?: string;
  description: string;
  iconName: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export interface StatusPresentationOptions {
  formatRelativeTime?: (date: string) => string;
}

export function getStatusPresentation(
  doc: Document | DocumentApiResponse | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string = (k) => k,
  options: StatusPresentationOptions = {}
): StatusPresentation | null {
  if (!doc) return null;
  const phase = getAdoptionPhase(doc);
  const amendState = getAmendmentSubState(doc);
  const formatRelative = options.formatRelativeTime ?? (() => '');

  const base = {
    color: COLORS.text.secondary,
    bgColor: COLORS.bg.muted,
    borderColor: COLORS.border.standard,
    description: '',
  };

  switch (phase) {
    case 'proposal': {
      const deadline = getDocumentProperty<string>(doc, 'proposalDeadline', 'proposal_deadline');
      return {
        ...base,
        primaryLabel: t('lifecycleStepper.proposal'),
        label: t('lifecycleStepper.proposal'),
        description: deadline
          ? t('status.proposalEnds', { time: formatRelative(deadline), defaultValue: `Voting starts ${formatRelative(deadline)}` })
          : t('status.proposalAwaiting', { defaultValue: 'Awaiting voting period' }),
        iconName: 'Hourglass',
        color: COLORS.status.info,
        bgColor: COLORS.statusBg.info,
        borderColor: 'border-[var(--status-active-border)]',
      };
    }
    case 'voting': {
      const deadline = getDocumentProperty<string>(doc, 'votingDeadline', 'voting_deadline');
      return {
        ...base,
        primaryLabel: t('lifecycleStepper.voting'),
        label: t('lifecycleStepper.voting'),
        description: deadline
          ? t('status.votingEnds', { time: formatRelative(deadline), defaultValue: `Ends ${formatRelative(deadline)}` })
          : t('status.votingInProgress', { defaultValue: 'Voting in progress' }),
        iconName: 'Vote',
        color: COLORS.status.success,
        bgColor: COLORS.statusBg.success,
        borderColor: 'border-[var(--status-approved-border)]',
      };
    }
    case 'adopted': {
      let subtitle: string | undefined;
      let description: string;
      if (amendState === 'open' || amendState === 'open_with_candidates') {
        subtitle = t('lifecycleStepper.amendmentsOpen');
        description = t('status.amendmentsOpenDescription', { defaultValue: 'Document is open for amendment proposals' });
      } else if (amendState === 'adoption_vote_pending') {
        subtitle = t('lifecycleStepper.amendmentAdoptionVote');
        description = t('status.amendmentAdoptionVoteDescription', {
          defaultValue: 'Organization vote in progress to adopt amendment package',
        });
      } else {
        subtitle = t('lifecycleStepper.amendmentsClosed');
        description = t('status.adoptedDescription', { defaultValue: 'Canonical adopted version' });
      }
      return {
        primaryLabel: t('lifecycleStepper.adopted'),
        label: t('lifecycleStepper.adopted'),
        subtitle,
        description,
        iconName:
          amendState === 'adoption_vote_pending'
            ? 'Vote'
            : amendState === 'open' || amendState === 'open_with_candidates'
              ? 'FileEdit'
              : 'CheckCircle2',
        color: COLORS.status.success,
        bgColor: COLORS.statusBg.success,
        borderColor: 'border-[var(--status-approved-border)]',
      };
    }
    case 'rejected':
      return {
        ...base,
        primaryLabel: t('lifecycleStepper.rejected'),
        label: t('lifecycleStepper.rejected'),
        description: t('status.rejectedDescription', { defaultValue: 'Document was not approved' }),
        iconName: 'XCircle',
        color: COLORS.status.error,
        bgColor: COLORS.statusBg.error,
        borderColor: 'border-[var(--status-rejected-border)]',
      };
    case 'expired':
      return {
        ...base,
        primaryLabel: t('lifecycleStepper.expired'),
        label: t('lifecycleStepper.expired'),
        description: t('status.expiredDescription', { defaultValue: 'Proposal period ended without sufficient activity' }),
        iconName: 'Clock',
        color: COLORS.text.secondary,
        bgColor: COLORS.bg.muted,
        borderColor: COLORS.border.standard,
      };
    default:
      return {
        ...base,
        primaryLabel: t('status.draft', { defaultValue: 'Draft' }),
        label: t('status.draft', { defaultValue: 'Draft' }),
        description: t('status.draftDescription', { defaultValue: 'Document is being prepared' }),
        iconName: 'FileText',
        color: COLORS.text.secondary,
        bgColor: COLORS.bg.muted,
        borderColor: COLORS.border.standard,
      };
  }
}

export function getLifecycleSteps(
  doc: Document | DocumentApiResponse,
  t: TFunctionLifecycle,
  formatDateFn: (date: string) => string,
  candidateCount = 0
): StepConfig[] {
  if (!doc || (doc as Document).ownershipType !== 'organizational') return [];
  if ((doc as Document & { documentKind?: string }).documentKind === 'meeting_minutes') return [];

  const status = (doc as Document).status ?? 'draft';
  const proposalDeadline = getDocumentProperty<string>(doc, 'proposalDeadline', 'proposal_deadline');
  const proposalEndedAt = getDocumentProperty<string>(doc, 'proposalEndedAt', 'proposal_ended_at');
  const paragraphProposalsCutoff = getDocumentProperty<string>(doc, 'paragraphProposalsCutoff', 'paragraph_proposals_cutoff');
  const votingDeadline = getDocumentProperty<string>(doc, 'votingDeadline', 'voting_deadline');
  const votingEndedAt = getDocumentProperty<string>(doc, 'votingEndedAt', 'voting_ended_at');
  const votingStartedAt = getDocumentProperty<string>(doc, 'votingStartedAt', 'voting_started_at');
  const adoptedAt = getDocumentProperty<string>(doc, 'adoptedAt', 'adopted_at');
  const amendmentsClosedAt = getDocumentProperty<string>(doc, 'amendmentsClosedAt', 'amendments_closed_at');
  const amendmentsOpenedAt =
    getDocumentProperty<string>(doc, 'amendmentsOpenedAt', 'amendments_opened_at') ??
    (doc as Document).amendmentsOpenedAt;
  const amendmentAdoptionVoteId = getDocumentProperty<string>(doc, 'amendmentAdoptionVoteId', 'amendment_adoption_vote_id');

  const isProposal = status === 'proposal';
  const isVoting = status === 'voting';
  const isAgreed = status === 'agreed';
  const isRejected = status === 'rejected';
  const isExpired = status === 'expired';
  const isOutcome = isAgreed || isRejected || isExpired;
  const amendmentsOpen =
    (doc as Document).amendmentsOpen === true ||
    (doc as Record<string, unknown>).amendments_open === true;

  const step1: StepConfig = {
    id: 'proposal',
    label: t('lifecycleStepper.proposal'),
    state: isProposal ? 'current' : isVoting || isOutcome ? 'completed' : 'upcoming',
    dateLines: [],
    pearlClassName: isProposal ? COLORS.statusBadge.info : cn(COLORS.bg.muted, 'border', COLORS.border.standard),
    iconName: 'Hourglass',
  };
  if (proposalEndedAt) {
    step1.dateLines.push(t('lifecycleStepper.ended', { date: formatDateFn(proposalEndedAt) }));
  } else if (proposalDeadline && isProposal) {
    step1.dateLines.push(t('lifecycleStepper.ends', { date: formatDateFn(proposalDeadline) }));
  }
  if (isProposal && paragraphProposalsCutoff) {
    step1.dateLines.push(t('lifecycleStepper.proposalsLockedAfter', { date: formatDateFn(paragraphProposalsCutoff) }));
  }

  const step2: StepConfig = {
    id: 'voting',
    label: t('lifecycleStepper.voting'),
    state: isVoting ? 'current' : isOutcome ? 'completed' : 'upcoming',
    dateLines: [],
    pearlClassName: isVoting ? COLORS.statusBadge.success : cn(COLORS.bg.muted, 'border', COLORS.border.standard),
    iconName: 'Vote',
  };
  const votingStart = votingStartedAt || proposalDeadline;
  if (votingEndedAt) {
    if (votingStart) step2.dateLines.push(t('lifecycleStepper.starts', { date: formatDateFn(votingStart) }));
    step2.dateLines.push(t('lifecycleStepper.ended', { date: formatDateFn(votingEndedAt) }));
  } else {
    if (votingStart) step2.dateLines.push(t('lifecycleStepper.starts', { date: formatDateFn(votingStart) }));
    if (votingDeadline) step2.dateLines.push(t('lifecycleStepper.ends', { date: formatDateFn(votingDeadline) }));
  }

  const outcomeLabel = isAgreed
    ? t('lifecycleStepper.adopted')
    : isRejected
      ? t('lifecycleStepper.rejected')
      : t('lifecycleStepper.expired');
  const outcomePearlClass = isAgreed
    ? COLORS.statusBadge.success
    : isRejected
      ? COLORS.statusBadge.error
      : cn(COLORS.bg.muted, COLORS.text.primary, 'border', COLORS.border.standard);

  const step3: StepConfig = {
    id: 'outcome',
    label: outcomeLabel,
    state: isAgreed ? 'current' : isOutcome ? 'current' : 'upcoming',
    dateLines: [],
    pearlClassName: isOutcome ? outcomePearlClass : cn(COLORS.bg.muted, 'border', COLORS.border.standard),
    iconName: isAgreed ? 'CheckCircle2' : isRejected ? 'XCircle' : 'Clock',
  };
  if (isAgreed && adoptedAt) {
    step3.dateLines.push(t('lifecycleStepper.adoptedOn', { date: formatDateFn(adoptedAt) }));
  } else if (votingDeadline && !isOutcome) {
    step3.dateLines.push(t('lifecycleStepper.after', { date: formatDateFn(votingDeadline) }));
  }

  let step4Label = t('lifecycleStepper.na');
  if (isAgreed) {
    if (amendmentAdoptionVoteId) {
      step4Label = t('lifecycleStepper.amendmentAdoptionVote');
    } else if (amendmentsOpen) {
      step4Label =
        candidateCount > 0
          ? t('lifecycleStepper.amendmentsOpenWithCount', { count: candidateCount })
          : t('lifecycleStepper.amendmentsOpen');
    } else {
      step4Label = t('lifecycleStepper.amendmentsClosed');
    }
  }

  const step4: StepConfig = {
    id: 'amendments',
    label: step4Label,
    state: 'info',
    dateLines: [],
    pearlClassName: cn(COLORS.bg.muted, 'border', COLORS.border.standard),
    iconName: amendmentAdoptionVoteId ? 'Vote' : amendmentsOpen ? 'FileEdit' : 'Lock',
  };
  if (isAgreed && !amendmentAdoptionVoteId && amendmentsOpen && amendmentsOpenedAt) {
    step4.dateLines.push(t('lifecycleStepper.openSince', { date: formatDateFn(amendmentsOpenedAt) }));
  } else if (isAgreed && !amendmentsOpen && amendmentsClosedAt) {
    step4.dateLines.push(t('lifecycleStepper.closedSince', { date: formatDateFn(amendmentsClosedAt) }));
  }

  return [step1, step2, step3, step4];
}

/** Primary step for compact row: adoption chain current step (not step 4 info). */
export function getPrimaryLifecycleStep(
  doc: Document | DocumentApiResponse,
  t: TFunctionLifecycle,
  formatDateFn: (date: string) => string,
  candidateCount = 0
): StepConfig | undefined {
  const steps = getLifecycleSteps(doc, t, formatDateFn, candidateCount);
  const adoptionCurrent = steps.find((s) => s.state === 'current' && s.id !== 'amendments');
  if (adoptionCurrent) return adoptionCurrent;
  return steps[2] ?? steps[0];
}

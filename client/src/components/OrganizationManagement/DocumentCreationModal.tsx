import React, { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Icon } from '../ui/Icon';
import { Organization, OrganizationGovernanceRules, DocumentPositionContext } from '../../types';
import { documentsApi, ApiError } from '../../lib/api';
import { toast } from 'sonner';
import { getDocumentErrorMessage, extractFieldErrors } from '../../lib/documentErrors';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Badge } from '../ui/badge';
import { logger } from '../../lib/logger';
import { COLORS, RADIUS } from '../../lib/designSystem';
import { cn } from '../ui/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';

/** Options passed to onCreateDocument callback (position in tree). */
export interface CreateDocumentOptions {
  parentId?: string;
  positionType?: 'root' | 'child' | 'above_sibling' | 'below_sibling';
  referenceDocumentId?: string;
}

interface DocumentCreationModalProps {
  organization: Organization;
  governanceRules: OrganizationGovernanceRules | null;
  isOpen?: boolean;
  onClose: () => void;
  onSuccess: () => void;
  parentId?: string;
  positionContext?: DocumentPositionContext | null;
  /** When provided, modal uses this instead of calling documentsApi directly (avoids duplicate refresh/toast). */
  onCreateDocument?: (title: string, description?: string, options?: CreateDocumentOptions) => Promise<void>;
  /** When 'inline', renders as a Card in the page flow (no Dialog). Omit or use 'modal' for overlay. */
  variant?: 'modal' | 'inline';
}

interface DocumentCreationFormProps {
  organization: Organization;
  governanceRules: OrganizationGovernanceRules | null;
  onClose: () => void;
  onSuccess: () => void;
  parentId?: string;
  positionContext?: DocumentPositionContext | null;
  isOpen?: boolean;
  onCreateDocument?: (title: string, description?: string, options?: CreateDocumentOptions) => Promise<void>;
}

function OrganizationDocumentCreationForm({
  organization,
  governanceRules,
  onClose,
  onSuccess,
  parentId,
  positionContext,
  isOpen = true,
  onCreateDocument,
}: DocumentCreationFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [acceptanceThreshold, setAcceptanceThreshold] = useState(75);
  const [votingAnonymous, setVotingAnonymous] = useState(false);
  const [votingAnonymityLocked, setVotingAnonymityLocked] = useState(false);
  const [voteChangeAllowed, setVoteChangeAllowed] = useState(true);
  const [structureProposalsEnabled, setStructureProposalsEnabled] = useState(true);
  const { t } = useTranslation('documents');
  const { t: tGov } = useTranslation('governance');

  useEffect(() => {
    if (isOpen) {
      setFieldErrors({});
      if (governanceRules) {
        setAcceptanceThreshold(governanceRules.defaultAcceptanceThreshold || 75);
        setVotingAnonymous(governanceRules.anonymousVotingEnabled ?? false);
        setVoteChangeAllowed(governanceRules.voteChangeAllowed ?? true);
        setStructureProposalsEnabled(governanceRules.defaultStructureProposalsEnabled ?? true);
        setVotingAnonymityLocked(governanceRules.defaultVotingAnonymityLocked ?? false);
      } else {
        setAcceptanceThreshold(75);
        setVotingAnonymous(false);
        setVoteChangeAllowed(true);
        setStructureProposalsEnabled(true);
        setVotingAnonymityLocked(false);
      }
    }
  }, [isOpen, governanceRules]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    if (!title.trim()) {
      const titleError = t('dashboard.pleaseEnterTitle');
      setFieldErrors({ title: titleError });
      toast.error(titleError);
      return;
    }
    if (positionContext) {
      const positionType = positionContext.positionType;
      if (positionType !== 'root' && !positionContext.referenceDocumentId) {
        setFieldErrors({ positionContext: 'Reference document is required for this position type' });
        toast.error('Please select a reference document for this position');
        return;
      }
    }
    setIsSubmitting(true);
    try {
      const options: { positionType?: 'root' | 'child' | 'above_sibling' | 'below_sibling'; referenceDocumentId?: string } = {};
      let documentParentId: string | undefined = undefined;
      if (positionContext) {
        options.positionType = positionContext.positionType;
        if (positionContext.referenceDocumentId) options.referenceDocumentId = positionContext.referenceDocumentId;
        if (positionContext.positionType === 'child' && positionContext.referenceDocumentId) documentParentId = positionContext.referenceDocumentId;
        else if (positionContext.positionType === 'root') documentParentId = undefined;
      } else if (parentId) documentParentId = parentId;
      const finalOptions = Object.keys(options).length > 0 ? options : undefined;
      if (!organization?.id || organization.id.trim() === '') {
        logger.error('Organization ID is missing or empty', { organization, hasOrganization: !!organization, organizationId: organization?.id });
        setFieldErrors({ organizationId: 'Organization ID is required' });
        toast.error('Invalid organization. Please refresh the page and try again.');
        return;
      }
      const optionsWithParent = documentParentId ? { ...finalOptions, parentId: documentParentId } : finalOptions;
      if (onCreateDocument) {
        await onCreateDocument(title.trim(), description.trim() || undefined, optionsWithParent);
        onSuccess();
        handleClose();
        return;
      }
      await documentsApi.createDocument(title.trim(), description.trim() || undefined, undefined, optionsWithParent, 'organizational', organization.id);
      toast.success(t('dashboard.documentCreated'));
      onSuccess();
      handleClose();
    } catch (error: unknown) {
      logger.error('Failed to create document:', error);
      const newFieldErrors = extractFieldErrors(error);
      setFieldErrors(newFieldErrors);
      let errorMessage = t('dashboard.failedToCreate');
      if (error instanceof ApiError && error.code) errorMessage = getDocumentErrorMessage(error.code, errorMessage);
      else if (error && typeof error === 'object') {
        const errorObj = error as { code?: string; message?: string; error?: string };
        if (errorObj.code) errorMessage = getDocumentErrorMessage(errorObj.code, errorMessage);
        else if (errorObj.message) errorMessage = errorObj.message;
        else if (errorObj.error) errorMessage = errorObj.error;
      }
      if (Object.keys(newFieldErrors).length === 0) toast.error(errorMessage);
      else toast.error(tGov('pleaseFixErrors'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setAcceptanceThreshold(75);
    setVotingAnonymous(false);
    setVotingAnonymityLocked(false);
    setVoteChangeAllowed(true);
    setStructureProposalsEnabled(true);
    setIsSubmitting(false);
    setIsOptionsOpen(false);
    setFieldErrors({});
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="space-y-8 overflow-y-auto flex-1 min-h-0 pr-2">
          <div className={cn("space-y-2 bg-muted p-4 border border-border", RADIUS.panel)}>
            <Label htmlFor="document-title" className="text-sm font-semibold">{t('createDialog.documentTitle')}</Label>
            <Input id="document-title" placeholder={t('createDialog.placeholderTitle')} value={title} onChange={(e) => { setTitle(e.target.value); if (fieldErrors.title) setFieldErrors(prev => { const next = { ...prev }; delete next.title; return next; }); }} className={cn('bg-card', fieldErrors.title && 'border-[var(--status-rejected-solid)] focus:border-[var(--status-rejected-solid)] focus:ring-[var(--status-rejected-solid)]')} autoFocus />
            {fieldErrors.title && <p className={cn('text-sm mt-1', COLORS.status.error)}>{fieldErrors.title}</p>}
          </div>
          <div className={cn("space-y-2 bg-muted p-4 border border-border", RADIUS.panel)}>
            <Label htmlFor="document-description" className="text-sm font-semibold">{t('createDialog.descriptionLabel')} <span className="text-muted-foreground text-xs font-normal">{t('createDialog.optional')}</span></Label>
            <Textarea id="document-description" placeholder={t('createDialog.descriptionPlaceholderOrg')} value={description} onChange={(e) => { setDescription(e.target.value); if (fieldErrors.description) setFieldErrors(prev => { const next = { ...prev }; delete next.description; return next; }); }} rows={3} className={cn('bg-card resize-none', fieldErrors.description && 'border-[var(--status-rejected-solid)] focus:border-[var(--status-rejected-solid)] focus:ring-[var(--status-rejected-solid)]')} />
            {fieldErrors.description && <p className={cn('text-sm mt-1', COLORS.status.error)}>{fieldErrors.description}</p>}
            {!fieldErrors.description && description.length > 0 && <p className="text-xs text-muted-foreground mt-1">{description.length} characters</p>}
          </div>
          <Collapsible open={isOptionsOpen} onOpenChange={setIsOptionsOpen}>
            <Card className="border-border">
              <CollapsibleTrigger asChild>
                <CardHeader className="pb-3 cursor-pointer hover:bg-muted transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon name="Settings" className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-base">Document Options</CardTitle>
                    </div>
                    {isOptionsOpen ? <Icon name="ChevronUp" className="h-4 w-4 text-muted-foreground" /> : <Icon name="ChevronDown" className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <CardDescription className="text-left mt-2">These settings are determined by your organization&apos;s governance rules and cannot be changed.</CardDescription>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-4 pt-0">
                  <TooltipProvider>
                    <div className="grid grid-cols-1 gap-3">
                      <div className={cn("flex items-center justify-between p-3 bg-muted border border-border", RADIUS.panel)}>
                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-medium">Acceptance Threshold</Label>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className={cn("inline-flex shrink-0 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", RADIUS.inline)} aria-label={t('tooltips.acceptanceThresholdHelp')}>
                                <Icon name="Info" className="h-3 w-3 cursor-help" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent><p className="text-xs">{t('tooltips.acceptanceThreshold')}</p></TooltipContent>
                          </Tooltip>
                        </div>
                        <Badge variant="secondary" className="font-semibold">{acceptanceThreshold}%</Badge>
                      </div>
                      <div className={cn("flex items-center justify-between p-3 bg-muted border border-border", RADIUS.panel)}>
                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-medium">Voting Anonymity</Label>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className={cn("inline-flex shrink-0 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", RADIUS.inline)} aria-label={t('tooltips.votingAnonymityHelp')}>
                                <Icon name="Info" className="h-3 w-3 cursor-help" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent><p className="text-xs">{votingAnonymous ? t('tooltips.votingAnonymityAnonymous') : t('tooltips.votingAnonymityPublic')}</p></TooltipContent>
                          </Tooltip>
                        </div>
                        <Badge variant="secondary" className="font-semibold">{votingAnonymous ? 'Anonymous' : 'Public'}</Badge>
                      </div>
                      <div className={cn("flex items-center justify-between p-3 bg-muted border border-border", RADIUS.panel)}>
                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-medium">Vote Flexibility</Label>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className={cn("inline-flex shrink-0 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", RADIUS.inline)} aria-label={t('tooltips.voteFlexibilityHelp')}>
                                <Icon name="Info" className="h-3 w-3 cursor-help" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent><p className="text-xs">{voteChangeAllowed ? t('tooltips.voteFlexibilityChangeAllowed') : t('tooltips.voteFlexibilityLocked')}</p></TooltipContent>
                          </Tooltip>
                        </div>
                        <Badge variant="secondary" className="font-semibold">{voteChangeAllowed ? 'Flexible' : 'Locked'}</Badge>
                      </div>
                      <div className={cn("flex items-center justify-between p-3 bg-muted border border-border", RADIUS.panel)}>
                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-medium">Structure Proposals</Label>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className={cn("inline-flex shrink-0 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", RADIUS.inline)} aria-label={t('tooltips.structureProposalsHelp')}>
                                <Icon name="Info" className="h-3 w-3 cursor-help" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent><p className="text-xs">{t('tooltips.structureProposalsOrg')}</p></TooltipContent>
                          </Tooltip>
                        </div>
                        <Badge variant={structureProposalsEnabled ? "default" : "secondary"} className="font-semibold">{structureProposalsEnabled ? 'Enabled' : 'Disabled'}</Badge>
                      </div>
                    </div>
                  </TooltipProvider>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
          {positionContext && (
            <Card className={cn('border-[var(--status-approved-border)]', COLORS.statusBg.success)}>
              <CardContent className="p-4">
                <h4 className={cn('font-medium mb-2 flex items-center gap-2', COLORS.status.success)}><Icon name="FileText" className="h-4 w-4" />{t('createDialog.positionTitle')}</h4>
                <p className={cn('text-sm', COLORS.status.success)}>
                  {positionContext.positionType === 'root' && t('createDialog.positionRoot')}
                  {positionContext.positionType === 'child' && (
                    <Trans
                      i18nKey="documents:createDialog.positionChild"
                      values={{ title: positionContext.referenceDocumentTitle }}
                      components={{ strong: <strong /> }}
                    />
                  )}
                  {positionContext.positionType === 'above_sibling' && (
                    <Trans
                      i18nKey="documents:createDialog.positionAboveSibling"
                      values={{ title: positionContext.referenceDocumentTitle }}
                      components={{ strong: <strong /> }}
                    />
                  )}
                  {positionContext.positionType === 'below_sibling' && (
                    <Trans
                      i18nKey="documents:createDialog.positionBelowSibling"
                      values={{ title: positionContext.referenceDocumentTitle }}
                      components={{ strong: <strong /> }}
                    />
                  )}
                </p>
              </CardContent>
            </Card>
          )}
          <Card className={cn('border-[var(--status-active-border)]', COLORS.statusBg.info)}>
            <CardContent className="p-4">
              <h4 className={cn('font-medium mb-2 flex items-center gap-2', COLORS.status.info)}><Icon name="FileText" className="h-4 w-4" />{t('createDialog.orgDocumentTitle')}</h4>
              <p className={cn('text-sm mb-2', COLORS.status.info)}>{t('createDialog.orgDocumentDescription')}</p>
              <div className={cn('text-xs space-y-1', COLORS.status.info)}>
                <p>• {t('createDialog.orgDocumentBulletMembers')}</p>
                <p>• {t('createDialog.orgDocumentBulletProposal')}</p>
                {(parentId || positionContext?.positionType === 'child') && <p>• {t('createDialog.orgDocumentBulletChild')}</p>}
                <p>• {t('createDialog.orgDocumentBulletSettings')}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-6 border-t mt-6 flex-shrink-0">
        <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting} className="min-w-[100px]">{t('createDialog.cancel')}</Button>
        <Button type="submit" variant="default" disabled={isSubmitting || !title.trim()} className="gap-2 min-w-[140px] bg-primary text-primary-foreground hover:bg-primary/90">
          {isSubmitting ? (<><div className={cn("animate-spin h-4 w-4 border-b-2 border-current", RADIUS.pill)}></div>{t('createDialog.creating')}</>) : (<><Icon name="Plus" className="h-4 w-4" />{t('createDialog.create')}</>)}
        </Button>
      </div>
    </form>
  );
}

export function DocumentCreationModal({
  organization,
  governanceRules,
  isOpen = true,
  onClose,
  onSuccess,
  parentId,
  positionContext,
  onCreateDocument,
  variant = 'modal',
}: DocumentCreationModalProps) {
  const { t } = useTranslation('documents');
  const formProps = { organization, governanceRules, onClose, onSuccess, parentId, positionContext, onCreateDocument };

  if (variant === 'inline') {
    return (
      <Card className="border-2 border-border bg-card animate-in slide-in-from-top-2 duration-200 flex flex-col">
        <CardHeader className="pb-4 flex-shrink-0">
          <CardTitle className="text-lg font-bold text-foreground">{t('createDialog.title')}</CardTitle>
          <CardDescription>
            Create a new organizational document. It will start as a proposal and require voting approval from organization members before becoming active.
          </CardDescription>
        </CardHeader>
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <OrganizationDocumentCreationForm {...formProps} isOpen={true} />
        </div>
      </Card>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex flex-col flex-1 min-h-0 max-h-[85vh] overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Icon name="Plus" className="h-5 w-5" />
              {t('createDialog.title')}
            </DialogTitle>
            <DialogDescription className="text-base">
              Create a new organizational document. It will start as a proposal and require voting approval from organization members before becoming active.
            </DialogDescription>
          </DialogHeader>
          <OrganizationDocumentCreationForm {...formProps} isOpen={isOpen} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

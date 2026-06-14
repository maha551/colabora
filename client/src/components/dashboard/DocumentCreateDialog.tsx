import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { Icon } from '../ui/Icon';
import { Checkbox } from '../ui/checkbox';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { getDocumentErrorMessage } from '../../lib/documentErrors';
import { ApiError } from '../../lib/api';
import { logger } from '../../lib/logger';
import { toast } from 'sonner';
import type { User, Organization } from '../../types';
import { RADIUS } from '../../lib/designSystem';
import { cn } from '../ui/utils';

export interface DocumentCreateOptions {
  acceptanceThreshold?: number;
  votingAnonymous?: boolean;
  votingAnonymityLocked?: boolean;
  voteChangeAllowed?: boolean;
  structureProposalsEnabled?: boolean;
}

export interface DocumentCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    title: string,
    description?: string,
    contributors?: string[],
    options?: DocumentCreateOptions,
    ownershipType?: 'personal' | 'shared' | 'organizational',
    organizationId?: string
  ) => Promise<void>;
  currentUser: User;
  currentOrganizationId?: string;
  organizations: Organization[];
  experienceLevel?: string;
  trackDocument: () => void;
}

function DocumentCreateDialogComponent({
  open,
  onOpenChange,
  onSubmit,
  currentUser,
  currentOrganizationId,
  organizations = [],
  experienceLevel = 'beginner',
  trackDocument,
}: DocumentCreateDialogProps) {
  const { t: tDoc } = useTranslation('documents');
  const { t: tCommon } = useTranslation('common');

  const [newDocumentTitle, setNewDocumentTitle] = useState('');
  const [newDocumentDescription, setNewDocumentDescription] = useState('');
  const [ownershipType, setOwnershipType] = useState<'personal' | 'shared' | 'organizational'>(
    currentOrganizationId ? 'organizational' : 'personal'
  );
  const [acceptanceThreshold, setAcceptanceThreshold] = useState(75);
  const [votingAnonymous, setVotingAnonymous] = useState(false);
  const [votingAnonymityLocked, setVotingAnonymityLocked] = useState(false);
  const [voteChangeAllowed, setVoteChangeAllowed] = useState(true);
  const [structureProposalsEnabled, setStructureProposalsEnabled] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(experienceLevel !== 'beginner');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isBeginner = experienceLevel === 'beginner';

  useEffect(() => {
    setOwnershipType(currentOrganizationId ? 'organizational' : 'personal');
  }, [currentOrganizationId]);

  const resetForm = () => {
    setNewDocumentTitle('');
    setNewDocumentDescription('');
    setAcceptanceThreshold(75);
    setVotingAnonymous(false);
    setVotingAnonymityLocked(false);
    setVoteChangeAllowed(true);
    setStructureProposalsEnabled(false);
    setOwnershipType(currentOrganizationId ? 'organizational' : 'personal');
  };

  const handleSubmit = async () => {
    if (!newDocumentTitle.trim()) {
      toast.error(tDoc('dashboard.pleaseEnterTitle'));
      return;
    }
    setIsSubmitting(true);
    try {
      const finalOwnershipType = currentOrganizationId ? 'organizational' : ownershipType;
      const finalOrganizationId = currentOrganizationId || undefined;
      if (currentOrganizationId) {
        logger.log('Creating organizational document:', {
          currentOrganizationId,
          finalOwnershipType,
          finalOrganizationId,
        });
      }
      await onSubmit(
        newDocumentTitle.trim(),
        newDocumentDescription.trim() || undefined,
        undefined,
        {
          acceptanceThreshold,
          votingAnonymous,
          votingAnonymityLocked,
          voteChangeAllowed,
          structureProposalsEnabled,
        },
        finalOwnershipType,
        finalOrganizationId
      );
      resetForm();
      onOpenChange(false);
      trackDocument();
      toast.success(tCommon('toasts.documentCreated'));
    } catch (error) {
      logger.error('Document creation error:', {
        error,
        errorType: error?.constructor?.name,
        isApiError: error instanceof ApiError,
      });
      let errorMessage = tDoc('dashboard.failedToCreate');
      let fieldErrors: Record<string, string> = {};

      if (error instanceof ApiError) {
        if (error.hasFieldErrors()) {
          fieldErrors = error.getFieldErrorsArray().reduce((acc, { field, message }) => {
            acc[field] = message;
            return acc;
          }, {} as Record<string, string>);
          const fieldErrorMessages = Object.entries(fieldErrors).map(([field, msg]) => {
            const fieldLabel =
              field === 'title'
                ? tCommon('fieldLabels.title')
                : field === 'options.acceptanceThreshold'
                  ? tCommon('fieldLabels.acceptanceThreshold')
                  : field === 'organizationId'
                    ? tCommon('fieldLabels.organization')
                    : field;
            return `${fieldLabel}: ${msg}`;
          });
          if (fieldErrorMessages.length > 0) {
            errorMessage = fieldErrorMessages.join('. ');
          } else {
            errorMessage = error.message || errorMessage;
          }
        } else if (error.code) {
          errorMessage = getDocumentErrorMessage(error.code, error.message || errorMessage);
        } else {
          errorMessage = error.message || errorMessage;
        }
        if (error.details && typeof error.details === 'object') {
          const details = error.details as {
            validationErrors?: Array<{ field?: string; message?: string }>;
            details?: Array<{ field?: string; message?: string }>;
          };
          if (Array.isArray(details.validationErrors)) {
            details.validationErrors.forEach((detail) => {
              if (detail.field && detail.message) fieldErrors[detail.field] = detail.message;
            });
          } else if (Array.isArray(details.details)) {
            details.details.forEach((detail) => {
              if (detail.field && detail.message) fieldErrors[detail.field] = detail.message;
            });
          }
          if (Object.keys(fieldErrors).length > 0) {
            const fieldErrorMessages = Object.entries(fieldErrors).map(([field, msg]) => {
              const fieldLabel =
                field === 'title'
                  ? tCommon('fieldLabels.title')
                  : field === 'options.acceptanceThreshold'
                    ? tCommon('fieldLabels.acceptanceThreshold')
                    : field === 'organizationId'
                      ? tCommon('fieldLabels.organization')
                      : field;
              return `${fieldLabel}: ${msg}`;
            });
            errorMessage = fieldErrorMessages.join('. ');
          }
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      } else if (error && typeof error === 'object') {
        const errorObj = error as { code?: string; message?: string; details?: unknown };
        if (errorObj.code) {
          errorMessage = getDocumentErrorMessage(errorObj.code, errorMessage);
        } else if (errorObj.message) {
          errorMessage = errorObj.message;
        } else if (Array.isArray(errorObj.details)) {
          const fieldErrorMessages = (errorObj.details as Array<{ field?: string; message?: string }>)
            .filter((d) => d.field && d.message)
            .map((d) => {
              const fieldLabel =
                d.field === 'title'
                  ? tCommon('fieldLabels.title')
                  : d.field === 'options.acceptanceThreshold'
                    ? tCommon('fieldLabels.acceptanceThreshold')
                    : d.field === 'organizationId'
                      ? tCommon('fieldLabels.organization')
                      : d.field || tCommon('fieldLabels.field');
              return `${fieldLabel}: ${d.message}`;
            });
          if (fieldErrorMessages.length > 0) {
            errorMessage = fieldErrorMessages.join('. ');
          } else {
            errorMessage = String(errorObj.details);
          }
        } else if (errorObj.details) {
          errorMessage = String(errorObj.details);
        }
      }
      toast.error(errorMessage, { duration: 5000 });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <Card className="border-2 border-border bg-card animate-in slide-in-from-top-2 duration-200 flex flex-col">
      <CardHeader className="pb-4 flex-shrink-0">
        <CardTitle className="text-lg font-bold text-foreground">{tDoc('createDialog.title')}</CardTitle>
        <CardDescription>{tDoc('createDialog.subtitle')}</CardDescription>
      </CardHeader>
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <CardContent className="space-y-4 overflow-y-auto flex-1 pb-4">
          <div className="space-y-2">
            <Label htmlFor="title">{tDoc('createDialog.documentTitle')}</Label>
            <Input
              id="title"
              placeholder={tDoc('createDialog.placeholderTitle')}
              value={newDocumentTitle}
              onChange={(e) => setNewDocumentTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium">
              {tDoc('createDialog.descriptionLabel')} <span className="text-muted-foreground font-normal">{tDoc('createDialog.optional')}</span>
            </Label>
            <Textarea
              id="description"
              placeholder={tDoc('createDialog.descriptionPlaceholder')}
              value={newDocumentDescription}
              onChange={(e) => setNewDocumentDescription(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          {!isBeginner && (
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span>🏢</span>
                <span>Ownership Type</span>
              </div>
              <div className="space-y-2">
                <Label>Document Ownership</Label>
                <RadioGroup value={ownershipType} onValueChange={(v) => setOwnershipType(v as 'personal' | 'shared' | 'organizational')}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="personal" id="personal" />
                    <Label htmlFor="personal" className="font-normal cursor-pointer">
                      Personal - Owned by you individually
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="shared" id="shared" />
                    <Label htmlFor="shared" className="font-normal cursor-pointer">
                      Shared - Owned by multiple creators
                    </Label>
                  </div>
                  {currentOrganizationId && (
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="organizational" id="organizational" />
                      <Label htmlFor="organizational" className="font-normal cursor-pointer">
                        Organizational - Owned by organization
                      </Label>
                    </div>
                  )}
                </RadioGroup>
              </div>
            </div>
          )}

          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon name="Settings" className="h-4 w-4" />
                <span>Document Options</span>
                {isBeginner && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={cn("inline-flex shrink-0 text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", RADIUS.inline)}
                        aria-label={tDoc('tooltips.documentOptionsHelp')}
                      >
                        <Icon name="HelpCircle" className="h-4 w-4 cursor-help" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">{tDoc('tooltips.documentOptions')}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              {isBeginner && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdvancedOptions(!showAdvancedOptions)} className="text-xs">
                  {showAdvancedOptions ? (
                    <>
                      <Icon name="ChevronUp" className="h-3 w-3 mr-1" />
                      Hide Advanced
                    </>
                  ) : (
                    <>
                      <Icon name="ChevronDown" className="h-3 w-3 mr-1" />
                      Show Advanced
                    </>
                  )}
                </Button>
              )}
            </div>
            {isBeginner && !showAdvancedOptions && (
              <p className="text-xs text-muted-foreground">
                Using smart defaults: 75% approval, public voting, flexible votes. Click &quot;Show Advanced&quot; to customize.
              </p>
            )}
            {(!isBeginner || showAdvancedOptions) && (
              <>
                <p className="text-xs text-muted-foreground -mt-2">These settings cannot be changed after document creation</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Acceptance Threshold</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className={cn("inline-flex shrink-0 text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", RADIUS.inline)}
                          aria-label={tDoc('tooltips.acceptanceThresholdHelp')}
                        >
                          <Icon name="HelpCircle" className="h-3 w-3 cursor-help" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">{tDoc('tooltips.acceptanceThresholdDashboard')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <RadioGroup value={acceptanceThreshold.toString()} onValueChange={(v) => setAcceptanceThreshold(parseInt(v))}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="50" id="threshold-50" />
                      <Label htmlFor="threshold-50" className="font-normal cursor-pointer">50% - Simple majority</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="75" id="threshold-75" />
                      <Label htmlFor="threshold-75" className="font-normal cursor-pointer">75% - Strong consensus (default)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="90" id="threshold-90" />
                      <Label htmlFor="threshold-90" className="font-normal cursor-pointer">90% - Near-unanimous</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="100" id="threshold-100" />
                      <Label htmlFor="threshold-100" className="font-normal cursor-pointer">100% - Unanimous approval required</Label>
                    </div>
                  </RadioGroup>
                  <p className="text-xs text-muted-foreground">Percentage of collaborators who must vote PRO for automatic acceptance</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Voting Anonymity</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className={cn("inline-flex shrink-0 text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", RADIUS.inline)}
                          aria-label={tDoc('tooltips.votingAnonymityHelp')}
                        >
                          <Icon name="HelpCircle" className="h-3 w-3 cursor-help" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">{tDoc('tooltips.votingAnonymityDashboard')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <RadioGroup value={votingAnonymous ? 'anonymous' : 'public'} onValueChange={(v) => setVotingAnonymous(v === 'anonymous')}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="public" id="public" />
                      <Label htmlFor="public" className="font-normal cursor-pointer">Public (Open) - Votes are visible</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="anonymous" id="anonymous" />
                      <Label htmlFor="anonymous" className="font-normal cursor-pointer">Anonymous (Closed) - Votes are hidden</Label>
                    </div>
                  </RadioGroup>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="lock-anonymity" checked={votingAnonymityLocked} onCheckedChange={(c) => setVotingAnonymityLocked(c === true)} />
                    <Label htmlFor="lock-anonymity" className="text-xs font-normal cursor-pointer">Lock anonymity setting (cannot be changed)</Label>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Vote Flexibility</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className={cn("inline-flex shrink-0 text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", RADIUS.inline)}
                          aria-label={tDoc('tooltips.voteFlexibilityHelp')}
                        >
                          <Icon name="HelpCircle" className="h-3 w-3 cursor-help" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">{tDoc('tooltips.voteFlexibilityDashboard')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <RadioGroup value={voteChangeAllowed ? 'flexible' : 'locked'} onValueChange={(v) => setVoteChangeAllowed(v === 'flexible')}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="flexible" id="flexible" />
                      <Label htmlFor="flexible" className="font-normal cursor-pointer">Flexible - Can change vote after casting</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="locked" id="locked" />
                      <Label htmlFor="locked" className="font-normal cursor-pointer">Locked - Vote cannot be changed after first vote</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Structure Proposals</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className={cn("inline-flex shrink-0 text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", RADIUS.inline)}
                          aria-label={tDoc('tooltips.structureProposalsHelp')}
                        >
                          <Icon name="HelpCircle" className="h-3 w-3 cursor-help" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">{tDoc('tooltips.structureProposalsDashboard')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="structure-proposals" checked={structureProposalsEnabled} onCheckedChange={(c) => setStructureProposalsEnabled(c === true)} />
                    <Label htmlFor="structure-proposals" className="font-normal cursor-pointer">
                      Enable structure proposals - Allow collaborators to propose major document reorganizations
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    When enabled, users can propose moving, merging, deleting, or restructuring document sections. All proposals require voting and approval before being applied.
                  </p>
                </div>
              </>
            )}
          </div>
          {!isBeginner && ownershipType !== 'organizational' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Contributors</Label>
              <p className="text-xs text-muted-foreground">You can invite collaborators via email after creating the document.</p>
            </div>
          )}
        </CardContent>
      </div>
      <CardFooter className="border-t pt-4 gap-3 flex-shrink-0 w-full flex-row bg-card">
        <button
          type="button"
          onClick={handleCancel}
          disabled={isSubmitting}
          className={cn("flex-1 h-10 bg-card text-foreground border border-border font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center", RADIUS.control)}
        >
          {tCommon('buttons.cancel')}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || !newDocumentTitle.trim()}
          className={cn("flex-1 h-10 bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center", RADIUS.control)}
        >
          {isSubmitting ? tDoc('createDialog.creating') : tDoc('createDialog.create')}
        </button>
      </CardFooter>
    </Card>
  );
}

export const DocumentCreateDialog = React.memo(DocumentCreateDialogComponent);

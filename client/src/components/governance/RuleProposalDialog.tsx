import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Alert, AlertDescription } from '../ui/alert';
import { Icon } from '../ui/Icon';
import { Organization, OrganizationGovernanceRules, User, GovernanceRuleValue } from '../../types';
import { governanceApi, ApiError } from '../../lib/api';
import { useRuleLabels } from '../../hooks/useRuleLabels';
import { getUserFriendlyErrorMessage } from '../../utils/errorMessages';
import { toast } from 'sonner';
import { logger } from '../../lib/logger';
import { COLORS, RADIUS } from '../../lib/designSystem';
import { formatVoteValue } from '../../lib/voting';
import { cn } from '../ui/utils';

interface RuleProposalDialogProps {
  organization: Organization;
  currentUser: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  initialRuleField?: string; // Pre-select a rule field when opening
  /** When provided, use instead of fetching (avoids duplicate fetch from parent). */
  governanceRules?: OrganizationGovernanceRules | null;
}

interface RuleOption {
  optionTitle: string;
  optionDescription?: string;
  proposedValue: GovernanceRuleValue;
}

export function RuleProposalDialog({
  organization,
  currentUser,
  open,
  onOpenChange,
  onSuccess,
  initialRuleField,
  governanceRules: governanceRulesProp,
}: RuleProposalDialogProps) {
  const { t } = useTranslation('governance');
  const { t: tCommon } = useTranslation('common');
  const { getRuleLabel, getRuleDisplayInfo: getLocalizedRuleDisplayInfo } = useRuleLabels();
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [currentRules, setCurrentRules] = useState<OrganizationGovernanceRules | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  const [proposalData, setProposalData] = useState({
    title: '',
    description: '',
    ruleField: '',
    proposedValue: '',
    useOptions: false,
    options: [] as RuleOption[]
  });

  const [confirmDialog, setConfirmDialog] = useState<{ title: string; description: string } | null>(null);
  const confirmResolveRef = useRef<((value: boolean) => void) | null>(null);

  const awaitConfirm = (title: string, description: string): Promise<boolean> => {
    setConfirmDialog({ title, description });
    return new Promise<boolean>((resolve) => {
      confirmResolveRef.current = resolve;
    });
  };

  const resolveConfirm = (value: boolean) => {
    confirmResolveRef.current?.(value);
    confirmResolveRef.current = null;
    setConfirmDialog(null);
  };

  useEffect(() => {
    if (open) {
      if (governanceRulesProp != null) {
        setCurrentRules(governanceRulesProp);
        setLoading(false);
      } else {
        loadCurrentRules();
      }
      resetForm();
    }
  }, [open, organization.id, initialRuleField, governanceRulesProp]);

  const loadCurrentRules = async () => {
    setLoading(true);
    try {
      const response = await governanceApi.getGovernanceRules(organization.id);
      setCurrentRules(response.governanceRules);
    } catch (error) {
      logger.error('Failed to load governance rules:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setProposalData({
      title: '',
      description: '',
      ruleField: initialRuleField || '',
      proposedValue: '',
      useOptions: false,
      options: []
    });
    setFieldErrors({});
    setGeneralError(null);
  };

  const handleInputChange = (field: string, value: GovernanceRuleValue) => {
    setProposalData(prev => ({ ...prev, [field]: value }));
    // Clear field error when user starts typing
    if (fieldErrors[field]) {
      setFieldErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
    if (generalError) {
      setGeneralError(null);
    }
  };

  const handleAddOption = () => {
    setProposalData(prev => ({
      ...prev,
      options: [...prev.options, { optionTitle: '', optionDescription: '', proposedValue: '' }]
    }));
  };

  const handleRemoveOption = (index: number) => {
    setProposalData(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index)
    }));
  };

  const handleOptionChange = (index: number, field: string, value: string | number | boolean) => {
    setProposalData(prev => ({
      ...prev,
      options: prev.options.map((opt, i) =>
        i === index ? { ...opt, [field]: value } : opt
      )
    }));
  };

  const RULE_IMPACT_FIELDS = [
    'representativeTermMonths', 'representativeTermLimits', 'electionVotingMethod',
    'electionQuorumPercentage', 'electionNoticeDays', 'defaultVotingDeadlineHours',
    'defaultQuorumPercentage', 'defaultAcceptanceThreshold', 'documentProposalPeriodDays',
    'paragraphProposalCutoffDays', 'thresholdCalculationMethod', 'anonymousVotingEnabled',
    'voteChangeAllowed', 'representativeCanCreateVotes', 'representativeCanInviteMembers',
    'representativeCanManageDocuments', 'representativeApprovalRequired', 'tamperProofEnabled',
    'auditTrailEnabled', 'membersCanProposeRules', 'membersCanProposeRulesThreshold',
    'membersCanCreateDocuments', 'membersCanCreateDocumentsThreshold', 'membersCanInitializeElections',
    'membersCanInitializeElectionsThreshold', 'membersCanInviteMembers', 'membersCanInviteMembersThreshold',
    'membersCanManageRuleProposals', 'membersCanManageRuleProposalsThreshold',
    'defaultStructureProposalsEnabled', 'defaultVotingAnonymityLocked', 'minimumQuorumPercentage',
    'minimumApprovalThreshold', 'minimumVotingPeriodHours', 'membersCanInitiateMistrustVote',
    'mistrustVoteThreshold', 'mistrustVoteQuorumPercentage',
  ] as const;

  const getRuleDisplayInfo = (field: string) => {
    const base = getLocalizedRuleDisplayInfo(field);
    const impact = RULE_IMPACT_FIELDS.includes(field as typeof RULE_IMPACT_FIELDS[number])
      ? t(`ruleImpacts.${field}`)
      : undefined;
    return { ...base, impact };
  };

  const getRuleFieldType = (field: string) => {
    const numberFields = [
      'representativeTermMonths', 'representativeTermLimits', 'electionNoticeDays',
      'defaultVotingDeadlineHours', 'documentProposalPeriodDays', 'paragraphProposalCutoffDays',
      'minimumVotingPeriodHours',
    ];
    const percentageFields = [
      'electionQuorumPercentage',
      'defaultQuorumPercentage',
      'minimumQuorumPercentage',
      'minimumApprovalThreshold',
      'mistrustVoteQuorumPercentage',
      'membersCanProposeRulesThreshold',
      'membersCanCreateDocumentsThreshold',
      'membersCanInitializeElectionsThreshold',
      'membersCanInviteMembersThreshold',
      'membersCanManageRuleProposalsThreshold',
    ];
    const percentage100Fields = ['defaultAcceptanceThreshold', 'mistrustVoteThreshold'];
    const booleanFields = [
      'anonymousVotingEnabled', 'voteChangeAllowed', 'representativeCanCreateVotes',
      'representativeCanInviteMembers', 'representativeCanManageDocuments',
      'representativeApprovalRequired', 'tamperProofEnabled', 'auditTrailEnabled',
      'membersCanProposeRules', 'membersCanCreateDocuments', 'membersCanInitializeElections',
      'membersCanInviteMembers', 'membersCanManageRuleProposals',
      'defaultStructureProposalsEnabled', 'defaultVotingAnonymityLocked',
      'membersCanInitiateMistrustVote',
    ];
    const selectFields = ['electionVotingMethod', 'thresholdCalculationMethod'];

    if (numberFields.includes(field)) return 'number';
    if (percentage100Fields.includes(field)) return 'percentage100';
    if (percentageFields.includes(field)) return 'percentage';
    if (booleanFields.includes(field)) return 'boolean';
    if (selectFields.includes(field)) return 'select';
    return 'text';
  };

  const getCurrentValueDisplay = (field: string, value: string | number | boolean | null | undefined) => {
    if (value === null || value === undefined) {
      return t('values.notSet');
    }
    const fieldType = getRuleFieldType(field);

    switch (fieldType) {
      case 'percentage':
        return formatVoteValue(field, value);
      case 'percentage100': {
        // defaultAcceptanceThreshold is already 0-100, just add %
        const thresholdValue = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : 0;
        return `${Math.round(thresholdValue)}%`;
      }
      case 'boolean':
        return formatVoteValue(field, value);
      case 'select':
        if (field === 'thresholdCalculationMethod') {
          return value === 'all_votes' ? t('values.allVotes') : t('values.allMembers');
        }
        return formatVoteValue(field, value);
      default:
        return formatVoteValue(field, value);
    }
  };

  const renderValueInput = (field: string, value: string, onChange: (value: string | number | boolean) => void) => {
    const fieldType = getRuleFieldType(field);

    switch (fieldType) {
      case 'number':
        return (
          <Input
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('values.enterNumber')}
          />
        );
      case 'percentage':
        return (
          <div className="flex gap-2 items-center">
            <Input
              type="number"
              min="0"
              max="100"
              value={value ? Math.round(parseFloat(value) * 100) : ''}
              onChange={(e) => onChange(parseInt(e.target.value) / 100)}
              placeholder="0"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        );
      case 'percentage100':
        // defaultAcceptanceThreshold uses 0-100 range directly (not 0-1)
        return (
          <div className="flex gap-2 items-center">
            <Input
              type="number"
              min="1"
              max="100"
              value={value ? Math.round(parseFloat(value)) : ''}
              onChange={(e) => onChange(parseInt(e.target.value) || 0)}
              placeholder="75"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        );
      case 'boolean':
        return (
          <Select value={value} onValueChange={(val) => onChange(val === 'true')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[200]" sideOffset={4}>
              <SelectItem value="true">{t('values.enabled')}</SelectItem>
              <SelectItem value="false">{t('values.disabled')}</SelectItem>
            </SelectContent>
          </Select>
        );
      case 'select':
        if (field === 'electionVotingMethod') {
          return (
            <Select value={value} onValueChange={onChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
<SelectContent className="z-[200]" sideOffset={4}>
              <SelectItem value="simple_majority">{t('votingMethods.simple_majority')}</SelectItem>
                <SelectItem value="ranked_choice">{t('votingMethods.ranked_choice')}</SelectItem>
                <SelectItem value="approval">{t('votingMethods.approval')}</SelectItem>
              </SelectContent>
            </Select>
          );
        }
        if (field === 'thresholdCalculationMethod') {
          return (
            <Select value={value} onValueChange={onChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
<SelectContent className="z-[200]" sideOffset={4}>
              <SelectItem value="all_votes">{t('values.allVotes')}</SelectItem>
                <SelectItem value="all_members">{t('values.allMembers')}</SelectItem>
              </SelectContent>
            </Select>
          );
        }
        return (
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('values.enterValue')}
          />
        );
      default:
        return (
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('values.enterValue')}
          />
        );
    }
  };

  const validateProposal = () => {
    const errors = [];

    if (!proposalData.title.trim()) errors.push(t('ruleProposalDialog.validation.titleRequired'));
    if (!proposalData.description.trim()) errors.push(t('ruleProposalDialog.validation.descriptionRequired'));
    if (!proposalData.ruleField) errors.push(t('ruleProposalDialog.validation.ruleRequired'));

    if (proposalData.useOptions) {
      if (proposalData.options.length < 2) errors.push(t('ruleProposalDialog.validation.optionsMin'));
      if (proposalData.options.some(opt => !opt.optionTitle.trim())) {
        errors.push(t('ruleProposalDialog.validation.optionTitlesRequired'));
      }
    } else {
      if (proposalData.proposedValue === null || proposalData.proposedValue === undefined || proposalData.proposedValue === '') {
        errors.push(t('ruleProposalDialog.validation.valueRequired'));
      }

      if (proposalData.ruleField === 'defaultAcceptanceThreshold') {
        const threshold = typeof proposalData.proposedValue === 'number' 
          ? proposalData.proposedValue 
          : parseFloat(proposalData.proposedValue);
        if (isNaN(threshold) || threshold < 1 || threshold > 100) {
          errors.push(t('ruleProposalDialog.validation.thresholdRange'));
        }
      }

      if (proposalData.ruleField === 'documentProposalPeriodDays') {
        const days = typeof proposalData.proposedValue === 'number' 
          ? proposalData.proposedValue 
          : parseInt(proposalData.proposedValue);
        if (isNaN(days) || days < 1 || !Number.isInteger(days)) {
          errors.push(t('ruleProposalDialog.validation.proposalPeriod'));
        }
      }

      if (proposalData.ruleField === 'paragraphProposalCutoffDays') {
        const days = typeof proposalData.proposedValue === 'number' 
          ? proposalData.proposedValue 
          : parseInt(proposalData.proposedValue);
        if (isNaN(days) || days < 0 || days > 365 || !Number.isInteger(days)) {
          errors.push(t('ruleProposalDialog.validation.cutoffRange'));
        }
      }

      if (proposalData.ruleField === 'thresholdCalculationMethod') {
        if (proposalData.proposedValue !== 'all_votes' && proposalData.proposedValue !== 'all_members') {
          errors.push(t('ruleProposalDialog.validation.thresholdMethod'));
        }
      }
    }

    return errors;
  };

  const handleCreateProposal = async () => {
    // Clear previous errors
    setFieldErrors({});
    setGeneralError(null);

    const errors = validateProposal();
    if (errors.length > 0) {
      // Map validation errors to field errors
      const newFieldErrors: Record<string, string> = {};
      errors.forEach(error => {
        if (error.includes('title')) {
          newFieldErrors.title = error;
        } else if (error.includes('description')) {
          newFieldErrors.description = error;
        } else if (error.includes('rule field')) {
          newFieldErrors.ruleField = error;
        } else if (error.includes('proposed value') || error.includes('value')) {
          newFieldErrors.proposedValue = error;
        } else if (error.includes('option')) {
          newFieldErrors.options = error;
        } else {
          setGeneralError(error);
        }
      });
      setFieldErrors(newFieldErrors);
      if (Object.keys(newFieldErrors).length === 0 && !generalError) {
        toast.error(t('pleaseFixErrors'));
      }
      return;
    }

    setCreating(true);
    try {
      // Pre-submission validation
      if (!proposalData.useOptions) {
        try {
          const validation = await governanceApi.validateRuleChange(
            organization.id,
            proposalData.ruleField,
            proposalData.proposedValue
          );

          if (!validation.valid) {
            // Show errors
            if (validation.errors.length > 0) {
              toast.error(t('pleaseFixErrors'));
              setCreating(false);
              return;
            }

            // Show warnings but allow submission
            if (validation.warnings.length > 0) {
              const proceed = await awaitConfirm(
                t('confirmDialog.warning'),
                t('confirmProceedWarning', { message: validation.warnings[0] })
              );
              if (!proceed) {
                setCreating(false);
                return;
              }
            }

            // Show conflicts but allow submission with confirmation
            if (validation.conflicts.length > 0) {
              const conflict = validation.conflicts[0];
              const proceed = await awaitConfirm(
                t('confirmDialog.conflict'),
                t('confirmProceedConflict', { message: conflict.message })
              );
              if (!proceed) {
                setCreating(false);
                return;
              }
            }
          }
        } catch (validationError: unknown) {
          // If validation fails, still allow submission (backend will catch it)
          const errorMessage = validationError instanceof Error ? validationError.message : String(validationError);
          logger.warn('Validation check failed:', errorMessage);
        }
      }

      const proposalPayload = {
        title: proposalData.title.trim(),
        description: proposalData.description.trim(),
        ruleField: proposalData.ruleField,
        proposedValue: proposalData.proposedValue,
        ...(proposalData.useOptions && { options: proposalData.options })
      };

      await governanceApi.ruleProposalsApi.createRuleProposal(organization.id, proposalPayload);

      const isRepresentative = organization.representatives?.includes(currentUser?.id || '');
      const successMessage = isRepresentative
        ? t('proposalCreatedSuccessRepresentative')
        : t('proposalCreatedSuccessMember');
      
      toast.success(successMessage, {
        duration: 5000,
        description: isRepresentative
          ? t('proposalCreatedDescriptionRepresentative')
          : t('proposalCreatedDescriptionMember')
      });
      
      onSuccess?.();
      onOpenChange(false);
    } catch (error: unknown) {
      logger.error('Failed to create rule proposal:', error);

      let errorMessage = t('failedToCreateRuleProposal');
      let errorSuggestion: string | undefined;
      const newFieldErrors: Record<string, string> = {};

      if (error instanceof ApiError) {
        error.getFieldErrorsArray().forEach(({ field, message }) => {
          newFieldErrors[field] = message;
        });
        errorMessage = getUserFriendlyErrorMessage(error, errorMessage);
      } else if (error && typeof error === 'object' && 'details' in error) {
        const apiError = error as { details?: unknown; message?: string };

        if (apiError.details && typeof apiError.details === 'object') {
          const details = apiError.details as {
            fieldErrors?: Record<string, string>;
            details?: Array<{ field?: string; message?: string }>;
            reason?: string;
            suggestion?: string;
            message?: string;
          };

          if (details.fieldErrors) {
            Object.assign(newFieldErrors, details.fieldErrors);
          } else if (Array.isArray(details.details)) {
            details.details.forEach(detail => {
              if (detail.field && detail.message) {
                newFieldErrors[detail.field] = detail.message;
              }
            });
          }

          if (details.message) {
            errorMessage = details.message;
          } else if (details.reason) {
            errorMessage = details.reason;
          } else if (apiError.message) {
            errorMessage = apiError.message;
          }
          if (details.suggestion) {
            errorSuggestion = details.suggestion;
          }
        } else if (apiError.message) {
          errorMessage = apiError.message;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      setFieldErrors(newFieldErrors);
      if (Object.keys(newFieldErrors).length === 0) {
        setGeneralError(errorMessage);
        if (errorSuggestion) {
          toast.error(errorMessage, { description: errorSuggestion, duration: 5000 });
        } else {
          toast.error(errorMessage);
        }
      } else {
        toast.error(t('pleaseFixErrors'));
      }
    } finally {
      setCreating(false);
    }
  };

  const isRepresentative = currentUser ? organization.representatives?.includes(currentUser.id) : false;
  const isActiveMember = currentUser ? organization.members?.some(m => m.userId === currentUser.id && m.status === 'active') || false : false;

  if (!isRepresentative && !isActiveMember) {
    return null; // Only members can access this dialog
  }

  const proposalRuleFieldKeys = [
    'representativeTermMonths', 'representativeTermLimits', 'electionVotingMethod',
    'electionQuorumPercentage', 'electionNoticeDays', 'defaultVotingDeadlineHours',
    'defaultQuorumPercentage', 'defaultAcceptanceThreshold', 'documentProposalPeriodDays',
    'paragraphProposalCutoffDays', 'thresholdCalculationMethod',
    'membersCanProposeRules', 'membersCanProposeRulesThreshold', 'membersCanCreateDocuments',
    'membersCanCreateDocumentsThreshold', 'membersCanInitializeElections', 'membersCanInitializeElectionsThreshold',
    'membersCanInviteMembers', 'membersCanInviteMembersThreshold', 'membersCanManageRuleProposals',
    'membersCanManageRuleProposalsThreshold', 'anonymousVotingEnabled', 'voteChangeAllowed',
    'representativeCanCreateVotes', 'representativeCanInviteMembers', 'representativeCanManageDocuments',
    'representativeApprovalRequired', 'tamperProofEnabled', 'auditTrailEnabled',
    'defaultStructureProposalsEnabled', 'defaultVotingAnonymityLocked', 'minimumVotingPeriodHours',
    'minimumQuorumPercentage', 'minimumApprovalThreshold', 'membersCanInitiateMistrustVote',
    'mistrustVoteThreshold', 'mistrustVoteQuorumPercentage',
  ];

  const availableRuleFields = proposalRuleFieldKeys.map((value) => ({
    value,
    label: getRuleLabel(value),
  }));

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="Settings" className="h-5 w-5" />
            {t('ruleProposalDialog.title')}
          </DialogTitle>
          <DialogDescription>
            {isRepresentative
              ? t('ruleProposalDialog.descriptionRep', { name: organization.name })
              : t('ruleProposalDialog.descriptionMember', { name: organization.name })}{' '}
            {t('ruleProposalDialog.descriptionSuffix')}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className={cn(RADIUS.pill, "animate-spin h-8 w-8 border-b-2 border-[var(--status-active-solid)]")}></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Proposal Details */}
            <Card>
              <CardHeader>
                <CardTitle>{t('ruleProposalDialog.proposalDetails')}</CardTitle>
                <CardDescription>{t('ruleProposalDialog.proposalDetailsDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">{t('ruleProposalDialog.proposalTitle')}</Label>
                  <Input
                    id="title"
                    value={proposalData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder={t('ruleProposalDialog.titlePlaceholder')}
                    className={fieldErrors.title ? 'border-[var(--status-rejected-solid)]' : ''}
                  />
                  {fieldErrors.title && (
                    <p className={`text-sm ${COLORS.status.error}`}>{fieldErrors.title}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">{t('ruleProposalDialog.descriptionLabel')}</Label>
                  <Textarea
                    id="description"
                    value={proposalData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder={t('ruleProposalDialog.descriptionPlaceholder')}
                    rows={4}
                    className={fieldErrors.description ? 'border-[var(--status-rejected-solid)]' : ''}
                  />
                  {fieldErrors.description && (
                    <p className={`text-sm ${COLORS.status.error}`}>{fieldErrors.description}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rule-field">{t('ruleProposalDialog.ruleToChange')}</Label>
                  <Select value={proposalData.ruleField} onValueChange={(value) => handleInputChange('ruleField', value)}>
                    <SelectTrigger className={fieldErrors.ruleField ? 'border-[var(--status-rejected-solid)]' : ''}>
                      <SelectValue placeholder={t('ruleProposalDialog.selectRule')} />
                    </SelectTrigger>
                    <SelectContent className="z-[200]" sideOffset={4}>
                      {availableRuleFields.map(field => (
                        <SelectItem key={field.value} value={field.value}>
                          {field.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldErrors.ruleField && (
                    <p className={`text-sm ${COLORS.status.error}`}>{fieldErrors.ruleField}</p>
                  )}
                </div>

                {proposalData.ruleField && currentRules && (() => {
                  const ruleInfo = getRuleDisplayInfo(proposalData.ruleField);
                  return (
                    <div className="space-y-3">
                      <Alert>
                        <Icon name="AlertTriangle" className="h-4 w-4" />
                        <AlertDescription>
                          <div className="space-y-1">
                            <div>
                              <strong>{t('ruleProposalDialog.currentValue')}</strong> {getCurrentValueDisplay(proposalData.ruleField, currentRules[proposalData.ruleField as keyof OrganizationGovernanceRules] ?? null)}
                            </div>
                            <div className="text-sm text-muted-foreground mt-2">
                              <strong>{t('ruleProposalDialog.whatRuleDoes')}</strong> {ruleInfo.description}
                            </div>
                            {ruleInfo.impact && (
                              <div className={`text-sm mt-1 ${COLORS.status.info}`}>
                                <strong>{t('ruleProposalDialog.impact')}</strong> {ruleInfo.impact}
                              </div>
                            )}
                          </div>
                        </AlertDescription>
                      </Alert>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Proposed Change */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{t('ruleProposalDialog.proposedChange')}</span>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="use-options" className="text-sm">{t('ruleProposalDialog.multipleChoice')}</Label>
                    <Switch
                      id="use-options"
                      checked={proposalData.useOptions}
                      onCheckedChange={(checked) => handleInputChange('useOptions', checked)}
                    />
                  </div>
                </CardTitle>
                <CardDescription>
                  {proposalData.useOptions
                    ? t('ruleProposalDialog.multipleChoiceDesc')
                    : t('ruleProposalDialog.singleValueDesc')
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!proposalData.useOptions ? (
                  <div className="space-y-2">
                    <Label htmlFor="proposed-value">
                      {proposalData.ruleField
                        ? t('ruleProposalDialog.proposedLabel', { label: getRuleDisplayInfo(proposalData.ruleField).label })
                        : t('ruleProposalDialog.newValue')}{' '}
                    </Label>
                    <div className={fieldErrors.proposedValue ? 'border-[var(--status-rejected-solid)] rounded' : ''}>
                      {renderValueInput(proposalData.ruleField, proposalData.proposedValue || '', (value) => handleInputChange('proposedValue', value))}
                    </div>
                    {fieldErrors.proposedValue && (
                      <p className={`text-sm ${COLORS.status.error}`}>{fieldErrors.proposedValue}</p>
                    )}
                    {proposalData.ruleField && !fieldErrors.proposedValue && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {getRuleDisplayInfo(proposalData.ruleField).description}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>{t('ruleProposalDialog.options')}</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddOption}
                        className="gap-2"
                      >
                        <Icon name="Plus" className="h-4 w-4" />
                        {t('ruleProposalDialog.addOption')}
                      </Button>
                    </div>

                    {proposalData.options.map((option, index) => (
                      <Card key={index} className="border-l-4 border-l-blue-500">
                        <CardContent className="pt-4">
                          <div className="flex items-start gap-4">
                            <div className="flex-1 space-y-3">
                              <div className="space-y-2">
                                <Label>{t('ruleProposalDialog.optionTitle')}</Label>
                                <Input
                                  value={option.optionTitle}
                                  onChange={(e) => handleOptionChange(index, 'optionTitle', e.target.value)}
                                  placeholder={t('ruleProposalDialog.optionTitlePlaceholder', { number: index + 1 })}
                                />
                              </div>

                              <div className="space-y-2">
                                <Label>{t('ruleProposalDialog.optionDescription')}</Label>
                                <Textarea
                                  value={option.optionDescription || ''}
                                  onChange={(e) => handleOptionChange(index, 'optionDescription', e.target.value)}
                                  placeholder={t('ruleProposalDialog.optionDescriptionPlaceholder')}
                                  rows={2}
                                />
                              </div>

                              <div className="space-y-2">
                                <Label>{t('ruleProposalDialog.optionValue')}</Label>
                                {renderValueInput(proposalData.ruleField, option.proposedValue != null ? String(option.proposedValue) : '', (value) => handleOptionChange(index, 'proposedValue', value))}
                              </div>
                            </div>

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleRemoveOption(index)}
                              className={`${COLORS.status.error} hover:opacity-90`}
                            >
                              <Icon name="X" className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}

                    {proposalData.options.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Icon name="Vote" className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>{t('ruleProposalDialog.noOptions')}</p>
                        <p className="text-sm">{t('ruleProposalDialog.noOptionsHint')}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Error Summary */}
            {generalError && (
              <Alert variant="destructive">
                <Icon name="AlertTriangle" className="h-4 w-4" />
                <AlertDescription>
                  {generalError}
                </AlertDescription>
              </Alert>
            )}

            {/* Impact Assessment */}
            <Alert>
              <Icon name="Shield" className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <div>
                    <strong>{t('ruleProposalDialog.important')}</strong> {t('ruleProposalDialog.voteNotice')}
                  </div>
                  {proposalData.ruleField && (() => {
                    const ruleInfo = getRuleDisplayInfo(proposalData.ruleField);
                    const isDocumentRule = ['defaultAcceptanceThreshold', 'documentProposalPeriodDays', 'paragraphProposalCutoffDays', 'thresholdCalculationMethod', 'anonymousVotingEnabled', 'voteChangeAllowed'].includes(proposalData.ruleField);
                    return (
                      <div className="text-sm mt-2">
                        {isDocumentRule ? (
                          <div>
                            <strong>{t('ruleProposalDialog.documentImpact')}</strong> {t('ruleProposalDialog.documentImpactBody')}
                          </div>
                        ) : ruleInfo.impact ? (
                          <div>
                            <strong>{t('ruleProposalDialog.impact')}</strong> {ruleInfo.impact}
                          </div>
                        ) : (
                          <div>{t('ruleProposalDialog.considerImpact')}</div>
                        )}
                      </div>
                    );
                  })()}
                  {!proposalData.ruleField && (
                    <div className="text-sm mt-2">
                      {t('ruleProposalDialog.considerImpact')}
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon('buttons.cancel')}
          </Button>
          <Button
            onClick={handleCreateProposal}
            disabled={creating}
            className="gap-2"
          >
            <Icon name="Vote" className="h-4 w-4" />
            {creating ? t('ruleProposalDialog.creating') : t('ruleProposalDialog.create')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog
      open={!!confirmDialog}
      onOpenChange={(open) => {
        if (!open) resolveConfirm(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmDialog?.title ?? ''}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-wrap">
            {confirmDialog?.description ?? ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => resolveConfirm(false)}>{tCommon('buttons.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={() => resolveConfirm(true)}>{t('confirmDialog.proceed')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

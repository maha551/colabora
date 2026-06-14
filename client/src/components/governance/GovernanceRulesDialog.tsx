import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Alert, AlertDescription } from '../ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Icon } from '../ui/Icon';
import { cn } from '../ui/utils';
import { NAVIGATION, RADIUS } from '../../lib/designSystem';
import { OrganizationGovernanceRules, Organization, User, GovernanceRuleValue } from '../../types';
import { governanceApi, ApiErrorResponse } from '../../lib/api';
import { toast } from 'sonner';
import { logger } from '../../lib/logger';

interface GovernanceRulesDialogProps {
  organization: Organization;
  currentUser: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  governanceRules?: OrganizationGovernanceRules | null;
}

export function GovernanceRulesDialog({
  organization,
  currentUser,
  open,
  onOpenChange,
  onSuccess,
  governanceRules: propsGovernanceRules
}: GovernanceRulesDialogProps) {
  const { t } = useTranslation('governance');
  const { t: tCommon } = useTranslation('common');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<Partial<OrganizationGovernanceRules>>({
    representativeTermMonths: 12,
    representativeTermLimits: null,
    electionVotingMethod: 'simple_majority',
    electionQuorumPercentage: 0.5,
    electionNoticeDays: 14,
    defaultVotingDeadlineHours: 168,
    defaultQuorumPercentage: 0.5,
    anonymousVotingEnabled: true,
    voteChangeAllowed: false,
    representativeCanCreateVotes: true,
    representativeCanInviteMembers: true,
    representativeCanManageDocuments: true,
    representativeApprovalRequired: true,
    tamperProofEnabled: true,
    auditTrailEnabled: true
  });

  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (open) {
      if (propsGovernanceRules) {
        setRules(propsGovernanceRules);
        setLoading(false);
      } else {
        loadCurrentRules();
      }
    }
  }, [open, organization.id, propsGovernanceRules]);

  const loadCurrentRules = async () => {
    setLoading(true);
    try {
      const response = await governanceApi.getGovernanceRules(organization.id);
      if (response.governanceRules) {
        setRules(response.governanceRules);
      }
    } catch (error) {
      logger.error('Failed to load governance rules:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRuleChange = (field: keyof OrganizationGovernanceRules, value: GovernanceRuleValue) => {
    setRules(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await governanceApi.updateGovernanceRules(organization.id, rules);
      toast.success(t('governanceRulesUpdated'));
      setHasChanges(false);
      onSuccess?.();
    } catch (error: unknown) {
      logger.error('Failed to update governance rules:', error);

      let errorMessage = t('governanceRulesDialog.failedToUpdate');
      if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = String(error.message);
      }

      if (error && typeof error === 'object' && 'response' in error) {
        const apiError = error as ApiErrorResponse;
        const response = apiError.response;
        if (response?.data?.error === 'Database schema mismatch: missing column') {
          const details = response.data.details || '';
          const migrationHint = response.data.migrationHint || '';
          errorMessage = `Database schema issue: ${details}${migrationHint ? ` ${migrationHint}` : ''}`;
        } else if (response?.data?.error) {
          errorMessage = response.data.error;
          if (response.data.details) {
            errorMessage += `: ${response.data.details}`;
          }
        }
      }

      toast.error(errorMessage, { duration: 8000 });
    } finally {
      setSaving(false);
    }
  };

  const getVotingMethodDescription = (method: string) => {
    const key = `${method}Desc` as 'simple_majorityDesc' | 'ranked_choiceDesc' | 'approvalDesc';
    return t(`votingMethods.${key}`, { defaultValue: '' });
  };

  const isRepresentative = organization.representatives?.includes(currentUser?.id ?? '');

  if (!isRepresentative) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="Shield" className="h-5 w-5" />
            {t('governanceRulesDialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('governanceRulesDialog.description', { name: organization.name })}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className={cn("animate-spin h-8 w-8 border-b-2 border-[var(--status-active-solid)]", RADIUS.pill)}></div>
          </div>
        ) : (
          <Tabs defaultValue="elections" className="w-full">
            <TabsList className="flex flex-row w-full">
              <TabsTrigger value="elections" className={cn(NAVIGATION.tabs.trigger, 'flex-1')}>
                <Icon name="Vote" className={NAVIGATION.tabs.iconDesktop} />
                {t('governanceRulesDialog.tabElections')}
              </TabsTrigger>
              <TabsTrigger value="voting" className={cn(NAVIGATION.tabs.trigger, 'flex-1')}>
                <Icon name="Settings" className={NAVIGATION.tabs.iconDesktop} />
                {t('governanceRulesDialog.tabVoting')}
              </TabsTrigger>
              <TabsTrigger value="permissions" className={cn(NAVIGATION.tabs.trigger, 'flex-1')}>
                <Icon name="Users" className={NAVIGATION.tabs.iconDesktop} />
                {t('governanceRulesDialog.tabPermissions')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="elections" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Icon name="Vote" className="h-5 w-5" />
                    {t('governanceRulesDialog.representativeElections')}
                  </CardTitle>
                  <CardDescription>
                    {t('governanceRulesDialog.representativeElectionsDesc')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="term-months">{t('governanceRulesDialog.termLengthMonths')}</Label>
                      <Input
                        id="term-months"
                        type="number"
                        min="1"
                        max="60"
                        value={rules.representativeTermMonths}
                        onChange={(e) => handleRuleChange('representativeTermMonths', parseInt(e.target.value))}
                      />
                      <p className="text-sm text-muted-foreground">
                        {t('governanceRulesDialog.termLengthHelp')}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="term-limits">{t('governanceRulesDialog.termLimits')}</Label>
                      <Input
                        id="term-limits"
                        type="number"
                        min="0"
                        placeholder={t('values.noLimit')}
                        value={rules.representativeTermLimits || ''}
                        onChange={(e) => handleRuleChange('representativeTermLimits', e.target.value ? parseInt(e.target.value) : null)}
                      />
                      <p className="text-sm text-muted-foreground">
                        {t('governanceRulesDialog.termLimitsHelp')}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="voting-method">{t('governanceRulesDialog.votingMethod')}</Label>
                    <Select
                      value={rules.electionVotingMethod}
                      onValueChange={(value) => handleRuleChange('electionVotingMethod', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-[200]" sideOffset={4}>
                        <SelectItem value="simple_majority">{t('votingMethods.simple_majority')}</SelectItem>
                        <SelectItem value="ranked_choice">{t('votingMethods.ranked_choice')}</SelectItem>
                        <SelectItem value="approval">{t('votingMethods.approval')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      {getVotingMethodDescription(rules.electionVotingMethod || 'simple_majority')}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="quorum">{t('governanceRulesDialog.electionQuorum')}</Label>
                      <Input
                        id="quorum"
                        type="number"
                        min="0"
                        max="100"
                        step="5"
                        value={(rules.electionQuorumPercentage || 0) * 100}
                        onChange={(e) => handleRuleChange('electionQuorumPercentage', parseInt(e.target.value) / 100)}
                      />
                      <p className="text-sm text-muted-foreground">
                        {t('governanceRulesDialog.electionQuorumHelp')}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="notice-days">{t('governanceRulesDialog.noticePeriod')}</Label>
                      <Input
                        id="notice-days"
                        type="number"
                        min="1"
                        max="90"
                        value={rules.electionNoticeDays}
                        onChange={(e) => handleRuleChange('electionNoticeDays', parseInt(e.target.value))}
                      />
                      <p className="text-sm text-muted-foreground">
                        {t('governanceRulesDialog.noticePeriodHelp')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="voting" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Icon name="Settings" className="h-5 w-5" />
                    {t('governanceRulesDialog.generalVotingRules')}
                  </CardTitle>
                  <CardDescription>
                    {t('governanceRulesDialog.generalVotingRulesDesc')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="deadline-hours">{t('governanceRulesDialog.defaultDeadline')}</Label>
                      <Input
                        id="deadline-hours"
                        type="number"
                        min="1"
                        max="720"
                        value={rules.defaultVotingDeadlineHours}
                        onChange={(e) => handleRuleChange('defaultVotingDeadlineHours', parseInt(e.target.value))}
                      />
                      <p className="text-sm text-muted-foreground">
                        {t('governanceRulesDialog.defaultDeadlineHelp')}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="default-quorum">{t('governanceRulesDialog.defaultQuorum')}</Label>
                      <Input
                        id="default-quorum"
                        type="number"
                        min="0"
                        max="100"
                        step="5"
                        value={(rules.defaultQuorumPercentage || 0) * 100}
                        onChange={(e) => handleRuleChange('defaultQuorumPercentage', parseInt(e.target.value) / 100)}
                      />
                      <p className="text-sm text-muted-foreground">
                        {t('governanceRulesDialog.defaultQuorumHelp')}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="flex items-center gap-2">
                          <Icon name="Eye" className="h-4 w-4" />
                          {t('governanceRulesDialog.anonymousVoting')}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {t('governanceRulesDialog.anonymousVotingHelp')}
                        </p>
                      </div>
                      <Switch
                        checked={rules.anonymousVotingEnabled}
                        onCheckedChange={(checked) => handleRuleChange('anonymousVotingEnabled', checked)}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="flex items-center gap-2">
                          <Icon name="Settings" className="h-4 w-4" />
                          {t('governanceRulesDialog.voteChangesAllowed')}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {t('governanceRulesDialog.voteChangesAllowedHelp')}
                        </p>
                      </div>
                      <Switch
                        checked={rules.voteChangeAllowed}
                        onCheckedChange={(checked) => handleRuleChange('voteChangeAllowed', checked)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Icon name="Shield" className="h-5 w-5" />
                    {t('governanceRulesDialog.securityCompliance')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="flex items-center gap-2">
                        <Icon name="Lock" className="h-4 w-4" />
                        {t('governanceRulesDialog.tamperProof')}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {t('governanceRulesDialog.tamperProofHelp')}
                      </p>
                    </div>
                    <Switch
                      checked={rules.tamperProofEnabled}
                      onCheckedChange={(checked) => handleRuleChange('tamperProofEnabled', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="flex items-center gap-2">
                        <Icon name="FileText" className="h-4 w-4" />
                        {t('governanceRulesDialog.auditTrail')}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {t('governanceRulesDialog.auditTrailHelp')}
                      </p>
                    </div>
                    <Switch
                      checked={rules.auditTrailEnabled}
                      onCheckedChange={(checked) => handleRuleChange('auditTrailEnabled', checked)}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="permissions" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Icon name="Users" className="h-5 w-5" />
                    {t('governanceRulesDialog.representativePermissions')}
                  </CardTitle>
                  <CardDescription>
                    {t('governanceRulesDialog.representativePermissionsDesc')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>{t('governanceRulesDialog.createVotes')}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t('governanceRulesDialog.createVotesHelp')}
                      </p>
                    </div>
                    <Switch
                      checked={rules.representativeCanCreateVotes}
                      onCheckedChange={(checked) => handleRuleChange('representativeCanCreateVotes', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>{t('governanceRulesDialog.inviteMembers')}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t('governanceRulesDialog.inviteMembersHelp')}
                      </p>
                    </div>
                    <Switch
                      checked={rules.representativeCanInviteMembers}
                      onCheckedChange={(checked) => handleRuleChange('representativeCanInviteMembers', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>{t('governanceRulesDialog.manageDocuments')}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t('governanceRulesDialog.manageDocumentsHelp')}
                      </p>
                    </div>
                    <Switch
                      checked={rules.representativeCanManageDocuments}
                      onCheckedChange={(checked) => handleRuleChange('representativeCanManageDocuments', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>{t('governanceRulesDialog.approvalRequired')}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t('governanceRulesDialog.approvalRequiredHelp')}
                      </p>
                    </div>
                    <Switch
                      checked={rules.representativeApprovalRequired}
                      onCheckedChange={(checked) => handleRuleChange('representativeApprovalRequired', checked)}
                    />
                  </div>
                </CardContent>
              </Card>

              <Alert>
                <Icon name="AlertTriangle" className="h-4 w-4" />
                <AlertDescription>
                  <strong>{t('governanceRulesDialog.importantNotice')}</strong>{' '}
                  {t('governanceRulesDialog.importantNoticeBody')}
                </AlertDescription>
              </Alert>
            </TabsContent>
          </Tabs>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon('buttons.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? t('governanceRulesDialog.saving') : t('governanceRulesDialog.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription } from '../ui/alert';
import { Icon } from '../ui/Icon';
import { Organization, OrganizationGovernanceRules, User } from '../../types';
import { governanceApi } from '../../lib/api';
import { toast } from 'sonner';
import { logger } from '../../lib/logger';

interface ElectionCreationDialogProps {
  organization: Organization;
  currentUser: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  governanceRules?: OrganizationGovernanceRules | null;
}

export function ElectionCreationDialog({
  organization,
  currentUser,
  open,
  onOpenChange,
  onSuccess,
  governanceRules: governanceRulesProp,
}: ElectionCreationDialogProps) {
  const { t } = useTranslation('governance');
  const { t: tCommon } = useTranslation('common');
  const [creating, setCreating] = useState(false);
  const [governanceRules, setGovernanceRules] = useState<OrganizationGovernanceRules | null>(null);

  const [electionData, setElectionData] = useState({
    title: '',
    description: '',
    positionsAvailable: 1,
    termMonths: 12,
    votingStartDate: '',
    votingEndDate: '',
    nominationDeadline: ''
  });

  const initializeElectionData = (rules?: OrganizationGovernanceRules | null) => {
    const gr = rules ?? governanceRules;
    const now = new Date();
    const noticeDays = gr?.electionNoticeDays || 14;
    const votingStartDate = new Date(now.getTime() + noticeDays * 24 * 60 * 60 * 1000);
    const votingEndDate = new Date(votingStartDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const nominationDeadline = new Date(votingStartDate.getTime() - 3 * 24 * 60 * 60 * 1000);

    setElectionData({
      title: t('electionCreation.defaultTitle', { year: new Date().getFullYear() }),
      description: t('electionCreation.defaultDescription', {
        count: organization.representatives?.length || 0,
        organizationName: organization.name,
      }),
      positionsAvailable: organization.representatives?.length || 1,
      termMonths: gr?.representativeTermMonths || 12,
      votingStartDate: votingStartDate.toISOString().split('T')[0],
      votingEndDate: votingEndDate.toISOString().split('T')[0],
      nominationDeadline: nominationDeadline.toISOString().split('T')[0]
    });
  };

  useEffect(() => {
    if (open) {
      if (governanceRulesProp != null) {
        setGovernanceRules(governanceRulesProp);
        initializeElectionData(governanceRulesProp);
      } else {
        loadGovernanceRules();
      }
    }
  }, [open, organization.id, governanceRulesProp]);

  const loadGovernanceRules = async () => {
    try {
      const response = await governanceApi.getGovernanceRules(organization.id);
      setGovernanceRules(response.governanceRules);
      initializeElectionData(response.governanceRules);
    } catch (error) {
      logger.error('Failed to load governance rules:', error);
    }
  };

  const handleInputChange = (field: string, value: string | number) => {
    setElectionData(prev => ({ ...prev, [field]: value }));
  };

  const validateElectionData = () => {
    const errors: string[] = [];
    const v = t;

    if (!electionData.title.trim()) errors.push(v('electionCreation.validation.titleRequired'));
    if (!electionData.description.trim()) errors.push(v('electionCreation.validation.descriptionRequired'));
    if (electionData.positionsAvailable < 1) errors.push(v('electionCreation.validation.positionsMin'));
    if (electionData.termMonths < 1) errors.push(v('electionCreation.validation.termMin'));

    const now = new Date();
    const votingStart = new Date(electionData.votingStartDate);
    const votingEnd = new Date(electionData.votingEndDate);
    const nominationDeadline = new Date(electionData.nominationDeadline);

    if (votingStart <= now) errors.push(v('electionCreation.validation.startFuture'));
    if (votingEnd <= votingStart) errors.push(v('electionCreation.validation.endAfterStart'));
    if (nominationDeadline >= votingStart) errors.push(v('electionCreation.validation.nominationBeforeStart'));

    return errors;
  };

  const handleCreateElection = async () => {
    const errors = validateElectionData();
    if (errors.length > 0) {
      toast.error(t('pleaseFixErrors'));
      return;
    }

    setCreating(true);
    try {
      await governanceApi.createElection(organization.id, {
        title: electionData.title,
        description: electionData.description,
        positionsAvailable: electionData.positionsAvailable,
        termMonths: electionData.termMonths
      });

      toast.success(t('electionCreatedWithNomination'));
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      logger.error('Failed to create election:', error);
      toast.error(t('failedToCreateElection'));
    } finally {
      setCreating(false);
    }
  };

  const isRepresentative = organization.representatives?.includes(currentUser?.id ?? '');

  if (!isRepresentative) {
    return null;
  }

  const noticeDays = governanceRules?.electionNoticeDays || 14;
  const minStartDate = new Date(Date.now() + noticeDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const votingMethodKey = governanceRules?.electionVotingMethod ?? 'simple_majority';
  const votingMethodLabel = t(`votingMethods.${votingMethodKey}`, {
    defaultValue: t('values.simpleMajority'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="Vote" className="h-5 w-5" />
            {t('electionCreation.title')}
          </DialogTitle>
          <DialogDescription>
            {t('electionCreation.description', { name: organization.name })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon name="Info" className="h-5 w-5" />
                {t('electionCreation.electionDetails')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">{t('electionCreation.electionTitle')}</Label>
                <Input
                  id="title"
                  value={electionData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  placeholder={t('electionCreation.titlePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('electionCreation.descriptionLabel')}</Label>
                <Textarea
                  id="description"
                  value={electionData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder={t('electionCreation.descriptionPlaceholder')}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="positions">{t('electionCreation.positionsAvailable')}</Label>
                  <Input
                    id="positions"
                    type="number"
                    min="1"
                    max="20"
                    value={electionData.positionsAvailable}
                    onChange={(e) => handleInputChange('positionsAvailable', parseInt(e.target.value))}
                  />
                  <p className="text-sm text-muted-foreground">
                    {t('electionCreation.positionsHelp')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="term">{t('electionCreation.termLength')}</Label>
                  <Input
                    id="term"
                    type="number"
                    min="1"
                    max="60"
                    value={electionData.termMonths}
                    onChange={(e) => handleInputChange('termMonths', parseInt(e.target.value))}
                  />
                  <p className="text-sm text-muted-foreground">
                    {t('electionCreation.termLengthHelp')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon name="Calendar" className="h-5 w-5" />
                {t('electionCreation.timeline')}
              </CardTitle>
              <CardDescription>
                {t('electionCreation.timelineDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Icon name="AlertTriangle" className="h-4 w-4" />
                <AlertDescription>
                  {t('electionCreation.noticeAlert', { days: noticeDays })}
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nomination-deadline">{t('electionCreation.nominationDeadline')}</Label>
                  <Input
                    id="nomination-deadline"
                    type="date"
                    value={electionData.nominationDeadline}
                    onChange={(e) => handleInputChange('nominationDeadline', e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    max={electionData.votingStartDate}
                  />
                  <p className="text-sm text-muted-foreground">
                    {t('electionCreation.nominationDeadlineHelp')}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="voting-start">{t('electionCreation.votingStarts')}</Label>
                    <Input
                      id="voting-start"
                      type="date"
                      value={electionData.votingStartDate}
                      onChange={(e) => handleInputChange('votingStartDate', e.target.value)}
                      min={minStartDate}
                    />
                    <p className="text-sm text-muted-foreground">
                      {t('electionCreation.votingStartsHelp')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="voting-end">{t('electionCreation.votingEnds')}</Label>
                    <Input
                      id="voting-end"
                      type="date"
                      value={electionData.votingEndDate}
                      onChange={(e) => handleInputChange('votingEndDate', e.target.value)}
                      min={electionData.votingStartDate}
                    />
                    <p className="text-sm text-muted-foreground">
                      {t('electionCreation.votingEndsHelp')}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('electionCreation.summary')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">{t('electionCreation.organization')}</span>
                  <p className="text-muted-foreground">{organization.name}</p>
                </div>
                <div>
                  <span className="font-medium">{t('electionCreation.positions')}</span>
                  <p className="text-muted-foreground">{electionData.positionsAvailable}</p>
                </div>
                <div>
                  <span className="font-medium">{t('electionCreation.votingMethod')}</span>
                  <p className="text-muted-foreground">{votingMethodLabel}</p>
                </div>
                <div>
                  <span className="font-medium">{t('electionCreation.quorumRequired')}</span>
                  <p className="text-muted-foreground">{Math.round((governanceRules?.electionQuorumPercentage || 0.5) * 100)}%</p>
                </div>
                <div>
                  <span className="font-medium">{t('electionCreation.anonymousVoting')}</span>
                  <p className="text-muted-foreground">
                    {governanceRules?.anonymousVotingEnabled ? t('tab.yes') : t('tab.no')}
                  </p>
                </div>
                <div>
                  <span className="font-medium">{t('electionCreation.termLengthLabel')}</span>
                  <p className="text-muted-foreground">
                    {t('tab.monthsUnit', { count: electionData.termMonths })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon('buttons.cancel')}
          </Button>
          <Button
            onClick={handleCreateElection}
            disabled={creating}
            className="gap-2"
          >
            <Icon name="Vote" className="h-4 w-4" />
            {creating ? t('electionCreation.creating') : t('electionCreation.create')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

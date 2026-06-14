import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Icon } from '../ui/Icon';
import { Organization, RepresentativeElection, ElectionCandidate, User } from '../../types';
import { governanceApi } from '../../lib/api';
import { toast } from 'sonner';
import { logger } from '../../lib/logger';
import { useTimezone } from '../../hooks/useTimezone';
import { COLORS, RADIUS } from '../../lib/designSystem';
import { cn } from '../ui/utils';

interface CandidateNominationInterfaceProps {
  organization: Organization;
  election: RepresentativeElection;
  currentUser: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CandidateNominationInterface({
  organization,
  election,
  currentUser,
  open,
  onOpenChange,
  onSuccess
}: CandidateNominationInterfaceProps) {
  const { t } = useTranslation('governance');
  const { t: tCommon } = useTranslation('common');
  const { formatDate } = useTimezone();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [candidates, setCandidates] = useState<ElectionCandidate[]>([]);
  const [userNomination, setUserNomination] = useState<ElectionCandidate | null>(null);
  const [showNominationForm, setShowNominationForm] = useState(false);

  const [nominationData, setNominationData] = useState({
    nominationStatement: '',
    qualifications: '',
    experience: ''
  });

  useEffect(() => {
    if (open && election) {
      loadCandidates();
    }
  }, [open, election]);

  const loadCandidates = async () => {
    setLoading(true);
    try {
      const response = await governanceApi.getElections(organization.id);
      const currentElection = response.elections?.find(e => e.id === election.id);
      if (currentElection?.candidates) {
        setCandidates(currentElection.candidates);
        // Check if current user has nominated
        const userNom = currentElection.candidates.find((c: ElectionCandidate) => c.userId === currentUser.id);
        setUserNomination(userNom || null);
      }
    } catch (error) {
      logger.error('Failed to load candidates:', error);
      toast.error(t('failedToLoadCandidates'));
    } finally {
      setLoading(false);
    }
  };

  const handleNominationSubmit = async () => {
    if (!nominationData.nominationStatement.trim()) {
      toast.error(t('nominationStatementRequired'));
      return;
    }

    setSubmitting(true);
    try {
      await governanceApi.nominateCandidate(organization.id, election.id, {
        candidateUserId: currentUser.id,
        nominationStatement: nominationData.nominationStatement
      });

      toast.success(t('nominationSubmitted'));
      setShowNominationForm(false);
      setNominationData({ nominationStatement: '', qualifications: '', experience: '' });
      loadCandidates(); // Refresh candidates list
      onSuccess?.();
    } catch (error) {
      logger.error('Failed to submit nomination:', error);
      toast.error(t('failedToSubmitNomination'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdrawNomination = async () => {
    if (!userNomination) return;

    try {
      // Note: We might need to add a withdraw endpoint, for now we'll show a message
      toast.info(t('withdrawalNotImplemented'));
    } catch (error) {
      logger.error('Failed to withdraw nomination:', error);
      toast.error(t('failedToWithdrawNomination'));
    }
  };

  const getNominationStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className={COLORS.statusBadge.success}>{t('candidateNomination.statusApproved')}</Badge>;
      case 'pending':
        return <Badge className={COLORS.statusBadge.warning}>{t('candidateNomination.statusPending')}</Badge>;
      case 'rejected':
        return <Badge className={COLORS.statusBadge.error}>{t('candidateNomination.statusRejected')}</Badge>;
      default:
        return <Badge variant="secondary">{t('candidateNomination.statusUnknown')}</Badge>;
    }
  };

  const isActiveMember = organization.members?.some(m => m.userId === currentUser.id && m.status === 'active');
  const nominationDeadline = election.nominationDeadline ? new Date(election.nominationDeadline) : null;
  const isNominationOpen = nominationDeadline ? new Date() < nominationDeadline : true;
  const canNominate = isActiveMember && isNominationOpen && !userNomination;

  if (!isActiveMember) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="AlertTriangle" className={cn('h-5 w-5', COLORS.status.error)} />
              {t('candidateNomination.accessDenied')}
            </DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            {t('candidateNomination.accessDeniedDesc')}
          </p>
          <Button onClick={() => onOpenChange(false)}>{tCommon('buttons.close')}</Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="Vote" className="h-5 w-5" />
            {t('candidateNomination.title', { title: election.electionTitle })}
          </DialogTitle>
          <DialogDescription>
            {t('candidateNomination.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Nomination Status & Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Icon name="User" className="h-5 w-5" />
                  {t('candidateNomination.yourStatus')}
                </span>
                {nominationDeadline && (
                  <div className="text-sm text-muted-foreground">
                    {t('candidateNomination.deadline', { date: formatDate(nominationDeadline) })}
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {userNomination ? (
                <div className="space-y-4">
                  <div className={cn(RADIUS.panel, "flex items-center justify-between p-4 border", COLORS.statusBg.success, "border-[var(--status-approved-border)]")}>
                    <div className="flex items-center gap-3">
                      <Icon name="CheckCircle" className={`h-5 w-5 ${COLORS.status.success}`} />
                      <div>
                        <div className={cn('font-medium', COLORS.status.success)}>{t('candidateNomination.youAreNominated')}</div>
                        <div className={cn('text-sm', COLORS.status.success)}>
                          {t('candidateNomination.status')} {getNominationStatusBadge(userNomination.status)}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleWithdrawNomination}
                      disabled={userNomination.status === 'approved'}
                    >
                      {t('candidateNomination.withdraw')}
                    </Button>
                  </div>

                  {userNomination.nominationStatement && (
                    <div>
                      <Label className="text-sm font-medium">{t('candidateNomination.yourStatement')}</Label>
                      <p className="mt-1 p-3 bg-muted rounded text-sm">
                        {userNomination.nominationStatement}
                      </p>
                    </div>
                  )}
                </div>
              ) : canNominate ? (
                <div className="text-center py-6">
                  <User className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <h3 className="text-lg font-semibold mb-2">{t('candidateNomination.readyToRun')}</h3>
                  <p className="text-muted-foreground mb-4">
                    {t('candidateNomination.readyToRunDesc')}
                  </p>
                  <Button onClick={() => setShowNominationForm(true)}>
                    <Icon name="Plus" className="h-4 w-4 mr-2" />
                    {t('candidateNomination.submitNomination')}
                  </Button>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Icon name="Clock" className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <h3 className="text-lg font-semibold mb-2">
                    {isNominationOpen ? t('candidateNomination.alreadyNominated') : t('candidateNomination.nominationsClosed')}
                  </h3>
                  <p className="text-muted-foreground">
                    {isNominationOpen
                      ? t('candidateNomination.alreadySubmitted')
                      : t('candidateNomination.periodEnded')
                    }
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Nomination Form */}
          {showNominationForm && (
            <Card>
              <CardHeader>
                <CardTitle>{t('candidateNomination.submitYourNomination')}</CardTitle>
                <CardDescription>
                  {t('candidateNomination.submitYourNominationDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nomination-statement">{t('candidateNomination.statementLabel')}</Label>
                  <Textarea
                    id="nomination-statement"
                    placeholder={t('candidateNomination.nominationStatementPlaceholder')}
                    value={nominationData.nominationStatement}
                    onChange={(e) => setNominationData(prev => ({ ...prev, nominationStatement: e.target.value }))}
                    rows={4}
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    {t('candidateNomination.statementHelp')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="qualifications">{t('candidateNomination.qualificationsLabel')}</Label>
                  <Textarea
                    id="qualifications"
                    placeholder={t('candidateNomination.qualificationsPlaceholder')}
                    value={nominationData.qualifications}
                    onChange={(e) => setNominationData(prev => ({ ...prev, qualifications: e.target.value }))}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="experience">{t('candidateNomination.experienceLabel')}</Label>
                  <Textarea
                    id="experience"
                    placeholder={t('candidateNomination.experiencePlaceholder')}
                    value={nominationData.experience}
                    onChange={(e) => setNominationData(prev => ({ ...prev, experience: e.target.value }))}
                    rows={3}
                  />
                </div>

                <Alert>
                  <Icon name="AlertTriangle" className="h-4 w-4" />
                  <AlertDescription>
                    {t('candidateNomination.reviewNotice')}
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}

          {/* All Candidates List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon name="Vote" className="h-5 w-5" />
                {t('candidateNomination.allCandidates', { count: candidates.length })}
              </CardTitle>
              <CardDescription>
                {t('candidateNomination.allCandidatesDesc', { count: election.positionsAvailable })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className={cn("animate-spin h-8 w-8 border-b-2 border-blue-600", RADIUS.pill)}></div>
                </div>
              ) : candidates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>{t('candidateNomination.noCandidates')}</p>
                  <p className="text-sm">{t('candidateNomination.beFirst')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {candidates.map((candidate) => (
                    <div key={candidate.id} className={cn("flex items-center justify-between p-4 border", RADIUS.panel)}>
                      <div className="flex items-center gap-3">
                        <div className={cn('w-10 h-10 flex items-center justify-center', RADIUS.pill, COLORS.statusBg.info)}>
                          <User className={`h-5 w-5 ${COLORS.status.info}`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-medium">
                              {candidate.user?.name || t('values.unknownCandidate')}
                              {candidate.userId === currentUser?.id && (
                                <span className={`text-sm ml-2 ${COLORS.status.info}`}>{t('values.you')}</span>
                              )}
                            </div>
                            {getNominationStatusBadge(candidate.status)}
                          </div>
                          {candidate.nominationStatement && (
                            <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {candidate.nominationStatement}
                            </div>
                          )}
                          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                            <span>{t('candidateNomination.nominatedOn', { date: formatDate(candidate.nominatedAt) })}</span>
                            {candidate.status === 'approved' && (
                              <span className={COLORS.status.success}>{t('candidateNomination.approvedForElection')}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          {showNominationForm ? (
            <>
              <Button variant="outline" onClick={() => setShowNominationForm(false)}>
                {tCommon('buttons.cancel')}
              </Button>
              <Button
                onClick={handleNominationSubmit}
                disabled={submitting || !nominationData.nominationStatement.trim()}
              >
                {submitting ? t('candidateNomination.submitting') : t('candidateNomination.submitNomination')}
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>{tCommon('buttons.close')}</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

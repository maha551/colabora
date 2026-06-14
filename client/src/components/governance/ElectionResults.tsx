import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Alert, AlertDescription } from '../ui/alert';
import { Icon } from '../ui/Icon';
import { cn } from '../ui/utils';
import { Organization, RepresentativeElection, ElectionCandidate, User } from '../../types';
import { governanceApi } from '../../lib/api';
import { toast } from 'sonner';
import { logger } from '../../lib/logger';
import { useTimezone } from '../../hooks/useTimezone';
import { COLORS, RADIUS } from '../../lib/designSystem';

interface ElectionResultsProps {
  organization: Organization;
  election: RepresentativeElection;
  currentUser: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface ElectionResult {
  candidate: ElectionCandidate;
  votesReceived: number;
  votePercentage: number;
  elected: boolean;
  position?: number;
}

export function ElectionResults({
  organization,
  election,
  currentUser,
  open,
  onOpenChange,
  onSuccess
}: ElectionResultsProps) {
  const { t } = useTranslation('governance');
  const { t: tCommon } = useTranslation('common');
  const { formatDate, formatTime } = useTimezone();
  const [loading, setLoading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [results, setResults] = useState<ElectionResult[]>([]);
  const [electionStats, setElectionStats] = useState({
    totalVotes: 0,
    turnoutPercentage: 0,
    quorumReached: false,
    canComplete: false
  });

  useEffect(() => {
    if (open && election) {
      loadElectionResults();
    }
  }, [open, election]);

  const loadElectionResults = async () => {
    setLoading(true);
    try {
      const response = await governanceApi.getElectionResults(organization.id, election.id);

      const { election: electionData, candidates, stats } = response;

      // Convert candidates to ElectionResult format
      const results: ElectionResult[] = candidates.map((candidate: ElectionCandidate, index: number) => ({
        candidate: {
          id: candidate.id,
          electionId: election.id,
          userId: candidate.userId,
          user: { name: (candidate as unknown as { userName?: string; user_name?: string }).userName || (candidate as unknown as { userName?: string; user_name?: string }).user_name || 'Unknown' },
          nominatedAt: (candidate as unknown as { nominatedAt?: string; nominated_at?: string }).nominatedAt || (candidate as unknown as { nominatedAt?: string; nominated_at?: string }).nominated_at,
          nominationStatement: (candidate as unknown as { nominationStatement?: string; nomination_statement?: string }).nominationStatement || (candidate as unknown as { nominationStatement?: string; nomination_statement?: string }).nomination_statement,
          acceptedNomination: true,
          votesReceived: (candidate as unknown as { votes_received?: number }).votes_received || 0,
          elected: false
        } as ElectionCandidate,
        votesReceived: candidate.votes_received || 0,
        votePercentage: stats.totalVotes > 0 ? ((candidate.votes_received || 0) / stats.totalVotes) * 100 : 0,
        elected: (candidate.elected_position && candidate.elected_position <= stats.positionsAvailable),
        position: candidate.elected_position
      }));

      setResults(results);

      setElectionStats({
        totalVotes: stats.totalVotes,
        turnoutPercentage: stats.quorumPercentage,
        quorumReached: stats.quorumReached,
        canComplete: electionData.status === 'active' && stats.quorumReached
      });

    } catch (error) {
      logger.error('Failed to load election results:', error);
      toast.error(t('failedToLoadElectionResults'));
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteElection = async () => {
    setCompleting(true);
    try {
      await governanceApi.completeElection(organization.id, election.id);
      toast.success(t('electionCompleted'));
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      logger.error('Failed to complete election:', error);
      toast.error(t('failedToCompleteElection'));
    } finally {
      setCompleting(false);
    }
  };

  const isRepresentative = organization.representatives?.includes(currentUser?.id ?? '');
  const electionEnded = new Date(election.votingEndsAt || '') < new Date();
  const canCompleteElection = isRepresentative && election.status === 'active' && electionStats.canComplete;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="Trophy" className="h-5 w-5" />
            {t('electionResults.title', { title: election.electionTitle })}
          </DialogTitle>
          <DialogDescription>
            {t('electionResults.description')}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className={cn("animate-spin h-8 w-8 border-b-2 border-blue-600", RADIUS.pill)}></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Election Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon name="Vote" className="h-5 w-5" />
                  {t('electionResults.summary')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <div className={`text-2xl font-bold ${COLORS.status.info}`}>{results.length}</div>
                    <div className="text-sm text-muted-foreground">{t('electionResults.candidates')}</div>
                  </div>
                  <div>
                    <div className={`text-2xl font-bold ${COLORS.status.success}`}>{electionStats.totalVotes}</div>
                    <div className="text-sm text-muted-foreground">{t('electionResults.totalVotes')}</div>
                  </div>
                  <div>
                    <div className={`text-2xl font-bold ${electionStats.quorumReached ? COLORS.status.success : COLORS.status.error}`}>
                      {Math.round(electionStats.turnoutPercentage)}%
                    </div>
                    <div className="text-sm text-muted-foreground">{t('electionResults.turnout')}</div>
                  </div>
                  <div>
                    <div className={`text-2xl font-bold ${electionStats.quorumReached ? COLORS.status.success : COLORS.status.error}`}>
                      {electionStats.quorumReached ? '✓' : '✗'}
                    </div>
                    <div className="text-sm text-muted-foreground">{t('electionResults.quorum')}</div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span>{t('electionResults.voterTurnout')}</span>
                    <span>{t('electionResults.votesCount', {
                      percent: Math.round(electionStats.turnoutPercentage),
                      count: electionStats.totalVotes,
                    })}</span>
                  </div>
                  <Progress value={electionStats.turnoutPercentage} className="h-2" />
                  <div className="text-xs text-muted-foreground mt-1">
                    {t('electionResults.requiredQuorum', { percent: election.quorumPercentage || 50 })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Election Status */}
            {!electionEnded && (
              <Alert>
                <Icon name="Clock" className="h-4 w-4" />
                <AlertDescription>
                  <strong>{t('electionResults.stillInProgress')}</strong>{' '}
                  {t('electionResults.stillInProgressEnds', {
                    date: formatDate(election.votingEndsAt || ''),
                    time: formatTime(election.votingEndsAt || ''),
                  })}
                </AlertDescription>
              </Alert>
            )}

            {electionEnded && !electionStats.quorumReached && (
              <Alert className={`border-[var(--status-rejected-border)] ${COLORS.statusBg.error}`}>
                <Icon name="AlertTriangle" className={cn('h-4 w-4', COLORS.status.error)} />
                <AlertDescription className={COLORS.status.error}>
                  <strong>{t('electionResults.quorumNotReached')}</strong>{' '}
                  {t('electionResults.quorumNotReachedDescription')}
                </AlertDescription>
              </Alert>
            )}

            {/* Results Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon name="Trophy" className="h-5 w-5" />
                  {t('electionResults.resultsTitle')}
                </CardTitle>
                <CardDescription>
                  {t('electionResults.resultsDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {results.map((result, index) => (
                    <div
                      key={result.candidate.id}
                      className={cn(
                        'flex items-center justify-between p-4 border',
                        RADIUS.panel,
                        result.elected
                          ? cn(COLORS.statusBg.success, 'border-[var(--status-approved-border)]')
                          : 'bg-card border-border'
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(RADIUS.pill, "w-8 h-8 flex items-center justify-center text-sm font-bold", 
                          result.elected
                            ? 'bg-[var(--status-approved-solid)] text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        )}>
                          {result.position || (index + 1)}
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-medium">
                              {result.candidate.user?.name || t('values.unknownCandidate')}
                            </div>
                            {result.elected && (
                              <Badge className={COLORS.statusBadge.success}>
                                <Icon name="Trophy" className="h-3 w-3 mr-1" />
                                {t('electionResults.elected')}
                              </Badge>
                            )}
                          </div>

                          {result.candidate.nominationStatement && (
                            <div className="text-sm text-muted-foreground mt-1 line-clamp-1">
                              {result.candidate.nominationStatement}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-bold">
                          {t('electionResults.voteCount', { count: result.votesReceived })}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {Math.round(result.votePercentage)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {results.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Icon name="Vote" className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>{t('electionResults.noResults')}</p>
                    <p className="text-sm">{t('electionResults.noResultsHint')}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Elected Representatives */}
            {results.some(r => r.elected) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Icon name="Users" className="h-5 w-5" />
                    {t('electionResults.newRepresentatives')}
                  </CardTitle>
                  <CardDescription>
                    {t('electionResults.newRepresentativesDesc')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    {results
                      .filter(r => r.elected)
                      .sort((a, b) => (a.position || 0) - (b.position || 0))
                      .map(result => (
                        <div key={result.candidate.id} className={cn('flex items-center gap-3 p-3 border', RADIUS.panel, COLORS.statusBg.success, 'border-[var(--status-approved-border)]')}>
                          <div className={cn("w-10 h-10 flex items-center justify-center bg-[var(--status-approved-solid)]", RADIUS.pill)}>
                            <Icon name="CheckCircle" className="h-5 w-5 text-primary-foreground" />
                          </div>
                          <div className="flex-1">
                            <div className={cn('font-medium', COLORS.status.success)}>
                              {result.candidate.user?.name || t('values.unknownRepresentative')}
                            </div>
                            <div className={cn('text-sm', COLORS.status.success)}>
                              {t('electionResults.positionVotes', {
                                position: result.position,
                                votes: result.votesReceived,
                                percent: Math.round(result.votePercentage),
                              })}
                            </div>
                            <div className={`text-xs mt-1 ${COLORS.status.success}`}>
                              {t('electionResults.termStarts', { months: election.termMonths })}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Election Completion Actions */}
            {canCompleteElection && (
              <Card className={cn('border-[var(--status-proposed-border)]', COLORS.statusBg.active)}>
                <CardHeader>
                  <CardTitle className={cn('flex items-center gap-2', COLORS.status.active)}>
                    <Icon name="CheckCircle" className="h-5 w-5" />
                    {t('electionResults.completeTitle')}
                  </CardTitle>
                  <CardDescription className={COLORS.status.active}>
                    {t('electionResults.completeDesc')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert className="mb-4">
                    <Icon name="AlertTriangle" className="h-4 w-4" />
                    <AlertDescription>
                      {t('electionResults.completeNoticeIntro')}
                      <ul className="list-disc list-inside mt-2 space-y-1">
                        <li>{t('electionResults.assignRepresentatives')}</li>
                        <li>{t('electionResults.archiveResults')}</li>
                        <li>{t('electionResults.updateTerms')}</li>
                        <li>{t('electionResults.notifyMembers')}</li>
                      </ul>
                    </AlertDescription>
                  </Alert>

                  <Button
                    onClick={handleCompleteElection}
                    disabled={completing}
                    className="w-full"
                    size="lg"
                  >
                    {completing ? t('electionResults.completing') : t('electionResults.completeAction')}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon('buttons.close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Progress } from '../ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Icon } from '../ui/Icon';
import { cn } from '../ui/utils';
import { Organization, RepresentativeElection, ElectionCandidate, User } from '../../types';
import { governanceApi } from '../../lib/api';
import { toast } from 'sonner';
import { logger } from '../../lib/logger';
import { useTimezone } from '../../hooks/useTimezone';
import { COLORS, RADIUS } from '../../lib/designSystem';
import { useVoteSubmission } from '../../hooks/useVoteSubmission';
import { useVoteStatus } from '../../hooks/useVoteStatus';
import { useVoteReceiptCapture } from '../../hooks/useVoteReceiptCapture';
import { VoteReceiptDialog } from '../verification/VoteReceiptDialog';
import { VoteReceiptBadge } from '../verification/VoteReceiptBadge';
import { getLocalReceipt } from '../../lib/verification/voteReceipt';

interface ElectionVotingInterfaceProps {
  organization: Organization;
  election: RepresentativeElection;
  currentUser: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ElectionVotingInterface({
  organization,
  election,
  currentUser,
  open,
  onOpenChange,
  onSuccess
}: ElectionVotingInterfaceProps) {
  const { t } = useTranslation('governance');
  const { formatDate } = useTimezone();
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<ElectionCandidate[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [voteConfirmed, setVoteConfirmed] = useState(false);

  // Use vote status hook
  const { hasVoted, setHasVoted, checkVoteStatus } = useVoteStatus({
    currentUserId: currentUser?.id,
    checkVoteFn: async () => {
      const response = await governanceApi.getUserElectionVoteStatus(organization.id, election.id);
      return { hasVoted: response.hasVoted, voteData: response.voteData };
    },
    onVoteFound: (voteData: unknown) => {
      // Pre-populate vote selections if user already voted
      const data = voteData as { candidateRanking?: string[]; approvedCandidates?: string[]; candidateId?: string };
      if (election.votingMethod === 'ranked_choice' && data.candidateRanking) {
        setSelectedCandidates(data.candidateRanking);
      } else if (election.votingMethod === 'approval' && data.approvedCandidates) {
        setSelectedCandidates(data.approvedCandidates);
      } else if (data.candidateId) {
        setSelectedCandidates([data.candidateId]);
      }
    },
    autoCheck: false, // We'll call it manually in useEffect
  });

  // Use vote submission hook
  const { isSubmitting: voting, submitVote } = useVoteSubmission({
    onSuccess: () => {
      setHasVoted(true);
      onSuccess?.();
    },
    successMessage: 'Your vote has been cast successfully',
    errorMessage: 'Failed to cast vote. Please try again.',
  });

  const {
    lastReceipt,
    dialogOpen: receiptDialogOpen,
    setDialogOpen: setReceiptDialogOpen,
    captureFromResponse,
  } = useVoteReceiptCapture({
    userId: currentUser?.id,
    organizationId: organization.id,
    contestTitle: election.electionTitle,
  });

  const storedReceipt =
    lastReceipt ??
    (currentUser?.id
      ? getLocalReceipt(
          currentUser.id,
          organization.id,
          'representative_election',
          election.votingSessionId || election.id
        )
      : null);

  useEffect(() => {
    if (open && election) {
      loadCandidates();
      checkVoteStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, election]);

  const loadCandidates = async () => {
    setLoading(true);
    try {
      const response = await governanceApi.getElections(organization.id);
      const currentElection = response.elections?.find(e => e.id === election.id);
      if (currentElection?.candidates) {
        setCandidates(currentElection.candidates);
      }
    } catch (error) {
      logger.error('Failed to load candidates:', error);
      toast.error(t('failedToLoadCandidates'));
    } finally {
      setLoading(false);
    }
  };

  const handleCandidateSelect = (candidateId: string, checked: boolean) => {
    if (election.votingMethod === 'approval') {
      // Approval voting - multiple selections allowed
      setSelectedCandidates(prev =>
        checked
          ? [...prev, candidateId]
          : prev.filter(id => id !== candidateId)
      );
    } else {
      // Single selection for ranked choice and simple majority
      setSelectedCandidates(checked ? [candidateId] : []);
    }
  };

  const handleRankedChoiceSelect = (candidateId: string, rank: number) => {
    const newSelections = [...selectedCandidates];
    newSelections[rank - 1] = candidateId;
    setSelectedCandidates(newSelections.slice(0, election.positionsAvailable));
  };

  const canVote = () => {
    if (hasVoted) return false;
    if (selectedCandidates.length === 0) return false;

    if (election.votingMethod === 'ranked_choice') {
      return selectedCandidates.length >= Math.min(3, candidates.length); // At least 3 rankings or all candidates
    }

    return true;
  };

  const handleVote = async () => {
    if (!canVote() || !voteConfirmed) return;

    await submitVote(async () => {
      const voteData: Record<string, unknown> = {};

      if (election.votingMethod === 'ranked_choice') {
        voteData.candidateRanking = selectedCandidates;
      } else if (election.votingMethod === 'approval') {
        voteData.approvedCandidates = selectedCandidates;
      } else {
        voteData.candidateId = selectedCandidates[0];
      }

      const response = await governanceApi.castElectionVote(organization.id, election.id, voteData);
      await captureFromResponse(response, {
        contestId: response.contestId || election.votingSessionId || election.id,
        voteType: 'representative_election',
      });
      return response;
    });
  };

  const isActiveMember = organization.members?.some(m => m.userId === currentUser.id && m.status === 'active');

  if (!isActiveMember) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="AlertTriangle" className={cn('h-5 w-5', COLORS.status.error)} />
              {t('electionVoting.accessDenied')}
            </DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            {t('electionVoting.onlyActiveMembersCanVote')}
          </p>
          <Button onClick={() => onOpenChange(false)}>{t('electionVoting.close')}</Button>
        </DialogContent>
      </Dialog>
    );
  }

  const votingProgress = election.totalVoters > 0 ? (election.votesCast / election.totalVoters) * 100 : 0;
  const timeRemaining = new Date(election.votingEndsAt) > new Date()
    ? Math.ceil((new Date(election.votingEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;
  const isPublicElection = !election.anonymousVoting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="Vote" className="h-5 w-5" />
            {election.electionTitle}
          </DialogTitle>
          <DialogDescription>
            {election.electionDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className={cn("animate-spin h-8 w-8 border-b-2 border-[var(--status-active-solid)]", RADIUS.pill)}></div>
            </div>
          ) : hasVoted ? (
            <div className="text-center py-8">
              <Icon name="CheckCircle" className={cn('h-16 w-16 mx-auto mb-4', COLORS.status.success)} />
              <h3 className={cn('text-lg font-semibold mb-2', COLORS.status.success)}>{t('electionVoting.voteCastSuccessfully')}</h3>
              <p className="text-muted-foreground mb-4">
                {isPublicElection
                  ? t('electionVoting.thankYouParticipatingPublic')
                  : t('electionVoting.thankYouParticipating')}
              </p>
              <Button onClick={() => onOpenChange(false)}>{t('electionVoting.close')}</Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Election Status */}
              <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-center">
                    <div className={cn('text-lg font-bold', COLORS.status.info)}>{candidates.length}</div>
                    <div className="text-muted-foreground">{t('electionVoting.candidates')}</div>
                  </div>
                  <div className="text-center">
                    <div className={cn('text-lg font-bold', COLORS.status.success)}>{election.votesCast}</div>
                    <div className="text-muted-foreground">{t('electionVoting.votesCast')}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-orange-600">{timeRemaining}</div>
                    <div className="text-muted-foreground">{t('electionVoting.daysLeft')}</div>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span>{t('electionVoting.votingProgress')}</span>
                    <span>{Math.round(votingProgress)}% ({election.votesCast}/{election.totalVoters})</span>
                  </div>
                  <Progress value={votingProgress} className="h-2" />
                </div>
              </CardContent>
            </Card>

            {/* Voting Method Info */}
            <Alert>
              <Icon name="Shield" className="h-4 w-4" />
              <AlertDescription>
                <strong>{t('electionVoting.votingMethod')}</strong> {election.votingMethod?.replace('_', ' ')} •
                <strong>{t('electionVoting.privacy')}</strong> {election.anonymousVoting ? t('electionVoting.anonymous') : t('electionVoting.public')} •
                <strong>{t('electionVoting.positions')}</strong> {election.positionsAvailable}
                {isPublicElection && (
                  <>
                    <br />
                    {t('electionVoting.publicVoteNotice')}
                  </>
                )}
              </AlertDescription>
            </Alert>

            {/* Candidates List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon name="Users" className="h-5 w-5" />
                  {t('electionVoting.candidates')}
                </CardTitle>
                <CardDescription>
                  {election.votingMethod === 'ranked_choice' ? t('electionVoting.selectRankedPreferences') : t('electionVoting.selectChoices')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {candidates.map((candidate, index) => (
                    <div key={candidate.id} className={cn("flex items-center space-x-3 p-3 border", RADIUS.panel)}>
                      {election.votingMethod === 'ranked_choice' ? (
                        // Ranked choice voting
                        <Select
                          value={selectedCandidates.findIndex(id => id === candidate.id) + 1}
                          onValueChange={(rank) => handleRankedChoiceSelect(candidate.id, parseInt(rank))}
                        >
                          <SelectTrigger className="w-16">
                            <SelectValue placeholder="#" />
                          </SelectTrigger>
                          <SelectContent className="z-[200]" sideOffset={4}>
                            {Array.from({ length: Math.min(election.positionsAvailable, candidates.length) }, (_, i) => (
                              <SelectItem key={i + 1} value={String(i + 1)}>
                                {i + 1}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        // Single choice or approval voting
                        <Checkbox
                          checked={selectedCandidates.includes(candidate.id)}
                          onCheckedChange={(checked) => handleCandidateSelect(candidate.id, checked as boolean)}
                        />
                      )}

                      <div className="flex-1">
                        <div className="font-medium">{candidate.user?.name || t('electionVoting.unknownCandidate')}</div>
                        {candidate.nominationStatement && (
                          <div className="text-sm text-muted-foreground mt-1">
                            {candidate.nominationStatement}
                          </div>
                        )}
                        <div className="flex gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            {t('electionVoting.nominated', { date: formatDate(candidate.nominatedAt) })}
                          </Badge>
                          {candidate.userId === currentUser.id && (
                            <Badge variant="secondary" className={cn('text-xs', COLORS.statusBadge.info)}>
                              {t('electionVoting.yourNomination')}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {candidates.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Icon name="Users" className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>{t('electionVoting.noCandidatesNominated')}</p>
                    <p className="text-sm">{t('electionVoting.checkBackOrNominate')}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Vote Confirmation */}
            {selectedCandidates.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Icon name="CheckCircle" className="h-5 w-5" />
                    {t('electionVoting.confirmYourVote')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className={cn("p-4 bg-muted", RADIUS.panel)}>
                    <h4 className="font-medium mb-2">{t('electionVoting.yourSelection')}</h4>
                    {election.votingMethod === 'ranked_choice' ? (
                      <div className="space-y-1">
                        {selectedCandidates.map((candidateId, rank) => {
                          const candidate = candidates.find(c => c.id === candidateId);
                          return (
                            <div key={candidateId} className="text-sm">
                              {rank + 1}. {candidate?.user?.name || t('electionVoting.unknownCandidate')}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {selectedCandidates.map(candidateId => {
                          const candidate = candidates.find(c => c.id === candidateId);
                          return (
                            <div key={candidateId} className="text-sm">
                              • {candidate?.user?.name || t('electionVoting.unknownCandidate')}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="confirm-vote"
                      checked={voteConfirmed}
                      onCheckedChange={setVoteConfirmed}
                    />
                    <Label htmlFor="confirm-vote" className="text-sm">
                      {isPublicElection
                        ? t('electionVoting.confirmFinalVotePublic')
                        : t('electionVoting.confirmFinalVote')}
                    </Label>
                  </div>
                </CardContent>
              </Card>
            )}
            {hasVoted && storedReceipt && (
              <VoteReceiptBadge receipt={storedReceipt} />
            )}
            </div>
          )}
        </div>

        {!hasVoted && (
          <div className="flex justify-end gap-2 pt-4 border-t shrink-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('electionVoting.cancel')}
            </Button>
            <Button
              onClick={handleVote}
              disabled={!canVote() || !voteConfirmed || voting}
              className="gap-2"
            >
              <Icon name="Vote" className="h-4 w-4" />
              {voting ? t('electionVoting.castingVote') : t('electionVoting.castVote')}
            </Button>
          </div>
        )}
      </DialogContent>
      <VoteReceiptDialog
        open={receiptDialogOpen}
        onOpenChange={setReceiptDialogOpen}
        receipt={lastReceipt}
      />
    </Dialog>
  );
}

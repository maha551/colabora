import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import { Separator } from '../ui/separator';
import { LoadingState } from '../ui/LoadingState';
import { Icon } from '../ui/Icon';
import { Organization, User } from '../../types';
import { governanceApi } from '../../lib/api';
import { useRuleLabels } from '../../hooks/useRuleLabels';
import { toast } from 'sonner';
import { logger } from '../../lib/logger';
import { useTimezone } from '../../hooks/useTimezone';
import { useVoteSubmission } from '../../hooks/useVoteSubmission';
import { useVoteStatus } from '../../hooks/useVoteStatus';
import { extractVoteReceipt, persistReceipt } from '../../lib/verification/voteReceipt';
import { VoteResultsDisplay } from '../shared/VoteResultsDisplay';
import { MultipleChoiceVoting } from '../shared/MultipleChoiceVoting';
import { VoteRadioGroup } from '../shared/VoteRadioGroup';
import { formatVoteValue, getVoteStatusLabel, normalizeVoteStatus } from '../../lib/voting';
import { normalizeRuleProposalVoteResponse, type RuleProposalVoteViewModel } from '../../lib/votingAdapters';

interface RuleProposalVotingInterfaceProps {
  organization: Organization;
  currentUser: User | null;
  proposalId: string;
  onBack?: () => void;
  onVoteComplete?: () => void;
  refreshTrigger?: number;
}

export function RuleProposalVotingInterface({
  organization,
  currentUser,
  proposalId,
  onBack,
  onVoteComplete,
  refreshTrigger
}: RuleProposalVotingInterfaceProps) {
  const { t } = useTranslation('governance');
  const { t: tCommon } = useTranslation('common');
  const { getRuleDisplayInfo } = useRuleLabels();
  const { formatDate, formatDateTime } = useTimezone();
  const [proposal, setProposal] = useState<RuleProposalVoteViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [voteChoice, setVoteChoice] = useState<'yes' | 'no' | 'abstain'>('abstain');

  const getStatusLabel = (status?: string | null) => {
    const normalized = normalizeVoteStatus(status);
    const key = ['draft', 'active', 'approved', 'rejected', 'expired', 'implemented'].includes(normalized)
      ? `proposalStatusBadge.${normalized}.label`
      : null;
    return key ? t(key) : getVoteStatusLabel(status);
  };

  const { hasVoted: userHasVoted } = useVoteStatus({
    votes: proposal?.votes,
    currentUserId: currentUser?.id,
    onVoteFound: (voteData: unknown) => {
      const vote = voteData as { selectedOptionId?: string; voteChoice?: 'yes' | 'no' | 'abstain' };
      if (vote.selectedOptionId) {
        setSelectedOption(vote.selectedOptionId);
      } else if (vote.voteChoice) {
        setVoteChoice(vote.voteChoice);
      }
    },
  });

  const { isSubmitting: voting, submitVote } = useVoteSubmission({
    onSuccess: () => {
      onVoteComplete?.();
      loadProposal();
    },
    successMessage: t('ruleProposalVoting.voteRecorded'),
    errorMessage: t('failedToRecordVote'),
  });

  useEffect(() => {
    loadProposal();
  }, [proposalId, refreshTrigger]);

  const loadProposal = async () => {
    setLoading(true);
    try {
      const response = await governanceApi.ruleProposalsApi.getRuleProposals(organization.id);
      const foundProposal = response.ruleProposals?.find(p => p.id === proposalId);
      if (foundProposal) {
        setProposal(
          normalizeRuleProposalVoteResponse(
            foundProposal as unknown as Parameters<typeof normalizeRuleProposalVoteResponse>[0]
          )
        );
      } else {
        toast.error(t('proposalNotFound'));
        onBack?.();
      }
    } catch (error) {
      logger.error('Failed to load proposal:', error);
      toast.error(t('failedToLoadProposal'));
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async () => {
    if (!proposal) return;

    const voteData: { selectedOptionId?: string; vote?: 'PRO' | 'NEUTRAL' | 'CONTRA' } = {};

    if (proposal.options && proposal.options.length > 0) {
      if (!selectedOption) {
        toast.error(t('selectOption'));
        return;
      }
      voteData.selectedOptionId = selectedOption;
      voteData.vote = 'PRO';
    } else {
      voteData.vote = (voteChoice === 'yes' ? 'PRO' : voteChoice === 'no' ? 'CONTRA' : 'NEUTRAL');
    }

    await submitVote(async () => {
      const response = await governanceApi.ruleProposalsApi.voteOnRuleProposal(organization.id, proposalId, voteData);
      if (currentUser?.id) {
        const payload = extractVoteReceipt(response);
        if (payload) {
          await persistReceipt(currentUser.id, organization.id, {
            ...payload,
            contestTitle: proposal.title,
            organizationId: organization.id,
          });
        }
      }
      return response;
    });
  };

  const getVoteCounts = () => {
    if (!proposal) return { total: 0, yes: 0, no: 0, abstain: 0 };

    if (proposal.options && proposal.options.length > 0) {
      const optionCounts: Record<string, number> = {};
      proposal.options.forEach(option => {
        if (option.votesReceived !== undefined) {
          optionCounts[option.id] = option.votesReceived;
        } else if (proposal.votes) {
          optionCounts[option.id] = proposal.votes.filter(v => v.selectedOptionId === option.id).length;
        } else {
          optionCounts[option.id] = 0;
        }
      });
      return optionCounts;
    }

    const yes = proposal.votesYes ?? (proposal.votes?.filter(v => v.voteChoice === 'yes').length || 0);
    const no = proposal.votesNo ?? (proposal.votes?.filter(v => v.voteChoice === 'no').length || 0);
    const abstain = proposal.votesAbstain ?? (proposal.votes?.filter(v => v.voteChoice === 'abstain').length || 0);
    const total = proposal.votesCast ?? (proposal.votes?.length || 0);

    return { total, yes, no, abstain };
  };

  if (loading) {
    return (
      <LoadingState isLoading={true} mode="spinner" spinnerSize="md">
        <></>
      </LoadingState>
    );
  }

  if (!proposal) {
    return (
      <Alert>
        <Icon name="AlertTriangle" className="h-4 w-4" />
        <AlertDescription>{t('proposalNotFound')}</AlertDescription>
      </Alert>
    );
  }

  const ruleInfo = getRuleDisplayInfo(proposal.ruleField);
  const voteCounts = getVoteCounts();
  const totalVoteCount = typeof voteCounts === 'object' && 'total' in voteCounts
    ? voteCounts.total
    : Object.values(voteCounts).reduce((a: number, b: number) => a + b, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {onBack && (
          <Button variant="outline" size="sm" onClick={onBack}>
            <Icon name="ArrowLeft" className="h-4 w-4 mr-1" />
            {tCommon('buttons.back')}
          </Button>
        )}
        <div>
          <h2 className="text-2xl font-bold">{t('ruleProposalVoting.title')}</h2>
          <p className="text-muted-foreground">{t('ruleProposalVoting.subtitle', { name: organization.name })}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{proposal.title}</span>
            <Badge variant={proposal.status === 'active' ? 'default' : 'secondary'}>
              {getStatusLabel(proposal.status)}
            </Badge>
          </CardTitle>
          <CardDescription>
            {t('ruleProposalVoting.proposedBy', {
              name: proposal.createdBy.name,
              date: formatDate(proposal.createdAt),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-foreground">{proposal.description}</p>

          <Separator />

          <div className="space-y-2">
            <h4 className="font-medium">{t('ruleProposalVoting.ruleBeingChanged')}</h4>
            <p className="text-sm text-muted-foreground">{ruleInfo.description}</p>
            <div className="flex items-center gap-4 text-sm">
              <span><strong>{t('ruleProposalVoting.ruleLabel')}</strong> {ruleInfo.label}</span>
              <span><strong>{t('ruleProposalVoting.proposedValueLabel')}</strong> {formatVoteValue(proposal.ruleField, proposal.proposedValue)}</span>
            </div>
          </div>

          {proposal.votingDeadline && (
            <Alert>
              <Icon name="Clock" className="h-4 w-4" />
              <AlertDescription>
                {t('ruleProposalVoting.votingDeadline', { date: formatDateTime(proposal.votingDeadline) })}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {proposal.status === 'active' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon name="Vote" className="h-5 w-5" />
              {t('ruleProposalVoting.castYourVote')}
            </CardTitle>
            <CardDescription>
              {userHasVoted ? t('ruleProposalVoting.alreadyVoted') : t('ruleProposalVoting.voteDetermines')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {proposal.options && proposal.options.length > 0 ? (
              <div className="space-y-6">
                <Label className="text-base font-medium">{t('ruleProposalVoting.selectOption')}</Label>
                <MultipleChoiceVoting
                  ruleProposal={proposal as unknown as import('../../types').RuleProposal}
                  selectedOption={selectedOption}
                  onOptionChange={setSelectedOption}
                  disabled={userHasVoted || voting}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <Label className="text-base font-medium">{t('ruleProposalVoting.yourDecision')}</Label>
                <VoteRadioGroup
                  value={voteChoice}
                  onValueChange={(value) => setVoteChoice(value as 'yes' | 'no' | 'abstain')}
                  disabled={userHasVoted || voting}
                  voteType="yes-no-abstain"
                  idPrefix="rule-proposal"
                />
              </div>
            )}

            <Button
              onClick={handleVote}
              disabled={userHasVoted || voting}
              className="w-full"
            >
              {userHasVoted ? (
                <>
                  <Icon name="CheckCircle" className="h-4 w-4 mr-2" />
                  {t('ruleProposalVoting.voteRecorded')}
                </>
              ) : (
                <>
                  <Icon name="Vote" className="h-4 w-4 mr-2" />
                  {voting ? t('ruleProposalVoting.recordingVote') : t('ruleProposalVoting.submitVote')}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="Users" className="h-5 w-5" />
            {t('ruleProposalVoting.currentResults')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {proposal.options && proposal.options.length > 0 ? (
            <div className="space-y-3">
              {proposal.options.map((option) => (
                <div key={option.id} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex-1">
                    <h4 className="font-medium">{option.optionTitle}</h4>
                    <p className="text-sm text-muted-foreground">{option.optionDescription}</p>
                  </div>
                  <Badge variant="outline">{t('ruleProposalVoting.voteCount', { count: voteCounts[option.id] || 0 })}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <VoteResultsDisplay
              pro={voteCounts.yes ?? 0}
              neutral={voteCounts.abstain ?? 0}
              contra={voteCounts.no ?? 0}
              variant="grid"
            />
          )}

          <div className="mt-4 text-center text-sm text-muted-foreground">
            {t('ruleProposalVoting.totalVotes', { count: totalVoteCount })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

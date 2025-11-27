import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import { Separator } from '../ui/separator';
import { Vote, Clock, Users, CheckCircle, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Organization, User } from '../../types';
import { governanceApi } from '../../lib/api';
import { toast } from 'sonner';

interface RuleProposalVotingInterfaceProps {
  organization: Organization;
  currentUser: User | null;
  proposalId: string;
  onBack?: () => void;
  onVoteComplete?: () => void;
}

interface RuleProposal {
  id: string;
  title: string;
  description: string;
  ruleField: string;
  proposedValue: any;
  options?: Array<{
    id: string;
    optionTitle: string;
    optionDescription?: string;
    proposedValue: any;
  }>;
      status: 'draft' | 'active' | 'completed' | 'approved' | 'rejected';
  createdBy: {
    id: string;
    name: string;
  };
  votingDeadline?: string;
  votes?: Array<{
    userId: string;
    selectedOptionId?: string;
    voteChoice?: 'yes' | 'no' | 'abstain';
  }>;
  createdAt: string;
}

export function RuleProposalVotingInterface({
  organization,
  currentUser,
  proposalId,
  onBack,
  onVoteComplete
}: RuleProposalVotingInterfaceProps) {
  const [proposal, setProposal] = useState<RuleProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [voteChoice, setVoteChoice] = useState<'yes' | 'no' | 'abstain'>('abstain');

  useEffect(() => {
    loadProposal();
  }, [proposalId]);

  const loadProposal = async () => {
    setLoading(true);
    try {
      const response = await governanceApi.ruleProposalsApi.getRuleProposals(organization.id);
      const foundProposal = response.ruleProposals?.find(p => p.id === proposalId);
      if (foundProposal) {
        setProposal(foundProposal);
        // Check if user already voted
        const userVote = foundProposal.votes?.find((v: { userId: string; vote: string }) => v.userId === currentUser.id);
        if (userVote) {
          if (userVote.selectedOptionId) {
            setSelectedOption(userVote.selectedOptionId);
          } else if (userVote.voteChoice) {
            setVoteChoice(userVote.voteChoice);
          }
        }
      } else {
        toast.error('Proposal not found');
        onBack?.();
      }
    } catch (error) {
      console.error('Failed to load proposal:', error);
      toast.error('Failed to load proposal');
    } finally {
      setLoading(false);
    }
  };

  const getRuleDisplayInfo = (field: string) => {
    const ruleLabels: Record<string, { label: string; description: string }> = {
      representativeTermMonths: {
        label: 'Representative Term Length',
        description: 'How long representatives serve before needing re-election'
      },
      representativeTermLimits: {
        label: 'Representative Term Limits',
        description: 'Maximum consecutive terms (empty = no limit)'
      },
      electionVotingMethod: {
        label: 'Election Voting Method',
        description: 'How votes are counted in elections'
      },
      electionQuorumPercentage: {
        label: 'Election Quorum',
        description: 'Minimum participation required for valid election'
      },
      electionNoticeDays: {
        label: 'Election Notice Period',
        description: 'Days notice before election starts'
      },
      defaultVotingDeadlineHours: {
        label: 'Default Voting Deadline',
        description: 'Default time for votes to remain open'
      },
      defaultQuorumPercentage: {
        label: 'Default Quorum',
        description: 'Minimum participation for non-election votes'
      },
      defaultAcceptanceThreshold: {
        label: 'Document Acceptance Threshold',
        description: 'Percentage of PRO votes required for document proposals to be automatically accepted (1-100%)'
      },
      documentProposalPeriodDays: {
        label: 'Document Proposal Period',
        description: 'Number of days documents remain in proposal status before voting begins'
      },
      thresholdCalculationMethod: {
        label: 'Threshold Calculation Method',
        description: 'How approval percentage is calculated: "All Votes" uses percentage of votes cast, "All Members" uses percentage of all eligible members'
      },
      anonymousVotingEnabled: {
        label: 'Anonymous Voting',
        description: 'Hide voter identities by default'
      },
      voteChangeAllowed: {
        label: 'Vote Changes Allowed',
        description: 'Allow members to change their votes'
      },
      representativeCanCreateVotes: {
        label: 'Representatives Can Create Votes',
        description: 'Representatives can create policy implementation votes'
      },
      representativeCanInviteMembers: {
        label: 'Representatives Can Invite Members',
        description: 'Representatives can send membership invitations'
      },
      representativeCanManageDocuments: {
        label: 'Representatives Can Manage Documents',
        description: 'Representatives can create and manage organization documents'
      },
      representativeApprovalRequired: {
        label: 'Representative Approval Required',
        description: 'Representative approval needed for major actions'
      },
      tamperProofEnabled: {
        label: 'Tamper-Proof Records',
        description: 'Cryptographically verify vote integrity'
      },
      auditTrailEnabled: {
        label: 'Audit Trail',
        description: 'Log all governance actions'
      }
    };

    return ruleLabels[field] || { label: field, description: '' };
  };

  const getCurrentValueDisplay = (field: string, value: string | number | boolean) => {
    if (value === null || value === undefined) return 'Not set';

    const numberFields = ['representativeTermMonths', 'representativeTermLimits', 'electionNoticeDays', 'defaultVotingDeadlineHours'];
    const percentageFields = ['electionQuorumPercentage', 'defaultQuorumPercentage'];
    const booleanFields = ['anonymousVotingEnabled', 'voteChangeAllowed', 'representativeCanCreateVotes', 'representativeCanInviteMembers', 'representativeCanManageDocuments', 'representativeApprovalRequired', 'tamperProofEnabled', 'auditTrailEnabled'];

    if (numberFields.includes(field)) {
      return `${value} ${field.includes('Hours') ? 'hours' : field.includes('Days') ? 'days' : 'months'}`;
    }
    if (percentageFields.includes(field)) {
      const numValue = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : 0;
      return `${Math.round(numValue * 100)}%`;
    }
    if (booleanFields.includes(field)) return value ? 'Enabled' : 'Disabled';
    if (field === 'electionVotingMethod') {
      const strValue = String(value);
      return strValue.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
    }

    return String(value);
  };

  const getProposedValueDisplay = (field: string, value: string | number | boolean) => {
    return getCurrentValueDisplay(field, value);
  };

  const handleVote = async () => {
    if (!proposal) return;

    setVoting(true);
    try {
      let voteData: { selectedOptionId?: string; voteChoice?: string } = {};

      if (proposal.options && proposal.options.length > 0) {
        // Multiple choice voting
        if (!selectedOption) {
          toast.error('Please select an option');
          return;
        }
        voteData.selectedOptionId = selectedOption;
      } else {
        // Yes/No/Abstain voting
        voteData.voteChoice = voteChoice;
      }

      await governanceApi.ruleProposalsApi.voteOnRuleProposal(organization.id, proposalId, voteData);
      toast.success('Vote recorded successfully');
      onVoteComplete?.();
      loadProposal(); // Refresh to show updated vote count
    } catch (error) {
      console.error('Failed to vote:', error);
      toast.error('Failed to record vote');
    } finally {
      setVoting(false);
    }
  };

  const getVoteCounts = () => {
    if (!proposal?.votes) return { total: 0, yes: 0, no: 0, abstain: 0 };

    if (proposal.options && proposal.options.length > 0) {
      // Count votes for each option
      const optionCounts: Record<string, number> = {};
      proposal.options.forEach(option => {
        optionCounts[option.id] = 0;
      });

      proposal.votes.forEach(vote => {
        if (vote.selectedOptionId) {
          optionCounts[vote.selectedOptionId] = (optionCounts[vote.selectedOptionId] || 0) + 1;
        }
      });

      return optionCounts;
    } else {
      // Count yes/no/abstain votes
      let yes = 0, no = 0, abstain = 0;
      proposal.votes.forEach(vote => {
        if (vote.voteChoice === 'yes') yes++;
        else if (vote.voteChoice === 'no') no++;
        else if (vote.voteChoice === 'abstain') abstain++;
      });

      return { total: proposal.votes.length, yes, no, abstain };
    }
  };

  const hasUserVoted = () => {
    return proposal?.votes?.some(vote => vote.userId === currentUser.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Proposal not found.</AlertDescription>
      </Alert>
    );
  }

  const ruleInfo = getRuleDisplayInfo(proposal.ruleField);
  const voteCounts = getVoteCounts();
  const userHasVoted = hasUserVoted();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {onBack && (
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        )}
        <div>
          <h2 className="text-2xl font-bold">Vote on Rule Change</h2>
          <p className="text-gray-600">{organization.name} governance proposal</p>
        </div>
      </div>

      {/* Proposal Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{proposal.title}</span>
            <Badge variant={proposal.status === 'active' ? 'default' : 'secondary'}>
              {proposal.status === 'active' ? 'Voting Active' : proposal.status}
            </Badge>
          </CardTitle>
          <CardDescription>
            Proposed by {proposal.createdBy.name} on {new Date(proposal.createdAt).toLocaleDateString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-700">{proposal.description}</p>

          <Separator />

          <div className="space-y-2">
            <h4 className="font-medium">Rule Being Changed</h4>
            <p className="text-sm text-gray-600">{ruleInfo.description}</p>
            <div className="flex items-center gap-4 text-sm">
              <span><strong>Rule:</strong> {ruleInfo.label}</span>
              <span><strong>Proposed Value:</strong> {getProposedValueDisplay(proposal.ruleField, proposal.proposedValue)}</span>
            </div>
          </div>

          {/* Voting Deadline */}
          {proposal.votingDeadline && (
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                Voting deadline: {new Date(proposal.votingDeadline).toLocaleString()}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Voting Section */}
      {proposal.status === 'active' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Vote className="h-5 w-5" />
              Cast Your Vote
            </CardTitle>
            <CardDescription>
              {userHasVoted ? 'You have already voted on this proposal' : 'Your vote will determine if this rule change is approved'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Multiple Choice Voting */}
            {proposal.options && proposal.options.length > 0 ? (
              <div className="space-y-4">
                <Label className="text-base font-medium">Select your preferred option:</Label>
                <RadioGroup
                  value={selectedOption}
                  onValueChange={setSelectedOption}
                  disabled={userHasVoted || voting}
                >
                  {proposal.options.map((option) => (
                    <div key={option.id} className="flex items-start space-x-2 p-3 border rounded-lg">
                      <RadioGroupItem value={option.id} id={option.id} className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor={option.id} className="font-medium cursor-pointer">
                          {option.optionTitle}
                        </Label>
                        {option.optionDescription && (
                          <p className="text-sm text-gray-600 mt-1">{option.optionDescription}</p>
                        )}
                        <p className="text-sm text-blue-600 mt-1">
                          Value: {getProposedValueDisplay(proposal.ruleField, option.proposedValue)}
                        </p>
                      </div>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            ) : (
              /* Yes/No/Abstain Voting */
              <div className="space-y-4">
                <Label className="text-base font-medium">Your decision:</Label>
                <RadioGroup
                  value={voteChoice}
                  onValueChange={(value) => setVoteChoice(value as 'yes' | 'no' | 'abstain')}
                  disabled={userHasVoted || voting}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="yes" />
                    <Label htmlFor="yes" className="cursor-pointer">Approve this change</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="no" />
                    <Label htmlFor="no" className="cursor-pointer">Reject this change</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="abstain" id="abstain" />
                    <Label htmlFor="abstain" className="cursor-pointer">Abstain from voting</Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            <Button
              onClick={handleVote}
              disabled={userHasVoted || voting}
              className="w-full"
            >
              {userHasVoted ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Vote Recorded
                </>
              ) : (
                <>
                  <Vote className="h-4 w-4 mr-2" />
                  {voting ? 'Recording Vote...' : 'Submit Vote'}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Current Vote Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Current Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          {proposal.options && proposal.options.length > 0 ? (
            /* Multiple Choice Results */
            <div className="space-y-3">
              {proposal.options.map((option) => (
                <div key={option.id} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex-1">
                    <h4 className="font-medium">{option.optionTitle}</h4>
                    <p className="text-sm text-gray-600">{option.optionDescription}</p>
                  </div>
                  <Badge variant="outline">{voteCounts[option.id] || 0} votes</Badge>
                </div>
              ))}
            </div>
          ) : (
            /* Yes/No/Abstain Results */
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 border rounded-lg bg-green-50">
                <div className="text-2xl font-bold text-green-600">{voteCounts.yes}</div>
                <div className="text-sm text-green-600">Approve</div>
              </div>
              <div className="text-center p-4 border rounded-lg bg-red-50">
                <div className="text-2xl font-bold text-red-600">{voteCounts.no}</div>
                <div className="text-sm text-red-600">Reject</div>
              </div>
              <div className="text-center p-4 border rounded-lg bg-gray-50">
                <div className="text-2xl font-bold text-gray-600">{voteCounts.abstain}</div>
                <div className="text-sm text-gray-600">Abstain</div>
              </div>
            </div>
          )}

          <div className="mt-4 text-center text-sm text-gray-600">
            Total votes: {Array.isArray(voteCounts) ? voteCounts.total : Object.values(voteCounts).reduce((a, b) => a + b, 0)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

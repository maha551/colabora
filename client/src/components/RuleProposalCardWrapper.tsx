import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SuggestionCard } from './SuggestionCard';
import { RuleMetadataDisplay } from './shared/RuleMetadataDisplay';
import { MultipleChoiceVoting } from './shared/MultipleChoiceVoting';
import { StatusBadge } from './shared/StatusBadge';
import { Organization, RuleProposal, User } from '../types';
import type { Comment } from '../types';
import { adaptRuleProposalToSuggestion } from '../utils/proposalAdapter';
import { handleRuleVote, handleRuleComment, handleRuleDeleteComment } from '../utils/ruleProposalAdapter';
import { governanceApi } from '../lib/api';
import { toast } from 'sonner';
import { SPACING, COLORS, RADIUS } from '../lib/designSystem';
import { cn } from './ui/utils';
import { Icon } from './ui/Icon';

interface RuleProposalCardWrapperProps {
  ruleProposal: RuleProposal;
  organizationId: string;
  currentUser: User;
  allCollaborators: User[];
  onVote: () => void; // Refresh callback
  onNavigateToDetails?: () => void; // Optional navigation
  /** When provided, card uses organization branding color for border */
  organization?: Organization | null;
}

/**
 * Wrapper component that adapts RuleProposal to use SuggestionCard
 * Follows the same pattern as ActivityFeedProposalCard
 */
export function RuleProposalCardWrapper({
  ruleProposal,
  organizationId,
  currentUser,
  allCollaborators,
  onVote,
  onNavigateToDetails,
  organization,
}: RuleProposalCardWrapperProps) {
  const { t } = useTranslation('governance');
  const [isVoting, setIsVoting] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);

  const loadComments = useCallback(async () => {
    try {
      const res = await governanceApi.ruleProposalsApi.getComments(organizationId, ruleProposal.id, { limit: 100 });
      setComments(res.comments);
    } catch {
      setComments([]);
    }
  }, [organizationId, ruleProposal.id]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // Convert rule proposal to Suggestion format (includes comments when loaded)
  const suggestion = useMemo(() => {
    return adaptRuleProposalToSuggestion(ruleProposal, organizationId, allCollaborators, comments);
  }, [ruleProposal, organizationId, allCollaborators, comments]);

  const totalUsers = ruleProposal.totalVoters || allCollaborators.length;
  const isActive = ruleProposal.status === 'active';
  const isApproved = ruleProposal.status === 'approved';
  const hasMultipleChoice = ruleProposal.options && ruleProposal.options.length > 0;

  // Check if user has already voted
  const userHasVoted = useMemo(() => {
    if (!ruleProposal.votes) return false;
    return ruleProposal.votes.some(vote => vote.userId === currentUser.id);
  }, [ruleProposal.votes, currentUser.id]);

  // Handle vote - maps PRO/CONTRA/NEUTRAL to Yes/No/Abstain or multiple choice
  const handleVote = async (suggestionId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
    if (isVoting || !isActive || userHasVoted) return;
    
    setIsVoting(true);
    try {
      const voteData: { selectedOptionId?: string; vote?: 'PRO' | 'NEUTRAL' | 'CONTRA' } = {};
      
      if (hasMultipleChoice) {
        // For multiple choice, we need to use the selected option
        // Selecting an option = voting in favor (PRO)
        if (selectedOption) {
          voteData.selectedOptionId = selectedOption;
          voteData.vote = 'PRO'; // Same field as structure/paragraph votes
        } else {
          // If no option selected, don't vote
          setIsVoting(false);
          return;
        }
      } else {
        // Same as structure/paragraph votes: send vote (PRO/NEUTRAL/CONTRA)
        voteData.vote = voteType;
      }
      
      await handleRuleVote(suggestionId, organizationId, voteData);
      onVote();
    } catch (error) {
      // Error already handled in adapter
    } finally {
      setIsVoting(false);
    }
  };

  // Handle comment: call API then refresh comments so SuggestionCard shows the new comment
  const handleComment = async (suggestionId: string, text: string, parentId?: string) => {
    try {
      await handleRuleComment(suggestionId, organizationId, text, parentId);
      await loadComments();
    } catch (error) {
      // Error already handled in adapter
    }
  };

  const handleDeleteComment = async (suggestionId: string, commentId: string) => {
    try {
      await handleRuleDeleteComment(suggestionId, organizationId, commentId);
      await loadComments();
    } catch (error) {
      // Error already handled in adapter
    }
  };

  /** Creator withdraw (SuggestionCard shows delete when onDeleteProposal + isCreator + !approved) */
  const handleWithdrawProposal = async (proposalId: string) => {
    await governanceApi.ruleProposalsApi.withdrawRuleProposal(organizationId, proposalId);
    onVote();
  };

  // Get status badge
  const getStatusBadge = () => {
    if (isApproved) {
      return <StatusBadge status="approved" icon={<Icon name="CheckCircle2" className="w-3 h-3" />} label={t('approved')} />;
    }
    if (isActive) {
      return <StatusBadge status="active" icon={<Icon name="Clock" className="w-3 h-3" />} label={t('votingActive')} />;
    }
    return <StatusBadge status={ruleProposal.status} />;
  };

  // Custom content section (rule metadata)
  const customContentSection = (
    <div className={cn(SPACING.content.gap)}>
      <RuleMetadataDisplay ruleProposal={ruleProposal} />
      
      {/* Multiple choice voting UI (if applicable) */}
      {hasMultipleChoice && isActive && !userHasVoted && (
        <div className={cn(SPACING.content.gap, SPACING.card.padding, COLORS.bg.muted, RADIUS.panel)}>
          <MultipleChoiceVoting
            ruleProposal={ruleProposal}
            selectedOption={selectedOption}
            onOptionChange={(optionId) => {
              setSelectedOption(optionId);
              // When option is selected, automatically vote PRO (which will be converted to selectedOptionId)
              // But we need to wait for the user to click vote button
            }}
            disabled={isVoting || userHasVoted}
            showVoteCounts={true}
          />
        </div>
      )}
    </div>
  );

  // Override onVote to handle multiple choice voting
  const handleVoteWrapper = async (suggestionId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
    if (hasMultipleChoice && !selectedOption) {
      toast.error(t('selectOption'));
      return;
    }
    await handleVote(suggestionId, voteType);
  };

  return (
    <SuggestionCard
      suggestion={suggestion}
      totalUsers={totalUsers}
      currentUser={currentUser}
      allCollaborators={allCollaborators}
      onVote={handleVoteWrapper}
      onComment={handleComment}
      onDeleteComment={handleDeleteComment}
      onDeleteProposal={ruleProposal.status === 'active' ? handleWithdrawProposal : undefined}
      customContentSection={customContentSection}
      tabBadge={getStatusBadge()}
      showDiffInline={false}
      organization={organization ?? undefined}
      organizationBorderColor={organization?.brandingColor ?? null}
    />
  );
}


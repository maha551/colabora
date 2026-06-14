import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { VotingCard } from './VotingCard';
import { BaseProposal, ProposalType } from './proposalTypes';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Icon } from '../ui/Icon';
import { cn } from '../ui/utils';
import { useProposalNotifications } from '../../hooks/useProposalNotifications';
import { RuleProposal, StructureProposal, DocumentTreeProposal, Document } from '../../types';

interface UnifiedProposalListProps {
  proposals: BaseProposal[];
  currentUserId?: string;
  onVote?: (proposalId: string, proposalType: ProposalType, vote: 'PRO' | 'NEUTRAL' | 'CONTRA') => Promise<void>;
  onViewDetails?: (proposal: BaseProposal) => void;
  onRefresh?: () => Promise<void>;
  isLoading?: boolean;
  organizationId?: string;
  documentId?: string;
  fetchFullProposalData?: (proposalId: string, proposalType: ProposalType) => Promise<{
    rule?: RuleProposal;
    structure?: StructureProposal;
    tree?: DocumentTreeProposal;
    deletion?: Document;
  } | null>;
  fullProposalData?: Record<string, {
    rule?: RuleProposal;
    structure?: StructureProposal;
    tree?: DocumentTreeProposal;
    deletion?: Document;
  }>;
}

type FilterType = 'all' | ProposalType;
type SortOption = 'deadline' | 'created' | 'votes' | 'status';

export function UnifiedProposalList({
  proposals,
  currentUserId,
  onVote,
  onViewDetails,
  onRefresh,
  isLoading = false,
  organizationId,
  documentId,
  fetchFullProposalData,
  fullProposalData = {},
}: UnifiedProposalListProps) {
  const { t } = useTranslation('governance');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('deadline');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [optimisticUpdates, setOptimisticUpdates] = useState<Record<string, { vote: 'PRO' | 'NEUTRAL' | 'CONTRA'; voteCounts: { pro: number; contra: number; neutral: number; total: number } }>>({});

  // Notification tracking
  const contextId = organizationId || documentId || 'all';
  const notifications = useProposalNotifications(currentUserId);
  
  // Calculate unread counts
  const unreadCounts = useMemo(() => {
    return notifications.getUnreadCount(proposals, contextId);
  }, [proposals, contextId, notifications]);

  // Get notification state for each proposal
  const proposalNotificationStates = useMemo(() => {
    const states: Record<string, { isNew: boolean; hasNewVotes: boolean }> = {};
    proposals.forEach(proposal => {
      states[proposal.id] = notifications.getProposalNotificationState(proposal, contextId);
    });
    return states;
  }, [proposals, contextId, notifications]);

  // WebSocket updates are handled by useProposals hook
  // This component receives updated proposals via props

  const handleVote = async (proposalId: string, proposalType: ProposalType, vote: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
    if (!onVote) return;

    // Optimistic update
    const proposal = proposals.find(p => p.id === proposalId);
    if (proposal && proposal.votes) {
      const currentVote = proposal.userVote;
      const newCounts = { ...proposal.votes };
      
      // Remove previous vote
      if (currentVote === 'PRO') newCounts.pro--;
      if (currentVote === 'CONTRA') newCounts.contra--;
      if (currentVote === 'NEUTRAL') newCounts.neutral--;
      
      // Add new vote
      if (vote === 'PRO') newCounts.pro++;
      if (vote === 'CONTRA') newCounts.contra++;
      if (vote === 'NEUTRAL') newCounts.neutral++;

      setOptimisticUpdates(prev => ({
        ...prev,
        [proposalId]: {
          vote,
          voteCounts: newCounts,
        },
      }));
    }

    try {
      await onVote(proposalId, proposalType, vote);
      // Clear optimistic update after successful vote
      setTimeout(() => {
        setOptimisticUpdates(prev => {
          const next = { ...prev };
          delete next[proposalId];
          return next;
        });
      }, 1000);
    } catch (error) {
      // Revert optimistic update on error
      setOptimisticUpdates(prev => {
        const next = { ...prev };
        delete next[proposalId];
        return next;
      });
      throw error;
    }
  };

  const handleRefresh = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filter and sort proposals
  const filteredAndSortedProposals = useMemo(() => {
    let filtered = proposals;

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(p => p.type === filterType);
    }

    // Filter by status
    if (filterStatus !== 'all') {
      filtered = filtered.filter(p => p.status.toLowerCase() === filterStatus.toLowerCase());
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.title?.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.id.toLowerCase().includes(query)
      );
    }

    // Sort proposals
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'deadline':
          if (!a.deadline && !b.deadline) return 0;
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        case 'created':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'votes': {
          const aVotes = a.votes?.total ?? 0;
          const bVotes = b.votes?.total ?? 0;
          return bVotes - aVotes;
        }
        case 'status':
          return a.status.localeCompare(b.status);
        default:
          return 0;
      }
    });

    return filtered;
  }, [proposals, filterType, filterStatus, searchQuery, sortBy]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    proposals.forEach(p => {
      const status = p.status.toLowerCase();
      counts[status] = (counts[status] || 0) + 1;
    });
    return counts;
  }, [proposals]);

  const typeCounts = useMemo(() => {
    const counts: Record<ProposalType | 'all', number> = { all: proposals.length };
    proposals.forEach(p => {
      counts[p.type] = (counts[p.type] || 0) + 1;
    });
    return counts;
  }, [proposals]);

  if (isLoading && proposals.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">Loading proposals...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                Proposals
                {(unreadCounts.newProposals > 0 || unreadCounts.newVotes > 0) && (
                  <Badge variant="default" className="bg-blue-500 text-white">
                    {unreadCounts.total} new
                  </Badge>
                )}
              </CardTitle>
              {(unreadCounts.newProposals > 0 || unreadCounts.newVotes > 0) && (
                <CardDescription className="text-xs mt-1">
                  {unreadCounts.newProposals > 0 && `${unreadCounts.newProposals} new proposal${unreadCounts.newProposals !== 1 ? 's' : ''}`}
                  {unreadCounts.newProposals > 0 && unreadCounts.newVotes > 0 && ', '}
                  {unreadCounts.newVotes > 0 && `${unreadCounts.newVotes} with new votes`}
                </CardDescription>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing || !onRefresh}
              >
                <Icon name="RefreshCw" className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              </Button>
            </div>
          </div>
          <CardDescription>
            {proposals.length} total proposal{proposals.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Icon name="Search" className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('searchProposalsPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
              <SelectTrigger className="w-[140px]">
                <Icon name="Filter" className="h-4 w-4 mr-2" />
                <SelectValue placeholder={t('filterTypePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t('allTypes')} ({typeCounts.all})
                </SelectItem>
                <SelectItem value="rule">Rule ({typeCounts.rule || 0})</SelectItem>
                <SelectItem value="structure">Structure ({typeCounts.structure || 0})</SelectItem>
                <SelectItem value="tree">Tree ({typeCounts.tree || 0})</SelectItem>
                <SelectItem value="deletion">Deletion ({typeCounts.deletion || 0})</SelectItem>
                <SelectItem value="paragraph">Paragraph ({typeCounts.paragraph || 0})</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={t('filterStatusPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allStatuses')}</SelectItem>
                {Object.entries(statusCounts).map(([status, count]) => (
                  <SelectItem key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)} ({count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={t('sortByPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deadline">Deadline</SelectItem>
                <SelectItem value="created">Created Date</SelectItem>
                <SelectItem value="votes">Vote Count</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Proposal List */}
      {filteredAndSortedProposals.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            {proposals.length === 0
              ? t('noProposalsFound')
              : t('noProposalsMatchFilters')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAndSortedProposals.map((proposal) => {
            const notificationState = proposalNotificationStates[proposal.id] || { isNew: false, hasNewVotes: false };
            return (
              <VotingCard
                key={proposal.id}
                proposal={proposal}
                currentUserId={currentUserId}
                onVote={(id, type, vote) => handleVote(id, type, vote)}
                onViewDetails={(p) => {
                  notifications.markAsViewed(p.id);
                  if (onViewDetails) onViewDetails(p);
                }}
                loading={isLoading}
                isNew={notificationState.isNew}
                hasNewVotes={notificationState.hasNewVotes}
                fullProposalData={fullProposalData[proposal.id]}
                onFetchFullData={fetchFullProposalData}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}


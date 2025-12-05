import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { History, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { Organization } from '../../types';
import { governanceApi } from '../../lib/api';
import { toast } from 'sonner';

interface RuleHistoryViewProps {
  organization: Organization;
}

interface RuleHistoryEntry {
  id: string;
  ruleField: string;
  oldValue: unknown;
  newValue: unknown;
  changedBy: {
    userId: string;
    userName: string;
    proposalId?: string;
  };
  changedAt: string;
}

function getRuleLabel(rule: string): string {
  const labels: Record<string, string> = {
    membersCanProposeRules: 'Members Can Propose Rules',
    membersCanCreateDocuments: 'Members Can Create Documents',
    membersCanInitializeElections: 'Members Can Initialize Elections',
    membersCanInviteMembers: 'Members Can Invite Members',
    membersCanManageRuleProposals: 'Members Can Manage Rule Proposals',
    defaultQuorumPercentage: 'Default Quorum Percentage',
    defaultAcceptanceThreshold: 'Document Acceptance Threshold',
    thresholdCalculationMethod: 'Threshold Calculation Method',
    documentProposalPeriodDays: 'Document Proposal Period',
    defaultVotingDeadlineHours: 'Default Voting Deadline',
    representativeTermMonths: 'Representative Term Length',
    electionVotingMethod: 'Election Voting Method'
  };
  return labels[rule] || rule;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'Not set';
  if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled';
  if (typeof value === 'number') {
    // Check if it's a percentage (0-1 range)
    if (value >= 0 && value <= 1 && value % 0.01 === 0) {
      return `${Math.round(value * 100)}%`;
    }
    return value.toString();
  }
  if (typeof value === 'string') {
    // Check if it's a date
    if (value.match(/^\d{4}-\d{2}-\d{2}/)) {
      return new Date(value).toLocaleDateString();
    }
    return value;
  }
  return JSON.stringify(value);
}

export function RuleHistoryView({ organization }: RuleHistoryViewProps) {
  const [history, setHistory] = useState<RuleHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 50,
    offset: 0,
    hasMore: false
  });

  useEffect(() => {
    loadHistory();
  }, [organization.id, filter, pagination.offset]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const response = await governanceApi.getRuleHistory(organization.id, {
        ruleField: filter !== 'all' ? filter : undefined,
        limit: pagination.limit,
        offset: pagination.offset
      });
      setHistory(response.history);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Failed to load rule history:', error);
      toast.error('Failed to load rule history');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (value: string) => {
    setFilter(value);
    setPagination(prev => ({ ...prev, offset: 0 }));
  };

  const handlePreviousPage = () => {
    if (pagination.offset > 0) {
      setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }));
    }
  };

  const handleNextPage = () => {
    if (pagination.hasMore) {
      setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }));
    }
  };

  // Get unique rule fields for filter
  const ruleFields = Array.from(new Set(history.map(h => h.ruleField)));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Rule Change History
            </CardTitle>
            <CardDescription>
              View the history of all governance rule changes for this organization
            </CardDescription>
          </div>
          <Select value={filter} onValueChange={handleFilterChange}>
            <SelectTrigger className="w-[200px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter by rule" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Rules</SelectItem>
              {ruleFields.map(field => (
                <SelectItem key={field} value={field}>
                  {getRuleLabel(field)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : history.length === 0 ? (
          <Alert>
            <AlertDescription>
              No rule changes have been made yet. Rule changes will appear here once proposals are approved.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline">{getRuleLabel(entry.ruleField)}</Badge>
                        <span className="text-sm text-gray-500">
                          {new Date(entry.changedAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-gray-600 dark:text-gray-400 mb-1">Previous Value:</div>
                          <div className="font-mono text-gray-800 dark:text-gray-200">
                            {formatValue(entry.oldValue)}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-600 dark:text-gray-400 mb-1">New Value:</div>
                          <div className="font-mono text-green-700 dark:text-green-300 font-medium">
                            {formatValue(entry.newValue)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-gray-500">
                        Changed by {entry.changedBy.userName}
                        {entry.changedBy.proposalId && (
                          <span className="ml-2">
                            (via proposal)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Showing {pagination.offset + 1} to {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total} entries
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousPage}
                  disabled={pagination.offset === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={!pagination.hasMore}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


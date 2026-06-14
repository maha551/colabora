import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Icon } from '../ui/Icon';
import { Organization } from '../../types';
import { governanceApi } from '../../lib/api';
import { useRuleLabels } from '../../hooks/useRuleLabels';
import { toast } from 'sonner';
import { logger } from '../../lib/logger';
import { useTimezone } from '../../hooks/useTimezone';
import { COLORS, RADIUS } from '../../lib/designSystem';
import { cn } from '../ui/utils';

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

function formatValue(
  value: unknown,
  formatDate: (date: Date | string) => string,
  t: (key: string) => string,
): string {
  if (value === null || value === undefined) return t('values.notSet');
  if (typeof value === 'boolean') return value ? t('values.enabled') : t('values.disabled');
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
      return formatDate(value);
    }
    return value;
  }
  return JSON.stringify(value);
}

export function RuleHistoryView({ organization }: RuleHistoryViewProps) {
  const { t } = useTranslation('governance');
  const { t: tCommon } = useTranslation('common');
  const { getRuleLabel } = useRuleLabels();
  const { formatDate, formatDateTime } = useTimezone();
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
      logger.error('Failed to load rule history:', error);
      toast.error(t('failedToLoadRuleHistory'));
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
              <Icon name="History" className="h-5 w-5" />
              {t('ruleHistory.title')}
            </CardTitle>
            <CardDescription>
              {t('ruleHistory.description')}
            </CardDescription>
          </div>
          <Select value={filter} onValueChange={handleFilterChange}>
            <SelectTrigger className="w-[200px]">
              <Icon name="Filter" className="h-4 w-4 mr-2" />
              <SelectValue placeholder={t('ruleHistory.filterPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('ruleHistory.allRules')}</SelectItem>
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
            <div className={cn("animate-spin h-8 w-8 border-b-2 border-blue-600", RADIUS.pill)}></div>
          </div>
        ) : history.length === 0 ? (
          <Alert>
            <AlertDescription>
              {t('ruleHistory.empty')}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className={cn("border p-4 hover:bg-muted transition-colors", RADIUS.panel)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline">{getRuleLabel(entry.ruleField)}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatDateTime(entry.changedAt)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground mb-1">{t('ruleHistory.previousValue')}</div>
                          <div className="font-mono text-foreground">
                            {formatValue(entry.oldValue, formatDate, t)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground mb-1">{t('ruleHistory.newValue')}</div>
                          <div className={`font-mono font-medium ${COLORS.status.success}`}>
                            {formatValue(entry.newValue, formatDate, t)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        {t('ruleHistory.changedBy', { name: entry.changedBy.userName })}
                        {entry.changedBy.proposalId && (
                          <span className="ml-2">
                            {t('ruleHistory.viaProposal')}
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
              <div className="text-sm text-muted-foreground">
                {t('ruleHistory.pagination', {
                  from: pagination.offset + 1,
                  to: Math.min(pagination.offset + pagination.limit, pagination.total),
                  total: pagination.total,
                })}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousPage}
                  disabled={pagination.offset === 0}
                >
                  <Icon name="ChevronLeft" className="h-4 w-4" />
                  {tCommon('buttons.previous')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={!pagination.hasMore}
                >
                  {tCommon('buttons.next')}
                  <Icon name="ChevronRight" className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


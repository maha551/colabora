import { useMemo } from 'react';
import { Badge } from './ui/badge';
import { computeDiffStatistics, getChangeType, computeSimilarity } from '../utils/diffStatistics';
import { Icon } from './ui/Icon';
import { COLORS } from '../lib/designSystem';

interface DiffStatisticsProps {
  originalText: string;
  suggestion1Text?: string;
  suggestion2Text?: string;
  compact?: boolean;
}

/**
 * Displays diff statistics showing the scope of changes
 * Used in discussion area (full mode) to help users understand change impact
 */
export function DiffStatistics({
  originalText,
  suggestion1Text,
  suggestion2Text,
  compact = false,
}: DiffStatisticsProps) {
  const statistics = useMemo(() => {
    return computeDiffStatistics(originalText, suggestion1Text, suggestion2Text);
  }, [originalText, suggestion1Text, suggestion2Text]);

  const changeType = getChangeType(statistics);

  // Compute similarity scores
  const similarity1 = useMemo(() => {
    if (!suggestion1Text) return undefined;
    
    // Two suggestions mode: compare them
    if (suggestion2Text) {
      return computeSimilarity(suggestion1Text, suggestion2Text);
    }
    
    // Single suggestion mode: compare to original
    return computeSimilarity(originalText, suggestion1Text);
  }, [originalText, suggestion1Text, suggestion2Text]);

  const similarity2 = useMemo(() => {
    // Only relevant in single suggestion mode (when suggestion2 exists but suggestion1 doesn't)
    if (!suggestion2Text || suggestion1Text) return undefined;
    return computeSimilarity(originalText, suggestion2Text);
  }, [originalText, suggestion1Text, suggestion2Text]);

  // Determine change type color and icon
  const changeTypeConfig = {
    major: {
      color: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
      iconName: 'AlertCircle' as const,
      label: 'Major Change',
    },
    minor: {
      color: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800',
      iconName: 'TrendingUp' as const,
      label: 'Minor Change',
    },
    formatting: {
      color: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
      iconName: 'FileText' as const,
      label: 'Formatting',
    },
  };

  const config = changeTypeConfig[changeType];

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Badge variant="outline" className={config.color}>
          <Icon name={config.iconName} className="h-3 w-3 mr-1" />
          {config.label}
        </Badge>
        <span className="text-muted-foreground">
          {statistics.wordsAdded > 0 && `+${statistics.wordsAdded} words`}
          {statistics.wordsAdded > 0 && statistics.wordsDeleted > 0 && ', '}
          {statistics.wordsDeleted > 0 && `-${statistics.wordsDeleted} words`}
          {statistics.wordsAdded === 0 && statistics.wordsDeleted === 0 && 'No word changes'}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Change Type Indicator */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={config.color}>
          <Icon name={config.iconName} className="h-4 w-4 mr-1.5" />
          {config.label}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {statistics.changePercentage.toFixed(1)}% of text changed
        </span>
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="space-y-1">
          <div className="text-muted-foreground">Words</div>
          <div className="flex items-center gap-2">
            {statistics.wordsAdded > 0 && (
              <span className={`${COLORS.status.success} font-medium`}>
                +{statistics.wordsAdded}
              </span>
            )}
            {statistics.wordsDeleted > 0 && (
              <span className={`${COLORS.status.error} font-medium`}>
                -{statistics.wordsDeleted}
              </span>
            )}
            {statistics.wordsAdded === 0 && statistics.wordsDeleted === 0 && (
              <span className="text-muted-foreground">No changes</span>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-muted-foreground">Characters</div>
          <div className="flex items-center gap-2">
            {statistics.charsAdded > 0 && (
              <span className={`${COLORS.status.success} font-medium`}>
                +{statistics.charsAdded}
              </span>
            )}
            {statistics.charsDeleted > 0 && (
              <span className={`${COLORS.status.error} font-medium`}>
                -{statistics.charsDeleted}
              </span>
            )}
            {statistics.charsAdded === 0 && statistics.charsDeleted === 0 && (
              <span className="text-muted-foreground">No changes</span>
            )}
          </div>
        </div>
      </div>

      {/* Similarity Scores - Compact inline format */}
      {(similarity1 !== undefined || similarity2 !== undefined) && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
          <span>Similarity:</span>
          {similarity1 !== undefined && (
            <span className={similarity1 >= 80 ? COLORS.status.success : similarity1 >= 50 ? COLORS.status.warning : COLORS.status.error}>
              S1: {similarity1.toFixed(0)}%
            </span>
          )}
          {similarity2 !== undefined && (
            <span className={similarity2 >= 80 ? COLORS.status.success : similarity2 >= 50 ? COLORS.status.warning : COLORS.status.error}>
              S2: {similarity2.toFixed(0)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}


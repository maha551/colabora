import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { cn } from "./ui/utils";
import { computeDiffSegments, type DiffSegment } from "../utils/diffUtils";
import { useDiffColors } from "../hooks/useDiffColors";
import { DiffStatistics } from "./DiffStatistics";
import { DiffContextBar, type VoteSummary } from "./DiffContextBar";
import { useMemo } from "react";
import { useTranslation } from 'react-i18next';
import { logger } from '../lib/logger';
import { HeadingLevel } from '../types';
import { getHeadingClass } from '../lib/documentStyles';
import { useOnboarding } from '../hooks/useOnboarding';
import { OnboardingHint } from './OnboardingHint';
import { RADIUS } from '../lib/designSystem';

interface DiffViewerProps {
  originalText: string;
  suggestion1Text?: string;
  suggestion2Text?: string;
  suggestion1Author?: string;
  suggestion2Author?: string;
  suggestion1UserId?: string; // User ID for suggestion1 (for color assignment)
  suggestion2UserId?: string; // User ID for suggestion2 (for color assignment)
  highlightColor?: 'yellow' | 'green'; // Color for suggestion1 highlighting (fallback if no userId)
  originalLabel?: string; // Custom label for original text (e.g., "Accepted Version")
  inline?: boolean; // If true, render without Card background and badges (for inline paragraph view)
  showStatistics?: boolean; // Default: true in full mode, false in inline
  showContext?: boolean; // Default: true in full mode, false in inline
  isHeading?: boolean; // If true, render as heading element (h1, h2, h3)
  headingLevel?: HeadingLevel; // Heading level when isHeading is true
  // Context props
  suggestion1Timestamp?: Date | string;
  suggestion1Votes?: VoteSummary;
  suggestion2Timestamp?: Date | string;
  suggestion2Votes?: VoteSummary;
  suggestion1Id?: string;
  suggestion2Id?: string;
  onVote?: (suggestionId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => void;
  onComment?: (suggestionId: string) => void;
  totalUsers?: number;
  currentUserId?: string;
  suggestion1UserVote?: 'PRO' | 'NEUTRAL' | 'CONTRA';
  suggestion2UserVote?: 'PRO' | 'NEUTRAL' | 'CONTRA';
}

/**
 * Computes diff segments with error handling
 */
function getDiffSegments(
  original: string,
  suggestion1?: string,
  suggestion2?: string
): DiffSegment[] {
  try {
    // Handle null/undefined inputs
    const safeOriginal = original ?? '';
    const safeSuggestion1 = suggestion1 ?? undefined;
    const safeSuggestion2 = suggestion2 ?? undefined;

    if (!safeSuggestion1 && !safeSuggestion2) {
      return [{ text: safeOriginal, type: "original" }];
    }

    // Single suggestion mode: compare against accepted/original
    if (safeSuggestion1 && !safeSuggestion2) {
      return computeDiffSegments(safeOriginal, safeSuggestion1, "suggestion1");
    }
    
    if (safeSuggestion2 && !safeSuggestion1) {
      return computeDiffSegments(safeOriginal, safeSuggestion2, "suggestion2");
    }

    // Two suggestions mode: compare them directly
    if (safeSuggestion1 && safeSuggestion2) {
      // suggestion1 becomes baseline, suggestion2 is the diff
      return computeDiffSegments(safeSuggestion1, safeSuggestion2, "suggestion2");
    }

    return [{ text: safeOriginal, type: "original" }];
  } catch (error) {
    logger.error('Error computing diff segments:', error);
    // Return original text as fallback
    return [{ text: original ?? '', type: "original" }];
  }
}

export function DiffViewer({
  originalText,
  suggestion1Text,
  suggestion2Text,
  suggestion1Author,
  suggestion2Author,
  suggestion1UserId,
  suggestion2UserId,
  highlightColor = 'yellow',
  originalLabel,
  inline = false,
  showStatistics = !inline, // Show statistics in full mode by default
  showContext = !inline, // Show context in full mode by default
  isHeading = false,
  headingLevel,
  suggestion1Timestamp,
  suggestion1Votes,
  suggestion2Timestamp,
  suggestion2Votes,
  suggestion1Id,
  suggestion2Id,
  onVote,
  onComment,
  totalUsers,
  currentUserId,
  suggestion1UserVote,
  suggestion2UserVote,
}: DiffViewerProps) {
  const { hasSeenHint } = useOnboarding();
  const { t: tOnboarding } = useTranslation('onboarding');
  // Memoize diff segments computation for performance
  const segments = useMemo(() => {
    try {
      return getDiffSegments(originalText, suggestion1Text, suggestion2Text);
    } catch (error) {
      logger.error('Error computing diff segments:', error);
      // Return fallback
      return [{ text: originalText || '', type: "original" as const }];
    }
  }, [originalText, suggestion1Text, suggestion2Text]);

  // Use custom hook for color management
  const {
    user1Color,
    user1TextColor,
    user1BgColor,
    user2Color,
    user2TextColor,
    user2BgColor,
  } = useDiffColors({
    suggestion1UserId,
    suggestion2UserId,
    highlightColor,
  });
  
  // Detect comparison mode (memoized to prevent unnecessary recalculations)
  const isComparingTwoSuggestions = useMemo(
    () => !!(suggestion1Text && suggestion2Text),
    [suggestion1Text, suggestion2Text]
  );
  
  // Determine appropriate label for original text
  const getOriginalLabel = () => {
    if (originalLabel) return originalLabel;
    
    // Two suggestions mode: show suggestion1 as baseline
    if (isComparingTwoSuggestions) {
      return suggestion1Author 
        ? `${suggestion1Author} (baseline)`
        : "Suggestion 1 (baseline)";
    }
    
    // Single suggestion mode: show accepted/original
    if (!originalText.trim() && suggestion1Text) {
      return "New Content";
    }
    return "Original Text";
  };

  // Render diff segments with accessibility support
  const renderSegments = () => {
    return segments.map((segment, index) => {
      const segmentId = `diff-segment-${index}`;
      
      if (segment.type === "original") {
        // In mode 2, "original" segments are actually from suggestion1
        const ariaLabel = isComparingTwoSuggestions && suggestion1Author
          ? `Text from ${suggestion1Author}: ${segment.text.substring(0, 50)}${segment.text.length > 50 ? '...' : ''}`
          : `Unchanged text: ${segment.text.substring(0, 50)}${segment.text.length > 50 ? '...' : ''}`;
        
        return (
          <span 
            key={index} 
            id={segmentId}
            className="text-foreground"
            aria-label={ariaLabel}
          >
            {segment.text}
          </span>
        );
      } else if (segment.type === "deleted") {
        // Use user's color for deleted text (strikethrough only, no background)
        // Determine which user's color to use based on which suggestion is being compared
        let deletedColor: string;
        let deletedAriaLabel: string;
        
        if (isComparingTwoSuggestions) {
          // Mode 2: deleted means "in suggestion1 but not in suggestion2"
          deletedColor = user2Color || 'var(--color-blue-600)';
          deletedAriaLabel = suggestion2Author
            ? `Removed in ${suggestion2Author}'s version: ${segment.text.substring(0, 50)}${segment.text.length > 50 ? '...' : ''}`
            : `Removed in suggestion 2: ${segment.text.substring(0, 50)}${segment.text.length > 50 ? '...' : ''}`;
        } else if (suggestion1Text && !suggestion2Text) {
          // Only suggestion1 - use user1's color
          deletedColor = user1Color || (highlightColor === 'green' ? 'var(--color-green-600)' : 'var(--color-amber-600)');
          deletedAriaLabel = `Deleted text: ${segment.text.substring(0, 50)}${segment.text.length > 50 ? '...' : ''}`;
        } else if (suggestion2Text && !suggestion1Text) {
          // Only suggestion2 - use user2's color
          deletedColor = user2Color || 'var(--color-blue-600)';
          deletedAriaLabel = `Deleted text: ${segment.text.substring(0, 50)}${segment.text.length > 50 ? '...' : ''}`;
        } else {
          // Default - use user1's color
          deletedColor = user1Color || (highlightColor === 'green' ? 'var(--color-green-600)' : 'var(--color-amber-600)');
          deletedAriaLabel = `Deleted text: ${segment.text.substring(0, 50)}${segment.text.length > 50 ? '...' : ''}`;
        }
        
        return (
          <span
            key={index}
            id={segmentId}
            role="deletion"
            aria-label={deletedAriaLabel}
            style={{
              color: deletedColor,
            }}
            className="line-through opacity-70"
          >
            {segment.text}
          </span>
        );
      } else if (segment.type === "suggestion1") {
        // Use user color if available, otherwise fallback to highlightColor
        const authorLabel = suggestion1Author ? ` by ${suggestion1Author}` : '';
        if (user1BgColor) {
          return (
            <span
              key={index}
              id={segmentId}
              role="insertion"
              aria-label={`Added text${authorLabel}: ${segment.text.substring(0, 50)}${segment.text.length > 50 ? '...' : ''}`}
              style={{
                backgroundColor: user1BgColor,
              }}
              className="text-foreground px-0.5 rounded"
              tabIndex={0}
            >
              {segment.text}
            </span>
          );
        }
        // Fallback to original color system
        const bgColorVar = highlightColor === 'green' 
          ? '--color-green-200'
          : '--color-amber-200';
        const darkBgColorVar = highlightColor === 'green'
          ? '--color-green-500'
          : '--color-amber-500';
        return (
          <span
            key={index}
            id={segmentId}
            role="insertion"
            aria-label={`Added text${authorLabel}: ${segment.text.substring(0, 50)}${segment.text.length > 50 ? '...' : ''}`}
            style={{
              backgroundColor: `var(${bgColorVar})`,
            }}
            className={`text-foreground px-0.5 rounded dark:bg-[var(${darkBgColorVar})]`}
            tabIndex={0}
          >
            {segment.text}
          </span>
        );
      } else if (segment.type === "suggestion2") {
        // Use user color if available, otherwise fallback to blue
        const authorLabel = suggestion2Author ? ` by ${suggestion2Author}` : '';
        if (user2BgColor) {
          return (
            <span
              key={index}
              id={segmentId}
              role="insertion"
              aria-label={`Added text${authorLabel}: ${segment.text.substring(0, 50)}${segment.text.length > 50 ? '...' : ''}`}
              style={{
                backgroundColor: user2BgColor,
              }}
              className="text-foreground px-0.5 rounded"
              tabIndex={0}
            >
              {segment.text}
            </span>
          );
        }
        // Fallback to original blue
        return (
          <span
            key={index}
            id={segmentId}
            role="insertion"
            aria-label={`Added text${authorLabel}: ${segment.text.substring(0, 50)}${segment.text.length > 50 ? '...' : ''}`}
            style={{
              backgroundColor: 'var(--color-blue-200)',
            }}
            className="text-foreground px-0.5 rounded dark:bg-[var(--color-blue-500)]"
            tabIndex={0}
          >
            {segment.text}
          </span>
        );
      }
    });
  };

  // Inline mode: render without Card, badges, or background - just the diff segments
  if (inline) {
    // If this is a heading, use semantic heading element
    if (isHeading && headingLevel) {
      const level = typeof headingLevel === 'string' && headingLevel.startsWith('h') 
        ? parseInt(headingLevel.substring(1), 10) 
        : typeof headingLevel === 'number'
        ? headingLevel
        : 2;
      const validLevel = Math.max(1, Math.min(6, level));
      const headingClass = getHeadingClass(validLevel, false);
      
      const headingProps = {
        className: cn(headingClass, "leading-tight whitespace-pre-wrap text-foreground"),
        role: "text",
        "aria-label": "Diff view showing heading changes",
      };
      
      if (validLevel === 1) {
        return <h1 {...headingProps}>{renderSegments()}</h1>;
      } else if (validLevel === 2) {
        return <h2 {...headingProps}>{renderSegments()}</h2>;
      } else {
        return <h3 {...headingProps}>{renderSegments()}</h3>;
      }
    }
    
    // Default: render as paragraph for body text
    return (
      <p 
        className="leading-relaxed whitespace-pre-wrap text-foreground"
        role="text"
        aria-label="Diff view showing text changes"
      >
        {renderSegments()}
      </p>
    );
  }

  // Full mode: render with Card, badges, statistics, context, and background
  return (
    <Card className="p-3 sm:p-4 space-y-3 sm:space-y-4 bg-muted/30">
      {/* Header with labels */}
      {suggestion1Text && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="bg-background">
            {getOriginalLabel()}
          </Badge>
          <Badge 
            style={{
              backgroundColor: user1Color || 'var(--color-amber-500)',
              color: user1TextColor || 'var(--color-white)',
            }}
            className={!user1Color ? "hover:bg-[var(--color-amber-600)]" : undefined}
          >
            {suggestion1Author || "Suggestion 1"}
          </Badge>
          {suggestion2Text && (
            <>
              <Badge 
                style={{
                  backgroundColor: user2Color || 'var(--color-blue-500)',
                  color: user2TextColor || 'var(--color-white)',
                }}
                className={!user2Color ? "hover:bg-[var(--color-blue-600)]" : undefined}
              >
                {suggestion2Author || "Suggestion 2"}
              </Badge>
              {isComparingTwoSuggestions && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                  Comparing Suggestions
                </Badge>
              )}
            </>
          )}
        </div>
      )}

      {/* Statistics (only in full mode) */}
      {showStatistics && (suggestion1Text || suggestion2Text) && (
        <div className={cn("p-3 bg-background", RADIUS.control)}>
          <DiffStatistics
            originalText={originalText}
            suggestion1Text={suggestion1Text}
            suggestion2Text={suggestion2Text}
          />
        </div>
      )}

      {/* Context Bar (only in full mode) */}
      {showContext && (suggestion1Author || suggestion2Author) && (
        <div className={cn("p-3 bg-background space-y-3", RADIUS.control)}>
          {suggestion1Text && suggestion2Text && !hasSeenHint('diff-color-legend') && (
            <OnboardingHint
              hintKey="diff-color-legend"
              message={tOnboarding('diffColorLegend')}
              variant="tip"
              position="inline"
              showOnce={true}
              delay={300}
            />
          )}
          <DiffContextBar
            suggestion1Author={suggestion1Author}
            suggestion1UserId={suggestion1UserId}
            suggestion1Timestamp={suggestion1Timestamp}
            suggestion1Votes={suggestion1Votes}
            suggestion2Author={suggestion2Author}
            suggestion2UserId={suggestion2UserId}
            suggestion2Timestamp={suggestion2Timestamp}
            suggestion2Votes={suggestion2Votes}
            suggestion1Id={suggestion1Id}
            suggestion2Id={suggestion2Id}
            onVote={onVote}
            onComment={onComment}
            totalUsers={totalUsers}
            currentUserId={currentUserId}
            suggestion1UserVote={suggestion1UserVote}
            suggestion2UserVote={suggestion2UserVote}
          />
        </div>
      )}
      
      {/* Diff Content */}
      <div 
        className={cn("p-2 sm:p-3 bg-background leading-relaxed overflow-x-auto", RADIUS.control)}
        role="text"
        aria-label="Diff view showing text changes"
        aria-live="polite"
      >
        {segments.length === 0 ? (
          <div className="text-center text-muted-foreground py-4">
            Unable to display diff. Showing original text.
          </div>
        ) : (
          renderSegments()
        )}
      </div>
    </Card>
  );
}

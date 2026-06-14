import React from 'react';
import { StructureOperation } from '../../types';
import { SPACING, COLORS } from '../../lib/designSystem';
import { cn } from '../ui/utils';
import { Icon } from '../ui/Icon';

interface StructureOperationsSummaryProps {
  operations: StructureOperation[];
  expandable?: boolean;
  maxVisible?: number;
}

/**
 * Displays a summary of structure proposal operations
 * Used in both StructureProposalCardWrapper and "View Changes" dialog
 */
export function StructureOperationsSummary({
  operations,
  expandable = false,
  maxVisible = 3,
}: StructureOperationsSummaryProps) {
  const [expanded, setExpanded] = React.useState(!expandable);

  const visibleOperations = expanded ? operations : operations.slice(0, maxVisible);
  const hasMore = operations.length > maxVisible;

  const renderOperationSummary = (operation: StructureOperation) => {
    switch (operation.operationType) {
      case 'MOVE':
        return `Move section to position ${operation.newPositionIndex}`;
      case 'MERGE':
        return `Merge ${operation.sourceParagraphIds?.length || 0} sections into one`;
      case 'DELETE':
        return 'Mark section for deletion';
      case 'RENAME_HEADING':
        return `Rename heading to "${operation.newText}"`;
      case 'CHANGE_HEADING_LEVEL':
        return `Change heading level to ${operation.newHeadingLevel}`;
      case 'INSERT_NEW':
        return 'Insert new section';
      default:
        return operation.operationType;
    }
  };

  const getOperationIcon = (operationType: string): React.ReactNode => {
    const iconClassName = 'h-4 w-4 shrink-0';
    switch (operationType) {
      case 'MOVE':
        return <Icon name="Move" className={iconClassName} />;
      case 'MERGE':
        return <Icon name="Merge" className={iconClassName} />;
      case 'DELETE':
        return <Icon name="Trash2" className={iconClassName} />;
      case 'RENAME_HEADING':
        return <Icon name="Pencil" className={iconClassName} />;
      case 'CHANGE_HEADING_LEVEL':
        return <Icon name="BarChart3" className={iconClassName} />;
      case 'INSERT_NEW':
        return <Icon name="Plus" className={iconClassName} />;
      default:
        return <Icon name="FileText" className={iconClassName} />;
    }
  };

  if (operations.length === 0) {
    return (
      <div className={cn(SPACING.content.gap, COLORS.text.secondary)}>
        <p>No operations specified</p>
      </div>
    );
  }

  return (
    <div className={cn(SPACING.content.gap)}>
      <ul className={cn(SPACING.tight.gap)}>
        {visibleOperations.map((operation, index) => (
          <li
            key={operation.id || `op-${index}`}
            className={cn(
              'flex items-start gap-2',
              SPACING.tight.inline,
              COLORS.text.primary
            )}
          >
            <span className="flex-shrink-0" aria-hidden="true">
              {getOperationIcon(operation.operationType)}
            </span>
            <span>{renderOperationSummary(operation)}</span>
          </li>
        ))}
      </ul>
      {expandable && hasMore && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className={cn(
            'text-sm',
            COLORS.text.secondary,
            'hover:underline',
            'focus:outline-none focus:ring-2 focus:ring-primary/50 rounded'
          )}
        >
          Show {operations.length - maxVisible} more operations
        </button>
      )}
      {expandable && expanded && hasMore && (
        <button
          onClick={() => setExpanded(false)}
          className={cn(
            'text-sm',
            COLORS.text.secondary,
            'hover:underline',
            'focus:outline-none focus:ring-2 focus:ring-primary/50 rounded'
          )}
        >
          Show less
        </button>
      )}
    </div>
  );
}


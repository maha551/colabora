import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../ui/Icon';
import { Button } from '../ui/button';
import { DocumentStatusIcon } from '../DocumentStatusIcon';
import { DocumentLifecycleStepper } from '../DocumentLifecycleStepper';
import DocumentStatusDisplay from '../DocumentStatusDisplay';
import { DocumentLifecycleCompactRow } from '../DocumentLifecycleCompactRow';
import { DocumentTreeNode as TreeNodeType } from './types';
import { cn } from '../ui/utils';
import { RADIUS } from '../../lib/designSystem';

interface DocumentTreeNodeProps {
  node: TreeNodeType;
  isExpanded: boolean;
  isActive: boolean;
  onToggleExpand: () => void;
  onSelect: () => void;
  showStatus?: boolean;
  showMetadata?: boolean;
  compact?: boolean;
  className?: string;
}

export function DocumentTreeNode({
  node,
  isExpanded,
  isActive,
  onToggleExpand,
  onSelect,
  showStatus = true,
  showMetadata = false,
  compact = false,
  className,
}: DocumentTreeNodeProps) {
  const { t } = useTranslation('documents');
  const [expandedStatus, setExpandedStatus] = useState(false);
  const hasChildren = node.children.length > 0;
  const indentPadding = node.level * 20; // 20px per level
  const nodeHeight = compact ? 40 : 56;
  const doc = node.document;

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'flex items-center gap-2 px-3 cursor-pointer transition-all w-full group', RADIUS.panel,
          compact ? 'py-2' : 'py-2.5',
          isActive
            ? 'bg-accent border-l-[3px] border-l-primary'
            : 'hover:bg-muted/50 border-l-[3px] border-l-transparent'
        )}
        style={{
          paddingLeft: `${12 + indentPadding}px`,
          minHeight: `${nodeHeight}px`,
        }}
        onClick={onSelect}
        role="treeitem"
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-selected={isActive}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onSelect();
          } else if (e.key === 'ArrowRight' && hasChildren && !isExpanded) {
            e.preventDefault();
            e.stopPropagation();
            onToggleExpand();
          } else if (e.key === 'ArrowLeft' && hasChildren && isExpanded) {
            e.preventDefault();
            e.stopPropagation();
            onToggleExpand();
          }
        }}
      >
        {/* Expand/Collapse button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className={cn(
            'p-0.5 rounded transition-colors flex-shrink-0',
            'hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1'
          )}
          disabled={!hasChildren}
          aria-label={hasChildren ? (isExpanded ? t('tree.collapse') : t('tree.expand')) : t('tree.noChildren')}
          tabIndex={-1}
        >
          {hasChildren ? (
            isExpanded ? (
              <Icon name="ChevronDown" className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Icon name="ChevronRight" className="h-4 w-4 text-muted-foreground" />
            )
          ) : (
            <div className="w-4 h-4" />
          )}
        </button>

        {/* Status icon/badge - compact hint only; full status in row below */}
        {showStatus && (
          <div className="flex items-center flex-shrink-0 self-center">
            <DocumentStatusIcon document={doc} size="sm" />
          </div>
        )}

        {/* Document title */}
        <span
          className={cn(
            'flex-1 truncate text-sm transition-opacity',
            isActive ? 'font-semibold text-foreground' : 'font-normal text-foreground'
          )}
          title={node.document.title}
        >
          {node.document.title}
        </span>

        {/* Metadata (optional) */}
        {showMetadata && !compact && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
            {doc.collaborators.length > 0 && (
              <span>{doc.collaborators.length} collab</span>
            )}
          </div>
        )}
      </div>

      {/* Status row - dedicated row for lifecycle/status, expandable */}
      {showStatus && (
        <div
          className={cn('border-t border-border/60 bg-muted/10 mt-0.5 pt-1.5 pb-1.5 px-3 rounded-b min-w-0', 'flex flex-col gap-1')}
          style={{ paddingLeft: `${12 + indentPadding + 8}px` }}
          role="region"
          aria-label={t('statusRowLabel', { defaultValue: 'Document status' })}
          onClick={(e) => e.stopPropagation()}
        >
          {expandedStatus ? (
            <>
              {doc.ownershipType === 'organizational' ? (
                <div className="min-w-0 overflow-x-auto rounded border border-border/60 bg-card/50 p-1.5">
                  <DocumentLifecycleStepper document={doc} compact={false} embedInCard={false} />
                </div>
              ) : (
                <div className="rounded border border-border/60 bg-card/50 p-1.5">
                  <DocumentStatusDisplay document={doc} compact={false} />
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setExpandedStatus(false); }}
                className="h-7 min-w-[44px] touch-manipulation text-xs self-start"
                aria-expanded={true}
                aria-label={t('hideStatusDetailsAria', { defaultValue: 'Hide status details' })}
              >
                <Icon name="ChevronUp" className="h-3 w-3 mr-1" aria-hidden />
                {t('hideStatusDetails', { defaultValue: 'Hide' })}
              </Button>
            </>
          ) : (
            <>
              {doc.ownershipType === 'organizational' ? (
                <DocumentLifecycleCompactRow
                  document={doc}
                  onExpandClick={() => setExpandedStatus(true)}
                  expandLabel={t('showFullStatus', { defaultValue: 'Show full status' })}
                  isExpanded={false}
                />
              ) : (
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <DocumentStatusDisplay document={doc} compact={true} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); setExpandedStatus(true); }}
                    className="h-7 min-w-[44px] touch-manipulation text-xs flex-shrink-0"
                    aria-expanded={false}
                    aria-label={t('showFullStatus', { defaultValue: 'Show full status' })}
                  >
                    <Icon name="ChevronDown" className="h-3 w-3 mr-1" aria-hidden />
                    {t('showFullStatus', { defaultValue: 'Show full status' })}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Connector line for visual hierarchy */}
      {hasChildren && node.level > 0 && (
        <div
          className="absolute left-0 top-0 bottom-0 w-px bg-border"
          style={{
            left: `${12 + (node.level - 1) * 20 + 8}px`,
            top: `${nodeHeight}px`,
            height: 'calc(100% - 40px)',
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}


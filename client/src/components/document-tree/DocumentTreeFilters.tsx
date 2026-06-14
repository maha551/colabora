import React from 'react';
import { Document } from '../../types';
import { DocumentTreeFiltersProps } from './types';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Icon } from '../ui/Icon';
import { cn } from '../ui/utils';

const STATUS_LABELS: Record<NonNullable<Document['status']>, string> = {
  proposal: 'Proposal',
  voting: 'Voting',
  agreed: 'Agreed',
  rejected: 'Rejected',
  expired: 'Expired',
  draft: 'Draft',
};

const OWNERSHIP_LABELS: Record<NonNullable<Document['ownershipType']>, string> = {
  personal: 'Personal',
  shared: 'Shared',
  organizational: 'Organizational',
};

export function DocumentTreeFilters({
  filters,
  onFiltersChange,
  availableStatuses,
  availableOwnershipTypes,
  className,
}: DocumentTreeFiltersProps) {
  const hasActiveFilters =
    (filters.status && filters.status.length > 0) ||
    (filters.ownershipType && filters.ownershipType.length > 0) ||
    filters.hasChildren !== undefined ||
    filters.rootDocuments !== undefined;

  const toggleStatus = (status: Document['status']) => {
    const currentStatuses = filters.status || [];
    const newStatuses = currentStatuses.includes(status)
      ? currentStatuses.filter(s => s !== status)
      : [...currentStatuses, status];
    
    onFiltersChange({
      ...filters,
      status: newStatuses.length > 0 ? newStatuses : undefined,
    });
  };

  const toggleOwnershipType = (type: Document['ownershipType']) => {
    const currentTypes = filters.ownershipType || [];
    const newTypes = currentTypes.includes(type)
      ? currentTypes.filter(t => t !== type)
      : [...currentTypes, type];
    
    onFiltersChange({
      ...filters,
      ownershipType: newTypes.length > 0 ? newTypes : undefined,
    });
  };

  const clearAll = () => {
    onFiltersChange({});
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Status filters */}
      {availableStatuses && availableStatuses.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase">Status</div>
          <div className="flex flex-wrap gap-2">
            {availableStatuses.map(status => {
              const isActive = filters.status?.includes(status);
              return (
                <Badge
                  key={status}
                  variant={isActive ? 'default' : 'outline'}
                  className={cn(
                    'cursor-pointer transition-colors',
                    isActive && 'bg-blue-600 text-white hover:bg-blue-700'
                  )}
                  onClick={() => toggleStatus(status)}
                >
                  {STATUS_LABELS[status]}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* Ownership type filters */}
      {availableOwnershipTypes && availableOwnershipTypes.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase">Ownership</div>
          <div className="flex flex-wrap gap-2">
            {availableOwnershipTypes.map(type => {
              const isActive = filters.ownershipType?.includes(type);
              return (
                <Badge
                  key={type}
                  variant={isActive ? 'default' : 'outline'}
                  className={cn(
                    'cursor-pointer transition-colors',
                    isActive && 'bg-blue-600 text-white hover:bg-blue-700'
                  )}
                  onClick={() => toggleOwnershipType(type)}
                >
                  {OWNERSHIP_LABELS[type]}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* Structure filters */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase">Structure</div>
        <div className="flex flex-wrap gap-2">
          <Badge
            variant={filters.hasChildren ? 'default' : 'outline'}
            className={cn(
              'cursor-pointer transition-colors',
              filters.hasChildren && 'bg-blue-600 text-white hover:bg-blue-700'
            )}
            onClick={() =>
              onFiltersChange({
                ...filters,
                hasChildren: filters.hasChildren === true ? undefined : true,
              })
            }
          >
            Has Children
          </Badge>
          <Badge
            variant={filters.rootDocuments ? 'default' : 'outline'}
            className={cn(
              'cursor-pointer transition-colors',
              filters.rootDocuments && 'bg-blue-600 text-white hover:bg-blue-700'
            )}
            onClick={() =>
              onFiltersChange({
                ...filters,
                rootDocuments: filters.rootDocuments ? undefined : true,
              })
            }
          >
            Root Documents
          </Badge>
        </div>
      </div>

      {/* Clear all button */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAll}
          className="w-full text-xs"
        >
          <Icon name="X" className="h-3 w-3 mr-1" />
          Clear All Filters
        </Button>
      )}
    </div>
  );
}


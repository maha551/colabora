import React from 'react';
import { useTranslation } from 'react-i18next';
import { DocumentTreeSearch } from '../document-tree/DocumentTreeSearch';
import { Icon } from '../ui/Icon';
import { OrganizationAvatar } from '../shared/OrganizationAvatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from '../ui/select';
import { SPACING, RADIUS, PANEL, COLORS } from '../../lib/designSystem';
import { TabPanelFilters } from '../layout/TabPanelFilters';
import { cn } from '../ui/utils';
import type { Organization } from '../../types';
import type { ContentTypeFilter, StatusFilterValue } from '../../hooks/useDocumentFiltering';
import type { Document } from '../../types';

export type DocumentFilterValue = 'all' | 'owned' | 'personal' | 'shared' | 'organizational' | string;
export type ViewMode = 'list' | 'tree';

export interface DocumentFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  /** All / Documents only / Meeting minutes only */
  contentTypeFilter?: ContentTypeFilter;
  onContentTypeFilterChange?: (value: ContentTypeFilter) => void;
  /** All or single document status (same as organization Documents tab). */
  statusFilter?: StatusFilterValue;
  onStatusFilterChange?: (value: StatusFilterValue) => void;
  documentFilter: DocumentFilterValue;
  onDocumentFilterChange: (value: DocumentFilterValue) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
  hasHierarchy: boolean;
  filteredCount: number;
  organizations: Organization[];
  getFilterLabel: (filter: DocumentFilterValue) => string;
}

function DocumentFiltersComponent({
  searchQuery,
  onSearchChange,
  contentTypeFilter = 'all',
  onContentTypeFilterChange,
  statusFilter = 'all',
  onStatusFilterChange,
  documentFilter,
  onDocumentFilterChange,
  sortBy,
  onSortChange,
  viewMode,
  onViewModeChange,
  hasHierarchy,
  filteredCount,
  organizations,
  getFilterLabel,
}: DocumentFiltersProps) {
  const { t: tDoc } = useTranslation('documents');
  const { t: tCommon } = useTranslation('common');

  return (
    <>
      <TabPanelFilters withMarginBottom={false} className="min-w-0">
        <div className="relative flex-1 min-w-0">
          <DocumentTreeSearch
            value={searchQuery}
            onChange={onSearchChange}
            placeholder={tDoc('dashboard.placeholderSearch')}
          />
        </div>
        <div className={cn('flex items-center', SPACING.tight.inline)}>
          {hasHierarchy && contentTypeFilter !== 'minutes' && (
            <div className={cn('hidden sm:flex items-center', SPACING.tight.inline, 'bg-card border border-border p-1', RADIUS.panel)}>
              <button
                onClick={() => onViewModeChange('list')}
                className={`px-2 sm:px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  viewMode === 'list'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                aria-label={tCommon('aria.listView')}
              >
                <Icon name="LayoutGrid" className="h-4 w-4" />
              </button>
              <button
                onClick={() => onViewModeChange('tree')}
                className={`px-2 sm:px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  viewMode === 'tree'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                aria-label={tCommon('aria.treeView')}
              >
                <Icon name="ListTree" className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className={cn('text-sm whitespace-nowrap', COLORS.text.secondary)}>
            {tDoc('dashboard.documentCount', { count: filteredCount })}
          </div>
        </div>
      </TabPanelFilters>

      <div className={cn('flex flex-col gap-3 sm:grid sm:grid-cols-2 md:flex md:flex-col', PANEL.filters.marginBottom)}>
        {/* Type, Status, Ownership and Sort – same dropdown pattern as organization Documents tab */}
        <div className={cn('flex flex-wrap items-center gap-2 sm:gap-3 bg-card px-3 py-2.5 border border-border shadow-sm sm:col-span-2 md:col-span-1', RADIUS.panel)}>
        <div className={cn('flex flex-wrap items-center gap-2 sm:gap-3 flex-1 min-w-0 sm:grid sm:grid-cols-2 md:flex md:flex-wrap', SPACING.toolbar.gap)}>
          <Icon name="Filter" className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          {/* Type filter dropdown */}
          {onContentTypeFilterChange != null && (
            <>
              <span className="text-sm font-medium text-foreground">{tDoc('typeFilterLabel', { defaultValue: 'Type' })}:</span>
              <Select value={contentTypeFilter} onValueChange={(v) => onContentTypeFilterChange(v as ContentTypeFilter)}>
                <SelectTrigger className={cn('min-h-11 min-w-0 w-full md:w-[160px]')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tDoc('typeFilterAll', { defaultValue: 'All' })}</SelectItem>
                  <SelectItem value="documents">{tDoc('typeFilterDocuments', { defaultValue: 'Documents' })}</SelectItem>
                  <SelectItem value="minutes">{tDoc('typeFilterMeetingMinutes', { defaultValue: 'Meeting minutes' })}</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
          {/* Status filter dropdown */}
          {onStatusFilterChange != null && (
            <>
              <span className="text-sm font-medium text-foreground">{tDoc('statusFilterLabel', { defaultValue: 'Status' })}:</span>
              <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as StatusFilterValue)}>
                <SelectTrigger className={cn('min-h-11 min-w-0 w-full md:w-[140px]')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tDoc('statusFilterAll', { defaultValue: 'All' })}</SelectItem>
                  {(['proposal', 'voting', 'agreed', 'rejected', 'expired', 'draft'] as const).map((status: NonNullable<Document['status']>) => (
                    <SelectItem key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </SelectItem>
                  ))}
                  <SelectItem value="amendments_open">{tDoc('statusFilterAmendmentsOpen', { defaultValue: 'Amendments open' })}</SelectItem>
                  <SelectItem value="amendments_closed">{tDoc('statusFilterAmendmentsClosed', { defaultValue: 'Amendments closed' })}</SelectItem>
                  <SelectItem value="amendment_adoption_pending">{tDoc('statusFilterAdoptionPending', { defaultValue: 'Adoption vote pending' })}</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
          <Select value={documentFilter} onValueChange={(value) => onDocumentFilterChange(value as DocumentFilterValue)}>
            <SelectTrigger className={cn('min-h-11 min-w-0 w-full md:w-[200px]')}>
              <SelectValue placeholder={tDoc('dashboard.filterDocuments')}>
                <div className="flex items-center gap-2 min-w-0">
                  <Icon name="Filter" className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{getFilterLabel(documentFilter)}</span>
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <Icon name="FileText" className="h-4 w-4" />
                  <span>{tDoc('dashboard.filterAll')}</span>
                </div>
              </SelectItem>
              <SelectSeparator />
              <SelectItem value="owned">
                <div className="flex items-center gap-2">
                  <Icon name="User" className="h-4 w-4" />
                  <span>{tDoc('dashboard.filterMy')}</span>
                </div>
              </SelectItem>
              <SelectItem value="personal">
                <div className="flex items-center gap-2">
                  <Icon name="Folder" className="h-4 w-4" />
                  <span>{tDoc('dashboard.filterPersonal')}</span>
                </div>
              </SelectItem>
              <SelectItem value="shared">
                <div className="flex items-center gap-2">
                  <Icon name="Share" className="h-4 w-4" />
                  <span>{tDoc('dashboard.filterShared')}</span>
                </div>
              </SelectItem>
              <SelectItem value="organizational">
                <div className="flex items-center gap-2">
                  <Icon name="Users" className="h-4 w-4" />
                  <span>{tDoc('dashboard.filterOrganizational')}</span>
                </div>
              </SelectItem>
              {organizations.length > 0 && (
                <>
                  <SelectSeparator />
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      <div className="flex items-center gap-2">
                        <OrganizationAvatar organization={org} size="xs" />
                        <span>{org.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>

          <Icon name="ArrowUpDown" className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger className={cn('min-h-11 min-w-0 w-full flex-1 md:flex-none md:w-[180px]')} title={sortBy === 'modified' ? tDoc('sortModified') : sortBy === 'created' ? tDoc('sortCreated') : sortBy === 'title' ? tDoc('sortTitle') : tDoc('sortSuggestions')}>
              <SelectValue placeholder={tDoc('sortBy')}>
                <span className="truncate">{sortBy === 'modified' ? tDoc('sortModified') : sortBy === 'created' ? tDoc('sortCreated') : sortBy === 'title' ? tDoc('sortTitle') : tDoc('sortSuggestions')}</span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="modified">{tDoc('sortModified')}</SelectItem>
              <SelectItem value="created">{tDoc('sortCreated')}</SelectItem>
              <SelectItem value="title">{tDoc('sortTitle')}</SelectItem>
              {contentTypeFilter !== 'minutes' && (
                <SelectItem value="suggestions">{tDoc('sortSuggestions')}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        </div>
      </div>
    </>
  );
}

export const DocumentFilters = React.memo<DocumentFiltersProps>(DocumentFiltersComponent);

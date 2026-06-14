import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { SearchBar } from '../components/SearchBar';
import { SearchResults } from '../components/SearchResults';
import { ErrorState } from '../components/ui/ErrorState';
import { searchApi } from '../lib/api';
import type { SearchResult, SearchFilters, SearchEntityType } from '../types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Icon } from '../components/ui/Icon';
import { logger } from '../lib/logger';
import { SPACING, COLORS } from '../lib/designSystem';
import { cn } from '../components/ui/utils';

const ALL_ENTITY_TYPES: SearchEntityType[] = ['document', 'paragraph', 'meeting'];

interface SearchPageProps {
  onSelectResult: (result: SearchResult, searchQuery?: string) => Promise<void>;
}

export function SearchPage({ onSelectResult }: SearchPageProps) {
  const { t } = useTranslation('documents');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [facets, setFacets] = useState<Partial<Record<SearchEntityType, number>>>({});
  const [filters, setFilters] = useState<SearchFilters>({
    types: [...ALL_ENTITY_TYPES],
    limit: 20,
    offset: 0,
  });
  const [totalCount, setTotalCount] = useState(0);

  const performSearch = async (searchQuery: string, searchFilters: SearchFilters = filters) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setTotalCount(0);
      setFacets({});
      setSearchError(null);
      return;
    }

    setLoading(true);
    setSearchError(null);
    try {
      const response = await searchApi.search(searchQuery, searchFilters);
      setResults(response.results);
      setTotalCount(response.count);
      setFacets(response.facets ?? {});
    } catch (error) {
      logger.error('Search failed', error);
      setResults([]);
      setTotalCount(0);
      setFacets({});
      setSearchError(t('search.failed'));
      toast.error(t('search.failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (searchQuery: string) => {
    setQuery(searchQuery);
    const newFilters = { ...filters, offset: 0 };
    setFilters(newFilters);
    performSearch(searchQuery, newFilters);
  };

  const handleFilterChange = (key: keyof SearchFilters, value: string | number | undefined) => {
    const newFilters = { ...filters, [key]: value, offset: 0 };
    setFilters(newFilters);
    if (query) {
      performSearch(query, newFilters);
    }
  };

  const toggleEntityType = (entityType: SearchEntityType) => {
    const current = filters.types ?? [...ALL_ENTITY_TYPES];
    const next = current.includes(entityType)
      ? current.filter((t) => t !== entityType)
      : [...current, entityType];
    const normalized = next.length > 0 ? next : [...ALL_ENTITY_TYPES];
    const newFilters = { ...filters, types: normalized, offset: 0 };
    setFilters(newFilters);
    if (query) {
      performSearch(query, newFilters);
    }
  };

  const handleSelectResult = async (result: SearchResult) => {
    try {
      await onSelectResult(result, query);
    } catch (error) {
      logger.error('Failed to open search result:', error);
      toast.error(t('search.openFailed'));
    }
  };

  const handlePageChange = (newOffset: number) => {
    const newFilters = { ...filters, offset: newOffset };
    setFilters(newFilters);
    if (query) {
      performSearch(query, newFilters);
    }
  };

  const currentPage = Math.floor((filters.offset || 0) / (filters.limit || 20)) + 1;
  const totalPages = Math.ceil(totalCount / (filters.limit || 20));
  const activeTypes = filters.types ?? ALL_ENTITY_TYPES;

  return (
    <div className={cn('min-h-screen', SPACING.layout.containPage)}>
      <div className={cn(SPACING.layout.contentMax, SPACING.page.x, SPACING.page.top, SPACING.page.y)}>
        <div className={SPACING.section.margin}>
          <SearchBar onSearch={handleSearch} />
        </div>

        {query && (
          <>
            <Card className={SPACING.section.margin}>
              <CardHeader>
                <CardTitle className="text-lg">{t('search.filtersTitle')}</CardTitle>
              </CardHeader>
              <CardContent className={SPACING.content.gap}>
                <div className={SPACING.tight.gap}>
                  <Label>{t('search.entityFilterLabel')}</Label>
                  <div className={cn('flex flex-wrap', SPACING.tight.inline)}>
                    {ALL_ENTITY_TYPES.map((entityType) => (
                      <Button
                        key={entityType}
                        type="button"
                        size="sm"
                        variant={activeTypes.includes(entityType) ? 'default' : 'outline'}
                        onClick={() => toggleEntityType(entityType)}
                      >
                        {entityType === 'document' && t('typeFilterDocuments')}
                        {entityType === 'paragraph' && t('search.typeFilterParagraphs')}
                        {entityType === 'meeting' && t('search.typeFilterMeetings')}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className={cn('grid grid-cols-1 md:grid-cols-3', SPACING.content.inline)}>
                  <div className={SPACING.tight.gap}>
                    <Label htmlFor="status-filter">{t('statusFilterLabel')}</Label>
                    <Select
                      value={filters.status || '__all__'}
                      onValueChange={(value) => handleFilterChange('status', value === '__all__' ? undefined : value)}
                    >
                      <SelectTrigger id="status-filter">
                        <SelectValue placeholder={t('statusFilterAll')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">{t('statusFilterAll')}</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="proposal">Proposal</SelectItem>
                        <SelectItem value="voting">Voting</SelectItem>
                        <SelectItem value="agreed">Agreed</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="amendments_open">{t('statusFilterAmendmentsOpen', { defaultValue: 'Amendments open' })}</SelectItem>
                        <SelectItem value="amendments_closed">{t('statusFilterAmendmentsClosed', { defaultValue: 'Amendments closed' })}</SelectItem>
                        <SelectItem value="amendment_adoption_pending">{t('statusFilterAdoptionPending', { defaultValue: 'Adoption vote pending' })}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className={SPACING.tight.gap}>
                    <Label htmlFor="date-from">{t('search.dateFrom')}</Label>
                    <Input
                      id="date-from"
                      type="date"
                      value={filters.dateFrom || ''}
                      onChange={(e) => handleFilterChange('dateFrom', e.target.value || undefined)}
                    />
                  </div>

                  <div className={SPACING.tight.gap}>
                    <Label htmlFor="date-to">{t('search.dateTo')}</Label>
                    <Input
                      id="date-to"
                      type="date"
                      value={filters.dateTo || ''}
                      onChange={(e) => handleFilterChange('dateTo', e.target.value || undefined)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className={SPACING.section.margin}>
              <p className={cn('text-sm', COLORS.text.secondary)}>
                {t('search.resultsCount', { count: totalCount })}
              </p>
              {Object.keys(facets).length > 0 && (
                <p className={cn('text-xs mt-1', COLORS.text.secondary)}>
                  {[
                    facets.document != null ? t('search.facetDocuments', { count: facets.document }) : null,
                    facets.paragraph != null ? t('search.facetParagraphs', { count: facets.paragraph }) : null,
                    facets.meeting != null ? t('search.facetMeetings', { count: facets.meeting }) : null,
                  ].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>

            {searchError && !loading ? (
              <ErrorState
                message={searchError}
                onRetry={() => performSearch(query, filters)}
              />
            ) : (
              <SearchResults
                results={results}
                onSelectResult={handleSelectResult}
                isLoading={loading}
              />
            )}

            {totalPages > 1 && (
              <div className={cn('flex items-center justify-between', SPACING.section.top)}>
                <Button
                  variant="outline"
                  onClick={() => handlePageChange(Math.max(0, (filters.offset || 0) - (filters.limit || 20)))}
                  disabled={currentPage === 1 || loading}
                >
                  <Icon name="ChevronLeft" className="h-4 w-4 mr-1" />
                  {t('common:buttons.previous')}
                </Button>
                <span className={cn('text-sm', COLORS.text.secondary)}>
                  {t('search.pageOf', { current: currentPage, total: totalPages })}
                </span>
                <Button
                  variant="outline"
                  onClick={() => handlePageChange((filters.offset || 0) + (filters.limit || 20))}
                  disabled={currentPage === totalPages || loading}
                >
                  {t('common:buttons.next')}
                  <Icon name="ChevronRight" className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}

        {!query && (
          <div className={cn('text-center', SPACING.page.y)}>
            <p className={COLORS.text.secondary}>{t('search.enterQuery')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

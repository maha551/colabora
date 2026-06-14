import { useTranslation } from 'react-i18next';
import type { SearchResult } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Icon } from './ui/Icon';
import { OrganizationAvatar } from './shared/OrganizationAvatar';
import { EmptyState } from './ui/EmptyState';
import { LoadingState } from './ui/LoadingState';
import { useTimezone } from '../hooks/useTimezone';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { SPACING, COLORS } from '../lib/designSystem';
import { cn } from './ui/utils';

interface SearchResultsProps {
  results: SearchResult[];
  onSelectResult: (result: SearchResult) => void;
  isLoading?: boolean;
}

function getResultKey(result: SearchResult): string {
  if (result.entityType === 'paragraph') {
    return `paragraph-${result.paragraphId}`;
  }
  if (result.entityType === 'meeting') {
    return `meeting-${result.meetingId}`;
  }
  return `document-${result.id}`;
}

export function SearchResults({ results, onSelectResult, isLoading = false }: SearchResultsProps) {
  const { t } = useTranslation('documents');
  const { formatDate } = useTimezone();

  if (isLoading) {
    return (
      <LoadingState isLoading={true} mode="skeleton" skeletonVariant="card" skeletonCount={3} className={SPACING.content.gap}>
        <div />
      </LoadingState>
    );
  }

  if (results.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="Search" className="h-16 w-16" />}
        title={t('dashboard.noDocumentsFound')}
        description={t('dashboard.noDocumentsFoundDescription')}
      />
    );
  }

  return (
    <div className={SPACING.content.gap}>
      {results.map((result) => (
        <Card
          key={getResultKey(result)}
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onSelectResult(result)}
        >
          <CardHeader>
            <div className={cn('flex items-start justify-between', SPACING.content.inline)}>
              <div className="flex-1">
                <div className={cn('flex items-center flex-wrap mb-2', SPACING.tight.inline)}>
                  <Badge variant="outline">
                    {result.entityType === 'document' && t('search.entityDocument')}
                    {result.entityType === 'paragraph' && t('search.entityParagraph')}
                    {result.entityType === 'meeting' && t('search.entityMeeting')}
                  </Badge>
                  {result.entityType === 'paragraph' && result.documentKind === 'meeting_minutes' && (
                    <Badge variant="secondary">{t('typeFilterMeetingMinutes')}</Badge>
                  )}
                  {result.entityType === 'document' && (
                    <Badge variant={result.status === 'agreed' ? 'default' : 'secondary'}>
                      {result.status}
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-lg mb-2">{result.title}</CardTitle>
                {result.entityType === 'paragraph' && (
                  <CardDescription className="line-clamp-1">
                    {t('search.inDocument', { title: result.documentTitle })}
                  </CardDescription>
                )}
                {result.entityType === 'document' && result.description && (
                  <CardDescription className="line-clamp-2">{result.description}</CardDescription>
                )}
                {result.entityType === 'meeting' && result.location && (
                  <CardDescription className="line-clamp-1">{result.location}</CardDescription>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {result.snippet && (
              <div className={cn('text-sm line-clamp-2 prose prose-sm max-w-none dark:prose-invert mb-4', COLORS.text.secondary)}>
                <ReactMarkdown
                  rehypePlugins={[rehypeSanitize]}
                  components={{
                    p: ({ children }) => <span className="inline">{children}</span>,
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                    mark: ({ children }) => <mark className="bg-yellow-200 dark:bg-yellow-800">{children}</mark>,
                  }}
                >
                  {result.snippet}
                </ReactMarkdown>
              </div>
            )}
            <div className={cn('flex flex-wrap items-center text-xs', SPACING.content.inline, COLORS.text.secondary)}>
              {result.entityType === 'document' && result.owner?.name && (
                <div className={cn('flex items-center', SPACING.tight.inline)}>
                  <Icon name="User" className="h-3 w-3" />
                  <span>{result.owner.name}</span>
                </div>
              )}
              {result.entityType === 'paragraph' && result.owner?.name && (
                <div className={cn('flex items-center', SPACING.tight.inline)}>
                  <Icon name="User" className="h-3 w-3" />
                  <span>{result.owner.name}</span>
                </div>
              )}
              {result.organization && (
                <div className={cn('flex items-center', SPACING.tight.inline)}>
                  <OrganizationAvatar organization={result.organization} size="xs" />
                  <span>{result.organization.name}</span>
                </div>
              )}
              {result.entityType === 'document' && result.createdAt && (
                <div className={cn('flex items-center', SPACING.tight.inline)}>
                  <Icon name="Calendar" className="h-3 w-3" />
                  <span>{formatDate(result.createdAt)}</span>
                </div>
              )}
              {result.entityType === 'meeting' && result.scheduledAt && (
                <div className={cn('flex items-center', SPACING.tight.inline)}>
                  <Icon name="Calendar" className="h-3 w-3" />
                  <span>{formatDate(result.scheduledAt)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

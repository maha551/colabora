import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { organizationsApi } from '../../lib/api/organizations';
import { COLORS } from '../../lib/designSystem';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../ui/utils';

export interface OrgBreadcrumbProps {
  organizationId: string;
  organizationName: string;
  className?: string;
  onNavigate?: (orgId: string) => void;
}

interface AncestorCrumb {
  id: string;
  name: string;
  treeDepth: number;
}

type FetchStatus = 'loading' | 'ready';

export function OrgBreadcrumb({
  organizationId,
  organizationName,
  className,
  onNavigate,
}: OrgBreadcrumbProps) {
  const { t } = useTranslation('organization');
  const [ancestors, setAncestors] = useState<AncestorCrumb[]>([]);
  const [status, setStatus] = useState<FetchStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    organizationsApi
      .getOrganizationAncestors(organizationId)
      .then((res) => {
        if (!cancelled) {
          setAncestors(res.ancestors || []);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAncestors([]);
          setStatus('ready');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const label = t('breadcrumb.label', { defaultValue: 'Organization hierarchy' });

  if (status === 'loading') {
    return (
      <div
        className={cn('mb-0.5 flex min-w-0 items-center gap-1.5', className)}
        aria-busy="true"
        aria-label={t('breadcrumb.loading', { defaultValue: 'Loading organization path' })}
      >
        <Skeleton className="h-3 w-14 max-w-[30%] rounded-sm" />
        <span className="text-xs text-muted-foreground/40" aria-hidden>
          /
        </span>
        <Skeleton className="h-3 w-20 max-w-[40%] rounded-sm" />
      </div>
    );
  }

  if (ancestors.length === 0) {
    return null;
  }

  const crumbs = [...ancestors, { id: organizationId, name: organizationName, treeDepth: ancestors.length }];

  return (
    <nav
      aria-label={label}
      className={cn(
        'mb-0.5 min-w-0 max-w-full overflow-x-auto scrollbar-none',
        className
      )}
    >
      <ol
        className={cn(
          'flex min-w-0 flex-nowrap items-center gap-1 text-xs',
          COLORS.text.secondary
        )}
      >
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          const clickable = !isLast && onNavigate;

          return (
            <li key={crumb.id} className="inline-flex min-w-0 shrink-0 items-center gap-1">
              {index > 0 && (
                <span aria-hidden className="shrink-0 text-muted-foreground/50">
                  /
                </span>
              )}
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onNavigate(crumb.id)}
                  title={crumb.name}
                  className={cn(
                    'max-w-[6rem] truncate rounded-sm sm:max-w-[8rem]',
                    'transition-colors hover:text-foreground hover:underline',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
                  )}
                >
                  {crumb.name}
                </button>
              ) : (
                <span
                  title={crumb.name}
                  aria-current={isLast ? 'page' : undefined}
                  className={cn(
                    'max-w-[7rem] truncate sm:max-w-[10rem]',
                    isLast && cn('font-medium', COLORS.text.primary)
                  )}
                >
                  {crumb.name}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

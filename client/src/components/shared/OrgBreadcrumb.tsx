import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { organizationsApi } from '../../lib/api/organizations';
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

export function OrgBreadcrumb({
  organizationId,
  organizationName,
  className,
  onNavigate,
}: OrgBreadcrumbProps) {
  const { t } = useTranslation('organization');
  const [ancestors, setAncestors] = useState<AncestorCrumb[]>([]);

  useEffect(() => {
    let cancelled = false;
    organizationsApi
      .getOrganizationAncestors(organizationId)
      .then((res) => {
        if (!cancelled) setAncestors(res.ancestors || []);
      })
      .catch(() => {
        if (!cancelled) setAncestors([]);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  if (ancestors.length === 0) {
    return null;
  }

  const crumbs = [...ancestors, { id: organizationId, name: organizationName, treeDepth: ancestors.length }];

  return (
    <nav
      aria-label={t('breadcrumb.label', { defaultValue: 'Organization hierarchy' })}
      className={cn('mb-0.5 flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground', className)}
    >
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        const clickable = !isLast && onNavigate;

        return (
          <span key={crumb.id} className="inline-flex min-w-0 items-center gap-1">
            {index > 0 && <span aria-hidden className="opacity-60">/</span>}
            {clickable ? (
              <button
                type="button"
                onClick={() => onNavigate(crumb.id)}
                className="max-w-[8rem] truncate hover:text-foreground hover:underline"
              >
                {crumb.name}
              </button>
            ) : (
              <span className={cn('max-w-[10rem] truncate', isLast && 'font-medium text-foreground')}>
                {crumb.name}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

import { useTranslation } from 'react-i18next';
import { InfoPageLayout } from '../../components/info/InfoPageLayout';
import { Icon } from '../../components/ui/Icon';
import { buildInfoPath, type InfoSlug } from '../../lib/infoRoutes';
import { ELEVATION, RADIUS, SPACING } from '../../lib/designSystem';
import { cn } from '../../components/ui/utils';

interface InfoHubPageProps {
  isAuthenticated?: boolean;
}

const HUB_ITEMS: Array<{
  slug: InfoSlug;
  icon: string;
}> = [
  { slug: 'privacy', icon: 'Shield' },
  { slug: 'terms', icon: 'FileText' },
  { slug: 'imprint', icon: 'Building2' },
  { slug: 'about', icon: 'Info' },
  { slug: 'contact', icon: 'Mail' },
];

export function InfoHubPage({ isAuthenticated }: InfoHubPageProps) {
  const { t } = useTranslation('legal');

  return (
    <InfoPageLayout
      title={t('hub.title')}
      subtitle={t('hub.description')}
      isAuthenticated={isAuthenticated}
      width="narrow"
      panel={false}
    >
      <ul className={cn('grid gap-3 sm:grid-cols-2', SPACING.content.gap, 'list-none p-0 m-0')}>
        {HUB_ITEMS.map(({ slug, icon }) => {
          const descriptionKey =
            slug === 'contact' ? 'hub.contactDescription' : (`hub.${slug}Description` as const);

          return (
            <li key={slug}>
              <a
                href={buildInfoPath(slug)}
                className={cn(
                  'group flex h-full items-start gap-4 border border-border/70 bg-card/95 p-4 md:p-5',
                  RADIUS.panel,
                  ELEVATION.card,
                  ELEVATION.cardHover,
                  'transition-all duration-200 hover:border-primary/35 hover:bg-card',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                )}
              >
                <span
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
                    'bg-primary/10 text-primary transition-colors group-hover:bg-primary/15'
                  )}
                  aria-hidden
                >
                  <Icon name={icon} size="md" forceDefault />
                </span>
                <span className="min-w-0 flex-1 pt-0.5">
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-base font-semibold text-foreground md:text-lg leading-snug">
                      {t(`pages.${slug}`)}
                    </span>
                    <Icon
                      name="ChevronRight"
                      size="sm"
                      forceDefault
                      className="mt-1 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    />
                  </span>
                  <span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground md:text-[0.9375rem]">
                    {t(descriptionKey)}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </InfoPageLayout>
  );
}

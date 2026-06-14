import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppLogo } from '../shared/AppLogo';
import { SiteFooterLinks } from './SiteFooterLinks';
import { InfoContentPanel } from './InfoContentPanel';
import { Icon } from '../ui/Icon';
import { SPACING, COLORS } from '../../lib/designSystem';
import { cn } from '../ui/utils';
import { buildInfoPath } from '../../lib/infoRoutes';

export type InfoPageWidth = 'narrow' | 'reading';

interface InfoPageLayoutProps {
  title: string;
  subtitle?: string;
  isAuthenticated?: boolean;
  /** narrow = hub/contact; reading = legal prose (default) */
  width?: InfoPageWidth;
  /** When false, children render without the content card (e.g. hub grid). */
  panel?: boolean;
  children: ReactNode;
}

const WIDTH_CLASS: Record<InfoPageWidth, string> = {
  narrow: SPACING.layout.contentMaxNarrow,
  reading: 'max-w-3xl mx-auto min-w-0 w-full',
};

export function InfoPageLayout({
  title,
  subtitle,
  isAuthenticated = false,
  width = 'reading',
  panel = true,
  children,
}: InfoPageLayoutProps) {
  const { t } = useTranslation('legal');

  const backHref = isAuthenticated ? '/#/activity' : '/';
  const backLabel = isAuthenticated ? t('backToApp') : t('backToLogin');

  return (
    <div className={cn('min-h-screen flex flex-col', SPACING.layout.containPage)}>
      {/* Soft top wash — readable, no motion */}
      <div
        className="pointer-events-none fixed inset-0 bg-gradient-to-b from-primary/[0.06] via-background to-background dark:from-primary/[0.08]"
        aria-hidden
      />

      <div
        className={cn(
          WIDTH_CLASS[width],
          SPACING.page.x,
          'relative z-10 flex flex-1 flex-col pt-6 pb-10 md:pt-10 md:pb-14 w-full mx-auto'
        )}
      >
        <header className="mb-8 md:mb-10">
          <div className="mb-6 flex items-center justify-between gap-4">
            <a
              href={backHref}
              className={cn(
                'inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground',
                'rounded-md px-2 py-1.5 -ml-2 transition-colors hover:text-foreground hover:bg-muted/60',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
            >
              <Icon name="ArrowLeft" size="sm" forceDefault className="shrink-0" />
              <span>{backLabel}</span>
            </a>
            <a
              href={buildInfoPath('hub')}
              className="inline-flex shrink-0 rounded-md p-1 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Colabora"
            >
              <AppLogo size="sm" />
            </a>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl md:leading-tight">
              {title}
            </h1>
            {subtitle ? (
              <p className={cn('text-base md:text-lg leading-relaxed max-w-2xl', COLORS.text.secondary)}>
                {subtitle}
              </p>
            ) : null}
          </div>
        </header>

        <main className="flex-1 min-w-0">
          {panel ? <InfoContentPanel>{children}</InfoContentPanel> : children}
        </main>

        <footer className="mt-10 md:mt-14 pt-8 border-t border-border/50">
          <SiteFooterLinks isAuthenticated={isAuthenticated} />
        </footer>
      </div>
    </div>
  );
}

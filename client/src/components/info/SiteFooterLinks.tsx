import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../ui/utils';
import { buildInfoPath } from '../../lib/infoRoutes';
import { BuildVersionLabel } from '../shared/BuildVersionLabel';

interface SiteFooterLinksProps {
  isAuthenticated?: boolean;
  className?: string;
  style?: CSSProperties;
}

const LINK_CLASS = cn(
  'text-muted-foreground transition-colors hover:text-foreground',
  'underline-offset-4 hover:underline',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm'
);

export function SiteFooterLinks({ isAuthenticated = false, className, style }: SiteFooterLinksProps) {
  const { t } = useTranslation('legal');

  const links: Array<{ href: string; label: string }> = [
    { href: buildInfoPath('privacy'), label: t('footer.privacy') },
    { href: buildInfoPath('terms'), label: t('footer.terms') },
    { href: buildInfoPath('imprint'), label: t('footer.imprint') },
    { href: buildInfoPath('about'), label: t('footer.about') },
    { href: buildInfoPath('contact'), label: t('footer.contact') },
  ];

  if (isAuthenticated) {
    links.push({ href: '/#/report-issue', label: t('footer.reportIssue') });
  }

  return (
    <div className={cn('flex max-w-full flex-col items-center', className)}>
      <nav
        aria-label={t('hub.title')}
        className={cn(
          'text-xs md:text-[0.9375rem] font-normal tracking-wide',
          'flex flex-wrap items-center justify-center gap-x-2 gap-y-1 md:gap-x-1 md:gap-y-2'
        )}
        style={style}
      >
        {links.map((link, index) => (
          <span key={link.href} className="inline-flex shrink-0 items-center">
            {index > 0 && (
              <span
                className="mx-1.5 hidden text-muted-foreground/40 select-none text-xs md:inline md:mx-2"
                aria-hidden
              >
                |
              </span>
            )}
            <a href={link.href} className={LINK_CLASS}>
              {link.label}
            </a>
          </span>
        ))}
      </nav>
      <BuildVersionLabel
        style={
          style?.color
            ? ({ color: style.color, opacity: 0.55 } satisfies CSSProperties)
            : undefined
        }
      />
    </div>
  );
}

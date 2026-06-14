import { useTranslation } from 'react-i18next';
import { SPACING, Z_INDEX } from '../../lib/designSystem';
import {
  PRIMARY_NAV_ITEMS,
  PRIMARY_NAV_RAIL_WIDTH_CLASS,
  PRIMARY_NAV_STYLES,
  type PrimaryNavHandlerKey,
} from '../../lib/navItems';
import type { AppView } from '../../types';
import { AppLogo } from '../shared/AppLogo';
import { Icon } from '../ui/Icon';
import { cn } from '../ui/utils';

export interface PrimaryNavProps {
  currentView: AppView;
  onShowActivity: () => void;
  onShowDocuments: () => void;
  onShowOrganizations: () => void;
  onShowSearch?: () => void;
  pendingInvitationCount?: number;
}

/** @deprecated Use MOBILE_CHROME.barHeight — kept for backward compatibility in tests */
export const PRIMARY_NAV_MOBILE_HEIGHT = '4rem';

function isNavItemActive(itemView: AppView, currentView: AppView): boolean {
  if (currentView === itemView) return true;
  if (itemView === 'organizations' && currentView === 'organization') return true;
  if (itemView === 'documents' && currentView === 'document') return true;
  return false;
}

export function PrimaryNav({
  currentView,
  onShowActivity,
  onShowDocuments,
  onShowOrganizations,
  onShowSearch,
  pendingInvitationCount = 0,
}: PrimaryNavProps) {
  const { t } = useTranslation('nav');

  const handlers: Record<PrimaryNavHandlerKey, (() => void) | undefined> = {
    onShowActivity,
    onShowDocuments,
    onShowOrganizations,
    onShowSearch,
  };

  const navLabel = t('primaryNav.aria', { defaultValue: 'Primary navigation' });

  const renderItem = (item: (typeof PRIMARY_NAV_ITEMS)[number]) => {
    const handler = handlers[item.handlerKey];
    if (!handler) return null;

    const active = isNavItemActive(item.view, currentView);

    return (
      <button
        key={item.id}
        type="button"
        onClick={handler}
        aria-current={active ? 'page' : undefined}
        title={t(item.i18nKey)}
        className={cn(
          'relative flex w-full flex-col items-center gap-1 px-2 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          SPACING.tight.inline,
          PRIMARY_NAV_STYLES.item.base,
          PRIMARY_NAV_STYLES.itemRadius,
          active ? PRIMARY_NAV_STYLES.item.active : PRIMARY_NAV_STYLES.item.idle,
          active && PRIMARY_NAV_STYLES.item.indicator
        )}
      >
        <Icon
          name={item.icon}
          className={active ? PRIMARY_NAV_STYLES.iconActive : PRIMARY_NAV_STYLES.icon}
          aria-hidden
        />
        {item.id === 'organizations' && pendingInvitationCount > 0 && (
          <span
            className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive ring-1 ring-background"
            aria-label={t('pendingInvitationsNavIndicator', {
              count: pendingInvitationCount,
              defaultValue: `${pendingInvitationCount} pending invitation${pendingInvitationCount === 1 ? '' : 's'}`,
            })}
          />
        )}
        <span className="sr-only">{t(item.i18nKey)}</span>
      </button>
    );
  };

  return (
    <nav
      role="navigation"
      aria-label={navLabel}
      className={cn(
        'fixed inset-y-0 left-0 hidden md:flex',
        PRIMARY_NAV_RAIL_WIDTH_CLASS,
        PRIMARY_NAV_STYLES.rail.surface,
        'border-r',
        PRIMARY_NAV_STYLES.rail.border,
        Z_INDEX.sticky
      )}
    >
      <div
        className={cn(
          'absolute inset-x-0 top-0 flex shrink-0 items-center justify-center border-b pt-[env(safe-area-inset-top,0px)] min-h-[calc(3.5rem+env(safe-area-inset-top,0px))]',
          PRIMARY_NAV_STYLES.rail.border
        )}
        aria-hidden
      >
        <AppLogo size="sm" variant="monochrome" className="opacity-80" />
      </div>

      <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 flex-col items-stretch px-2">
        <div className={cn('flex flex-col', SPACING.tight.gap)}>
          {PRIMARY_NAV_ITEMS.map((item) => renderItem(item))}
        </div>
      </div>
    </nav>
  );
}

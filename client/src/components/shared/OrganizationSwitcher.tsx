import { useTranslation } from 'react-i18next';
import type { Organization } from '../../types';
import { RADIUS } from '../../lib/designSystem';
import { OrganizationAvatar } from './OrganizationAvatar';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
} from '../ui/dropdown-menu';
import { Icon } from '../ui/Icon';
import { cn } from '../ui/utils';

/** Indentation per tree depth level (px) for organization switcher lists. */
export function organizationSwitcherIndentPx(treeDepth = 0): number {
  return Math.max(0, treeDepth) * 12;
}

export interface OrganizationSwitcherProps {
  organizations: Organization[];
  activeOrganization?: Organization | null;
  onSelectOrganization?: (organization: Organization) => void;
  /** Desktop avatar dropdown */
  variant: 'dropdown' | 'sheet';
  /** Called after an organization is chosen (e.g. close mobile sheet). */
  onAfterSelect?: () => void;
}

function OrganizationSwitcherItemContent({
  org,
  isActive,
  showGuide,
}: {
  org: Organization;
  isActive: boolean;
  showGuide: boolean;
}) {
  return (
    <>
      {showGuide ? (
        <Icon
          name="CornerDownRight"
          size="xs"
          className="shrink-0 text-muted-foreground/45"
          aria-hidden
        />
      ) : null}
      <OrganizationAvatar organization={org} size="xs" />
      <span className="min-w-0 flex-1 truncate" title={org.name}>
        {org.name}
      </span>
      {isActive && (
        <Icon name="Check" size="sm" className="shrink-0 opacity-70" aria-hidden />
      )}
    </>
  );
}

function OrganizationList({
  organizations,
  activeOrganization,
  onSelectOrganization,
  onAfterSelect,
  className,
  itemClassName,
  itemAriaLabel,
}: {
  organizations: Organization[];
  activeOrganization?: Organization | null;
  onSelectOrganization: (organization: Organization) => void;
  onAfterSelect?: () => void;
  className?: string;
  itemClassName?: string;
  itemAriaLabel: (name: string) => string;
}) {
  return (
    <ul className={cn('flex flex-col gap-0.5', className)} role="listbox">
      {organizations.map((org) => {
        const isActive = activeOrganization?.id === org.id;
        const indentPx = organizationSwitcherIndentPx(org.treeDepth);
        const nested = (org.treeDepth ?? 0) > 0;

        return (
          <li key={org.id} role="none">
            <button
              type="button"
              role="option"
              aria-selected={isActive}
              aria-label={itemAriaLabel(org.name)}
              onClick={() => {
                onSelectOrganization(org);
                onAfterSelect?.();
              }}
              style={{ paddingLeft: `${12 + indentPx}px` }}
              className={cn(
                'flex w-full min-w-0 items-center gap-2 text-left text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                nested && 'border-l border-border/50',
                itemClassName,
                isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
              )}
              aria-current={isActive ? 'true' : undefined}
            >
              <OrganizationSwitcherItemContent org={org} isActive={isActive} showGuide={nested} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Context switcher — only rendered when the user belongs to more than one organization. */
export function OrganizationSwitcher({
  organizations,
  activeOrganization,
  onSelectOrganization,
  variant,
  onAfterSelect,
}: OrganizationSwitcherProps) {
  const { t } = useTranslation('nav');

  if (organizations.length <= 1 || !onSelectOrganization) {
    return null;
  }

  const sectionLabel = t('switchOrganization', { defaultValue: 'Switch organization' });
  const itemAriaLabel = (name: string) =>
    t('organizationItemAria', { name, defaultValue: `Switch to ${name}` });

  if (variant === 'sheet') {
    return (
      <div className="px-4 py-2">
        <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">{sectionLabel}</p>
        <OrganizationList
          organizations={organizations}
          activeOrganization={activeOrganization}
          onSelectOrganization={onSelectOrganization}
          onAfterSelect={onAfterSelect}
          itemAriaLabel={itemAriaLabel}
          itemClassName={cn('rounded-md px-3 py-2.5', RADIUS.control)}
        />
      </div>
    );
  }

  return (
    <>
      <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
        {sectionLabel}
      </DropdownMenuLabel>
      {organizations.map((org) => {
        const isActive = activeOrganization?.id === org.id;
        const indentPx = organizationSwitcherIndentPx(org.treeDepth);
        const nested = (org.treeDepth ?? 0) > 0;

        return (
          <DropdownMenuItem
            key={org.id}
            aria-label={itemAriaLabel(org.name)}
            onClick={() => onSelectOrganization(org)}
            style={{ paddingLeft: `${12 + indentPx}px` }}
            className={cn(
              'gap-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
              nested && 'border-l border-border/50',
              isActive && 'bg-accent'
            )}
          >
            <OrganizationSwitcherItemContent org={org} isActive={isActive} showGuide={nested} />
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
import { cn } from '../../ui/utils';
import { NAVIGATION } from '../../../lib/designSystem';
import { getGroupChildren } from '../../../lib/orgTabGroups';
import {
  PRIMARY_GROUPS,
  PRIMARY_GROUP_ICONS,
  PRIMARY_GROUP_I18N,
} from '../../../lib/orgTabNavConfig';
import type { OrgTab } from '../../../lib/hashRoutes';
import type { OrgGroup } from '../../../lib/orgTabGroups';
import './org-folder-nav.css';

export interface OrgFolderPrimaryNavProps {
  activeGroup: OrgGroup;
  isRepresentative: boolean;
  onNavigate: (tab: OrgTab) => void;
}

export function OrgFolderPrimaryNav({
  activeGroup,
  isRepresentative,
  onNavigate,
}: OrgFolderPrimaryNavProps) {
  const { t } = useTranslation('organization');

  return (
    <nav aria-label={t('folderNav.primary')} className={NAVIGATION.folderTabs.primaryRow}>
      {PRIMARY_GROUPS.map((group) => {
        const isActive = activeGroup === group;
        const label = t(PRIMARY_GROUP_I18N[group]);

        return (
          <button
            key={group}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            aria-label={label}
            className={cn(
              NAVIGATION.folderTabs.primaryTab,
              isActive
                ? NAVIGATION.folderTabs.primaryTabActive
                : NAVIGATION.folderTabs.primaryTabInactive
            )}
            onClick={() => onNavigate(getGroupChildren(group, isRepresentative)[0])}
          >
            <Icon
              name={PRIMARY_GROUP_ICONS[group]}
              className={NAVIGATION.tabs.iconDesktop}
              aria-hidden
            />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

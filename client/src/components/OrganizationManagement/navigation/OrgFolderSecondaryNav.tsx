import { useTranslation } from 'react-i18next';
import { TabsList, TabsTrigger } from '../../ui/tabs';
import { Icon } from '../../ui/Icon';
import { cn } from '../../ui/utils';
import { NAVIGATION } from '../../../lib/designSystem';
import { ORG_TAB_ICONS, ORG_TAB_I18N } from '../../../lib/orgTabNavConfig';
import type { OrgTab } from '../../../lib/hashRoutes';
import './org-folder-nav.css';

export interface OrgFolderSecondaryNavProps {
  tabs: OrgTab[];
}

export function OrgFolderSecondaryNav({ tabs }: OrgFolderSecondaryNavProps) {
  const { t } = useTranslation('organization');

  if (tabs.length <= 1) {
    return null;
  }

  return (
    <div className={NAVIGATION.folderTabs.secondaryRow}>
      <TabsList
        aria-label={t('folderNav.secondary')}
        className={NAVIGATION.folderTabs.secondaryList}
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab}
            value={tab}
            className={cn(NAVIGATION.folderTabs.secondaryTab, NAVIGATION.folderTabs.secondaryTabActive)}
            aria-label={t(ORG_TAB_I18N[tab])}
          >
            <Icon
              name={ORG_TAB_ICONS[tab]}
              className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4"
              aria-hidden
            />
            <span>{t(ORG_TAB_I18N[tab])}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
}

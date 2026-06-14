import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useTranslation } from 'react-i18next';
import type { ProfileVisibility } from '../../types';

interface ProfileVisibilitySelectProps {
  value: ProfileVisibility;
  onChange: (value: ProfileVisibility) => void;
  disabled?: boolean;
  id?: string;
}

export function ProfileVisibilitySelect({ value, onChange, disabled, id }: ProfileVisibilitySelectProps) {
  const { t } = useTranslation('profile');

  return (
    <Select value={value} onValueChange={(v) => onChange(v as ProfileVisibility)} disabled={disabled}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="z-[200]" sideOffset={4}>
        <SelectItem value="hidden">{t('visibilityHidden')}</SelectItem>
        <SelectItem value="org_members">{t('visibilityOrgMembers')}</SelectItem>
        <SelectItem value="representatives">{t('visibilityRepresentatives')}</SelectItem>
      </SelectContent>
    </Select>
  );
}

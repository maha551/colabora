import { useState, useEffect, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import type { User } from '../../types';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Icon } from '../ui/Icon';
import { NotificationPreferences, type NotificationPreferencesData } from '../NotificationPreferences';
import { ChannelNotificationSettings } from '../ChannelNotificationSettings';
import { ChangePasswordDialog } from '../ChangePasswordDialog';
import { CalendarSubscribeDialog } from '../OrganizationManagement/CalendarSubscribeDialog';
import { getBrowserTimezone } from '../../utils/dateFormatting';
import { TIMEZONE_OPTIONS } from '../../constants/timezones';
import { useTheme } from '../../hooks/useTheme';
import { COLORS } from '../../lib/designSystem';
import { SUPPORTED_LOCALES } from '../../lib/supportedLocales';
import { useProfileUpdate } from '../../hooks/useProfileUpdate';

interface AccountSettingsFormProps {
  user: User;
  onProfileUpdate: (user: User) => void;
  hasOrganizations?: boolean;
}

export function AccountSettingsForm({ user, onProfileUpdate, hasOrganizations = false }: AccountSettingsFormProps) {
  const { t } = useTranslation('profile');
  const { t: tNav } = useTranslation('nav');
  const { t: tCommon } = useTranslation('common');
  const { t: tOrg } = useTranslation('organization');
  const { theme: contextTheme, setTheme: setContextTheme } = useTheme();
  const currentLng = user.preferences?.locale || 'en';
  const { updateProfile, isSubmitting } = useProfileUpdate(onProfileUpdate);

  const [defaultHomeView, setDefaultHomeView] = useState<'activity' | 'organization'>(user.defaultHomeView || 'activity');
  const [backButtonPosition, setBackButtonPosition] = useState<'left' | 'right'>(user.preferences?.backButtonPosition || 'left');
  const [fontFamily, setFontFamily] = useState<'inter' | 'work-sans' | 'poppins' | 'merriweather'>(user.preferences?.fontFamily || 'inter');
  const [timezone, setTimezone] = useState<string>(user.preferences?.timezone || getBrowserTimezone());
  const [timezoneVisibility, setTimezoneVisibility] = useState<'hidden' | 'org_members'>(
    user.preferences?.timezoneVisibility || 'org_members'
  );
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(user.preferences?.theme || contextTheme || 'system');
  const [locale, setLocale] = useState<string>(user.preferences?.locale || currentLng);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferencesData | null>(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [calendarSubscribeOpen, setCalendarSubscribeOpen] = useState(false);

  useEffect(() => {
    setDefaultHomeView(user.defaultHomeView || 'activity');
    setBackButtonPosition(user.preferences?.backButtonPosition || 'left');
    setFontFamily(user.preferences?.fontFamily || 'inter');
    setTimezone(user.preferences?.timezone || getBrowserTimezone());
    setTimezoneVisibility(user.preferences?.timezoneVisibility || 'org_members');
    const userTheme = user.preferences?.theme || contextTheme || 'system';
    setTheme(userTheme);
    setLocale(user.preferences?.locale || 'en');
    if (user.preferences?.theme && user.preferences.theme !== contextTheme) {
      setContextTheme(user.preferences.theme);
    }
  }, [user, contextTheme, setContextTheme]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const updated = await updateProfile({
      defaultHomeView,
      preferences: {
        backButtonPosition,
        fontFamily,
        timezone,
        timezoneVisibility,
        theme,
        locale,
      },
    });
    if (updated.preferences?.theme) {
      setContextTheme(updated.preferences.theme);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-3">
          <Label>{tNav('defaultHomeView', { defaultValue: 'Default Home View' })}</Label>
          <div className="space-y-2">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input type="radio" name="defaultHomeView" value="activity" checked={defaultHomeView === 'activity'} onChange={() => setDefaultHomeView('activity')} disabled={isSubmitting} className={`w-4 h-4 ${COLORS.status.info}`} />
              <span className="text-sm">Activity Feed</span>
            </label>
            {hasOrganizations && (
              <label className="flex items-center space-x-2 cursor-pointer">
                <input type="radio" name="defaultHomeView" value="organization" checked={defaultHomeView === 'organization'} onChange={() => setDefaultHomeView('organization')} disabled={isSubmitting} className={`w-4 h-4 ${COLORS.status.info}`} />
                <span className="text-sm">Organization Dashboard</span>
              </label>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <Label>Mobile Display Preferences</Label>
          <div className="space-y-2">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input type="radio" name="backButtonPosition" value="left" checked={backButtonPosition === 'left'} onChange={() => setBackButtonPosition('left')} disabled={isSubmitting} className={`w-4 h-4 ${COLORS.status.info}`} />
              <span className="text-sm">Left (default)</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input type="radio" name="backButtonPosition" value="right" checked={backButtonPosition === 'right'} onChange={() => setBackButtonPosition('right')} disabled={isSubmitting} className={`w-4 h-4 ${COLORS.status.info}`} />
              <span className="text-sm">Right</span>
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="fontFamily">Font Family (Personal Documents)</Label>
          <Select value={fontFamily} onValueChange={(v) => setFontFamily(v as typeof fontFamily)}>
            <SelectTrigger id="fontFamily"><SelectValue /></SelectTrigger>
            <SelectContent className="z-[200]">
              <SelectItem value="inter">Inter</SelectItem>
              <SelectItem value="work-sans">Work Sans</SelectItem>
              <SelectItem value="poppins">Poppins</SelectItem>
              <SelectItem value="merriweather">Merriweather</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="timezone">{tCommon('timezone.label')}</Label>
          <Select value={timezone} onValueChange={setTimezone} disabled={isSubmitting}>
            <SelectTrigger id="timezone"><SelectValue /></SelectTrigger>
            <SelectContent className="z-[200] max-h-[300px]">
              {TIMEZONE_OPTIONS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">{tCommon('timezone.description')}</p>
        </div>

        <div className="flex items-start space-x-3">
          <Checkbox
            id="timezoneVisibility"
            checked={timezoneVisibility === 'org_members'}
            onCheckedChange={(checked) => setTimezoneVisibility(checked ? 'org_members' : 'hidden')}
            disabled={isSubmitting}
          />
          <div className="space-y-1">
            <Label htmlFor="timezoneVisibility" className="cursor-pointer">{t('timezoneVisibility')}</Label>
            <p className="text-xs text-muted-foreground">{t('timezoneVisibilityHint')}</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="theme">Theme</Label>
          <Select value={theme} onValueChange={(v) => setTheme(v as typeof theme)} disabled={isSubmitting}>
            <SelectTrigger id="theme"><SelectValue /></SelectTrigger>
            <SelectContent className="z-[200]">
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="language">{tNav('language')}</Label>
          <Select
            value={locale}
            onValueChange={(value) => {
              setLocale(value);
              void i18n.changeLanguage(value);
            }}
            disabled={isSubmitting}
          >
            <SelectTrigger id="language"><SelectValue /></SelectTrigger>
            <SelectContent className="z-[200] max-h-[300px]">
              {SUPPORTED_LOCALES.map(({ code, nameKey }) => (
                <SelectItem key={code} value={code}>{tNav(nameKey)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasOrganizations && (
          <div className="space-y-2 pt-4 border-t">
            <Label className="text-base font-semibold">{tOrg('calendarSubscribeAllOrgs')}</Label>
            <p className="text-sm text-muted-foreground">{tOrg('calendarSubscribeAllOrgsDescription')}</p>
            <Button type="button" variant="outline" onClick={() => setCalendarSubscribeOpen(true)} disabled={isSubmitting}>
              <Icon name="Calendar" className="mr-2 h-4 w-4" />
              {tOrg('calendarSubscribe')}
            </Button>
          </div>
        )}

        <div className="space-y-2 pt-4 border-t">
          <Label className="text-base font-semibold">Email Notification Preferences</Label>
          <NotificationPreferences preferences={notificationPreferences} onUpdate={setNotificationPreferences} disabled={isSubmitting} />
        </div>

        <div className="space-y-2 pt-4 border-t">
          <ChannelNotificationSettings
            channelPreferences={notificationPreferences?.channelPreferences}
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-2 pt-4 border-t">
          <Label className="text-base font-semibold">Security</Label>
          <Button type="button" variant="outline" onClick={() => setChangePasswordOpen(true)} disabled={isSubmitting} className="w-full">
            Change Password
          </Button>
        </div>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Icon name="Loader2" className="h-4 w-4 mr-2 animate-spin" />
              {t('saving')}
            </>
          ) : (
            t('saveChanges')
          )}
        </Button>
      </form>

      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
      <CalendarSubscribeDialog open={calendarSubscribeOpen} onOpenChange={setCalendarSubscribeOpen} />
    </>
  );
}

import type { ProfileData } from '../../../types';

export interface UpdateProfilePayload {
  name?: string;
  email?: string;
  bio?: string;
  avatar?: string;
  avatarUrl?: string;
  defaultHomeView?: 'activity' | 'organization';
  preferences?: {
    backButtonPosition?: 'left' | 'right';
    fontFamily?: 'inter' | 'work-sans' | 'poppins' | 'merriweather';
    timezone?: string;
    timezoneVisibility?: 'hidden' | 'org_members';
    theme?: 'light' | 'dark' | 'system';
    locale?: string;
  };
  profileData?: ProfileData;
}

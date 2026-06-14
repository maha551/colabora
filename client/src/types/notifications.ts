export type ChannelId = 'email' | 'push' | 'telegram';

export type DigestFrequency = 'weekly' | 'monthly' | 'off';

export interface EmailChannelPreferences {
  enabled: boolean;
  immediate: boolean;
  digestFrequency: DigestFrequency;
}

export interface PushChannelPreferences {
  enabled: boolean;
  immediate: boolean;
  digest: boolean;
}

export interface TelegramChannelPreferences {
  enabled: boolean;
  immediate: boolean;
  digest: boolean;
}

export interface ChannelPreferences {
  email: EmailChannelPreferences;
  push: PushChannelPreferences;
  telegram: TelegramChannelPreferences;
}

/** Browser Push API subscription payload sent to POST /api/notifications/push/subscribe */
export interface PushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushSubscriptionStatus {
  subscribed: boolean;
  endpointCount: number;
}

export interface TelegramLinkTokenResponse {
  token: string;
  deepLink: string;
  expiresAt: string;
}

export interface TelegramStatusResponse {
  linked: boolean;
  username?: string | null;
  enabled: boolean;
}

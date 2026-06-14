import { useState, useEffect } from "react";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";
import { Icon } from "./ui/Icon";
import { toast } from "sonner";
import { logger } from '../lib/logger';
import type { ChannelPreferences, DigestFrequency } from '../types/notifications';

export type { ChannelPreferences, DigestFrequency } from '../types/notifications';

export interface NotificationPreferencesData {
  emailEnabled: boolean;
  immediateNotificationsEnabled: boolean;
  digestFrequency: DigestFrequency;
  channelPreferences?: ChannelPreferences;
}

interface NotificationPreferencesProps {
  preferences?: NotificationPreferencesData;
  onUpdate?: (preferences: NotificationPreferencesData) => void;
  disabled?: boolean;
}

export function NotificationPreferences({ 
  preferences, 
  onUpdate,
  disabled = false 
}: NotificationPreferencesProps) {
  const [emailEnabled, setEmailEnabled] = useState(preferences?.emailEnabled ?? true);
  const [immediateNotificationsEnabled, setImmediateNotificationsEnabled] = useState(preferences?.immediateNotificationsEnabled ?? true);
  const [digestFrequency, setDigestFrequency] = useState<'weekly' | 'monthly' | 'off'>(preferences?.digestFrequency ?? 'monthly');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load preferences on mount
  useEffect(() => {
    if (!preferences) {
      loadPreferences();
    } else {
      setEmailEnabled(preferences.emailEnabled);
      setImmediateNotificationsEnabled(preferences.immediateNotificationsEnabled);
      setDigestFrequency(preferences.digestFrequency);
    }
  }, [preferences]);

  const loadPreferences = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/notifications/preferences', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load preferences');
      }

      const data = await response.json();
      const prefs = data.preferences;
      setEmailEnabled(prefs.emailEnabled ?? true);
      setImmediateNotificationsEnabled(prefs.immediateNotificationsEnabled ?? true);
      setDigestFrequency(prefs.digestFrequency ?? 'monthly');
      
      if (onUpdate) {
        onUpdate({
          emailEnabled: prefs.emailEnabled ?? true,
          immediateNotificationsEnabled: prefs.immediateNotificationsEnabled ?? true,
          digestFrequency: prefs.digestFrequency ?? 'monthly',
          channelPreferences: prefs.channelPreferences,
        });
      }
    } catch (error) {
      logger.error('Error loading notification preferences:', error);
      toast.error('Failed to load notification preferences');
    } finally {
      setIsLoading(false);
    }
  };

  const savePreferences = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify({
          emailEnabled,
          immediateNotificationsEnabled,
          digestFrequency,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save preferences');
      }

      const data = await response.json();
      const prefs = data.preferences;
      
      if (onUpdate) {
        onUpdate({
          emailEnabled: prefs.emailEnabled ?? emailEnabled,
          immediateNotificationsEnabled: prefs.immediateNotificationsEnabled ?? immediateNotificationsEnabled,
          digestFrequency: prefs.digestFrequency ?? digestFrequency,
          channelPreferences: prefs.channelPreferences,
        });
      }
      
      toast.success('Notification preferences saved');
    } catch (error) {
      logger.error('Error saving notification preferences:', error);
      toast.error('Failed to save notification preferences');
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-save when preferences change
  useEffect(() => {
    if (!isLoading && preferences) {
      const hasChanged = 
        emailEnabled !== preferences.emailEnabled ||
        immediateNotificationsEnabled !== preferences.immediateNotificationsEnabled ||
        digestFrequency !== preferences.digestFrequency;
      
      if (hasChanged) {
        const timeoutId = setTimeout(() => {
          savePreferences();
        }, 500); // Debounce saves
        
        return () => clearTimeout(timeoutId);
      }
    }
  }, [emailEnabled, immediateNotificationsEnabled, digestFrequency]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Icon name="Loader2" className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Email Notifications Master Toggle */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="email-enabled" className="text-base font-medium">
              Email Notifications
            </Label>
            <p className="text-sm text-muted-foreground">
              Enable or disable all email notifications
            </p>
          </div>
          <Switch
            id="email-enabled"
            checked={emailEnabled}
            onCheckedChange={setEmailEnabled}
            disabled={disabled || isSaving}
          />
        </div>
      </div>

      {/* Immediate Notifications Toggle */}
      {emailEnabled && (
        <div className="space-y-3 pl-4 border-l-2 border-border">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="immediate-notifications" className="text-base font-medium">
                Immediate Time-Critical Notifications
              </Label>
              <p className="text-sm text-muted-foreground">
                Get notified immediately when voting starts or deadlines approach (1 week before)
              </p>
            </div>
            <Switch
              id="immediate-notifications"
              checked={immediateNotificationsEnabled}
              onCheckedChange={setImmediateNotificationsEnabled}
              disabled={disabled || isSaving || !emailEnabled}
            />
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>• Voting deadlines approaching</p>
            <p>• Voting started</p>
            <p>• Rule proposal deadlines</p>
            <p>• Election deadlines</p>
          </div>
        </div>
      )}

      {/* Digest Frequency */}
      {emailEnabled && (
        <div className="space-y-2 pl-4 border-l-2 border-border">
          <Label htmlFor="digest-frequency">Digest Email Frequency</Label>
          <Select 
            value={digestFrequency} 
            onValueChange={(value) => setDigestFrequency(value as 'weekly' | 'monthly' | 'off')}
            disabled={disabled || isSaving || !emailEnabled}
          >
            <SelectTrigger id="digest-frequency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="off">Off</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Receive a summary of non-critical events (proposals, status changes, etc.)
          </p>
          {digestFrequency !== 'off' && (
            <div className="text-xs text-muted-foreground space-y-1 mt-2">
              <p>Digest includes:</p>
              <p>• New proposals</p>
              <p>• Document status changes</p>
              <p>• Rule proposals created/approved/rejected</p>
              <p>• Elections created/completed</p>
              <p>• New documents</p>
            </div>
          )}
        </div>
      )}

      {isSaving && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon name="Loader2" className="h-4 w-4 animate-spin" />
          <span>Saving preferences...</span>
        </div>
      )}
    </div>
  );
}

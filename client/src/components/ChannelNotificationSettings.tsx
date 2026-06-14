import { useEffect, useRef, useState } from "react";

import { useTranslation } from "react-i18next";

import { Label } from "./ui/label";

import { Switch } from "./ui/switch";

import { Button } from "./ui/button";

import { Icon } from "./ui/Icon";

import { toast } from "sonner";

import { logger } from "../lib/logger";

import { useWebPush } from "../hooks/useWebPush";

import { useTelegram } from "../hooks/useTelegram";

import type {
  ChannelPreferences,
  PushChannelPreferences,
  TelegramChannelPreferences,
} from "../types/notifications";

const DEFAULT_PUSH_PREFS: PushChannelPreferences = {
  enabled: false,

  immediate: true,

  digest: true,
};

const DEFAULT_TELEGRAM_PREFS: TelegramChannelPreferences = {
  enabled: false,

  immediate: true,

  digest: true,
};

interface ChannelNotificationSettingsProps {
  channelPreferences?: ChannelPreferences;

  disabled?: boolean;
}

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("authToken");

  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function ChannelNotificationSettings({
  channelPreferences,

  disabled = false,
}: ChannelNotificationSettingsProps) {
  const { t } = useTranslation("profile");

  const {
    displayStatus: pushDisplayStatus,

    busy: pushBusy,

    loading: pushLoading,

    subscribe,

    unsubscribe,

    refresh: refreshPush,
  } = useWebPush();

  const {
    status: telegramStatus,

    displayStatus: telegramDisplayStatus,

    busy: telegramBusy,

    loading: telegramLoading,

    linking: telegramLinking,

    connect: connectTelegram,

    disconnect: disconnectTelegram,

    refresh: refreshTelegram,
  } = useTelegram();

  const [pushPrefs, setPushPrefs] = useState<PushChannelPreferences>(
    channelPreferences?.push ?? DEFAULT_PUSH_PREFS,
  );

  const [telegramPrefs, setTelegramPrefs] =
    useState<TelegramChannelPreferences>(
      channelPreferences?.telegram ?? DEFAULT_TELEGRAM_PREFS,
    );

  const [isSavingPush, setIsSavingPush] = useState(false);

  const [isSavingTelegram, setIsSavingTelegram] = useState(false);

  const [loaded, setLoaded] = useState(!!channelPreferences);

  const wasLinkingRef = useRef(false);

  useEffect(() => {
    if (channelPreferences?.push) {
      setPushPrefs(channelPreferences.push);
    }

    if (channelPreferences?.telegram) {
      setTelegramPrefs(channelPreferences.telegram);
    }

    if (channelPreferences) {
      setLoaded(true);
    }
  }, [channelPreferences]);

  useEffect(() => {
    if (!channelPreferences) {
      void loadPreferences();
    }
  }, [channelPreferences]);

  useEffect(() => {
    if (telegramStatus?.linked && telegramStatus.enabled !== undefined) {
      setTelegramPrefs((prev) => ({
        ...prev,
        enabled: telegramStatus.enabled,
      }));
    }
  }, [telegramStatus?.linked, telegramStatus?.enabled]);

  useEffect(() => {
    if (wasLinkingRef.current && telegramDisplayStatus === "linked") {
      toast.success(t("notifications.telegram.linkedSuccess"));
    }

    wasLinkingRef.current = telegramLinking;
  }, [telegramDisplayStatus, telegramLinking, t]);

  const loadPreferences = async () => {
    try {
      const response = await fetch("/api/notifications/preferences", {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error("Failed to load preferences");
      }

      const data = await response.json();

      setPushPrefs(
        data.preferences?.channelPreferences?.push ?? DEFAULT_PUSH_PREFS,
      );

      setTelegramPrefs(
        data.preferences?.channelPreferences?.telegram ??
          DEFAULT_TELEGRAM_PREFS,
      );
    } catch (error) {
      logger.error("Error loading channel preferences:", error);
    } finally {
      setLoaded(true);
    }
  };

  const savePushPreferences = async (nextPush: PushChannelPreferences) => {
    setIsSavingPush(true);

    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PUT",

        headers: {
          "Content-Type": "application/json",

          ...getAuthHeaders(),
        },

        body: JSON.stringify({
          channelPreferences: { push: nextPush },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save push preferences");
      }

      toast.success(t("notifications.pushSaved"));
    } catch (error) {
      logger.error("Error saving push preferences:", error);

      toast.error(t("notifications.pushSaveFailed"));
    } finally {
      setIsSavingPush(false);
    }
  };

  const saveTelegramPreferences = async (
    nextTelegram: TelegramChannelPreferences,
  ) => {
    setIsSavingTelegram(true);

    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PUT",

        headers: {
          "Content-Type": "application/json",

          ...getAuthHeaders(),
        },

        body: JSON.stringify({
          channelPreferences: { telegram: nextTelegram },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save Telegram preferences");
      }

      toast.success(t("notifications.telegram.saved"));
    } catch (error) {
      logger.error("Error saving Telegram preferences:", error);

      toast.error(t("notifications.telegram.saveFailed"));
    } finally {
      setIsSavingTelegram(false);
    }
  };

  const handlePushEnable = async () => {
    try {
      const ok = await subscribe();

      if (ok) {
        const next = { ...pushPrefs, enabled: true };

        setPushPrefs(next);

        await savePushPreferences(next);

        toast.success(t("notifications.pushEnabledSuccess"));
      } else if (pushDisplayStatus === "blocked") {
        toast.error(t("notifications.pushBlockedHint"));
      }
    } catch {
      toast.error(t("notifications.pushEnableFailed"));
    }
  };

  const handlePushMasterToggle = async (checked: boolean) => {
    if (checked) {
      if (pushDisplayStatus !== "subscribed") {
        await handlePushEnable();

        return;
      }

      const next = { ...pushPrefs, enabled: true };

      setPushPrefs(next);

      await savePushPreferences(next);

      return;
    }

    try {
      await unsubscribe();

      const next = { ...pushPrefs, enabled: false };

      setPushPrefs(next);

      await savePushPreferences(next);

      await refreshPush();

      toast.success(t("notifications.pushDisabledSuccess"));
    } catch {
      toast.error(t("notifications.pushDisableFailed"));
    }
  };

  const handlePushPrefChange = async (
    field: "immediate" | "digest",
    checked: boolean,
  ) => {
    const next = { ...pushPrefs, [field]: checked };

    setPushPrefs(next);

    await savePushPreferences(next);
  };

  const handleTelegramConnect = async () => {
    try {
      const ok = await connectTelegram();

      if (ok) {
        toast.success(t("notifications.telegram.linkOpened"));
      } else {
        toast.error(t("notifications.telegram.notConfiguredHint"));
      }
    } catch {
      toast.error(t("notifications.telegram.connectFailed"));
    }
  };

  const handleTelegramMasterToggle = async (checked: boolean) => {
    if (checked) {
      if (telegramDisplayStatus !== "linked") {
        await handleTelegramConnect();

        return;
      }

      const next = { ...telegramPrefs, enabled: true };

      setTelegramPrefs(next);

      await saveTelegramPreferences(next);

      return;
    }

    const next = { ...telegramPrefs, enabled: false };

    setTelegramPrefs(next);

    await saveTelegramPreferences(next);

    toast.success(t("notifications.telegram.disabledSuccess"));
  };

  const handleTelegramPrefChange = async (
    field: "immediate" | "digest",
    checked: boolean,
  ) => {
    const next = { ...telegramPrefs, [field]: checked };

    setTelegramPrefs(next);

    await saveTelegramPreferences(next);
  };

  const handleTelegramDisconnect = async () => {
    try {
      await disconnectTelegram();

      const next = { ...telegramPrefs, enabled: false };

      setTelegramPrefs(next);

      toast.success(t("notifications.telegram.disconnectedSuccess"));
    } catch {
      toast.error(t("notifications.telegram.disconnectFailed"));
    }
  };

  const pushStatusLabel = (() => {
    switch (pushDisplayStatus) {
      case "subscribed":
        return t("notifications.pushStatusSubscribed");

      case "blocked":
        return t("notifications.pushStatusBlocked");

      case "unsupported":
        return t("notifications.pushStatusUnsupported");

      case "not_subscribed":
        return t("notifications.pushStatusNotSubscribed");

      default:
        return "";
    }
  })();

  const pushStatusVariant = (() => {
    switch (pushDisplayStatus) {
      case "subscribed":
        return "text-green-600 dark:text-green-400";

      case "blocked":
        return "text-destructive";

      case "unsupported":
        return "text-muted-foreground";

      default:
        return "text-muted-foreground";
    }
  })();

  const telegramStatusLabel = (() => {
    switch (telegramDisplayStatus) {
      case "linked":
        return telegramStatus?.username
          ? t("notifications.telegram.statusLinked", {
              username: telegramStatus.username,
            })
          : t("notifications.telegram.statusLinkedGeneric");

      case "linking":
        return t("notifications.telegram.statusLinking");

      case "not_configured":
        return t("notifications.telegram.statusNotConfigured");

      case "not_linked":
        return t("notifications.telegram.statusNotLinked");

      default:
        return "";
    }
  })();

  const telegramStatusVariant = (() => {
    switch (telegramDisplayStatus) {
      case "linked":
        return "text-green-600 dark:text-green-400";

      case "not_configured":
        return "text-muted-foreground";

      default:
        return "text-muted-foreground";
    }
  })();

  const canConfigurePush =
    pushDisplayStatus === "subscribed" && pushPrefs.enabled;

  const canConfigureTelegram =
    telegramDisplayStatus === "linked" && telegramPrefs.enabled;

  const pushDisabled = disabled || isSavingPush || pushBusy || pushLoading;

  const telegramDisabled =
    disabled || isSavingTelegram || telegramBusy || telegramLoading;

  if (!loaded || pushLoading || telegramLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Icon
          name="Loader2"
          className="h-5 w-5 animate-spin text-muted-foreground"
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Push notifications */}

      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">
                {t("notifications.pushTitle")}
              </Label>

              <p className="text-sm text-muted-foreground">
                {t("notifications.pushDescription")}
              </p>

              {pushStatusLabel && (
                <p className={`text-sm font-medium ${pushStatusVariant}`}>
                  {pushStatusLabel}
                </p>
              )}
            </div>

            {pushDisplayStatus === "subscribed" && (
              <Switch
                id="push-enabled"
                checked={pushPrefs.enabled}
                onCheckedChange={handlePushMasterToggle}
                disabled={pushDisabled}
              />
            )}
          </div>

          {pushDisplayStatus === "not_subscribed" && (
            <Button
              type="button"
              variant="outline"
              onClick={handlePushEnable}
              disabled={pushDisabled}
            >
              {pushBusy ? (
                <>
                  <Icon name="Loader2" className="h-4 w-4 animate-spin" />

                  {t("notifications.pushEnabling")}
                </>
              ) : (
                t("notifications.pushEnable")
              )}
            </Button>
          )}
        </div>

        {canConfigurePush && (
          <div className="space-y-3 pl-4 border-l-2 border-border">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label
                  htmlFor="push-immediate"
                  className="text-base font-medium"
                >
                  {t("notifications.pushImmediate")}
                </Label>

                <p className="text-sm text-muted-foreground">
                  {t("notifications.pushImmediateDescription")}
                </p>
              </div>

              <Switch
                id="push-immediate"
                checked={pushPrefs.immediate}
                onCheckedChange={(checked) =>
                  void handlePushPrefChange("immediate", checked)
                }
                disabled={pushDisabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="push-digest" className="text-base font-medium">
                  {t("notifications.pushDigest")}
                </Label>

                <p className="text-sm text-muted-foreground">
                  {t("notifications.pushDigestDescription")}
                </p>
              </div>

              <Switch
                id="push-digest"
                checked={pushPrefs.digest}
                onCheckedChange={(checked) =>
                  void handlePushPrefChange("digest", checked)
                }
                disabled={pushDisabled}
              />
            </div>
          </div>
        )}

        {(isSavingPush || pushBusy) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon name="Loader2" className="h-4 w-4 animate-spin" />

            <span>{t("notifications.pushSaving")}</span>
          </div>
        )}
      </div>

      {/* Telegram notifications */}

      <div className="space-y-6 pt-4 border-t">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">
                {t("notifications.telegram.title")}
              </Label>

              <p className="text-sm text-muted-foreground">
                {t("notifications.telegram.description")}
              </p>

              {telegramStatusLabel && (
                <p className={`text-sm font-medium ${telegramStatusVariant}`}>
                  {telegramStatusLabel}
                </p>
              )}
            </div>

            {telegramDisplayStatus === "linked" && (
              <Switch
                id="telegram-enabled"
                checked={telegramPrefs.enabled}
                onCheckedChange={handleTelegramMasterToggle}
                disabled={telegramDisabled}
              />
            )}
          </div>

          {telegramDisplayStatus === "not_linked" && (
            <Button
              type="button"
              variant="outline"
              onClick={handleTelegramConnect}
              disabled={telegramDisabled}
            >
              {telegramBusy ? (
                <>
                  <Icon name="Loader2" className="h-4 w-4 animate-spin" />

                  {t("notifications.telegram.connecting")}
                </>
              ) : (
                t("notifications.telegram.connect")
              )}
            </Button>
          )}

          {(telegramDisplayStatus === "linking" ||
            telegramDisplayStatus === "linked") && (
            <div className="flex flex-wrap gap-2">
              {telegramDisplayStatus === "linking" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void refreshTelegram()}
                  disabled={telegramDisabled}
                >
                  {telegramBusy ? (
                    <Icon name="Loader2" className="h-4 w-4 animate-spin" />
                  ) : (
                    <Icon name="RefreshCw" className="h-4 w-4" />
                  )}

                  {t("notifications.telegram.refreshStatus")}
                </Button>
              )}

              {telegramDisplayStatus === "linked" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleTelegramDisconnect()}
                  disabled={telegramDisabled}
                >
                  {telegramBusy ? (
                    <Icon name="Loader2" className="h-4 w-4 animate-spin" />
                  ) : null}

                  {t("notifications.telegram.disconnect")}
                </Button>
              )}
            </div>
          )}
        </div>

        {canConfigureTelegram && (
          <div className="space-y-3 pl-4 border-l-2 border-border">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label
                  htmlFor="telegram-immediate"
                  className="text-base font-medium"
                >
                  {t("notifications.telegram.immediate")}
                </Label>

                <p className="text-sm text-muted-foreground">
                  {t("notifications.telegram.immediateDescription")}
                </p>
              </div>

              <Switch
                id="telegram-immediate"
                checked={telegramPrefs.immediate}
                onCheckedChange={(checked) =>
                  void handleTelegramPrefChange("immediate", checked)
                }
                disabled={telegramDisabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label
                  htmlFor="telegram-digest"
                  className="text-base font-medium"
                >
                  {t("notifications.telegram.digest")}
                </Label>

                <p className="text-sm text-muted-foreground">
                  {t("notifications.telegram.digestDescription")}
                </p>
              </div>

              <Switch
                id="telegram-digest"
                checked={telegramPrefs.digest}
                onCheckedChange={(checked) =>
                  void handleTelegramPrefChange("digest", checked)
                }
                disabled={telegramDisabled}
              />
            </div>
          </div>
        )}

        {(isSavingTelegram || telegramBusy) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon name="Loader2" className="h-4 w-4 animate-spin" />

            <span>{t("notifications.telegram.saving")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

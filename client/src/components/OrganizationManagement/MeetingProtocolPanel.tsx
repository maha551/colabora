/**
 * Meeting actions panel below AppHeader on protocol routes (bar chrome).
 */

import React, { useCallback, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { Meeting } from '../../lib/api/types/meetings';
import { calendarApi } from '../../lib/api/calendar';
import { useTimezone } from '../../hooks/useTimezone';
import { useAppChrome } from '../../contexts/AppChromeContext';
import { Button } from '../ui/button';
import { Icon } from '../ui/Icon';
import { SPACING, COLORS, APP_CHROME, HEADER_HEIGHT_PX, Z_INDEX } from '../../lib/designSystem';
import { cn } from '../ui/utils';

export type MeetingProtocolVideoPreference = 'embed' | 'newtab';

export interface MeetingProtocolPanelProps {
  detail: Meeting;
  organizationId: string;
  videoPreference: MeetingProtocolVideoPreference;
  onVideoPreferenceChange: (pref: MeetingProtocolVideoPreference) => void;
  canManageMeeting: boolean;
  isModerator: boolean;
  onBack?: () => void;
  onEditMeeting: () => void;
  onManageModerators: () => void;
  onCreateVideoRoom: () => void;
  createRoomSubmitting: boolean;
  videoRoomCreationEnabled?: boolean;
}

export function MeetingProtocolPanel({
  detail,
  organizationId,
  videoPreference,
  onVideoPreferenceChange,
  canManageMeeting,
  isModerator,
  onBack,
  onEditMeeting,
  onManageModerators,
  onCreateVideoRoom,
  createRoomSubmitting,
  videoRoomCreationEnabled = false,
}: MeetingProtocolPanelProps) {
  const { t } = useTranslation('organization');
  const { formatDateTime } = useTimezone();
  const { orbPhase, closeOrb, chromeConfig } = useAppChrome();
  const panelRef = useRef<HTMLDivElement>(null);
  const useOrbChrome = chromeConfig.display === 'orb';
  const isPanelVisible =
    !useOrbChrome || orbPhase === 'opening' || orbPhase === 'expanded';

  const updatePanelHeight = useCallback(() => {
    if (typeof document === 'undefined' || !isPanelVisible) return;
    const el = panelRef.current;
    if (!el) return;
    const height = el.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--app-chrome-panel-height', `${Math.ceil(height)}px`);
  }, [isPanelVisible]);

  useLayoutEffect(() => {
    if (!isPanelVisible) {
      if (typeof document !== 'undefined') {
        document.documentElement.style.removeProperty('--app-chrome-panel-height');
      }
      return;
    }
    updatePanelHeight();
    const el = panelRef.current;
    const ro =
      typeof ResizeObserver !== 'undefined' && el ? new ResizeObserver(updatePanelHeight) : null;
    if (ro && el) ro.observe(el);
    return () => ro?.disconnect();
  }, [isPanelVisible, updatePanelHeight]);

  if (!isPanelVisible || typeof document === 'undefined') return null;

  const runAction = (fn: () => void) => {
    if (useOrbChrome) closeOrb();
    fn();
  };

  const handleAddToCalendar = () => {
    const url = calendarApi.getMeetingIcalDownloadUrl(
      organizationId,
      detail.id,
      detail.scheduledAt,
      detail.endAt
    );
    window.open(url, '_blank', 'noopener,noreferrer');
    if (useOrbChrome) closeOrb();
  };

  const panelBody = (
    <div className={cn('mx-auto w-full max-w-4xl', SPACING.card.padding, SPACING.content.gap, 'flex flex-col pb-4')}>
      <div className={cn(COLORS.text.secondary, 'space-y-1 text-sm')}>
        <p>
          {t('meetingDate')}: {formatDateTime(detail.scheduledAt)}
        </p>
        {detail.endAt && (
          <p>
            {t('meetingEndTime')}: {formatDateTime(detail.endAt)}
          </p>
        )}
        {detail.location && (
          <p>
            {t('meetingLocation')}: {detail.location}
          </p>
        )}
      </div>

      <div className={cn(SPACING.toolbar.row, SPACING.toolbar.gap, 'flex-wrap')}>
        {onBack && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start sm:w-auto"
            onClick={() => runAction(() => onBack())}
          >
            <Icon name="ArrowLeft" className="me-2 h-4 w-4 shrink-0" />
            {t('protocolChrome.back', { defaultValue: 'Back' })}
          </Button>
        )}

        {detail.meetingLink ? (
          <>
            <Button
              size="sm"
              variant={videoPreference === 'embed' ? 'default' : 'outline'}
              onClick={() => onVideoPreferenceChange('embed')}
            >
              <Icon name="Video" className="me-2 h-4 w-4" />
              {t('showVideoHere')}
            </Button>
            <Button
              size="sm"
              variant={videoPreference === 'newtab' ? 'default' : 'outline'}
              onClick={() => {
                onVideoPreferenceChange('newtab');
                window.open(detail.meetingLink!, '_blank');
              }}
            >
              <Icon name="ExternalLink" className="me-2 h-4 w-4" />
              {t('openInNewTab')}
            </Button>
            {canManageMeeting && (
              <Button variant="outline" size="sm" onClick={() => runAction(onEditMeeting)}>
                <Icon name="Edit" className="me-2 h-4 w-4" />
                {t('editMeeting')}
              </Button>
            )}
            {isModerator && (
              <Button variant="outline" size="sm" onClick={() => runAction(onManageModerators)}>
                <Icon name="Users" className="me-2 h-4 w-4" />
                {t('manageModerators', { defaultValue: 'Manage moderators' })}
              </Button>
            )}
          </>
        ) : (
          canManageMeeting && (
            <>
              <Button variant="outline" size="sm" onClick={() => runAction(onEditMeeting)}>
                <Icon name="Edit" className="me-2 h-4 w-4" />
                {t('editMeeting')}
              </Button>
              {videoRoomCreationEnabled && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => runAction(onCreateVideoRoom)}
                  disabled={createRoomSubmitting}
                >
                  {createRoomSubmitting ? t('saving') : t('createVideoRoom')}
                </Button>
              )}
              {isModerator && (
                <Button variant="outline" size="sm" onClick={() => runAction(onManageModerators)}>
                  <Icon name="Users" className="me-2 h-4 w-4" />
                  {t('manageModerators', { defaultValue: 'Manage moderators' })}
                </Button>
              )}
            </>
          )
        )}

        <Button variant="outline" size="sm" onClick={handleAddToCalendar}>
          <Icon name="Calendar" className="me-2 h-4 w-4" />
          {t('addMeetingToCalendar')}
        </Button>
      </div>
    </div>
  );

  if (!useOrbChrome) {
    return (
      <div
        ref={panelRef}
        className="relative z-10 shrink-0 border-b border-border bg-card shadow-md"
        style={{
          maxHeight: APP_CHROME.detailsMaxHeight,
          overflowY: 'auto',
        }}
        role="region"
        aria-label={t('protocolChrome.meetingMenuTitle', { defaultValue: 'Meeting menu' })}
      >
        {panelBody}
      </div>
    );
  }

  const anchorStyle =
    chromeConfig.anchor === 'bottom'
      ? { bottom: `var(--app-chrome-height, ${HEADER_HEIGHT_PX}px)` }
      : { top: `var(--app-chrome-height, ${HEADER_HEIGHT_PX}px)` };

  return createPortal(
    <div
      ref={panelRef}
      className={cn(
        'fixed inset-x-0 border-b border-border bg-card shadow-md opacity-100',
        Z_INDEX.chromeMenu,
        orbPhase === 'opening' && 'app-chrome-panel-visible'
      )}
      style={{
        ...anchorStyle,
        maxHeight: APP_CHROME.detailsMaxHeight,
        overflowY: 'auto',
      }}
      role="region"
      aria-label={t('protocolChrome.meetingMenuTitle', { defaultValue: 'Meeting menu' })}
    >
      {panelBody}
    </div>,
    document.body
  );
}

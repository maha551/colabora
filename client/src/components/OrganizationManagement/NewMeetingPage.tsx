import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Icon } from '../ui/Icon';
import { SPACING } from '../../lib/designSystem';
import { cn } from '../ui/utils';
import { CreateMeetingForm } from './CreateMeetingDialog';
import type { Meeting } from '../../lib/api/types/meetings';
import type { SchedulingPoll } from '../../lib/api/types/scheduling';

export interface NewMeetingPageProps {
  organizationId: string;
  onBack: () => void;
  /** When true, show "Create via scheduling poll" option (reps only). */
  showCreateViaPoll?: boolean;
  /** Called when user creates a new date poll instead of a meeting. */
  onPollCreated?: (poll: SchedulingPoll) => void;
  /** Navigate by pushing hash (for history alignment). */
  onNavigateToHash?: (hash: string) => void;
}

export function NewMeetingPage({
  organizationId,
  onBack,
  showCreateViaPoll = false,
  onPollCreated,
  onNavigateToHash,
}: NewMeetingPageProps) {
  const { t } = useTranslation('organization');

  const handleSuccess = (meeting: Meeting) => {
    const hash = `#/organization/${organizationId}/meetings/${meeting.id}`;
    if (onNavigateToHash) onNavigateToHash(hash);
    else if (typeof window !== 'undefined') window.location.hash = hash;
  };

  return (
    <div className={cn(SPACING.section.gap, 'flex flex-col')}>
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="self-start"
      >
        <Icon name="ArrowLeft" className="h-4 w-4 mr-2" />
        {t('backToSchedule', { defaultValue: 'Back to schedule' })}
      </Button>
      <CreateMeetingForm
        organizationId={organizationId}
        onSuccess={handleSuccess}
        showCreateViaPoll={showCreateViaPoll}
        onPollCreated={onPollCreated}
        onCancel={undefined}
        showHeading={true}
      />
    </div>
  );
}

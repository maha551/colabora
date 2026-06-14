import type { SchedulingPoll } from '../api/types/scheduling';

export const DEFAULT_PARTICIPATION_DAYS = 3;

export function canParticipate(poll: Pick<SchedulingPoll, 'status'> | null | undefined): boolean {
  return poll?.status === 'open';
}

export function canFinalize(poll: Pick<SchedulingPoll, 'status'> | null | undefined): boolean {
  return poll?.status === 'open' || poll?.status === 'closed';
}

/** Default participation deadline: now + 3 days at 17:00 local. */
export function getDefaultParticipationDeadlineDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + DEFAULT_PARTICIPATION_DAYS);
  d.setHours(17, 0, 0, 0);
  return d;
}

export function getDefaultParticipationDeadlineIso(): string {
  return getDefaultParticipationDeadlineDate().toISOString();
}

export function needsFinalization(poll: Pick<SchedulingPoll, 'status'>): boolean {
  return poll.status === 'closed';
}

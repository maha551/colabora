import type { Meeting } from '../../../lib/api/types/meetings';
import type { MeetingAgendaItem } from '../../../lib/api/types/meetingAgenda';
import type { MeetingDecision, TimelineDecisionItem, TimelineItem, TimelineTodoItem, MeetingVote } from '../../../lib/api/types/meetingMinutes';

export type ProtocolBlockType =
  | 'paragraph'
  | 'agenda_item'
  | 'brainstorm'
  | 'vote'
  | 'decision'
  | 'date_poll'
  | 'todo'
  | 'document_link';

export type ProtocolBlockStatus =
  | 'open'
  | 'closed'
  | 'completed'
  | 'partial'
  | 'stopped'
  | 'recorded'
  | 'deferred';

export type ProtocolNextActionType =
  | 'start_vote'
  | 'record_decision'
  | 'propose_org_vote'
  | 'create_todo'
  | 'view_poll'
  | 'create_meeting'
  | 'open_document'
  | 'none';

export interface ProtocolBlockLink {
  id: string;
  targetBlockId: string;
  label: string;
  relationship:
    | 'derived_from'
    | 'resulted_in'
    | 'references_poll'
    | 'references_document'
    | 'references_topic'
    | 'originates_from'
    | 'custom';
}

export interface ProtocolNextAction {
  type: ProtocolNextActionType;
  label: string;
  dismissible?: boolean;
}

export interface BaseProtocolBlock {
  id: string;
  type: ProtocolBlockType;
  status: ProtocolBlockStatus;
  occurredAt: string | null;
  orderIndex: number;
  entityVersion?: string | null;
  agendaItemId?: string | null;
  sourceTimelineItemId?: string;
  /** Decision-arc identifier computed server-side from FK chain (brainstorm → vote → decision). */
  arcId?: string | null;
  links?: ProtocolBlockLink[];
  nextAction?: ProtocolNextAction;
}

export interface ParagraphProtocolBlock extends BaseProtocolBlock {
  type: 'paragraph';
  paragraph: Extract<TimelineItem, { type: 'paragraph' }>;
  sectionPreset:
    | 'freeform'
    | 'agenda'
    | 'attendees'
    | 'discussion'
    | 'decisions'
    | 'action_items'
    | 'next_meeting'
    | 'unknown';
}

export interface AgendaItemProtocolBlock extends BaseProtocolBlock {
  type: 'agenda_item';
  item: MeetingAgendaItem;
  isCurrentTopic: boolean;
}

export interface BrainstormProtocolBlock extends BaseProtocolBlock {
  type: 'brainstorm';
  event: Extract<TimelineItem, { type: 'event' }>;
  options: { id: string; label: string }[];
}

export interface VoteProtocolBlock extends BaseProtocolBlock {
  type: 'vote';
  event: Extract<TimelineItem, { type: 'event' }>;
  vote?: MeetingVote | null;
}

export interface DecisionProtocolBlock extends BaseProtocolBlock {
  type: 'decision';
  decision?: MeetingDecision | TimelineDecisionItem;
  paragraph?: Extract<TimelineItem, { type: 'paragraph' }>;
}

export interface DatePollProtocolBlock extends BaseProtocolBlock {
  type: 'date_poll';
  event: Extract<TimelineItem, { type: 'event' }>;
  pollId?: string | null;
  chosenSlot?: { startAt: string; endAt: string } | null;
}

export interface TodoProtocolBlock extends BaseProtocolBlock {
  type: 'todo';
  todo: TimelineTodoItem;
}

export interface DocumentLinkProtocolBlock extends BaseProtocolBlock {
  type: 'document_link';
  event: Extract<TimelineItem, { type: 'event' }>;
  documentId: string;
  title?: string;
}

export type ProtocolBlock =
  | ParagraphProtocolBlock
  | AgendaItemProtocolBlock
  | BrainstormProtocolBlock
  | VoteProtocolBlock
  | DecisionProtocolBlock
  | DatePollProtocolBlock
  | TodoProtocolBlock
  | DocumentLinkProtocolBlock;

export interface BuildProtocolBlocksInput {
  detail: Meeting;
  timelineItems: TimelineItem[];
  agendaItems: MeetingAgendaItem[];
  activeVote?: MeetingVote | null;
}

export interface BuildProtocolBlocksOutput {
  blocks: ProtocolBlock[];
}

export interface ProtocolUiHandlers {
  onAddParagraph: () => void;
  onStartBrainstorm: () => void;
  onStartVote: () => void;
  onDateDecided: () => void;
  onAddTodo: () => void;
  onDocumentCreated: () => void;
  onSetCurrentTopic: (agendaItemId: string) => void;
  onEditParagraph: (item: TimelineItem) => void;
  onDeleteParagraph?: (item: TimelineItem) => void;
  onTodoEdit: (item: TimelineTodoItem) => void;
  onTodoDelete: (todoId: string) => void;
  onTodoStatusChange: (todoId: string, status: string) => void;
  onCloseVote?: (voteId: string) => void;
  onVoteCast?: (voteId: string) => void;
  onEndBrainstorm: (brainstormStartedEventId: string) => void;
  onCloseBrainstormAndVote: (brainstormStartedEventId: string, options: { id: string; label: string }[]) => void;
  onNavigateToDocument?: (documentId: string) => void;
  onNavigateToHash?: (hash: string) => void;
  onCreateMeetingFromPoll?: (context: { pollId: string; chosenSlot: { startAt: string; endAt: string }; defaultTitle: string }) => void;
}

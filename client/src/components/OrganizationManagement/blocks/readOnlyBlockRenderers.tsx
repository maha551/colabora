import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button';
import { Icon } from '../../ui/Icon';
import type { BlockTypeRendererMap } from './BlockRenderer';
import type { DatePollProtocolBlock } from './protocolBlocks.types';
import {
  BrainstormBlock,
  DatePollBlock,
  DecisionBlock,
  DocumentLinkBlock,
  ParagraphBlock,
  TodoBlock,
  VoteBlock,
} from './renderers';
import { protocolUi } from './protocolUi';

export interface ReadOnlyBlockRendererOptions {
  organizationId?: string;
  meetingId?: string;
  onNavigateToDocument?: (documentId: string) => void;
  onNavigateToHash?: (hash: string) => void;
}

export function createReadOnlyBlockRenderers(
  options: ReadOnlyBlockRendererOptions = {},
): BlockTypeRendererMap {
  const { organizationId, onNavigateToDocument, onNavigateToHash } = options;

  return {
    paragraph: ({ block }) => {
      if (block.type !== 'paragraph') return null;
      return (
        <ParagraphBlock
          block={block}
          disableEdit
          disableDelete
        />
      );
    },
    vote: ({ block }) => {
      if (block.type !== 'vote') return null;
      return <VoteBlock block={block} />;
    },
    brainstorm: ({ block }) => {
      if (block.type !== 'brainstorm') return null;
      return <BrainstormBlock block={block} />;
    },
    todo: ({ block }) => {
      if (block.type !== 'todo') return null;
      return <TodoBlock block={block} />;
    },
    decision: ({ block }) => {
      if (block.type !== 'decision') return null;
      return <DecisionBlock block={block} visualWeight="prominent" />;
    },
    document_link: ({ block }) => {
      if (block.type !== 'document_link') return null;
      return (
        <DocumentLinkBlock
          block={block}
          onOpenDocument={onNavigateToDocument}
        />
      );
    },
    date_poll: ({ block }) => {
      if (block.type !== 'date_poll') return null;
      return <ReadOnlyDatePollBlock block={block} organizationId={organizationId} onNavigateToHash={onNavigateToHash} />;
    },
  };
}

function ReadOnlyDatePollBlock({
  block,
  organizationId,
  onNavigateToHash,
}: {
  block: DatePollProtocolBlock;
  organizationId?: string;
  onNavigateToHash?: (hash: string) => void;
}) {
  const { t } = useTranslation('organization');
  const pollHash =
    organizationId && block.pollId
      ? `#/organization/${organizationId}/schedule/polls/${block.pollId}`
      : '';

  const viewPollSlot =
    pollHash && onNavigateToHash ? (
      <Button
        variant="outline"
        size="sm"
        className={protocolUi.blockActionBtn}
        onClick={() => onNavigateToHash(pollHash)}
      >
        <Icon name="Calendar" className="h-3.5 w-3.5" aria-hidden />
        {t('viewPoll', { defaultValue: 'View poll' })}
      </Button>
    ) : undefined;

  return <DatePollBlock block={block} viewPollSlot={viewPollSlot} />;
}

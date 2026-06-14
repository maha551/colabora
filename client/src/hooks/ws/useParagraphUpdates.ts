import { useCallback } from 'react';
import type { Paragraph, VersionHistory } from '../../types';
import { logger } from '../../lib/logger';
import type { DocumentUpdate } from '../useWebSocket';
import type { WebSocketUpdatesContext, ProcessUpdateHandler } from './types';

function normalizeHistoryEntries(
  updatedHistory: VersionHistory[] | undefined,
  paragraphId: string,
  text?: string
): VersionHistory[] {
  if (!updatedHistory?.length) return [];
  return updatedHistory.map((entry: VersionHistory & { newText?: string; oldText?: string; heading_level?: string }) => ({
    id: entry.id,
    paragraphId: entry.paragraphId || paragraphId,
    userId: entry.userId,
    text: (entry as { newText?: string }).newText ?? entry.text ?? text ?? '',
    oldText: (entry as { oldText?: string }).oldText ?? entry.oldText ?? null,
    proposalId: entry.proposalId ?? null,
    acceptedAt: entry.acceptedAt
      ? new Date(entry.acceptedAt as unknown as string)
      : (entry as { createdAt?: string }).createdAt
        ? new Date((entry as { createdAt: string }).createdAt)
        : new Date(),
    approvalPercentage: Number(entry.approvalPercentage || 0),
    type: entry.type || 'BODY',
    headingLevel: (entry as { heading_level?: string }).heading_level ?? entry.headingLevel,
    user: entry.user || { id: (entry as { user_id?: string }).user_id ?? '', name: '', email: '' },
  }));
}

export function useParagraphUpdates(ctx: WebSocketUpdatesContext): ProcessUpdateHandler {
  const { updateDocument, currentView, onAgreedViewRefresh, onAgreedViewParagraphUpdate, pendingOperationsRef } = ctx;

  return useCallback(
    (update: DocumentUpdate) => {
      if (update.eventType === 'paragraph' && update.data?.paragraphId) {
        const data = update.data as {
          paragraphId: string;
          text?: string;
          title?: string;
          headingLevel?: string;
          history?: VersionHistory[];
          reverted?: boolean;
          proposal?: { id?: string };
        };
        const { paragraphId, text, title, headingLevel, history: updatedHistory } = data;

        logger.log('Received paragraph update via WebSocket:', {
          paragraphId,
          text,
          title,
          headingLevel,
          historyCount: updatedHistory?.length,
          reverted: data.reverted,
        });

        const normalizedHistory = normalizeHistoryEntries(updatedHistory, paragraphId, text);

        updateDocument((prevDoc) => {
          if (!prevDoc) return prevDoc;
          const newParagraphs = prevDoc.paragraphs.map((para) => {
            if (para.id !== paragraphId) return para;
            const history = normalizedHistory.length > 0 ? normalizedHistory : para.history;
            return {
              ...para,
              text: text !== undefined ? text : para.text,
              title: title !== undefined ? title : para.title,
              headingLevel: headingLevel !== undefined ? headingLevel : para.headingLevel,
              history: history.length > 0 ? history : para.history,
            };
          });
          return { ...prevDoc, paragraphs: newParagraphs };
        });

        if (updatedHistory && updatedHistory.length > 0 && currentView === 'document') {
          if (onAgreedViewParagraphUpdate && update.documentId) {
            onAgreedViewParagraphUpdate(update.documentId, paragraphId, {
              text,
              title,
              headingLevel,
              history: normalizedHistory,
            });
            logger.log('Agreed view updated in-place from WebSocket', { paragraphId, historyCount: normalizedHistory.length });
          } else if (onAgreedViewRefresh) {
            onAgreedViewRefresh();
          }
        }

        if (data.proposal?.id) {
          const proposalTimeoutKey = `proposal-${data.proposal.id}`;
          const proposalTimeout = pendingOperationsRef.current.get(proposalTimeoutKey);
          if (proposalTimeout) {
            clearTimeout(proposalTimeout);
            pendingOperationsRef.current.delete(proposalTimeoutKey);
          }
        }
        return;
      }

      if (update.eventType === 'paragraph-created' && update.data?.paragraph) {
        const { paragraphId, paragraph } = update.data as {
          paragraphId: string;
          paragraph: Record<string, unknown> & { id: string; documentId?: string; text?: string; title?: string; headingLevel?: string; orderIndex?: number; order?: number };
        };

        logger.log('📝 Processing paragraph-created update:', {
          paragraphId,
          paragraphText: paragraph.text?.substring?.(0, 50),
          paragraphTitle: paragraph.title,
          orderIndex: paragraph.orderIndex,
        });

        updateDocument((prevDoc) => {
          if (!prevDoc) return prevDoc;
          const paragraphExists = prevDoc.paragraphs.some((p) => p.id === paragraphId);
          if (paragraphExists) {
            logger.log('⏭️ Paragraph already exists, skipping WebSocket update', { paragraphId });
            return prevDoc;
          }
          const orderValue = (paragraph.orderIndex ?? paragraph.order ?? 0) as number;
          const newParagraph: Paragraph = {
            id: paragraph.id,
            documentId: paragraph.documentId || prevDoc.id,
            text: paragraph.text || '',
            title: paragraph.title || null,
            headingLevel: paragraph.headingLevel || null,
            order: orderValue,
            proposals: [],
            suggestions: [],
            history: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          const newParagraphs = [...prevDoc.paragraphs, newParagraph].sort((a, b) => {
            const orderA = a.order ?? 0;
            const orderB = b.order ?? 0;
            return orderA - orderB;
          });
          return { ...prevDoc, paragraphs: newParagraphs };
        });
        return;
      }

      if (update.eventType === 'paragraph-updated' && update.data?.paragraphId) {
        const data = update.data as {
          paragraphId: string;
          text?: string;
          title?: string;
          headingLevel?: string | null;
          orderIndex?: number;
        };
        const { paragraphId, text, title, headingLevel, orderIndex } = data;

        logger.log('📝 Processing paragraph-updated update:', {
          paragraphId,
          hasText: text !== undefined,
          hasTitle: title !== undefined,
          headingLevel,
          orderIndex,
        });

        updateDocument((prevDoc) => {
          if (!prevDoc) return prevDoc;
          const newParagraphs = prevDoc.paragraphs.map((para) => {
            if (para.id !== paragraphId) return para;
            const updated = {
              ...para,
              text: text !== undefined ? text : para.text,
              title: title !== undefined ? title : para.title,
              headingLevel: headingLevel !== undefined ? headingLevel : para.headingLevel,
              order: orderIndex !== undefined ? orderIndex : para.order,
            };
            return updated;
          });
          if (orderIndex !== undefined) {
            newParagraphs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          }
          return { ...prevDoc, paragraphs: newParagraphs };
        });
      }
    },
    [updateDocument, currentView, onAgreedViewRefresh, onAgreedViewParagraphUpdate, pendingOperationsRef]
  );
}

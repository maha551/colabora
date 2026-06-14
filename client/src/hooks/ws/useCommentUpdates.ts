import { useCallback } from 'react';
import type { Comment } from '../../types';
import { normalizeComment, isOptimisticComment, matchesOptimisticComment } from '../../utils/optimisticUpdates';
import { logger } from '../../lib/logger';
import type { DocumentUpdate } from '../useWebSocket';
import type { WebSocketUpdatesContext, ProcessUpdateHandler } from './types';

export function useCommentUpdates(ctx: WebSocketUpdatesContext): ProcessUpdateHandler {
  const { updateDocument, reloadDocument, pendingOperationsRef } = ctx;

  return useCallback(
    (update: DocumentUpdate) => {
      if (update.eventType === 'comment' && update.data?.proposalId) {
        const data = update.data as {
          proposalId: string;
          paragraphId: string;
          comment: Comment & { deleted_at?: string | null };
          action?: string;
        };
        const { proposalId, paragraphId, comment } = data;
        const commentAction = data.action || (comment?.deletedAt || comment?.deleted_at ? 'deleted' : 'created');

        logger.log('💬 Processing comment update:', {
          proposalId,
          paragraphId,
          commentId: comment?.id,
          action: commentAction,
          isDeleted: !!(comment?.deletedAt || comment?.deleted_at),
          hasText: !!comment?.text,
        });

        updateDocument((prevDoc) => {
          if (!prevDoc) return prevDoc;
          const paragraphExists = prevDoc.paragraphs.some((p) => p.id === paragraphId);
          if (!paragraphExists) {
            logger.warn('⚠️ Comment received for non-existent paragraph, reloading document', {
              paragraphId,
              proposalId,
              commentId: comment?.id,
            });
            reloadDocument(true).catch((err) => {
              logger.error('Failed to reload after comment for non-existent paragraph:', err);
            });
            return prevDoc;
          }

          const newParagraphs = prevDoc.paragraphs.map((para) => {
            if (para.id !== paragraphId) return para;
            const proposalExists = para.proposals.some((p) => p.id === proposalId);
            if (!proposalExists) {
              logger.warn('⚠️ Comment received for non-existent proposal, reloading document', {
                paragraphId,
                proposalId,
                commentId: comment?.id,
              });
              reloadDocument(true).catch((err) => {
                logger.error('Failed to reload after comment for non-existent proposal:', err);
              });
              return para;
            }

            const newProposals = para.proposals.map((prop) => {
              if (prop.id !== proposalId) return prop;
              const existingComments = prop.comments || [];
              const normalizedComment = normalizeComment(comment);
              const existingCommentIndex = existingComments.findIndex((c) => {
                const normalized = normalizeComment(c);
                return normalized.id === comment.id || c.id === comment.id;
              });

              if (normalizedComment.deletedAt) {
                const updatedComments = existingComments.map((c) => {
                  if (c.id === comment.id) {
                    return {
                      ...normalizedComment,
                      text: '[deleted]',
                      user: {
                        ...normalizedComment.user,
                        avatar: normalizedComment.user?.avatar || c.user?.avatar,
                      },
                    };
                  }
                  return c;
                });
                if (existingCommentIndex < 0) {
                  updatedComments.push({ ...normalizedComment, text: '[deleted]' });
                }
                const nonDeletedCount = updatedComments.filter((c) => !c.deletedAt).length;
                return { ...prop, comments: updatedComments, commentCount: nonDeletedCount };
              }

              if (existingCommentIndex >= 0) {
                const existingComment = existingComments[existingCommentIndex];
                const normalizedExisting = normalizeComment(existingComment);
                const hasEditTimestamp =
                  normalizedComment.editedAt && normalizedComment.editedAt !== normalizedExisting.editedAt;
                const textChanged = normalizedComment.text.trim() !== normalizedExisting.text.trim();
                if (!hasEditTimestamp && !textChanged) {
                  logger.log('⏭️ Duplicate comment detected, skipping WebSocket update', {
                    commentId: comment.id,
                    existingCommentCount: existingComments.length,
                  });
                  return prop;
                }
                logger.log('✏️ Comment is an edit, updating');
                const updatedComments = [...existingComments];
                updatedComments[existingCommentIndex] = {
                  ...normalizedExisting,
                  ...normalizedComment,
                  user: {
                    ...normalizedComment.user,
                    avatar: normalizedComment.user?.avatar || normalizedExisting.user?.avatar,
                  },
                };
                const nonDeletedCount = updatedComments.filter((c) => !c.deletedAt).length;
                return { ...prop, comments: updatedComments, commentCount: nonDeletedCount };
              }

              const normalized = normalizeComment(comment);
              const optimisticIndex = existingComments.findIndex(
                (c) => isOptimisticComment(c.id) && matchesOptimisticComment(c, normalized)
              );

              let newComments: Comment[];
              if (optimisticIndex >= 0) {
                const optimisticToReplace = existingComments[optimisticIndex];
                const finalParentId =
                  normalized.parentId !== undefined ? normalized.parentId : (optimisticToReplace.parentId || undefined);
                const finalComment: Comment = { ...normalized, parentId: finalParentId };
                newComments = [...existingComments];
                newComments[optimisticIndex] = finalComment;
                logger.log('🔄 WebSocket: Replaced optimistic comment with real comment', {
                  optimisticId: optimisticToReplace.id,
                  realId: normalized.id,
                });
              } else {
                const commentAlreadyExists = existingComments.some((c) => c.id === normalized.id);
                if (commentAlreadyExists) {
                  logger.log('⏭️ WebSocket: Comment already exists, skipping duplicate', {
                    realId: normalized.id,
                    parentId: normalized.parentId,
                  });
                  return prop;
                }
                newComments = [...existingComments, normalized];
              }
              const nonDeletedCount = newComments.filter((c) => !c.deletedAt).length;
              return { ...prop, comments: newComments, commentCount: nonDeletedCount };
            });

            return { ...para, proposals: newProposals, suggestions: newProposals };
          });

          return { ...prevDoc, paragraphs: newParagraphs };
        });

        if (comment?.id) {
          const commentTimeoutKey = `comment-${comment.id}`;
          const commentTimeout = pendingOperationsRef.current.get(commentTimeoutKey);
          if (commentTimeout) {
            clearTimeout(commentTimeout);
            pendingOperationsRef.current.delete(commentTimeoutKey);
          }
        }
        return;
      }

      if (update.eventType === 'comment-upvote' && update.data?.commentId != null) {
        const { commentId, upvoteCount } = update.data as { commentId: string; upvoteCount: number };
        if (typeof upvoteCount !== 'number') return;
        updateDocument((prevDoc) => {
          if (!prevDoc) return prevDoc;
          let changed = false;
          const newParagraphs = prevDoc.paragraphs.map((para) => {
            const newProposals = (para.proposals || []).map((prop) => {
              const newComments = (prop.comments || []).map((c) => {
                if (c.id === commentId) {
                  changed = true;
                  return { ...c, upvoteCount };
                }
                return c;
              });
              return { ...prop, comments: newComments };
            });
            return { ...para, proposals: newProposals };
          });
          if (!changed) return prevDoc;
          return { ...prevDoc, paragraphs: newParagraphs };
        });
      }
    },
    [updateDocument, reloadDocument, pendingOperationsRef]
  );
}

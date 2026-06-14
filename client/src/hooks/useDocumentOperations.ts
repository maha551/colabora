// Custom hook for document operations (proposals, votes, comments)
// Extracted from App.tsx to reduce complexity and improve modularity

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { logger } from '../lib/logger';
import { proposalsApi, commentsApi } from '../lib/api';
import { handleProposalDelete } from '../utils/proposalOperations';
import { extractFieldErrors } from '../lib/documentErrors';
import { normalizeComment, createOptimisticComment, isOptimisticComment, matchesOptimisticComment } from '../utils/optimisticUpdates';
import { getUserFriendlyErrorMessage } from '../utils/errorMessages';
import { findProposalAndParagraph } from '../utils/documentHelpers';
import { useOptimisticVote, type VoteSnapshot } from './useOptimisticVote';
import { useVotingStore } from '../stores/useVotingStore';
import type { Document, Proposal, Comment, User, HeadingLevel, Vote, PartialVoteCounts } from '../types';

interface UseDocumentOperationsProps {
  currentDocument: Document | null;
  currentUser: User | null;
  updateDocument: React.Dispatch<React.SetStateAction<Document | null>>;
  reloadDocument: () => Promise<void>;
}

export function useDocumentOperations({
  currentDocument,
  currentUser,
  updateDocument,
  reloadDocument,
}: UseDocumentOperationsProps) {
  const votingState = useVotingStore((s) => s.votingState);
  const setVotingState = useVotingStore((s) => s.setVotingState);
  const { t } = useTranslation('common');
  const [isAddingSuggestion, setIsAddingSuggestion] = useState(false);
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  const handleAddSuggestion = useCallback(async (
    paragraphId: string,
    data: {
      text: string;
      type?: 'BODY' | 'TITLE';
      headingLevel?: HeadingLevel;
    }
  ) => {
    if (!currentDocument || !currentUser) return;

    const text = data.text;
    const type = data.type ?? 'BODY';

    setIsAddingSuggestion(true);
    try {
      const response = await proposalsApi.createProposal(currentDocument.id, paragraphId, {
        text,
        type,
        headingLevel: data.headingLevel
      });
      
      // Add proposal from API response as fallback (WebSocket will update if it arrives)
      if (response.proposal) {
        updateDocument((prevDoc) => {
          if (!prevDoc) return prevDoc;
          
          return {
            ...prevDoc,
            paragraphs: prevDoc.paragraphs.map(para => {
              if (para.id !== paragraphId) return para;
              
              const existingProposals = para.proposals || [];
              // CRITICAL: Check if proposal already exists (WebSocket might have added it)
              const proposalExists = existingProposals.some(p => p.id === response.proposal.id);
              if (proposalExists) {
                // WebSocket already added it
                return para;
              }
              
              // Add proposal from HTTP response
              return {
                ...para,
                proposals: [...existingProposals, response.proposal],
                suggestions: [...existingProposals, response.proposal]
              };
            })
          };
        });
      }
      
      toast.success(t('toasts.suggestionAdded'));
    } catch (err) {
      logger.error('Failed to add suggestion:', err);
      toast.error(t('toasts.failedToAddSuggestion'));
    } finally {
      setIsAddingSuggestion(false);
    }
  }, [currentDocument, currentUser, updateDocument, t]);

  const getVoteContext = useCallback(
    (proposalId: string): { documentId: string; paragraphId: string } | null => {
      if (!currentDocument) return null;
      const result = findProposalAndParagraph(currentDocument, proposalId);
      return result ? { documentId: currentDocument.id, paragraphId: result.paragraphId } : null;
    },
    [currentDocument]
  );

  const getProposalSnapshot = useCallback(
    (proposalId: string): VoteSnapshot | null => {
      if (!currentDocument || !currentUser) return null;
      const result = findProposalAndParagraph(currentDocument, proposalId);
      if (!result) return null;
      const { proposal } = result;
      const votes = proposal.votes || [];
      const currentUserVote = votes.find((v) => v.userId === currentUser.id);
      return {
        votes: [...votes],
        partialVoteCounts: {
          pro: votes.filter((v) => v.vote === 'PRO').length,
          contra: votes.filter((v) => v.vote === 'CONTRA').length,
          neutral: votes.filter((v) => v.vote === 'NEUTRAL').length,
          total: votes.length,
        },
        currentUserVote,
      };
    },
    [currentDocument, currentUser]
  );

  const applyOptimistic = useCallback(
    (
      proposalId: string,
      _documentId: string,
      paragraphId: string,
      _voteType: 'PRO' | 'NEUTRAL' | 'CONTRA',
      payload: { optimisticVote: Vote; newCounts: PartialVoteCounts }
    ) => {
      if (!currentUser) return;
      const { optimisticVote, newCounts } = payload;
      updateDocument((prevDoc) => {
        if (!prevDoc) return prevDoc;
        return {
          ...prevDoc,
          paragraphs: prevDoc.paragraphs.map((para) => {
            if (para.id !== paragraphId) return para;
            const updatedProposals = para.proposals.map((p) => {
              if (p.id !== proposalId) return p;
              const filteredVotes = p.votes.filter((v) => v.userId !== currentUser.id);
              return {
                ...p,
                votes: [...filteredVotes, optimisticVote],
                partialVoteCounts: newCounts,
              };
            });
            return { ...para, proposals: updatedProposals, suggestions: updatedProposals };
          }),
        };
      });
    },
    [currentUser, updateDocument]
  );

  const rollback = useCallback(
    (proposalId: string, snapshot: VoteSnapshot) => {
      if (!currentDocument) return;
      const result = findProposalAndParagraph(currentDocument, proposalId);
      if (!result) return;
      const { paragraphId } = result;
      const { partialVoteCounts: originalCounts, currentUserVote } = snapshot;
      updateDocument((prevDoc) => {
        if (!prevDoc) return prevDoc;
        return {
          ...prevDoc,
          paragraphs: prevDoc.paragraphs.map((para) => {
            if (para.id !== paragraphId) return para;
            const updatedProposals = para.proposals.map((p) => {
              if (p.id !== proposalId) return p;
              const restoredVotes = p.votes.filter((v) => !v.id.startsWith('optimistic-'));
              if (currentUserVote) restoredVotes.push(currentUserVote);
              return { ...p, votes: restoredVotes, partialVoteCounts: originalCounts };
            });
            return { ...para, proposals: updatedProposals, suggestions: updatedProposals };
          }),
        };
      });
    },
    [currentDocument, updateDocument]
  );

  const { vote } = useOptimisticVote({
    votingState,
    setVotingState,
    currentUser,
    getVoteContext,
    getProposalSnapshot,
    applyOptimistic,
    rollback,
    reloadDocument,
    organizationId: currentDocument?.organizationId,
  });

  const handleVote = useCallback(
    async (suggestionId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
      if (!currentDocument || !currentUser) return;
      await vote(suggestionId, voteType);
    },
    [currentDocument, currentUser, vote]
  );

  const handleComment = useCallback(async (suggestionId: string, text: string, parentId?: string, retryCount = 0) => {
    if (!currentDocument || !currentUser) return;

    // Find the proposal and paragraph using utility function
    const result = findProposalAndParagraph(currentDocument, suggestionId);
    if (!result) return;
    
    const { paragraphId, proposal } = result;

    // Create optimistic comment immediately for instant UI feedback
    // Note: Proposals are always commentableType 'proposal' (structure proposals are handled separately)
    const optimisticComment = createOptimisticComment({
      text: text.trim(),
      userId: currentUser.id,
      userName: currentUser.name,
      userEmail: currentUser.email,
      userAvatar: currentUser.avatar,
      commentableType: 'proposal',
      commentableId: suggestionId,
      proposalId: suggestionId,
      structureProposalId: undefined,
      parentId: parentId
    });

    // Add optimistic comment to state immediately
    updateDocument((prevDoc) => {
      if (!prevDoc) {
        logger.warn('⚠️ Cannot add optimistic comment: no current document');
        return prevDoc;
      }
      
      const targetPara = prevDoc.paragraphs.find(p => p.id === paragraphId);
      if (!targetPara) {
        logger.warn('⚠️ Paragraph not found:', paragraphId);
        return prevDoc;
      }
      
      const targetProp = targetPara.proposals.find(p => p.id === suggestionId);
      if (!targetProp) {
        logger.warn('⚠️ Proposal not found:', suggestionId);
        return prevDoc;
      }
      
      return {
        ...prevDoc,
        paragraphs: prevDoc.paragraphs.map(para => {
          if (para.id !== paragraphId) return para;
          
          // Helper function to add optimistic comment to a proposal
          const addOptimisticComment = (prop: Proposal) => {
            if (prop.id !== suggestionId) return prop;
            
            const existingComments = prop.comments || [];
            
            // Insert optimistic comment in chronological order (by createdAt)
            // This ensures comments appear in the correct order even before server response
            const optimisticTime = new Date(optimisticComment.createdAt).getTime();
            const insertIndex = existingComments.findIndex(c => {
              const cTime = new Date(c.createdAt).getTime();
              return cTime > optimisticTime;
            });
            
            const newComments = insertIndex < 0
              ? [...existingComments, optimisticComment] // Append if newest
              : [
                  ...existingComments.slice(0, insertIndex),
                  optimisticComment,
                  ...existingComments.slice(insertIndex)
                ]; // Insert in correct chronological position
            
            logger.log('✨ Added optimistic comment:', {
              optimisticId: optimisticComment.id,
              parentId: optimisticComment.parentId,
              textPreview: optimisticComment.text.substring(0, 50),
              insertIndex: insertIndex < 0 ? 'end' : insertIndex,
              totalComments: newComments.length
            });
            
            return {
              ...prop,
              comments: newComments,
              commentCount: newComments.filter(c => !c.deletedAt).length
            };
          };
          
          // Update proposals array (suggestions is the same reference)
          const updatedProposals = para.proposals.map(addOptimisticComment);
          
          return {
            ...para,
            proposals: updatedProposals,
            suggestions: updatedProposals // Same array reference - no duplication
          };
        })
      };
    });

    setIsAddingComment(true);
    try {
      // Only include parentId if it's provided (for threaded comments)
      const commentData: { text: string; parentId?: string } = { text };
      if (parentId) {
        commentData.parentId = parentId;
      }
      const response = await commentsApi.addComment(currentDocument.id, paragraphId, suggestionId, commentData);
      
      // Replace optimistic comment with real comment from HTTP response
      if (response?.comment?.id) {
        logger.log('📝 HTTP response received, replacing optimistic comment:', {
          optimisticId: optimisticComment.id,
          realId: response.comment.id,
          proposalId: suggestionId,
          paragraphId,
          optimisticParentId: optimisticComment.parentId,
          responseParentId: response.comment.parentId,
          responseParentIdRaw: (response.comment as any).parent_id, // Check raw snake_case too
          hasParentId: response.comment.parentId !== undefined && response.comment.parentId !== null
        });
        
        updateDocument((prevDoc) => {
          if (!prevDoc) {
            logger.warn('⚠️ Cannot replace optimistic comment: no current document');
            return prevDoc;
          }
          
          const targetPara = prevDoc.paragraphs.find(p => p.id === paragraphId);
          if (!targetPara) {
            logger.warn('⚠️ Paragraph not found:', paragraphId);
            return prevDoc;
          }
          
          const targetProp = targetPara.proposals.find(p => p.id === suggestionId);
          if (!targetProp) {
            logger.warn('⚠️ Proposal not found:', suggestionId);
            return prevDoc;
          }
          
          return {
            ...prevDoc,
            paragraphs: prevDoc.paragraphs.map(para => {
              if (para.id !== paragraphId) return para;
              
              // Helper function to update comments for a proposal
              const updateProposalComments = (prop: Proposal) => {
                if (prop.id !== suggestionId) return prop;
                
                const existingComments = prop.comments || [];
                
                // Check if comment already exists (WebSocket might have added it)
                const commentExists = existingComments.some(c => c.id === response.comment.id);
                if (commentExists) {
                  logger.log('✅ Comment already exists from WebSocket, removing optimistic comment', {
                    optimisticId: optimisticComment.id,
                    realId: response.comment.id,
                    existingCount: existingComments.length
                  });
                  
                  // Remove optimistic comment if it still exists
                  const newComments = existingComments.filter(c => c.id !== optimisticComment.id);
                  return {
                    ...prop,
                    comments: newComments,
                    commentCount: newComments.filter(c => !c.deletedAt).length
                  };
                }
                
                // Find and replace optimistic comment with real comment
                const normalizedComment = normalizeComment(response.comment);
                
                // Validate normalized comment has required fields
                if (!normalizedComment.id || !normalizedComment.text) {
                  logger.error('❌ Invalid comment data after normalization:', normalizedComment);
                  return prop;
                }
                
                // Find optimistic comment to replace
                // CRITICAL: Check by ID first (most reliable), then by matching function
                // This prevents overwriting wrong comments if multiple optimistic comments exist
                let optimisticIndex = existingComments.findIndex(c => c.id === optimisticComment.id);
                
                // If not found by ID, try matching function (handles edge cases)
                if (optimisticIndex < 0) {
                  optimisticIndex = existingComments.findIndex(c => 
                    isOptimisticComment(c.id) && matchesOptimisticComment(c, normalizedComment)
                  );
                }
                
                // Log parentId for debugging
                if (optimisticIndex >= 0) {
                  const optimisticCommentToReplace = existingComments[optimisticIndex];
                  logger.log('🔍 Matching optimistic comment for replacement:', {
                    optimisticId: optimisticCommentToReplace.id,
                    optimisticParentId: optimisticCommentToReplace.parentId,
                    realId: normalizedComment.id,
                    realParentId: normalizedComment.parentId,
                    optimisticText: optimisticCommentToReplace.text.substring(0, 50),
                    realText: normalizedComment.text.substring(0, 50)
                  });
                }
                
                let newComments: Comment[];
                if (optimisticIndex >= 0) {
                  // Replace optimistic comment with real comment
                  const optimisticToReplace = existingComments[optimisticIndex];
                  
                  // CRITICAL: Preserve parentId from optimistic if real comment's parentId is missing/undefined
                  // This handles cases where server might not include parentId in response
                  const finalParentId = normalizedComment.parentId !== undefined 
                    ? normalizedComment.parentId 
                    : (optimisticToReplace.parentId || undefined);
                  
                  const finalComment: Comment = {
                    ...normalizedComment,
                    parentId: finalParentId
                  };
                  
                  newComments = [...existingComments];
                  newComments[optimisticIndex] = finalComment;
                  logger.log('🔄 Replaced optimistic comment with real comment:', {
                    optimisticId: optimisticComment.id,
                    realId: normalizedComment.id,
                    optimisticParentId: optimisticToReplace.parentId,
                    realParentId: normalizedComment.parentId,
                    finalParentId: finalComment.parentId,
                    preservedParentId: newComments[optimisticIndex].parentId
                  });
                } else {
                  // Optimistic comment not found - check if real comment already exists to prevent duplicates
                  const realCommentExists = existingComments.some(c => c.id === normalizedComment.id);
                  if (realCommentExists) {
                    // Real comment already exists (probably from WebSocket), just remove optimistic
                    logger.log('✅ Real comment already exists, removing optimistic comment only:', {
                      optimisticId: optimisticComment.id,
                      realId: normalizedComment.id
                    });
                    newComments = existingComments.filter(c => c.id !== optimisticComment.id);
                  } else {
                    // Neither optimistic nor real comment found - add real comment (shouldn't happen, but handle gracefully)
                    logger.warn('⚠️ Optimistic comment not found and real comment not found, adding real comment:', {
                      optimisticId: optimisticComment.id,
                      realId: normalizedComment.id
                    });
                    newComments = [...existingComments, normalizedComment];
                  }
                }
                
                return {
                  ...prop,
                  comments: newComments,
                  commentCount: newComments.filter(c => !c.deletedAt).length
                };
              };
              
              // Update proposals array (suggestions is the same reference)
              const updatedProposals = para.proposals.map(updateProposalComments);
              
              return {
                ...para,
                proposals: updatedProposals,
                suggestions: updatedProposals // Same array reference - no duplication
              };
            })
          };
        });
      } else {
        logger.error('❌ HTTP response missing or invalid comment data:', {
          hasResponse: !!response,
          hasComment: !!response?.comment,
          commentId: response?.comment?.id
        });
      }
      
      toast.success(parentId ? t('toasts.replyAdded') : t('toasts.commentAdded'));
    } catch (err) {
      logger.error('Failed to add comment:', err);
      
      // Remove optimistic comment on error
      updateDocument((prevDoc) => {
        if (!prevDoc) return prevDoc;
        
        return {
          ...prevDoc,
          paragraphs: prevDoc.paragraphs.map(para => {
            if (para.id !== paragraphId) return para;
            
            // Helper function to remove optimistic comment from a proposal
            const removeOptimisticComment = (prop: Proposal) => {
              if (prop.id !== suggestionId) return prop;
              const newComments = (prop.comments || []).filter(c => c.id !== optimisticComment.id);
              
              logger.log('🗑️ Removed optimistic comment due to error:', {
                optimisticId: optimisticComment.id
              });
              
              return {
                ...prop,
                comments: newComments,
                commentCount: newComments.filter(c => !c.deletedAt).length
              };
            };
            
            // Update proposals array (suggestions is the same reference)
            const updatedProposals = para.proposals.map(removeOptimisticComment);
            
            return {
              ...para,
              proposals: updatedProposals,
              suggestions: updatedProposals // Same array reference - no duplication
            };
          })
        };
      });
      
      // Handle race condition: If parent comment not found and this is a reply, retry with exponential backoff
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isParentNotFoundError = parentId && (
        errorMessage.includes('Parent comment not found') ||
        errorMessage.includes('parent comment not found') ||
        errorMessage.includes('does not belong to this proposal')
      );
      
      if (isParentNotFoundError && retryCount < 3) {
        // Exponential backoff: 100ms, 200ms, 400ms
        const delay = 100 * Math.pow(2, retryCount);
        logger.log(`🔄 Retrying reply due to parent not found (attempt ${retryCount + 1}/3, delay ${delay}ms)`, {
          parentId,
          retryCount,
          delay
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Retry the comment creation
        setIsAddingComment(false); // Reset state before retry
        return handleComment(suggestionId, text, parentId, retryCount + 1);
      }
      
      // Parse and display validation errors
      const fieldErrors = extractFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) {
        toast.error(fieldErrors.text || (parentId ? t('toasts.failedToAddReply') : t('toasts.failedToAddComment')));
      } else {
        const userFriendlyMessage = getUserFriendlyErrorMessage(err, parentId ? t('toasts.failedToAddReply') : t('toasts.failedToAddComment'));
        toast.error(userFriendlyMessage);
      }
    } finally {
      setIsAddingComment(false);
    }
  }, [currentDocument, currentUser, updateDocument, t]);

  const handleDeleteComment = useCallback(async (suggestionId: string, commentId: string) => {
    if (!currentDocument) return;

    // Find the proposal and paragraph using utility function
    const result = findProposalAndParagraph(currentDocument, suggestionId);
    if (!result) return;
    
    const { paragraphId } = result;

    setDeletingCommentId(commentId);
    try {
      await commentsApi.deleteComment(currentDocument.id, paragraphId, suggestionId, commentId);
      toast.success('Comment deleted');
      // WebSocket will update the comment
    } catch (err: unknown) {
      logger.error('Failed to delete comment:', err);
      toast.error(err instanceof Error ? err.message : t('toasts.failedToDeleteComment'));
    } finally {
      setDeletingCommentId(null);
    }
  }, [currentDocument, updateDocument, t]);

  const handleEditComment = useCallback(async (suggestionId: string, commentId: string, text: string) => {
    if (!currentDocument) return;

    // Find the proposal and paragraph using utility function
    const result = findProposalAndParagraph(currentDocument, suggestionId);
    if (!result) return;
    
    const { paragraphId } = result;

    try {
      await commentsApi.updateComment(currentDocument.id, paragraphId, suggestionId, commentId, { text });
      toast.success(t('toasts.commentUpdated'));
      // WebSocket will update the comment
    } catch (err: unknown) {
      logger.error('Failed to update comment:', err);
      const errorMessage = err instanceof Error ? err.message : t('toasts.failedToUpdateComment');
      if (errorMessage.includes('15 minutes')) {
        toast.error(t('toasts.commentsEditWindow'));
      } else {
        toast.error(errorMessage);
      }
    }
  }, [currentDocument, t]);

  const handleLoadMoreComments = useCallback(async (suggestionId: string, offset: number): Promise<Comment[]> => {
    if (!currentDocument) return [];

    // Find the proposal and paragraph using utility function
    const result = findProposalAndParagraph(currentDocument, suggestionId);
    if (!result) return [];
    
    const { paragraphId } = result;

    try {
      const response = await commentsApi.getComments(currentDocument.id, paragraphId, suggestionId, {
        limit: 20,
        offset: offset
      });

      // Add new comments to the proposal
      updateDocument((prevDoc) => {
        if (!prevDoc) return prevDoc;
        
        return {
          ...prevDoc,
          paragraphs: prevDoc.paragraphs.map(para => {
            if (para.id !== paragraphId) return para;
            
            const newProposals = para.proposals.map(prop => {
              if (prop.id !== suggestionId) return prop;
              
              // Merge new comments, avoiding duplicates
              const existingIds = new Set(prop.comments.map(c => c.id));
              const newComments = response.comments.filter(c => !existingIds.has(c.id));
              
              const mergedComments = [...prop.comments, ...newComments];
              
              // Calculate accurate count from actual comments (excluding deleted)
              // Use response.total as the source of truth, but also calculate from array for consistency
              const nonDeletedCount = mergedComments.filter(c => !c.deletedAt && !c.deleted_at).length;
              
              return {
                ...prop,
                comments: mergedComments,
                commentCount: response.total || nonDeletedCount
              };
            });
            return {
              ...para,
              proposals: newProposals,
              suggestions: newProposals
            };
          })
        };
      });

      return response.comments;
    } catch (err) {
      logger.error('Failed to load more comments:', err);
      throw err;
    }
  }, [currentDocument, updateDocument]);

  const handleDeleteProposal = useCallback(async (proposalId: string) => {
    if (!currentDocument || !currentUser) return;

    // Find the proposal and paragraph
    const result = findProposalAndParagraph(currentDocument, proposalId);
    if (!result) {
      logger.error('Proposal or paragraph not found for deletion', { proposalId, documentId: currentDocument.id });
      toast.error(t('toasts.proposalNotFound'));
      return;
    }

    const { paragraphId, proposal } = result;

    try {
      await handleProposalDelete(proposalId, currentDocument.id, paragraphId);
      // Reload document to reflect deletion (WebSocket will also update, but this ensures consistency)
      await reloadDocument();
    } catch (err) {
      // Error already handled in handleProposalDelete utility
      logger.error('Failed to delete proposal:', err);
    }
  }, [currentDocument, currentUser, reloadDocument, t]);

  /** Update local document state after upvote/remove upvote (API is called by UI). */
  const handleUpvoteComment = useCallback((suggestionId: string, commentId: string, data: { upvoteCount: number; userUpvoted: boolean }) => {
    updateDocument((prevDoc) => {
      if (!prevDoc) return prevDoc;
      const result = findProposalAndParagraph(prevDoc, suggestionId);
      if (!result) return prevDoc;
      const { paragraphId } = result;
      return {
        ...prevDoc,
        paragraphs: prevDoc.paragraphs.map(para => {
          if (para.id !== paragraphId) return para;
          const updatedProposals = (para.proposals || []).map(prop => {
            if (prop.id !== suggestionId) return prop;
            const newComments = (prop.comments || []).map(c =>
              c.id === commentId ? { ...c, upvoteCount: data.upvoteCount, userUpvoted: data.userUpvoted } : c
            );
            return { ...prop, comments: newComments };
          });
          return { ...para, proposals: updatedProposals, suggestions: updatedProposals };
        }),
      };
    });
  }, [updateDocument]);

  return {
    handleAddSuggestion,
    handleVote,
    handleComment,
    handleUpvoteComment,
    handleDeleteComment,
    handleEditComment,
    handleLoadMoreComments,
    handleDeleteProposal,
    isAddingSuggestion,
    isAddingComment,
    deletingCommentId,
  };
}


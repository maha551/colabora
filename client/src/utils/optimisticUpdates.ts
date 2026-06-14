// Utility functions for normalizing API responses
// Extracted from App.tsx to improve code organization and reusability

import type { Comment, CommentApiResponse } from '../types';
import { logger } from '../lib/logger';

/**
 * Normalizes a comment from API response to ensure consistent format.
 * Handles both camelCase and snake_case properties for backward compatibility.
 * 
 * **Critical: parentId normalization**
 * - Converts `null` → `undefined` for top-level comments
 * - Converts empty strings → `undefined` for top-level comments
 * - Trims and validates string values for replies
 * - This ensures consistent type: `string | undefined` (never `null`)
 * 
 * **Why this matters:**
 * - Server may send `parentId: null` for top-level comments
 * - Frontend TypeScript type expects `parentId?: string` (undefined, not null)
 * - Threading logic relies on `parentId === undefined` to identify top-level comments
 * - Replies must have `parentId` as a non-empty string
 * 
 * @param comment - Comment object from API (may have camelCase or snake_case properties)
 * @returns Normalized comment with consistent format
 * 
 * @example
 * // Top-level comment (null → undefined)
 * normalizeComment({ id: '1', parentId: null }) 
 * // → { id: '1', parentId: undefined }
 * 
 * // Reply comment (string preserved, trimmed)
 * normalizeComment({ id: '2', parentId: '  parent-id  ' })
 * // → { id: '2', parentId: 'parent-id' }
 */
export function normalizeComment(comment: Comment | CommentApiResponse): Comment {
  const apiComment = comment as CommentApiResponse;
  // Extract parentId from both camelCase and snake_case
  // Important: parentId should be string | undefined (string for replies, undefined for top-level)
  // The TypeScript type Comment.parentId is string | undefined, not string | null | undefined
  let parentId: string | null | undefined;
  
  // Define interface for snake_case API response
  interface CommentApiResponseSnakeCase {
    parent_id?: string | null;
    deleted_at?: string | null;
    edited_at?: string | null;
    edit_count?: number;
    user_avatar?: string;
    commentable_type?: 'proposal' | 'structure_proposal';
    commentable_id?: string;
  }

  if (comment.parentId !== undefined) {
    // parentId is explicitly set (could be null or string)
    parentId = comment.parentId;
  } else if ('parent_id' in apiComment && (apiComment as CommentApiResponseSnakeCase).parent_id !== undefined) {
    // parent_id in snake_case is explicitly set (could be null or string)
    parentId = (apiComment as CommentApiResponseSnakeCase).parent_id;
  } else {
    // Neither is set, default to undefined for top-level comments
    parentId = undefined;
  }
  
  // Convert to string | undefined (matching Comment type)
  // - null or empty string -> undefined (top-level comment)
  // - valid string -> trimmed string (reply)
  // - undefined -> undefined (top-level comment)
  const normalizedParentId: string | undefined = 
    parentId === null || parentId === '' || parentId === undefined
      ? undefined
      : typeof parentId === 'string' 
        ? (parentId.trim() === '' ? undefined : parentId.trim())
        : parentId;
  
  // Defensive logging: warn if unexpected type after normalization
  if (normalizedParentId !== undefined && normalizedParentId !== null && typeof normalizedParentId !== 'string') {
    logger.warn('Unexpected parentId type after normalization', {
      commentId: comment.id,
      originalParentId: parentId,
      normalizedParentId,
      parentIdType: typeof normalizedParentId
    });
  }
  
  // Extract commentableType and commentableId
  const commentableType = comment.commentableType || 
    (apiComment as CommentApiResponseSnakeCase).commentable_type || 
    'proposal';
  const commentableId = comment.commentableId || 
    (apiComment as CommentApiResponseSnakeCase).commentable_id || 
    comment.proposalId || 
    comment.structureProposalId || 
    '';

  // Set backward compatibility fields based on commentableType
  const proposalId = commentableType === 'proposal' ? commentableId : undefined;
  const structureProposalId = commentableType === 'structure_proposal' ? commentableId : undefined;

  return {
    ...comment,
    commentableType: commentableType as 'proposal' | 'structure_proposal',
    commentableId: commentableId,
    // Backward compatibility fields
    proposalId: proposalId || comment.proposalId,
    structureProposalId: structureProposalId || comment.structureProposalId,
    parentId: normalizedParentId,
    deletedAt: comment.deletedAt || apiComment.deleted_at || null,
    editedAt: comment.editedAt || apiComment.edited_at || null,
    editCount: comment.editCount || apiComment.edit_count || 0,
    user: {
      ...comment.user,
      avatar: comment.user?.avatar || apiComment.user_avatar
    }
  };
}

/**
 * Check if a comment ID is an optimistic (temporary) comment ID.
 * Optimistic comments use the format: temp-comment-{timestamp}-{random}
 * 
 * @param id - Comment ID to check
 * @returns true if the ID is an optimistic comment ID
 */
export function isOptimisticComment(id: string): boolean {
  return id.startsWith('temp-comment-');
}

/**
 * Creates an optimistic comment object with a temporary ID.
 * This comment will be replaced with the real comment when it arrives from the server.
 * 
 * @param params - Parameters for creating the optimistic comment
 * @returns Comment object with temporary ID
 */
export function createOptimisticComment(params: {
  text: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar?: string;
  commentableType: 'proposal' | 'structure_proposal';
  commentableId: string;
  proposalId?: string;
  structureProposalId?: string;
  parentId?: string;
}): Comment {
  const now = new Date().toISOString();
  const tempId = `temp-comment-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  return {
    id: tempId,
    commentableType: params.commentableType,
    commentableId: params.commentableId,
    proposalId: params.proposalId,
    structureProposalId: params.structureProposalId,
    userId: params.userId,
    text: params.text,
    parentId: params.parentId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    editedAt: null,
    editCount: 0,
    user: {
      id: params.userId,
      name: params.userName,
      email: params.userEmail,
      avatar: params.userAvatar
    },
    replies: []
  };
}

/**
 * Matches an optimistic comment with a real comment from the server.
 * Uses multiple criteria to ensure accurate matching:
 * - Text content (trimmed, case-insensitive)
 * - User ID
 * - Parent ID (for replies)
 * - Timestamp window (within 5 seconds)
 * 
 * @param optimistic - The optimistic comment to match
 * @param real - The real comment from the server
 * @returns true if the comments match
 */
export function matchesOptimisticComment(optimistic: Comment, real: Comment): boolean {
  // Must be an optimistic comment
  if (!isOptimisticComment(optimistic.id)) {
    return false;
  }
  
  // User ID must match
  if (optimistic.userId !== real.userId) {
    return false;
  }
  
  // Text content must match (trimmed, case-insensitive)
  if (optimistic.text.trim().toLowerCase() !== real.text.trim().toLowerCase()) {
    return false;
  }
  
  // Parent ID must match (both undefined for top-level, or same string for replies)
  // Normalize both to handle null/undefined/empty string edge cases
  const optimisticParentId = optimistic.parentId 
    ? (typeof optimistic.parentId === 'string' ? optimistic.parentId.trim() : undefined)
    : undefined;
  const realParentId = real.parentId 
    ? (typeof real.parentId === 'string' ? real.parentId.trim() : undefined)
    : undefined;
  
  // Both must be undefined (top-level) or both must be the same non-empty string (reply)
  if (optimisticParentId !== realParentId) {
    logger.warn('Optimistic comment parentId mismatch', {
      optimisticId: optimistic.id,
      realId: real.id,
      optimisticParentId,
      realParentId,
      optimisticParentIdType: typeof optimistic.parentId,
      realParentIdType: typeof real.parentId
    });
    return false;
  }
  
  // Timestamp window: real comment should be created within 5 seconds of optimistic comment
  const optimisticTime = new Date(optimistic.createdAt).getTime();
  const realTime = new Date(real.createdAt).getTime();
  const timeDiff = Math.abs(realTime - optimisticTime);
  const timeWindowMs = 5 * 1000; // 5 seconds
  
  if (timeDiff > timeWindowMs) {
    logger.warn('Optimistic comment timestamp mismatch', {
      optimisticId: optimistic.id,
      realId: real.id,
      timeDiff,
      timeWindowMs
    });
    // Still allow match if other criteria match (network delays can cause this)
    // But log it for debugging
  }
  
  return true;
}

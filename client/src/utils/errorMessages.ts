/**
 * Error Message Utilities
 * Provides user-friendly error messages from API errors
 */

import { ApiError, NetworkError, AuthError, RateLimitError } from '../lib/api';

/**
 * Get a user-friendly error message from an error object
 * @param error - Error object (ApiError, NetworkError, or generic Error)
 * @param defaultMessage - Default message if error cannot be parsed
 * @returns User-friendly error message
 */
export function getUserFriendlyErrorMessage(error: unknown, defaultMessage: string = 'An error occurred'): string {
  // Handle ApiError instances
  if (error instanceof ApiError) {
    // Check for field-specific errors first
    if (error.hasFieldErrors()) {
      const fieldErrors = error.getFieldErrorsArray();
      if (fieldErrors.length === 1) {
        return fieldErrors[0].message;
      } else if (fieldErrors.length > 1) {
        return `Multiple errors: ${fieldErrors.map(e => e.message).join(', ')}`;
      }
    }
    
    // Use error message if available
    if (error.message) {
      return error.message;
    }
    
    // Fall back to code-based messages
    switch (error.code) {
      case 'VALIDATION_ERROR':
        return 'Please check your input and try again.';
      case 'DATABASE_ERROR':
      case 'CREATE_VOTE_FAILED':
        return 'A database error occurred. Please try again later.';
      case 'DATABASE_CONNECTION_LOST':
      case 'DATABASE_CONNECTION_ERROR': {
        // Check if error details indicate it's retryable
        const details = error.details as { retryable?: boolean; connectionIssue?: boolean } | undefined;
        if (details?.connectionIssue) {
          return error.message || 'Database connection lost. The system is attempting to reconnect. Please wait a moment and try again.';
        }
        return error.message || 'Database connection error. Please try again.';
      }
      case 'DATABASE_BUSY':
      case 'DATABASE_LOCKED':
        return 'The database is busy. Please try again in a moment.';
      case 'NOT_FOUND':
        return 'The requested resource was not found.';
      case 'FORBIDDEN':
        return 'You do not have permission to perform this action.';
      case 'PARTICIPATION_THRESHOLD_NOT_MET':
        return 'Participation threshold must be met before completing the vote. Wait for more votes.';
      case 'VOTING_CLOSED':
        return 'Voting has ended for this proposal.';
      default:
        return error.message || defaultMessage;
    }
  }
  
  // Handle NetworkError
  if (error instanceof NetworkError) {
    return error.message || 'Network error. Please check your internet connection and try again.';
  }
  
  // Handle AuthError
  if (error instanceof AuthError) {
    return 'Your session has expired. Please log in again.';
  }
  
  // Handle RateLimitError
  if (error instanceof RateLimitError) {
    const retryAfter = (error.details && typeof error.details === 'object' && 'retryAfter' in error.details)
      ? Number((error.details as { retryAfter?: number }).retryAfter)
      : null;
    
    if (retryAfter) {
      const minutes = Math.ceil(retryAfter / 60);
      return `Too many requests. Please wait ${minutes} minute${minutes !== 1 ? 's' : ''} before trying again.`;
    }
    return 'Too many requests. Please wait a moment before trying again.';
  }
  
  // Handle generic Error
  if (error instanceof Error) {
    // Filter out technical error messages in production
    const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';
    if (!isDevelopment && error.message.includes('Failed to fetch')) {
      return 'Unable to connect to the server. Please check your internet connection.';
    }
    return error.message;
  }
  
  // Handle error objects with message property
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  
  // Default fallback
  return defaultMessage;
}

/**
 * Get error message for document operations
 * @param errorCode - Error code from API
 * @param defaultMessage - Default message
 * @returns User-friendly error message
 */
export function getDocumentErrorMessage(errorCode: string | undefined, defaultMessage: string): string {
  if (!errorCode) return defaultMessage;
  
  const errorMessages: Record<string, string> = {
    'DOC_TITLE_REQUIRED': 'Document title is required.',
    'DOC_TITLE_TOO_LONG': 'Document title is too long (max 200 characters).',
    'DOC_ORG_ACCESS_DENIED': 'You do not have permission to create documents in this organization.',
    'DOC_ORG_MEMBERSHIP_REQUIRED': 'You must be a member of the organization to create documents.',
    'DOC_ORG_NOT_FOUND': 'Organization not found or you do not have access.',
    'DOC_DB_CONSTRAINT': 'A document with this name may already exist. Please choose a different name.',
    'DOC_DB_BUSY': 'The database is busy. Please try again in a moment.',
    'DOC_CREATION_FAILED': 'Failed to create document. Please try again.',
    'DOC_VALIDATION_ERROR': 'Invalid input. Please check all fields and try again.',
    'NOT_FOUND': 'Document not found.',
    'FORBIDDEN': 'You do not have permission to access this document.',
    'NOT_REPRESENTATIVE': 'Only representatives can close amendments.',
    'NOT_ACTIVE_MEMBER': 'You must be an active member to request amendments.',
    'AMENDMENTS_NOT_OPEN': 'Document is not open for amendments.',
    'DOCUMENT_NOT_AGREED': 'Only agreed documents can have amendments closed.',
    'ORGANIZATIONAL_REQUIRED': 'Only organizational documents support amendments.',
    'CLOSE_AMENDMENTS_FAILED': 'Failed to close amendments. Please try again.',
    'CREATE_VOTE_FAILED': 'Failed to create vote. Please try again or contact support.',
    'MISSING_TITLE': 'Vote title is required.',
    'MISSING_VOTE_TYPE': 'Vote type is required.',
    'INVALID_VOTE_TYPE': 'Invalid vote type.',
    'MISSING_TARGET_DOCUMENT': 'Target document is required for amendment requests.',
    'VOTING_NOT_ENABLED': 'Voting is not enabled for this organization.',
    'DUPLICATE_AMENDMENT_REQUEST': 'An amendment request is already pending for this document. Wait for the current vote to complete.',
  };
  
  return errorMessages[errorCode] || defaultMessage;
}

/**
 * Get error message for proposal operations
 * @param errorCode - Error code from API
 * @param defaultMessage - Default message
 * @returns User-friendly error message
 */
export function getProposalErrorMessage(errorCode: string | undefined, defaultMessage: string): string {
  if (!errorCode) return defaultMessage;
  
  const errorMessages: Record<string, string> = {
    'PROPOSAL_CUTOFF_PASSED': 'The proposal cutoff deadline has passed. New proposals are no longer accepted.',
    'STRUCTURE_PROPOSAL_ACTIVE': 'Cannot create proposals while a structure proposal is active.',
    'ACTIVE_PROPOSAL_EXISTS': 'There is already an active structure proposal for this document.',
    'OPERATION_CONFLICTS': 'The proposed operations conflict with each other. Please review your changes.',
    'PARAGRAPHS_NOT_FOUND': 'Some referenced paragraphs no longer exist. Please refresh and try again.',
    'DOCUMENT_FINALIZED': 'This document has been finalized and cannot be modified. Use the amendment process to propose changes.',
    'AMENDMENTS_NOT_OPEN': 'Document is not open for amendments. Request an organization vote to open it.',
    'DOCUMENT_IN_VOTING': 'This document is currently in voting. Please wait for voting to complete before proposing changes.',
    'VALIDATION_ERROR': 'Invalid proposal. Please check your input.',
    'NOT_FOUND': 'Proposal not found.',
    'FORBIDDEN': 'You do not have permission to create proposals for this document.',
  };
  
  return errorMessages[errorCode] || defaultMessage;
}

/**
 * Get error message for vote operations
 * @param errorCode - Error code from API
 * @param defaultMessage - Default message
 * @returns User-friendly error message
 */
export function getVoteErrorMessage(errorCode: string | undefined, defaultMessage: string): string {
  if (!errorCode) return defaultMessage;
  
  const errorMessages: Record<string, string> = {
    'VOTING_DEADLINE_PASSED': 'The voting deadline has passed. You can no longer vote on this document.',
    'VOTING_CLOSED': 'Voting has ended for this proposal.',
    'DELETION_VOTE_DEADLINE_PASSED': 'The deletion vote deadline has passed.',
    'VOTE_CLOSED': 'This vote is closed.',
    'VOTING_EXPIRED': 'The voting deadline has passed for this proposal.',
    'PARTICIPATION_THRESHOLD_NOT_MET': 'Participation threshold must be met before completing the vote. Wait for more votes.',
    'DOCUMENT_AGREED': 'This document has been agreed upon. Voting is no longer allowed.',
    'DOCUMENT_FINALIZED': 'This document has been finalized and cannot be modified. Use the amendment process to propose changes.',
    'AMENDMENTS_NOT_OPEN': 'Document is not open for amendments. Request an organization vote to open it.',
    'VOTE_LOCKED': 'Votes are locked for this document. You cannot change your vote.',
    'NOT_FOUND': 'Proposal or document not found.',
    'FORBIDDEN': 'You do not have permission to vote on this proposal.',
  };
  
  return errorMessages[errorCode] || defaultMessage;
}


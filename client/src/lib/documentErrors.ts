/**
 * Shared error code mapping for document creation and management
 * 
 * This file provides consistent error messages across all document-related UI components.
 * Error codes should match those defined in server/routes/documents.js ERROR_CODES.
 */

export const DOCUMENT_ERROR_CODE_MAP: Record<string, string> = {
  // Document creation errors
  'DOC_CREATION_FAILED': 'Failed to create document. Please check your permissions and try again.',
  'DOC_DB_ERROR': 'Database error occurred. Please try again in a moment.',
  'DOC_PARAGRAPH_ERROR': 'Failed to initialize document content. Please try again.',
  'DOC_COLLABORATOR_ERROR': 'Document created but failed to set up collaborators. The document may need to be edited manually.',
  'DOC_USER_ERROR': 'User account error. Please refresh the page and try again.',
  'DOC_VALIDATION_FAILED': 'Invalid input. Please check all fields and try again.',
  'DOC_ORG_ACCESS_DENIED': 'You do not have permission to create documents in this organization.',
  'DOC_ORG_ID_REQUIRED': 'Organization ID is required for organizational documents.',
  'DOC_ORG_ID_NOT_ALLOWED': 'Organization ID not allowed for non-organizational documents.',
  'DOC_ORG_MEMBERSHIP_REQUIRED': 'You must be a member of the organization to create documents.',
  'DOC_ORG_NOT_FOUND': 'Organization not found or you do not have access.',
  
  // Reference document errors
  'DOC_REFERENCE_REQUIRED': 'Reference document is required for this position type.',
  'DOC_REFERENCE_NOT_FOUND': 'Reference document not found. Please select a valid document.',
  'DOC_REFERENCE_ORG_MISMATCH': 'Reference document belongs to a different organization.',
  'DOC_REFERENCE_VALIDATION_ERROR': 'Failed to validate reference document.',
  'DOC_REFERENCE_INVALID_UUID': 'Reference document ID must be a valid UUID.',
  
  // Position type errors
  'DOC_POSITION_TYPE_INVALID': 'Position type must be one of: root, child, above_sibling, below_sibling.',
  
  // Generic validation errors
  'VALIDATION_ERROR': 'Validation failed. Please check your input.',
  'DATABASE_ERROR': 'Database error occurred. Please try again.',
};

/**
 * Get a user-friendly error message for a document error code
 * 
 * @param code - Error code from the backend
 * @param defaultMessage - Optional default message if code is not found
 * @returns User-friendly error message
 */
export function getDocumentErrorMessage(code: string, defaultMessage?: string): string {
  return DOCUMENT_ERROR_CODE_MAP[code] || defaultMessage || 'An error occurred while processing your request.';
}

/**
 * Extract field errors from an API error response
 * 
 * @param error - Error object from API call
 * @returns Record of field names to error messages
 */
export function extractFieldErrors(error: unknown): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  
  if (error && typeof error === 'object') {
    const errorObj = error as { details?: unknown; fieldErrors?: Record<string, string> };
    
    // Check for fieldErrors property (from ApiError)
    if (errorObj.fieldErrors) {
      Object.assign(fieldErrors, errorObj.fieldErrors);
    }
    
    // Check for details array (validation errors from backend)
    if (errorObj.details && Array.isArray(errorObj.details)) {
      errorObj.details.forEach((detail: { field?: string; message?: string; error?: string; msg?: string }) => {
        if (detail && typeof detail === 'object') {
          const field = detail.field;
          const message = detail.message || detail.msg || detail.error || 'Invalid value';
          
          if (field) {
            // Map field names to form field names (remove 'options.' prefix if present)
            let formField = field;
            if (field.startsWith('options.')) {
              formField = field.replace('options.', '');
            }
            fieldErrors[formField] = message;
          }
        }
      });
    }
  }
  
  return fieldErrors;
}


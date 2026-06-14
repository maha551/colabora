const { body, param, query, validationResult } = require('express-validator');
const xss = require('xss');
const { getUserId } = require('../utils/routeHelpers');

// Image upload validation constants
// Frontend validates original file size (5MB), backend validates base64-encoded size
// Base64 adds ~33% overhead, so 5MB original = ~6.67MB base64
// We allow 7MB base64 to provide a buffer for encoding variations
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB original file
const MAX_BASE64_SIZE_BYTES = 7000000; // ~7MB base64-encoded (accommodates 5MB original)
const MAX_URL_LENGTH = 2000; // Maximum length for HTTP/HTTPS image URLs

// XSS sanitization options - strip all HTML tags for security
const xssOptions = {
  whiteList: {}, // Strip all HTML tags
  stripIgnoreTag: true, // Strip tags that are not in whiteList
  stripIgnoreTagBody: ['script', 'style'], // Strip script and style tags completely
  onTagAttr: function(tag, name, value) {
    // Remove all event handlers and JavaScript URLs
    if (name.startsWith('on') || name === 'href' && value.startsWith('javascript:')) {
      return '';
    }
    return undefined; // Use default handling for other attributes
  }
};

// Handle validation errors
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const { ApiError } = require('./errorHandler');
    const { logger } = require('./logger');
    
    const errorDetails = errors.array().map(err => {
      // Build full field path for nested fields (e.g., "options.positionType")
      const fieldPath = err.path || err.param || 'unknown';
      const location = err.location || 'body';
      
      return {
        field: fieldPath,
        fieldPath: location === 'body' ? fieldPath : `${location}.${fieldPath}`, // Full path including location
        message: err.msg,
        reason: getValidationReason(err),
        expected: getExpectedFormat(err),
        received: sanitizeErrorValue(err.value),
        location: location,
        // Include nested errors if present
        nestedErrors: err.nestedErrors ? err.nestedErrors.map(nested => ({
          field: nested.path || nested.param || 'unknown',
          message: nested.msg,
          value: sanitizeErrorValue(nested.value)
        })) : undefined
      };
    });
    
    // Build comprehensive request body structure for logging (sanitized)
    const requestBodyStructure = {
      // Core fields
      title: req.body?.title ? (typeof req.body.title === 'string' ? req.body.title.substring(0, 100) : typeof req.body.title) : undefined,
      description: req.body?.description ? (typeof req.body.description === 'string' ? 'present' : typeof req.body.description) : undefined,
      ownershipType: req.body?.ownershipType || req.body?.ownership_type,
      organizationId: req.body?.organizationId || req.body?.organization_id,
      parentId: req.body?.parentId || req.body?.parent_id,
      creatorIds: req.body?.creatorIds || req.body?.creator_ids ? 
        (Array.isArray(req.body?.creatorIds || req.body?.creator_ids) ? 
          `array[${(req.body?.creatorIds || req.body?.creator_ids).length}]` : 
          typeof (req.body?.creatorIds || req.body?.creator_ids)) : 
        undefined,
      
      // Options structure
      hasOptions: !!req.body?.options,
      optionsType: req.body?.options ? typeof req.body.options : undefined,
      optionsKeys: req.body?.options && typeof req.body.options === 'object' ? Object.keys(req.body.options) : [],
      optionsStructure: req.body?.options && typeof req.body.options === 'object' ? 
        Object.entries(req.body.options).reduce((acc, [key, value]) => {
          // Sanitize values - show type and truncated strings
          if (typeof value === 'string') {
            acc[key] = value.length > 50 ? `${value.substring(0, 50)}...` : value;
          } else if (typeof value === 'object' && value !== null) {
            acc[key] = Array.isArray(value) ? `array[${value.length}]` : 'object';
          } else {
            acc[key] = value;
          }
          return acc;
        }, {}) : undefined,
      
      // Request metadata
      contentType: req.headers?.['content-type'],
      bodyKeys: req.body ? Object.keys(req.body) : []
    };
    
    // Log validation errors for debugging (sanitized)
    logger.warn('Validation failed', {
      endpoint: req.path,
      method: req.method,
      userId: getUserId(req, false) || 'anonymous',
      errors: errors.array().map(err => ({
        field: err.path || err.param || 'unknown',
        location: err.location || 'body',
        message: err.msg,
        value: sanitizeErrorValue(err.value),
        nestedErrors: err.nestedErrors ? err.nestedErrors.map(nested => ({
          field: nested.path || nested.param || 'unknown',
          message: nested.msg,
          value: sanitizeErrorValue(nested.value)
        })) : undefined
      })),
      requestBody: requestBodyStructure,
      // Include full error details for debugging
      errorCount: errors.array().length,
      errorSummary: errors.array().map(err => ({
        field: err.path || err.param || 'unknown',
        message: err.msg
      }))
    });
    
    const apiError = ApiError.validation(
      'Validation failed',
      { validationErrors: errorDetails },
      'VALIDATION_ERROR'
    );
    
    // Set request context if available
    const requestId = req.id || req.headers['x-request-id'] || require('uuid').v4();
    const userId = getUserId(req, false) || 'anonymous';
    apiError.setContext(requestId, userId);
    
    return res.status(400).json(apiError.toJSON());
  }
  next();
}

// Helper to determine validation failure reason
function getValidationReason(err) {
  const msg = err.msg.toLowerCase();
  if (msg.includes('required') || msg.includes('cannot be empty')) {
    return 'required_field_missing';
  }
  if (msg.includes('must be') || msg.includes('invalid')) {
    return 'invalid_format';
  }
  if (msg.includes('length') || msg.includes('characters')) {
    return 'length_constraint';
  }
  if (msg.includes('type') || msg.includes('must be a')) {
    return 'type_mismatch';
  }
  return 'validation_failed';
}

// Helper to get expected format from error message
function getExpectedFormat(err) {
  const msg = err.msg.toLowerCase();
  if (msg.includes('uuid')) {
    return 'UUID format (e.g., 550e8400-e29b-41d4-a716-446655440000)';
  }
  if (msg.includes('email')) {
    return 'Valid email address (e.g., user@example.com)';
  }
  if (msg.includes('integer') || msg.includes('int')) {
    return 'Integer number';
  }
  if (msg.includes('float') || msg.includes('number')) {
    return 'Number';
  }
  if (msg.includes('boolean')) {
    return 'Boolean (true or false)';
  }
  if (msg.includes('array')) {
    return 'Array';
  }
  if (msg.includes('must be one of') || msg.includes('must be either')) {
    // Extract enum values from message
    const enumMatch = msg.match(/must be (?:one of|either):?\s*([^\.]+)/i);
    if (enumMatch) {
      return `One of: ${enumMatch[1].trim()}`;
    }
  }
  if (msg.includes('between') && msg.includes('characters')) {
    const lengthMatch = msg.match(/between (\d+) and (\d+)/i);
    if (lengthMatch) {
      return `${lengthMatch[1]}-${lengthMatch[2]} characters`;
    }
  }
  return null;
}

// Helper to sanitize error values for security (prevent leaking sensitive data)
function sanitizeErrorValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    // Truncate long strings to prevent information leakage
    if (value.length > 100) {
      return value.substring(0, 100) + '...';
    }
    return value;
  }
  if (typeof value === 'object') {
    return '[Object]';
  }
  return value;
}

// Sanitize string inputs using xss library for comprehensive XSS protection
function sanitizeString(value) {
  // Handle non-string values
  if (typeof value !== 'string') return value;
  
  // Handle null, undefined, or empty strings
  if (value === null || value === undefined || value === '') return value;
  
  // Trim whitespace first
  const trimmed = value.trim();
  
  // Use xss library to sanitize HTML and prevent XSS attacks
  // This will strip all HTML tags and dangerous attributes
  return xss(trimmed, xssOptions);
}

// Validate that a field is not empty (handles null, undefined, empty strings, and whitespace-only strings)
function validateNotEmpty(value) {
  // Check for null or undefined
  if (value === null || value === undefined) {
    throw new Error('Field is required');
  }
  
  // Check for empty string or whitespace-only string
  if (typeof value === 'string' && value.trim().length === 0) {
    throw new Error('Field cannot be empty');
  }
  
  return true;
}

// Validate image data URL or HTTP/HTTPS URL
function validateImageUrl(value) {
  // Allow null, undefined, or empty string
  if (!value || value === '' || value === null) return true;
  // If value exists, must be a string
  if (typeof value !== 'string') return false;
  // Check length - allow up to 5MB images (base64 adds ~33% overhead)
  // For regular URLs, limit to 2000 characters
  if (value.startsWith('data:image/')) {
    if (value.length > MAX_BASE64_SIZE_BYTES) return false; // ~5MB image when base64-encoded
  } else if (value.startsWith('http://') || value.startsWith('https://')) {
    if (value.length > MAX_URL_LENGTH) return false;
  } else {
    return false;
  }
  return true;
}

// Validate IANA timezone identifier
// IANA timezones follow patterns like: Continent/City, UTC, GMT, etc.
// Examples: America/New_York, Europe/London, Asia/Tokyo, UTC, GMT+5
function validateTimezone(value) {
  if (!value || value === '' || value === null || value === undefined) return true; // Optional field
  if (typeof value !== 'string') return false;
  
  // IANA timezone format: typically "Continent/City" or "UTC" or "GMT[+-]offset"
  // Length check: IANA timezones are typically 3-50 characters
  if (value.length < 3 || value.length > 50) return false;
  
  // Basic format validation: allow alphanumeric, underscores, slashes, plus/minus, and spaces
  // This is a permissive check - actual validation happens in the browser's Intl API
  const timezonePattern = /^[A-Za-z0-9_\/\+\-\s]+$/;
  if (!timezonePattern.test(value)) return false;
  
  // Try to validate using Intl API if available (Node.js 13+)
  // This validates that the timezone is recognized by the system
  try {
    // Create a date formatter with the timezone to validate it
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: value });
    // Try to format a date to ensure the timezone is valid
    formatter.format(new Date());
    return true;
  } catch (e) {
    // If Intl.DateTimeFormat fails, the timezone is invalid
    // Return false to reject invalid timezones
    return false;
  }
}

// Validate user preferences object structure
function validatePreferences(value) {
  if (value === null || value === undefined) return true; // Optional field
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Preferences must be an object');
  }

  const { camelCaseKeys } = require('../utils/dataTransform');
  value = camelCaseKeys(value);
  
  // Validate known preference fields
  const allowedPreferenceKeys = ['backButtonPosition', 'fontFamily', 'timezone', 'timezoneVisibility', 'theme', 'locale'];
  const VALID_LOCALE_CODES = ['en', 'es', 'fr', 'de', 'ar', 'ru', 'zh', 'pt', 'hi', 'ja', 'id', 'tr', 'vi', 'ko', 'it', 'pl', 'nl', 'fa', 'ur'];
  const providedKeys = Object.keys(value);
  
  // Check for unknown keys (optional - could be strict or permissive)
  // For now, we'll be permissive but validate known keys
  for (const key of providedKeys) {
    if (!allowedPreferenceKeys.includes(key)) {
      // Log warning but don't reject - allows for future preference fields
      // Could be made strict if needed
    }
  }
  
  // Validate locale if present
  if (value.locale !== undefined && value.locale !== null) {
    const locale = typeof value.locale === 'string' ? value.locale.trim() : '';
    if (!locale || !VALID_LOCALE_CODES.includes(locale)) {
      throw new Error(`locale must be one of: ${VALID_LOCALE_CODES.join(', ')}`);
    }
  }
  
  // Validate theme if present
  if (value.theme !== undefined && value.theme !== null) {
    if (!['light', 'dark', 'system'].includes(value.theme)) {
      throw new Error('Invalid theme value. Must be one of: light, dark, system');
    }
  }
  
  // Validate timezone if present
  if (value.timezone !== undefined && value.timezone !== null) {
    if (!validateTimezone(value.timezone)) {
      throw new Error('Invalid timezone format. Must be a valid IANA timezone identifier (e.g., America/New_York, Europe/London)');
    }
  }
  
  // Validate backButtonPosition if present
  if (value.backButtonPosition !== undefined && value.backButtonPosition !== null) {
    if (!['left', 'right'].includes(value.backButtonPosition)) {
      throw new Error('backButtonPosition must be either "left" or "right"');
    }
  }
  
  // Validate fontFamily if present
  if (value.fontFamily !== undefined && value.fontFamily !== null) {
    if (!['inter', 'work-sans', 'poppins', 'merriweather'].includes(value.fontFamily)) {
      throw new Error('fontFamily must be one of: inter, work-sans, poppins, merriweather');
    }
  }

  if (value.timezoneVisibility !== undefined && value.timezoneVisibility !== null) {
    if (!['hidden', 'org_members'].includes(value.timezoneVisibility)) {
      throw new Error('timezoneVisibility must be either "hidden" or "org_members"');
    }
  }
  
  return true;
}

function validateProfileDataField(value) {
  if (value === null || value === undefined) return true;
  const { camelCaseKeys } = require('../utils/dataTransform');
  const { validateAndNormalizeProfileData } = require('../services/UserProfileService');
  validateAndNormalizeProfileData(camelCaseKeys(value));
  return true;
}

// User validation rules
const userValidation = {
  register: [
    body('name')
      .isLength({ min: 2, max: 50 })
      .withMessage('Name must be between 2 and 50 characters')
      .matches(/^[a-zA-Z\s]+$/)
      .withMessage('Name can only contain letters and spaces'),

    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email address'),

    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),

  // transformRequest converts body to snake_case before validation; booleans may become 1/0
    body('accepted_terms')
      .custom((value) => {
        const accepted = value === true || value === 1 || value === '1' || value === 'true';
        if (!accepted) {
          throw new Error('You must accept the Terms of use and acknowledge the Privacy policy');
        }
        return true;
      }),

    body('terms_version')
      .notEmpty()
      .withMessage('Terms version is required'),

    body('privacy_version')
      .notEmpty()
      .withMessage('Privacy version is required'),

    handleValidationErrors
  ],

  login: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email address'),

    body('password')
      .notEmpty()
      .withMessage('Password is required'),

    handleValidationErrors
  ],

  updateProfile: [
    body('name')
      .optional()
      .isLength({ min: 2, max: 50 })
      .withMessage('Name must be between 2 and 50 characters')
      .matches(/^[a-zA-Z\s]+$/)
      .withMessage('Name can only contain letters and spaces'),

    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email address'),

    body('bio')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Bio must be less than 500 characters'),

    body('avatar')
      .optional({ nullable: true, checkFalsy: true })
      .custom(validateImageUrl)
      .withMessage(`Avatar must be a valid data URL (max ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB image) or HTTP/HTTPS URL (max ${MAX_URL_LENGTH} characters)`),

    body('avatarUrl')
      .optional({ nullable: true, checkFalsy: true })
      .custom(validateImageUrl)
      .withMessage(`Avatar URL must be a valid data URL (max ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB image) or HTTP/HTTPS URL (max ${MAX_URL_LENGTH} characters)`),

    body('defaultHomeView')
      .optional()
      .isIn(['activity', 'organization'])
      .withMessage('Default home view must be either "activity" or "organization"'),

    body('preferences')
      .optional()
      .custom(validatePreferences)
      .withMessage('Invalid preferences format'),

    body('profileData')
      .optional()
      .custom(validateProfileDataField)
      .withMessage('Invalid profileData format'),

    body('profile_data')
      .optional()
      .custom(validateProfileDataField)
      .withMessage('Invalid profileData format'),

    handleValidationErrors
  ],

  changePassword: [
    // Handle both camelCase (from frontend) and snake_case (after transformRequest).
    body('currentPassword')
      .custom((value, { req }) => {
        const current = value || req.body.current_password;
        if (!current) {
          throw new Error('Current password is required');
        }
        req.body.currentPassword = current;
        req.body.current_password = current;
        return true;
      }),

    body('newPassword')
      .custom((value, { req }) => {
        const passwordValue = (value !== undefined && value !== null && value !== '')
          ? value
          : (req.body.new_password !== undefined && req.body.new_password !== null && req.body.new_password !== '')
            ? req.body.new_password
            : null;

        if (passwordValue !== null) {
          req.body.newPassword = passwordValue;
          req.body.new_password = passwordValue;
        }

        if (!passwordValue || passwordValue.length < 8) {
          throw new Error('Password must be at least 8 characters long');
        }
        if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(passwordValue)) {
          throw new Error('Password must contain at least one lowercase letter, one uppercase letter, and one number');
        }
        return true;
      }),

    // confirmPassword is optional; when provided it must match the new password.
    body('confirmPassword')
      .custom((value, { req }) => {
        const confirm = value !== undefined ? value : req.body.confirm_password;
        if (confirm === undefined || confirm === null || confirm === '') {
          return true;
        }
        const newPassword = req.body.newPassword || req.body.new_password;
        if (confirm !== newPassword) {
          throw new Error('Passwords do not match');
        }
        return true;
      }),

    handleValidationErrors
  ],

  forgotPassword: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email address'),

    handleValidationErrors
  ],

  resetPassword: [
    body('token')
      .notEmpty()
      .withMessage('Reset token is required'),

    // Handle both camelCase (from frontend) and snake_case (after transformation)
    body('newPassword')
      .custom((value, { req }) => {
        // Check both camelCase and snake_case
        const passwordValue = value !== undefined && value !== null && value !== ''
          ? value
          : (req.body.new_password !== undefined && req.body.new_password !== null && req.body.new_password !== '')
            ? req.body.new_password
            : null;
        
        // Update both field names in request body for consistency
        if (passwordValue !== null) {
          req.body.newPassword = passwordValue;
          req.body.new_password = passwordValue;
        }
        
        if (!passwordValue || passwordValue.length < 8) {
          throw new Error('Password must be at least 8 characters long');
        }
        
        if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(passwordValue)) {
          throw new Error('Password must contain at least one lowercase letter, one uppercase letter, and one number');
        }
        
        return true;
      }),

    body('confirmPassword')
      .custom((value, { req }) => {
        // Get password from either camelCase or snake_case
        const newPassword = req.body.newPassword || req.body.new_password;
        const confirmPasswordValue = value !== undefined && value !== null && value !== ''
          ? value
          : (req.body.confirm_password !== undefined && req.body.confirm_password !== null && req.body.confirm_password !== '')
            ? req.body.confirm_password
            : null;

        // confirmPassword is optional; only enforce a match when it is provided.
        if (confirmPasswordValue === null) {
          return true;
        }

        // Update both field names in request body for consistency
        req.body.confirmPassword = confirmPasswordValue;
        req.body.confirm_password = confirmPasswordValue;

        if (confirmPasswordValue !== newPassword) {
          throw new Error('Passwords do not match');
        }
        return true;
      }),

    handleValidationErrors
  ]
};

// Document validation rules
const documentValidation = {
  create: [
    body('title')
      .notEmpty()
      .withMessage('Title is required')
      .isString()
      .withMessage('Title must be a string')
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Title must be between 1 and 200 characters')
      .customSanitizer(sanitizeString),

    body('description')
      .optional()
      .isString()
      .withMessage('Description must be a string')
      .trim()
      .customSanitizer(sanitizeString),

    // transformRequest runs before validation; body is snake_case. Validate ownership_type.
    body('ownership_type')
      .customSanitizer((value, { req }) => {
        const ownershipTypeValue = value !== undefined && value !== null && value !== ''
          ? value
          : undefined;
        let normalized = (ownershipTypeValue === null || ownershipTypeValue === undefined || ownershipTypeValue === '')
          ? 'personal'
          : ownershipTypeValue;
        const organizationId = req.body.organization_id;
        if (organizationId && normalized !== 'organizational') {
          normalized = 'organizational';
        }
        req.body.ownershipType = normalized;
        req.body.ownership_type = normalized;
        return normalized;
      })
      .isString()
      .withMessage('Ownership type must be a string')
      .isIn(['personal', 'shared', 'organizational'])
      .withMessage('Ownership type must be one of: personal, shared, organizational'),

    body('organization_id')
      .custom((value, { req }) => {
        const organizationId = value !== undefined && value !== null && value !== ''
          ? value
          : undefined;
        const ownershipType = req.body.ownership_type || 'personal';
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        
        // If ownershipType is 'organizational', organizationId is required and must be valid UUID
        if (ownershipType === 'organizational') {
          if (organizationId === undefined || organizationId === null || organizationId === '') {
            throw new Error('Organization ID is required for organizational documents');
          }
          // Validate UUID format - check type first
          if (typeof organizationId !== 'string') {
            throw new Error('Organization ID must be a string');
          }
          const trimmedOrgId = organizationId.trim();
          if (!uuidRegex.test(trimmedOrgId)) {
            throw new Error('Organization ID must be a valid UUID');
          }
          // Update both field names in request body to ensure consistency
          req.body.organization_id = trimmedOrgId;
          req.body.organizationId = trimmedOrgId;
        } else if (organizationId !== undefined && organizationId !== null && organizationId !== '') {
          // Organization ID is not allowed for non-organizational documents
          throw new Error('Organization ID not allowed for non-organizational documents');
        }
        // If ownershipType is not 'organizational' and value is falsy, it's valid (field is optional)
        return true;
      }),

    body('owner_id')
      .optional()
      .custom((value, { req }) => {
        const ownershipType = req.body.ownership_type || 'personal';
        const organizationId = req.body.organization_id;
        
        if (ownershipType === 'organizational') {
          // For organizational documents, owner_id should equal organizationId (set by backend)
          // Frontend shouldn't send owner_id for org docs, but if it does, validate it matches
          if (value !== undefined && value !== null && value !== '' && value !== organizationId) {
            throw new Error('For organizational documents, owner_id must equal organizationId');
          }
        }
        return true;
      }),

    body('parent_id')
      .optional()
      .isUUID()
      .withMessage('Parent ID must be a valid UUID'),

    body('creator_ids')
      .custom((value, { req }) => {
        const ownershipType = req.body.ownership_type || 'personal';
        if (ownershipType === 'shared') {
          if (value !== undefined && value !== null) {
            if (!Array.isArray(value)) {
              throw new Error('Creator IDs must be an array');
            }
          }
        } else {
          if (value !== undefined && value !== null) {
            if (!Array.isArray(value)) {
              throw new Error('Creator IDs must be an array');
            }
          }
        }
        return true;
      })
      .bail()
      .withMessage('Creator IDs must be an array'),

    body('creator_ids.*')
      .optional()
      .isUUID()
      .withMessage('Each creator ID must be a valid UUID'),

    // Options validation - allow options object with any structure
    // Unknown fields will be ignored by backend, but known fields are validated
    body('options')
      .optional()
      .custom((value) => {
        // If options is provided, it should be an object (not array, not primitive)
        if (value !== undefined && value !== null && typeof value !== 'object') {
          throw new Error('Options must be an object');
        }
        // Allow any additional fields in options (they'll be ignored by backend if not recognized)
        return true;
      }),

    // Options validation for position-based document creation (body is snake_case after transform)
    body('options.position_type')
      .optional()
      .custom((value) => {
        if (value === undefined || value === null) {
          return true;
        }
        const validPositionTypes = ['root', 'child', 'above_sibling', 'below_sibling'];
        if (!validPositionTypes.includes(value)) {
          throw new Error('Position type must be one of: root, child, above_sibling, below_sibling');
        }
        return true;
      }),

    body('options.reference_document_id')
      .optional()
      .custom((value, { req }) => {
        const options = req.body?.options;
        const positionType = options && typeof options === 'object' ? options.position_type : undefined;
        
        // If options object doesn't exist or is not an object, skip validation
        // (This field is optional unless positionType requires it)
        if (!options || typeof options !== 'object') {
          return true; // Options not provided, skip validation
        }
        
        // If positionType is provided and is not 'root', referenceDocumentId is required
        if (positionType !== undefined && 
            positionType !== null && 
            positionType !== 'root' &&
            ['child', 'above_sibling', 'below_sibling'].includes(positionType)) {
          // Position type requires a reference document
          if (value === undefined || value === null || value === '') {
            throw new Error(
              `Reference document ID is required when position type is '${positionType}'. ` +
              `Please provide a reference document ID in options.reference_document_id.`
            );
          }
        }
        
        // If value is provided (regardless of positionType), validate UUID format
        if (value !== undefined && value !== null && value !== '') {
          if (typeof value !== 'string') {
            throw new Error('Reference document ID must be a string');
          }
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(value.trim())) {
            throw new Error(
              'Reference document ID must be a valid UUID format. ' +
              'Expected format: 550e8400-e29b-41d4-a716-446655440000'
            );
          }
        }
        
        return true;
      }),

    handleValidationErrors
  ],

  update: [
    body('title')
      .optional()
      .notEmpty()
      .withMessage('Title cannot be empty if provided')
      .isString()
      .withMessage('Title must be a string')
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Title must be between 1 and 200 characters')
      .customSanitizer(sanitizeString),

    handleValidationErrors
  ]
};

// Paragraph validation rules
const paragraphValidation = {
  create: [
    body('text')
      .optional()
      .isString()
      .withMessage('Text must be a string')
      .trim()
      .customSanitizer(sanitizeString),

    body('title')
      .optional()
      .isString()
      .withMessage('Title must be a string')
      .trim()
      .customSanitizer(sanitizeString),

    body('heading_level')
      .optional()
      .isString()
      .withMessage('Heading level must be a string')
      .isIn(['h1', 'h2', 'h3'])
      .withMessage('Heading level must be one of: h1, h2, h3'),

    // Custom validation: paragraph can have heading (title) and/or body (text), or both.
    // When title is present, headingLevel must be provided. Non-minutes use proposals for each part.
    body().custom((value) => {
      // Check if fields are provided (not undefined) and have content after trimming
      // Handle both camelCase and snake_case for backward compatibility
      const titleValue = value.title;
      const textValue = value.text;
      const headingLevelValue = value.heading_level || value.headingLevel;
      const asSuggestionValue = value.as_suggestion !== undefined ? value.as_suggestion : value.asSuggestion;
      const isSuggestion = asSuggestionValue == null || !!asSuggestionValue; // Default to true; handles both boolean false and numeric 0

      // Determine if fields have actual content (not undefined, not empty after trim)
      const hasTitle = titleValue !== undefined && 
                       titleValue !== null && 
                       typeof titleValue === 'string' && 
                       titleValue.trim().length > 0;
      const hasText = textValue !== undefined && 
                      textValue !== null && 
                      typeof textValue === 'string' && 
                      textValue.trim().length > 0;
      const hasHeadingLevel = headingLevelValue && ['h1', 'h2', 'h3'].includes(headingLevelValue);

      // If title is provided, headingLevel must be provided
      if (hasTitle && !hasHeadingLevel) {
        throw new Error('Heading level is required when title is provided.');
      }

      // If headingLevel is provided without title, that's invalid
      if (hasHeadingLevel && !hasTitle) {
        throw new Error('Title is required when heading level is provided.');
      }

      // For non-suggestions: must have at least one field with content
      if (!isSuggestion && !hasTitle && !hasText) {
        throw new Error('Paragraph must have either title (for headings) or text (for body paragraphs).');
      }

      // For suggestions: allow empty paragraphs (content goes in proposal)
      // BUT if content IS provided, validate it properly
      if (isSuggestion) {
        // If both fields are explicitly provided but empty, that's an error
        // (This handles the case where empty strings are sent)
        if ((titleValue !== undefined || textValue !== undefined) && !hasTitle && !hasText) {
          throw new Error('Either text or title is required for suggestions. If provided, they cannot be empty.');
        }
        // If one is provided, ensure it's valid
        if (hasTitle && !hasHeadingLevel) {
          throw new Error('Heading level is required when title is provided.');
        }
      }

      return true;
    }),

    // Accept either 'order' or 'order_index' (frontend sends 'order', backend accepts both)
    body('order')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Order must be a non-negative integer'),
    
    body('order_index')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Order index must be a non-negative integer'),
    // order/order_index are optional; when omitted, the paragraphs route computes MAX(order_index)+10 (append)

    handleValidationErrors
  ],

  update: [
    body('text')
      .optional()
      .isString()
      .withMessage('Text must be a string')
      .trim()
      .customSanitizer(sanitizeString),

    body('title')
      .optional()
      .isString()
      .withMessage('Title must be a string')
      .trim()
      .customSanitizer(sanitizeString),

    body('heading_level')
      .optional()
      .isString()
      .withMessage('Heading level must be a string')
      .isIn(['h1', 'h2', 'h3'])
      .withMessage('Heading level must be one of: h1, h2, h3'),

    // Custom validation: partial update allowed — set title and/or text without clearing the other
    body().custom((value) => {
      const headingLevelValue = value.heading_level || value.headingLevel;
      const hasTitle = value.title !== undefined && value.title !== null && value.title.trim().length > 0;
      const hasHeadingLevel = headingLevelValue && ['h1', 'h2', 'h3'].includes(
        typeof headingLevelValue === 'string' ? headingLevelValue.toLowerCase() : headingLevelValue
      );

      // If title is being set (non-empty), headingLevel must be provided
      if (hasTitle && !hasHeadingLevel) {
        throw new Error('Heading level is required when title is provided.');
      }

      // If headingLevel is being set without non-empty title, that's invalid
      if (hasHeadingLevel && !hasTitle) {
        const titleEmpty = value.title === undefined || value.title === null || (typeof value.title === 'string' && value.title.trim().length === 0);
        if (titleEmpty) {
          throw new Error('Title is required when heading level is provided.');
        }
      }

      return true;
    }),

    handleValidationErrors
  ]
};

// Proposal validation rules
const proposalValidation = {
  create: [
    body('text')
      .notEmpty()
      .withMessage('Proposal text is required')
      .isString()
      .withMessage('Proposal text must be a string')
      .trim()
      .isLength({ min: 1, max: 5000 })
      .withMessage('Proposal text must be between 1 and 5000 characters')
      .customSanitizer(sanitizeString),

    body('type')
      .notEmpty()
      .withMessage('Type is required')
      .isString()
      .withMessage('Type must be a string')
      .isIn(['BODY', 'TITLE'])
      .withMessage('Type must be one of: BODY, TITLE'),

    body('heading_level')
      .optional()
      .isString()
      .withMessage('Heading level must be a string')
      .isIn(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
      .withMessage('Heading level must be one of: h1, h2, h3, h4, h5, h6'),

    handleValidationErrors
  ]
};

// Vote validation rules
const voteValidation = {
  create: [
    body('vote')
      .notEmpty()
      .withMessage('Vote is required')
      .isString()
      .withMessage('Vote must be a string')
      .isIn(['PRO', 'NEUTRAL', 'CONTRA'])
      .withMessage('Vote must be one of: PRO, NEUTRAL, CONTRA'),

    handleValidationErrors
  ]
};

// Comment validation rules
const commentValidation = {
  create: [
    body('text')
      .notEmpty()
      .withMessage('Comment text is required')
      .isString()
      .withMessage('Comment text must be a string')
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Comment must be between 1 and 1000 characters')
      .customSanitizer(sanitizeString),

    // Validate parent_id (after transformRequest converts parentId to parent_id)
    // Note: transformRequest middleware runs before validation, so we validate snake_case
    body('parent_id')
      .optional({ nullable: true, checkFalsy: false })
      .custom((value) => {
        if (value !== undefined && value !== null && value !== '') {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(value)) {
            throw new Error('parent_id must be a valid UUID');
          }
        }
        return true;
      }),

    handleValidationErrors
  ],

  update: [
    body('text')
      .notEmpty()
      .withMessage('Comment text is required')
      .isString()
      .withMessage('Comment text must be a string')
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Comment must be between 1 and 1000 characters')
      .customSanitizer(sanitizeString),

    handleValidationErrors
  ]
};

// Parameter validation
const paramValidation = {
  documentId: [
    param('documentId')
      .isUUID()
      .withMessage('Invalid document ID format'),

    handleValidationErrors
  ],

  paragraphId: [
    param('paragraphId')
      .isUUID()
      .withMessage('Invalid paragraph ID format'),

    handleValidationErrors
  ],

  proposalId: [
    param('proposalId')
      .isUUID()
      .withMessage('Invalid proposal ID format'),

    handleValidationErrors
  ],

  userId: [
    param('userId')
      .isUUID()
      .withMessage('Invalid user ID format'),

    handleValidationErrors
  ],

  organizationId: [
    param('organizationId')
      .isUUID()
      .withMessage('Invalid organization ID format'),

    handleValidationErrors
  ],

  repId: [
    param('repId')
      .isUUID()
      .withMessage('Invalid representative ID format'),

    handleValidationErrors
  ],

  memberUserId: [
    param('memberUserId')
      .isUUID()
      .withMessage('Invalid member user ID format'),

    handleValidationErrors
  ],

  meetingId: [
    param('meetingId')
      .isUUID()
      .withMessage('Invalid meeting ID format'),

    handleValidationErrors
  ],

  voteId: [
    param('voteId')
      .isUUID()
      .withMessage('Invalid vote ID format'),

    handleValidationErrors
  ],

  agendaItemId: [
    param('itemId')
      .isUUID()
      .withMessage('Invalid agenda item ID format'),

    handleValidationErrors
  ],

  todoId: [
    param('todoId')
      .isUUID()
      .withMessage('Invalid to-do ID format'),

    handleValidationErrors
  ]
};

// Organization validation rules
const organizationValidation = {
  create: [
    body('name')
      .notEmpty()
      .withMessage('Organization name is required')
      .isString()
      .withMessage('Organization name must be a string')
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Organization name must be between 1 and 200 characters')
      .customSanitizer(sanitizeString),

    body('description')
      .optional()
      .isString()
      .withMessage('Description must be a string')
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description must be less than 1000 characters')
      .customSanitizer(sanitizeString),

    body('representatives')
      .notEmpty()
      .withMessage('Representatives are required')
      .isArray({ min: 1, max: 10 })
      .withMessage('Representatives must be an array with 1-10 members'),

    body('representatives.*')
      .isUUID()
      .withMessage('Each representative must be a valid UUID'),

    body('membershipPolicy')
      .optional()
      .isString()
      .withMessage('Membership policy must be a string')
      .isIn(['open', 'invitation'])
      .withMessage('Membership policy must be one of: open, invitation'),

    body('votingEnabled')
      .optional()
      .isBoolean()
      .withMessage('Voting enabled must be a boolean'),

    body('votingThreshold')
      .optional()
      .isFloat({ min: 0.1, max: 1.0 })
      .withMessage('Voting threshold must be a number between 0.1 and 1.0'),

    handleValidationErrors
  ],

  update: [
    body('name')
      .optional()
      .notEmpty()
      .withMessage('Organization name cannot be empty if provided')
      .isString()
      .withMessage('Organization name must be a string')
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Organization name must be between 1 and 200 characters')
      .customSanitizer(sanitizeString),

    body('description')
      .optional()
      .isString()
      .withMessage('Description must be a string')
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description must be less than 1000 characters')
      .customSanitizer(sanitizeString),

    body('membershipPolicy')
      .optional()
      .isString()
      .withMessage('Membership policy must be a string')
      .isIn(['open', 'invitation'])
      .withMessage('Membership policy must be one of: open, invitation'),

    body('votingThreshold')
      .optional()
      .isFloat({ min: 0.1, max: 1.0 })
      .withMessage('Voting threshold must be a number between 0.1 and 1.0'),

    body('brandingColor')
      .optional()
      .matches(/^#[0-9A-Fa-f]{6}$/)
      .withMessage('Branding color must be a valid hex color code (e.g., #3B82F6)'),

    body('brandingLogoUrl')
      .optional({ nullable: true, checkFalsy: true })
      .custom(validateImageUrl)
      .withMessage(`Logo URL must be a valid data URL (max ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB image) or HTTP/HTTPS URL (max ${MAX_URL_LENGTH} characters)`),

    body('brandingBannerUrl')
      .optional({ nullable: true, checkFalsy: true })
      .custom(validateImageUrl)
      .withMessage(`Banner URL must be a valid data URL (max ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB image) or HTTP/HTTPS URL (max ${MAX_URL_LENGTH} characters)`),

    body('brandingTitle')
      .optional({ nullable: true, checkFalsy: true })
      .isLength({ max: 100 })
      .withMessage('Branding title must be less than 100 characters')
      .customSanitizer((value) => {
        if (!value || value === null || value === '') return null;
        return sanitizeString(value);
      }),

    body('iconSet')
      .optional({ nullable: true, checkFalsy: true })
      .isIn(['lucide', 'tabler', 'heroicons'])
      .withMessage('Icon set must be one of: lucide, tabler, heroicons'),

    body('fontFamily')
      .optional({ nullable: true, checkFalsy: true })
      .isIn(['inter', 'work-sans', 'poppins', 'merriweather'])
      .withMessage('Font family must be one of: inter, work-sans, poppins, merriweather'),

    handleValidationErrors
  ],

  nominateRepresentative: [
    body('newRepresentativeId')
      .isUUID()
      .withMessage('Representative ID must be a valid UUID'),

    handleValidationErrors
  ],

  addMember: [
    // transformRequest converts body to snake_case; validate whichever key is present
    body('userId')
      .optional()
      .isUUID()
      .withMessage('User ID must be a valid UUID'),
    body('user_id')
      .optional()
      .isUUID()
      .withMessage('User ID must be a valid UUID'),
    body()
      .custom((_, { req }) => {
        const id = req.body.userId ?? req.body.user_id;
        if (!id) throw new Error('userId or user_id is required');
        return true;
      }),
    handleValidationErrors
  ],

  declineVote: [
    body('reason')
      .trim()
      .notEmpty()
      .withMessage('Reason is required')
      .isLength({ min: 1, max: 2000 })
      .withMessage('Reason must be between 1 and 2000 characters')
      .customSanitizer(sanitizeString),
    handleValidationErrors
  ],

  inviteMembers: [
    body('emails')
      .isArray({ min: 1 })
      .withMessage('Emails must be a non-empty array'),

    body('emails.*')
      .isEmail()
      .normalizeEmail()
      .withMessage('Each email must be a valid email address'),

    handleValidationErrors
  ],

  adminCreate: [
    // Base fields - same as create but with admin-specific constraints
    body('name')
      .notEmpty()
      .withMessage('Organization name is required')
      .isString()
      .withMessage('Organization name must be a string')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Organization name must be between 2 and 100 characters')
      .customSanitizer(sanitizeString),

    body('description')
      .optional()
      .isString()
      .withMessage('Description must be a string')
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters')
      .customSanitizer(sanitizeString),

    // Admin can use either representatives (user IDs) or representativeEmails
    body('representatives')
      .optional()
      .isArray()
      .withMessage('Representatives must be an array'),

    body('representatives.*')
      .optional()
      .isUUID()
      .withMessage('Each representative must be a valid UUID'),

    body('representativeEmails')
      .optional()
      .isArray()
      .withMessage('Representative emails must be an array'),

    body('representativeEmails.*')
      .optional()
      .customSanitizer((value) => {
        // Normalize email: trim and lowercase, but preserve original if invalid
        if (typeof value === 'string') {
          return value.trim().toLowerCase();
        }
        return value;
      })
      .custom((value) => {
        // Skip validation if value is empty/null/undefined (let route handler filter)
        if (!value || typeof value !== 'string' || value.trim().length === 0) {
          return true;
        }
        // Validate email format - use same regex as client
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          throw new Error('Each email must be a valid email address');
        }
        return true;
      }),

    // Set defaults for membershipPolicy and votingThreshold if missing or null
    // Use customSanitizer FIRST to set defaults before validation
    body('membershipPolicy')
      .customSanitizer((value) => {
        // Set default if missing, null, or empty string
        if (value === null || value === undefined || value === '') {
          return 'invitation';
        }
        return value;
      })
      .notEmpty()
      .withMessage('Membership policy is required')
      .isString()
      .withMessage('Membership policy must be a string')
      .isIn(['open', 'invitation'])
      .withMessage('Membership policy must be one of: open, invitation'),

    body('votingThreshold')
      .customSanitizer((value) => {
        // Set default if missing or null
        if (value === null || value === undefined) {
          return 0.75;
        }
        // Convert string numbers to actual numbers
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        return isNaN(numValue) ? 0.75 : numValue;
      })
      .notEmpty()
      .withMessage('Voting threshold is required')
      .isFloat({ min: 0, max: 1 })
      .withMessage('Voting threshold must be a number between 0 and 1'),

    // Governance rules (admin-specific)
    body('governanceRules')
      .optional()
      .isObject()
      .withMessage('Governance rules must be an object'),

    body('governanceRules.representativeTermMonths')
      .optional()
      .isInt({ min: 1, max: 120 })
      .withMessage('Representative term months must be an integer between 1 and 120'),

    body('governanceRules.electionVotingMethod')
      .optional()
      .isString()
      .withMessage('Election voting method must be a string')
      .isIn(['simple_majority', 'ranked_choice', 'approval'])
      .withMessage('Election voting method must be one of: simple_majority, ranked_choice, approval'),

    body('governanceRules.electionQuorumPercentage')
      .optional()
      .isFloat({ min: 0, max: 1 })
      .withMessage('Election quorum percentage must be a number between 0 and 1'),

    body('governanceRules.defaultVotingDeadlineHours')
      .optional()
      .isInt({ min: 1, max: 720 })
      .withMessage('Default voting deadline hours must be an integer between 1 and 720'),

    body('governanceRules.documentProposalPeriodDays')
      .optional()
      .isInt({ min: 1, max: 3650 })
      .withMessage('Document proposal period days must be an integer between 1 and 3650'),

    body('governanceRules.paragraphProposalCutoffDays')
      .optional()
      .isInt({ min: 0, max: 365 })
      .withMessage('Paragraph proposal cutoff days must be an integer between 0 and 365'),

    handleValidationErrors
  ]
};

// Query parameter validation
const queryValidation = {
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),

    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),

    handleValidationErrors
  ],

  search: [
    query('q')
      .notEmpty()
      .withMessage('Search query is required')
      .isString()
      .withMessage('Search query must be a string')
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage('Search query must be between 1 and 500 characters'),

    query('types')
      .optional()
      .isString()
      .withMessage('Types must be a comma-separated string')
      .custom((value) => {
        const allowed = new Set(['document', 'paragraph', 'meeting']);
        const parts = String(value).split(',').map((t) => t.trim().toLowerCase());
        if (parts.some((t) => !allowed.has(t))) {
          throw new Error('Types must be a comma-separated list of: document, paragraph, meeting');
        }
        return true;
      }),

    query('documentId')
      .optional()
      .isUUID()
      .withMessage('Document ID must be a valid UUID'),

    query('organizationId')
      .optional()
      .isUUID()
      .withMessage('Organization ID must be a valid UUID'),

    query('status')
      .optional()
      .isString()
      .withMessage('Status must be a string')
      .isIn(['draft', 'proposal', 'voting', 'agreed', 'rejected'])
      .withMessage('Status must be one of: draft, proposal, voting, agreed, rejected'),

    query('dateFrom')
      .optional()
      .isISO8601()
      .withMessage('Date from must be a valid ISO 8601 date'),

    query('dateTo')
      .optional()
      .isISO8601()
      .withMessage('Date to must be a valid ISO 8601 date'),

    query('authorId')
      .optional()
      .isUUID()
      .withMessage('Author ID must be a valid UUID'),

    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),

    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer'),

    handleValidationErrors
  ],

  searchSuggestions: [
    query('q')
      .optional()
      .isString()
      .withMessage('Search query must be a string')
      .trim()
      .isLength({ max: 500 })
      .withMessage('Search query must be at most 500 characters'),

    query('organizationId')
      .optional()
      .isUUID()
      .withMessage('Organization ID must be a valid UUID'),

    handleValidationErrors
  ]
};

// Error report validation rules
const errorReportValidation = {
  create: [
    body('title')
      .notEmpty()
      .withMessage('Title is required')
      .isString()
      .withMessage('Title must be a string')
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Title must be between 1 and 200 characters')
      .customSanitizer(sanitizeString),

    body('description')
      .notEmpty()
      .withMessage('Description is required')
      .isString()
      .withMessage('Description must be a string')
      .trim()
      .isLength({ min: 1, max: 5000 })
      .withMessage('Description must be between 1 and 5000 characters')
      .customSanitizer(sanitizeString),

    body('url')
      .optional({ checkFalsy: true })
      // Error reports legitimately originate from localhost/dev URLs, so do not
      // require a public TLD.
      .isURL({ require_tld: false })
      .withMessage('URL must be a valid URL'),

    handleValidationErrors
  ],

  update: [
    body('status')
      .optional()
      .isString()
      .withMessage('Status must be a string')
      .isIn(['new', 'in_progress', 'resolved', 'dismissed'])
      .withMessage('Status must be one of: new, in_progress, resolved, dismissed'),

    body('priority')
      .optional()
      .isString()
      .withMessage('Priority must be a string')
      .isIn(['low', 'medium', 'high', 'critical'])
      .withMessage('Priority must be one of: low, medium, high, critical'),

    body('assigned_to')
      .optional({ nullable: true, checkFalsy: true })
      .isUUID()
      .withMessage('Assigned to must be a valid UUID'),

    body('resolution_notes')
      .optional()
      .isString()
      .withMessage('Resolution notes must be a string')
      .trim()
      .isLength({ max: 2000 })
      .withMessage('Resolution notes must be less than 2000 characters')
      .customSanitizer(sanitizeString),

    handleValidationErrors
  ]
};

/**
 * Middleware to validate update field names against whitelist
 * Prevents SQL injection by ensuring only allowed fields can be updated
 * @param {string} tableName - Name of the table to validate against
 * @param {Object} fieldMapping - Optional mapping from request field names to DB field names
 * @returns {Function} Express middleware function
 */
function validateUpdateFields(tableName, fieldMapping = {}) {
  return (req, res, next) => {
    try {
      const { validateFieldNames, getFieldWhitelist, buildUpdateFields } = require('../utils/fieldValidation');
      const allowedFields = getFieldWhitelist(tableName);
      
      // Get fields from request body
      const bodyFields = Object.keys(req.body).filter(key => req.body[key] !== undefined);
      
      if (bodyFields.length === 0) {
        return next(); // No fields to validate
      }
      
      // Apply field mapping if provided
      const dbFields = bodyFields.map(field => fieldMapping[field] || field);
      
      // Validate field names
      validateFieldNames(dbFields, allowedFields);
      
      // Store validated fields in request for use in route handler
      req.validatedUpdateFields = buildUpdateFields(req.body, allowedFields, fieldMapping);
      
      next();
    } catch (error) {
      // If it's an ApiError, pass it through
      if (error.statusCode) {
        return res.status(error.statusCode).json(error.toJSON());
      }
      // Otherwise, return validation error
      return res.status(400).json({
        error: 'Validation failed',
        details: error.message
      });
    }
  };
}

// Structure proposal validation
// Note: transformRequest middleware runs before validation, so we validate snake_case
const structureProposalValidation = {
  create: [
    body('title')
      .trim()
      .notEmpty().withMessage('Title is required')
      .isLength({ min: 3, max: 200 }).withMessage('Title must be between 3 and 200 characters')
      .customSanitizer(value => xss(value, xssOptions)),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 2000 }).withMessage('Description must be less than 2000 characters')
      .customSanitizer(value => value ? xss(value, xssOptions) : value),
    body('operations')
      .isArray({ min: 1 }).withMessage('Operations array is required and must contain at least one operation')
      .custom((operations) => {
        if (!Array.isArray(operations)) {
          throw new Error('Operations must be an array');
        }
        if (operations.length === 0) {
          throw new Error('At least one operation is required');
        }
        if (operations.length > 100) {
          throw new Error('Maximum 100 operations allowed per proposal');
        }
        return true;
      }),
    body('operations.*.operation_type')
      .isIn(['MOVE', 'MERGE', 'DELETE', 'RENAME_HEADING', 'CHANGE_HEADING_LEVEL', 'INSERT_NEW'])
      .withMessage('Invalid operation type. SPLIT is not yet implemented.'),
    body('operations.*.target_paragraph_id')
      .optional()
      .trim()
      .isUUID().withMessage('target_paragraph_id must be a valid UUID'),
    body('operations.*.source_paragraph_ids')
      .optional()
      .isArray().withMessage('source_paragraph_ids must be an array')
      .custom((ids) => {
        if (ids && ids.length > 50) {
          throw new Error('Maximum 50 source paragraphs allowed per merge operation');
        }
        return true;
      }),
    body('operations.*.new_position_index')
      .optional()
      .isInt({ min: 0, max: 10000 }).withMessage('new_position_index must be between 0 and 10000'),
    body('operations.*.new_text')
      .optional()
      .trim()
      .isLength({ max: 10000 }).withMessage('new_text must be less than 10000 characters')
      .customSanitizer(value => value ? xss(value, xssOptions) : value),
    body('operations.*.new_heading_level')
      .optional()
      .isIn(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']).withMessage('new_heading_level must be h1-h6'),
    handleValidationErrors
  ],
  vote: [
    body('vote')
      .isIn(['PRO', 'NEUTRAL', 'CONTRA']).withMessage('Vote must be PRO, NEUTRAL, or CONTRA'),
    handleValidationErrors
  ],
  comment: [
    body('text')
      .trim()
      .notEmpty().withMessage('Comment text is required')
      .isLength({ min: 1, max: 2000 }).withMessage('Comment must be between 1 and 2000 characters')
      .customSanitizer(value => xss(value, xssOptions)),
    body('parent_id')
      .optional()
      .trim()
      .isUUID().withMessage('parent_id must be a valid UUID'),
    handleValidationErrors
  ]
};

const contactValidation = {
  create: [
    body('name')
      .notEmpty()
      .withMessage('Name is required')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Name must be between 1 and 100 characters')
      .customSanitizer(sanitizeString),

    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email address'),

    body('subject')
      .notEmpty()
      .withMessage('Subject is required')
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Subject must be between 1 and 200 characters')
      .customSanitizer(sanitizeString),

    body('message')
      .notEmpty()
      .withMessage('Message is required')
      .isString()
      .trim()
      .isLength({ min: 1, max: 5000 })
      .withMessage('Message must be between 1 and 5000 characters')
      .customSanitizer(sanitizeString),

    body('website')
      .optional({ values: 'null' })
      .isString()
      .trim(),

    handleValidationErrors
  ]
};

module.exports = {
  handleValidationErrors,
  sanitizeString,
  userValidation,
  documentValidation,
  paragraphValidation,
  proposalValidation,
  voteValidation,
  commentValidation,
  organizationValidation,
  errorReportValidation,
  contactValidation,
  paramValidation,
  queryValidation,
  structureProposalValidation,
  validateUpdateFields
};

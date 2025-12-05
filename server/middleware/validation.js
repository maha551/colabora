const { body, param, query, validationResult } = require('express-validator');

// Handle validation errors
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
}

// Sanitize string inputs
function sanitizeString(value) {
  if (typeof value !== 'string') return value;
  return value.trim().replace(/[<>]/g, '');
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

    handleValidationErrors
  ]
};

// Document validation rules
const documentValidation = {
  create: [
    body('title')
      .isLength({ min: 1, max: 200 })
      .withMessage('Title must be between 1 and 200 characters')
      .customSanitizer(sanitizeString),

    handleValidationErrors
  ],

  update: [
    body('title')
      .optional()
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
      .isLength({ min: 1, max: 10000 })
      .withMessage('Text must be between 1 and 10000 characters')
      .customSanitizer(sanitizeString),

    body('heading_level')
      .optional()
      .isIn(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
      .withMessage('Invalid heading level'),

    body('order_index')
      .isInt({ min: 0 })
      .withMessage('Order index must be a non-negative integer'),

    handleValidationErrors
  ],

  update: [
    body('text')
      .optional()
      .isLength({ min: 1, max: 10000 })
      .withMessage('Text must be between 1 and 10000 characters')
      .customSanitizer(sanitizeString),

    body('heading_level')
      .optional()
      .isIn(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
      .withMessage('Invalid heading level'),

    handleValidationErrors
  ]
};

// Proposal validation rules
const proposalValidation = {
  create: [
    body('text')
      .isLength({ min: 1, max: 5000 })
      .withMessage('Proposal text must be between 1 and 5000 characters')
      .customSanitizer(sanitizeString),

    body('type')
      .isIn(['BODY', 'TITLE'])
      .withMessage('Type must be either BODY or TITLE'),

    body('heading_level')
      .optional()
      .isIn(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
      .withMessage('Invalid heading level'),

    handleValidationErrors
  ]
};

// Vote validation rules
const voteValidation = {
  create: [
    body('vote')
      .isIn(['PRO', 'NEUTRAL', 'CONTRA'])
      .withMessage('Vote must be PRO, NEUTRAL, or CONTRA'),

    handleValidationErrors
  ]
};

// Comment validation rules
const commentValidation = {
  create: [
    body('text')
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
  ]
};

// Organization validation rules
const organizationValidation = {
  create: [
    body('name')
      .isLength({ min: 1, max: 200 })
      .withMessage('Organization name must be between 1 and 200 characters')
      .customSanitizer(sanitizeString),

    body('description')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Description must be less than 1000 characters')
      .customSanitizer(sanitizeString),

    body('representatives')
      .isArray({ min: 3, max: 10 })
      .withMessage('Representatives must be an array with 3-10 members'),

    body('representatives.*')
      .isUUID()
      .withMessage('Each representative must be a valid UUID'),

    body('membershipPolicy')
      .optional()
      .isIn(['open', 'invitation'])
      .withMessage('Membership policy must be either "open" or "invitation"'),

    body('votingEnabled')
      .optional()
      .isBoolean()
      .withMessage('Voting enabled must be a boolean'),

    body('votingThreshold')
      .optional()
      .isFloat({ min: 0.1, max: 1.0 })
      .withMessage('Voting threshold must be between 0.1 and 1.0'),

    handleValidationErrors
  ],

  update: [
    body('name')
      .optional()
      .isLength({ min: 1, max: 200 })
      .withMessage('Organization name must be between 1 and 200 characters')
      .customSanitizer(sanitizeString),

    body('description')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Description must be less than 1000 characters')
      .customSanitizer(sanitizeString),

    body('membershipPolicy')
      .optional()
      .isIn(['open', 'invitation'])
      .withMessage('Membership policy must be either "open" or "invitation"'),

    body('votingThreshold')
      .optional()
      .isFloat({ min: 0.1, max: 1.0 })
      .withMessage('Voting threshold must be between 0.1 and 1.0'),

    body('brandingColor')
      .optional()
      .matches(/^#[0-9A-Fa-f]{6}$/)
      .withMessage('Branding color must be a valid hex color code (e.g., #3B82F6)'),

    body('brandingLogoUrl')
      .optional({ nullable: true, checkFalsy: true })
      .custom((value) => {
        // Allow null, undefined, or empty string
        if (!value || value === '' || value === null) return true;
        // If value exists, must be a string
        if (typeof value !== 'string') return false;
        // Check length - allow up to 5MB images (base64 adds ~33% overhead, so ~6.67MB = ~6,670,000 chars)
        // For regular URLs, limit to 2000 characters
        if (value.startsWith('data:image/')) {
          if (value.length > 7000000) return false; // ~5MB image when base64-encoded
        } else if (value.startsWith('http://') || value.startsWith('https://')) {
          if (value.length > 2000) return false;
        } else {
          return false;
        }
        return true;
      })
      .withMessage('Logo URL must be a valid data URL (max 5MB image) or HTTP/HTTPS URL (max 2000 characters)'),

    body('brandingTitle')
      .optional({ nullable: true, checkFalsy: true })
      .isLength({ max: 100 })
      .withMessage('Branding title must be less than 100 characters')
      .customSanitizer((value) => {
        if (!value || value === null || value === '') return null;
        return sanitizeString(value);
      }),

    handleValidationErrors
  ],

  nominateRepresentative: [
    body('newRepresentativeId')
      .isUUID()
      .withMessage('Representative ID must be a valid UUID'),

    handleValidationErrors
  ],

  addMember: [
    body('userId')
      .isUUID()
      .withMessage('User ID must be a valid UUID'),

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
  paramValidation,
  queryValidation
};

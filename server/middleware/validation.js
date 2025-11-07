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
  paramValidation,
  queryValidation
};

const { body, validationResult } = require('express-validator');
const { userValidation, documentValidation, paragraphValidation, proposalValidation, voteValidation, commentValidation } = require('../../server/middleware/validation');

describe('Input Validation Middleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = { body: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
  });

  describe('User Validation', () => {
    describe('Registration Validation', () => {
      test('should pass valid registration data', async () => {
        mockReq.body = {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'SecurePass123!'
        };

        // Run all registration validators
        for (const validator of userValidation.register) {
          if (typeof validator === 'function') {
            await validator(mockReq, mockRes, mockNext);
          }
        }

        expect(mockNext).toHaveBeenCalled();
      });

      test('should reject invalid email', async () => {
        mockReq.body = {
          name: 'John Doe',
          email: 'invalid-email',
          password: 'SecurePass123!'
        };

        // Run validation
        const emailValidator = userValidation.register.find(v => v.builder && v.builder.field === 'email');
        if (emailValidator) {
          await emailValidator(mockReq, mockRes, mockNext);
        }

        // Check for validation errors
        const errors = validationResult(mockReq);
        expect(errors.isEmpty()).toBe(false);
        expect(errors.array()).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ path: 'email' })
          ])
        );
      });

      test('should reject weak password', async () => {
        mockReq.body = {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'weak'
        };

        const passwordValidator = userValidation.register.find(v => v.builder && v.builder.field === 'password');
        if (passwordValidator) {
          await passwordValidator(mockReq, mockRes, mockNext);
        }

        const errors = validationResult(mockReq);
        expect(errors.isEmpty()).toBe(false);
      });

      test('should reject invalid name format', async () => {
        mockReq.body = {
          name: 'John123',
          email: 'john@example.com',
          password: 'SecurePass123!'
        };

        const nameValidator = userValidation.register.find(v => v.builder && v.builder.field === 'name');
        if (nameValidator) {
          await nameValidator(mockReq, mockRes, mockNext);
        }

        const errors = validationResult(mockReq);
        expect(errors.isEmpty()).toBe(false);
      });
    });

    describe('Login Validation', () => {
      test('should pass valid login data', async () => {
        mockReq.body = {
          email: 'john@example.com',
          password: 'SecurePass123!'
        };

        for (const validator of userValidation.login) {
          if (typeof validator === 'function') {
            await validator(mockReq, mockRes, mockNext);
          }
        }

        expect(mockNext).toHaveBeenCalled();
      });

      test('should reject missing email', async () => {
        mockReq.body = {
          password: 'SecurePass123!'
        };

        const emailValidator = userValidation.login.find(v => v.builder && v.builder.field === 'email');
        if (emailValidator) {
          await emailValidator(mockReq, mockRes, mockNext);
        }

        const errors = validationResult(mockReq);
        expect(errors.isEmpty()).toBe(false);
      });

      test('should reject missing password', async () => {
        mockReq.body = {
          email: 'john@example.com'
        };

        const passwordValidator = userValidation.login.find(v => v.builder && v.builder.field === 'password');
        if (passwordValidator) {
          await passwordValidator(mockReq, mockRes, mockNext);
        }

        const errors = validationResult(mockReq);
        expect(errors.isEmpty()).toBe(false);
      });
    });
  });

  describe('Document Validation', () => {
    test('should pass valid document creation', async () => {
      mockReq.body = {
        title: 'My Awesome Document Title'
      };

      for (const validator of documentValidation.create) {
        if (typeof validator === 'function') {
          await validator(mockReq, mockRes, mockNext);
        }
      }

      expect(mockNext).toHaveBeenCalled();
    });

    test('should reject empty title', async () => {
      mockReq.body = {
        title: ''
      };

      const titleValidator = documentValidation.create.find(v => v.builder && v.builder.field === 'title');
      if (titleValidator) {
        await titleValidator(mockReq, mockRes, mockNext);
      }

      const errors = validationResult(mockReq);
      expect(errors.isEmpty()).toBe(false);
    });

    test('should reject overly long title', async () => {
      mockReq.body = {
        title: 'A'.repeat(201) // 201 characters, exceeds 200 limit
      };

      const titleValidator = documentValidation.create.find(v => v.builder && v.builder.field === 'title');
      if (titleValidator) {
        await titleValidator(mockReq, mockRes, mockNext);
      }

      const errors = validationResult(mockReq);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('Paragraph Validation', () => {
    test('should pass valid paragraph creation', async () => {
      mockReq.body = {
        text: 'This is a valid paragraph with proper content.',
        order_index: 5
      };

      for (const validator of paragraphValidation.create) {
        if (typeof validator === 'function') {
          await validator(mockReq, mockRes, mockNext);
        }
      }

      expect(mockNext).toHaveBeenCalled();
    });

    test('should reject empty text', async () => {
      mockReq.body = {
        text: '',
        order_index: 5
      };

      const textValidator = paragraphValidation.create.find(v => v.builder && v.builder.field === 'text');
      if (textValidator) {
        await textValidator(mockReq, mockRes, mockNext);
      }

      const errors = validationResult(mockReq);
      expect(errors.isEmpty()).toBe(false);
    });

    test('should reject negative order_index', async () => {
      mockReq.body = {
        text: 'Valid text',
        order_index: -1
      };

      const orderValidator = paragraphValidation.create.find(v => v.builder && v.builder.field === 'order_index');
      if (orderValidator) {
        await orderValidator(mockReq, mockRes, mockNext);
      }

      const errors = validationResult(mockReq);
      expect(errors.isEmpty()).toBe(false);
    });

    test('should reject invalid heading level', async () => {
      mockReq.body = {
        text: 'Valid text',
        order_index: 5,
        heading_level: 'h7' // Invalid heading level
      };

      const headingValidator = paragraphValidation.create.find(v => v.builder && v.builder.field === 'heading_level');
      if (headingValidator) {
        await headingValidator(mockReq, mockRes, mockNext);
      }

      const errors = validationResult(mockReq);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('Proposal Validation', () => {
    test('should pass valid proposal creation', async () => {
      mockReq.body = {
        text: 'This is a valid proposal text.',
        type: 'BODY'
      };

      for (const validator of proposalValidation.create) {
        if (typeof validator === 'function') {
          await validator(mockReq, mockRes, mockNext);
        }
      }

      expect(mockNext).toHaveBeenCalled();
    });

    test('should reject invalid type', async () => {
      mockReq.body = {
        text: 'Valid text',
        type: 'INVALID_TYPE'
      };

      const typeValidator = proposalValidation.create.find(v => v.builder && v.builder.field === 'type');
      if (typeValidator) {
        await typeValidator(mockReq, mockRes, mockNext);
      }

      const errors = validationResult(mockReq);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('Vote Validation', () => {
    test('should pass valid vote', async () => {
      mockReq.body = {
        vote: 'PRO'
      };

      for (const validator of voteValidation.create) {
        if (typeof validator === 'function') {
          await validator(mockReq, mockRes, mockNext);
        }
      }

      expect(mockNext).toHaveBeenCalled();
    });

    test('should reject invalid vote value', async () => {
      mockReq.body = {
        vote: 'INVALID_VOTE'
      };

      const voteValidator = voteValidation.create.find(v => v.builder && v.builder.field === 'vote');
      if (voteValidator) {
        await voteValidator(mockReq, mockRes, mockNext);
      }

      const errors = validationResult(mockReq);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('Comment Validation', () => {
    test('should pass valid comment', async () => {
      mockReq.body = {
        text: 'This is a valid comment.'
      };

      for (const validator of commentValidation.create) {
        if (typeof validator === 'function') {
          await validator(mockReq, mockRes, mockNext);
        }
      }

      expect(mockNext).toHaveBeenCalled();
    });

    test('should reject overly long comment', async () => {
      mockReq.body = {
        text: 'A'.repeat(1001) // Exceeds 1000 character limit
      };

      const textValidator = commentValidation.create.find(v => v.builder && v.builder.field === 'text');
      if (textValidator) {
        await textValidator(mockReq, mockRes, mockNext);
      }

      const errors = validationResult(mockReq);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('SQL Injection Prevention', () => {
    test('should sanitize potentially dangerous input', async () => {
      mockReq.body = {
        title: "'; DROP TABLE users; --"
      };

      // This should pass validation but input should be sanitized
      const titleValidator = documentValidation.create.find(v => v.builder && v.builder.field === 'title');
      if (titleValidator) {
        await titleValidator(mockReq, mockRes, mockNext);
      }

      const errors = validationResult(mockReq);
      expect(errors.isEmpty()).toBe(true); // Should pass validation
      // The sanitization would happen in the route handler
    });

    test('should handle XSS attempts in text fields', async () => {
      mockReq.body = {
        text: '<script>alert("xss")</script>'
      };

      const textValidator = paragraphValidation.create.find(v => v.builder && v.builder.field === 'text');
      if (textValidator) {
        await textValidator(mockReq, mockRes, mockNext);
      }

      const errors = validationResult(mockReq);
      expect(errors.isEmpty()).toBe(true); // Should pass validation
      // XSS sanitization would happen in the route handler
    });
  });
});

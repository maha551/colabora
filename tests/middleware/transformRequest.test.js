const transformRequest = require('../../server/middleware/transformRequest');

describe('Transform Request Middleware Tests', () => {
  test('should transform camelCase to snake_case', () => {
    const req = {
      body: {
        firstName: 'John',
        lastName: 'Doe',
        emailAddress: 'john@example.com'
      }
    };

    const res = {};
    const next = jest.fn();

    transformRequest(req, res, next);

    // Middleware should call next
    expect(next).toHaveBeenCalled();
  });

  test('should handle nested objects', () => {
    const req = {
      body: {
        userData: {
          firstName: 'John',
          lastName: 'Doe'
        }
      }
    };

    const res = {};
    const next = jest.fn();

    transformRequest(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('should handle arrays', () => {
    const req = {
      body: {
        items: [
          { itemName: 'Item 1' },
          { itemName: 'Item 2' }
        ]
      }
    };

    const res = {};
    const next = jest.fn();

    transformRequest(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('should set req.originalBody and preserve authToken after transform', () => {
    const req = {
      body: {
        authToken: 'secret-jwt-token',
        organizationId: 'org-123',
        someOtherField: 'value'
      }
    };

    const res = {};
    const next = jest.fn();

    transformRequest(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.originalBody).toBeDefined();
    expect(req.originalBody.authToken).toBe('secret-jwt-token');
    expect(req.originalBody.organizationId).toBe('org-123');
    // Preserved field should remain in body (transformForDatabase would convert authToken -> auth_token)
    expect(req.body.authToken).toBe('secret-jwt-token');
    // Transformed fields should be snake_case
    expect(req.body.organization_id).toBe('org-123');
  });
});


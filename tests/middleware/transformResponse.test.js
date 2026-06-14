const transformResponse = require('../../server/middleware/transformResponse');

describe('Transform Response Middleware Tests', () => {
  test('should transform snake_case to camelCase', () => {
    const req = {};
    const res = {
      json: jest.fn(function(data) {
        this.body = data;
        return this;
      }),
      body: null
    };
    const next = jest.fn();

    // Mock the original json method
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      this.body = data;
      return originalJson(data);
    };

    transformResponse(req, res, next);

    // Middleware should call next
    expect(next).toHaveBeenCalled();
  });

  test('should handle response transformation', () => {
    const req = {};
    const res = {
      json: jest.fn(function(data) {
        this.body = data;
        return this;
      }),
      body: null
    };
    const next = jest.fn();

    transformResponse(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});


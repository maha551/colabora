const { ApiError, asyncHandler } = require('../../server/middleware/errorHandler');

describe('Error Handler Middleware Tests', () => {
  test('should create ApiError with message', () => {
    const error = new ApiError(400, 'Test error');
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Test error');
  });

  test('should create ApiError with code', () => {
    const error = new ApiError(404, 'Not found', 'NOT_FOUND');
    expect(error.code).toBe('NOT_FOUND');
  });

  test('should create notFound error', () => {
    const error = ApiError.notFound('Resource');
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Resource not found');
  });

  test('should create forbidden error', () => {
    const error = ApiError.forbidden('Access denied');
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('Access denied');
  });

  test('should create validation error', () => {
    const error = ApiError.validation('Invalid input', { field: 'email' });
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual({ field: 'email' });
  });

  test('asyncHandler should catch async errors', async () => {
    const asyncFn = async () => {
      throw new Error('Async error');
    };

    const wrapped = asyncHandler(asyncFn);

    const req = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    wrapped(req, res, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Async error' }));
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  test('asyncHandler should pass through successful requests', async () => {
    const asyncFn = async (req, res, next) => {
      res.json({ success: true });
    };

    const wrapped = asyncHandler(asyncFn);
    
    const req = {};
    const res = {
      json: jest.fn()
    };
    const next = jest.fn();

    await wrapped(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});


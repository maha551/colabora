/** Minimal env for client-unit tests that import server modules (config.js requires these). */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/colabora_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-characters';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

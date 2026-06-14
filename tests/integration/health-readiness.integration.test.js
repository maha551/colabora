const request = require('supertest');
const { startApplication } = require('../../server/bootstrap');

describe('Health readiness endpoints', () => {
  let server;
  let app;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    server = await startApplication({ port: 3041, returnServer: true });
    app = server.app;
  });

  afterAll(async () => {
    if (server && typeof server.close === 'function') {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('liveness endpoint always returns 200', async () => {
    const res = await request(app).get('/api/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('alive');
  });

  test('readiness endpoint returns 200 when dependencies are ready', async () => {
    const res = await request(app).get('/api/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  test('readiness endpoint returns 503 when database is unavailable', async () => {
    const originalDb = app.locals.db;
    const originalDbAvailable = app.locals.dbAvailable;

    app.locals.db = null;
    app.locals.dbAvailable = false;

    const res = await request(app).get('/api/health/ready');
    expect(res.status).toBe(503);
    expect(['degraded', 'starting']).toContain(res.body.status);

    app.locals.db = originalDb;
    app.locals.dbAvailable = originalDbAvailable;
  });
});

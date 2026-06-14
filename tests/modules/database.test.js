const { getTestKnex } = require('../utils/db-cleanup');
const { safeDeleteTestDatabase } = require('../utils/test-helpers');

/**
 * Uses the shared test Knex pool only. Full DatabaseManager lifecycle tests were removed
 * to avoid a second connection pool per suite (parallel Jest workers × pools exhausts PostgreSQL).
 */
describe('Database Module Tests', () => {
  beforeAll(async () => {
    await safeDeleteTestDatabase();
  });

  afterAll(async () => {
    await safeDeleteTestDatabase();
  });

  test('shared test Knex can run a query', async () => {
    const knex = getTestKnex();
    const res = await knex.raw('SELECT 1 AS ok');
    const row = res.rows?.[0] ?? res[0];
    expect(row.ok == null ? row.ok : Number(row.ok)).toBe(1);
  });
});

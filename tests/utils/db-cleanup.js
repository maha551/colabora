/**
 * PostgreSQL test schema utilities.
 */

const path = require('path');
const knexFactory = require('knex');
const { ensureSystemUser } = require('../../server/database/ensureSystemUser');

const MIGRATIONS_DIR = path.join(__dirname, '../../knex/migrations');
// Serialize migrations across Jest workers (shared public functions/triggers).
const MIGRATION_ADVISORY_LOCK_ID = 0x434f4c41;

let knexInstance = null;
let cachedSchemaName = null;
const schemaReadyPromises = new Map();

function schemaSetupLockId(schemaName) {
  let hash = 5381;
  for (let i = 0; i < schemaName.length; i += 1) {
    hash = ((hash << 5) + hash + schemaName.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
}

function getPoolMax() {
  const parsed = parseInt(process.env.PG_POOL_MAX, 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : 10;
}

async function withAdvisoryLock(lockId, fn) {
  const lockKnex = knexFactory({
    client: 'pg',
    connection: getBaseDatabaseUrl(),
    pool: { min: 0, max: 1 }
  });

  try {
    await lockKnex.raw('SELECT pg_advisory_lock(?)', [lockId]);
    return await fn();
  } finally {
    try {
      await lockKnex.raw('SELECT pg_advisory_unlock(?)', [lockId]);
    } catch {
      // Ignore unlock errors during teardown.
    }
    await lockKnex.destroy();
  }
}

async function withMigrationLock(fn) {
  return withAdvisoryLock(MIGRATION_ADVISORY_LOCK_ID, fn);
}

async function withSchemaSetupLock(schemaName, fn) {
  return withAdvisoryLock(schemaSetupLockId(schemaName), fn);
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function getBaseDatabaseUrl() {
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/colabora_test';
  if (!url) {
    throw new Error('DATABASE_URL or TEST_DATABASE_URL must be set for test execution.');
  }
  if (!/^postgres(ql)?:\/\//i.test(url)) {
    throw new Error(`Expected PostgreSQL DATABASE_URL, received "${url}".`);
  }
  return url;
}

function getWorkerSchemaName() {
  if (cachedSchemaName) {
    return cachedSchemaName;
  }

  const explicitSchema = process.env.TEST_DB_SCHEMA;
  const workerId = process.env.JEST_WORKER_ID || '1';
  cachedSchemaName = explicitSchema || `test_w${workerId}`;
  return cachedSchemaName;
}

function buildKnexConfig(schemaName = getWorkerSchemaName()) {
  return {
    client: 'pg',
    connection: getBaseDatabaseUrl(),
    searchPath: [schemaName, 'public'],
    pool: {
      min: 0,
      max: getPoolMax(),
      idleTimeoutMillis: 1000
    }
  };
}

function withWorkerSchemaInUrl(baseUrl, schemaName = getWorkerSchemaName()) {
  const effectiveBaseUrl = baseUrl || getBaseDatabaseUrl();
  const url = new URL(effectiveBaseUrl);
  const existingOptions = url.searchParams.get('options');
  const searchPathOption = `-c search_path=${schemaName},public`;
  url.searchParams.set('options', existingOptions ? `${existingOptions} ${searchPathOption}` : searchPathOption);
  return url.toString();
}

function getTestKnex() {
  if (!knexInstance) {
    knexInstance = knexFactory(buildKnexConfig());
  }
  return knexInstance;
}

async function closeTestKnex() {
  if (knexInstance) {
    await knexInstance.destroy();
    knexInstance = null;
  }
}

async function recreateTestSchema(schemaName = getWorkerSchemaName()) {
  const adminKnex = knexFactory({
    client: 'pg',
    connection: getBaseDatabaseUrl(),
    pool: { min: 0, max: 1 }
  });

  try {
    const schemaSql = quoteIdentifier(schemaName);
    await adminKnex.raw(`DROP SCHEMA IF EXISTS ${schemaSql} CASCADE`);
    await adminKnex.raw(`CREATE SCHEMA ${schemaSql}`);
  } finally {
    await adminKnex.destroy();
  }
}

async function runMigrationsForSchema(schemaName = getWorkerSchemaName()) {
  await withMigrationLock(async () => {
    const migrationKnex = knexFactory({
      ...buildKnexConfig(schemaName),
      migrations: {
        directory: MIGRATIONS_DIR,
        tableName: 'knex_migrations',
        schemaName
      }
    });

    try {
      await migrationKnex.migrate.latest();
    } finally {
      await migrationKnex.destroy();
    }
  });
}

async function schemaExists(schemaName = getWorkerSchemaName()) {
  const adminKnex = knexFactory({
    client: 'pg',
    connection: getBaseDatabaseUrl(),
    pool: { min: 0, max: 1 }
  });

  try {
    const result = await adminKnex.raw(
      'SELECT 1 FROM information_schema.schemata WHERE schema_name = ?',
      [schemaName]
    );
    return (result.rows || []).length > 0;
  } finally {
    await adminKnex.destroy();
  }
}

async function resetTestSchema(schemaName = getWorkerSchemaName()) {
  await ensureWorkerSchemaReady(schemaName);

  const knex = getTestKnex();
  const rows = await knex('information_schema.tables')
    .select('table_name')
    .where({ table_schema: schemaName, table_type: 'BASE TABLE' });

  const tableNames = rows
    .map((row) => row.table_name)
    .filter((name) => name !== 'knex_migrations' && name !== 'knex_migrations_lock');

  if (tableNames.length === 0) {
    return;
  }

  const qualified = tableNames
    .map((name) => `${quoteIdentifier(schemaName)}.${quoteIdentifier(name)}`)
    .join(', ');

  await knex.raw(`TRUNCATE TABLE ${qualified} RESTART IDENTITY CASCADE`);
  await ensureSystemUser(knex);
}

async function ensureWorkerSchemaReady(schemaName = getWorkerSchemaName()) {
  if (!schemaReadyPromises.has(schemaName)) {
    const readyPromise = withSchemaSetupLock(schemaName, async () => {
      await recreateTestSchema(schemaName);
      await runMigrationsForSchema(schemaName);
      await ensureSystemUser(getTestKnex());
    }).catch((error) => {
      schemaReadyPromises.delete(schemaName);
      throw error;
    });
    schemaReadyPromises.set(schemaName, readyPromise);
  }

  return schemaReadyPromises.get(schemaName);
}

/**
 * Compatibility shim for older SQLite-based tests.
 */
async function safeDeleteDatabase() {
  await resetTestSchema();
}

async function cleanupTestDatabases() {
  await resetTestSchema();
}

module.exports = {
  getTestKnex,
  closeTestKnex,
  getWorkerSchemaName,
  withWorkerSchemaInUrl,
  buildKnexConfig,
  recreateTestSchema,
  runMigrationsForSchema,
  resetTestSchema,
  ensureWorkerSchemaReady,
  safeDeleteDatabase,
  cleanupTestDatabases
};


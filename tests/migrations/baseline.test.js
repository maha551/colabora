const { getTestKnex, getWorkerSchemaName } = require('../utils/db-cleanup');

/** Worker-specific schema names (Jest parallel workers) must not appear in snapshots. */
function baselineSnapshotPayload(baseline, schemaName) {
  const escaped = schemaName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const schemaInDef = new RegExp(`\\b${escaped}\\.`, 'g');
  return {
    tables: baseline.tables,
    columns: baseline.columns,
    indexes: baseline.indexes.map((row) => ({
      table: row.table,
      name: row.name,
      definition: row.definition.replace(schemaInDef, '<worker_schema>.')
    }))
  };
}

describe('baseline schema drift', () => {
  test('matches expected PostgreSQL schema baseline', async () => {
    const knex = getTestKnex();
    const schemaName = getWorkerSchemaName();

    const tables = await knex('information_schema.tables')
      .select('table_name')
      .where({
        table_schema: schemaName,
        table_type: 'BASE TABLE'
      })
      .orderBy('table_name');

    const columns = await knex('information_schema.columns')
      .select('table_name', 'column_name', 'data_type', 'is_nullable', 'column_default')
      .where({ table_schema: schemaName })
      .orderBy([{ column: 'table_name' }, { column: 'ordinal_position' }]);

    const indexes = await knex('pg_indexes')
      .select('tablename', 'indexname', 'indexdef')
      .where({ schemaname: schemaName })
      .orderBy([{ column: 'tablename' }, { column: 'indexname' }]);

    const baseline = {
      schema: schemaName,
      tables: tables.map((row) => row.table_name),
      columns: columns.map((row) => ({
        table: row.table_name,
        column: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable,
        default: row.column_default
      })),
      indexes: indexes.map((row) => ({
        table: row.tablename,
        name: row.indexname,
        definition: row.indexdef
      }))
    };

    expect(baselineSnapshotPayload(baseline, schemaName)).toMatchSnapshot();
  });
});

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(repoRoot, 'knex', 'source_schema.sql');
const migrationPath = path.join(repoRoot, 'knex', 'migrations', '001_initial_schema.js');

const raw = fs.readFileSync(sourcePath, 'utf8');
const normalized = raw
  .replace(/^--.*$/gm, '')
  .replace(/^\\(un)?restrict.*$/gm, '')
  .replace(/^SELECT pg_catalog\.set_config\('search_path', '', false\);$/gm, '')
  .replace(/^\s*$/gm, '')
  .trim();

const migration = `/**
 * Phase 1 baseline migration generated from current bootstrap schema.
 * Source: pg_dump --schema-only --no-owner --no-privileges --no-comments
 */

exports.up = async function up(knex) {
  await knex.raw(String.raw\`${normalized.replace(/`/g, '\\`')}\`);
};

exports.down = async function down(knex) {
  await knex.raw('DROP SCHEMA IF EXISTS public CASCADE;');
  await knex.raw('CREATE SCHEMA public;');
};
`;

fs.writeFileSync(migrationPath, migration);
console.log(`Wrote baseline migration to ${migrationPath}`);

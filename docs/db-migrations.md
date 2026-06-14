# Database Migrations (PostgreSQL)

This project uses PostgreSQL-first migrations with Knex.

## Local setup

1. Copy environment template and install dependencies:
   - `cp .env.example .env`
   - `npm install`
2. Start local PostgreSQL:
   - `npm run db:up`
3. Apply all pending migrations:
   - `npm run db:migrate`
4. Stop local PostgreSQL when done:
   - `npm run db:down`

## Migration workflow

Use this sequence for every schema change:

1. Generate a migration file:
   - `npm run db:make -- <migration_name>`
2. Edit the generated migration in `knex/migrations`.
3. Apply it locally:
   - `npm run db:migrate`
4. Validate application behavior.
5. If needed, rollback latest migration:
   - `npm run db:rollback`

## Reset and recovery commands

- Reset all local migrations:
  - `npm run db:reset`
- Re-apply latest migrations:
  - `npm run db:migrate`

## Production notes

- Default production host decision is documented in `docs/runbooks/db-host.md`.
- Keep restore drill procedure and run history in `docs/runbooks/db-restore-drill.md`.
- Admin setup is explicit and separate from migrations; run `npm run setup-admin` after migrations when provisioning an environment with no admin.

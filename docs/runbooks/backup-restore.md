# Backup and Restore Runbook

## Purpose
Define a safe, repeatable backup and restore process for PostgreSQL environments used by Colabora.

## Recovery Objectives
- **RPO**: 24 hours (maximum tolerated data loss between snapshots).
- **RTO**: 60 minutes (maximum tolerated service restore time).

## Prerequisites
- PostgreSQL client tools installed (`pg_dump`, `psql`).
- `DATABASE_URL` for the target environment.
- Access to encrypted backup storage location.

## Create Backup
Example command:

```bash
mkdir -p backups
pg_dump "$DATABASE_URL" --format=plain --no-owner --no-privileges | gzip > "backups/colabora-$(date +%F-%H%M%S).sql.gz"
```

## Restore (Safe by Default)
Use `scripts/db/restore-from-backup.sh`.

Dry-run (default, no data modified):

```bash
scripts/db/restore-from-backup.sh --backup backups/colabora-latest.sql.gz
```

Execute restore (non-production):

```bash
scripts/db/restore-from-backup.sh --backup backups/colabora-latest.sql.gz --execute
```

Execute restore against production-like target (explicit opt-in required):

```bash
scripts/db/restore-from-backup.sh --backup backups/colabora-latest.sql.gz --execute --allow-production
```

## Verify Restore
Run verification checks:

```bash
scripts/db/verify-restore.sh --database-url "$DATABASE_URL" --min-tables 5
```

Expected:
- DB connectivity succeeds.
- Public schema table count is above threshold.
- Core tables (`users`, `organizations`, `documents`) are present or explicitly reported.

## Monthly Restore Drill
Frequency: once per month.

Checklist:
1. Restore latest backup into an isolated non-production PostgreSQL instance.
2. Run `scripts/db/verify-restore.sh`.
3. Run app migrations with `npm run db:migrate`.
4. Run smoke checks (`npm test` or selected health checks).
5. Record elapsed recovery time and issues in operations notes.

Success criteria:
- Recovery completes within **RTO 60 min**.
- Backup age at restore time stays within **RPO 24 hours**.
- Verification script reports pass.

## Rollback / Abort Guidance
- If restore fails, stop and investigate SQL errors before retrying.
- Never rerun restore into production without explicit change approval.
- Keep failed restore logs for incident review.

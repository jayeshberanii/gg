# @gglib/db

Kysely table types for the **legacy SQL Server database** that the desktop app
(`GGLibrarySolution`) also uses. The schema is owned by the desktop app. This package only
describes it.

## Regenerating

```bash
DATABASE_URL='Server=<host>,1433;Database=DBLibSQLTest;User Id=<user>;Password=<pwd>;TrustServerCertificate=true' \
  pnpm --filter @gglib/db codegen
```

Point codegen at a development copy: a local restore of `DBLibSQL` (how the current
`src/schema.ts` was generated) or `DBLibSQLTest`. Never point it at production. Commit the
regenerated `src/schema.ts`. See `docs/database.md` for what the introspection found.

## Rules

- Never ALTER or DROP an existing table or column: the desktop app is still live on it.
- New web-only state goes in new `web_*` tables, added by the SQL scripts in
  `apps/api/db/migrations/`.

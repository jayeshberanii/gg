# gglib-web

The web version of the GGLibrary desktop app (`GGLibrarySolution`). It runs on the
**same SQL Server database** as the desktop app, so both can be used side by side while
screens are migrated.

| Package           | What it is                                                          |
| ----------------- | ------------------------------------------------------------------- |
| `apps/api`        | NestJS 12 REST API (ESM), Kysely + tedious on SQL Server, zod, pino |
| `apps/web`        | Next.js 16 static export, React 19, Tailwind v4                     |
| `packages/shared` | zod schemas and types used by both apps                             |
| `packages/db`     | Kysely table types generated from the legacy DB                     |

## Getting started

Requires Node 22+ (Node 24 in Docker and CI) and pnpm via corepack
(`corepack enable`).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # point at a DBLibSQL dev copy
cp apps/web/.env.example apps/web/.env
pnpm --filter @gglib/shared --filter @gglib/db build
pnpm dev                                  # api on :8080, web on :3000
```

`GET http://localhost:8080/api/health` reports whether the API can reach SQL Server.

If the shared test server isn't reachable, run SQL Server locally with
`MSSQL_SA_PASSWORD=... docker compose up -d mssql` and restore a DBLibSQLTest backup into it.

## Checks

```bash
pnpm lint && pnpm type-check && pnpm test
```

These run on pre-commit (husky + lint-staged) and in GitLab CI.

`pnpm test` also runs **integration tests against the real legacy DB** when
`apps/api/.env` exists (they are skipped otherwise, e.g. in CI). Each test runs inside a
transaction that is rolled back, so no data changes.

### Browser tests

```bash
pnpm --filter @gglib/web test:e2e     # needs apps/api/.env; first run: pnpm exec playwright install chromium
```

Playwright builds the web app and starts `apps/api/test/e2e-server.mjs`: the real API on the
real DB, with every request inside **one** SQL transaction that is rolled back on exit
(the connection dropping rolls it back too). It seeds its own users, so no real account or
password is needed. Never point it at production: it holds locks for the length of the run.

## Rules for the shared database

- The desktop app owns the schema. **Never ALTER or DROP an existing table or column.**
- Web-only state goes in new `web_*` tables, created by SQL scripts in
  `apps/api/db/migrations/`.
- Writes set the same audit columns the desktop sets (`enuser`, `endate`, `moduser`,
  `moddate`) and respect its `Locked` flag.
- Only parameterised SQL. ESLint rejects `sql.raw()`.

## Migrating a screen

One screen per GitLab issue and branch (`<issue#>-<slug>` off `develop`). Start with a
behaviour note in `docs/screens/` (see the template there), taken from the VB.NET source,
which is the spec.

# gglib-web

A new web version of `../GGLibrarySolution` (the VB.NET desktop app), on the desktop's own SQL
Server DB. It replaces `../gglib-backend` + `../gglib-frontend` (MySQL). Those are
reference only: do not copy their security defects (see `../CLAUDE.md`).

- pnpm workspace: `apps/api` (NestJS 12, **ESM**: relative imports need `.js`),
  `apps/web` (Next 16 static export), `packages/shared`, `packages/db`.
- Build `packages/*` before type-checking the apps: `pnpm --filter @gglib/shared --filter @gglib/db build`.
- API tests use Vitest + `unplugin-swc` (esbuild drops Nest decorator metadata). HTTP setup
  lives in `configureApp()` so tests exercise the real config.
- TypeScript is pinned to 6.0.x. TS 7 (Go port) is not yet validated with Nest decorators.
- Errors: throw Nest `HttpException`s or let zod throw; `HttpExceptionFilter` shapes every
  response as `ApiError` and never leaks internal messages.
- Shared-DB rules and the per-screen workflow: see README.md and `docs/screens/_TEMPLATE.md`.
- Legacy DB facts (IDs assigned by the app, optional audit/`Locked` columns, triggers, table
  sizes) are in `docs/database.md`. Read it before building a screen's write path.
- `test/db.integration.test.ts` runs against the real DB only when `apps/api/.env` exists.
- Auth: `Usecurity` + the desktop's reversible +128 password encoding (`auth/legacy-password.ts`)
  as long as the desktop app shares the DB. The session is a JWT in an httpOnly SameSite=Strict
  cookie; every write must be `Content-Type: application/json` (CSRF check in
  `common/json-only.middleware.ts`). Routes need a session unless marked `@Public()`.
- Desktop rights (`uadd`/`umodify`/`udel`) only decide who gets the work report on
  login/exit. The desktop never checked them per screen. Access control is the menu gating
  in `Frmlibmain.vb`.
- Services take an optional `db: Executor` and use `inTransaction()`, so tests can pass a
  transaction and roll it back. Browser tests go through `test/e2e-server.mjs` (same idea).
- `CommonLibrary.dll` (clsCommon, frmLogoutNew, UcSearch, frmDisplayTransNew, …) has no
  source in the repo. Decompiled C# is in `../.legacy-decompiled/`. Read it, don't guess.
- The main menu is data: `packages/shared/src/menu.ts` (`MAIN_MENU`), ported item-for-item from
  `Frmlibmain.Designer.vb` with the `Frmlibmain_Load` visibility rules. To ship a screen:
  1. Put `@ScreenAccess('<screen-id>')` on its API controller. The API then refuses users whose
     menu hides the screen, and an unknown id fails at startup.
  2. Register the component in `apps/web/src/screens/registry.tsx`. Until then the menu item
     opens a "not available on the web yet" window that names the desktop form.
- Each menu click opens a new window (MDI behaviour), and hidden windows stay mounted. Screen
  components receive `{ windowId, close }`.
- **The UI must look like the desktop app** (the user asked for the same UI, not a modern
  restyle). Take colours, fonts, sizes and icons from the form's `*.Designer.vb` and `.resx`.
  The shared pieces already do this:
  - `globals.css`: the `win-*` classes and tokens for WinForms controls.
  - `components/ui/gridTheme.ts`: DataGridView grids.
  - `components/ui/Modal.tsx`: dialogs, plus the `ToolButton` / `ToolSeparator` toolbar parts.
  - `public/legacy/`: the desktop's own images and toolbar icons, extracted from the `.resx`
    files.

  There is no dark mode, because the desktop has none. Screens open as MDI children
  (maximized by default) in `features/shell/Workspace.tsx`.

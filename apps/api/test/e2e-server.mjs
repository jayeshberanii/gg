// Test-only API for the browser tests (apps/web/e2e). It serves the built API (dist/) with every
// query running inside ONE SQL transaction that is rolled back on exit, so the real DBLibSQL is
// never changed. Scenarios are seeded once and restored before each test by rolling back to a
// savepoint (POST /__e2e__/reset). Never run this against production.
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { sql } from 'kysely';
import { AppModule } from '../dist/app.module.js';
import { encodeLegacyPassword } from '../dist/auth/legacy-password.js';
import { loadEnv } from '../dist/config/env.js';
import { configureApp } from '../dist/configure-app.js';
import { createDatabase, KYSELY } from '../dist/db/db.module.js';
import { holidaysBetween, serverNow } from '../dist/db/legacy-sql.js';
import { addDays, previousWorkingDay } from '../dist/attendance/working-days.js';

const PORT = Number(process.env.E2E_API_PORT ?? 8181);
const WEB_ORIGIN = process.env.E2E_WEB_ORIGIN ?? 'http://localhost:3100';
export const PASSWORD = 'Secret1';

process.loadEnvFile(new URL('../.env', import.meta.url));
const env = loadEnv({ ...process.env, NODE_ENV: 'test', CORS_ORIGIN: WEB_ORIGIN });
const db = createDatabase(env);
const trx = await db.startTransaction().execute();

async function createUser(name, { userType = 3, admin = false } = {}) {
  const { rows } = await sql`
    INSERT INTO Usecurity (uname, upwd, uadd, umodify, udel, uview, IsAdmin, IsActive, UserTypeKt, WorkingHours)
    OUTPUT inserted.tid AS id
    VALUES (${name}, CONVERT(varchar(50), ${encodeLegacyPassword(PASSWORD)}), 1, 1, 1, 1, ${admin}, 1, ${userType}, '08:00')
  `.execute(trx);
  return rows[0].id;
}

async function addLog(uid, date, login, logout, total) {
  const { rows } = await sql`SELECT ISNULL(MAX(logID), 0) + 1 AS id FROM log`.execute(trx);
  const id = Number(rows[0].id);
  await sql`
    INSERT INTO log (logID, uid, logdate, logintime, logouttime, totallogtime, LastLoginTime)
    VALUES (${id}, ${uid}, CAST(${date} AS date), CAST(${login} AS time), CAST(${logout} AS time),
            CAST(${total} AS time), CAST(${login} AS time))
  `.execute(trx);
  return id;
}

async function addWork(logId, time) {
  const { rows } = await sql`SELECT ISNULL(MAX(workID), 0) + 1 AS id FROM work`.execute(trx);
  const { rows: pair } = await sql`
    SELECT TOP 1 VibhagKt AS v, WorkTypeKt AS w FROM ApprisalStandard
    WHERE IsManualEntry = 1 AND VibhagKt > 0 AND WorkTypeKt > 0`.execute(trx);
  await sql`
    INSERT INTO work (workID, worktypeID, workquantity, workreports, logid, vibhagkt, worktime, IsManualEntry, TableName, MistakeCount)
    VALUES (${Number(rows[0].id)}, ${pair[0].w}, 1, '', ${logId}, ${pair[0].v}, CAST(${time} AS time), 1, '', 0)
  `.execute(trx);
}

// ---- Scenarios -------------------------------------------------------------------------
const stamp = Date.now() % 100000;
const { date: today } = await serverNow(trx);
const holidays = await holidaysBetween(trx, addDays(today, -60), today);
const lastWorkingDay = previousWorkingDay(today, holidays);
const dayBefore = previousWorkingDay(lastWorkingDay, holidays);
const threeBack = previousWorkingDay(dayBefore, holidays);

const users = {
  /** Worked the last working day in full and reported it: straight in. */
  fresh: `e2efresh${stamp}`,
  /** Logged 8h on the last working day but reported nothing: one pending work report. */
  pending: `e2epend${stamp}`,
  /** Last seen three working days ago: must apply for leave. */
  absent: `e2eabsent${stamp}`,
  /** Three pending days: may not decline. */
  manyPending: `e2emany${stamp}`,
  /** User type Admin (1): may open other users' reports. */
  reporter: `e2erep${stamp}`,
  /** IsAdmin: sees the admin-only menus, skips attendance checks. */
  admin: `e2eadmin${stamp}`,
  /** User type AMaster (5), not IsAdmin: Kruti Master's Lock / Unlock By Admin buttons. */
  amaster: `e2eamast${stamp}`,
};

const freshId = await createUser(users.fresh);
await addWork(
  await addLog(freshId, lastWorkingDay, '09:00:00', '17:00:00', '08:00:00'),
  '08:00:00',
);

// Work Report: two changes by `fresh` to the newest Bhasha record, one with old/new values.
const { rows: bhasha } = await sql`SELECT MAX(bhashacokm) AS id FROM bhasmast`.execute(trx);
for (const [mistake, remark] of [
  ['brief(Old brief)=1', 'brief(New brief)=1'],
  ['', ''],
]) {
  await sql`
    INSERT INTO WorkReportM (RecordNo, TableName, ColumnName, WorkTypeGId, DoneByGId, Workdate, Mistake, Remark, alterTime)
    VALUES (${String(bhasha[0].id)}, 'bhasmast', 'bhashacokm', 0, ${freshId}, CAST(${lastWorkingDay} AS date),
            ${mistake}, ${remark}, CAST('10:15:30' AS time))
  `.execute(trx);
}

const pendingId = await createUser(users.pending);
await addLog(pendingId, lastWorkingDay, '09:00:00', '17:00:00', '08:00:00');

const absentId = await createUser(users.absent);
await addWork(await addLog(absentId, threeBack, '09:00:00', '17:00:00', '08:00:00'), '08:00:00');

const manyId = await createUser(users.manyPending);
for (const d of [threeBack, dayBefore, lastWorkingDay])
  await addLog(manyId, d, '09:00:00', '17:00:00', '08:00:00');

await createUser(users.reporter, { userType: 1 });
await createUser(users.admin, { userType: 1, admin: true });
await createUser(users.amaster, { userType: 5 });

await sql`SAVE TRANSACTION e2e_seed`.execute(trx);

// ---- Server ------------------------------------------------------------------------------
const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] })
  .overrideProvider(KYSELY)
  .useValue(trx)
  .compile();
const app = moduleRef.createNestApplication({ logger: ['error'] });
const express = app.getHttpAdapter().getInstance();
// All queries share the transaction's single connection, which cannot run two statements at
// once; the browser sends requests in parallel, so handle them strictly one at a time.
let queue = Promise.resolve();
express.use((req, res, next) => {
  const queuedAt = Date.now();
  queue = queue.then(
    () =>
      new Promise((done) => {
        const startedAt = Date.now();
        if (process.env.E2E_VERBOSE) console.log(`start ${req.method} ${req.url}`);
        const finish = () => {
          const waited = startedAt - queuedAt;
          const took = Date.now() - startedAt;
          if (process.env.E2E_VERBOSE)
            console.log(`end   ${req.method} ${req.url} ${res.statusCode} ${took}ms`);
          if (waited > 1000 || took > 1000) {
            console.log(`slow ${req.method} ${req.url}: waited ${waited} ms, took ${took} ms`);
          }
          done();
        };
        res.on('finish', finish);
        res.on('close', finish);
        next();
      }),
  );
});
configureApp(app, env);
express.post('/__e2e__/reset', async (_req, res) => {
  await sql`ROLLBACK TRANSACTION e2e_seed`.execute(trx);
  await sql`SAVE TRANSACTION e2e_seed`.execute(trx);
  res.json({ ok: true });
});
express.get('/__e2e__/scenario', (_req, res) => {
  res.json({ users, password: PASSWORD, today, lastWorkingDay, dayBefore, threeBack });
});
await app.listen(PORT);
console.log(`e2e API on http://localhost:${PORT} (transaction-scoped, rolled back on exit)`);

async function shutdown() {
  try {
    await trx.rollback().execute();
  } finally {
    await app.close();
    await db.destroy();
    process.exit(0);
  }
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

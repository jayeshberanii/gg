import * as Tedious from 'tedious';
import type { Env } from '../config/env.js';

/**
 * Runs one statement on its own connection with no request timeout, for the few desktop
 * utilities that run for minutes (the desktop sets CommandTimeout = 720000 for them). It is
 * outside any transaction by design: those procedures manage their own work.
 */
export function connectLongRunning(env: Env): Promise<Tedious.Connection> {
  return new Promise((resolve, reject) => {
    const conn = new Tedious.Connection({
      server: env.DB_HOST,
      authentication: {
        type: 'default',
        options: { userName: env.DB_USER, password: env.DB_PASSWORD },
      },
      options: {
        port: env.DB_PORT,
        database: env.DB_NAME,
        encrypt: env.DB_ENCRYPT,
        trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
        connectTimeout: 5000,
        requestTimeout: 0,
      },
    });
    conn.on('connect', (err) => (err ? reject(err) : resolve(conn)));
    conn.connect();
  });
}

export async function execLongRunning(env: Env, statement: string): Promise<void> {
  await queryLongRunning(env, statement);
}

/**
 * The same, for a report procedure the desktop reads with clsCommon.CreateDataTable (whose
 * CommandTimeout is effectively unlimited): the rows of its last result set, by column name.
 */
export async function queryLongRunning(
  env: Env,
  statement: string,
): Promise<{ columns: string[]; rows: unknown[][] }> {
  const conn = await connectLongRunning(env);
  return new Promise((resolve, reject) => {
    let columns: string[] = [];
    let rows: unknown[][] = [];
    const request = new Tedious.Request(statement, (e) => {
      conn.close();
      if (e) reject(e);
      else resolve({ columns, rows });
    });
    request.on('columnMetadata', (cols) => {
      columns = (Array.isArray(cols) ? cols : Object.values(cols)).map((c) => c.colName);
      rows = [];
    });
    request.on('row', (cells) => {
      rows.push((Array.isArray(cells) ? cells : Object.values(cells)).map((c) => c.value));
    });
    conn.execSql(request);
  });
}

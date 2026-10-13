import { type RawBuilder, sql } from 'kysely';

/**
 * SQL text that comes from code or from the desktop's own metadata tables (tblSearch column
 * expressions, F2 query templates), never from a request. The desktop builds every list query
 * from these rows, so the web app must run them as SQL; this is the one place allowed to.
 * User values must still be bound as parameters around it.
 */
export function trustedSql<T = unknown>(text: string): RawBuilder<T> {
  // eslint-disable-next-line no-restricted-syntax -- see the doc comment: trusted text only
  return sql.raw<T>(text);
}

/** A table or column name from code, bracket-quoted. */
export function ident(name: string): RawBuilder<unknown> {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Bad identifier: ${name}`);
  return trustedSql(`[${name}]`);
}

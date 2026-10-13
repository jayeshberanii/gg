import { escapeLike, type SearchFilter } from '@gglib/shared';
import { type RawBuilder, sql } from 'kysely';
import { trustedSql } from '../db/trusted-sql.js';

type Sql = RawBuilder<unknown>;

/** Compiles a parsed search to a parameterised WHERE fragment (LIKE with escaped text). */
export function compileFilter(filter: SearchFilter): Sql {
  if (filter.length === 0) return sql`1 = 1`;
  const groups = filter.map((g) => {
    const terms = g.terms.map((t) => {
      const col = trustedSql(t.column);
      if (t.kind === 'number')
        return t.negate ? sql`${col} <> ${t.value}` : sql`${col} = ${t.value}`;
      if (t.kind === 'equals') return t.negate ? sql`${col} <> ${t.text}` : sql`${col} = ${t.text}`;
      const pattern = `${t.anyBefore ? '%' : ''}${escapeLike(t.text)}${t.anyAfter ? '%' : ''}`;
      return t.negate ? sql`${col} NOT LIKE ${pattern}` : sql`${col} LIKE ${pattern}`;
    });
    return sql`(${sql.join(terms, g.join === 'and' ? sql` AND ` : sql` OR `)})`;
  });
  return sql.join(groups, sql` AND `);
}

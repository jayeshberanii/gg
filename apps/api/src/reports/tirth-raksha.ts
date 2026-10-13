import type { ReportBlock, ReportDocument } from '@gglib/shared';
import { BadRequestException } from '@nestjs/common';
import { sql } from 'kysely';
import { col, procedureExists, reportRows, type ReportSource, str, withTranIds } from './run.js';

const FIELDS = [
  'Seq',
  'ShastraPathNo',
  'BookName',
  'GranthName',
  'CreationYear',
  'RefPlace',
  'PageNo',
  'Author',
  'Editor',
  'Publisher',
  'PublicationYear',
  'Edition',
] as const;

const TEXTS: [label: string, column: string][] = [
  ['Original Text :', 'OriginalText'],
  ['Meaning :', 'Meaning'],
  ['Definitions :', 'Definitions'],
];

/**
 * Tirth Raksha Master › Print Report › Main Report (Home/PrintTirthRakshaReport, procedure
 * PrintTirthRakshaReport): the selected records, which the procedure reads from TranIds, one
 * under another, each with its labelled values and then its texts.
 */
export async function tirthRakshaReport(
  source: ReportSource,
  records: readonly number[],
): Promise<ReportDocument> {
  // The procedure came with a later version of the desktop; an older database has none.
  if (!(await procedureExists(source.db, 'PrintTirthRakshaReport'))) {
    throw new BadRequestException(
      'This database does not have the PrintTirthRakshaReport procedure the report needs',
    );
  }
  const fetched = await withTranIds(source, records, (own) =>
    reportRows(own, sql`EXEC PrintTirthRakshaReport`),
  );
  const blocks: ReportBlock[] = [];
  for (const r of fetched) {
    blocks.push({
      kind: 'fields',
      labelWidth: 15,
      fields: FIELDS.map((name) => ({ label: name, value: str(col(r, name)) })),
    });
    for (const [label, column] of TEXTS) {
      const value = str(col(r, column));
      if (value === '') continue;
      blocks.push({ kind: 'heading', text: label }, { kind: 'paragraph', text: value, indent: 20 });
    }
    blocks.push({ kind: 'space' }, { kind: 'rule' });
  }
  return { title: 'PrintTirthRakshaReport', font: 'shree', size: 15, blocks };
}

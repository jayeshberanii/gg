import type { GridValue, PrintBlock, PrintDocument, PrintPage } from '@gglib/shared';
import { BadRequestException } from '@nestjs/common';
import { sql } from 'kysely';
import { type Executor, idList, serverNow } from '../../db/legacy-sql.js';
import { val } from './bhasha.js';
import { trimmed } from './master-common.js';
import type { ActionResult } from './registry.js';

/**
 * What Letter Bhet (frmLetterBhetM) and Letter Demand (frmLetterDemandM) share: the
 * LetterBookT book lines both keep (told apart by TransactionName, the parent table's name), the
 * running LetterNo, the overflow checks the desktop leaves to SQL Server, and the print
 * documents' common parts. See docs/screens/letter-bhet.md and letter-demand.md.
 */
export type LetterTable = 'LetterBhetM' | 'LetterDemandM';

/** btnNew_Click's txtLetter text (frmLetterBhetM), verbatim. */
export const BHET_DEFAULT_LETTER =
  'सादर प्रणाम,\r\nआपकी ओर से संस्था के ज्ञानभंडार को निम्नोक्त पुस्तक/प्रत भेट के रूप में प्राप्त हुए है,\r\nजिसकी हम विशेषरूप से अनुमोदना करते है । आपकी इस सहकार की भावना आवकार्य है ।\r\nभविष्य में आपके द्वारा प्रकाशित पुस्तकें/प्रतें गीतार्थ गंगा ज्ञानभंडार को प्राप्त होती रहेगी, ऐसी हम अपेक्षा रखते है ।\r\n';

/**
 * btnNew_Click's txtLetter text (frmLetterDemandM), verbatim: three St.Append calls have no
 * vbCrLf, so their pieces run together ("…संरक्षक,गच्छाधिपति…"), as in the saved letters.
 */
export const DEMAND_DEFAULT_LETTER =
  'सादर प्रणाम,\r\n          प्रावचनिक प्रभावक षड्दर्शनविशारद प. पू. मुनिप्रवर श्री मोहजितविजयजी म. सा. तथा उनके पट्टधर वर्तमानश्रुतमर्मज्ञाता, धर्मतीर्थसंरक्षक,गच्छाधिपति प. पू. आचार्य भगवंत श्रीमद्विजय युगभूषणसूरीश्वरजी महाराजा (पंडित म. सा.) के मार्गदर्शन में हमारी संस्था सन् 1992 में स्थापित हुई है ।\r\n          उपलब्ध श्रुतज्ञान का दोहन करके संलग्न शास्त्रपाठों से युक्त 10,008 विषयों का समृद्ध विशाल ज्ञानकोष का सर्जन करना संस्था का मुख्य लक्ष्य हैं । यहलक्ष्य के साथ साथ संस्था में ज्ञानभंडार का भी निर्माण हुआ है,  जिसमें 1,25,000 से अधिक पुस्तकें/प्रतें उपलब्ध हैं । जिसके कारण पू. साधु-साध्वीजीभगवंतों को स्वाध्याय, संशोधन  हेतु, ग्रंथ सुलभता से प्राप्त होते हैं ।\r\n          आपके /आपकी संस्था द्वारा प्रकाशित निम्नलिखित पुस्तक/प्रत/मेगेझिन हमारे ज्ञानभंडार को भेट स्वरूप में भेजिये और साथ में आपके द्वारा प्रकाशितपुस्तक/प्रत/मेगेझिन की सूचि भी भेजिये ऐसी नम्र विनंती है ।';

const INT_MAX = 2_147_483_647;

/** `Val(text)` into an Integer: VB rounds; past Int32 the desktop throws. */
export const intOf = (v: unknown) => Math.round(val(v));

/**
 * The text-column overflows the desktop lets SQL Server throw on (a truncation error after the
 * book lines were already deleted): `[column, label, max]`, checked on the trimmed value.
 */
export function overflowMessage(
  f: Record<string, unknown>,
  limits: [column: string, label: string, max: number][],
  ints: [column: string, label: string][],
): string {
  for (const [column, label, max] of limits)
    if (trimmed(f[column]).length > max) return `${label} cannot be longer than ${max} characters`;
  for (const [column, label] of ints)
    if (Math.abs(intOf(f[column])) > INT_MAX) return `${label} is too large`;
  return '';
}

/** GetMaxLetterNo: `SELECT ISNULL(max(LetterNo),0)+1 FROM <table>` (never checked for duplicates). */
export async function nextLetterNo(db: Executor, table: LetterTable): Promise<number> {
  const { rows } =
    table === 'LetterBhetM'
      ? await sql<{ n: number }>`SELECT ISNULL(MAX(LetterNo), 0) + 1 AS n FROM LetterBhetM`.execute(
          db,
        )
      : await sql<{
          n: number;
        }>`SELECT ISNULL(MAX(LetterNo), 0) + 1 AS n FROM LetterDemandM`.execute(db);
  return Number(rows[0]?.n ?? 1);
}

/** New's values: today, the next LetterNo and the default letter. */
export async function letterDefaults(
  db: Executor,
  table: LetterTable,
): Promise<Record<string, GridValue>> {
  return {
    LetterDate: (await serverNow(db)).date,
    LetterNo: await nextLetterNo(db, table),
    Letter: table === 'LetterBhetM' ? BHET_DEFAULT_LETTER : DEMAND_DEFAULT_LETTER,
  };
}

/**
 * txtLetter as saved: the browser's textarea gives LF line breaks, the desktop's TextBox CRLF;
 * the saved letters (and their F2 list of earlier letters) use CRLF.
 */
export const letterText = (v: unknown) =>
  (v === null || v === undefined ? '' : String(v)).replace(/\r?\n/g, '\r\n');

/** The tblSearch BookTran JoinCondition: the record's BookNames, comma-joined. */
async function storedSummary(db: Executor, table: LetterTable, id: number): Promise<string> {
  const { rows } = await sql<{ s: string | null }>`
    SELECT STUFF((SELECT ',' + BookName FROM LetterBookT
      WHERE TransactionKt = ${id} AND TransactionName = ${table} FOR XML PATH('')), 1, 1, '') AS s
  `.execute(db);
  return trimmed(rows[0]?.s);
}

/** DELETE the record's LetterBookT lines (always by TransactionName and TransactionKt). */
export async function deleteBookLines(trx: Executor, table: LetterTable, id: number) {
  await sql`DELETE FROM LetterBookT WHERE TransactionKt = ${id} AND TransactionName = ${table}`.execute(
    trx,
  );
}

/**
 * The book lines of Save, inside the master's transaction (the desktop's DeleteTransaction ran
 * on its own connection before Save, so a failing save lost the lines):
 * - lstBookTran is built only when the Book Detail box no longer reads as loaded (a new record
 *   with text, or a text other than the stored BookNames), from the popup's rows; a row with
 *   no BookName is dropped (the desktop would insert it as an empty line);
 * - the old lines go when the box is empty or there are new lines (DeleteTransaction); a new
 *   record has none (the desktop's DELETE … WHERE TransactionKt=0 is not repeated);
 * - the new lines are inserted with TransactionName = the table.
 * Call it before the master is written (the stored summary is read first) with `id` 0 for a
 * new record, then `insert` with the record's id.
 */
export async function prepareBookLines(
  db: Executor,
  table: LetterTable,
  id: number,
  f: Record<string, unknown>,
): Promise<{ replace: boolean; lines: { BookName: string; Nakal: number }[] }> {
  const text = trimmed(f.BookTran);
  const rows = Array.isArray(f['BookTran.Rows'])
    ? (f['BookTran.Rows'] as Record<string, unknown>[])
    : null;
  const changed = id === 0 ? text !== '' : (await storedSummary(db, table, id)) !== text;
  const get = (row: Record<string, unknown>, name: string) => {
    const k = Object.keys(row).find((c) => c.toLowerCase() === name.toLowerCase());
    return k === undefined ? null : row[k];
  };
  const lines =
    changed && rows
      ? rows
          .map((r) => ({ BookName: trimmed(get(r, 'BookName')), Nakal: intOf(get(r, 'Nakal')) }))
          .filter((r) => r.BookName !== '')
      : [];
  for (const l of lines) {
    if (l.BookName.length > 2000)
      throw new BadRequestException('Book Name cannot be longer than 2000 characters');
    if (Math.abs(l.Nakal) > INT_MAX) throw new BadRequestException('Nakal is too large');
  }
  return { replace: id > 0 && (text === '' || lines.length > 0), lines };
}

export async function writeBookLines(
  trx: Executor,
  table: LetterTable,
  id: number,
  plan: { replace: boolean; lines: { BookName: string; Nakal: number }[] },
) {
  if (plan.replace) await deleteBookLines(trx, table, id);
  for (const l of plan.lines)
    await sql`
      INSERT INTO LetterBookT (TransactionKt, TransactionName, BookName, Nakal)
      VALUES (${id}, ${table}, ${l.BookName}, ${l.Nakal})
    `.execute(trx);
}

/**
 * Delete: the record and its book lines in one transaction (the desktop deletes only the
 * record and leaves the lines behind).
 */
export function deleteLetter(table: LetterTable) {
  return async (trx: Executor, _user: unknown, id: number): Promise<number> => {
    await deleteBookLines(trx, table, id);
    const { numAffectedRows } =
      table === 'LetterBhetM'
        ? await sql`DELETE FROM LetterBhetM WHERE LetterBhetMkm = ${id}`.execute(trx)
        : await sql`DELETE FROM LetterDemandM WHERE LetterDemandMkm = ${id}`.execute(trx);
    return Number(numAffectedRows ?? 0);
  };
}

/** Send To: `ISNULL(STUFF((SELECT DISTINCT ',' + CAST(<col> …)),0)` → the other screen, or the message. */
export async function sendTo(
  db: Executor,
  screen: string,
  query: ReturnType<typeof sql<{ id: number | null }>>,
): Promise<ActionResult> {
  const { rows } = await query.execute(db);
  const ids = [
    ...new Set(rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0)),
  ];
  return { kind: 'open', screen, ids, emptyMessage: 'No Record Found' };
}

export const ids0 = (ids: number[]) => idList(ids.length ? ids : [0]);

/**
 * PROVISIONAL LAYOUT. LetterBhetReport.rpt / LetterDemandReport.rpt are Crystal-encrypted, so
 * their real layout (header text, field placement, any fixed wording or signatory) cannot be
 * read from the repo. This is a plain A4 letter built from the reports' data: the logo they
 * embed, Letter No and Date, the addressee, Vishay, the letter body as written, then the item
 * rows. Replace it once the user supplies a printed sample (see the screens' notes).
 */
export const PROVISIONAL_NOTE =
  'Provisional layout: the desktop report could not be read; awaiting a printed sample.';

export function letterPage(head: {
  letterNo: GridValue;
  date: string;
  to: string[];
  vishay: string;
  letter: string;
  tables: PrintBlock[];
}): PrintPage {
  const blocks: PrintBlock[] = [{ kind: 'lines', lines: head.to.filter((l) => l.trim() !== '') }];
  if (head.vishay.trim() !== '')
    blocks.push({ kind: 'fields', fields: [{ label: 'Vishay', value: head.vishay }] });
  blocks.push({ kind: 'text', text: head.letter.replace(/\r\n/g, '\n') });
  blocks.push(...head.tables);
  return {
    header: {
      logo: true,
      fields: [
        { label: 'Letter No', value: head.letterNo === null ? '' : String(head.letterNo) },
        { label: 'Date', value: head.date },
      ],
    },
    blocks,
  };
}

export function printDocument(title: string, pages: PrintPage[]): ActionResult {
  const document: PrintDocument = { title, provisional: PROVISIONAL_NOTE, pages };
  return { kind: 'print', document };
}

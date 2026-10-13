'use client';

import type { ChildRow, TransTable } from '@gglib/shared';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import { copyWithNewKeys } from '@/features/master/commonTrans';
import { newTempId } from '@/features/master/DisplayTransDialog';
import { MasterScreen } from '@/features/master/MasterScreen';
import { bookSummary, netString } from '@/features/master/transSummary';
import type {
  FieldSpec,
  FormContext,
  ScreenActions,
  ScreenSpec,
  TransSpec,
  TransState,
} from '@/features/master/types';
import { getVikramSamvat } from './AuthorMaster';
import { totalPages } from './BookMaster';
import type { ScreenProps } from './registry';

/**
 * Library › Anya Bhandar (frmAnyaBhandar). Positions, widths and labels are
 * frmAnyaBhandar.Designer.vb's; the popups are SetForm_AnyaBhandar's (frmDisplayTransNew).
 * See docs/screens/anya-bhandar.md.
 */

/** clsCommon.SignBetweenStr. */
function signBetween(a: string, b: string, sign = ','): string {
  if (a.trim() === '' && b.trim() === '') return '';
  if (a.trim() === '') return b;
  if (b.trim() === '') return a;
  return `${a.trim()}${sign}${b.trim()}`;
}

const cellText = (v: unknown) => netString((v ?? null) as ChildRow[string]).trim();

/** The Subject popup's box: its Vishay cells run together. */
function subjectSummary(rows: ChildRow[], columns: string[]): string {
  const vishay = columns.find((c) => c.toUpperCase() === 'VISHAY') ?? 'Vishay';
  let out = '';
  for (const row of rows) out = signBetween(out, cellText(row[vishay]), '');
  return out.trim();
}

/** Book Subject's dates: an InputBox with today (dd/MM/yyyy). */
const today = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

/** The Author and multiauthor popups keep the Seq the user typed (TsBtnSave skips them). */
const keepSeq = async (rows: ChildRow[]) => rows;

const MULTI_AUTHOR_TYPE: TransSpec = {
  column: 'AuthTran',
  hidden: ['AnyaBhandarAuthorAuthTypeKm', 'AnyaBhandarAuthorKt', 'authortypekt', 'signkt'],
  editable: [],
  lookups: {
    authortype: { setKt: 'authortypekt', setName: 'authortype', next: 'Sign' },
    sign: { setKt: 'signkt', setName: 'Sign', next: 'seq' },
  },
  tempKey: 'AnyaBhandarAuthorAuthTypekm',
  firstColumn: 'authortype',
};

const MULTI_AUTHOR: TransSpec = {
  column: 'AuthTran',
  hidden: [
    'AnyaBhandarAuthorAuthKm',
    'AnyaBhandarAuthorKt',
    'authorkt',
    'AuthAnyaNmKt',
    'padkt',
    'signkt',
  ],
  editable: ['seq'],
  lookups: {
    authorname: {
      setKt: 'authorkt',
      setName: 'authorname',
      // The list's mainname (column 12), Guru and identyty; the any name starts as the name.
      also: { authorname: 12, AnyaName: 12, Guru: 2, identyty: 3 },
      after: (row) => ({ ...row, AuthAnyaNmKt: 0 }),
      next: 'AnyaName',
    },
    anyaname: {
      setKt: 'AuthAnyaNmKt',
      setName: 'AnyaName',
      perRow: true,
      alwaysNext: true,
      next: 'Padvi',
    },
    padvi: {
      setKt: 'padkt',
      setName: 'Padvi',
      clearOnCancel: true,
      alwaysNext: true,
      next: 'Sign',
    },
    sign: { setKt: 'signkt', setName: 'Sign', clearOnCancel: true, alwaysNext: true, next: 'seq' },
  },
  tempKey: 'AnyaBhandarAuthorAuthKm',
  firstColumn: 'authorname',
  beforeSave: keepSeq,
};

/** Mul / Anu authors: a new row's key is −1 (the server inserts every key ≤ 0). */
const authorList = (column: string, key: string): TransSpec => ({
  column,
  hidden: [key, 'AuthorKt'],
  editable: [],
  lookups: { authorname: { setKt: 'AuthorKt', setName: 'AuthorName' } },
  template: ({ seq }) => [-1, 0, '', seq],
  firstColumn: 'AuthorName',
  onCopy: copyWithNewKeys(key, 'temp'),
  summary: (rows, columns) => bookSummary(rows, columns),
});

/**
 * Copy of the Subject popup: the rows get keys of their own, and their Vishay lines follow
 * them (Id 0, RecordKt the new key), so the copy saves its own rows.
 */
function copySubjects(state: TransState): TransState {
  const name = state.columns.find((c) => c.name.toLowerCase() === 'anyabhandarsubjectkm')?.name;
  if (!name) return state;
  const keys = new Map<number, number>();
  const rows = state.rows.map((r) => {
    const fresh = newTempId();
    keys.set(Number(r[name]) || 0, fresh);
    return { ...r, [name]: fresh };
  });
  const extras = state.extras?.map((t, i) =>
    i === 0
      ? {
          ...t,
          rows: t.rows
            .filter((l) => keys.has(Number(l.RecordKt) || 0))
            .map((l) => ({ ...l, Id: 0, RecordKt: keys.get(Number(l.RecordKt) || 0)! })),
        }
      : t,
  );
  return { ...state, rows, extras, extra: extras?.[0] ?? state.extra };
}

const TRANS: Record<string, TransSpec> = {
  AuthTran: {
    column: 'AuthTran',
    hidden: ['AnyaBhandarAuthorKm'],
    editable: ['seq'],
    lookups: {},
    tempKey: 'AnyaBhandarAuthorKm',
    firstColumn: 'authortype',
    beforeSave: keepSeq,
    children: {
      authortype: {
        extra: 1,
        parentKey: 'AnyaBhandarAuthorKm',
        childKey: 'AnyaBhandarAuthorKt',
        spec: MULTI_AUTHOR_TYPE,
        cell: (rows) => {
          const out = rows
            .map(
              (r) =>
                `${cellText(r.authortype)}${cellText(r.Sign) === '' ? '' : ` (${cellText(r.Sign)}) `},`,
            )
            .join('');
          return out === '' ? '' : out.slice(0, -1);
        },
      },
      authorname: {
        extra: 0,
        parentKey: 'AnyaBhandarAuthorKm',
        childKey: 'AnyaBhandarAuthorKt',
        spec: MULTI_AUTHOR,
        cell: (rows) =>
          rows
            .map(
              (r) =>
                `${netString(r.AnyaName ?? null)}${cellText(r.identyty) === '' ? '' : `(${cellText(r.identyty)})`}${
                  cellText(r.Padvi) === '' ? '' : ` (${cellText(r.Padvi)}) `
                }${cellText(r.Sign) === '' ? '' : ` (${cellText(r.Sign)}) `}`,
            )
            .join(''),
      },
    },
    // Copy keeps the rows as they are: the Author popup is always saved by delete-insert.
    summary: (rows, columns) => bookSummary(rows, columns),
  },
  PrakTran: {
    column: 'PrakTran',
    hidden: ['AnyaBhandarKt', 'AnyaBhandarPrakKm', 'prakashakkt', 'praktypekt', 'signkt'],
    editable: ['purva'],
    lookups: {
      prakname: {
        setKt: 'prakashakkt',
        setName: 'prakname',
        also: { prakname: 7 },
        // The picked name also goes to NameSelected — with a space after it.
        after: (row, picked) => ({
          ...row,
          nameSelected: `${netString(picked.rows[0]?.[7] ?? null)} `,
        }),
        next: 'nameSelected',
      },
      nameselected: { setName: 'nameSelected', perRow: true },
      praktype: { setKt: 'PrakTypekt', setName: 'PrakType', next: 'sign' },
      sign: { setKt: 'signkt', setName: 'sign', next: 'seq' },
    },
    template: ({ seq }) => [0, 0, 0, '', false, '', 0, '', '', 0, '', seq],
    firstColumn: 'prakname',
    onCopy: copyWithNewKeys('AnyaBhandarPrakKm', 'temp'),
    summary: (rows, columns) => bookSummary(rows, columns, true),
  },
  BhashaTran: {
    column: 'BhashaTran',
    hidden: ['AnyaBhandarBhashaKm', 'AnyaBhandarKt', 'bhashakt'],
    editable: [],
    lookups: {
      bhasa_attr: {
        setKt: 'bhashakt',
        also: { bhasa_attr: 2 },
        addRowAfter: true,
        next: 'bhasa_attr',
      },
    },
    template: ({ seq }) => [0, 0, 0, '', seq],
    firstColumn: 'bhasa_attr',
    onCopy: copyWithNewKeys('AnyaBhandarBhashaKm', 'temp'),
    summary: (rows, columns) => bookSummary(rows, columns),
  },
  LipiTran: {
    column: 'LipiTran',
    hidden: ['AnyaBhandarLipiKm', 'AnyaBhandarKt', 'lippikt'],
    editable: [],
    lookups: {
      lipi_attr: { setKt: 'lippikt', also: { lipi_attr: 2 }, addRowAfter: true, next: 'lipi_attr' },
    },
    template: ({ seq }) => [0, 0, 0, '', seq],
    firstColumn: 'lipi_attr',
    onCopy: copyWithNewKeys('AnyaBhandarLipiKm', 'temp'),
    summary: (rows, columns) => bookSummary(rows, columns),
  },
  SubjTran: {
    column: 'SubjTran',
    hidden: ['AnyaBhandarSubjectKm', 'WorkDoneByKt'],
    editable: ['PrintSeq', 'Remark'],
    lookups: {
      entrytype: { setName: 'EntryType', next: 'Vishay' },
      printdate: {
        setName: 'PrintDate',
        input: {
          prompt: 'Please Enter Date in dd/MM/yyyy Format(Ex.:- (01/12/2015)',
          initial: today,
        },
        next: 'PrintSeq',
      },
      workdonebyname: { setKt: 'WorkDoneByKt', setName: 'WorkDoneByName', next: 'PrintSeq' },
    },
    template: ({ seq }) => [0, 'Main Title(New)', '', 0, '', '', 0, '', seq],
    firstColumn: 'Vishay',
    vishayEntry: {
      vishay: {
        extra: 0,
        parentKey: 'AnyaBhandarSubjectKm',
        unsavedMessage: 'Please Save Reord First',
      },
    },
    onCopy: copySubjects,
    summary: subjectSummary,
  },
  MulAuthorTran: authorList('MulAuthorTran', 'AnyaBhandarMulAuthorKm'),
  AnuAuthorTran: authorList('AnuAuthorTran', 'AnyaBhandarAnuAuthorKm'),
};

// ------------------------------------------------------------------------------------------
// F2 on Book Name: the picked book fills the form (Txt_KeyDown, txtBookMastKt)
// ------------------------------------------------------------------------------------------

const isTrue = (v: unknown) => v === true || v === 1 || String(v).toLowerCase() === 'true';

/** A popup's table with other rows, its columns kept. */
const withRows = (t: TransTable | undefined, rows: ChildRow[]): TransTable => ({
  columns: t?.columns ?? [],
  rows,
});

async function fillFromBook(bookId: number, ctx: FormContext) {
  if (bookId <= 0) return;
  const result = await ctx.call(
    'fill-from-book',
    { bookId, tranKm: ctx.strMode === 'Add' ? 0 : ctx.tranKm },
    [],
  );
  if (result?.kind !== 'form') return;
  const values = result.fields;
  for (const f of FIELDS) {
    if (f.kt) {
      if (f.name in values) ctx.setTag(f.name, Number(values[f.name]) || 0);
      if (f.nameColumn && f.nameColumn in values)
        ctx.setField(f.name, netString(values[f.nameColumn] ?? null));
    } else if (f.name in values) ctx.setField(f.name, netString(values[f.name] ?? null));
  }
  const rowsOf = (key: string) => result.trans[key]?.rows ?? [];

  // The book's authors replace the popup's; the box gets them after its old text.
  const auth = await ctx.loadTrans('AuthTran');
  if (auth) {
    const [names = [], types = []] = result.trans.AuthTran?.extras ?? [];
    ctx.putTrans('AuthTran', rowsOf('AuthTran'), {
      base: auth,
      keepText: true,
      extras: [withRows(auth.extras?.[0], names), withRows(auth.extras?.[1], types)],
    });
    let text = ctx.fields.AuthTran ?? '';
    for (const r of rowsOf('AuthTran'))
      text = signBetween(
        text,
        `${netString(r.authortype ?? null)}-${netString(r.authorname ?? null)}`,
      );
    ctx.setField('AuthTran', text);
  }
  // Bhasha, Lipi, Prakashak and Subject: the book's rows (their boxes came with the fields).
  for (const key of ['BhashaTran', 'LipiTran', 'PrakTran', 'SubjTran']) {
    const base = await ctx.loadTrans(key);
    if (!base) continue;
    ctx.putTrans(key, rowsOf(key), {
      base,
      keepText: true,
      ...(key === 'SubjTran' ? { extras: [withRows(base.extras?.[0], [])] } : {}),
    });
  }
  // Mul / Anu: the book's authors of those types, then its Kruti authors not listed yet, are
  // added to the record's own rows (key 0, Seq counted from 1 again).
  const lists: Record<string, { base: TransState; rows: ChildRow[]; text: string; n: number }> = {};
  for (const key of ['MulAuthorTran', 'AnuAuthorTran']) {
    const base = await ctx.loadTrans(key);
    if (base) lists[key] = { base, rows: [...base.rows], text: ctx.fields[key] ?? '', n: 0 };
  }
  const add = (key: string, authorKt: unknown, name: unknown) => {
    const l = lists[key];
    if (!l) return;
    const [k, kt, nm, seq] = l.base.columns.map((c) => c.name);
    l.n += 1;
    l.rows.push({
      [k ?? 'Km']: 0,
      [kt ?? 'AuthorKt']: Number(authorKt) || 0,
      [nm ?? 'AuthorName']: netString((name ?? null) as ChildRow[string]),
      [seq ?? 'seq']: l.n,
    });
    l.text = signBetween(l.text, netString((name ?? null) as ChildRow[string]));
  };
  for (const r of rowsOf('MulAuthorTran')) add('MulAuthorTran', r.AuthorKt, r.AuthorName);
  for (const r of rowsOf('AnuAuthorTran')) add('AnuAuthorTran', r.AuthorKt, r.AuthorName);
  for (const r of rowsOf('KrutiAuthors')) {
    const key = isTrue(r.IsDownLevel) ? 'AnuAuthorTran' : 'MulAuthorTran';
    const l = lists[key];
    const ktColumn = l?.base.columns[1]?.name ?? 'AuthorKt';
    if (l && !l.rows.some((x) => Number(x[ktColumn]) === Number(r.AuthorKt)))
      add(key, r.AuthorKt, r.AuthorName);
  }
  for (const [key, l] of Object.entries(lists)) {
    ctx.putTrans(key, l.rows, { base: l.base, keepText: true });
    ctx.setField(key, l.text);
  }
}

// ------------------------------------------------------------------------------------------
// The panel
// ------------------------------------------------------------------------------------------

const box = (
  name: string,
  label: string,
  at: [number, number, number],
  extra: Partial<FieldSpec> = {},
): FieldSpec => ({ name, label, at: { x: at[0], y: at[1], w: at[2] }, ...extra });
const kt = (nameColumn: string) => ({ kt: true, nameColumn });

/** The boxes in their TabIndex order. */
const FIELDS: FieldSpec[] = [
  box('BhandarKt', 'Bhandar Name', [111, 9, 210], kt('BhandarName')),
  box('BookMastKt', 'Book Name', [465, 9, 223], {
    ...kt('BookMastName'),
    afterPick: (picked, ctx) => void fillFromBook(Number(picked.code) || 0, ctx),
  }),
  box('Size', 'Size', [797, 9, 102]),
  box('RecordNo', 'Record No', [905, 9, 79], { noF2: true }),
  box('PSamvatcokt', 'Samvat', [111, 47, 61], kt('PSamvatcoName')),
  box('PSamvat', 'PSamvat', [175, 47, 79]),
  box('PSamvatVK', 'PSamvatVK', [257, 47, 64], { readOnly: true, alwaysSend: true, noF2: true }),
  box('ParichayakName', 'Pari. Name', [465, 47, 152]),
  box('Part', 'Part Type', [618, 47, 70]),
  box('AvrutiKt', 'Avruti', [797, 47, 206], kt('AvrutiName')),
  box('GMalaKt', 'GMalaName', [111, 85, 156], kt('GMalaName')),
  box('GMalaNo', 'GMalaNo', [268, 85, 53]),
  box('Pages', 'Pgs', [465, 85, 110]),
  box('TotalPages', 'TotPgs', [578, 85, 110], { noF2: true }),
  box('Price', 'Price', [797, 85, 206]),
  box('ShapeKt', 'Shape', [111, 123, 210], kt('ShapeName')),
  box('AuthTran', 'संपादक', [111, 237, 210], { trans: 'AuthTran' }),
  box('ISBNNo', 'ISBN No', [797, 123, 206]),
  box('PrakTran', 'Prakashak', [111, 161, 210], { trans: 'PrakTran' }),
  box('SubjTran', 'Subject', [465, 161, 223], { trans: 'SubjTran' }),
  box('BhashaTran', 'Bhasha', [797, 161, 206], { trans: 'BhashaTran' }),
  box('LipiTran', 'Lippi', [797, 199, 206], { trans: 'LipiTran' }),
  box('BookTKt', 'Library No', [111, 199, 210], {
    ...kt('BookTName'),
    // The number's own book goes into Book Name (the desktop looked up an unrelated one).
    afterPick: (picked, ctx) => {
      const tid = Number(picked.code) || 0;
      if (tid <= 0) return;
      void ctx.call('book-of-libno', { tid }, []).then((r) => {
        const row = r?.kind === 'cells' ? r.rows[0] : undefined;
        if (!row) return;
        ctx.setTag('BookMastKt', Number(row.BookMastKm) || 0);
        ctx.setField('BookMastKt', netString(row.BookName ?? null));
      });
    },
  }),
  box('OldLibNo', 'Old Library No', [465, 199, 223], { noF2: true }),
  box('MulAuthorTran', 'मूळकर्ता संपादक', [465, 237, 223], { trans: 'MulAuthorTran' }),
  box('AnuAuthorTran', 'अनुवादक संपादक', [797, 237, 206], { trans: 'AnuAuthorTran' }),
  box('Remark', 'Remark', [465, 123, 223]),
];

const LABELS: [string, number, number][] = [
  ['Bhandar Name', 8, 13],
  ['Book Name', 327, 13],
  ['Size/Record No', 694, 13],
  ['Samvat', 8, 51],
  ['Pari. Name/Part Type', 327, 51],
  ['Avruti', 694, 51],
  ['GMalaName/No', 8, 89],
  ['Pgs/TotPgs', 327, 89],
  ['Price', 694, 89],
  ['Shape', 8, 127],
  ['Remark', 327, 127],
  ['ISBN No', 694, 127],
  ['Prakashak', 8, 165],
  ['Subject', 327, 165],
  ['Bhasha', 694, 165],
  ['Library No', 8, 203],
  ['Old Library No', 327, 203],
  ['Lippi', 694, 203],
  ['संपादक', 8, 241],
  ['मूळकर्ता संपादक', 327, 241],
  ['अनुवादक संपादक', 694, 241],
];

const isNumeric = (s: string) => /^\s*[+-]?(\d+\.?\d*|\.\d+)\s*$/.test(s);

/** Txt_Leave: PSamvatVK from the samvat kind and year; TotalPages from Pages (replacepgnum). */
function onFieldLeave(
  name: string,
  fields: Record<string, string>,
  tags: Record<string, number>,
): Record<string, string> | null {
  if (name === 'PSamvat') {
    const text = fields.PSamvat ?? '';
    const kind = tags.PSamvatcokt ?? 0;
    if ((fields.PSamvatcokt ?? '') === '' || kind <= 0 || text.trim().length <= 2) return null;
    if (isNumeric(text.trim()))
      return { PSamvatVK: String(getVikramSamvat(kind, Math.round(Number(text)))) };
    const head = text.substring(0, text.trim().length - 1);
    if (isNumeric(head))
      return { PSamvatVK: String(getVikramSamvat(kind, Math.round(Number(head)))) };
    return null;
  }
  if (name === 'Pages' && (fields.Pages ?? '').trim() !== '') {
    let pages = fields.Pages ?? '';
    if (!pages.includes('.')) pages += '.';
    return {
      TotalPages: String(totalPages(pages)),
      Pages: pages.substring(0, pages.length - 1),
    };
  }
  return null;
}

const spec: ScreenSpec = {
  screen: 'anya-bhandar',
  panelHeight: 285,
  panelWidth: 1012,
  entryLabel: true,
  labels: LABELS.map(([text, x, y]) => ({ text, at: { x, y }, sizePt: 11.25 })),
  fields: FIELDS,
  trans: TRANS,
  onFieldLeave,
  columns: [
    { header: 'AnyaBhandarKm', field: 'AnyaBhandarKm', width: 5 },
    { header: 'Bhandar Name', field: 'BhandarName', width: 150 },
    { header: 'Size', field: 'Size', width: 50 },
    { header: 'RecordNo', field: 'RecordNo', width: 100 },
    { header: 'BookMastKt', field: 'BookMastKt', hidden: true },
    { header: 'BookName -Part', field: 'BookMastName', width: 230 },
    { header: 'Prakashak', field: 'txtPrakashak', width: 150 },
    { header: 'Author', field: 'txtAuthor', width: 80 },
    { header: 'PSamvatVK', field: 'PSamvatVK', width: 70 },
    { header: 'Bhasha', field: 'txtBhasha', width: 70 },
    { header: 'Lipi', field: 'txtLipi', width: 70 },
    { header: 'Pages(Total)', field: 'TotalPages', width: 70 },
    { header: 'BookTKt', field: 'BookTKt', hidden: true },
    { header: 'LibNo', field: 'BookTName', width: 70 },
    { header: 'Avruti', field: 'AvrutiName', width: 70 },
  ],
  // btnNew_Click: an empty Size is asked for first; Size and Bhandar stay, RecordNo is the
  // size's next one.
  onNew: {
    keep: ['Size', 'BhandarKt'],
    ask: { field: 'Size', prompt: 'Please Enter Size' },
    params: ({ fields }) => ({ Size: (fields.Size ?? '').trim() }),
  },
  // btnCopy_Click: every popup's rows come along (with keys of their own); RecordNo recomputed.
  copy: { clear: [], loadTrans: Object.keys(TRANS), newDefaults: true },
  // Save(): a typed Book Name with no book picked, on a new record, may add the book.
  beforeSave: async ({
    strMode,
    fields,
    tags,
    confirm,
  }): Promise<Record<string, string | boolean> | null> => {
    const name = (fields.BookMastKt ?? '').trim();
    if ((tags.BookMastKt ?? 0) === 0 && name !== '' && strMode === 'Add') {
      if (!(await confirm('Do You want to Add New Book Entry?'))) return null;
      return { BookName: name, AddBook: true };
    }
    return { BookName: name };
  },
};

/** cntMenu, in the designer's order. */
function menu(a: ScreenActions): ContextMenuItem[] {
  const item = (label: string, onSelect: () => void): ContextMenuItem => ({
    kind: 'item',
    label,
    onSelect,
  });
  return [
    {
      kind: 'submenu',
      label: 'For Selected Record',
      items: [item('Book Master', () => void a.run('book-master'))],
    },
    {
      kind: 'submenu',
      label: 'Print Report',
      items: [
        // Its dropdown lists the Config_Master layouts that have a ShortcutKey.
        a.printLayouts.length > 0
          ? {
              kind: 'submenu',
              label: 'Selected Column',
              items: a.printLayouts,
              onSelect: a.printSelectedColumn,
            }
          : item('Selected Column', a.printSelectedColumn),
        item('Send To Excel', a.sendToExcel),
      ],
    },
  ];
}

export function AnyaBhandar(props: ScreenProps) {
  return <MasterScreen spec={spec} {...props} menu={menu} />;
}

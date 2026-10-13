'use client';

import type { ChildRow } from '@gglib/shared';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import { copyWithNewKeys, vishayEntryTrans } from '@/features/master/commonTrans';
import { MasterScreen } from '@/features/master/MasterScreen';
import { netString } from '@/features/master/transSummary';
import type {
  FieldSpec,
  ScreenActions,
  ScreenSpec,
  TransHelpers,
  TransSpec,
} from '@/features/master/types';
import { withVksamvat } from './AuthorMaster';
import type { ScreenProps } from './registry';

/**
 * Library › Tirth Raksha Master (frmTirthRakshaMaster, "Tirth Raksha"). Positions, widths and
 * labels are frmTirthRakshaMaster.Designer.vb's; the popups are SetForm_TirthRaksha's
 * (frmDisplayTransNew). See docs/screens/tirth-raksha-master.md.
 */

const cellText = (v: unknown) => netString((v ?? null) as ChildRow[string]).trim();
const VISHAY_BOXES = ['TirthRakshaNameTran', 'PetaVishayTran', 'TirthRakshaRemarkTran'];

/** A SetForm_TirthRaksha popup: its key hidden, new rows with a temporary key and their Seq. */
function popup(
  column: string,
  key: string,
  rest: Omit<TransSpec, 'column' | 'tempKey' | 'onCopy'>,
): TransSpec {
  // Copy: the copy gets rows of its own (the desktop saved the original's rows in place).
  return {
    column,
    tempKey: key,
    onCopy: copyWithNewKeys(key, 'temp'),
    ...rest,
    hidden: [key, ...rest.hidden],
  };
}

/**
 * The Samvat cells' CellEndEdit / pick: Vksamvat from the samvat kind and year, then
 * Isvisan = Vksamvat − 56 (only when the kind and a year of three characters or more are set).
 */
async function withIsvisan(row: ChildRow, helpers: TransHelpers): Promise<ChildRow> {
  if (!(Math.trunc(Number(row.AsamvatKt) || 0) > 0 && netString(row.Asamvat ?? null).length > 2))
    return row;
  const next = await withVksamvat(row, helpers, false);
  return { ...next, Isvisan: (Number(next.Vksamvat) || 0) - 56 };
}

const SIGN = (next: string) => ({
  setKt: 'signkt',
  setName: 'Sign',
  clearOnCancel: true,
  alwaysNext: true,
  next,
});

/** multiauthortype: the author types of one Author row. */
const MULTI_AUTHOR_TYPE: TransSpec = {
  column: 'AuthTran',
  hidden: [
    'TirthRakshaKt',
    'TirthRakshaAuthorAuthorTypeKm',
    'TirthRakshaAuthorKt',
    'authortypekt',
    'signkt',
  ],
  editable: [],
  lookups: {
    authortype: { setKt: 'authortypekt', setName: 'authortype', next: 'Sign' },
    sign: { setKt: 'signkt', setName: 'Sign', next: 'seq' },
  },
  tempKey: 'TirthRakshaAuthorAuthorTypeKm',
  firstColumn: 'authortype',
};

/** multiauthor: the authors of one Author row (their any name, padvi and sign). */
const MULTI_AUTHOR: TransSpec = {
  column: 'AuthTran',
  hidden: [
    'TirthRakshaKt',
    'TirthRakshaAuthorAuthorKm',
    'TirthRakshaAuthorKt',
    'authorkt',
    'AuthAnyaNmKt',
    'padkt',
    'signkt',
  ],
  editable: [],
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
    // Padvi and Sign take whatever the list leaves, picked or not, and move on.
    padvi: {
      setKt: 'padkt',
      setName: 'Padvi',
      clearOnCancel: true,
      alwaysNext: true,
      next: 'Sign',
    },
    sign: SIGN('seq'),
  },
  tempKey: 'TirthRakshaAuthorAuthorKm',
  firstColumn: 'authorname',
};

const TRANS: Record<string, TransSpec> = {
  ...Object.fromEntries(VISHAY_BOXES.map((c) => [c, vishayEntryTrans(c)])),
  AuthTran: popup('AuthTran', 'TirthRakshaAuthorKm', {
    hidden: ['TirthRakshaKt'],
    editable: [],
    lookups: {},
    firstColumn: 'authortype',
    children: {
      authortype: {
        extra: 1,
        parentKey: 'TirthRakshaAuthorKm',
        childKey: 'TirthRakshaAuthorKt',
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
        parentKey: 'TirthRakshaAuthorKm',
        childKey: 'TirthRakshaAuthorKt',
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
  }),
  SamvatTran: popup('SamvatTran', 'TirthRakshaSamvatKm', {
    hidden: ['SamvatKindKt', 'AsamvatKt', 'BookTKt', 'SthalKt'],
    editable: ['Asamvat', 'PageNo', 'IsPrint'],
    lookups: {
      samvatkindname: { setKt: 'SamvatKindKt', setName: 'SamvatKindName', next: 'AsamvatName' },
      asamvatname: {
        setKt: 'AsamvatKt',
        setName: 'AsamvatName',
        next: 'Asamvat',
        after: (row, _p, helpers) => withIsvisan(row, helpers),
      },
      asamvat: {
        setName: 'Asamvat',
        next: 'Libno',
        after: (row, _p, helpers) => withIsvisan(row, helpers),
      },
      libno: { setKt: 'BookTKt', setName: 'Libno', next: 'PageNo' },
      sthalname: { setKt: 'SthalKt', setName: 'SthalName', next: 'seq' },
    },
    onCellEdit: (row, column, helpers) =>
      ['asamvatname', 'asamvat'].includes(column.toLowerCase()) ? withIsvisan(row, helpers) : row,
    firstColumn: 'SamvatKindName',
  }),
  KshetraTran: popup('KshetraTran', 'TirthRakshaKshetraKm', {
    hidden: ['KshetraKt'],
    editable: [],
    lookups: { kshetraname: { setKt: 'KshetraKt', setName: 'KshetraName', next: 'Seq' } },
    firstColumn: 'KshetraName',
  }),
  BhashaTran: popup('BhashaTran', 'TirthRakshaBhashaKm', {
    hidden: ['BhashaKt'],
    editable: [],
    // The rows show bhasa_attr, but the list writes bhashaname into the same cell (kept).
    lookups: { bhashaname: { setKt: 'BhashaKt', setName: 'BhashaName' } },
    firstColumn: 'BhashaName',
  }),
  KrutiTran: popup('KrutiTran', 'TirthRakshaKrutiKm', {
    hidden: ['KrutiKt'],
    editable: [],
    lookups: { krutiname: { setKt: 'KrutiKt', setName: 'KrutiName', next: 'Seq' } },
    firstColumn: 'KrutiName',
  }),
  ReferenceTran: popup('ReferenceTran', 'TirthRakshaReferenceKm', {
    hidden: ['KrutimstKt', 'BookTKt'],
    editable: ['PageNo', 'GathaNo', 'Remark'],
    lookups: {
      krutino: {
        setKt: 'KrutimstKt',
        setName: 'KrutiNo',
        also: { BookTKt: 2, Libno: 3, BookName: 4, Prakashak: 5, AuthorName: 6, Samvat: 7 },
        next: 'Libno',
      },
      libno: {
        setKt: 'BookTKt',
        setName: 'Libno',
        also: { BookName: 2, Prakashak: 3, AuthorName: 4, Samvat: 5 },
        next: 'PageNo',
      },
    },
    firstColumn: 'KrutiNo',
    // The first row naming another book: txtBookSeq = GetMaxBookSeq(it). The desktop compared
    // with the grid's current row and wrote the book into it, which in Add mode is another
    // record; here it compares with the rows the popup was opened with.
    onSaved: async ({ rows, before }, ctx) => {
      const book = Math.trunc(Number(rows[0]?.BookTKt) || 0);
      const was = Math.trunc(Number(before[0]?.BookTKt) || 0);
      if (book <= 0 || book === was) return;
      const result = await ctx.call('max-book-seq', { bookTKt: book }, []);
      if (result?.kind === 'cells') ctx.setField('BookSeq', String(result.rows[0]?.BookSeq ?? ''));
    },
  }),
  MainPersonTran: popup('MainPersonTran', 'TirthRakshaMainPersonKm', {
    hidden: ['VishayKt'],
    editable: [],
    lookups: { vishayname: { setKt: 'VishayKt', setName: 'VishayName' } },
    firstColumn: 'VishayName',
  }),
  VishayTran: popup('VishayTran', 'TirthRakshaVishayKm', {
    hidden: ['VishayKt'],
    editable: [],
    lookups: {
      vishayname: { setKt: 'VishayKt', setName: 'VishayName', also: { VishayNo: 2 } },
      vishayno: {
        lookup: 'vishayname',
        setKt: 'VishayKt',
        setName: 'VishayName',
        also: { VishayNo: 2 },
      },
    },
    firstColumn: 'VishayName',
  }),
};

const box = (
  name: string,
  at: [number, number, number],
  extra: Partial<FieldSpec> = {},
): FieldSpec => ({ name, at: { x: at[0], y: at[1], w: at[2] }, ...extra });
const labelled = (label: string, labelAt: [number, number]) => ({
  label,
  labelAt: { x: labelAt[0], y: labelAt[1] },
});
const kt = (nameColumn: string) => ({ kt: true, nameColumn });

/** The boxes in their TabIndex order. */
const FIELDS: FieldSpec[] = [
  box('TirthRakshaNameTran', [154, 18, 216], {
    ...labelled('Name(N)', [8, 22]),
    vishayEntry: 'TirthRakshaNameTran',
  }),
  box('ReferenceTran', [506, 18, 192], {
    ...labelled('Reference(P)', [374, 22]),
    trans: 'ReferenceTran',
  }),
  box('Seq', [844, 18, 78], {
    ...labelled('Seq/Book Seq', [700, 22]),
    readOnly: true,
    alwaysSend: true,
  }),
  box('AuthTran', [154, 58, 216], { ...labelled('Author(W)', [8, 62]), trans: 'AuthTran' }),
  box('KrutiTran', [506, 58, 192], { ...labelled('Kruti(K)', [374, 62]), trans: 'KrutiTran' }),
  box('PurnataKt', [844, 58, 119], {
    ...labelled('Purnata/Group No', [700, 62]),
    ...kt('PurnataName'),
  }),
  box('SamvatTran', [154, 98, 107], {
    ...labelled('Samvat(T)/Bhasha', [8, 102]),
    trans: 'SamvatTran',
  }),
  box('BhashaTran', [263, 98, 107], { trans: 'BhashaTran' }),
  box('ProjectKt', [844, 98, 158], {
    ...labelled('Project Name', [700, 102]),
    ...kt('ProjectName'),
  }),
  box('KshetraTran', [154, 138, 216], {
    ...labelled('Kshetra(A)', [8, 142]),
    trans: 'KshetraTran',
  }),
  box('TirthKt', [506, 138, 192], { ...labelled('Tirth', [374, 142]), ...kt('TirthName') }),
  box('DoneByKt', [844, 138, 158], { ...labelled('Done By(D)', [700, 142]), ...kt('DoneByName') }),
  box('VishayTran', [154, 178, 216], { ...labelled('Vishay(S)', [8, 182]), trans: 'VishayTran' }),
  box('PetaVishayTran', [506, 178, 192], {
    ...labelled('Peta Vishay(SS)', [374, 182]),
    vishayEntry: 'PetaVishayTran',
  }),
  box('ProjectDetail', [844, 178, 158], labelled('Project Detail', [700, 182])),
  box('Remark', [154, 218, 848], { ...labelled('Remark(R)', [8, 222]), h: 29 }),
  box('BookSeq', [924, 18, 78]),
  // Editable, but Save never writes it: only the Group No menu changes GroupNo.
  box('GroupNo', [964, 58, 38]),
  box('MainPersonTran', [506, 98, 192], {
    ...labelled('Main Person(M)', [374, 102]),
    trans: 'MainPersonTran',
  }),
  box('TirthRakshaRemarkTran', [154, 258, 848], {
    ...labelled('Remark(R1)', [8, 262]),
    vishayEntry: 'TirthRakshaRemarkTran',
  }),
];

/** The first carried Reference row's book, for New's BookSeq. */
const firstBook = (rows: ChildRow[] | undefined): Record<string, number> =>
  rows && rows.length > 0 ? { BookTKt: Math.trunc(Number(rows[0]!.BookTKt) || 0) } : {};

const spec: ScreenSpec = {
  screen: 'tirth-raksha-master',
  panelHeight: 290,
  panelWidth: 1008,
  entryLabel: true,
  fields: FIELDS,
  trans: TRANS,
  columns: [
    { header: 'Id', field: 'TirthRakshaKm', width: 5 },
    { header: 'BookTKt', field: 'BookTKt', width: 100, hidden: true },
    { header: 'Seq', field: 'Seq', width: 70 },
    { header: 'BookSeq', field: 'BookSeq', width: 100 },
    { header: 'Name', field: 'TirthRakshaName', width: 200 },
    { header: 'ProjectName', field: 'ProjectName', width: 100 },
    { header: 'Author', field: 'txtAuthor', width: 100 },
    { header: 'Samvat(ई.सं.)', field: 'Isvisan', width: 100 },
    { header: 'Samvat(Remark)', field: 'SamvatRemark', width: 150 },
    { header: 'Kruti', field: 'KrutiTran', width: 100 },
    { header: 'Kshetra', field: 'KshetraTran', width: 100 },
    { header: 'Tirth', field: 'TirthName', width: 100 },
    { header: 'Vishay', field: 'Vishay', width: 150 },
    { header: 'PetaVishay', field: 'PetaVishay', width: 100 },
    { header: 'RefPageNo', field: 'RefPageNo', width: 100 },
    { header: 'Bhasha', field: 'txtBhasha', width: 100 },
    { header: 'Remark', field: 'txtRemark', width: 100 },
  ],
  // btnNew_Click keeps Project, Done By and the Reference box, and starts with the Reference rows
  // (keys and PageNo cleared); Seq is GetMaxSeq, BookSeq the carried book's GetMaxBookSeq.
  onNew: {
    keep: ['ProjectKt', 'DoneByKt', 'ReferenceTran'],
    trans: {
      ReferenceTran: (state) => {
        const fresh = copyWithNewKeys('TirthRakshaReferenceKm', 'temp')(state);
        const page = state.columns.find((c) => c.name.toLowerCase() === 'pageno')?.name;
        return page ? { ...fresh, rows: fresh.rows.map((r) => ({ ...r, [page]: '' })) } : fresh;
      },
    },
    params: ({ trans }) => firstBook(trans.ReferenceTran?.rows),
  },
  // btnCopy_Click: the copy keeps the boxes and gets popup rows and Vishay lines of its own.
  copy: { clear: [], loadTrans: Object.keys(TRANS) },
};

/** cntMenu, in the designer's order. */
function menu(a: ScreenActions): ContextMenuItem[] {
  const item = (label: string, onSelect: () => void, disabled = false): ContextMenuItem => ({
    kind: 'item',
    label,
    onSelect,
    ...(disabled ? { disabled } : {}),
  });
  /** UpdateGroupNo's message, then txtGroupNo shows the group. */
  const group = async (action: string, params?: Record<string, number>) => {
    const result = await a.call(action, params);
    if (result?.kind !== 'cells') return;
    if (result.message) await a.alert(result.message);
    a.setField('GroupNo', String(result.rows[0]?.GroupNo ?? ''));
  };
  return [
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
        // SendToExcelToolStripMenuItem1_Click is empty on the desktop.
        item('Send To Excel', () => undefined, true),
        // frmWebBrowser, Home/PrintTirthRakshaReport: the selected records.
        item('Main Report', () => void a.run('main-report')),
      ],
    },
    {
      kind: 'submenu',
      label: 'Utility',
      items: [
        // ShowAllRecordsToolStripMenuItem has no Click handler on the desktop.
        item('Show All Records', () => undefined, true),
        item('Update Book Seq', async () => {
          const picked = await a.pick('book-seq', { selectFirst: true });
          const book = Number(picked?.code[0]) || 0;
          if (book <= 0) return;
          if (await a.call('update-book-seq', { bookTKt: book }, [])) a.refresh();
        }),
      ],
    },
    {
      kind: 'submenu',
      label: 'Group No',
      items: [
        item('Add In New Group', () => void group('group-new')),
        item('Add In Existing Group', async () => {
          const picked = await a.pick('groups');
          const groupNo = Number(picked?.code[0]) || 0;
          if (groupNo > 0) await group('group-existing', { groupNo });
        }),
        item('Delete From Group', () => void group('group-delete')),
      ],
    },
    {
      kind: 'submenu',
      label: 'For Selected Record',
      items: [item('Book Master', () => void a.run('book-master'))],
    },
  ];
}

export function TirthRakshaMaster(props: ScreenProps) {
  return <MasterScreen spec={spec} {...props} menu={menu} />;
}

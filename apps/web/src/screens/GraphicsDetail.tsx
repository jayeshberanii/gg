'use client';

import type { ChildRow, GridRow, PickList, TransTable } from '@gglib/shared';
import { useEffect, useState } from 'react';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import type { PickResult } from '@/components/ui/PickListDialog';
import { copyWithNewKeys } from '@/features/master/commonTrans';
import { DataGrid } from '@/features/master/DataGrid';
import { desktopOnlyMessage } from '@/features/master/desktopOnly';
import { DisplayTransDialog } from '@/features/master/DisplayTransDialog';
import { MasterScreen } from '@/features/master/MasterScreen';
import { netString } from '@/features/master/transSummary';
import type {
  FieldSpec,
  FormContext,
  GridColumnSpec,
  ScreenActions,
  ScreenSpec,
  TransSpec,
} from '@/features/master/types';
import type { MasterState } from '@/features/master/useMasterScreen';
import { todayIso } from '@/lib/format';
import { getVirSamvat } from './GraphicsMaster';
import type { ScreenProps } from './registry';

// ------------------------------------------------------------------------------------------
// Vik Samvat (Txt_Leave of txtSamvat only)
// ------------------------------------------------------------------------------------------

const isNumeric = (s: string) => /^\s*[+-]?(\d+\.?\d*|\.\d+)\s*$/.test(s);

/**
 * Leaving Samvat: with a Samvat Type picked and a Samvat typed, Vikramsamvat is
 * GetVirSamvat(type, samvat) − 470, a non-numeric Samvat counting as the sadi value its F2 pick
 * left in the Tag (so a hand-typed word gives −470: desktop quirk, kept). Leaving Samvat Type
 * recomputes nothing here, unlike Graphics Master.
 */
function onFieldLeave(
  name: string,
  fields: Record<string, string>,
  tags: Record<string, number>,
): Record<string, string> | null {
  if (name !== 'samvat') return null;
  const type = tags.samvtypeKt ?? 0;
  const samvat = (fields.samvat ?? '').trim();
  if (!(type > 0) || samvat === '') return null;
  const year = isNumeric(fields.samvat ?? '')
    ? Math.round(Number(fields.samvat))
    : Math.trunc(tags.samvat ?? 0);
  return { viksamvat: String(getVirSamvat(type, year) - 470) };
}

// ------------------------------------------------------------------------------------------
// The popups (frmDisplayTransNew.SetForm_GraphicDetail)
// ------------------------------------------------------------------------------------------

/** Txt_KeyDown after a word popup's Save: the wordnm cells, SignBetweenStr-joined. */
function wordSummary(rows: ChildRow[]): string {
  let out = '';
  for (const row of rows) {
    const word = netString(row.wordnm ?? null).trim();
    if (word === '') continue;
    out = out.trim() === '' ? word : `${out.trim()},${word}`;
  }
  return out.replace(/,,/g, ',');
}

/** A WordTran popup: a new row is {Id, 0, "", "", TranType, Rows.Count + 1}, started in wordnm. */
function wordTrans(column: string, type: string): TransSpec {
  return {
    column,
    hidden: ['GrDetailWordkm', 'grwordkt', 'typenm'],
    editable: [],
    lookups: {
      wordnm: { setKt: 'grwordkt', setName: 'wordnm', next: 'Remark' },
      // The Remark words, added to the cell with SignBetweenStr.
      remark: { setName: 'Remark', append: true, next: 'seq' },
    },
    template: ({ seq }) => [0, 0, '', '', type, seq],
    firstColumn: 'wordnm',
    onCopy: copyWithNewKeys('GrDetailWordkm', 'zero'),
    summary: (rows) => wordSummary(rows),
  };
}

/**
 * TranName "Subject" (`internal` 0) or TranType "Internal" (1): {Id, 0, "", 0, "", "", Internal,
 * Rows.Count + 1}, started in Sign. TsBtnSave numbers seq as binding groups: from the table's
 * global MAX(seq), one more for each row whose Sign is "*", the rows after it sharing its number
 * (a first row without "*" joins the current MAX group: desktop quirk, kept).
 */
function subjectTrans(column: string, internal: 0 | 1): TransSpec {
  return {
    column,
    hidden: ['grdetailSubKm', 'grvishaykt', 'internal', 'signkt'],
    editable: [],
    lookups: {
      sign: { setKt: 'signkt', setName: 'Sign' },
      vishaynm: { setKt: 'grvishaykt', setName: 'vishaynm', next: 'remark' },
      remark: { append: true },
    },
    template: ({ seq }) => [0, 0, '', 0, '', '', internal, seq],
    firstColumn: 'Sign',
    onCopy: copyWithNewKeys('grdetailSubKm', 'zero'),
    beforeSave: async (rows, helpers) => {
      const max = await helpers.lookup('maxseq', {});
      let seq = Number(max.rows[0]?.[0]) || 0;
      return rows.map((r) => {
        if (netString(r.Sign ?? null) === '*') seq += 1;
        return { ...r, seq };
      });
    },
    summary: 'generic',
  };
}

const TRANS: Record<string, TransSpec> = {
  GrDetailSubTran: subjectTrans('GrDetailSubTran', 0),
  IntSubjectTran: subjectTrans('IntSubjectTran', 1),
  VisheshTran: wordTrans('VisheshTran', 'Vishesh'),
  CreatorTypeTran: wordTrans('CreatorTypeTran', 'CreatorType'),
  CreatorTran: wordTrans('CreatorTran', 'Creator'),
  MaterialTran: wordTrans('MaterialTran', 'Material'),
  StyleTran: wordTrans('StyleTran', 'Style'),
  AvailableAtTran: wordTrans('AvailableAtTran', 'AvailableAt'),
  // TranName "Grdetail": {Id, 0, 0, "", "", "", "", Rows.Count + 1}, started in BookTName. The
  // filepath cell's OpenFileDialog is typed text here (files are deferred).
  GrdetailOtherRefTran: {
    column: 'GrdetailOtherRefTran',
    hidden: ['GrdetailOtherRefTKm', 'graphicbkt', 'BookTKt'],
    editable: ['Refplace', 'filepath'],
    lookups: { booktname: { setKt: 'BookTKt', setName: 'BookTName', next: 'Refplace' } },
    template: ({ seq }) => [0, 0, 0, '', '', '', '', seq],
    firstColumn: 'BookTName',
    onCopy: copyWithNewKeys('GrdetailOtherRefTKm', 'zero'),
    summary: 'generic',
  },
};

/**
 * Utility › insert into grouping records (TranName "grouping"): {Id, 0, "", 0, "", 0, "", 0, "",
 * 0, "", Today, 0, "", Rows.Count + 1}, started in Title. Title is typed (the desktop left it
 * read-only, so it could never be filled in); givendate stays the day the row was added.
 */
const GROUPING_TRANS: TransSpec = {
  column: 'grouping',
  hidden: [
    'GrdetailSelectedPicTKm',
    'grpnokm',
    'requiredbykt',
    'selectedbykt',
    'grvishaykt',
    'grwordkt',
    'signkt',
  ],
  editable: ['Title'],
  lookups: {
    requiredby: { setKt: 'requiredbykt', setName: 'requiredby', next: 'selectedby' },
    selectedby: { setKt: 'selectedbykt', setName: 'selectedby', next: 'vishaynm' },
    vishaynm: { setKt: 'grvishaykt', setName: 'vishaynm', next: 'wordnm' },
    wordnm: { setKt: 'grwordkt', setName: 'wordnm', next: 'givendate' },
    sign: { setKt: 'signkt', setName: 'sign', next: 'seq' },
  },
  template: ({ seq }) => [0, 0, '', 0, '', 0, '', 0, '', 0, '', todayIso(), 0, '', seq],
  firstColumn: 'Title',
};

const GROUPING_COLUMNS: TransTable['columns'] = [
  ['GrdetailSelectedPicTKm', 'int'],
  ['grpnokm', 'int'],
  ['Title', 'nvarchar'],
  ['requiredbykt', 'int'],
  ['requiredby', 'nvarchar'],
  ['selectedbykt', 'int'],
  ['selectedby', 'nvarchar'],
  ['grvishaykt', 'int'],
  ['vishaynm', 'nvarchar'],
  ['grwordkt', 'int'],
  ['wordnm', 'nvarchar'],
  ['givendate', 'date'],
  ['signkt', 'int'],
  ['sign', 'nvarchar'],
  ['seq', 'int'],
].map(([name, type]) => ({ name: name!, type: type! }));

// ------------------------------------------------------------------------------------------
// The panel (frmGraphicsDetail.Designer.vb, inside SplitContainer1.Panel1)
// ------------------------------------------------------------------------------------------

const box = (name: string, at: [number, number, number], extra: Partial<FieldSpec> = {}) =>
  ({ name, at: { x: at[0], y: at[1], w: at[2] }, ...extra }) as FieldSpec;
const kt = (nameColumn: string): Partial<FieldSpec> => ({ kt: true, nameColumn });

/** The Samvat F2 (sadimst): the text takes sadinm, the Tag sadivalue. */
function samvatPicked(picked: { code: string }, ctx: FormContext) {
  ctx.setTag('samvat', Number(picked.code) || 0);
}

/** A pick's Text: DisplayListForm puts the list's second column in the box. */
const pickText = (p: PickResult) => netString((p.rows[0]?.[1] ?? p.rows[0]?.[0] ?? null) as never);

const asList = (r: Awaited<ReturnType<ScreenActions['call']>>): PickList | null =>
  r?.kind === 'table' ? { columns: r.columns, rows: r.rows } : null;

/** The "… in Selected Record" menus' types, with their menu text. */
const BULK: [type: string, label: string][] = [
  ['subject', 'Subject'],
  ['material', 'Material'],
  ['style', 'Style'],
  ['grade', 'Grade'],
  ['availableat', 'Available At'],
  ['creator', 'Creator'],
  ['creatortype', 'Creator Type'],
  ['vishesh', 'Vishesh'],
];

/** ReplaceSelectedRecord: the old value, the new one, the Security password. */
async function replaceSelected(a: ScreenActions, type: string) {
  if (a.selectedIds.length === 0) return;
  const oldList = asList(await a.call('bulk-list', { op: 'old', type }));
  if (!oldList) return;
  const old = await a.pick(oldList);
  if (!old) return;
  const newList = asList(await a.call('bulk-list', { op: 'new', type }));
  if (!newList) return;
  const now = await a.pick(newList);
  if (!now) return;
  const password = await a.askPassword();
  if (password === null) return;
  await a.run('bulk-replace', {
    type,
    oldId: Number(old.code[0]) || 0,
    oldText: pickText(old),
    newId: Number(now.code[0]) || 0,
    newText: pickText(now),
    password,
  });
}

/** InsertInSelectedRecord / DeleteInSelectedRecord: the value, then the Security password. */
async function insertOrDelete(a: ScreenActions, op: 'insert' | 'delete', type: string) {
  if (a.selectedIds.length === 0) return;
  const list = asList(await a.call('bulk-list', { op, type }));
  if (!list) return;
  const pick = await a.pick(list);
  if (!pick) return;
  const password = await a.askPassword();
  if (password === null) return;
  await a.run(op === 'insert' ? 'bulk-insert' : 'bulk-delete', {
    type,
    pickId: Number(pick.code[0]) || 0,
    pickText: pickText(pick),
    password,
  });
}

/** Delete in Selected Record › File Path: InputBoxProc("vis123"), then the Yes/No. */
async function deleteFilePath(a: ScreenActions) {
  if (a.selectedIds.length === 0) return;
  const password = await a.askPassword();
  if (password === null) return;
  if (!(await a.confirm('Are you sure to Delete File Path for Selected Record?'))) return;
  await a.run('delete-filepath', { password });
}

/** Utility › Break And Bind: a bound subject, then one of its group's other subjects. */
async function breakAndBind(a: ScreenActions) {
  const first = await a.pick('break-bind-subjects');
  const v = Number(first?.code[0]) || 0;
  if (v <= 0) return;
  const second = await a.pick('break-bind-members', { params: { v }, selectFirst: false });
  const w = Number(second?.code[0]) || 0;
  if (w <= 0) return;
  await a.run('break-and-bind', { v, w }, []);
}

/** Utility › Update Patrika For Selected Records. */
async function updatePatrika(a: ScreenActions) {
  const pick = await a.pick('patrika');
  const patrika = Number(pick?.code[0]) || 0;
  if (patrika > 0) await a.run('update-patrika', { patrika });
}

type Grouping = { group: number; remarks: string; ids: number[]; table: TransTable };

/** Utility › insert into grouping records, up to its popup (the Save is the popup's). */
async function startGrouping(a: ScreenActions, open: (g: Grouping) => void) {
  const ids = a.selectedIds;
  if (ids.length === 0) return;
  const r = await a.call('grouping-start', {}, ids);
  if (r?.kind !== 'form') return;
  const group = Number(r.fields.group) || 0;
  // A new group asks for its remark first (an InputBox: Cancel gives "").
  const remarks = group === 0 ? ((await a.input('Enter Remarks')) ?? '') : '';
  const rows = (r.trans.grouping?.rows ?? []).map((row) => ({
    ...row,
    givendate: netString(row.givendate ?? null).slice(0, 10),
  }));
  open({ group, remarks, ids, table: { columns: GROUPING_COLUMNS, rows } });
}

const desktopOnly = (a: ScreenActions, what: string) => () =>
  void a.alert(desktopOnlyMessage(what));

/** cntGrid, item for item. */
function menu(
  a: ScreenActions,
  state: MasterState,
  openGrouping: (g: Grouping) => void,
): ContextMenuItem[] {
  // FillData: a Locked record turns Replace / Insert / Delete in Selected Record off.
  const off = state.locked;
  const bulkItems = (run: (type: string) => void): ContextMenuItem[] =>
    BULK.map(([type, label]) => ({
      kind: 'item',
      label,
      disabled: off,
      onSelect: () => run(type),
    }));
  return [
    { kind: 'item', label: 'Show Pictures', onSelect: desktopOnly(a, 'Show Pictures') },
    {
      kind: 'submenu',
      label: 'Show Record From Selected Record',
      items: [
        {
          kind: 'item',
          label: "File Not Found on it's Original Location",
          onSelect: desktopOnly(a, 'File Not Found on its Original Location'),
        },
        {
          kind: 'item',
          label: 'Having Same FileName',
          onSelect: () => void a.run('same-filename', {}, []),
        },
        {
          kind: 'item',
          label: 'Having RefPlace Not Match with FileName',
          onSelect: () => void a.run('refplace-mismatch'),
        },
        {
          kind: 'item',
          label: '-XXX Deleted Picture',
          onSelect: desktopOnly(a, '-XXX Deleted Picture'),
        },
      ],
    },
    {
      kind: 'item',
      label: 'Copy to TempGr And Open with Acdsee - Selected Record',
      onSelect: desktopOnly(a, 'Copy to TempGr And Open with Acdsee'),
    },
    {
      kind: 'submenu',
      label: 'Print Record',
      items: [
        // FullCardToolStripMenuItem_Click has no body; Master Column has no handler.
        // { kind: 'item', label: 'Full Card', onSelect: () => undefined },
        // { kind: 'item', label: 'Master Column', onSelect: () => undefined },
        // {
        //   kind: 'item',
        //   label: 'Ref Place having not filepath for given book',
        //   onSelect: () =>
        //     void a.run('refplace-no-filepath', { graphickt: a.tags.Graphickt ?? 0 }, []),
        // },
        a.printLayouts.length > 0
          ? {
              kind: 'submenu',
              label: 'Selected Column',
              items: a.printLayouts,
              onSelect: a.printSelectedColumn,
            }
          : { kind: 'item', label: 'Selected Column', onSelect: a.printSelectedColumn },
        // {
        //   kind: 'item',
        //   label: 'Showing Mismatch Of No Of Images',
        //   onSelect: desktopOnly(a, 'Showing Mismatch Of No Of Images'),
        // },
        { kind: 'item', label: 'Send to Excel', onSelect: a.sendToExcel },
        // {
        //   kind: 'item',
        //   label: 'Duplicate RecordNo',
        //   onSelect: () => void a.run('duplicate-recno', { gridIds: a.gridIds }, []),
        // },
      ],
    },
    {
      kind: 'submenu',
      label: 'Replace in Selected Record',
      items: bulkItems((type) => void replaceSelected(a, type)),
    },
    {
      kind: 'submenu',
      label: 'Insert in Selected Record',
      items: bulkItems((type) => void insertOrDelete(a, 'insert', type)),
    },
    {
      kind: 'submenu',
      label: 'Delete in Selected Record',
      items: [
        ...bulkItems((type) => void insertOrDelete(a, 'delete', type)).slice(0, 7),
        { kind: 'item', label: 'File Path', disabled: off, onSelect: () => void deleteFilePath(a) },
        ...bulkItems((type) => void insertOrDelete(a, 'delete', type)).slice(7),
      ],
    },
    {
      kind: 'submenu',
      label: 'Utility',
      items: [
        {
          kind: 'item',
          label: 'Show File Not Linked for Give Book',
          onSelect: desktopOnly(a, 'Show File Not Linked for Give Book'),
        },
        {
          kind: 'item',
          label: 'Update Blank Filepath For Given Book',
          onSelect: desktopOnly(a, 'Update Blank Filepath For Given Book'),
        },
        {
          kind: 'item',
          label: 'Send Image To Folder',
          onSelect: desktopOnly(a, 'Send Image To Folder'),
        },
        {
          kind: 'item',
          label: 'Rename File Name Records',
          onSelect: desktopOnly(a, 'Rename File Name Records'),
        },
        {
          kind: 'item',
          label: 'Rename File Name With Refpls for selected Reords',
          onSelect: desktopOnly(a, 'Rename File Name With Refpls'),
        },
        {
          kind: 'item',
          label: 'insert into grouping records',
          onSelect: () => void startGrouping(a, openGrouping),
        },
        { kind: 'item', label: 'Break And Bind', onSelect: () => void breakAndBind(a) },
        {
          kind: 'item',
          label: 'Update Patrika For Selected Records',
          onSelect: () => void updatePatrika(a),
        },
      ],
    },
    {
      kind: 'submenu',
      label: 'Show For Selected Records',
      items: [
        { kind: 'item', label: 'BookM', onSelect: () => void a.run('open-bookm') },
        {
          kind: 'item',
          label: 'Graphics Master',
          onSelect: () => void a.run('open-graphics-master'),
        },
        { kind: 'item', label: 'Patrika', onSelect: () => void a.run('open-patrika') },
      ],
    },
  ];
}

// ------------------------------------------------------------------------------------------
// dgGraphicMaster: the record's Graphics Master row, above the list
// ------------------------------------------------------------------------------------------

const PARENT_COLUMNS: GridColumnSpec[] = [
  { header: 'graphicBkm', field: 'graphicBkm', width: 80 },
  { header: 'RecNo', field: 'recno', width: 60 },
  { header: 'BookTKt', field: 'BookTKt', hidden: true },
  { header: 'Book Name', field: 'bkname', width: 120 },
  { header: 'LibNo', field: 'BookTName', width: 90 },
  { header: 'Color', field: 'color', width: 90 },
  { header: 'Grade', field: 'grade', width: 80 },
  { header: 'Vishesh', field: 'VisheshTran', width: 100 },
  { header: 'AvailableAt', field: 'availableat', width: 100 },
  { header: 'Work DoneBy', field: 'WorkDoneByName', width: 100 },
  { header: 'Finalized', field: 'finalized', width: 60 },
  { header: 'FinalizeDate', field: 'finalizeddate', width: 90, format: 'date' },
  { header: 'ProofBy', field: 'ProofByTran', width: 100 },
];

/**
 * FillGraphicMaster: the loaded record's parent (FillData), the master Add Detail opened the
 * window for, or the first listed row's when no record is loaded. Its ContextMenuStrip1 is the
 * picture box's too (Select / Remove Picture), plus Utility › Request For Book(LabIssue).
 */
function ParentGrid({
  a,
  state,
  initial,
}: {
  a: ScreenActions;
  state: MasterState;
  initial: number;
}) {
  const [parentId, setParentId] = useState(initial);
  const [rows, setRows] = useState<GridRow[]>([]);
  const loadedParent = Number(state.loaded?.Graphickt) || 0;
  const firstParent = Number(state.visibleRows[0]?.Graphickt) || 0;
  useEffect(() => {
    if (loadedParent > 0) setParentId(loadedParent);
  }, [loadedParent, state.loaded]);
  useEffect(() => {
    if (parentId === 0 && firstParent > 0) setParentId(firstParent);
  }, [firstParent]);
  useEffect(() => {
    if (parentId <= 0) {
      setRows([]);
      return;
    }
    void a.call('graphic-master-row', {}, [parentId]).then((r) => {
      if (r?.kind === 'list') setRows(r.rows);
    });
  }, [parentId, state.loaded]);
  const items: ContextMenuItem[] = [
    // { kind: 'item', label: 'Select Picture', onSelect: desktopOnly(a, 'Select Picture') },
    // // Remove Picture: FilePath = "" (saved with the record's next Save).
    // { kind: 'item', label: 'Remove Picture', onSelect: () => a.setField('filepath', '') },
    {
      kind: 'submenu',
      label: 'Utility',
      items: [
        {
          kind: 'item',
          label: 'Request For Book(LabIssue)',
          onSelect: () => {
            if (rows.length > 0) void a.run('request-lab-issue', {}, [parentId]);
          },
        },
      ],
    },
  ];
  return (
    <div style={{ height: 64 }} className="mb-1 shrink-0" aria-label="Graphics Master record">
      <DataGrid
        rows={rows}
        columns={PARENT_COLUMNS}
        rowKey={(r) => String(r.graphicBkm)}
        multiSelect={false}
        menuItems={items}
        menuLabel="Graphics Master record"
      />
    </div>
  );
}

const spec: ScreenSpec = {
  screen: 'graphics-detail',
  panelHeight: 296,
  panelWidth: 1008,
  labels: [
    { text: 'Lib No', at: { x: 13, y: 22 } },
    { text: 'Rec No', at: { x: 285, y: 22 } },
    { text: 'Ref Place', at: { x: 525, y: 25 } },
    { text: 'Picture Qty', at: { x: 13, y: 62 } },
    { text: 'Subject', at: { x: 285, y: 62 } },
    { text: 'Grade/Patrika', at: { x: 525, y: 62 } },
    { text: 'Color', at: { x: 13, y: 102 } },
    { text: 'Material', at: { x: 285, y: 102 } },
    { text: 'Style', at: { x: 525, y: 102 } },
    { text: 'Available At', at: { x: 13, y: 142 } },
    { text: 'Creator Type', at: { x: 285, y: 142 } },
    { text: 'Creator', at: { x: 525, y: 142 } },
    { text: 'Vishesh', at: { x: 13, y: 182 } },
    { text: 'Temp Selected', at: { x: 285, y: 182 } },
    { text: 'IntSubject', at: { x: 525, y: 182 } },
    { text: 'Samvat Type', at: { x: 13, y: 222 } },
    { text: 'Samvat', at: { x: 285, y: 222 } },
    { text: 'Vikramsamvat', at: { x: 525, y: 222 } },
    { text: 'Remark', at: { x: 13, y: 262 } },
    { text: 'comment', at: { x: 287, y: 262 } },
    { text: 'Other LibNo', at: { x: 525, y: 262 } },
    // PicImage (796,30): the picture's path, typed (the picture itself needs the desktop).
    { text: 'File Path', at: { x: 796, y: 6 }, sizePt: 9 },
  ],
  fields: [
    box('Graphickt', [121, 20, 158], kt('LibNo')),
    box('recno', [409, 20, 108], { noF2: true }),
    box('refplace', [661, 20, 124]),
    box('pictureQty', [121, 58, 158]),
    box('GrDetailSubTran', [409, 58, 108], { trans: 'GrDetailSubTran' }),
    box('grade', [661, 58, 61]),
    box('PatrikaKt', [724, 58, 61], kt('PatrikaName')),
    box('color', [121, 98, 158]),
    box('MaterialTran', [409, 98, 108], { trans: 'MaterialTran' }),
    box('StyleTran', [661, 98, 124], { trans: 'StyleTran' }),
    box('AvailableAtTran', [121, 138, 158], { trans: 'AvailableAtTran' }),
    box('CreatorTypeTran', [409, 138, 108], { trans: 'CreatorTypeTran' }),
    box('CreatorTran', [661, 138, 124], { trans: 'CreatorTran' }),
    box('VisheshTran', [121, 178, 158], { trans: 'VisheshTran' }),
    box('tempselected', [409, 178, 108]),
    box('IntSubjectTran', [661, 178, 124], { trans: 'IntSubjectTran' }),
    box('samvtypeKt', [121, 218, 158], kt('SamvTypeName')),
    box('samvat', [409, 218, 108], { afterPick: samvatPicked }),
    box('viksamvat', [661, 218, 124], { noF2: true }),
    box('remark', [121, 258, 158]),
    box('comment', [410, 258, 109]),
    box('GrdetailOtherRefTran', [661, 258, 124], { trans: 'GrdetailOtherRefTran' }),
    box('filepath', [796, 30, 203], { noF2: true, h: 87 }),
    box('pending', [796, 261, 89], { checkbox: 'Pending' }),
  ],
  trans: TRANS,
  help: true,
  onFieldLeave,
  // btnNew_Click keeps Lib No (text and Tag) and the Style text and rows.
  onNew: {
    keep: ['Graphickt', 'StyleTran'],
    trans: { StyleTran: copyWithNewKeys('GrDetailWordkm', 'zero') },
  },
  // Add Detail: the window lists the book's pictures (WhereCondition " and Graphickt in (<id>)")
  // and starts a new one; with "Copy Master Data" its popups start with the master's rows.
  initialNew: {
    scope: (p) => (Number(p.Graphickt) > 0 ? { graphickt: Number(p.Graphickt) } : null),
    after: async (p, ctx) => {
      const from = Number(p.CopyFromGraphicBkm) || 0;
      if (from <= 0) return;
      const r = await ctx.call('master-rows', { graphicBkm: from }, []);
      if (r?.kind !== 'form') return;
      for (const [key, { rows }] of Object.entries(r.trans)) {
        if (!TRANS[key]) continue;
        const base = await ctx.loadTrans(key);
        if (base) ctx.putTrans(key, rows, { keepText: true, base });
      }
    },
  },
  // Save(): "Do You Want to Add More With Copying Data?" under "Record Saved Successfully",
  // after an Add or an Edit: Yes stays in Add with every box kept and the nine popups reloaded
  // from the saved record.
  continueAdding: {
    question: 'Do You Want to Add More With Copying Data?',
    title: 'Record Saved Successfully',
    clear: [],
    edit: true,
    loadTrans: Object.keys(TRANS),
  },
  lockedColumns: ['Locked'],
  lockAction: 'lock-records',
  deleteSelected: true,
  entryLabel: true,
  columns: [
    { header: 'Id', field: 'graphicBkTkm', width: 80 },
    { header: 'RecNo', field: 'recno', width: 100 },
    { header: 'RefPlace', field: 'refplace', width: 110 },
    { header: 'Picture Qty', field: 'pictureQty', width: 100 },
    { header: 'Grade', field: 'grade', width: 100 },
    { header: 'File Path', field: 'filepath', width: 180 },
    { header: 'Color', field: 'color', width: 100 },
    { header: 'VikSamvat', field: 'viksamvat', width: 100 },
    { header: 'TemSelected', field: 'tempselected', width: 100 },
    { header: 'Comment', field: 'comment', width: 100 },
    { header: 'Vishesh', field: 'VisheshTran', width: 120 },
    { header: 'Graphickt', field: 'Graphickt', hidden: true },
    { header: 'Pending', field: 'pending', width: 100 },
  ],
};

/**
 * Graphics › Graphics Detail (frmGraphicsDetail). Positions, widths and headers are
 * frmGraphicsDetail.Designer.vb's. The picture box is a File Path text box (files are deferred).
 * See docs/screens/graphics-detail.md.
 */
export function GraphicsDetail(props: ScreenProps) {
  const [grouping, setGrouping] = useState<Grouping | null>(null);
  const [runGroupingSave, setRunGroupingSave] = useState<ScreenActions | null>(null);
  const initial = Number(props.initialNew?.Graphickt) || 0;
  return (
    <>
      <MasterScreen
        spec={spec}
        {...props}
        menu={(a, state) => {
          return menu(a, state, (g) => {
            setRunGroupingSave(a);
            setGrouping(g);
          });
        }}
        aboveGrid={(a, state) => <ParentGrid a={a} state={state} initial={initial} />}
      />
      {grouping && runGroupingSave && (
        <DisplayTransDialog
          screen={spec.screen}
          spec={GROUPING_TRANS}
          table={grouping.table}
          onClose={() => setGrouping(null)}
          onSave={(rows) => {
            const g = grouping;
            setGrouping(null);
            void runGroupingSave.run(
              'grouping-save',
              { remarks: g.remarks, rows: JSON.stringify(rows) },
              g.ids,
            );
          }}
        />
      )}
    </>
  );
}

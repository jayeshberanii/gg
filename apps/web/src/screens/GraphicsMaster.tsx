'use client';

import type { ChildRow } from '@gglib/shared';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import { copyWithNewKeys } from '@/features/master/commonTrans';
import { MasterScreen } from '@/features/master/MasterScreen';
import { netString } from '@/features/master/transSummary';
import type {
  FieldSpec,
  FormContext,
  ScreenActions,
  ScreenSpec,
  TransSpec,
} from '@/features/master/types';
import type { MasterState } from '@/features/master/useMasterScreen';
import type { ScreenProps } from './registry';

// ------------------------------------------------------------------------------------------
// Vik Samvat (frmGraphicMaster.GetVikramSamvat; frmGraphicsDetail uses the same formula)
// ------------------------------------------------------------------------------------------

/** MdlLib.GetVirSamvat: a year of another samvat as Vir samvat (0 for an unknown type). */
export function getVirSamvat(type: number, year: number): number {
  if (type <= 1 || year <= 0) return 0;
  switch (type) {
    case 3:
    case 7:
      return year;
    case 2:
    case 6:
      return year + 470;
    case 4:
      return year + 56 + 470;
    case 5:
      return year + 134 + 470;
    case 8:
      return 526 - year;
    case 9:
      return -year;
    case 10:
      return 470 - year;
    default:
      return 0;
  }
}

const isNumeric = (s: string) => /^\s*[+-]?(\d+\.?\d*|\.\d+)\s*$/.test(s);

/**
 * GetVikramSamvat: with a Samvat Type (text and id) and a Samvat, Vik Samvat is
 * GetVirSamvat(type, samvat) − 470, where a non-numeric Samvat counts as the sadi value its
 * sadimst pick left in the box's Tag. A Samvat typed by hand that is not a number therefore
 * gives −470 (desktop quirk, kept). Null: the box is left as it is.
 */
export function graphicsVikSamvat(
  typeText: string,
  typeId: number,
  samvat: string,
  sadiValue: number,
): string | null {
  if (typeText.trim() === '' || !(typeId > 0) || samvat === '') return null;
  const year = isNumeric(samvat) ? Math.round(Number(samvat)) : Math.trunc(sadiValue) || 0;
  return String(getVirSamvat(typeId, year) - 470);
}

/** Txt_Leave: leaving Samvat or Samvat Type recomputes Vik Samvat. */
function onFieldLeave(
  name: string,
  fields: Record<string, string>,
  tags: Record<string, number>,
): Record<string, string> | null {
  if (name !== 'samvat' && name !== 'SamvTypeKt') return null;
  const vk = graphicsVikSamvat(
    fields.SamvTypeKt ?? '',
    tags.SamvTypeKt ?? 0,
    fields.samvat ?? '',
    tags.samvat ?? 0,
  );
  return vk === null ? null : { viksamvat: vk };
}

// ------------------------------------------------------------------------------------------
// The popups (frmDisplayTransNew.SetForm_GraphicMaster)
// ------------------------------------------------------------------------------------------

/** Txt_KeyDown after a word popup's Save: the wordnm cells, SignBetweenStr-joined. */
function wordSummary(rows: ChildRow[]): string {
  let out = '';
  for (const row of rows) {
    const word = netString(row.wordnm ?? row.WordNm ?? null).trim();
    if (word === '') continue;
    out = out.trim() === '' ? word : `${out.trim()},${word}`;
  }
  return out.replace(/,,/g, ',');
}

/** A WordTran popup: a new row is {Id, 0, "", TranType, Rows.Count + 1}, started in wordnm. */
function wordTrans(column: string, type: string): TransSpec {
  return {
    column,
    hidden: ['GrBookWordkm', 'grwordkt', 'typenm'],
    editable: [],
    lookups: { wordnm: { setKt: 'grwordkt', setName: 'wordnm', next: 'seq' } },
    template: ({ seq }) => [0, 0, '', type, seq],
    firstColumn: 'wordnm',
    onCopy: copyWithNewKeys('GrBookWordkm', 'zero'),
    summary: (rows) => wordSummary(rows),
  };
}

const DATE_PROMPT = 'Please Enter Date in dd/MM/yyyy Format(Ex.:- (01/12/2015)';
const today = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const TRANS: Record<string, TransSpec> = {
  VisheshTran: wordTrans('VisheshTran', 'Vishesh'),
  CreatorTypeTran: wordTrans('CreatorTypeTran', 'CreatorType'),
  CreatorTran: wordTrans('CreatorTran', 'Creator'),
  MaterialTran: wordTrans('MaterialTran', 'Material'),
  StyleTran: wordTrans('StyleTran', 'Style'),
  // TranName "Subject": {Id, 0, "", Rows.Count + 1}, started in vishaynm.
  GrbookSubTran: {
    column: 'GrbookSubTran',
    hidden: ['grbooksubkm', 'grvishaykt'],
    editable: [],
    lookups: { vishaynm: { setKt: 'grvishaykt', setName: 'vishaynm', next: 'seq' } },
    template: ({ seq }) => [0, 0, '', seq],
    firstColumn: 'vishaynm',
    onCopy: copyWithNewKeys('grbooksubkm', 'zero'),
    summary: 'generic',
  },
  // TranName "ProofBy": {0, 0, "", 0, "", "", "", Rows.Count + 1}, started in ProofBy.
  ProofByTran: {
    column: 'ProofByTran',
    hidden: ['GrBookProofByKm', 'ProofByKt', 'ProofTypeKt'],
    editable: ['Remark'],
    lookups: {
      proofby: { setKt: 'ProofByKt', setName: 'ProofBy', next: 'ProofType' },
      prooftype: { setKt: 'ProofTypeKt', setName: 'ProofType', next: 'ProofDate' },
      proofdate: {
        setName: 'ProofDate',
        input: { prompt: DATE_PROMPT, initial: today },
        next: 'Remark',
      },
    },
    template: ({ seq }) => [0, 0, '', 0, '', '', '', seq],
    firstColumn: 'ProofBy',
    onCopy: copyWithNewKeys('GrBookProofByKm', 'zero'),
    summary: 'generic',
  },
};

// ------------------------------------------------------------------------------------------
// The panel (frmGraphicMaster.Designer.vb, inside SplitContainer1.Panel1)
// ------------------------------------------------------------------------------------------

const box = (name: string, at: [number, number, number], extra: Partial<FieldSpec> = {}) =>
  ({ name, at: { x: at[0], y: at[1], w: at[2] }, ...extra }) as FieldSpec;
const kt = (nameColumn: string): Partial<FieldSpec> => ({ kt: true, nameColumn });

/** Txt_KeyDown's txtBookTKt pick: Book Name, Samvat Type and Samvat from the book, then Vik Samvat. */
function libNoPicked(picked: { row?: unknown[] }, ctx: FormContext) {
  const row = picked.row ?? [];
  const cell = (i: number) => netString((row[i] ?? null) as never);
  const typeText = cell(3);
  const typeId = Number(row[6]) || 0;
  const samvat = cell(4);
  ctx.setField('bkname', cell(2));
  ctx.setField('SamvTypeKt', typeText);
  ctx.setTag('SamvTypeKt', typeId);
  ctx.setField('samvat', samvat);
  const vk = graphicsVikSamvat(typeText, typeId, samvat, ctx.tags.samvat ?? 0);
  if (vk !== null) ctx.setField('viksamvat', vk);
}

/** The Samvat F2 (sadimst): the text takes sadinm, the Tag sadivalue. */
function samvatPicked(picked: { name: string; code: string }, ctx: FormContext) {
  const sadi = Number(picked.code) || 0;
  ctx.setTag('samvat', sadi);
  const vk = graphicsVikSamvat(
    ctx.fields.SamvTypeKt ?? '',
    ctx.tags.SamvTypeKt ?? 0,
    picked.name,
    sadi,
  );
  if (vk !== null) ctx.setField('viksamvat', vk);
}

/**
 * Delete(): CheckRecordInUse first ("Record Cannot Be Deleted"), then the question, then the
 * Security password.
 */
async function deleteFlow(a: ScreenActions, state: MasterState) {
  const id = state.currentId;
  if (id === null) return;
  const used = await a.call('in-use', {}, [id]);
  const inUse = used?.kind === 'message' ? used.message : '';
  if (inUse !== '') {
    await a.alert(inUse, 'Record Cannot Be Deleted');
    return;
  }
  if (!(await a.confirm('Are You Sure to Delete This Record?'))) return;
  const password = await a.askPassword();
  if (password !== null) await state.remove(password);
}

/** cntMenu, item for item. */
function menu(a: ScreenActions): ContextMenuItem[] {
  return [
    {
      kind: 'item',
      label: 'Add Detail',
      onSelect: () =>
        void (async () => {
          if (a.currentId === null) return;
          const copy = await a.confirm('Do You Want To Copy Master Data?');
          await a.run('add-detail', { copy }, [a.currentId]);
        })(),
    },
    {
      kind: 'submenu',
      label: 'Print Report',
      items: [
        a.printLayouts.length > 0
          ? {
              kind: 'submenu',
              label: 'Selected Column',
              items: a.printLayouts,
              onSelect: a.printSelectedColumn,
            }
          : { kind: 'item', label: 'Selected Column', onSelect: a.printSelectedColumn },
        { kind: 'item', label: 'Send To Excel', onSelect: a.sendToExcel },
      ],
    },
    // PrintFullCardToolStripMenuItem_Click has no body on the desktop.
    // { kind: 'item', label: 'Print Full Card', onSelect: () => undefined },
    // {
    //   kind: 'item',
    //   label: 'Print Duplicate No',
    //   onSelect: () => void a.run('duplicate-no', { gridIds: a.gridIds }, []),
    // },
    {
      kind: 'submenu',
      label: 'For Selected Record',
      items: [
        { kind: 'item', label: 'BookM', onSelect: () => void a.run('open-bookm') },
        {
          kind: 'item',
          label: 'Graphics Detail',
          onSelect: () => void a.run('open-graphics-detail'),
        },
      ],
    },
    {
      kind: 'submenu',
      label: 'Utility',
      items: [
        {
          kind: 'item',
          label: 'Request For Book(LabIssue)',
          onSelect: () => void a.run('request-lab-issue'),
        },
      ],
    },
  ];
}

/**
 * Graphics › Graphics Master (frmGraphicMaster). Positions, widths and headers are
 * frmGraphicMaster.Designer.vb's. The picture box (PicImage) never shows a picture on the
 * desktop (DisplayImage's body is commented out), so it is drawn as an empty frame.
 * See docs/screens/graphics-master.md.
 */
const spec: ScreenSpec = {
  screen: 'graphics-master',
  panelHeight: 382,
  panelWidth: 1008,
  labels: [
    { text: 'Rec No', at: { x: 13, y: 22 } },
    { text: 'Lib No', at: { x: 379, y: 22 } },
    { text: 'Vishesh', at: { x: 13, y: 62 } },
    { text: 'Subject', at: { x: 379, y: 62 } },
    { text: 'Samvat Type', at: { x: 13, y: 102 } },
    { text: 'Samvat', at: { x: 379, y: 102 } },
    { text: 'Finalized Date', at: { x: 13, y: 142 } },
    { text: 'Material', at: { x: 379, y: 142 } },
    { text: 'Proof By', at: { x: 13, y: 182 } },
    { text: 'WorkDone By', at: { x: 379, y: 182 } },
    { text: 'Grade/Quality', at: { x: 13, y: 222 } },
    { text: 'Book Name', at: { x: 379, y: 222 } },
    { text: 'Available At', at: { x: 13, y: 262 } },
    { text: 'Style', at: { x: 379, y: 262 } },
    { text: 'Creator Type', at: { x: 13, y: 302 } },
    { text: 'Creator', at: { x: 379, y: 302 } },
    { text: 'Comment', at: { x: 720, y: 302 } },
    { text: 'Remark', at: { x: 13, y: 342 } },
    { text: 'Color', at: { x: 379, y: 342 } },
    { text: 'Other LibNo', at: { x: 720, y: 342 } },
  ],
  groups: [{ text: '', at: { x: 724, y: 18, w: 252, h: 229 } }],
  fields: [
    box('recno', [136, 18, 227], { noF2: true }),
    box('BookTKt', [493, 18, 195], { ...kt('BookTName'), afterPick: libNoPicked }),
    box('VisheshTran', [136, 58, 227], { trans: 'VisheshTran' }),
    box('GrbookSubTran', [493, 58, 195], { trans: 'GrbookSubTran' }),
    box('SamvTypeKt', [136, 98, 227], kt('SamvTypeName')),
    box('samvat', [493, 98, 117], { afterPick: samvatPicked }),
    box('viksamvat', [611, 98, 77], { noF2: true }),
    box('finalizeddate', [136, 138, 227], { date: true }),
    box('MaterialTran', [493, 138, 195], { trans: 'MaterialTran' }),
    box('ProofByTran', [136, 178, 227], { trans: 'ProofByTran' }),
    box('WorkDoneByKt', [493, 178, 195], kt('WorkDoneByName')),
    box('grade', [136, 218, 112]),
    box('QualityKt', [251, 218, 112], kt('QualityName')),
    box('bkname', [493, 218, 195], { noF2: true }),
    box('availableat', [136, 258, 227]),
    box('StyleTran', [493, 258, 195], { trans: 'StyleTran' }),
    box('CreatorTypeTran', [136, 298, 227], { trans: 'CreatorTypeTran' }),
    box('CreatorTran', [493, 298, 195], { trans: 'CreatorTran' }),
    box('comment', [823, 298, 153]),
    box('remark', [136, 338, 227]),
    box('color', [493, 338, 195]),
    box('otherlibno', [823, 338, 153]),
  ],
  // chkFinalized / chkPending sit on the form above the split, so clsCom.clear(Panel1) on New
  // leaves them as they were (desktop behaviour, kept).
  toolbarCheckbox: [
    { name: 'finalized', label: 'Finalized', right: 0 },
    { name: 'pending', label: 'Pending', right: 0 },
  ],
  onNew: { keep: ['finalized', 'pending'] },
  trans: TRANS,
  onFieldLeave,
  lockedColumns: ['Locked'],
  lockAction: 'lock-records',
  deleteFlow,
  copy: { clear: [], loadTrans: Object.keys(TRANS) },
  columns: [
    { header: 'Id', field: 'graphicBkm', width: 5 },
    { header: 'RecNo', field: 'recno', width: 100 },
    { header: 'LibNo', field: 'BookTName', width: 100 },
    { header: 'Book Name', field: 'bkname', width: 130 },
    { header: 'Color', field: 'color', width: 110 },
    { header: 'Grade', field: 'grade', width: 100 },
    { header: 'Vishesh', field: 'VisheshTran', width: 120 },
    { header: 'Viksamvat', field: 'viksamvat', width: 100 },
    { header: 'Proof By', field: 'ProofByTran', width: 130 },
    { header: 'Work DoneBy', field: 'WorkDoneByName', width: 130 },
    { header: 'Finalized Date', field: 'finalizeddate', width: 100, format: 'date' },
    { header: 'BookTKt', field: 'BookTKt', hidden: true },
  ],
};

export function GraphicsMaster(props: ScreenProps) {
  return <MasterScreen spec={spec} {...props} menu={menu} />;
}

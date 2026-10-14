'use client';

import type { ActionResult, ChildRow, GridRow, GridValue, PickList } from '@gglib/shared';
import { UserType } from '@gglib/shared';
import { useMemo, useState } from 'react';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import { InputBox } from '@/components/ui/InputBox';
import { useMessageBox } from '@/components/ui/MessageBox';
import { PickListDialog, type PickResult } from '@/components/ui/PickListDialog';
import { PopupTableDialog } from '@/components/ui/PopupTableDialog';
import { useAuth } from '@/features/auth/AuthProvider';
import { newTempId } from '@/features/master/DisplayTransDialog';
import { useImageViewer } from '@/features/master/ImageViewer';
import { MasterScreen } from '@/features/master/MasterScreen';
import { sendTableToExcel } from '@/features/master/sendToExcel';
import { bookSummary, netString } from '@/features/master/transSummary';
import type {
  ActionParams,
  FormContext,
  SaveContext,
  ScreenActions,
  ScreenSpec,
  TransSpec,
} from '@/features/master/types';
import type { MasterState } from '@/features/master/useMasterScreen';
import { useWorkspace } from '@/features/shell/Workspace';
import { api, errorMessage } from '@/lib/api';
import { getVikramSamvat } from './AuthorMaster';
import { BookMSDataDialog } from './BookMSDataDialog';
import { BookTranDialog } from './BookTranDialog';
import type { ScreenProps } from './registry';

/**
 * Library › Book Master (frmBookMasterNew). See docs/screens/book-master.md.
 *
 * The panel is frmBookMasterNew.Designer.vb's, drawn at 150% there: its positions are scaled
 * by 0.7 across and 16/22 down (the form is 1446×974 in the designer and 1012×708 on screen,
 * like Author Master). The popups are setform_prakashan's (frmDisplayTransNew, FormName
 * "Prakashan").
 */

// ------------------------------------------------------------------------------------------
// The text the form writes into a "…Tran" box after its popup's Save (Txt_KeyDown)
// ------------------------------------------------------------------------------------------

/** clsCommon.SignBetweenStr. */
function signBetween(a: string, b: string, sign = ','): string {
  if (a.trim() === '' && b.trim() === '') return '';
  if (a.trim() === '') return b;
  if (b.trim() === '') return a;
  return `${a.trim()}${sign}${b.trim()}`;
}

/** clsCommon.GetcontString: " | " separators out, "/" pieces joined. */
function contString(old: string): string {
  const joined = old
    .split(' | ')
    .filter((p) => p !== '|')
    .join('');
  return joined
    .split('/')
    .map((p) => p.trimEnd())
    .join('');
}

/** The Subject (old) popup: M1, Vishay and Remark by spaces, Vachan and Vibhakti run on. */
function subjectSummary(rows: ChildRow[], columns: string[]): string {
  let out = '';
  for (const row of rows) {
    for (const col of columns) {
      const upper = col.toUpperCase();
      const value = netString(row[col] ?? null).trim();
      if (upper === 'M1' || upper === 'VISHAY' || upper === 'REMARK')
        out = signBetween(out, value, ' ');
      else if (upper === 'VACHAN' || upper === 'VIBHAKTI') out += value;
    }
  }
  return out.trim();
}

/** The Book Subject popup: its Vishay texts run together, through GetcontString. */
function bookSubjectSummary(rows: ChildRow[], columns: string[]): string {
  let out = '';
  const vishay = columns.find((c) => c.toUpperCase() === 'VISHAY') ?? 'Vishay';
  for (const row of rows) out = signBetween(out, netString(row[vishay] ?? null).trim(), '');
  return contString(out.trim());
}

// ------------------------------------------------------------------------------------------
// The popups
// ------------------------------------------------------------------------------------------

const SIGN = (next: string) => ({ setKt: 'signkt', setName: 'Sign', next });

/** multiauthortype: the author types of one Author row. */
const MULTI_AUTHOR_TYPE: TransSpec = {
  column: 'AuthTran',
  hidden: ['prakashannokt', 'praksnauthorauthtypekm', 'praksnauthorkt', 'authortypekt', 'signkt'],
  editable: [],
  lookups: {
    authortype: { setKt: 'authortypekt', setName: 'authortype', next: 'Sign' },
    sign: SIGN('seq'),
  },
  template: ({ seq }) => [0, 0, 0, 0, '', 0, '', seq],
  firstColumn: 'authortype',
};

/** multiauthor: the authors of one Author row (their any name, padvi and sign). */
const MULTI_AUTHOR: TransSpec = {
  column: 'AuthTran',
  hidden: [
    'prakashannokt',
    'praksnauthorauthkm',
    'praksnauthorkt',
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
      // The list's mainname (column 12), Guru and identyty.
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
    sign: { ...SIGN('seq'), clearOnCancel: true, alwaysNext: true },
  },
  template: ({ seq }) => [0, 0, 0, 0, '', 0, '', 0, '', '', '', 0, '', seq],
  firstColumn: 'authorname',
};

const cellText = (v: GridValue | undefined) => netString(v ?? null).trim();

/** multivisheshauthor: the authors of one Vishesh row. */
const MULTI_VISHESH_AUTHOR: TransSpec = {
  column: 'praksnVisheshTran',
  hidden: [
    'prakashannokt',
    'praksnvishautkm',
    'prksnvisheshkt',
    'AuthAnyaNmKt',
    'authorkt',
    'padkt',
    'signkt',
  ],
  editable: [],
  lookups: {
    authorname: {
      setKt: 'Authorkt',
      setName: 'authorname',
      also: { authorname: 10, AnyaName: 10, Identyty: 2 },
      after: (row) => ({ ...row, AuthAnyaNmKt: 0 }),
      next: 'AnyaName',
    },
    anyaname: { setKt: 'AuthAnyaNmKt', setName: 'AnyaName', perRow: true, next: 'Padvi' },
    padvi: { setKt: 'padkt', setName: 'padvi', next: 'Sign' },
    sign: { setKt: 'signkt', setName: 'sign', next: 'seq' },
  },
  template: ({ seq }) => [0, 0, 0, 0, '', 0, '', '', 0, '', 0, '', seq],
  firstColumn: 'authorname',
};

/** multivisheshbhasha: the languages of one Vishesh row. */
const MULTI_VISHESH_BHASHA: TransSpec = {
  column: 'praksnVisheshTran',
  hidden: ['prakashannokt', 'praksnvishbhakm', 'prksnvisheshkt', 'bhashakt', 'bhasa_attr'],
  editable: [],
  lookups: {
    bhashaname: {
      setKt: 'bhashakt',
      setName: 'bhashaname',
      also: { bhasa_attr: 2 },
      addRowAfter: true,
      next: 'bhashaname',
    },
  },
  template: ({ seq }) => [0, 0, 0, 0, '', '', seq],
  firstColumn: 'bhashaname',
};

/** Book Subject's dates: an InputBox with today (dd/MM/yyyy). */
const today = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};
const DATE_PROMPT = 'Please Enter Date in dd/MM/yyyy Format(Ex.:- (01/12/2015)';
const sortDate = (v: GridValue | undefined) => {
  const m = netString(v ?? null).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]) : 20500131;
};

const TRANS: Record<string, TransSpec> = {
  PrakTran: {
    column: 'PrakTran',
    hidden: ['prashnprakkm', 'prakashakkt', 'praktypekt', 'signkt', 'prakashannokt'],
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
    sendLoaded: true,
    summary: (rows, columns) => bookSummary(rows, columns, true),
  },
  AuthTran: {
    column: 'AuthTran',
    hidden: ['prakashannokt', 'praksnauthorkm'],
    editable: [],
    lookups: {},
    template: ({ seq }) => [0, newTempId(), '', '', seq],
    firstColumn: 'authortype',
    children: {
      authortype: {
        extra: 1,
        parentKey: 'praksnauthorkm',
        childKey: 'praksnauthorkt',
        spec: MULTI_AUTHOR_TYPE,
        cell: (rows) => {
          const text = rows
            .map(
              (r) =>
                `${cellText(r.authortype)}${cellText(r.Sign ?? r.sign) === '' ? '' : ` (${cellText(r.Sign ?? r.sign)}) `},`,
            )
            .join('');
          return text === '' ? '' : text.slice(0, -1);
        },
      },
      authorname: {
        extra: 0,
        parentKey: 'praksnauthorkm',
        childKey: 'praksnauthorkt',
        spec: MULTI_AUTHOR,
        cell: (rows) =>
          rows
            .map(
              (r) =>
                `${netString(r.AnyaName ?? null)}${cellText(r.identyty) === '' ? '' : `(${cellText(r.identyty)})`}${
                  cellText(r.Padvi ?? r.padvi) === '' ? '' : ` (${cellText(r.Padvi ?? r.padvi)}) `
                }${cellText(r.Sign ?? r.sign) === '' ? '' : ` (${cellText(r.Sign ?? r.sign)}) `}`,
            )
            .join(''),
      },
    },
    summary: (rows, columns) => bookSummary(rows, columns),
  },
  praksnVisheshTran: {
    column: 'praksnVisheshTran',
    hidden: [
      'prakashannokt',
      'prksnvisheshkm',
      'columnmastkt',
      'mark1',
      'mark2',
      'm2',
      'AuthAnyaNmKt',
      'AnyaName',
      'title',
      'idntyty',
      'DoneByKt',
    ],
    editable: ['refpgno', 'prcpno', 'detail', 'DetailSummary'],
    widths: { detail: 450, authorname: 110, seq: 50, m1: 30, prcpno: 100, columnno: 40 },
    lookups: {
      m1: { setKt: 'mark1', setName: 'M1', next: 'ColumnNo' },
      columnno: {
        setKt: 'ColumnMastkt',
        also: { ColumnName: 1, ColumnNo: 2 },
        after: (row, picked) =>
          netString(row.Detail ?? null) === ''
            ? { ...row, Detail: picked.rows[0]?.[1] ?? null }
            : row,
        next: 'Detail',
      },
      detail: { setName: 'Detail', perRow: true, next: 'authorname' },
      donebyname: { setKt: 'DoneByKt', setName: 'DoneByName', next: 'DetailSummary' },
      detailsummary: { setName: 'DetailSummary', next: 'PrCpNo' },
      prcpno: {
        setName: 'PrCpNo',
        append: true,
        selectFirst: false,
        noSearchText: true,
        next: 'seq',
      },
      m2: { setKt: 'mark2', setName: 'M2', next: 'seq' },
    },
    tempKey: 'prksnvisheshkm',
    firstColumn: 'M1',
    children: {
      authorname: {
        extra: 0,
        parentKey: 'prksnvisheshkm',
        childKey: 'prksnvisheshkt',
        spec: MULTI_VISHESH_AUTHOR,
        cell: (rows) =>
          rows
            .map(
              (r) =>
                `${netString(r.AnyaName ?? r.anyaname ?? null)}${cellText(r.Identyty ?? r.identyty) === '' ? '' : ` [${cellText(r.Identyty ?? r.identyty)}]`}`,
            )
            .join(','),
      },
      bhashaname: {
        extra: 1,
        parentKey: 'prksnvisheshkm',
        childKey: 'prksnvisheshkt',
        spec: MULTI_VISHESH_BHASHA,
        // The desktop runs the names together and swaps the last letter for a comma.
        cell: (rows) => {
          const text = rows.map((r) => netString(r.bhashaname ?? null)).join('');
          return text === '' ? '' : `${text.slice(0, -1)},`;
        },
      },
    },
    vishayEntry: {
      txtdetail: { extra: 2, parentKey: 'prksnvisheshkm' },
      txtdetailsummary: { extra: 3, parentKey: 'prksnvisheshkm' },
    },
    // TsBtnSave: every row needs a ColumnNo and a page; seq runs on from the largest in use,
    // one more at each "*" mark.
    beforeSave: async (rows, helpers) => {
      if (rows.length > 1) {
        for (const r of rows) {
          const seq = netString(r.seq ?? null);
          if (['', '0'].includes(netString(r.ColumnNo ?? null)))
            return `Please Select ColumnNo  at Seq : ${seq}`;
          if (['', '0'].includes(netString(r.RefPgno ?? r.RefPgNo ?? null)))
            return `Please Type Pgno at Seq : ${seq}`;
        }
      }
      const max = await helpers.lookup('maxseq', {});
      let seq = Number(max.rows[0]?.[0] ?? 1) || 1;
      return rows.map((r) => {
        if (netString(r.M1 ?? null) === '*') seq += 1;
        return { ...r, seq };
      });
    },
    // Copy keeps the rows; their Vishay details stay with the book they came from.
    onCopy: (state) => ({
      ...state,
      extras: state.extras?.map((t, i) => (i >= 2 ? { ...t, rows: [] } : t)),
    }),
    sendLoaded: true,
    summary: (rows, columns) => bookSummary(rows, columns),
  },
  SubjTran: {
    column: 'SubjTran',
    hidden: ['prakashnnokt', 'mark1', 'prakshnvishkm', 'vishaykt', 'vachankt', 'vibhaktikt'],
    editable: [],
    lookups: {
      entrytype: { setName: 'EntryType', next: 'M1' },
      m1: { setKt: 'Mark1', setName: 'M1', next: 'Vishay' },
      vishay: { setKt: 'vishaykt', setName: 'Vishay', next: 'Vachan' },
      vachan: { setKt: 'vachankt', setName: 'Vachan', next: 'Vibhakti' },
      vibhakti: { setKt: 'vibhaktikt', setName: 'Vibhakti', addRowAfter: true, next: 'Vishay' },
    },
    template: ({ seq }) => [0, 0, 'New', 0, '', 0, '', 0, '', 0, '', '', seq],
    firstColumn: 'M1',
    sendLoaded: true,
    summary: subjectSummary,
  },
  BookSubjTran: {
    column: 'BookSubjTran',
    hidden: ['BookSubjectKm', 'WorkDoneByKt', 'DayKt'],
    editable: ['PrintSeq', 'Remark', 'PageNo', 'Tithi'],
    lookups: {
      entrytype: { setName: 'EntryType', next: 'Vishay' },
      printdate: {
        setName: 'PrintDate',
        input: { prompt: DATE_PROMPT, initial: today },
        next: 'PrintSeq',
      },
      date: { setName: 'Date', input: { prompt: DATE_PROMPT, initial: today }, next: 'Seq' },
      workdonebyname: { setKt: 'WorkDoneByKt', setName: 'WorkDoneByName', next: 'Tithi' },
      dayname: { setKt: 'DayKt', setName: 'DayName', next: 'PrintSeq' },
    },
    template: ({ seq }) => [0, 'Main Title(New)', '', 0, '', '', 0, '', '', '', '', 0, '', seq],
    firstColumn: 'Vishay',
    vishayEntry: {
      vishay: { extra: 0, parentKey: 'BookSubjectKm', unsavedMessage: 'Please Save Record First' },
    },
    // TsBtnSave: seq renumbered, then the rows ordered by their Date (none: 31/01/2050) and seq.
    beforeSave: async (rows) => {
      const numbered: ChildRow[] = rows.map((r, i) => ({ ...r, Seq: i + 1 }));
      const sorted = numbered
        .filter((r) => netString(r.BookSubjectKm ?? null) !== '-2')
        .sort((a, b) => sortDate(a.Date) - sortDate(b.Date) || Number(a.Seq) - Number(b.Seq));
      return sorted.map((r, i) => ({ ...r, Seq: i + 1 }));
    },
    sendLoaded: true,
    summary: bookSubjectSummary,
  },
  BhasTran: {
    column: 'BhasTran',
    hidden: ['prakshnbhashakm', 'prakshnokt', 'bhashakt'],
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
    sendLoaded: true,
    summary: (rows, columns) => bookSummary(rows, columns),
  },
  LipiTran: {
    column: 'LipiTran',
    hidden: ['prakshnlipikm', 'prakashankt', 'lippikt'],
    editable: [],
    lookups: {
      lipi_attr: { setKt: 'lippikt', also: { lipi_attr: 2 }, addRowAfter: true, next: 'lipi_attr' },
    },
    template: ({ seq }) => [0, 0, 0, '', seq],
    firstColumn: 'lipi_attr',
    sendLoaded: true,
    summary: (rows, columns) => bookSummary(rows, columns),
  },
  VibhagTran: {
    column: 'VibhagTran',
    hidden: ['BookMastKt', 'BookVibhagKm', 'VibhagKt'],
    editable: [],
    lookups: {
      vibhagname: { setKt: 'VibhagKt', setName: 'VibhagName', searchPrefix: '/', next: 'seq' },
    },
    template: ({ seq }) => [0, 0, 0, '', seq],
    firstColumn: 'VibhagName',
    summary: (rows, columns) => bookSummary(rows, columns),
  },
  MagazineRemarkTran: {
    column: 'MagazineRemarkTran',
    hidden: ['BookMagazineRemarkKm'],
    editable: ['Remark', 'RefPageNo'],
    lookups: {},
    tempKey: 'BookMagazineRemarkKm',
    firstColumn: 'Remark',
    sendLoaded: true,
    summary: (rows, columns) => bookSummary(rows, columns),
  },
  KrutiTran: { column: 'KrutiTran', hidden: [], editable: [], lookups: {}, firstColumn: 0 },
  Bhandtran: { column: 'Bhandtran', hidden: [], editable: [], lookups: {}, firstColumn: 0 },
};

// ------------------------------------------------------------------------------------------
// Txt_Leave and the form's checks
// ------------------------------------------------------------------------------------------

/** replacepgnum: TotalPages from Pages ("1-10+5." counts 10 + 5). */
export function totalPages(pages: string): number {
  let fno = 0;
  let sno = 0;
  let minus = 0;
  let add = 0;
  for (const c of pages.trim()) {
    if (/[0-9]/.test(c)) {
      fno = fno * 10 + Number(c);
      sno = sno * 10 + Number(c);
    }
    if (c === '-') {
      minus = fno;
      fno = 0;
      sno = 0;
    }
    if (c === '+' || c === '.') {
      if (minus > 0) {
        if (sno === minus) add += 1;
        else {
          add += sno - minus + 1;
          minus = 0;
        }
      } else add += fno;
      fno = 0;
      sno = 0;
    }
  }
  return add;
}

const isNumeric = (s: string) => /^\s*[+-]?(\d+\.?\d*|\.\d+)\s*$/.test(s);

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
    const total = totalPages(pages);
    return { TotalPages: String(total), Pages: pages.substring(0, pages.length - 1) };
  }
  return null;
}

/** Save()'s checks, before "Are You Sure to Save This Record?". */
function validateBook(ctx: SaveContext & { tags: Record<string, number> }): string {
  const f = ctx.fields;
  if ((f.BookName ?? '').trim() === '') return 'Please Enter BookName';
  if (ctx.strMode !== 'Edit') return '';
  if ((f.BookTran ?? '').trim() === '') return 'Please Enter LibNo in BookT';
  const libNos = `,${f.BookTran ?? ''}`;
  if (![',B0', ',S0', ',C0', ',X0', ',XP'].some((p) => libNos.includes(p))) return '';
  let missing = '';
  const need = (ok: boolean, label: string) => {
    if (!ok) missing += `\r\n- ${label}`;
  };
  need((ctx.tags.PSamvatcokt ?? 0) !== 0, 'Smvt Type');
  need((ctx.tags.Avrutikt ?? 0) !== 0, 'Avruti');
  need((ctx.tags.GMalaKt ?? 0) !== 0, 'GMalaName');
  need((f.Pages ?? '') !== '', 'Pgs');
  need((f.TotalPages ?? '') !== '', 'TotPgs');
  need((f.Price ?? '') !== '', 'Price');
  need((f.Size ?? '') !== '', 'Size');
  need((ctx.tags.ShapeKt ?? 0) !== 0, 'Shape');
  need((f.PrakTran ?? '').trim() !== '', 'Prakashak');
  need((f.AuthTran ?? '').trim() !== '', 'Author');
  need((f.BhasTran ?? '').trim() !== '', 'Bhasha');
  need((f.LipiTran ?? '').trim() !== '', 'Lipi');
  return missing ? `Please Enter Required Fields:${missing}` : '';
}

// ------------------------------------------------------------------------------------------
// The panel
// ------------------------------------------------------------------------------------------

/** ShowBookofCurrentComGrp: the books of the current record's common group. */
function showCurrentCommonGroup(a: ScreenActions, state: MasterState) {
  const row = state.rows.find((r) => Number(r.BookMastkm) === state.currentId);
  const grp = Number(row?.CommonGrpNo) || 0;
  if (grp > 0) void a.run('current-common-group', { commonGrpNo: grp }, []);
}

/** ShowBookOfCurrentGroupParts (v3.4.3.1): the books of the current record's parts group. */
function showCurrentPartGroup(a: ScreenActions, state: MasterState) {
  const row = state.rows.find((r) => Number(r.BookMastkm) === state.currentId);
  const grp = Number(row?.Grpno) || 0;
  if (grp > 0) void a.run('current-part-group', { grpNo: grp }, []);
}

type Deps = {
  openBookT: (ctx: FormContext) => void;
  openScreen: (screen: string, ids: number[]) => void;
  confirm: (text: string) => Promise<boolean>;
};

function buildSpec(deps: Deps): ScreenSpec {
  const tran = (name: string, x: number, y: number, w: number) => ({
    name,
    at: { x, y, w },
    trans: name,
  });
  const group = { disabledColumn: 'GrpLocked' };
  return {
    screen: 'book-master',
    panelHeight: 438,
    panelWidth: 1008,
    entryLabel: true,
    help: true,
    lockPanel: true,
    lockedColumns: ['Locked'],
    lockAction: 'lock-records',
    // chkSearchNotInOB (v3.4.3.1) is a switch of the list, not a column; chkIsPrint is the record's.
    toolbarCheckbox: [
      { name: 'SearchNotInOB', label: 'Search Not In OB', right: 398, listSwitch: true },
      { name: 'IsPrint', label: 'IsPrint', right: 241 },
    ],
    labels: [
      ['Book Name', 6, 9],
      ['Pari. Name/Part Type', 327, 9],
      ['Title Detail', 693, 10],
      ['Smvt Type', 6, 79],
      ['Samvat/PSamvatVK', 327, 79],
      ['Avruti', 693, 79],
      ['GMala Name/No', 6, 116],
      ['Pages/Total Pages', 327, 116],
      ['Pariman/Price', 693, 116],
      ['Size/Shape', 6, 153],
      ['Fund Type', 327, 153],
      ['Nakal/ISBN No', 693, 153],
      ['Vishesh', 6, 190],
      ['Remark', 327, 190],
      ['Mix Sign/Remark', 691, 190],
      ['Print Style', 6, 227],
      ['Bind Paper/Kruti Work', 327, 227],
      ['ComGp/PrintNo', 693, 227],
      ['Group No/Name', 6, 264],
      ['Group Pari Name/Part', 327, 264],
      ['Vibhag/Samprdy', 693, 264],
      ['Prakashak', 6, 301],
      ['Author', 327, 301],
      ['Bhasha/Lipi', 691, 301],
      ['Prak Vishesh', 6, 338],
      ['Subject', 327, 338],
      ['Kruti', 693, 338],
      ['Library No', 6, 375],
      ['Anya Bhandar', 327, 375],
      ['Info', 693, 375],
      ['Magazine Remark', 6, 412],
      // "Prak Vishesh Name" since v3.4.3.1, once the database has BookM.PrakVisheshName.
      ['Short Name', 327, 412],
    ].map(([text, x, y]) => ({
      text: text as string,
      at: { x: x as number, y: y as number },
      sizePt: 11.25,
    })),
    // In tab order (v3.4.3.1 renumbered the TabIndexes to follow the screen; Subject (old) got 0).
    fields: [
      tran('SubjTran', 797, 403, 205),
      {
        name: 'BookName',
        label: 'Book Name',
        at: { x: 115, y: 5, w: 209 },
        h: 60,
        // txtBookName_PreviewKeyDown: Tab asks about other "OB" books of the same name.
        onTab: (ctx) => {
          void ctx
            .call('duplicate-name', { name: ctx.fields.BookName ?? '', current: ctx.tranKm }, [])
            .then(async (r) => {
              if (r?.kind === 'open' && r.ids.length > 0) {
                if (await deps.confirm('Book Name Already Exists.\r\nDo you want to see list?'))
                  deps.openScreen('book-master', r.ids);
              }
            });
        },
      },
      { name: 'ParichayakName', at: { x: 465, y: 5, w: 150 }, h: 60 },
      { name: 'Part', at: { x: 618, y: 5, w: 69 }, h: 60 },
      { name: 'TitleDetail', at: { x: 797, y: 5, w: 205 }, h: 60 },
      { name: 'PSamvatcokt', at: { x: 115, y: 72, w: 209 }, kt: true, nameColumn: 'PSamvatcoName' },
      { name: 'PSamvat', at: { x: 465, y: 72, w: 118 } },
      { name: 'PSamvatVK', at: { x: 585, y: 72, w: 102 } },
      { name: 'Avrutikt', at: { x: 797, y: 72, w: 205 }, kt: true, nameColumn: 'AvrutiName' },
      { name: 'GMalaKt', at: { x: 115, y: 109, w: 155 }, kt: true, nameColumn: 'GMalaName' },
      { name: 'GMalaNo', at: { x: 272, y: 109, w: 52 } },
      { name: 'Pages', at: { x: 465, y: 109, w: 118 } },
      { name: 'TotalPages', at: { x: 585, y: 109, w: 102 } },
      { name: 'Pariman', at: { x: 797, y: 109, w: 125 } },
      { name: 'Price', at: { x: 924, y: 109, w: 78 } },
      { name: 'Size', at: { x: 115, y: 146, w: 101 } },
      { name: 'ShapeKt', at: { x: 218, y: 146, w: 106 }, kt: true, nameColumn: 'ShapeName' },
      { name: 'FundTypeKt', at: { x: 465, y: 146, w: 222 }, kt: true, nameColumn: 'FundTypeName' },
      { name: 'Nakal', at: { x: 797, y: 146, w: 125 } },
      { name: 'ISBNNo', at: { x: 924, y: 146, w: 78 } },
      { name: 'Vishesh', at: { x: 115, y: 183, w: 209 } },
      { name: 'Remark', at: { x: 465, y: 183, w: 222 } },
      { name: 'MixSign', at: { x: 797, y: 183, w: 125 }, addMore: { append: true } },
      { name: 'MixSignRem', at: { x: 924, y: 183, w: 78 } },
      {
        name: 'PrintStylekt',
        at: { x: 115, y: 220, w: 209 },
        kt: true,
        nameColumn: 'PrintStyleName',
      },
      {
        name: 'Bind_PaperKt',
        at: { x: 465, y: 220, w: 118 },
        kt: true,
        nameColumn: 'Bind_PaperName',
      },
      // No tblSearch row: F2 opens an empty popup on the desktop, and nothing loads or saves it.
      { name: 'KrutiWorkTran', at: { x: 585, y: 220, w: 102 }, noF2: true },
      { name: 'CommonGrpNo', at: { x: 797, y: 220, w: 100 } },
      { name: 'PrintNo', at: { x: 899, y: 220, w: 51 } },
      { name: 'PartNo', at: { x: 952, y: 220, w: 50 } },
      { name: 'Grpno', at: { x: 115, y: 257, w: 41 }, ...group },
      { name: 'GrpName', at: { x: 158, y: 257, w: 166 }, ...group },
      { name: 'GrpParichayakName', at: { x: 465, y: 257, w: 118 }, ...group },
      { name: 'GrpPart', at: { x: 585, y: 257, w: 102 }, ...group },
      tran('VibhagTran', 797, 257, 125),
      { name: 'SampradayTran', at: { x: 924, y: 257, w: 78 }, noF2: true },
      tran('PrakTran', 115, 294, 209),
      tran('AuthTran', 465, 294, 222),
      tran('BhasTran', 797, 294, 125),
      tran('LipiTran', 924, 294, 78),
      tran('praksnVisheshTran', 115, 331, 209),
      tran('BookSubjTran', 465, 331, 222),
      { name: 'KrutiTran', at: { x: 797, y: 331, w: 205 }, transList: 'KrutiTran' },
      // F2: the Library No form (frmBookTranNew) for this book; nothing for a new one.
      { name: 'BookTran', at: { x: 115, y: 368, w: 209 }, onF2: (ctx) => deps.openBookT(ctx) },
      { name: 'Bhandtran', at: { x: 465, y: 368, w: 222 }, transList: 'Bhandtran' },
      {
        name: 'PM_GBKM_SEL_PLIST_IMG',
        at: { x: 797, y: 368, w: 205 },
        onF2: (ctx) => {
          void ctx.call('sign-from-libno', { current: ctx.tranKm }, []).then((r) => {
            if (r?.kind === 'message') ctx.setField('PM_GBKM_SEL_PLIST_IMG', r.message);
          });
        },
      },
      tran('MagazineRemarkTran', 115, 405, 209),
      { name: 'ShortName', at: { x: 465, y: 405, w: 222 } },
      // Visible = False on the desktop, so its popup (Magazine Vishesh) cannot be opened there.
      { name: 'BookMagazineVisheshTran', at: { x: 0, y: 0, w: 0 }, hidden: true },
      // The MS data (frmBookMSData) the form keeps in variables and saves with the book.
      {
        name: 'bhandarcokt',
        at: { x: 0, y: 0, w: 0 },
        hidden: true,
        kt: true,
        nameColumn: 'BhandarcoName',
      },
      { name: 'Hastpratno', at: { x: 0, y: 0, w: 0 }, hidden: true },
      { name: 'HastpratSize', at: { x: 0, y: 0, w: 0 }, hidden: true },
      { name: 'panktiAkshar', at: { x: 0, y: 0, w: 0 }, hidden: true },
      {
        name: 'LSamvcokt',
        at: { x: 0, y: 0, w: 0 },
        hidden: true,
        kt: true,
        nameColumn: 'LsamvcoName',
      },
      { name: 'LSamvat', at: { x: 0, y: 0, w: 0 }, hidden: true },
      { name: 'LSamvatVK', at: { x: 0, y: 0, w: 0 }, hidden: true },
      { name: 'AdiVakya', at: { x: 0, y: 0, w: 0 }, hidden: true },
      { name: 'AntVakya', at: { x: 0, y: 0, w: 0 }, hidden: true },
      {
        name: 'PLSthalkt',
        at: { x: 0, y: 0, w: 0 },
        hidden: true,
        kt: true,
        nameColumn: 'PLSthalName',
      },
    ],
    trans: TRANS,
    // Width and MinimumWidth as frmBookMasterNew.Designer.vb has them (not scaled like the panel).
    columns: [
      { header: 'bookkm', field: 'BookMastkm', width: 8, minWidth: 8 },
      { header: 'BookName(Parichayak Name) -Part', field: 'txtBookName', width: 258, minWidth: 8 },
      { header: 'Prakashak', field: 'txtPrakashak', width: 250, minWidth: 8 },
      { header: 'Author', field: 'txtAuthor', width: 80, minWidth: 8 },
      { header: 'PSamvatVK', field: 'PSamvatVK', width: 70, minWidth: 70 },
      { header: 'Bhasha', field: 'txtBhasha', width: 70, minWidth: 70 },
      { header: 'Lipi', field: 'txtLipi', width: 70, minWidth: 70 },
      { header: 'Pages(Total)', field: 'TotalPages', width: 70, minWidth: 70 },
      { header: 'ComGrpNo', field: 'CommonGrpNo', width: 70, minWidth: 70 },
      { header: 'LibNo', field: 'txtBookTran', width: 70, minWidth: 70 },
      { header: 'LibNoCount', field: 'LibNoCount', width: 150, minWidth: 8 },
      { header: 'PartGrpNo', field: 'Grpno', width: 70, minWidth: 70 },
      { header: 'Avruti', field: 'AvrutiName', width: 70, minWidth: 70 },
      { header: 'Size', field: 'Size', width: 50, minWidth: 50 },
      { header: 'RepNo', field: 'PrintNo', width: 50, minWidth: 50 },
      { header: 'IssueCount', field: 'IssueCount', width: 150, minWidth: 8 },
      { header: 'LinkWithKruti', field: 'LinkWithKrutiName', width: 150, minWidth: 8 },
      { header: 'ProjectWork', field: 'ProjectWorkName', width: 150, minWidth: 8 },
      { header: 'IsPrint', field: 'IsPrint', width: 60, minWidth: 8 },
    ],
    onFieldLeave,
    validate: validateBook,
    // Save(): GrpName / GrpParichayakName go blank while their boxes are disabled.
    beforeSave: async ({ disabled }) => ({ GrpLocked: disabled.GrpName ? 1 : 0 }),
    // btnCopy_Click: these boxes clear, and the popups FillTransactionDatatable loads are copied.
    // ShowBookofCurrentComGrpToolStripMenuItem's ShortcutKeys.
    ctrlKeys: {
      g: (a, state) => showCurrentCommonGroup(a, state),
      p: (a, state) => showCurrentPartGroup(a, state),
    },
    copy: {
      clear: [
        'BookTran',
        'PrintNo',
        'Grpno',
        'GrpName',
        'GrpParichayakName',
        'GrpPart',
        'CommonGrpNo',
        'VibhagTran',
        'praksnVisheshTran',
      ],
      loadTrans: ['PrakTran', 'BhasTran', 'LipiTran', 'AuthTran', 'praksnVisheshTran'],
    },
  };
}

// ------------------------------------------------------------------------------------------
// The right-click menu (cntMenu)
// ------------------------------------------------------------------------------------------

type Dialog =
  | {
      kind: 'pick';
      title: string;
      list: PickList | undefined;
      selectFirst: boolean;
      initialText?: string;
      addBlankRow?: boolean;
      resolve: (r: PickResult | null) => void;
    }
  | { kind: 'input'; prompt: string; title?: string; resolve: (v: string | null) => void }
  | { kind: 'popup'; title: string; columns: string[]; rows: GridValue[][] };

/** cntMenu_Opening: who sees Print and GR (user types Admin / AMaster and these user ids). */
const PRINT_USER_IDS = [22, 29, 54, 64, 127, 38, 44, 134, 93, 129, 68, 1, 182];

const NOT_ON_WEB = (what: string) =>
  `${what} needs the desktop computers (their file shares, Excel templates or Crystal Reports) and cannot run in the web app.`;

export function BookMaster(props: ScreenProps) {
  const msg = useMessageBox();
  const viewer = useImageViewer();
  const workspace = useWorkspace();
  const auth = useAuth();
  const user = auth.status === 'authenticated' ? auth.user : null;
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [bookT, setBookT] = useState<{
    bookId: number;
    tids: number[];
    showAll: boolean;
    ctx?: FormContext;
  } | null>(null);
  const [msData, setMsData] = useState<{ bookId: number; state: MasterState } | null>(null);

  async function openBookT(ctx: FormContext) {
    if (ctx.strMode === 'Add') return;
    const r = await ctx.call('book-t-ids', undefined, [ctx.tranKm]);
    if (r?.kind === 'table')
      setBookT({ bookId: ctx.tranKm, tids: r.rows.map((x) => Number(x[0])), showAll: false, ctx });
  }

  const spec = useMemo(
    () =>
      buildSpec({
        openBookT: (ctx) => void openBookT(ctx),
        openScreen: (screen, ids) => workspace.open(screen, ids),
        confirm: (text) => msg.confirm(text),
      }),
    [],
  );

  /** DisplayListForm over a list: the pick, or null. */
  function pick(
    title: string,
    load: () => Promise<PickList>,
    selectFirst: boolean,
    initialText?: string,
    addBlankRow?: boolean,
  ): Promise<PickResult | null> {
    return new Promise((resolve) => {
      setDialog({
        kind: 'pick',
        title,
        list: undefined,
        selectFirst,
        initialText,
        addBlankRow,
        resolve,
      });
      load()
        .then((list) =>
          setDialog((d) => (d?.kind === 'pick' && d.title === title ? { ...d, list } : d)),
        )
        .catch(async (err: unknown) => {
          setDialog(null);
          resolve(null);
          await msg.alert(errorMessage(err));
        });
    });
  }
  const namedList = (name: string) => () => api.get<PickList>(`/master/book-master/lists/${name}`);
  const tableList = (r: ActionResult | null): PickList =>
    r?.kind === 'table' ? { columns: r.columns, rows: r.rows } : { columns: [], rows: [] };

  function ask(prompt: string, title?: string): Promise<string | null> {
    return new Promise((resolve) => setDialog({ kind: 'input', prompt, title, resolve }));
  }

  function menu(a: ScreenActions, state: MasterState): ContextMenuItem[] {
    const item = (label: string, onSelect: () => void, shortcut?: string): ContextMenuItem => ({
      kind: 'item',
      label,
      onSelect,
      ...(shortcut ? { shortcut } : {}),
    });
    const run = (action: string, params?: ActionParams, ids?: number[]) => () =>
      void a.run(action, params, ids);
    const current = state.currentId ?? 0;
    const withPassword =
      (action: string, extra: ActionParams = {}, ids?: number[]) =>
      async () => {
        const password = await a.askPassword();
        if (password !== null) await a.run(action, { ...extra, password }, ids);
      };
    const notOnWeb = (what: string) => () => void a.alert(NOT_ON_WEB(what));
    /**
     * ViewImage(Type): the book's files in the type's folder, in the list form; the picked one
     * opens (in the image viewer, which also steps through the rest of the list) and the list
     * comes back when the viewer closes, until the list is closed without a pick.
     */
    const viewImage = (type: 'SN' | 'EB' | 'TIT' | 'GR') => async () => {
      const files = tableList(await a.call('view-image', { type, current }, []));
      if (files.rows.length === 0) return;
      const paths = files.rows.map((r) => String(r[0] ?? ''));
      for (;;) {
        const picked = await a.pick(files, { title: 'List' });
        const path = picked?.code[0] ?? '';
        if (path === '') return;
        await viewer.open({
          screen: 'book-master',
          files: paths,
          index: Math.max(0, paths.indexOf(path)),
          title: `View Image of This Book - ${type}`,
        });
      }
    };
    const printVisible =
      user !== null &&
      (user.userType === UserType.Admin ||
        user.userType === UserType.AMaster ||
        PRINT_USER_IDS.includes(user.id));
    const admin = user?.isAdmin ?? false;

    const replaceIn =
      (title: string, fromAction: string, toList: string, action: string) => async () => {
        const from = await pick(title, async () => tableList(await a.call(fromAction)), true);
        const fromKt = Number(from?.code[0]) || 0;
        const to = await pick(title, namedList(toList), true);
        const toKt = Number(to?.code[0]) || 0;
        await a.run(action, { from: fromKt, to: toKt });
      };

    const items: ContextMenuItem[] = [
      {
        kind: 'submenu',
        label: 'For Selected Record',
        items: [
          item('Kruti Master', run('kruti-master')),
          item('Prakashak Master', run('prakashak-master')),
          {
            kind: 'submenu',
            label: 'Author Master',
            items: [
              item('All', run('author-master-all')),
              item('Author', run('author-master-author')),
              item('Prak Vishesh', run('author-master-prak-vishesh')),
            ],
          },
          item('BookT', async () => {
            const r = await a.call('book-t-ids');
            if (r?.kind === 'table')
              setBookT({ bookId: 0, tids: r.rows.map((x) => Number(x[0])), showAll: true });
          }),
          // item('WorkGiven Master', run('work-given-master')),
          // item('Selection Master', run('selection-master')),
          // item('Catalog Master', async () => {
          //   const answer = await a.yesNoCancel(
          //     'Send As Per BhandTran.CpLibNo(Press Yes)\r\nSend As Per BhandTran.EntrCodekt(Press No)Send As Per Both(Press Cancel)',
          //   );
          //   const r = await a.call('catalog-master', { mode: answer });
          //   if (r?.kind !== 'open') return;
          //   if (r.ids.length > 0) workspace.open(r.screen, r.ids);
          //   else if (
          //     await a.confirm(
          //       'No Catalog Found for Selected Book\r\nDo You Want to Add New Catalog?',
          //     )
          //   )
          //     workspace.open(r.screen, []);
          // }),
          item('Anya Bhandar', run('anya-bhandar')),
          // item('Prakashan List Anya Bhandar', run('prakashan-list-anya-bhandar', { current })),
          item('Graphic Master', run('graphic-master')),
          // item('Granth Mala', run('granth-mala', { gridIds: a.gridIds })),
          item('Inward Master', run('inword-master')),
          // item('Party Master', run('party-master')),
          item('Issue Master', run('issue-master')),
          item('Magazine Master', run('magazine-master')),
          item('TirthRaksha Master', run('tirth-raksha-master')),
          { kind: 'separator' },
          { kind: 'separator' },
          {
            kind: 'submenu',
            label: 'Utility',
            items: [
              item('Merge Record', async () => {
                if (a.selectedIds.length <= 1) {
                  await a.alert('Please select more than 1 record to merge');
                  return;
                }
                const keep = await pick(
                  'Merge Record',
                  async () => tableList(await a.call('selected-books', { withLibNo: true })),
                  false,
                );
                const keepId = Number(keep?.code[0]) || 0;
                if (keepId <= 0) return;
                if (
                  !(await a.confirm(
                    `All Record Except ${keep?.name ?? ''} will be Deleted Are you sure?`,
                  ))
                )
                  return;
                const password = await a.askPassword();
                if (password !== null) await a.run('merge-record', { keep: keepId, password });
              }),
              item('Update LibNo Text', run('update-libno-text')),
              item('Set LinkWithKruti', async () => {
                const r = await pick('LinkWithKruti', namedList('link-with-kruti'), true);
                const kt = Number(r?.code[0]) || 0;
                if (kt > 0) await a.run('set-link-with-kruti', { linkKt: kt });
              }),
              item('Set Project Work', async () => {
                const r = await pick('Project Work', namedList('project-work'), true);
                const kt = Number(r?.code[0]) || 0;
                if (kt > 0) await a.run('set-project-work', { projectKt: kt });
              }),
            ],
          },
        ],
      },
      {
        kind: 'submenu',
        label: 'For Current Record',
        items: [
          {
            kind: 'submenu',
            label: 'View Image of This Book',
            items: [
              item('SN', viewImage('SN')),
              item('EB', viewImage('EB')),
              item('TIT', viewImage('TIT')),
              ...(printVisible ? [item('GR', viewImage('GR'))] : []),
            ],
          },
          // {
          //   kind: 'submenu',
          //   label: 'Utility',
          //   items: [
          //     item('Delete Petank', async () => {
          //       if (!(await a.confirm('Are You Sure to Delete Petank Of This Record?'))) return;
          //       const password = await a.askPassword();
          //       if (password !== null)
          //         await a.run(
          //           'delete-petank',
          //           { current, bookName: state.fields.BookName ?? '', password },
          //           [],
          //         );
          //     }),
          //     // ViewImageSignToolStripMenuItem_Click: SN / EB / TIT for the row's LibNos that
          //     // the scan / e-book / title folders have, added to the Info box.
          //     item('Check For Image ', async () => {
          //       const sign = state.fields.PM_GBKM_SEL_PLIST_IMG ?? '';
          //       const r = await a.call('check-image', { current, sign }, []);
          //       if (r?.kind === 'message' && r.message !== sign)
          //         a.setField('PM_GBKM_SEL_PLIST_IMG', r.message);
          //     }),
          //     item('Add/Edit MS Data', () => setMsData({ bookId: state.tranKm, state })),
          //     ...((state.fields.BookSubjTran ?? '').trim() !== ''
          //       ? [
          //           item('Copy Subject', async () => {
          //             const r = await pick('Book', namedList('all-books'), false);
          //             if (r && r.code.length > 0 && r.code[0] !== '')
          //               await a.run('copy-subject', { current, to: r.code.join(',') }, []);
          //           }),
          //         ]
          //       : []),
          //   ],
          // },
          item('Magazine Vishesh', run('magazine-vishesh', { current }, [])),
        ],
      },
      {
        kind: 'submenu',
        label: "Part 's Group",
        items: [
          item('Add In New Group Parts', async () => {
            const head = await pick(
              'Group',
              async () => tableList(await a.call('selected-books')),
              false,
            );
            const name = await ask('Enter Group Name');
            const pariName = await ask('Enter Group Parichayak Name');
            const parts = await ask('Enter total parts');
            const headId = Number(head?.code[0]) || 0;
            if ((name ?? '') !== '' && headId > 0)
              await a.run('group-add-new', {
                head: headId,
                name: name ?? '',
                pariName: pariName ?? '',
                parts: parts ?? '',
              });
          }),
          item('Add In Existing Group Parts', async () => {
            const head = await pick(
              'Group',
              async () => tableList(await a.call('group-heads', { gridIds: a.gridIds })),
              false,
            );
            const headId = Number(head?.code[0]) || 0;
            if (headId > 0) await a.run('group-add-existing', { head: headId });
          }),
          item('Delete From Group Parts', withPassword('group-delete')),
          item('Show Book of Current Group Parts', () => showCurrentPartGroup(a, state), 'Ctrl+P'),
        ],
      },
      {
        kind: 'submenu',
        label: 'Common Group',
        items: [
          item('Show All Book of Common Group', run('all-common-groups', undefined, [])),
          item(
            'Show Book of Current Common Group',
            () => showCurrentCommonGroup(a, state),
            'Ctrl+G',
          ),
          { kind: 'separator' },
          item('Add in new Common', run('common-add-new')),
          item('Add in Existing  Common', async () => {
            const from = await pick(
              'Common Group',
              async () => tableList(await a.call('common-heads', { gridIds: a.gridIds })),
              false,
            );
            const id = Number(from?.code[0]) || 0;
            if (id > 0) await a.run('common-add-existing', { from: id });
          }),
          item('Delete From Group Common', async () => {
            if (await a.confirm('Are you sure to Delete common group?'))
              await a.run('common-delete');
          }),
          // { kind: 'separator' },
          // {
          //   kind: 'submenu',
          //   label: 'Utility',
          //   items: [
          //     item('Show  Common Group Having Single Record', run('common-single', undefined, [])),
          //     item('Update Common Group No = 0 Having Singe Recrod', async () => {
          //       if (await a.confirm('Are you sure to update common group?'))
          //         await a.run('common-single-reset', undefined, []);
          //     }),
          //   ],
          // },
        ],
      },
      {
        kind: 'submenu',
        label: 'Utility',
        items: [
          // item('Show BookM Record having no Record in RefLibNo', async () => {
          //   const r = await a.call('no-ref-libno', undefined, []);
          //   if (r?.kind !== 'table') return;
          //   if (r.rows.length > 0) sendTableToExcel(r.title, r.columns, r.rows);
          //   else if (r.emptyMessage) await a.alert(r.emptyMessage);
          // }),
          // item('Show BookM Record having LibNo in Range', async () => {
          //   const series = await ask('Please Enter Series');
          //   if (!series) return;
          //   const range = await ask('Please Enter Range(From-To)');
          //   const parts = (range ?? '').split('-');
          //   if (!range || parts.length !== 2) {
          //     await a.alert('Please Enter Proper Range(Ex: 15-20)');
          //     return;
          //   }
          //   const all = await a.confirm(
          //     'Show all records in range?(Yes)\r\nShow only newer records?(No)',
          //   );
          //   await a.run(
          //     'libno-in-range',
          //     { series, from: Number(parts[0]) || 0, to: Number(parts[1]) || 0, all },
          //     [],
          //   );
          // }),
          item('Transfer MixSign from BookT to BookM', async () => {
            const r = await pick('MixSign', namedList('mix-sign-transfer'), false);
            const sign = r?.name ?? '';
            if (sign === '') return;
            if (
              !(await a.confirm(
                `Mixsign- ${sign} Will Be deleted From All LibNos And Added into BookMaster Are u sure?`,
              ))
            )
              return;
            const password = await a.askPassword();
            if (password !== null) await a.run('transfer-mix-sign', { sign, password }, []);
          }),
          item('Show Missing And Duplicate No', async () => {
            const series = await ask(
              'Please Enter Starting Library No Say B0,C0,S0,CM',
              'Library No',
            );
            if (!series) return;
            for (const kind of ['missing', 'duplicate']) {
              const r = await a.call('missing-dup-libno', { series, kind }, []);
              if (r?.kind !== 'table') return;
              if (r.rows.length > 0) sendTableToExcel(r.title, r.columns, r.rows);
              else if (r.emptyMessage) await a.alert(r.emptyMessage);
            }
            if (!(await a.confirm('Do You Want To Save Reports !'))) return;
            const remark = await ask('Remark', 'Enter The Remarks');
            await a.run('save-stock-libno', { series, remark: remark ?? '' }, []);
          }),
          { kind: 'separator' },
          {
            kind: 'submenu',
            label: 'Replace In Selected',
            items: [
              item('Author', replaceIn('Author', 'authors-of', 'authors', 'replace-author')),
              item(
                'Author Type',
                replaceIn('Author Type', 'author-types-of', 'author-types', 'replace-author-type'),
              ),
              item(
                'Prakashak',
                replaceIn('Prakashak', 'prakashaks-of', 'prakashaks', 'replace-prakashak'),
              ),
              item(
                'GranthMala',
                replaceIn('GranthMala', 'gmalas-of', 'gmalas', 'replace-granth-mala'),
              ),
              item(
                'Replace Old Vishesh ColumnNo For All Grid Record having specific  Details Record ',
                async () => {
                  const rows = await pick(
                    'Vishesh',
                    async () =>
                      tableList(await a.call('vishesh-of-grid', { gridIds: a.gridIds }, [])),
                    false,
                  );
                  if (!rows || rows.code.length === 0 || rows.code[0] === '') return;
                  const col = await pick('Column No', namedList('vishcol'), true);
                  const kt = Number(col?.code[0]) || 0;
                  if (kt > 0)
                    await a.run(
                      'replace-vishesh-colno',
                      { vishesh: rows.code.join(','), column: kt },
                      [],
                    );
                },
              ),
              item(
                'In Specific VishColNo Replace Vishesh Detail Of All Grid Record by Newely Selected Detail',
                async () => {
                  const col = await pick('Column No', namedList('vishcol-all'), true);
                  const column = Number(col?.code[0]) || 0;
                  if (column <= 0) return;
                  const load = async () =>
                    tableList(await a.call('vishesh-of-column', { column }, []));
                  const rows = await pick('Vishesh', load, false);
                  if (!rows || rows.code.length === 0 || rows.code[0] === '') return;
                  const detail = await pick('Detail', load, true);
                  if (!detail) return;
                  await a.run(
                    'replace-vishesh-detail',
                    { column, vishesh: rows.code.join(','), detail: detail.name },
                    [],
                  );
                },
              ),
            ],
          },
          { kind: 'separator' },
          ...(admin
            ? [
                item('Restart Last Report Counter', withPassword('restart-report-counter', {}, [])),
                item(
                  'Generate New Report No',
                  notOnWeb(
                    'Generate New Report No (it runs the Kruti Master report numbering too)',
                  ),
                ),
              ]
            : []),
          item('Show Report Table', async () => {
            const r = await a.call('report-table', undefined, []);
            if (r?.kind === 'table')
              setDialog({ kind: 'popup', title: '', columns: r.columns, rows: r.rows });
          }),
          ...(admin
            ? [
                item('Show Record of GSearchM', async () => {
                  const r = await pick('GSearchM', namedList('gsearch'), false);
                  if (r && r.code.length > 0 && r.code[0] !== '')
                    await a.run('gsearch-records', { gsearch: r.code.join(',') }, []);
                }),
              ]
            : []),
          // item('Find Mismatch of LibNo', run('mismatch-libno', undefined, [])),
          // item('Find Mismatch of Author', run('mismatch-author', undefined, [])),
          // item("Update PSamvatvk For PsamvatVK  =  ''", run('update-psamvatvk', undefined, [])),
          // item("Update NameSelected='' For prakname=nameselected ", async () => {
          //   if (await a.confirm('Are You Sure to Update?'))
          //     await a.run('update-name-selected', undefined, []);
          // }),
          // item("Update AuthorSelected='' For authorname=authselected ", async () => {
          //   if (await a.confirm('Are You Sure to Update?'))
          //     await a.run('update-author-selected', undefined, []);
          // }),
          // ComparePrintNo_Click's loop has no body.
          item('Compare PrintNo', () => undefined),
          // item('Update MixSign For Selected Record', async () => {
          //   const r = await pick('MixSign', namedList('mix-sign'), true);
          //   if (r && r.name !== '') await a.run('update-mix-sign', { sign: r.name });
          // }),
          item('Update LinkWithKruti', async () => {
            if (await a.confirm('Are you sure to update LinkWithKruti?'))
              await a.run('update-link-with-kruti', undefined, []);
          }),
          item(
            'Add in Magazine Master',
            notOnWeb(
              'Add in Magazine Master (it saves the Magazine Master record, not yet on the web)',
            ),
          ),
          // item(
          //   'Show MagBookMT for Selected Record',
          //   notOnWeb('Show MagBookMT (the Magazine Master popup, not yet on the web)'),
          // ),
          // item(
          //   'Magazinebook  Not linked in Magazine Master',
          //   run('magazine-not-linked', undefined, []),
          // ),
          // {
          //   kind: 'submenu',
          //   label: 'Update For Selected Record',
          //   items: [
          //     item('Selection Master', async () => {
          //       if (!(await a.confirm('Are You Sure to Update SelectionMaster'))) return;
          //       const r = await a.call('selection-choices');
          //       if (r?.kind !== 'table') return;
          //       const p = await pick('Selection Master', async () => tableList(r), true, r.title);
          //       if (p) await a.run('set-selection', { selectionKt: Number(p.code[0]) || 0 });
          //     }),
          //     item('Workgiven Master', async () => {
          //       if (!(await a.confirm('Are You Sure to Update SelectionMaster'))) return;
          //       const r = await a.call('workgiven-choices');
          //       if (r?.kind !== 'table') return;
          //       const p = await pick('Workgiven Master', async () => tableList(r), true, r.title);
          //       if (p) await a.run('set-workgiven', { workGivenKt: Number(p.code[0]) || 0 });
          //     }),
          //   ],
          // },
          item('Update Kruti Seq', async () => {
            const r = await pick('List', namedList('kruti-sampraday'), true);
            const sampradayKt = Number(r?.code[0]) || 0;
            if (sampradayKt > 0) await a.run('update-kruti-seq', { sampradayKt }, []);
          }),
          // The scan folder's top folders, as a book list in Excel.
          item('ScanData Folder Info', run('scan-folder-info', undefined, [])),
        ],
      },
      // {
      //   kind: 'submenu',
      //   label: 'Filter',
      //   items: [
      //     item(
      //       'User Detail',
      //       () => void a.alert('User Detail (frmSearchUser) is not available on the web yet.'),
      //     ),
      //     item('Having AuthorSelected <> AuthorName', run('having-author-selected', undefined, [])),
      //     item(
      //       "Having AuthorSelected <> '' and Authorkt=''",
      //       run('having-author-selected-no-author', undefined, []),
      //     ),
      //     item('Having NameSelected <> PrakName', run('having-name-selected', undefined, [])),
      //     item(
      //       "Having NameSelected <> '' and PrakName=''",
      //       run('having-name-selected-no-prak', undefined, []),
      //     ),
      //     item('Distinct Common/Part GrpNo', async () => {
      //       const answer = await a.yesNoCancel(
      //         'For distinct CommonGroupNo(Press Yes)\r\nFor distinct PartGroupNo(Press No)\r\nFor distinct CommonGroup and PartGroupNo(Press Cancel)',
      //       );
      //       const mode = answer === 'yes' ? 'common' : answer === 'no' ? 'part' : 'both';
      //       await a.run('distinct-groups', { mode }, []);
      //     }),
      //     item('LibNo', async () => {
      //       const libNo = await ask('Enter Library No');
      //       if (libNo) await a.run('filter-libno', { libNo }, []);
      //     }),
      //   ],
      // },
    ];

    if (printVisible) {
      const range = async (): Promise<[number, number] | null> => {
        const text = await ask('Enter The Number Do You Want To Print', 'From-To Report No');
        if (!text || text.trim() === '') return null;
        const parts = text.split('-');
        if (parts.length !== 2) {
          await a.alert('Please Enter Proper Range(Ex:1-5)');
          return null;
        }
        return [Number(parts[0]) || 0, Number(parts[1]) || 0];
      };
      const pickHeadsThenColumns = async () => {
        const heads = await pick('Head', namedList('heads'), false);
        if (!heads || heads.code.length === 0 || heads.code[0] === '') return null;
        const vibhag = heads.code.join(',');
        const cols = await pick(
          'Column',
          async () => tableList(await a.call('vishesh-columns-of-vibhag', { vibhag }, [])),
          false,
        );
        if (!cols || cols.code.length === 0 || cols.code[0] === '') return null;
        return { vibhag, column: cols.code.join(',') };
      };
      items.push({
        kind: 'submenu',
        label: 'Print',
        items: [
          item('Send To Excel', a.sendToExcel),
          a.printLayouts.length > 0
            ? {
                kind: 'submenu',
                label: 'Print Selected Column',
                items: a.printLayouts,
                onSelect: a.printSelectedColumn,
              }
            : item('Print Selected Column', a.printSelectedColumn),
          { kind: 'separator' },
          ...(admin
            ? [
                item(
                  'Samvat Report In Range',
                  notOnWeb('Samvat Report In Range (Crystal Reports / Excel templates)'),
                ),
              ]
            : []),
          // FullCardPortraitToolStripMenuItem_Click: the "prakashan Card.xls" cards, as a page.
          item('Full Card Portrait', async () => {
            const withParichayak = await a.confirm('Do You Want to Print Column No?');
            await a.run('full-card-portrait', { withParichayak });
          }),
          { kind: 'separator' },
          item('New Vishesh Report', async () => {
            const r = await pick('Head', namedList('heads-by-name'), true);
            const kt = Number(r?.code[0]) || 0;
            if (kt > 0) await a.run('new-vishesh-report', { vibhagKt: kt }, []);
          }),
          item(
            'Vishesh Report',
            () => void a.alert('Vishesh Report is not available on the web yet.'),
          ),
          item('Vishesh Parishisht Report', async () => {
            const chosen = await pickHeadsThenColumns();
            if (!chosen) return;
            const printDetail = await a.confirm('Print Detail');
            const printVibhag = await a.confirm('Print Vibhag');
            await a.run('vishesh-parishisht-report', { ...chosen, printDetail, printVibhag }, []);
          }),
          item('PrintNo With Kruti/Book', async () => {
            const books = await range();
            if (!books) return;
            await a.run('printno-with-kruti', { kind: 'book', from: books[0], to: books[1] }, []);
            const krutis = await range();
            if (!krutis) return;
            await a.run(
              'printno-with-kruti',
              { kind: 'kruti', from: krutis[0], to: krutis[1] },
              [],
            );
          }),
          item('Lekh Prastavana Report', async () => {
            const chosen = await pickHeadsThenColumns();
            if (chosen) await a.run('lekh-prastavana-report', chosen, []);
          }),
          item('Book Report', async () => {
            const r = await pick('PrintNo', namedList('print-nos'), false);
            if (r && r.code.length > 0 && r.code[0] !== '')
              await a.run('book-report', { printNos: r.code.join(',') }, []);
          }),
          // item('Magazine Vishesh', run('magazine-vishesh-report')),
          item('Prak Vishesh', async () => {
            const r = await pick(
              'Column',
              async () => tableList(await a.call('prak-vishesh-columns')),
              false,
            );
            if (r && r.code.length > 0 && r.code[0] !== '')
              await a.run('prak-vishesh-report', { columns: r.code.join(',') });
          }),
          item('VK Samvat Report', run('vk-samvat-report')),
        ],
      });
    }
    return items;
  }

  return (
    <div className="h-full">
      <MasterScreen spec={spec} {...props} menu={menu} />

      {dialog?.kind === 'pick' && (
        <PickListDialog
          title={dialog.title}
          list={dialog.list}
          selectFirst={dialog.selectFirst}
          initialText={dialog.initialText}
          addBlankRow={dialog.addBlankRow}
          onCancel={() => {
            const d = dialog;
            setDialog(null);
            d.resolve(null);
          }}
          onPick={(r) => {
            const d = dialog;
            setDialog(null);
            d.resolve(r);
          }}
        />
      )}
      {dialog?.kind === 'input' && (
        <InputBox
          prompt={dialog.prompt}
          title={dialog.title}
          onOk={(v) => {
            const d = dialog;
            setDialog(null);
            d.resolve(v);
          }}
          onCancel={() => {
            const d = dialog;
            setDialog(null);
            d.resolve(null);
          }}
        />
      )}
      {dialog?.kind === 'popup' && (
        <PopupTableDialog
          title={dialog.title}
          columns={dialog.columns}
          rows={dialog.rows}
          onClose={() => setDialog(null)}
        />
      )}
      {bookT && (
        <BookTranDialog
          bookId={bookT.bookId}
          tids={bookT.tids}
          showAll={bookT.showAll}
          onClose={async (changed) => {
            const ctx = bookT.ctx;
            setBookT(null);
            // frm.boolSave: Library No reads the book's numbers again.
            if (changed && ctx) {
              try {
                const record = await api.get<GridRow>(`/master/book-master/record/${bookT.bookId}`);
                ctx.setField('BookTran', netString(record.BookTran ?? record.txtBookTran ?? null));
              } catch (err) {
                await msg.alert(errorMessage(err));
              }
            }
          }}
        />
      )}
      {msData && (
        <BookMSDataDialog
          bookId={msData.bookId}
          onClose={() => setMsData(null)}
          onSave={(values) => {
            for (const [k, v] of Object.entries(values.fields)) msData.state.setField(k, v);
            for (const [k, v] of Object.entries(values.tags)) msData.state.setTag(k, v);
            setMsData(null);
          }}
        />
      )}
    </div>
  );
}

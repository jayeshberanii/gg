'use client';

import type { ActionResult, ChildRow, GridValue, PickList, TransGrid } from '@gglib/shared';
import { UserType } from '@gglib/shared';
import { useMemo, useRef, useState } from 'react';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import { InputBox } from '@/components/ui/InputBox';
// import { ToolButton, ToolSeparator } from '@/components/ui/Modal';
import { useMessageBox } from '@/components/ui/MessageBox';
import { PickListDialog, type PickResult } from '@/components/ui/PickListDialog';
import { useAuth } from '@/features/auth/AuthProvider';
import { DisplayTransDialog } from '@/features/master/DisplayTransDialog';
import { MasterScreen } from '@/features/master/MasterScreen';
import { sendTextToWord } from '@/features/master/sendToExcel';
import { netString } from '@/features/master/transSummary';
import type {
  ActionParams,
  FormContext,
  ScreenActions,
  ScreenSpec,
  TransSpec,
} from '@/features/master/types';
import type { MasterState } from '@/features/master/useMasterScreen';
import { api, errorMessage } from '@/lib/api';
import { getVikramSamvat } from './AuthorMaster';
import { buildKrutiTree, type KrutiNode, KrutiTree, krutiTreeText } from './KrutiTree';
import { type KrutiWorkFilter, KrutiWorkFilterDialog } from './KrutiWorkFilterDialog';
import type { ScreenProps } from './registry';

/**
 * Library › Kruti Master (frmKrutiMasterNew). See docs/screens/kruti-master.md.
 *
 * The panel is frmKrutiMasterNew.designer.vb's (SplitterDistance 349, Times New Roman 14.25);
 * the popups are SetForm_Kruti's (frmDisplayTransNew, FormName "Kruti").
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

const cell = (row: ChildRow, name: string): string => {
  if (name in row) return netString(row[name] ?? null);
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(row)) if (k.toLowerCase() === lower) return netString(v);
  return '';
};

/** Author / SAuthor: "type name(guru)[identity] (avastha)", comma separated. */
function authorSummary(rows: ChildRow[]): string {
  let out = '';
  for (const r of rows) {
    const name = cell(r, 'Anyaname').trim() === '' ? cell(r, 'authorname') : cell(r, 'Anyaname');
    out += `${out.trim() === '' ? '' : ','}${cell(r, 'authortype')} ${name}`.trim();
    if (cell(r, 'Guru').trim() !== '') out += `(${cell(r, 'Guru')})`;
    else if (cell(r, 'Identyty').trim() !== '') out += `[${cell(r, 'Identyty')}]`;
    if (cell(r, 'Avastha').trim() !== '') out += ` (${cell(r, 'Avastha')})`;
  }
  return out;
}

/** Vishay: Remark joined by spaces, Vishay / Vachan / Vibhakti run on. */
function vishaySummary(rows: ChildRow[], columns: string[]): string {
  let out = '';
  for (const r of rows) {
    for (const col of columns) {
      const upper = col.toUpperCase();
      if (upper === 'REMARK') out = signBetween(out, netString(r[col] ?? null).trim(), ' ');
      else if (upper === 'VISHAY' || upper === 'VACHAN' || upper === 'VIBHAKTI')
        out += netString(r[col] ?? null).trim();
    }
  }
  return out.trim();
}

/** वि.क्र.: "(KrutiNo)(name) Author (Bhasha)", comma separated. */
function upLvlSummary(rows: ChildRow[]): string {
  let out = '';
  for (const r of rows) {
    out += `${out.trim() === '' ? '' : ','}(${cell(r, 'KrutiNo').trim()})(${cell(r, 'krutiname').trim()}) ${cell(
      r,
      'Author',
    ).trim()} (${cell(r, 'Bhasha')})`;
  }
  return out;
}

/** RefLibNo after its popup's Save (FillData adds lipi, pariman and vishash too). */
function refLibSummary(rows: ChildRow[]): string {
  let out = '';
  for (const r of rows) {
    out +=
      `${cell(r, 'BhandarName')} ${cell(r, 'Remark')} ${cell(r, 'BookTName').trim() === '' ? 'प्र.क्र.' : cell(r, 'BookTName')} ${cell(
        r,
        'refplacename',
      )} ${cell(r, 'refpgno').trim() === '' ? '' : `पृष्ठ-${cell(r, 'refpgno')}`}${cell(r, 'SignName')}`.trim() +
      (cell(r, 'Typename').trim() === '' ? '' : ` ${cell(r, 'Typename')}`);
  }
  return out.trim();
}

/** Rag: "types,names" per rag, comma separated. */
function ragSummary(rows: ChildRow[]): string {
  return rows.map((r) => `${cell(r, 'Ragtype')},${cell(r, 'Ragname')}`).join(',');
}

/** Title: as FillData words txtKrutiSubTitleTran (the server's subTitleText). */
export function subTitleSummary(rows: ChildRow[]): string {
  let out = '';
  for (const r of rows) {
    const sp = (c: string, trim = true) =>
      cell(r, c).trim() === '' ? '' : ` ${trim ? cell(r, c).trim() : cell(r, c)}`;
    out +=
      (out.trim() === '' ? '' : ';') +
      signBetween(cell(r, 'SubTitleNo').trim(), cell(r, 'Refplace').trim(), ' ') +
      sp('SubTitleNm') +
      sp('pariman') +
      sp('parimanpattern') +
      sp('adivakya', false) +
      sp('antvakya', false) +
      sp('RagaName', false) +
      sp('refpgno', false) +
      ',' +
      (cell(r, 'remark').trim() === '' ? '' : `(${cell(r, 'remark')})`);
  }
  return out;
}

// ------------------------------------------------------------------------------------------
// The popups (SetForm_Kruti)
// ------------------------------------------------------------------------------------------

const today = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

/** TsBtnSave's checks for more than one row, then seq renumbered. */
const checkRows =
  (checks: (r: ChildRow) => string, extra?: (rows: ChildRow[]) => string) =>
  async (rows: ChildRow[]): Promise<ChildRow[] | string> => {
    if (rows.length > 1) {
      for (const r of rows) {
        const problem = checks(r);
        if (problem) return problem;
      }
      const more = extra?.(rows);
      if (more) return more;
    }
    return rows.map((r) => {
      const seq = Object.keys(r).find((k) => k.toLowerCase() === 'seq') ?? 'seq';
      return { ...r, [seq]: rows.indexOf(r) + 1 };
    });
  };

const AUTHOR: TransSpec = {
  column: 'AuthorTran',
  hidden: ['krutimstkt', 'krutauthkm', 'authorcokt', 'authtycokt', 'avasthaid', 'AuthAnyaNmKt'],
  editable: ['UpdateAuthorSamvat'],
  lookups: {
    authortype: { setKt: 'authtycokt', setName: 'authortype', next: 'authorname' },
    authorname: {
      setKt: 'authorcokt',
      setName: 'authorname',
      // The list's mainname (column 10), Guru and Identyty.
      also: { authorname: 10, Anyaname: 10, Guru: 8, identyty: 2 },
      after: (row) => ({ ...row, AuthAnyaNmKt: 0 }),
      next: 'Anyaname',
    },
    anyaname: { setKt: 'AuthAnyaNmKt', setName: 'Anyaname', perRow: true, selectFirst: false },
    avastha: { setKt: 'avasthaid', setName: 'Avastha', selectFirst: false, next: 'seq' },
  },
  firstColumn: 'authortype',
  summary: authorSummary,
  // Txt_KeyDown after the author popups: no samvat type or samvat, no VK samvat.
  onSaved: (_info, ctx) => {
    if ((ctx.fields.samvattype ?? '') === '' || (ctx.fields.rachsamvat ?? '') === '')
      ctx.setField('Rsamvatvir', '0');
  },
};

const PARIMAN = (column: string, key: string): TransSpec => ({
  column,
  hidden: ['krutimstkt', key, 'parimantypkt', 'sign1kt', 'sign2kt'],
  editable: ['pariman', 'ParimanTypeFull'],
  lookups: {
    sign1: { setKt: 'sign1kt', setName: 'Sign1', next: 'ParimanType' },
    parimantype: { setKt: 'parimantypkt', setName: 'ParimanType', next: 'pariman' },
    sign2: { setKt: 'sign2kt', setName: 'Sign2', next: 'seq' },
  },
  firstColumn: 'Sign1',
});

const RAG_TYPE: TransSpec = {
  column: 'KrutiRagTran',
  hidden: ['KrutiRagTRagTypeKm', 'krutiRagTkt', 'krutimstkt', 'RagTypekt'],
  editable: ['Remark'],
  lookups: { ragtype: { setKt: 'RagTypekt', setName: 'RagType', next: 'Remark' } },
  firstColumn: 'RagType',
};

const RAG_NAME: TransSpec = {
  column: 'KrutiRagTran',
  hidden: ['KrutiRagTRagNmKm', 'krutimstkt', 'krutiRagTkt', 'RagNamekt'],
  editable: ['remark'],
  lookups: { ragname: { setKt: 'RagNamekt', setName: 'RagName', next: 'remark' } },
  firstColumn: 'RagName',
};

/** MultiRagSubTitle: the rags of one Title row. */
const MULTI_RAG_SUBTITLE: TransSpec = {
  column: 'KrutiSubTitleTran',
  hidden: [
    'krutimstkt',
    'KrutiSubTitleRagkm',
    'krutiSubTitleKt',
    'Signkt',
    'RagTypekt',
    'RagNamekt',
  ],
  editable: ['Remark'],
  lookups: {
    sign: { setKt: 'Signkt', setName: 'Sign', next: 'RagType' },
    ragtype: { setKt: 'RagTypekt', setName: 'RagType', next: 'RagType' },
    ragname: { setKt: 'RagNamekt', setName: 'RagName', next: 'Remark' },
  },
  firstColumn: 'Sign',
};

/** TranName "group": txtgroupnm's popup; its Save rewrites KrutiGroupT at once. */
const GROUP: TransSpec = {
  column: 'group',
  hidden: ['krutimstkm'],
  editable: [],
  lookups: {
    krutiname: groupPick(),
    adivakya: groupPick(),
  },
  template: ({ seq }) => [0, 0, '', '', '', '', seq],
  firstColumn: 'krutiname',
};

function groupPick() {
  return {
    after: async (
      row: ChildRow,
      picked: PickResult,
      helpers: { lookup: (name: string, row: ChildRow) => Promise<PickList> },
    ) => {
      const found = await helpers.lookup('group-kruti', { id: Number(picked.code[0]) || 0 });
      const r = found.rows[0];
      if (!r) return row;
      return {
        ...row,
        krutimstkm: r[0] ?? null,
        KrutiNo: r[1] ?? null,
        krutiname: r[2] ?? null,
        adivakya: r[3] ?? null,
        authorname: r[4] ?? null,
      };
    },
    next: 'remark',
  };
}

const TRANS: Record<string, TransSpec> = {
  KrutiNmTran: {
    column: 'KrutiNmTran',
    hidden: ['krutimstkt', 'KrutiNmkm', 'mark1'],
    editable: ['Anyaname', 'Remark'],
    lookups: {
      anyaname: { setName: 'Anyaname', next: 'mark' },
      mark: { setKt: 'mark1', setName: 'mark', next: 'remark' },
    },
    template: ({ seq }) => [0, 0, '', 0, '', '', seq],
    firstColumn: 'Anyaname',
  },
  AuthorTran: AUTHOR,
  SAuthorTran: { ...AUTHOR, column: 'SAuthorTran' },
  krutiparimnTran: PARIMAN('krutiparimnTran', 'krutparimKm'),
  krutisubparimnTran: PARIMAN('krutisubparimnTran', 'krutsubparimKm'),
  KrutiSubTitleTran: {
    column: 'KrutiSubTitleTran',
    hidden: ['krutimstkt', 'krutiSubTitleKm', 'desi'],
    editable: [
      'SubTitleNo',
      'SubTitleNm',
      'Pariman',
      'ParimanPattern',
      'Adivakya',
      'Antvakya',
      'Refpgno',
      'Remark',
      'Refplace',
    ],
    lookups: { refplace: { setName: 'Refplace' } },
    tempKey: 'krutiSubTitleKm',
    firstColumn: 'SubTitleNo',
    children: {
      raganame: {
        extra: 0,
        parentKey: 'krutiSubTitleKm',
        childKey: 'krutiSubTitleKt',
        spec: MULTI_RAG_SUBTITLE,
        cell: (rows) =>
          rows
            .map(
              (r) =>
                `${signBetween(cell(r, 'RagType'), cell(r, 'RagName'), '-')} ${cell(r, 'Remark').trim()}`,
            )
            .join(','),
      },
    },
    vishayEntry: { txtsubtitlenm: { extra: 1, parentKey: 'krutiSubTitleKm' } },
    summary: subTitleSummary,
    // Copy: the title names stay with the kruti they came from.
    onCopy: (state) => ({
      ...state,
      extras: state.extras?.map((t, i) => (i === 1 ? { ...t, rows: [] } : t)),
    }),
    // frm.PariCount: the titles' total goes into a सर्वगाथा (3695) Pariman row.
    onSaved: async ({ pariCount }, ctx) => {
      if (pariCount <= 0) return;
      const base = await ctx.loadTrans('krutiparimnTran');
      if (!base) return;
      const rows = base.rows.map((r) => ({ ...r }));
      const row = rows.find((r) => cell(r, 'parimantypkt') === '3695');
      if (row) row.pariman = String(pariCount);
      else
        rows.push({
          krutimstkt: ctx.tranKm,
          krutparimKm: 1,
          Sign1Kt: 3109,
          Sign1: '->',
          parimantypkt: 3695,
          ParimanType: 'सर्वगाथा',
          pariman: String(pariCount),
          Sign2kt: 0,
          Sign2: '',
          seq: rows.length + 1,
          ParimanTypeFull: '',
        });
      ctx.putTrans('krutiparimnTran', rows, { keepText: true, base });
    },
  },
  krutivishayTran: {
    column: 'krutivishayTran',
    hidden: ['krutimstkt', 'krutisubjkm', 'Vishaykt', 'Mark1', 'Vachankt', 'Vibhaktikt'],
    editable: [],
    lookups: {
      m1: { setKt: 'Mark1', setName: 'M1', next: 'Vishay' },
      vishay: { setKt: 'vishaykt', setName: 'Vishay', next: 'Vachan' },
      vachan: { setKt: 'vachankt', setName: 'Vachan', next: 'Vibhakti' },
      vibhakti: { setKt: 'vibhaktikt', setName: 'Vibhakti', next: 'Remark' },
    },
    template: ({ seq }) => [0, 0, 0, '', 0, '', 0, '', 0, '', '', seq],
    firstColumn: 'M1',
    summary: vishaySummary,
  },
  krutiRelTran: {
    column: 'krutiRelTran',
    hidden: ['krutimstkt', 'krutirelkm', 'uplevelKrutimstkt'],
    editable: [],
    lookups: {},
    newRowDisabled: true,
    firstColumn: 'KrutiNo',
    summary: upLvlSummary,
  },
  SwaroopTran: {
    column: 'SwaroopTran',
    hidden: ['krutimstkt', 'krutiswaropkm', 'swroopkt', 'mark1'],
    editable: [],
    lookups: {
      swroop: {
        setKt: 'swroopkt',
        setName: 'swroop',
        searchPrefix: '/',
        selectFirst: false,
        next: 'm1',
      },
      m1: { setKt: 'mark1', setName: 'm1', selectFirst: false, next: 'seq' },
    },
    template: () => [0, 0, 0, '', 0, '', 1],
    firstColumn: 'swroop',
  },
  KrutiRagTran: {
    column: 'KrutiRagTran',
    hidden: ['KrutiRagTkm', 'krutimstkt'],
    editable: [],
    lookups: {},
    tempKey: 'KrutiRagTkm',
    firstColumn: 'Ragtype',
    children: {
      ragtype: {
        extra: 0,
        parentKey: 'KrutiRagTkm',
        childKey: 'krutiRagTkt',
        spec: RAG_TYPE,
        cell: (rows) => rows.map((r) => cell(r, 'RagType')).join(','),
      },
      ragname: {
        extra: 1,
        parentKey: 'KrutiRagTkm',
        childKey: 'krutiRagTkt',
        spec: RAG_NAME,
        cell: (rows) => rows.map((r) => cell(r, 'RagName')).join(','),
      },
    },
    summary: ragSummary,
  },
  krutireflibnoTran: {
    column: 'krutireflibnoTran',
    hidden: [
      'krutimstkt',
      'krutiReflibnokm',
      'BookTKt',
      'bhandarkt',
      'refplacekt',
      'ktypeid',
      'signkt',
    ],
    editable: [
      'remark',
      'bookdetail',
      'refpgno',
      'pariman',
      'vishash',
      'libseq',
      'IsCommonGroup',
      'IsPrint',
    ],
    lookups: {
      bhandarname: { setKt: 'bhandarkt', setName: 'BhandarName', next: 'remark' },
      booktname: { setKt: 'BookTKt', setName: 'BookTName', next: 'BookDetail' },
      refplacename: { setKt: 'refplacekt', setName: 'RefPlaceName', next: 'refpgno' },
      signname: { setKt: 'signkt', setName: 'SignName', next: 'Typename' },
      typename: { setKt: 'ktypeid', setName: 'Typename', next: 'lipiname' },
      lipiname: { setName: 'lipiname', selectFirst: false, next: 'pariman' },
    },
    template: ({ seq }) => [
      0,
      0,
      0,
      '',
      '',
      0,
      '',
      '',
      0,
      '',
      '',
      0,
      '',
      0,
      '',
      '',
      '',
      '',
      0,
      true,
      false,
      seq,
    ],
    firstColumn: 'BhandarName',
    beforeSave: checkRows(
      (r) =>
        (Number(cell(r, 'BookTKt')) || 0) === 0
          ? `Please Select RefLibNo at Seq : ${cell(r, 'seq')}`
          : cell(r, 'TypeName') === ''
            ? `Please Select TypeName at Seq : ${cell(r, 'seq')}`
            : '',
      (rows) =>
        rows.filter((r) => r.IsPrint === true).length > 1
          ? 'Cannot Select IsPrint For More Than One Record'
          : '',
    ),
    menu: [
      {
        label: 'Show Book Detail',
        apply: async (rows, helpers) => {
          const out: ChildRow[] = [];
          for (const r of rows) {
            const detail = await helpers.lookup('book-detail', r);
            out.push({ ...r, BookDetail: detail.rows[0]?.[0] ?? '' });
          }
          return out;
        },
      },
    ],
    summary: refLibSummary,
  },
  KrutiNoteTran: {
    column: 'KrutiNoteTran',
    hidden: [
      'krutimstkt',
      'KrutiNotekm',
      'Kruticolkt',
      'Serieskt',
      'refplacekt',
      'SignColkt',
      'BookTKt',
    ],
    editable: ['wordnm', 'pgno', 'colshortnm'],
    lookups: {
      kruticolname: {
        setKt: 'KrutiColKt',
        also: { KrutiColName: 2 },
        after: (row, picked) =>
          cell(row, 'wordnm') === '' ? { ...row, wordnm: picked.rows[0]?.[1] ?? null } : row,
        next: 'wordnm',
      },
      seriesname: { setKt: 'SeriesKt', setName: 'SeriesName', next: 'wordnm' },
      wordnm: { setName: 'wordnm', perRow: true, next: 'BooktName' },
      booktname: { setKt: 'BookTkt', setName: 'BooktName', next: 'RefPlaceName' },
      refplacename: { setKt: 'RefplaceKt', setName: 'RefPlaceName', next: 'pgno' },
      signcolname: { setKt: 'SignColKt', setName: 'SignColName', next: 'ColShortNm' },
    },
    template: ({ seq }) => [0, 0, 0, 0, 0, '', '', 0, '', 0, '', 0, 0, '', '', seq],
    firstColumn: 'KrutiColName',
    beforeSave: checkRows((r) =>
      (Number(cell(r, 'BookTKt')) || 0) === 0
        ? `Please Select Boook at Seq : ${cell(r, 'seq')}`
        : ['', '0'].includes(cell(r, 'pgno'))
          ? `Please type Pgno at Seq : ${cell(r, 'seq')}`
          : ['', '0'].includes(cell(r, 'Kruticolkt'))
            ? `Please Select Kruti Column at Seq : ${cell(r, 'seq')}`
            : '',
    ),
  },
  BhashaTran: {
    column: 'BhashaTran',
    hidden: ['krutimstkt', 'krutibhashakm', 'bhashakt', 'remarkkt'],
    editable: [],
    lookups: {
      bhashaname: { setKt: 'bhashakt', setName: 'bhashaname', searchPrefix: '/', next: 'Remark' },
      remark: { setKt: 'remarkkt', setName: 'Remark', selectFirst: false, next: 'seq' },
    },
    template: ({ seq }) => [0, 0, 0, '', 0, '', seq],
    firstColumn: 'bhashaname',
  },
  SampradayTran: {
    column: 'SampradayTran',
    hidden: ['KrutiSampradayKm', 'SampradayKt'],
    editable: [],
    lookups: { sampradayname: { setKt: 'SampradayKt', setName: 'SampradayName', next: 'seq' } },
    template: ({ seq }) => [0, 0, '', seq],
    firstColumn: 'SampradayName',
  },
  VibhagTran: {
    column: 'VibhagTran',
    hidden: ['krutimstkt', 'KrutiVibhagKm', 'VibhagKt'],
    editable: [],
    lookups: {
      vibhagname: { setKt: 'VibhagKt', setName: 'VibhagName', searchPrefix: '/', next: 'seq' },
    },
    template: ({ seq }) => [0, 0, 0, '', seq],
    firstColumn: 'VibhagName',
  },
  KrutiSubjTran: {
    column: 'KrutiSubjTran',
    hidden: ['KrutiSubjectKm', 'WorkDoneByKt'],
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
      vishay: { extra: 0, parentKey: 'KrutiSubjectKm', unsavedMessage: 'Please Save Record First' },
    },
  },
};

// ------------------------------------------------------------------------------------------
// The panel
// ------------------------------------------------------------------------------------------

const isNumeric = (s: string) => /^\s*[+-]?(\d+\.?\d*|\.\d+)\s*$/.test(s);

/** txtrachsamvat_Leave: a number is the sadi too; VK samvat from the samvat type and the sadi. */
function onFieldLeave(
  name: string,
  fields: Record<string, string>,
  tags: Record<string, number>,
): Record<string, string> | null {
  if (name !== 'rachsamvat') return null;
  const patch: Record<string, string> = {};
  let sadi = fields.RachnaSadi ?? '';
  if (isNumeric(fields.rachsamvat ?? '')) {
    sadi = fields.rachsamvat ?? '';
    patch.RachnaSadi = sadi;
  }
  const kind = tags.samvattype ?? 0;
  if ((fields.samvattype ?? '') !== '' && kind > 0 && sadi !== '' && isNumeric(sadi))
    patch.Rsamvatvir = String(getVikramSamvat(kind, Math.round(Number(sadi))));
  return patch;
}

type Deps = {
  upLevelF2: (ctx: FormContext) => void;
  groupF2: (ctx: FormContext) => void;
  checkKrutiNo: (ctx: FormContext) => void;
  insertRefLibNo: (a: ScreenActions, state: MasterState) => void;
};

/** The designer's labels: text, x, y. */
const LABELS: [string, number, number][] = [
  ['कृति परि. नाम', 13, 22],
  ['कृति अन्यनाम', 13, 58],
  ['कर्ता 1/कर्ता 2', 13, 94],
  ['विभाग संख्या/परिमाण', 13, 130],
  ['रचना सं', 13, 166],
  ['र.स्थल- प्रशस्ति', 13, 202],
  ['नोट', 13, 238],
  ['आदिवाक्य', 11, 274],
  ['अंत वा.', 13, 307],
  ['रेफरन्स', 461, 20],
  ['टाईटल', 461, 56],
  ['विषय', 461, 92],
  ['वि.क्र.', 461, 128],
  ['स्वरुप', 461, 164],
  ['राग', 461, 200],
  ['ग्रुपनाम', 459, 236],
  ['भाषा', 462, 272],
  ['कृति क्र.', 766, 20],
  ['Rep.No', 766, 56],
  ['प्रकार', 766, 92],
  ['पूर्णता', 766, 128],
  ['विभाग', 766, 164],
  ['ग्रंथाग्र', 766, 200],
  ['कृति विषय', 766, 238],
  ['रीमार्क', 766, 272],
  ['Sampr.', 766, 308],
];

function buildSpec(deps: Deps): ScreenSpec {
  const tran = (name: string, x: number, y: number, w: number) => ({
    name,
    at: { x, y, w },
    trans: name,
  });
  const samvat = { disabledColumn: 'SamvatDisabled' };
  const hidden = (name: string) => ({ name, at: { x: 0, y: 0, w: 0 }, hidden: true });
  return {
    screen: 'kruti-master',
    panelHeight: 349,
    panelWidth: 1006,
    entryLabel: true,
    help: true,
    lockPanel: true,
    lockedColumns: ['locked', 'LockedByAdmin'],
    lockAction: 'lock-records',
    toolbarCheckbox: { name: 'IsDummy', label: 'Dummy', right: 180 },
    labels: LABELS.map(([text, x, y]) => ({ text, at: { x, y } })),
    fields: [
      { name: 'extranm', at: { x: 137, y: 20, w: 319 } },
      tran('KrutiNmTran', 137, 56, 319),
      tran('AuthorTran', 137, 92, 162),
      tran('SAuthorTran', 300, 92, 156),
      tran('krutisubparimnTran', 137, 128, 162),
      tran('krutiparimnTran', 300, 128, 156),
      {
        name: 'samvatkindkt',
        at: { x: 137, y: 164, w: 46 },
        kt: true,
        nameColumn: 'samvatkindName',
        ...samvat,
      },
      {
        name: 'samvattype',
        at: { x: 189, y: 164, w: 52 },
        kt: true,
        nameColumn: 'samvattypeName',
        ...samvat,
      },
      {
        name: 'rachsamvat',
        at: { x: 247, y: 164, w: 52 },
        ...samvat,
        // Txt_KeyDown: the picked sadi's value goes to txtRachnaSadi.
        afterPick: (picked, ctx) => ctx.setField('RachnaSadi', picked.code),
      },
      { name: 'Rsamvatvir', at: { x: 305, y: 164, w: 52 }, alwaysDisabled: true },
      { name: 'RachnaSadi', at: { x: 363, y: 164, w: 50 }, alwaysDisabled: true },
      { name: 'extraid2', at: { x: 419, y: 164, w: 37 }, alwaysDisabled: true },
      {
        name: 'rachnasthalkt',
        at: { x: 137, y: 200, w: 111 },
        kt: true,
        nameColumn: 'rachnasthalname',
      },
      {
        name: 'prasastitypekt',
        at: { x: 254, y: 200, w: 82 },
        kt: true,
        nameColumn: 'prasastitypeName',
      },
      { name: 'prasastipariman', at: { x: 342, y: 200, w: 114 } },
      tran('KrutiNoteTran', 137, 236, 319),
      { name: 'adivakya', at: { x: 137, y: 272, w: 319 } },
      { name: 'antvakya', at: { x: 137, y: 306, w: 319 } },
      tran('krutireflibnoTran', 522, 20, 238),
      tran('KrutiSubTitleTran', 522, 56, 238),
      tran('krutivishayTran', 522, 92, 238),
      { ...tran('krutiRelTran', 522, 128, 238), onF2: deps.upLevelF2, enterOpensTrans: true },
      tran('SwaroopTran', 522, 164, 238),
      tran('KrutiRagTran', 522, 200, 238),
      {
        name: 'groupnm',
        at: { x: 522, y: 236, w: 238 },
        disabledColumn: 'GroupDisabled',
        onF2: deps.groupF2,
      },
      tran('BhashaTran', 522, 272, 238),
      { name: 'IsDownLevel', at: { x: 466, y: 309, w: 119 }, checkbox: 'Down Level' },
      { name: 'IsNSMP', at: { x: 591, y: 309, w: 80 }, checkbox: 'NSMP' },
      { name: 'KrutiNo', at: { x: 838, y: 20, w: 152 }, noF2: true, onLeave: deps.checkKrutiNo },
      { name: 'PNo', at: { x: 838, y: 56, w: 152 }, readOnly: true, alwaysSend: true },
      { name: 'krutitypekt', at: { x: 838, y: 92, w: 152 }, kt: true, nameColumn: 'KrutiTypeName' },
      { name: 'PurnaKt', at: { x: 838, y: 128, w: 152 }, kt: true, nameColumn: 'PurnaName' },
      tran('VibhagTran', 838, 164, 152),
      { name: 'granthagra', at: { x: 838, y: 200, w: 152 } },
      tran('KrutiSubjTran', 838, 236, 152),
      { name: 'remark', at: { x: 837, y: 272, w: 153 } },
      tran('SampradayTran', 837, 308, 153),
      // Visible = False on the desktop: loaded and saved, never shown.
      hidden('krutiname'),
      hidden('parimanpattern'),
      { ...hidden('grpremark'), disabledColumn: 'GroupDisabled' },
      { ...hidden('pending'), checkbox: 'Pending' },
      { ...hidden('published'), checkbox: 'Published' },
      { ...hidden('prapat'), checkbox: 'Prapt' },
    ],
    trans: TRANS,
    columns: [
      { header: 'KrutiMstkm', field: 'krutimstkm', width: 10 },
      { header: 'क्रमांक', field: 'KrutiNo', width: 60 },
      { header: 'कृतिनाम', field: 'extranm', width: 300 },
      { header: 'DownLevel', field: 'IsDownLevel', width: 70 },
      { header: 'भाषा', field: 'Bhasha', width: 70 },
      { header: 'कर्ता1', field: 'Author', width: 250 },
      { header: 'वि.सं.', field: 'Rsamvatvir', width: 90 },
      { header: 'स्वरूप', field: 'Swaroop', width: 120 },
      { header: 'परिमाण', field: 'Pariman', width: 250 },
      { header: 'प्रकार', field: 'KrutiTypeName', width: 80 },
      { header: 'Count', field: 'Count', width: 100 },
      { header: 'पूर्ण', field: 'PurnaName', width: 60 },
      { header: 'वि.क्र.', field: 'UpLvl', width: 220 },
      { header: 'ग्रंथाग्र', field: 'granthagra', width: 100 },
      { header: 'ग्रुप क्र.', field: 'grpno', width: 80 },
      { header: 'ग्रुपनाम', field: 'groupnm', width: 200 },
      { header: 'आदिवाक्य', field: 'adivakya', width: 150 },
      { header: 'अंतवाक्य', field: 'antvakya', width: 150 },
      { header: 'विभाग', field: 'Vibhag', width: 100 },
      { header: 'PNo', field: 'pno', width: 100 },
      // v3.4.3.1: कर्ता2 (SAuthor) gave way to Sampraday and Remark.
      { header: 'Sampraday', field: 'SampradayTran', width: 200 },
      { header: 'Remark', field: 'remark', width: 100 },
    ],
    onFieldLeave,
    // Menu items' ShortcutKeys: Toggle MultiSelect (Ctrl+T), Insert Ref Library No (Ctrl+9).
    ctrlKeys: {
      t: (_a, state) => state.setMultiSelect(!state.multiSelect),
      '9': (a, state) => deps.insertRefLibNo(a, state),
    },
    validate: ({ fields }) =>
      (Number((fields.KrutiNo ?? '').match(/^\s*[+-]?\d+/)?.[0]) || 0) === 0
        ? 'KrutiNo is Null so record can not be saved '
        : '',
    // Save() reads the Kt boxes' texts, and groupnm only while its box is enabled.
    beforeSave: async ({ fields, disabled }) => ({
      samvattypeText: fields.samvattype ?? '',
      prasastitypeText: fields.prasastitypekt ?? '',
      GroupDisabled: disabled.groupnm ? 1 : 0,
    }),
    deleteQuestion: (row) =>
      `Delete the Kruti No ${Number(row?.KrutiNo) || 0} Kruti Name :- ${netString(row?.extranm ?? null)}? `,
    // btnCopy_Click keeps every popup FillData loaded (not the authors or the subjects).
    copy: {
      clear: [],
      newDefaults: true,
      loadTrans: [
        'KrutiNmTran',
        'krutiparimnTran',
        'krutisubparimnTran',
        'KrutiSubTitleTran',
        'krutivishayTran',
        'krutiRelTran',
        'SwaroopTran',
        'KrutiRagTran',
        'krutireflibnoTran',
        'KrutiNoteTran',
        'BhashaTran',
        'SampradayTran',
        'VibhagTran',
      ],
    },
  };
}

// ------------------------------------------------------------------------------------------
// The screen and its right-click menu (cntMenu)
// ------------------------------------------------------------------------------------------

type Dialog =
  | {
      kind: 'pick';
      title: string;
      list: PickList | undefined;
      selectFirst: boolean;
      resolve: (r: PickResult | null) => void;
    }
  | {
      kind: 'input';
      prompt: string;
      title?: string;
      defaultValue?: string;
      resolve: (v: string | null) => void;
    }
  | { kind: 'group'; table: TransGrid; viewOnly: boolean; current: number; groupName: string }
  | { kind: 'work-filter'; resolve: (filter: KrutiWorkFilter | null) => void };

/**
 * cntMenu_Opening: Print Report for Admin / AMaster and these user ids. (v3.4.3.1 replaces this
 * rule by the ContextMenu permission tables, which this database does not have yet.)
 */
const PRINT_USER_IDS = [22, 29, 54, 64, 38, 182];

// const NOT_ON_WEB = (what: string) =>
//   `${what} needs the desktop computers (their Excel templates or Crystal Reports) and cannot run in the web app.`;

export function KrutiMaster(props: ScreenProps) {
  const msg = useMessageBox();
  const auth = useAuth();
  const user = auth.status === 'authenticated' ? auth.user : null;
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [tree, setTree] = useState<KrutiNode[] | null>(null);
  const [treeSelected, setTreeSelected] = useState<number | null>(null);
  /** The up-level lists are 45k rows: loaded once per window. */
  const lists = useRef(new Map<string, PickList>());
  /**
   * boolAskForAdminLockPassword: LockByAdmin asks its password only until one run got through.
   * The web keeps what was typed for the window and sends it again; the API checks it each time.
   */
  // const adminLockPassword = useRef<string | null>(null);

  const namedList = (name: string) => async () => {
    const cached = lists.current.get(name);
    if (cached) return cached;
    const list = await api.get<PickList>(`/master/kruti-master/lists/${name}`);
    lists.current.set(name, list);
    return list;
  };
  const tableList = (r: ActionResult | null): PickList =>
    r?.kind === 'table' ? { columns: r.columns, rows: r.rows } : { columns: [], rows: [] };

  /** DisplayListForm over a list: the pick, or null. */
  function pick(
    title: string,
    load: () => Promise<PickList>,
    selectFirst = true,
  ): Promise<PickResult | null> {
    return new Promise((resolve) => {
      setDialog({ kind: 'pick', title, list: undefined, selectFirst, resolve });
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

  function ask(prompt: string, title?: string, defaultValue?: string): Promise<string | null> {
    return new Promise((resolve) =>
      setDialog({ kind: 'input', prompt, title, defaultValue, resolve }),
    );
  }

  /** Txt_KeyDown F2 on txtkrutiRelTran: pick up levels one by one, "Add More" between. */
  async function upLevelF2(ctx: FormContext) {
    const base = await ctx.loadTrans('krutiRelTran');
    if (!base) return;
    const byName = await msg.confirm('select by KrutiName ?', 'Link UpperLevel Kruti');
    const listName = byName ? 'uplvl-by-name' : 'uplvl-by-no';
    const rows = base.rows.map((r) => ({ ...r }));
    for (;;) {
      const picked = await pick('Link UpperLevel Kruti', namedList(listName));
      const id = Number(picked?.code[0]) || 0;
      if (!picked || id <= 0) return;
      const list = await namedList(listName)();
      const byId = new Map(list.rows.map((r) => [Number(r[0]), r]));
      const chosen = byId.get(id);
      rows.push({
        krutimstkt: ctx.tranKm,
        krutirelkm: 0,
        uplevelKrutimstkt: id,
        KrutiNo: chosen?.[byName ? 2 : 1] ?? 0,
        krutiname: picked.name,
        Author: '',
        Bhasha: '',
        seq: rows.length + 1,
      });
      // Every row's author and language, from the list (clsCom1.getstringvalue).
      for (const r of rows) {
        const found = byId.get(Number(r.uplevelKrutimstkt) || 0);
        r.Author = found?.[3] ?? '';
        r.Bhasha = found?.[4] ?? '';
      }
      ctx.putTrans(
        'krutiRelTran',
        rows.map((r) => ({ ...r })),
        { base },
      );
      if (!(await msg.confirm('Do You Want To Add More Records?'))) return;
    }
  }

  /** Txt_KeyDown F2 on txtgroupnm: the kruti's group, saved straight to KrutiGroupT. */
  async function groupF2(ctx: FormContext) {
    if (ctx.tranKm <= 0) return;
    try {
      const table = await api.get<TransGrid>(`/master/kruti-master/trans/group/${ctx.tranKm}`);
      setDialog({
        kind: 'group',
        table,
        viewOnly: ctx.mode !== 'edit',
        current: ctx.tranKm,
        groupName: ctx.fields.groupnm ?? '',
      });
    } catch (err) {
      await msg.alert(errorMessage(err));
    }
  }

  /** txtKrutiNo_Leave: IsDuplicateKrutiNo. */
  async function checkKrutiNo(ctx: FormContext) {
    const no = ctx.fields.KrutiNo ?? '';
    const r = await ctx.call('krutino-exists', { krutiNo: no, current: ctx.tranKm }, []);
    if (r?.kind === 'message' && Number(r.message) > 0) {
      await msg.alert(`Cannot Enter RecordNo ${no}`, `RecNo ${no} already Exist`);
      ctx.setField('KrutiNo', '');
    }
  }

  /** Insert Ref Library No (Ctrl+9): a type-3518 reference for the current kruti. */
  async function insertRefLibNo(a: ScreenActions, state: MasterState) {
    const current = state.currentId ?? 0;
    if (current <= 0) return;
    const book = await pick('LibNo', namedList('libnos-insert'));
    const tag = Number(book?.code[0]) || 0;
    const refLibNo = await ask('Please Insert Ref LibNo', 'Library', String(tag));
    if (!refLibNo || (Number(refLibNo) || 0) === 0) return;
    const pgno = await ask('Please Insert Page No', `RefLibno=${book?.name ?? ''}`);
    if (!pgno || pgno.trim() === '') return;
    await a.run(
      'insert-ref-libno',
      { current, bookT: Number(refLibNo), libno: book?.name ?? '', pgno },
      [],
    );
  }

  // /** btnAdminLock / btnAdminUnlock: LockByAdmin(True / False). */
  // async function lockByAdmin(a: ScreenActions, lock: boolean) {
  //   if (!(await a.confirm(`Are You Sure To ${lock ? 'Lock' : 'Unlock'} Selected Records?`))) return;
  //   const password = adminLockPassword.current ?? (await a.askPassword());
  //   if (password === null) return;
  //   if (await a.run('lock-by-admin', { lock, password })) adminLockPassword.current = password;
  // }

  const spec = useMemo(
    () =>
      buildSpec({
        upLevelF2: (ctx) => void upLevelF2(ctx),
        groupF2: (ctx) => void groupF2(ctx),
        checkKrutiNo: (ctx) => void checkKrutiNo(ctx),
        insertRefLibNo: (a, state) => void insertRefLibNo(a, state),
      }),
    [],
  );

  function menu(a: ScreenActions, state: MasterState): ContextMenuItem[] {
    const item = (label: string, onSelect: () => void, shortcut?: string): ContextMenuItem => ({
      kind: 'item',
      label,
      onSelect,
      ...(shortcut ? { shortcut } : {}),
    });
    const run = (action: string, params?: ActionParams, ids?: number[]) => () =>
      void a.run(action, params, ids);
    // const runThenReload = (action: string, params?: ActionParams, ids?: number[]) => async () => {
    //   await a.run(action, params, ids);
    //   await state.reload();
    // };
    // const notOnWeb = (what: string) => () => void a.alert(NOT_ON_WEB(what));
    // const current = state.currentId ?? 0;
    const selected = tree && treeSelected ? [treeSelected] : a.selectedIds;
    const code = (r: PickResult | null) => Number(r?.code[0]) || 0;
    const printVisible =
      user !== null &&
      (user.userType === UserType.Admin ||
        user.userType === UserType.AMaster ||
        PRINT_USER_IDS.includes(user.id));
    // cntMenu_Opening: Replace Records for IsAdminLogin and AMaster (the API refuses the rest).
    const replaceRecords = user !== null && (user.isAdmin || user.userType === UserType.AMaster);

    const sampraday = () => pick('Sampraday', namedList('kruti-sampraday'));
    const krutisOf = async (sampradayKt: number) =>
      pick(
        'Kruti',
        async () => tableList(await a.call('krutis-of-sampraday', { sampraday: sampradayKt }, [])),
        false,
      );
    /** PrintAgamSuchiReport: a sampraday, its krutis, Adi/Ant Vakya?, then the report page. */
    const agamSuchi = (pattern: 0 | 1 | 2) => async () => {
      const s = code(await sampraday());
      if (s <= 0) return;
      const ids = (await krutisOf(s))?.code.join(',') ?? '';
      const printAdiAnt = await a.confirm('Do yo Want to Print Adi/Ant Vakya?');
      await a.run('agam-suchi', { sampraday: s, ids, printAdiAnt, pattern }, []);
    };
    /** AkaradiReport: a sampraday, then the report page. */
    const akaradi = (type: string) => async () => {
      const s = code(await sampraday());
      if (s > 0) await a.run('akaradi-report', { type, sampraday: s }, []);
    };

    /** ChangeInSelectedRecord: pick one value, the Security password, then insert or delete it. */
    const change = (kind: string, op: 1 | 2) => async () => {
      if (a.selectedIds.length === 0) return;
      const list =
        op === 1
          ? namedList(kind.toLowerCase())
          : async () => tableList(await a.call('values-of', { kind }));
      const picked = await pick(kind, list);
      const value = code(picked);
      if (!picked || value === 0) return;
      const password = await a.askPassword();
      if (password !== null)
        await a.run('change-in-selected', { kind, op, value, name: picked.name, password });
    };

    const replaceLibNo = (kind: 'ref' | 'note') => async () => {
      const from = await pick(
        'LibNo',
        namedList(kind === 'ref' ? 'libnos-used-ref' : 'libnos-used-note'),
      );
      const to = await pick('LibNo', namedList('libnos'));
      if (code(from) <= 0 || code(to) <= 0) return;
      const r = await a.call('libno-use-count', { kind, from: code(from) }, []);
      const n = r?.kind === 'message' ? Number(r.message) : 0;
      if (n > 0 && (await a.confirm(`LibNo is used in ${n} Kruti\r\nDo you want to replace?`)))
        await a.run(
          'replace-libno',
          { kind, from: code(from), to: code(to), toLibNo: to?.name ?? '' },
          [],
        );
    };

    const noteColumns = async () => pick('Column No', namedList('kruti-cols'));

    /** FindAndReplace(Type, …): the type to replace among the selected krutis', then the new one. */
    const findAndReplace = (kind: 'Ktype' | 'Purn') => async () => {
      const from = await pick(kind, async () =>
        tableList(await a.call('vishesh-of', { kind }, selected)),
      );
      if (code(from) <= 0) return;
      const to = await pick(kind, namedList(kind === 'Ktype' ? 'replace-ktype' : 'replace-purn'));
      if (code(to) <= 0) return;
      await a.run('replace-vishesh', { kind, from: code(from), to: code(to) }, selected);
    };

    /**
     * Replace In Selected › कर्ता 1 › Author / Avastha: the Security password, what to replace
     * among the selected krutis', then what with. Both picks are needed (see the doc).
     */
    const replaceInAuthors = (kind: 'author' | 'avastha') => async () => {
      const password = await a.askPassword();
      if (password === null) return;
      const title = kind === 'author' ? 'Author' : 'Avastha';
      const from = await pick(title, async () =>
        tableList(
          await a.call(kind === 'author' ? 'authors-of' : 'avasthas-of', undefined, selected),
        ),
      );
      if (code(from) <= 0) return;
      const to = await pick(title, namedList(kind === 'author' ? 'authors' : 'avasthas'));
      if (code(to) <= 0) return;
      await a.run(
        kind === 'author' ? 'replace-author' : 'replace-avastha',
        { from: code(from), to: code(to), password },
        selected,
      );
    };

    const items: ContextMenuItem[] = [
      {
        kind: 'submenu',
        label: 'For Selected  Kruti ',
        items: [
          item('BookM', run('book-master', undefined, selected)),
          item('Author Card', async () => {
            const krutiOnly = await a.confirm('Print With Kruti Only(Y) \r\nWith Prakashan(N)');
            await a.run('author-card', { krutiOnly }, selected);
          }),
          item('Swarop', run('swarop-master', undefined, selected)),
          item('Vibhag', run('vibhag-master', undefined, selected)),
          item('Party Master(Bhandar)', run('party-master', undefined, selected)),
          item('TirthRaksha Master', run('tirth-raksha-master', undefined, selected)),
          { kind: 'separator' },
          {
            kind: 'submenu',
            label: 'Utility',
            items: [
              item('Check/Uncheck NSMP', async () => {
                const answer = await a.yesNoCancel(
                  'Press(Yes) to Check NSMP\r\nPress(No) to Uncheck NSMP',
                );
                if (answer !== 'cancel') await a.run('check-nsmp', { nsmp: answer === 'yes' });
              }),
              // The typed text goes in front of the remark, as on the desktop.
              item('Append Remark', async () => {
                const typed = await ask('Please Enter Remark');
                if (typed) await a.run('append-remark', { text: typed }, selected);
              }),
            ],
          },
          ...(replaceRecords
            ? [
                {
                  kind: 'submenu',
                  label: 'Replace Records',
                  items: [
                    item('कृति परि. नाम', async () => {
                      const search = await ask('Enter Existing Text');
                      if (!search) return;
                      const replace = await ask('Enter New Replace Text');
                      if (replace) await a.run('replace-name', { search, replace }, selected);
                    }),
                    item('प्रकार', findAndReplace('Ktype')),
                    item('पूर्णता', findAndReplace('Purn')),
                  ],
                } satisfies ContextMenuItem,
              ]
            : []),
        ],
      },
      // {
      //   kind: 'submenu',
      //   label: 'For Current Record',
      //   items: [
      //     item('Copy Subject', async () => {
      //       const r = await pick('Kruti', namedList('krutis'), false);
      //       if (r && r.code.length > 0 && r.code[0] !== '')
      //         await a.run('copy-subject', { current, to: r.code.join(',') }, []);
      //     }),
      //   ],
      // },
    ];

    if (printVisible) {
      items.push({
        kind: 'submenu',
        label: 'Print Report ',
        items: [
          a.printLayouts.length > 0
            ? {
                kind: 'submenu',
                label: 'Selected Column',
                items: a.printLayouts,
                onSelect: a.printSelectedColumn,
              }
            : item('Selected Column', a.printSelectedColumn),
          item('Missing Rec. Nos', run('missing-nos', { gridIds: a.gridIds }, [])),
          item('Duplicate Rec. Nos', run('duplicate-nos', { gridIds: a.gridIds }, [])),
          // The KrutiCard.xls cards of every row the grid shows (dv.ToTable), as a page.
          item('Full Card Landscape', run('full-card-landscape', { gridIds: a.gridIds }, [])),
          item('Full Card Portrait', run('full-card-portrait', { gridIds: a.gridIds }, [])),
          // Not ported, see docs/screens/kruti-master.md "Cards": KrutiFullCard.rpt is in neither
          // the source nor the built EXE; Old Full Card reads columns its grid and queries do not
          // have; Old Selected Card opens the column picker and prints nothing.
          // item('Crystal Report ', notOnWeb('Crystal Report (KrutiFullCard)')),
          // item('Old Full Card ', notOnWeb('Old Full Card (the "KrutiMater Card.xls" template)')),
          // item('Old Selected Card', notOnWeb('Old Selected Card')),
          item('Send to Excel ', () =>
            tree ? sendTextToWord('NewDocument', krutiTreeText(tree)) : a.sendToExcel(),
          ),
          // swroopreports returns before doing anything on the desktop (its table is always empty).
          // item('Swroop Report', () => undefined),
          // item('Purna Swroop Report', () => undefined),
          item('Nore Report New', run('note-report-new')),
          item('Note Report', async () => {
            const columns = await ask('Enter The Kruti ColNo like 1,2,4-10 ', 'Column No');
            if (!columns) return;
            const answer = await a.yesNoCancel(
              'Press Yes to Print Normal -  No to Print Grouped - Cancell to Print Short ?',
            );
            await a.run('note-report', { columns, mode: answer, gridIds: a.gridIds }, []);
          }),
          item('Kruti Report', async () => {
            const r = await pick('Report No', namedList('report-nos'), false);
            if (r && r.code.length > 0 && r.code[0] !== '')
              await a.run('kruti-report', { pnos: r.code.join(',') }, []);
          }),
          {
            kind: 'submenu',
            label: 'अकारादि कृति रीपोर्ट',
            items: [
              // item('Main Report', async () => {
              //   const answer = await a.yesNoCancel(
              //     'Press Yes To Select Akaradi From Grid Selection Records\r\nPress No To Select From List\r\nPress Cancel To Exit',
              //   );
              //   if (answer === 'cancel') return;
              //   let s: number;
              //   let ids = '';
              //   if (answer === 'yes') {
              //     const r = await a.call('akaradi-sampraday', undefined, []);
              //     s = r?.kind === 'message' ? Number(r.message) || 0 : 0;
              //     ids = a.selectedIds.join(',');
              //   } else {
              //     s = code(await sampraday());
              //     if (s > 0) ids = (await krutisOf(s))?.code.join(',') ?? '';
              //   }
              //   if (s <= 0) return;
              //   const printAdiAnt = await a.confirm('Do yo Want to Print Adi/Ant Vakya?');
              //   await a.run('main-report', { sampraday: s, ids, printAdiAnt }, []);
              // }),
              // PrintAgamSuchiReport(IsStartWithPurnataInKrutiDetail, PrintKrutiNoFirst).
              {
                kind: 'submenu',
                label: 'Main Report As Agam Suchi',
                items: [
                  item('Main', agamSuchi(0)),
                  item('Pattern 1(Start With Purnata In Kruti Detail)', agamSuchi(1)),
                  item('Pattern 2(Print KrutiNo First)', agamSuchi(2)),
                ],
              },
              item('Main Report As Agam Suchi Index', async () => {
                const s = code(await sampraday());
                if (s <= 0) return;
                const ids = (await krutisOf(s))?.code.join(',') ?? '';
                await a.run('agam-suchi-index', { sampraday: s, ids }, []);
              }),
              // The Crystal report KrutiAkaradiAgamSuchiReport: the same questions as Main.
              item('Main Report As Agam Suchi New', async () => {
                const s = code(await sampraday());
                if (s <= 0) return;
                const ids = (await krutisOf(s))?.code.join(',') ?? '';
                const printAdiAnt = await a.confirm('Do yo Want to Print Adi/Ant Vakya?');
                await a.run('agam-suchi-new', { sampraday: s, ids, printAdiAnt }, []);
              }),
              item('Main Report With Reference', async () => {
                const answer = await a.yesNoCancel(
                  'Press Yes To Select Akaradi From Grid Selection Records\r\nPress No To Select From List\r\nPress Cancel To Exit',
                );
                if (answer === 'cancel') return;
                const s = code(
                  await pick(
                    'Sampraday',
                    namedList(answer === 'yes' ? 'kruti-sampraday-akaradi' : 'kruti-sampraday'),
                  ),
                );
                if (s <= 0) return;
                // The desktop's "No" branch never asks for the krutis (it tests Yes twice).
                const ids = answer === 'yes' ? a.selectedIds.join(',') : '';
                const printAdiAnt = await a.confirm('Do yo Want to Print Adi/Ant Vakya?');
                await a.run('main-report-ref', { sampraday: s, ids, printAdiAnt }, []);
              }),
              item('परिशिष्ट 1 - कृति अन्यनाम परिशिष्ट', akaradi('AnyaName')),
              item('परिशिष्ट 2 - टीक आदिना नामनुं परिशिष्ट', akaradi('TikaName')),
              item('परिशिष्ट 3 - त्रूटक के अपूर्ण कृति क्रमांकनुं परिशिष्ट', akaradi('Apurna')),
              item(
                'परिशिष्ट 4 - निर्युक्ति, चूर्णि, भाष्य, टीका, अवचूरि, बालावबोध वाळी कृतिओनुं परिशिष्ट',
                async () => {
                  const all = await a.confirm('Print All Swaroop');
                  await akaradi(all ? 'NiryuktiAll' : 'Niryukti')();
                },
              ),
              item('परिशिष्ट 5 - भाषा परिशिष्ट', akaradi('Bhasha')),
              item('परिशिष्ट 6 - शोधग्रंथ परिशिष्ट', akaradi('ShodhGranth')),
              item('परिशिष्ट 7- टीकागत कथाना अनुवाद', akaradi('TikagatKatha')),
              {
                kind: 'submenu',
                label: 'परिशिष्ट 8 - कर्तानामनुं परिशिष्ट',
                items: [
                  item('Main', akaradi('KartaName')),
                  item('Detail', akaradi('KartaNameDetail')),
                ],
              },
              item('परिशिष्ट 9 - New कृतिना पुस्तकनानाम, प्रकाशकनुं परिशिष्ट', async () => {
                const s = code(await sampraday());
                if (s <= 0) return;
                const printAll = await a.confirm('Print All?');
                await a.run('kruti-prakashak-report', { sampraday: s, printAll }, []);
              }),
              item('मुख्य कृति अने विषयनुं परिशिष्ट', akaradi('MainKruti')),
              item('विषय परिशिष्ट', akaradi('Vishay')),
              // Its handler is commented out on the desktop.
              item('आदिवाक्य, अंतवाक्यनुं परिशिष्ट', () => undefined),
              // item('कृतिना पुस्तकनानाम, प्रकाशकनुं परिशिष्ट', async () => {
              //   const latest = await a.confirm('Print Latest');
              //   await akaradi(latest ? 'PrakashakWithLatestPSamvatVK' : 'Prakashak')();
              // }),
            ],
          },
        ],
      });
    }

    items.push(
      {
        kind: 'submenu',
        label: 'Utility',
        items: [
          // 'Mark Samprad As Complete' (v3.4.3.1) has an empty handler on the desktop: left out.
          // {
          //   kind: 'item',
          //   label: 'Toggle MultiSelect',
          //   shortcut: 'Ctrl+T',
          //   checked: state.multiSelect,
          //   onSelect: () => state.setMultiSelect(!state.multiSelect),
          // },
          {
            kind: 'submenu',
            label: 'Replace In Selected ',
            items: [
              {
                kind: 'submenu',
                label: 'कर्ता 1',
                items: [
                  item('Author', replaceInAuthors('author')),
                  item('Avastha', replaceInAuthors('avastha')),
                ],
              },
              item('Kruticolkt in KrutiNoteT', async () => {
                const col = await noteColumns();
                if (!col) return;
                const notes = await pick(
                  'KrutiNoteT',
                  async () => tableList(await a.call('notes-of-col', { col: code(col) }, [])),
                  false,
                );
                if (!notes || notes.code.length === 0) return;
                const to = await noteColumns();
                if (!to) return;
                await a.run(
                  'replace-note-col',
                  { from: code(col), to: code(to), notes: notes.code.join(',') },
                  [],
                );
              }),
              item('Wordnm in KrutiNoteT', async () => {
                const col = await noteColumns();
                if (!col) return;
                const load = async () =>
                  tableList(await a.call('notes-of-col', { col: code(col) }, []));
                const notes = await pick('KrutiNoteT', load, false);
                if (!notes || notes.code.length === 0) return;
                const word = await pick('wordnm', load);
                if (!word) return;
                await a.run(
                  'replace-note-word',
                  { from: code(col), notes: notes.code.join(','), word: word.name },
                  [],
                );
              }),
              item('ParimanType', async () => {
                const password = await a.askPassword();
                if (password === null) return;
                if (
                  !(await a.confirm(
                    `Want To Replace Parimantype in  -> ${selected.length}  records `,
                  ))
                )
                  return;
                const from = await pick('Pariman', async () =>
                  tableList(await a.call('pariman-types-of', undefined, selected)),
                );
                const to = await pick('Pariman', namedList('pariman-types'));
                await a.run(
                  'replace-pariman-type',
                  { from: code(from), to: code(to), password },
                  selected,
                );
                await state.reload();
              }),
            ],
          },
          {
            kind: 'submenu',
            label: 'Show In Treeview',
            items: (['Down Level', 'Up Level'] as const).map((label) =>
              item(label, async () => {
                const r = await a.call('tree', { up: label === 'Up Level' });
                if (r?.kind === 'table') {
                  setTreeSelected(null);
                  setTree(buildKrutiTree(r.rows as GridValue[][]));
                }
              }),
            ),
          },
          item('Show In Grid ', () => setTree(null)),
          // item('Insert Ji in AuthorSelected Column', run('insert-ji', undefined, [])),
          // // The desktop's handler hands the grid its own table back.
          // item('Utility Store Grid Temporary', () => undefined),
          // item('Send To Author Master', run('send-to-author', undefined, selected)),
          item('Send Selected Record To Title', async () => {
            const target = await pick('Kruti', namedList('title-target'));
            await a.run('send-to-title', { target: code(target) });
            await state.reload();
          }),
          // item(
          //   'Transform krutiname to parichaykname with null ref',
          //   runThenReload('transform-parichay'),
          // ),
          // item('Transform record No in Another Sires', async () => {
          //   const nos = state.rows
          //     .filter((r) => a.selectedIds.includes(Number(r.krutimstkm)))
          //     .map((r) => Number(r.KrutiNo) || 0);
          //   if (nos.length === 0) return;
          //   const start = await ask(
          //     'Enter The Number You Want Transfar Records',
          //     'Only Numeric Value',
          //   );
          //   if (!start || !isNumeric(start)) return;
          //   await a.run(
          //     'transform-recno',
          //     { first: nos[0]!, last: nos[nos.length - 1]!, start: Number(start) },
          //     [],
          //   );
          // }),
          // Its handler is empty on the desktop.
          item('Add Records From Title To Kruti', () => undefined),
          // item('Add RefLibNo in selection Master ', async () => {
          //   const author = await pick('Author', async () =>
          //     tableList(await a.call('authors-of-selection', undefined, selected)),
          //   );
          //   if (code(author) > 0)
          //     await a.run('add-ref-selection', { author: code(author) }, selected);
          // }),
          // item('Delete Selected Kruti With Tran', async () => {
          //   if (a.selectedIds.length === 0) return;
          //   if (!(await a.confirm('Do You Want To Delete Selected Records !'))) return;
          //   await a.run('delete-with-tran');
          //   await state.reload();
          // }),
          item('Insert Ref Library No', () => void insertRefLibNo(a, state), 'Ctrl+9'),
          // item('Save Seq', run('save-seq', { gridIds: a.gridIds }, [])),
          // item(
          //   'Update RefLibNo From Prakshan With "," And "-"',
          //   run('update-reflib-prk', { gridIds: a.gridIds }, []),
          // ),
          // item(
          //   'Update RefLibNo From Prakshan  And Note',
          //   run('update-reflib-prakashan', { gridIds: a.gridIds }, []),
          // ),
          // item(
          //   'Update GroupHead Adivakya or Antvakya',
          //   run('update-group-head-vakya', undefined, []),
          // ),
          // item('Update SwaroopNo Column', async () => {
          //   const range = await ask('Enter The Kruti Number start-End Number', 'Kruti Number');
          //   if (range === null) return;
          //   const parts = range.split('-');
          //   if (parts.length !== 2) {
          //     await a.alert('Please Enter Proper Range(Ex:1-5)');
          //     return;
          //   }
          //   await a.run(
          //     'update-swaroop-no',
          //     { from: Number(parts[0]) || 0, to: Number(parts[1]) || 0 },
          //     [],
          //   );
          // }),
          // item('Update KrutiAuthor', run('update-kruti-author', { kind: 'Author1' }, [])),
          // item('Update KrutiAuthor2', run('update-kruti-author', { kind: 'Author2' }, [])),
          // item('Update VikramSamvat for Selected Record', run('update-vk-samvat')),
          // item(
          //   'Show Record having vikramt samvat=0 but samvattype And samvat is not blank',
          //   run('show-vk-zero', undefined, []),
          // ),
          // item('Update vikramt Samvat=0 where samvatytpe And samvat is blank', async () => {
          //   await a.run('show-samvatless-vk', undefined, []);
          //   if (
          //     await a.confirm(
          //       'In Grid Record vksamvat is >0  where samvatytpe,samvat are blank So want to set vikramsamvat 0 ',
          //     )
          //   )
          //     await a.run('reset-samvatless-vk', undefined, []);
          // }),
          {
            kind: 'submenu',
            label: 'Update Kruti Seq',
            items: [
              item('Akaradi Seq', run('akaradi-seq', undefined, [])),
              item('Agam Suchi Seq', run('agam-seq', undefined, [])),
              item('K Adi Seq', run('kadi-seq', undefined, [])),
              item('Seq', run('seq', undefined, [])),
            ],
          },
          // item('Update Kruti Latest Book Info', run('latest-book-info', undefined, [])),
          {
            kind: 'submenu',
            label: 'Replace LibNo In',
            items: [item('Reference', replaceLibNo('ref')), item('Note', replaceLibNo('note'))],
          },
        ],
      },
      {
        kind: 'submenu',
        label: 'Common Group',
        items: [
          item('Add In New Group', async () => {
            const gridKrutis: PickList = {
              columns: ['krutimstkm', 'extranm'],
              rows: [...state.visibleRows]
                .sort((x, y) => Number(x.krutimstkm) - Number(y.krutimstkm))
                .map((r) => [r.krutimstkm ?? null, r.extranm ?? null]),
            };
            const head = await pick('Kruti', async () => gridKrutis);
            // DisplayListForm(txtgroupnm, …) puts the pick in the panel's group box.
            if (head) state.setField('groupnm', head.name);
            const name = await ask('Enter Group Name');
            if (name) await a.run('group-add-new', { head: code(head), name });
          }),
          item('Add In Existing Group', async () => {
            const group = await pick('Group', namedList('group-heads'));
            if (code(group) <= 0) return;
            const head = await a.confirm('So You Want to Head This Records ');
            await a.run(
              'group-add-existing',
              { group: code(group), groupName: group?.name ?? '', head },
              selected,
            );
          }),
          item('Delete From Group', async () => {
            const group = await pick('Group', async () =>
              tableList(await a.call('groups-of', undefined, selected)),
            );
            if (code(group) > 0) await a.run('group-delete', { group: code(group) }, selected);
          }),
          item('Make Curr Record Has Group Head', async () => {
            const groups = await a.call('groups-of', undefined, selected);
            if (groups?.kind !== 'table' || groups.rows.length === 0) return;
            const group = await pick('Group', async () =>
              tableList(await a.call('group-names-of', undefined, selected)),
            );
            if (code(group) > 0)
              await a.run(
                'group-make-head',
                { group: code(group), groupName: group?.name ?? '' },
                selected.slice(0, 1),
              );
          }),
          item('Modify Group Name', async () => {
            const row = await pick('Group', async () =>
              tableList(await a.call('group-rows-of', undefined, selected)),
            );
            const name = await ask('Enter New Group Name :- ');
            if (code(row) > 0 && name !== null)
              await a.run('group-rename', { row: code(row), name }, selected);
          }),
          // item('Update Group Seq', run('group-seq')),
        ],
      },
      {
        kind: 'submenu',
        label: 'Insert In Selected Record',
        items: ['Bhasha', 'Swaroop', 'Vibhag', 'Sampraday'].map((k) => item(k, change(k, 1))),
      },
      {
        kind: 'submenu',
        label: 'Delete In Selected Record',
        items: ['Bhasha', 'Swaroop', 'Vibhag', 'Sampraday'].map((k) => item(k, change(k, 2))),
      },
      // item('Update Kruti Swarop Head ', async () => {
      //   const from = await pick('Krutihead', async () =>
      //     tableList(await a.call('heads-of', undefined, selected)),
      //   );
      //   if (!from) return;
      //   const to = await pick('Head', namedList('heads'));
      //   if (to) await a.run('update-swarop-head', { from: code(from), to: code(to) }, selected);
      // }),
      {
        kind: 'submenu',
        label: 'Filter',
        items: [
          // The filtered list stays until Refresh (FillList with StrId set for this one load).
          item('Show Records By Work', async () => {
            const filter = await new Promise<KrutiWorkFilter | null>((resolve) =>
              setDialog({ kind: 'work-filter', resolve }),
            );
            if (!filter) return;
            await a.run(
              'show-by-work',
              {
                from: filter.from,
                to: filter.to,
                workTypes: filter.workTypes.join(','),
                sampradays: filter.sampradays.join(','),
                users: filter.users.join(','),
              },
              [],
            );
          }),
        ],
      },
    );
    return items;
  }

  return (
    <div className="h-full">
      <MasterScreen
        spec={spec}
        {...props}
        menu={menu}
        // AdminLockToolStrip (668, 304; 64x25): Visible for AMaster only (Form_Load).
        // inPanel={(a, _state, x) =>
        //   user?.userType === UserType.AMaster ? (
        //     <div
        //       className="win-toolstrip absolute"
        //       style={{ left: x(668), top: 304, width: 64, height: 25, backgroundColor: 'red' }}
        //     >
        //       <ToolButton
        //         icon="lock"
        //         label="Lock By Admin"
        //         onClick={() => void lockByAdmin(a, true)}
        //       />
        //       <ToolSeparator />
        //       <ToolButton
        //         icon="lock-open"
        //         label="Unlock By Admin"
        //         onClick={() => void lockByAdmin(a, false)}
        //       />
        //     </div>
        //   ) : null
        // }
        gridOverride={(a, state) =>
          tree ? (
            <KrutiTree
              roots={tree}
              selectedTag={treeSelected}
              onSelect={(tag) => {
                setTreeSelected(tag);
                void state.loadRecord(tag);
              }}
              menuItems={menu(a, state)}
            />
          ) : null
        }
      />

      {dialog?.kind === 'pick' && (
        <PickListDialog
          title={dialog.title}
          list={dialog.list}
          selectFirst={dialog.selectFirst}
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
          defaultValue={dialog.defaultValue}
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
      {dialog?.kind === 'work-filter' && (
        <KrutiWorkFilterDialog
          onClose={() => {
            const d = dialog;
            setDialog(null);
            d.resolve(null);
          }}
          onSearch={(filter) => {
            const d = dialog;
            setDialog(null);
            d.resolve(filter);
          }}
        />
      )}
      {dialog?.kind === 'group' && (
        <DisplayTransDialog
          screen="kruti-master"
          spec={GROUP}
          table={dialog.table}
          viewOnly={dialog.viewOnly}
          onClose={() => setDialog(null)}
          onSave={(rows) => {
            const d = dialog;
            setDialog(null);
            void api
              .post<ActionResult>('/master/kruti-master/action/save-group', {
                ids: [],
                params: { current: d.current, groupName: d.groupName, rows: JSON.stringify(rows) },
              })
              .catch((err: unknown) => msg.alert(errorMessage(err)));
          }}
        />
      )}
    </div>
  );
}

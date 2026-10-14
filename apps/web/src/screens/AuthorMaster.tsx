'use client';

import type { ChildRow, GridRow, GridValue, PickList } from '@gglib/shared';
import { useMemo, useState } from 'react';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import { useMessageBox } from '@/components/ui/MessageBox';
import { MultiCheckboxDialog } from '@/components/ui/MultiCheckboxDialog';
import { PickListDialog, type PickResult } from '@/components/ui/PickListDialog';
import { PopupTableDialog } from '@/components/ui/PopupTableDialog';
import { ADDRESS_TRANS } from '@/features/master/commonTrans';
import { DisplayImagesDialog } from '@/features/master/DisplayImagesDialog';
import { MasterScreen } from '@/features/master/MasterScreen';
import { sendTextToWord } from '@/features/master/sendToExcel';
import { netString } from '@/features/master/transSummary';
import type {
  ActionParams,
  ScreenActions,
  ScreenSpec,
  TransHelpers,
  TransSpec,
} from '@/features/master/types';
import type { MasterState } from '@/features/master/useMasterScreen';
import { api, errorMessage } from '@/lib/api';
import {
  AuthorTree,
  buildTree,
  checkedIds,
  type TreeLinks,
  type TreeNode,
  treeText,
} from './AuthorTree';
import type { ScreenProps } from './registry';
import { BookTranDialog } from './BookTranDialog';

/**
 * Master › Author Master (frmAuthorMaster). See docs/screens/author-master.md.
 *
 * The panel's boxes and labels are frmAuthorMaster.Designer.vb's; the "…Tran" boxes open their
 * frmDisplayTransNew popups (SetForm_Author / SetForm_Common, ported below as TransSpecs).
 */

// ------------------------------------------------------------------------------------------
// Samvat (frmDisplayTransNew.dgDisplay_CellEndEdit and SetForm_Author "Samvat")
// ------------------------------------------------------------------------------------------

/** MdlLib.GetVikramSamvat: a year of another samvat as Vikram samvat. */
export function getVikramSamvat(code: number, year: number): number {
  if (code <= 1 || year <= 0) return 0;
  switch (code) {
    case 2:
    case 6:
      return year;
    case 3:
    case 7:
      return year - 470;
    case 4:
      return year + 56;
    case 5:
      return year + 134;
    case 8:
      return 56 - year;
    case 9:
      return -470 - year;
    case 10:
      return -year;
    default:
      return 0;
  }
}

const isNumeric = (s: string) => s.trim() !== '' && Number.isFinite(Number(s.trim()));

/** Vksamvat from the row's Asamvat kind and year (a sadi typed by name counts as its value). */
export async function withVksamvat(
  row: ChildRow,
  helpers: TransHelpers,
  virToo: boolean,
): Promise<ChildRow> {
  const kind = Math.trunc(Number(row.AsamvatKt) || 0);
  const asamvat = netString(row.Asamvat);
  if (!(kind > 0 && asamvat.length > 2)) return row;
  let year: number;
  if (isNumeric(asamvat)) year = Math.round(Number(asamvat.trim()));
  else {
    const list = await helpers.lookup('sadivalue', row);
    year = Math.round(Number(list.rows[0]?.[0] ?? 0) || 0);
  }
  const vk = getVikramSamvat(kind, year);
  const next: ChildRow = { ...row, Vksamvat: vk };
  if (virToo) {
    const vir = vk + 470;
    next.VirSamvat = vir < 0 ? `${-vir} पूर्वे` : String(vir);
  }
  return next;
}

// ------------------------------------------------------------------------------------------
// The popups
// ------------------------------------------------------------------------------------------

const LIBNO = (next: string) => ({ setKt: 'BookTKt', setName: 'Libno', next });

function anyName(
  column: string,
  key: string,
  childKey: string,
  libKey: string,
  first: string | number,
): TransSpec {
  return {
    column,
    hidden: [key, 'Avasthakt'],
    editable: ['AnyaName', 'RefPgNo', 'IsPrint'],
    lookups: { avastha: { setKt: 'Avasthakt', setName: 'Avastha', next: 'LibNo' } },
    tempKey: key,
    firstColumn: first,
    nested: {
      column: 'LibNo',
      parentKey: key,
      childKey,
      // TranName "multiLibNo" / "multiLibNo2".
      spec: {
        column,
        hidden: [libKey, childKey, 'BookTKt'],
        editable: [],
        lookups: {
          libno: { lookup: 'multilibno', setKt: 'BookTKt', setName: 'Libno', next: 'Seq' },
        },
        template: ({ seq }) => [0, 0, 0, '', seq],
        firstColumn: 4,
      },
    },
  };
}

const NOTE = (column: string): TransSpec => ({
  column,
  hidden: [
    'AuthorKt',
    'AuthorNotekm',
    'AuthorNote2km',
    'Authorcolkt',
    'Serieskt',
    'refplacekt',
    'SignColkt',
    'BookTKt',
  ],
  editable: ['wordnm', 'pgno'],
  lookups: {
    authorcolname: {
      setKt: 'AuthorColKt',
      setName: 'AuthorColName',
      next: 'SeriesName',
      noSearchText: true,
    },
    seriesname: { setKt: 'SeriesKt', setName: 'SeriesName', next: 'wordnm' },
    wordnm: { setName: 'wordnm', next: 'BooktName' },
    booktname: { setKt: 'BookTkt', setName: 'BooktName', next: 'RefPlaceName' },
    refplacename: { setKt: 'RefplaceKt', setName: 'RefPlaceName', next: 'pgno' },
    signcolname: { setKt: 'SignColKt', setName: 'SignColName', next: 'ColShortNm' },
  },
  template: ({ seq }) => [0, 0, 0, 0, 0, '', '', 0, '', 0, '', '', 0, '', '', seq],
  firstColumn: 3,
});

const TRANS: Record<string, TransSpec> = {
  // txtauthorname's own popup (TranName "AuthorName"; no New, Delete or Up/Down).
  AuthorName: {
    column: 'AuthorName',
    hidden: ['BookTKt'],
    editable: ['AuthorName', 'RefPgNo'],
    lookups: { libno: { setKt: 'BookTKt', setName: 'LibNo', next: 'RefPgNo' } },
    firstColumn: 'AuthorName',
    buttons: { new: false, save: true, delete: false, upDown: false },
    local: {
      columns: ['AuthorName', 'BookTKt', 'LibNo', 'RefPgNo'].map((name) => ({
        name,
        type: 'nvarchar',
      })),
      toRow: (f) => ({
        AuthorName: (f.authorname ?? '').trim(),
        BookTKt: f.AuthorNameRefBookTKt || '0',
        LibNo: f.AuthorNameRefBookTName ?? '',
        RefPgNo: f.AuthorNameRefPgNo ?? '',
      }),
      fromRow: (r) => ({
        authorname: netString(r.AuthorName),
        AuthorNameRefBookTKt: String(Math.trunc(Number(r.BookTKt) || 0)),
        AuthorNameRefBookTName: netString(r.LibNo),
        AuthorNameRefPgNo: netString(r.RefPgNo),
      }),
    },
  },
  KrutiTran: { column: 'KrutiTran', hidden: [], editable: [], lookups: {}, firstColumn: 0 },
  AuthMAnyNmTran: anyName(
    'AuthMAnyNmTran',
    'AuthAnyaNmKm',
    'AuthAnyaNmKt',
    'AuthMAnyLibNoKm',
    'AnyaName',
  ),
  AuthMAnyNm2Tran: anyName(
    'AuthMAnyNm2Tran',
    'AuthAnyaNm2Km',
    'AuthAnyaNm2Kt',
    'AuthMAnyLibNo2Km',
    1,
  ),
  AuthorParamparaTran: {
    column: 'AuthorParamparaTran',
    hidden: [
      'AuthorParamparaKm',
      'Gurukt',
      'Guru1kt',
      'Guru1AnyaNmKt',
      'sign1kt',
      'identitykt',
      'identity2kt',
      'BookTKt',
    ],
    editable: ['PageNo', 'IsPrint'],
    lookups: {
      sign1: { setKt: 'sign1kt', setName: 'Sign1', next: 'Identyty2' },
      identyty2: { setKt: 'identity2kt', setName: 'Identyty2', next: 'Identyty' },
      identyty: { setKt: 'identitykt', setName: 'Identyty', next: 'Guru' },
      guru: { setKt: 'Gurukt', setName: 'Guru', next: 'Guru1' },
      guru1: { setKt: 'Guru1kt', setName: 'Guru1', next: 'Guru1AnyaName' },
      guru1anyaname: {
        setKt: 'Guru1AnyaNmKt',
        setName: 'Guru1AnyaName',
        perRow: true,
        selectFirst: false,
        noSearchText: true,
        alwaysNext: true,
        next: 'Libno',
      },
      libno: LIBNO('PageNo'),
    },
    template: ({ seq }) => [0, 0, '', 0, '', 0, '', 0, '', 0, '', 0, '', 0, '', '', '', 0, seq],
    firstColumn: 2,
  },
  AuthorVishTran: {
    column: 'AuthorVishTran',
    hidden: ['AuthorVishKm', 'Vishkt', 'BookTKt'],
    editable: ['RefPgNo'],
    lookups: {
      visheshan: { setKt: 'Vishkt', setName: 'Visheshan', next: 'Remark' },
      libno: LIBNO('RefPgNo'),
    },
    template: ({ seq }) => [0, 0, '', '', 0, '', '', seq],
    firstColumn: 2,
  },
  AuthMSubTran: {
    column: 'AuthMSubTran',
    hidden: ['AuthMsubkm', 'subjectkt', 'authtypekt'],
    editable: [],
    lookups: {
      subject: { setKt: 'subjectkt', setName: 'Subject', next: 'authortype' },
      authortype: { setKt: 'authtypekt', setName: 'authortype', next: 'remark' },
    },
    template: ({ seq }) => [0, 0, '', 0, '', '', seq],
    firstColumn: 2,
  },
  AuthMContactTran: {
    column: 'AuthMContactTran',
    hidden: ['authMContactkm', 'authContctTypekt', 'Authcontactkt', 'BookTKt', 'SthalKt'],
    editable: ['RefPgNo'],
    lookups: {
      authcontacttype: {
        setKt: 'authContctTypekt',
        setName: 'AuthContactType',
        next: 'AuthorContact',
      },
      authorcontact: {
        setKt: 'Authcontactkt',
        setName: 'AuthorContact',
        perRow: true,
        next: 'remark',
      },
      libno: LIBNO('RefPgNo'),
      sthalname: { setKt: 'SthalKt', setName: 'SthalName', next: 'seq' },
    },
    template: ({ seq }) => [0, 0, '', 0, '', '', 0, '', '', 0, '', seq],
    firstColumn: 2,
  },
  AuthUnavailKrutiTran: {
    column: 'AuthUnavailKrutiTran',
    hidden: ['AuthUnavailKrutiTKm', 'authorcokt', 'vishay', 'uplevelKrutimstkt'],
    editable: ['krutinm', 'kruticontent', 'krutidetail', 'RefPlace'],
    lookups: {
      vishay_nm: { setKt: 'vishay', setName: 'vishay_nm', next: 'upleval' },
      upleval: { setKt: 'uplevelKrutimstkt', setName: 'upleval', next: 'krutino' },
    },
    // The next Kruti No after the last row's, or the next free one.
    template: ({ rows, seq, defaults }) => {
      const last = Math.trunc(Number(rows[rows.length - 1]?.krutino) || 0);
      return [
        0,
        0,
        '',
        '',
        '',
        '',
        0,
        '',
        0,
        '',
        last === 0 ? (defaults.krutino ?? 1) : last + 1,
        '',
        seq,
      ];
    },
    firstColumn: 2,
  },
  AuthorNoteTran: NOTE('AuthorNoteTran'),
  AuthorNote2Tran: NOTE('AuthorNote2Tran'),
  // TranName "LibNo".
  AuthorRefLibnoTran: {
    column: 'AuthorRefLibnoTran',
    hidden: [
      'Authorkt',
      'AuthorRefLibnokm',
      'BookTKt',
      'bhandarkt',
      'refplacekt',
      'ktypeid',
      'signkt',
      'PatrikaKt',
    ],
    editable: ['remark', 'bookdetail', 'refpgno', 'pariman', 'vishash', 'libseq'],
    lookups: {
      bhandarname: { setKt: 'bhandarkt', setName: 'BhandarName', next: 'remark' },
      booktname: {
        setKt: 'BookTKt',
        setName: 'BookTName',
        also: { BookDetail: 2 },
        next: 'BookDetail',
      },
      refplacename: { setKt: 'refplacekt', setName: 'RefPlaceName', next: 'refpgno' },
      signname: { setKt: 'signkt', setName: 'SignName', next: 'Typename' },
      typename: { setKt: 'ktypeid', setName: 'Typename', next: 'lipiname' },
      lipiname: { setName: 'lipiname', selectFirst: false, next: 'PatrikaNo' },
      patrikano: { setKt: 'PatrikaKt', setName: 'PatrikaNo', selectFirst: false, next: 'pariman' },
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
      '',
      0,
      seq,
    ],
    firstColumn: 3,
  },
  AuthorIdentityTran: {
    column: 'AuthorIdentityTran',
    hidden: ['IdentityKt', 'BookTKt'],
    editable: ['RefPgNo', 'IsPrint'],
    lookups: {
      identityname: { setKt: 'Identitykt', setName: 'IdentityName', next: 'Libno' },
      libno: LIBNO('RefPgNo'),
    },
    template: ({ seq }) => [0, '', 0, '', '', 0, seq],
    firstColumn: 1,
  },
  AuthorPattavaliTran: {
    column: 'AuthorPattavaliTran',
    hidden: ['AuthorPattavaliKm', 'PattavaliKt', 'BookTKt', 'UplevelKt'],
    editable: ['PageNo', 'Remark', 'PattavaliSeq'],
    lookups: {
      pattavaliname: { setKt: 'PattavaliKt', setName: 'PattavaliName', next: 'PattavaliSeq' },
      libno: LIBNO('PageNo'),
      uplevelname: { setKt: 'UplevelKt', setName: 'UplevelName', perRow: true, next: 'Seq' },
    },
    template: ({ seq }) => [0, 0, '', '', 0, '', '', '', 0, '', seq],
    firstColumn: 2,
  },
  AnyaYogdanTran: {
    column: 'AnyaYogdanTran',
    hidden: ['AuthorAnyaYogdanKm', 'BookTKt'],
    editable: ['AnyaYogdan', 'RefPgNo'],
    lookups: {
      anyayogdan: { setName: 'AnyaYogdan', valueFromTag: true, next: 'Libno' },
      libno: LIBNO('RefPgNo'),
    },
    template: ({ seq }) => [0, '', 0, '', '', seq],
    firstColumn: 1,
  },
  ParyayTran: {
    column: 'ParyayTran',
    hidden: ['AuthorParyayKm', 'BookTKt'],
    editable: ['Paryay', 'RefPgNo'],
    lookups: {
      paryay: { setName: 'Paryay', valueFromTag: true, next: 'Libno' },
      libno: LIBNO('RefPgNo'),
    },
    template: ({ seq }) => [0, '', 0, '', '', seq],
    firstColumn: 1,
  },
  AuthorGuruTran: {
    column: 'AuthorGuruTran',
    hidden: ['GuruKt'],
    editable: ['IsPrint'],
    lookups: { guruname: { setKt: 'GuruKt', setName: 'GuruName', next: 'Seq' } },
    template: ({ seq }) => [0, '', 0, seq],
    firstColumn: 1,
  },
  SamvatTran: {
    column: 'SamvatTran',
    hidden: ['AuthorSamvatKm', 'SamvatKindKt', 'AsamvatKt', 'BookTKt', 'SthalKt'],
    editable: ['Asamvat', 'PageNo', 'IsPrint'],
    lookups: {
      samvatkindname: { setKt: 'SamvatKindKt', setName: 'SamvatKindName', next: 'AsamvatName' },
      asamvatname: {
        setKt: 'AsamvatKt',
        setName: 'AsamvatName',
        next: 'Asamvat',
        after: (row, _p, helpers) => withVksamvat(row, helpers, false),
      },
      asamvat: {
        setName: 'Asamvat',
        next: 'Libno',
        after: (row, _p, helpers) => withVksamvat(row, helpers, true),
      },
      libno: LIBNO('PageNo'),
      sthalname: { setKt: 'SthalKt', setName: 'SthalName', next: 'seq' },
    },
    onCellEdit: (row, column, helpers) =>
      ['asamvatname', 'asamvat'].includes(column.toLowerCase())
        ? withVksamvat(row, helpers, false)
        : row,
    template: ({ seq }) => [0, 0, '', '', 0, '', '', 0, 0, 0, '', '', 0, '', 0, seq],
    firstColumn: 2,
  },
  SampradayTran: {
    column: 'SampradayTran',
    hidden: ['AuthorSampradayKm', 'SampradayKt', 'RefPlaceKt', 'UpLevelKt', 'BookTKt'],
    editable: ['Remark', 'RefPgNo', 'IsPrint', 'IsPrintAuthor'],
    lookups: {
      sampradayname: { setKt: 'SampradayKt', setName: 'SampradayName', next: 'RefPlaceName' },
      refplacename: { setKt: 'RefPlaceKt', setName: 'RefPlaceName', next: 'UpLevelName' },
      uplevelname: { setKt: 'UpLevelKt', setName: 'UpLevelName', next: 'Remark' },
      libno: LIBNO('RefPgNo'),
      remark: { setName: 'Remark', next: 'Remark' },
    },
    template: ({ seq }) => [0, 0, '', 0, '', 0, '', '', 0, '', '', 0, 0, seq],
    firstColumn: 2,
    summary: 'sampraday',
  },
  // TranName "Address", FormName "Common".
  AddressTran: ADDRESS_TRANS,
};

// ------------------------------------------------------------------------------------------
// The panel
// ------------------------------------------------------------------------------------------

type Dialog =
  | {
      kind: 'pick';
      title: string;
      list: PickList | undefined;
      selectFirst: boolean;
      onPick: (r: PickResult) => void;
    }
  | { kind: 'multi'; onOk: (selection: string) => void }
  | { kind: 'popup'; title: string; columns: string[]; rows: GridValue[][] };

function buildSpec(showPopup: (d: Dialog) => void): ScreenSpec {
  const tran = (name: string, x: number, y: number, w: number, key = name) => ({
    name,
    at: { x, y, w },
    trans: key,
  });
  return {
    screen: 'author-master',
    panelHeight: 338,
    panelWidth: 1012,
    entryLabel: true,
    help: true,
    lockedColumns: ['Locked', 'IsLockedByAdmin'],
    toolbarCheckbox: { name: 'IsGuru', label: 'Guru', right: 183 },
    labels: [
      { text: 'Name1/Sign', at: { x: 4, y: 22 } },
      { text: 'Record/Report No', at: { x: 365, y: 22 } },
      // { text: 'Done By/Grade', at: { x: 698, y: 22 } },
      { text: 'Anya Name1', at: { x: 4, y: 62 } },
      { text: 'Parampara', at: { x: 365, y: 62 } },
      { text: 'Vibhag', at: { x: 698, y: 22 } },
      { text: 'Samvat/', at: { x: 4, y: 102 } },
      {
        text: 'Ref Samvat',
        at: { x: 67, y: 102 },
        sizePt: 12,
        // lnkRefSamvat_LinkClicked: the samvat row this record refers to, in frmPopup.
        onClick: (ctx) => {
          const kt = ctx.tags.RefSamvatKt ?? 0;
          if (kt <= 0) return void ctx.alert('Please Select Ref Samvat');
          void ctx.call('ref-samvat', { refSamvatKt: kt }, []).then((r) => {
            if (r?.kind === 'table')
              showPopup({ kind: 'popup', title: '', columns: r.columns, rows: r.rows });
          });
        },
      },
      { text: 'Smvt.Other/Pattavali', at: { x: 365, y: 102 } },
      { text: 'Marking', at: { x: 698, y: 62 } },
      { text: 'Sampraday', at: { x: 4, y: 142 } },
      { text: 'Kruti', at: { x: 365, y: 141 } },
      { text: 'Subject', at: { x: 698, y: 102 } },
      { text: 'Visheshan', at: { x: 4, y: 182 } },
      { text: 'Any Yogdan/Paryay', at: { x: 365, y: 182 } },
      // { text: 'Author Info', at: { x: 698, y: 183 } },
      { text: 'Parichay/Rem', at: { x: 4, y: 222 } },
      { text: 'Identity', at: { x: 365, y: 222 } },
      // { text: 'Final/Extra Rem', at: { x: 698, y: 223 } },
      { text: 'Note1/Note2', at: { x: 4, y: 262 } },
      { text: 'Old PgNo', at: { x: 365, y: 262 } },
      // { text: 'Name2', at: { x: 700, y: 262 } },
      { text: 'रेफरन्स', at: { x: 4, y: 302 } },
      { text: 'Address', at: { x: 365, y: 302 } },
      { text: 'Anya Name2', at: { x: 700, y: 142 } },
    ],
    fields: [
      { name: 'authorname', label: 'Name1', at: { x: 145, y: 18, w: 170 }, trans: 'AuthorName' },
      { name: 'Sign', at: { x: 317, y: 18, w: 46 } },
      { name: 'recordno', at: { x: 522, y: 18, w: 97 }, numeric: true },
      { name: 'ReportNo', at: { x: 620, y: 18, w: 79 }, numeric: true },
      // { name: 'donebykt', at: { x: 828, y: 18, w: 129 }, kt: true, nameColumn: 'DonebyName' },
      // { name: 'gradekt', at: { x: 958, y: 18, w: 50 }, kt: true, nameColumn: 'GradeName' },
      tran('AuthMAnyNmTran', 145, 58, 218),
      tran('AuthorParamparaTran', 522, 58, 177),
      { name: 'vibhagkt', at: { x: 828, y: 18, w: 180 }, kt: true, nameColumn: 'VibhagName' },
      // { name: 'SignInfo', at: { x: 958, y: 58, w: 50 }, readOnly: true },
      tran('SamvatTran', 145, 98, 115),
      { name: 'RefSamvatKt', at: { x: 262, y: 98, w: 101 }, kt: true, nameColumn: 'RefSamvatName' },
      { name: 'samvatdetail', at: { x: 522, y: 98, w: 97 } },
      tran('AuthorPattavaliTran', 620, 98, 79),
      { name: 'marking', at: { x: 828, y: 58, w: 180 } },
      // { name: 'markremark', at: { x: 906, y: 98, w: 102 } },
      {
        name: 'Sampradaykt',
        at: { x: 145, y: 138, w: 115 },
        kt: true,
        nameColumn: 'SampradayName',
        // v3.4.3.1: txtSampradaykt.Enabled = False — loaded and saved, never typed in or picked.
        alwaysDisabled: true,
      },
      tran('SampradayTran', 262, 138, 101),
      { name: 'KrutiTran', at: { x: 522, y: 137, w: 177 }, transList: 'KrutiTran' },
      tran('AuthMSubTran', 828, 98, 180),
      tran('AuthorVishTran', 145, 178, 218),
      tran('AnyaYogdanTran', 522, 178, 122),
      tran('ParyayTran', 645, 178, 54),
      // tran('AuthUnavailKrutiTran', 828, 179, 180),
      tran('AuthMContactTran', 145, 218, 115),
      { name: 'Remark', at: { x: 262, y: 219, w: 101 } },
      tran('AuthorIdentityTran', 522, 218, 177),
      // tran('AuthorGuruTran', 645, 218, 54),
      // { name: 'FinalRemark', at: { x: 828, y: 219, w: 89 } },
      // { name: 'ExtraRemark', at: { x: 919, y: 219, w: 89 } },
      tran('AuthorNoteTran', 145, 258, 115),
      tran('AuthorNote2Tran', 262, 258, 101),
      // { name: 'finished', at: { x: 522, y: 258, w: 122 } },
      { name: 'pageno', at: { x: 522, y: 258, w: 177 } },
      // { name: 'authorname2', at: { x: 830, y: 258, w: 180 } },
      tran('AuthorRefLibnoTran', 145, 298, 218),
      tran('AddressTran', 522, 298, 177),
      tran('AuthMAnyNm2Tran', 830, 137, 180),
      // txtLibNo (Visible = False) and dtAuthorName's reference: loaded and saved, never shown.
      { name: 'Libno', at: { x: 0, y: 0, w: 0 }, hidden: true },
      { name: 'AuthorNameRefBookTKt', at: { x: 0, y: 0, w: 0 }, hidden: true },
      { name: 'AuthorNameRefBookTName', at: { x: 0, y: 0, w: 0 }, hidden: true },
      { name: 'AuthorNameRefPgNo', at: { x: 0, y: 0, w: 0 }, hidden: true },
    ],
    trans: TRANS,
    columns: [
      { header: 'Id', field: 'authorcokm', width: 100 },
      { header: 'Author Name', field: 'txtauthorname', width: 200 },
      { header: 'Identity', field: 'Identyty' },
      { header: 'Pattavali', field: 'Pattavali' },
      // { header: 'Guru', field: 'txtGuru' },
      { header: 'vksamvat', field: 'vksamvat' },
      // { header: 'Sampraday', field: 'SampradayName' },
      { header: 'Sampraday', field: 'txtSampraday' },
      { header: 'Parampara', field: 'txtParampara', width: 200 },
      { header: 'RecordNo', field: 'recordno' },
      { header: 'Vibhag', field: 'VibhagName', width: 150 },
      // { header: 'Grade', field: 'GradeName' },
      { header: 'ReportNo', field: 'ReportNo' },
      { header: 'LinkWithSadi', field: 'LinkedSadiName', width: 150 },
    ],
    deleteQuestion: (row) =>
      `Are You Sure to Delete This Author ==> ${netString(row?.txtauthorname ?? row?.txtAuthorName ?? null)}`,
    // Save(): renaming an existing author asks whether to keep the old name as an any name.
    beforeSave: async ({ strMode, fields, loaded, confirm }): Promise<Record<string, number>> => {
      const oldName = netString(loaded?.authorname ?? null).trim();
      if (strMode === 'Edit' && loaded && oldName !== (fields.authorname ?? '').trim()) {
        return {
          boolAddAnyaName: (await confirm(
            'Do You Want To Add Entry In AnyaName And Related Transactions?',
          ))
            ? 1
            : 0,
        };
      }
      return {};
    },
  };
}

// ------------------------------------------------------------------------------------------
// The right-click menu (cmsSamv) and Display In Tree
// ------------------------------------------------------------------------------------------

export function AuthorMaster(props: ScreenProps) {
  const msg = useMessageBox();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const spec = useMemo(() => buildSpec(setDialog), []);
  /** tvTree: shown instead of dgMain once "Display In Tree" is chosen. */
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [treeSelected, setTreeSelected] = useState<number | null>(null);
  /** For Selected Record › BookT: the Library No dialog's rows. */
  const [bookTids, setBookTids] = useState<number[] | null>(null);
  /** frmDisplayImages' lstFiles, while it is open. */
  const [images, setImages] = useState<string[] | null>(null);

  /** clsCom.DisplayListForm over one of the form's fixed lists. */
  function pickFrom(name: string, title: string, selectFirst: boolean): Promise<PickResult | null> {
    return new Promise((resolve) => {
      setDialog({ kind: 'pick', title, list: undefined, selectFirst, onPick: (r) => resolve(r) });
      api
        .get<PickList>(`/master/author-master/lists/${name}`)
        .then((list) =>
          setDialog((d) => (d?.kind === 'pick' && d.title === title ? { ...d, list } : d)),
        )
        .catch(async (err: unknown) => {
          setDialog(null);
          resolve(null);
          await msg.alert(errorMessage(err));
        });
    }).finally(() => setDialog(null)) as Promise<PickResult | null>;
  }

  function menu(a: ScreenActions, state: MasterState): ContextMenuItem[] {
    const treeMode = tree !== null;
    const inOrder = (ids: number[]) => a.gridIds.filter((id) => ids.includes(id));
    /** GetSelectedTranId: the tree's selected node, or the grid's selected rows. */
    const tranIds = () =>
      treeMode ? (treeSelected ? [treeSelected] : []) : inOrder(a.selectedIds);
    /** dgMain.Visible ? the selected rows : the ticked tree nodes. */
    const reportIds = () => (treeMode ? checkedIds(tree) : inOrder(a.selectedIds));
    const item = (label: string, onSelect: () => void, shortcut?: string): ContextMenuItem => ({
      kind: 'item',
      label,
      onSelect,
      shortcut,
    });
    const run = (action: string, params?: ActionParams, ids?: number[]) => () =>
      void a.run(action, params, ids);
    const withPassword =
      (action: string, extra: ActionParams = {}, ids?: number[]) =>
      async () => {
        const password = await a.askPassword();
        if (password !== null) await a.run(action, { ...extra, password }, ids);
      };

    const printTree = (onlyChecked: boolean) => () =>
      tree && sendTextToWord('AuthorTree', treeText(tree, onlyChecked));

    return [
      item('Send To Excel', a.sendToExcel),
      // item('marked as physically checked ', run('mark-physically-checked', undefined, tranIds())),
      // item('Show author not used in book', run('not-used-in-book')),
      // item('Update Count for Selected Author', run('update-count', undefined, tranIds())),
      // item('Change Sampraday in Selected Record', async () => {
      //   if (a.selectedIds.length === 0) return;
      //   const r = await pickFrom('sampraday', 'Sampraday', true);
      //   const kt = Number(r?.code[0]);
      //   if (kt > 0) await a.run('change-sampraday', { sampradayKt: kt }, tranIds());
      // }),
      {
        kind: 'submenu',
        label: 'For Selected Record',
        items: [
          item('Kruti', async () => {
            const answer = await a.yesNoCancel(
              'Show In karta1(Press Yes)\r\nShow In karta2(Press No)\r\nShow In Both(Press Cancel)',
            );
            const karta = answer === 'yes' ? 'karta1' : answer === 'no' ? 'karta2' : 'both';
            await a.run('in-use-kruti', { karta }, a.selectedIds.length > 0 ? tranIds() : []);
          }),
          {
            kind: 'submenu',
            label: 'Book Master',
            items: [
              item('Author', run('in-use-book-author', undefined, tranIds())),
              // item('Magazine Vishesh', run('in-use-book-magazine-vishesh', undefined, tranIds())),
              item(
                'Book Master From Author Reference',
                run('in-use-book-reference', undefined, inOrder(a.selectedIds)),
              ),
              item('Prakashan Vishesh', run('in-use-book-prakashan-vishesh', undefined, tranIds())),
            ],
          },
          // item('PrakashanList', run('in-use-prakashan-list', undefined, tranIds())),
          // item('Selection Master', run('in-use-selection-master', undefined, tranIds())),
          item('Prakshak Master', run('in-use-prakashak-master', undefined, tranIds())),
          {
            kind: 'submenu',
            label: 'Utility',
            items: [
              item('Set LinkWithSadi', async () => {
                const r = await pickFrom('link-with-sadi', 'LinkWithSadi', true);
                const kt = Number(r?.code[0]);
                if (kt > 0)
                  await a.run('set-link-with-sadi', { linkSadiKt: kt }, inOrder(a.selectedIds));
              }),
              item('Lock Author', withPassword('lock-author', {}, a.selectedIds)),
              item('Unlock Author', withPassword('unlock-author', {}, a.selectedIds)),
            ],
          },
          item(
            'Magazine Vishesh Master',
            run('in-use-magazine-vishesh', undefined, inOrder(a.selectedIds)),
          ),
          item(
            'English Book Vishesh',
            run('in-use-english-book-vishesh', undefined, inOrder(a.selectedIds)),
          ),
          // v3.4.3.1: frmBookTranNew as a dialog over the Library Nos the selected authors
          // refer to; it opens empty when there are none.
          item('BookT', async () => {
            const result = await a.call('in-use-book-t', undefined, inOrder(a.selectedIds));
            if (result?.kind === 'open') setBookTids(result.ids.length > 0 ? result.ids : [0]);
          }),
        ],
      },
      // item('Find Missing RecNo', run('find-missing-recno', { gridIds: a.gridIds }, [])),
      // item('Find Duplicate RecNo', run('find-duplicate-recno', { gridIds: a.gridIds }, [])),
      // {
      //   kind: 'submenu',
      //   label: 'Show Half Author Name Of Grid Matching',
      //   items: [
      //     item('Author Name', run('half-name-match', { gridIds: a.gridIds }, [])),
      //     item('Starting Part - Author Name', run('starting-part-match', undefined, [])),
      //   ],
      // },
      // item('Insert G in Author', run('insert-g', undefined, [])),
      // item(
      //   'Update VikramSamvat for Selected Record',
      //   run('update-vikram-samvat', undefined, a.selectedIds),
      // ),
      // item('Update pno in Auth-Prak Master', withPassword('update-pno', {}, [])),
      // frmDisplayImages over the references' scanned pages (ReferenceTPath), for dgMain's
      // selected rows.
      item('Show Image of RefrenceT for Selected Record', async () => {
        const r = await a.call('refrence-images');
        if (r?.kind !== 'table') return;
        if (r.message) await a.alert(r.message);
        setImages(r.rows.map((row) => String(row[0] ?? '')));
      }),
      {
        kind: 'submenu',
        label: 'Print Report',
        items: [
          a.printLayouts.length > 0
            ? {
                kind: 'submenu',
                label: 'Print Selected Column',
                items: a.printLayouts,
                onSelect: a.printSelectedColumn,
              }
            : item('Print Selected Column', a.printSelectedColumn),
          // item('Print Books for Selected Author', run('print-books', undefined, a.selectedIds)),
          // item('Reports Of Author Count', run('author-count-report', undefined, [])),
          // item('Kruti Report', run('kruti-report', undefined, [])),
          // item('Author Report', run('author-report', undefined, [])),
          // item('Author Detail Report', run('author-detail-report', undefined, reportIds())),
          {
            kind: 'submenu',
            label: 'Author Reference',
            items: [
              item('All', run('author-reference', { krutiCheck: false }, reportIds())),
              item('Kruti Check', run('author-reference', { krutiCheck: true }, reportIds())),
            ],
          },
          ...(treeMode
            ? [item('Print Tree', printTree(false)), item('Print Selected Tree', printTree(true))]
            : []),
          item('Kruti Author Check', run('kruti-author-check', undefined, reportIds())),
          item('Link With Sadi', async () => {
            const r = await pickFrom('link-with-sadi', 'LinkWithSadi', false);
            if (r && r.code.length > 0 && r.code[0] !== '')
              await a.run('link-with-sadi-report', { linkSadiKt: r.code.join(',') }, []);
          }),
          item('Author Parampara Report', async () => {
            const withReference = await a.confirm('Do you want to print with Reference?');
            await a.run('parampara-report', { printReference: withReference }, []);
          }),
          // item('Print Author Info', run('author-info', undefined, inOrder(a.selectedIds))),
        ],
      },
      {
        kind: 'submenu',
        label: 'Filter',
        items: [
          item(
            'Show Records Used in Selection Master',
            run('used-in-selection-master', undefined, []),
          ),
          {
            kind: 'submenu',
            label: 'Show Records In Use',
            items: [
              item('In All Selection', () => chooseInUse(a, 'And')),
              item('In One Selection', () => chooseInUse(a, 'OR')),
            ],
          },
        ],
      },
      item('Lock Selected Records', withPassword('lock-records', {}, a.selectedIds), 'Ctrl+L'),
      item('Unlock Selected Records', withPassword('unlock-records', {}, a.selectedIds), 'Ctrl+U'),
      item(treeMode ? 'Display In Grid' : 'Display In Tree', () => void toggleTree(a, state)),
      item('Sort By Pattavali', async () => {
        const r = await pickFrom('pattavali', 'Pattavali', true);
        if (r && Number(r.code[0]) > 0) {
          await a.run(
            'sort-by-pattavali',
            { pattavaliKt: Number(r.code[0]), pattavaliName: r.name },
            [],
          );
        }
      }),
      {
        kind: 'submenu',
        label: 'Utility',
        items: [item('Show Attachment', a.showAttachments)],
      },
    ];
  }

  /** ShowRecordsInUse: frmMultiCheckbox over the eight places an author can be used. */
  function chooseInUse(a: ScreenActions, condType: 'And' | 'OR') {
    setDialog({
      kind: 'multi',
      onOk: (selection) => {
        setDialog(null);
        if (selection) void a.run('records-in-use', { selection, condType }, []);
      },
    });
  }

  /** DisplayInTreeToolStripMenuItem_Click. */
  async function toggleTree(a: ScreenActions, state: MasterState) {
    if (tree) {
      setTree(null);
      return;
    }
    const uplevel = await a.confirm('Press(Yes) to Show Uplevel\r\nPress(No) to Show Downlevel');
    const guruParampara = await a.confirm(
      'Press(Yes) to Show गुरुपरंपरा\r\nPress(No) to Show वाचकवंश परंपरा',
    );
    const r = await a.call('tree-links', { uplevel, guruParampara }, []);
    if (r?.kind !== 'table') return;
    const pk = state.meta?.primaryColumn ?? 'authorcokm';
    const roots = a.gridIds
      .filter((id) => a.selectedIds.includes(id))
      .map((id) => state.rows.find((row: GridRow) => Number(row[pk]) === id))
      .filter((row): row is GridRow => Boolean(row))
      .map((row) => ({
        text: netString(row.txtauthorname ?? row.txtAuthorName ?? null),
        id: Number(row[pk]),
      }));
    setTree(buildTree(roots, r as TreeLinks, uplevel));
  }

  return (
    <>
      <MasterScreen
        spec={spec}
        {...props}
        menu={menu}
        gridOverride={(a, state) =>
          tree ? (
            <AuthorTree
              roots={tree}
              onChange={setTree}
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
      {bookTids && (
        <BookTranDialog bookId={0} tids={bookTids} showAll onClose={() => setBookTids(null)} />
      )}
      {dialog?.kind === 'pick' && (
        <PickListDialog
          title={dialog.title}
          list={dialog.list}
          selectFirst={dialog.selectFirst}
          onCancel={() => {
            const d = dialog;
            setDialog(null);
            d.onPick({ code: [], name: '', rows: [] });
          }}
          onPick={dialog.onPick}
        />
      )}
      {dialog?.kind === 'multi' && (
        <MultiCheckboxDialog
          items={[
            'Book Master',
            'Kruti Master',
            'Selection Master',
            'Magazine Master',
            'Hastprat Master',
            'Tirth Raksha Master',
            'Magazine Vishesh',
            'Parampara Guru1',
          ]}
          onOk={dialog.onOk}
          onCancel={() => setDialog(null)}
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
      {images && (
        <DisplayImagesDialog
          screen="author-master"
          files={images}
          onClose={() => setImages(null)}
        />
      )}
    </>
  );
}

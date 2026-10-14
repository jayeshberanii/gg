'use client';

import type { ChildRow, PickList } from '@gglib/shared';
import { useState } from 'react';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import { InputBox } from '@/components/ui/InputBox';
import { PickListDialog, type PickResult } from '@/components/ui/PickListDialog';
import { DisplayImagesDialog } from '@/features/master/DisplayImagesDialog';
import { MasterScreen } from '@/features/master/MasterScreen';
import { netString } from '@/features/master/transSummary';
import type { FieldSpec, ScreenActions, ScreenSpec, TransSpec } from '@/features/master/types';
import type { MasterState } from '@/features/master/useMasterScreen';
// import { api, errorMessage } from '@/lib/api';
import { withVksamvat } from './AuthorMaster';
import type { ScreenProps } from './registry';

const cellText = (v: unknown) => netString((v ?? null) as ChildRow[string]).trim();
const SIGN = (next: string) => ({ setKt: 'signkt', setName: 'Sign', next });
const LIBNO = (setName: string, next: string, rich = false) => ({
  setKt: 'BookTKt',
  setName,
  ...(rich ? { also: { Samvat: 5 } } : {}),
  next,
});

/** multiauthortype: the author types of one Author row. */
const MULTI_AUTHOR_TYPE: TransSpec = {
  column: 'AuthTran',
  hidden: ['PrakMastKt', 'PrakMAuthorAuthTypeKm', 'PrakMAuthorKt', 'authortypekt', 'signkt'],
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
    'PrakMastKt',
    'PrakMAuthorAuthKm',
    'PrakMAuthorKt',
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
    anyaname: { setKt: 'AuthAnyaNmKt', setName: 'AnyaName', perRow: true, next: 'Padvi' },
    padvi: { setKt: 'padkt', setName: 'Padvi', next: 'Sign' },
    sign: SIGN('seq'),
  },
  template: ({ seq }) => [0, 0, 0, 0, '', 0, '', 0, '', '', '', 0, '', seq],
  firstColumn: 'authorname',
};

/** SetForm_PrakMast: the popups of the "…Tran" boxes. New rows get a negative key and Seq. */
const TRANS: Record<string, TransSpec> = {
  AuthTran: {
    column: 'AuthTran',
    hidden: ['PrakMastKt', 'PrakMAuthorKm', 'BookTKt'],
    editable: ['PageNo'],
    lookups: { libno: LIBNO('Libno', 'PageNo') },
    tempKey: 'PrakMAuthorKm',
    firstColumn: 'authortype',
    children: {
      authortype: {
        extra: 1,
        parentKey: 'PrakMAuthorKm',
        childKey: 'PrakMAuthorKt',
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
        parentKey: 'PrakMAuthorKm',
        childKey: 'PrakMAuthorKt',
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
  },
  PrakMAnayNmTran: {
    column: 'PrakMAnayNmTran',
    hidden: ['PrakMAnyNmKm', 'anynmtypekt', 'BookTKt'],
    editable: ['AnyaNm', 'PageNo', 'IsPrint'],
    lookups: {
      anynametype: { setKt: 'anynmtypekt', setName: 'AnyNameType', next: 'LibNo' },
      libno: LIBNO('LibNo', 'PageNo', true),
    },
    tempKey: 'PrakMAnyNmKm',
    firstColumn: 'AnyaNm',
  },
  prakcontactTran: {
    column: 'prakcontactTran',
    hidden: ['prakcontactkm', 'contacttypekt', 'contactkt', 'BookTKt'],
    editable: ['PageNo', 'IsPrint', 'ContactNo'],
    lookups: {
      contacttype: { setKt: 'contacttypekt', setName: 'ContactType', next: 'Contact' },
      contact: { setKt: 'contactkt', setName: 'Contact', next: 'remark' },
      libno: LIBNO('LibNo', 'PageNo'),
    },
    tempKey: 'prakcontactkm',
    firstColumn: 'ContactType',
  },
  PrakMRelTran: {
    column: 'PrakMRelTran',
    hidden: ['PrakRelKm', 'relatedprakkt', 'relationId', 'BookTKt'],
    editable: ['remark', 'PageNo'],
    lookups: {
      relprakashak: { setKt: 'relatedprakkt', setName: 'RelPrakashak', next: 'RelationName' },
      relationname: { setKt: 'relationId', setName: 'RelationName', next: 'remark' },
      libno: LIBNO('LibNo', 'seq'),
    },
    tempKey: 'PrakRelKm',
    firstColumn: 'RelPrakashak',
  },
  PrakMAddTran: {
    column: 'PrakMAddTran',
    hidden: ['prakMAddkm', 'citykt', 'StateKt', 'category', 'BookTKt'],
    editable: [
      'address',
      'pincode',
      'phoneno',
      'email',
      'remark',
      'Pname',
      'MobName',
      'MobileNo',
      'PageNo',
      'IsPrint',
      'Website',
    ],
    lookups: {
      prakashakname: { setName: 'PrakashakName', next: 'address' },
      city: { setKt: 'citykt', setName: 'City', next: 'State' },
      state: { setKt: 'StateKt', setName: 'State', next: 'pincode' },
      categoryname: { setKt: 'category', setName: 'CategoryName', next: 'Pname' },
      libno: LIBNO('LibNo', 'PageNo', true),
    },
    tempKey: 'prakMAddkm',
    firstColumn: 'address',
  },
  PrakMgmalaTran: {
    column: 'PrakMgmalaTran',
    hidden: ['prakGMalakm', 'VisheshTid', 'BookTKt'],
    editable: ['PageNo'],
    lookups: {
      vishesh: { setKt: 'VisheshTid', setName: 'Vishesh', next: 'remark' },
      libno: LIBNO('Libno', 'PageNo'),
    },
    tempKey: 'prakGMalakm',
    firstColumn: 'Vishesh',
  },
  PrakMSubTran: {
    column: 'PrakMSubTran',
    hidden: ['PrakSujTkm', 'Signkt', 'Subjectkt', 'typeid'],
    editable: [],
    lookups: {
      sign: { setKt: 'Signkt', setName: 'Sign', next: 'Subject' },
      subject: { setKt: 'Subjectkt', setName: 'Subject', next: 'remark' },
      type: { setKt: 'typeid', setName: 'Type', next: 'Seq' },
    },
    tempKey: 'PrakSujTkm',
    firstColumn: 'Sign',
  },
  PrakMRefLibNoTran: {
    column: 'PrakMRefLibNoTran',
    hidden: ['PrakMRefLibNoKm', 'BookTKt'],
    editable: ['RefPgNo'],
    lookups: { libno: LIBNO('Libno', 'RefPgNo') },
    tempKey: 'PrakMRefLibNoKm',
    firstColumn: 'Libno',
  },
  PrakMExcelNameTran: {
    column: 'PrakMExcelNameTran',
    hidden: ['PrakMExcelNameKm'],
    editable: ['ExcelName'],
    lookups: {},
    tempKey: 'PrakMExcelNameKm',
    firstColumn: 'ExcelName',
  },
  SamvatTran: {
    column: 'SamvatTran',
    hidden: ['PrakMSamvatKm', 'SamvatKindKt', 'AsamvatKt', 'BookTKt', 'SthalKt'],
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
      libno: LIBNO('Libno', 'PageNo'),
      sthalname: { setKt: 'SthalKt', setName: 'SthalName', next: 'seq' },
    },
    tempKey: 'PrakMSamvatKm',
    firstColumn: 'SamvatKindName',
  },
  PrakarTran: {
    column: 'PrakarTran',
    hidden: ['PrakMPrakarKm', 'PrakarKt', 'SubPrakarKt'],
    editable: [],
    lookups: {
      prakarname: { setKt: 'PrakarKt', setName: 'PrakarName', next: 'SubPrakarName' },
      subprakarname: { setKt: 'SubPrakarKt', setName: 'SubPrakarName', next: 'seq' },
    },
    tempKey: 'PrakMPrakarKm',
    firstColumn: 'PrakarName',
  },
  VibhagTran: {
    column: 'VibhagTran',
    hidden: ['PrakMVibhagKm', 'VibhagKt'],
    editable: [],
    lookups: { vibhagname: { setKt: 'VibhagKt', setName: 'VibhagName', next: 'seq' } },
    tempKey: 'PrakMVibhagKm',
    firstColumn: 'VibhagName',
  },
  PublicationTypeTran: {
    column: 'PublicationTypeTran',
    hidden: ['PrakMPublicationTypeKm', 'PublicationTypeKt'],
    editable: [],
    lookups: {
      publicationtypename: {
        setKt: 'PublicationTypeKt',
        setName: 'PublicationTypeName',
        next: 'seq',
      },
    },
    tempKey: 'PrakMPublicationTypeKm',
    firstColumn: 'PublicationTypeName',
  },
  PraptiSthanTran: {
    column: 'PraptiSthanTran',
    hidden: ['PrakMPraptiSthanKm', 'CityKt', 'StateKt', 'BookTKt'],
    editable: ['PraptiSthanName', 'Address', 'PinCode', 'PageNo', 'PhoneNo', 'Remark'],
    lookups: {
      cityname: { setKt: 'CityKt', setName: 'CityName', next: 'StateName' },
      statename: { setKt: 'StateKt', setName: 'StateName', next: 'PinCode' },
      libno: LIBNO('Libno', 'PageNo', true),
    },
    tempKey: 'PrakMPraptiSthanKm',
    firstColumn: 'PraptiSthanName',
  },
  MudrakTran: {
    column: 'MudrakTran',
    hidden: ['PrakMMudrakKm', 'BookTKt'],
    editable: ['MudrakName', 'MobileNo', 'PageNo'],
    lookups: { libno: LIBNO('Libno', 'PageNo') },
    tempKey: 'PrakMMudrakKm',
    firstColumn: 'MudrakName',
  },
};

/** A box of the three designer columns: label at (lx, y+4), box at (bx, y). */
const box = (
  name: string,
  label: string,
  lx: number,
  bx: number,
  y: number,
  w: number,
  extra: Partial<FieldSpec> = {},
): FieldSpec => ({
  name,
  label,
  labelAt: { x: lx, y: y + 4 },
  at: { x: bx, y, w },
  ...extra,
});
const c1 = (name: string, label: string, y: number, extra: Partial<FieldSpec> = {}) =>
  box(name, label, 13, 111, y, 227, extra);
const c2 = (name: string, label: string, y: number, extra: Partial<FieldSpec> = {}) =>
  box(name, label, 341, 483, y, 195, extra);
const c3 = (name: string, label: string, y: number, extra: Partial<FieldSpec> = {}) =>
  box(name, label, 681, 818, y, 182, extra);
const tran = (name: string): Partial<FieldSpec> => ({ trans: name });

/**
 * Master › Prakashak Master (frmPrakashakMaster). Field and column positions, widths and
 * headers are the ones in frmPrakashakMaster.Designer.vb.
 */
const spec: ScreenSpec = {
  screen: 'prakashak-master',
  panelHeight: 338,
  panelWidth: 1008,
  entryLabel: true,
  help: true,
  lockedColumns: ['Locked'],
  // chkFinished sits on the form, over the toolbar (x 777 of 1012).
  toolbarCheckbox: { name: 'Finished', label: 'Finished', right: 170 },
  fields: [
    c1('prakname', 'Name', 18),
    c1('PrakMAnayNmTran', 'Anya Name', 58, tran('PrakMAnayNmTran')),
    c1('PrakarTran', 'Prakar', 98, tran('PrakarTran')),
    c1('PrakMSubTran', 'Subject', 138, tran('PrakMSubTran')),
    c1('prakcontactTran', 'Contact', 178, tran('prakcontactTran')),
    c1('PrakMAddTran', 'Address', 218, tran('PrakMAddTran')),
    c1('SamvatTran', 'Samvat', 258, tran('SamvatTran')),
    // Not on the desktop form (its txtFinanceKt is commented out); F2 lists PrakMFin.
    c1('FinanceKt', 'Finance', 298, { kt: true, nameColumn: 'FinanceName' }),
    c2('recordno', 'Record No', 18, { readOnly: true, noF2: true }),
    c2('PrakMgmalaTran', 'GMala', 58, tran('PrakMgmalaTran')),
    c2('PrakMRefLibNoTran', 'Ref LibNo', 97, tran('PrakMRefLibNoTran')),
    c2('AuthTran', 'Author', 138, tran('AuthTran')),
    c2('SamudayKt', 'Samuday', 178, { kt: true, nameColumn: 'SamudayName' }),
    c2('Remark', 'Remark', 218),
    c2('PraptiSthanTran', 'Prapti Sthan', 258, tran('PraptiSthanTran')),
    c3('VibhagTran', 'Vibhag', 18, tran('VibhagTran')),
    c3('PrakMRelTran', 'Prak Rel', 58, tran('PrakMRelTran')),
    c3('StatusKt', 'Status', 98, { kt: true, nameColumn: 'StatusName' }),
    c3('PublicationTypeTran', 'Publication Type', 138, tran('PublicationTypeTran')),
    c3('Sampark', 'Publish Count', 178),
    c3('PrakMExcelNameTran', 'Excel Name', 215, tran('PrakMExcelNameTran')),
    c3('MudrakTran', 'Mudrak', 255, tran('MudrakTran')),
  ],
  trans: TRANS,
  columns: [
    { header: 'Id', field: 'prakcodekm', width: 5 },
    { header: 'PrakName', field: 'txtPrakName', width: 200 },
    { header: 'RecordNo', field: 'recordno', width: 80 },
    { header: 'vikramsmvt', field: 'vikramsmvt', width: 90 },
    // { header: 'Count', field: 'Count', width: 70 },
    { header: 'Book Count', field: 'BookCount', width: 80 },
    { header: 'Author', field: 'txtAuthor', width: 120 },
    { header: 'Samuday', field: 'SamudayName', width: 80 },
    { header: 'Vibhag', field: 'VibhagTran', width: 80 },
    { header: 'Prakar', field: 'txtPrakarName', width: 80 },
    { header: 'SubPrakar', field: 'txtSubPrakarName', width: 80 },
    { header: 'Status', field: 'StatusName', width: 80 },
    // Web-only column: the desktop grid has no Finance (GvMain ends at Status).
    { header: 'Finance', field: 'FinanceName', width: 80 },
  ],
};

export function PrakashakMaster(props: ScreenProps) {
  const [picking, setPicking] = useState<{
    list: PickList | undefined;
    onPick: (r: PickResult) => void;
  } | null>(null);
  const [asking, setAsking] = useState<((value: string) => void) | null>(null);
  /** frmDisplayImages' lstFiles, while it is open. */
  const [images, setImages] = useState<string[] | null>(null);

  function menu(a: ScreenActions, _state: MasterState): ContextMenuItem[] {
    const item = (label: string, onSelect: () => void, disabled = false): ContextMenuItem => ({
      kind: 'item',
      label,
      onSelect,
      disabled,
    });
    const run = (action: string, ids?: number[]) => () => void a.run(action, undefined, ids);
    // const withGrid = (action: string) => () =>
    //   void a.run(action, { gridIds: a.gridIds }, a.selectedIds);
    // No handler (or an empty one) on the desktop.
    // const dead = (label: string) => item(label, () => undefined, true);
    return [
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
            : item('Selected Column', a.printSelectedColumn),
          item('Send To Excel', a.sendToExcel),
        ],
      },
      // item('marked as physically checked ', run('mark-physically-checked')),
      // item('show active only', run('show-active-only')),
      item('Update BookCount for Selected Prakashak', run('update-book-count')),
      // item('Update Count for Selected Prakashak', run('update-count')),
      {
        kind: 'submenu',
        label: 'Show in Use',
        items: [
          item('BookM', run('in-use-book')),
          item('Related Prakashak', run('in-use-related')),
          item('Authmaster', run('in-use-author')),
          // item('Selection Master', run('in-use-selection')),
          // item('Prakashan List', run('in-use-prakashan-list')),
        ],
      },
      // dead('Print Full Card'),
      // item('Find Missing RecNo', withGrid('missing-recno')),
      // item('Find Duplicate RecNo', withGrid('duplicate-recno')),
      // dead('Print Selected Column'),
      // dead('Print Card New '),
      // {
      //   kind: 'submenu',
      //   label: 'Show Half Prakashak Name Of Grid Matching',
      //   items: [
      //     item('AnyaName-Contact Name', withGrid('half-match-grid')),
      //     item('Prakashak Name ', withGrid('half-match-grid')),
      //     item('Starting Part -    Prakashak Name ', run('half-match-start')),
      //     // Its query is invalid SQL (an aggregate in WHERE): it always failed on the desktop.
      //     dead('AnyaName-Contac Name By Function'),
      //   ],
      // },
      // item('Update Finance in Selected', () => {
      //   const ids = a.selectedIds;
      //   if (ids.length === 0) return;
      //   setPicking({ list: undefined, onPick: () => undefined });
      //   api
      //     .get<PickList>('/master/prakashak-master/lists/finance')
      //     .then((list) =>
      //       setPicking({
      //         list,
      //         onPick: (r) => {
      //           setPicking(null);
      //           const kt = Number(r.code[0]);
      //           if (kt > 0) void a.run('update-finance', { financeKt: kt }, ids);
      //         },
      //       }),
      //     )
      //     .catch(async (err: unknown) => {
      //       setPicking(null);
      //       await a.alert(errorMessage(err));
      //     });
      // }),
      // dead('Print Book For Selected Prakashak'),
      // dead('Utility Store Grid Temporary'),
      // dead('Send To Prakshan Master'),
      // dead('Having Not Short Name'),
      // item('Print Contact For Selected Grid Records', () =>
      //   setAsking(() => (value: string) => void a.run('print-contact', { range: value }, [])),
      // ),
      // dead('Reports Of Count'),
      // frmDisplayImages over the references' scanned pages (ReferenceTPath).
      item('Show Image of RefrenceT for Selected Record', async () => {
        const r = await a.call('refrence-images');
        if (r?.kind !== 'table') return;
        if (r.message) await a.alert(r.message);
        setImages(r.rows.map((row) => String(row[0] ?? '')));
      }),
      // {
      //   kind: 'submenu',
      //   label: 'Filter',
      //   items: [item('Show Records Used in Selection Master', run('filter-selection'))],
      // },
    ];
  }

  return (
    <>
      <MasterScreen spec={spec} {...props} menu={menu} />
      {picking && (
        <PickListDialog
          title="Finance"
          list={picking.list}
          selectFirst
          onCancel={() => setPicking(null)}
          onPick={picking.onPick}
        />
      )}
      {asking && (
        <InputBox
          prompt="Please Enter ManualNo From-To(Ex:1-100)"
          defaultValue=""
          onOk={(value) => {
            const then = asking;
            setAsking(null);
            then(value);
          }}
          onCancel={() => setAsking(null)}
        />
      )}
      {images && (
        <DisplayImagesDialog
          screen="prakashak-master"
          files={images}
          onClose={() => setImages(null)}
        />
      )}
    </>
  );
}

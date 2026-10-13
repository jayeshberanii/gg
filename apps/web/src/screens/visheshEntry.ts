import { copyWithNewKeys, vishayEntryTrans } from '@/features/master/commonTrans';
import type { FieldSpec, ScreenActions, ScreenSpec, TransSpec } from '@/features/master/types';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';

/**
 * What Magazine Vishesh Master (frmMagazineVisheshNew) and English Book Vishesh
 * (frmEnglishBookVishesh) share: the same form with the names swapped. Their popups
 * (setform_MagazineVishesh / setform_EnglishBookVishesh), their frmVishayEntry boxes, the menu's
 * book list, New's carried boxes and the right-click menu. See vishesh-entry-common.ts on the
 * server.
 */

/** A popup (frmDisplayTransNew, FormName = the table) of one of the `<prefix>…T` tables. */
function popup(
  column: string,
  key: string,
  hidden: string[],
  firstColumn: string,
  lookups: TransSpec['lookups'],
): TransSpec {
  return {
    column,
    hidden: [key, ...hidden],
    editable: [],
    lookups,
    tempKey: key,
    firstColumn,
    // Copy: the copy gets rows of its own (the desktop saved the original's rows in place).
    onCopy: copyWithNewKeys(key, 'temp'),
  };
}

/** The Bhasha, MType, AuthorType and Author popups, keyed by their tblSearch column. */
export function commonPopups(prefix: string): Record<string, TransSpec> {
  const mtype = {
    lookup: 'mtypename',
    setKt: 'MTypeKt',
    setName: 'MTypeName',
    also: { MTypeNo: 2 },
    next: 'MTypeName',
  };
  return {
    BhashaTran: popup('BhashaTran', `${prefix}BhashaKm`, ['BhashaKt'], 'BhashaName', {
      // The cell shows bhasa_attr, the list's third column.
      bhashaname: { setKt: 'BhashaKt', also: { bhashaname: 2 }, next: 'bhashaname' },
    }),
    MTypeTran: popup('MTypeTran', `${prefix}MTypeKm`, ['MTypeKt'], 'MTypeName', {
      mtypename: mtype,
      mtypeno: mtype,
    }),
    AuthorTypeTran: popup(
      'AuthorTypeTran',
      `${prefix}AuthorTypeKm`,
      ['AuthorTypeKt'],
      'AuthorTypeName',
      { authortypename: { setKt: 'AuthorTypeKt', next: 'AuthorTypeName' } },
    ),
    AuthorTran: popup(
      'AuthorTran',
      `${prefix}AuthorKm`,
      ['AuthorKt', 'AuthAnyaNmKt', 'PadKt', 'SignKt'],
      'AuthorName',
      {
        authorname: {
          setKt: 'AuthorKt',
          setName: 'AuthorName',
          // The list's mainname (column 11), Guru and identyty; the any name starts as the name.
          also: { AuthorName: 11, AnyaName: 11, Guru: 2, identyty: 3 },
          after: (row) => ({ ...row, AuthAnyaNmKt: 0 }),
          next: 'AnyaName',
        },
        anyaname: { setKt: 'AuthAnyaNmKt', setName: 'AnyaName', perRow: true },
        // Padvi and Sign take whatever the list leaves, picked or not, and move on.
        padvi: {
          setKt: 'padkt',
          setName: 'Padvi',
          clearOnCancel: true,
          alwaysNext: true,
          next: 'Sign',
        },
        sign: {
          setKt: 'signkt',
          setName: 'Sign',
          clearOnCancel: true,
          alwaysNext: true,
          next: 'Seq',
        },
      },
    ),
  };
}

/** English Book Vishesh's Tag popup (EnglishBookVisheshTagT, a subject per row). */
export const TAG_POPUP: TransSpec = popup(
  'TagTran',
  'EnglishBookVisheshTagKm',
  ['VishayKt'],
  'VishayName',
  { vishayname: { setKt: 'VishayKt', next: 'VishayName' } },
);

/** The frmVishayEntry boxes' popups (FieldSpec.vishayEntry), keyed by their tblSearch column. */
export function vishayPopups(columns: string[]): Record<string, TransSpec> {
  return Object.fromEntries(columns.map((c) => [c, vishayEntryTrans(c)]));
}

/** txtBookTKt: the LibNo list; the pick fills Book Name (with Part) and its Tag too. */
export const libNoField = (at: FieldSpec['at'], labelAt: FieldSpec['labelAt']): FieldSpec => ({
  name: 'BookTKt',
  label: 'LibNo',
  labelAt,
  at,
  kt: true,
  nameColumn: 'BookTName',
  afterPick: (picked, ctx) => {
    const row = picked.row ?? [];
    ctx.setField('BookMastKt', String(row[2] ?? ''));
    ctx.setTag('BookMastKt', Number(row[3]) || 0);
  },
});

/** What both ScreenSpecs share beyond their fields, grid and popups. */
export function visheshEntrySpec(): Pick<
  ScreenSpec,
  'entryLabel' | 'deleteSelected' | 'onNew' | 'openWith' | 'contextMenu'
> {
  return {
    entryLabel: true,
    // Delete(): GetIdFrom_GridRecord(…, False): every selected row.
    deleteSelected: true,
    // btnNew_Click keeps Book Name, LibNo and Work Done By; Seq is the kept book's next.
    onNew: {
      keep: ['BookTKt', 'BookMastKt', 'WorkDoneByKt'],
      params: ({ tags }) => ({ BookMastKt: tags.BookMastKt ?? 0 }),
    },
    // The menu's book list: a pick shows only that book's rows, a cancel none (StrId "0").
    openWith: {
      list: 'open',
      toParams: (r) => (Number(r.code[0]) > 0 ? { BookMastKt: Number(r.code[0]) } : null),
    },
    contextMenu: (a: ScreenActions): ContextMenuItem[] => [
      {
        kind: 'submenu',
        label: 'For Selected Record',
        items: [
          {
            kind: 'item',
            label: 'BookM',
            // The form's own book (txtBookMastKt.Tag), not the selection.
            onSelect: () => void a.run('bookm', { bookMastKt: a.tags.BookMastKt ?? 0 }),
          },
          { kind: 'item', label: 'Author', onSelect: () => void a.run('author') },
        ],
      },
      {
        kind: 'submenu',
        label: 'Utility',
        items: [
          {
            kind: 'item',
            label: 'Update Seq',
            onSelect: () =>
              void a
                .call('update-seq', { bookMastKt: a.tags.BookMastKt ?? 0 })
                .then((r) => r && a.refresh()),
          },
          { kind: 'item', label: 'Show All Records', onSelect: a.showAll },
        ],
      },
    ],
  };
}

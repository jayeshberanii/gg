import { z } from 'zod';
import type { PrintDocument } from './print.js';
import type { ReportDocument } from './report.js';

/** A "Search By" entry (tblSearch, IsSearchable = 1). */
export type SearchColumn = {
  id: number;
  displayName: string;
  columnName: string;
  /** M: a column of the screen's own table; T: of a transaction (child) table. */
  type: 'M' | 'T';
  dataType: string;
  /** F2 / F3 in the search box list the column's distinct values (F2SearchText). */
  searchOnF2: boolean;
  /** Typing filters the loaded grid as you type. */
  searchOnTextChange: boolean;
  displayInGrid: boolean;
  gridColumnName: string;
  joinColumnName: string;
};

/**
 * A saved Config_Master layout, as `cmbDispConfig` loads it back into the picker
 * (`cmbDispConfig_SelectedIndexChanged`): the chosen column indices, the Config Remark and the
 * per-row Config Condition, all of which the desktop restores when you pick the layout.
 */
export type PrintLayout = {
  id: number;
  name: string;
  shortcut: string;
  columnIndices: number[];
  /** Config_Master.ConfigRemark, shown in the dialog's "Config Remark" panel. */
  remark: string;
  /** ConditionColumn / ConditionValue, both '|'-separated and positionally paired. */
  condition: PrintCondition[];
};

/** One row of the dialog's "Config Condition" grid (`dgCondition`). */
export type PrintCondition = { column: string; value: string };

/** One choice in the "Print Report › Selected Column" picker (tblSearch, IsPrintable = 1). */
export type PrintColumnOption = { index: number; name: string };

export type MasterMeta = {
  screen: string;
  transactionName: string;
  primaryColumn: string;
  searchColumns: SearchColumn[];
  /** Columns filtered when "Search By" is empty, in segment order. */
  freeTextTargets: { column: string; dataType: string }[];
  /** Layouts with a shortcut key: shown directly under Print Report (Config_Master). */
  printLayouts: PrintLayout[];
  /** Every saved layout for this screen, for the picker dialog's own "Saved Layout" dropdown. */
  savedPrintLayouts: PrintLayout[];
  /** The columns "Selected Column" lets you pick from, in PrintSeq order. */
  printColumns: PrintColumnOption[];
};

export type GridValue = string | number | boolean | null;
export type GridRow = Record<string, GridValue>;

/** One row of a child grid (e.g. Author Master's Address / AnyName / Guru tables). */
export type ChildRow = Record<string, GridValue>;
/** A screen's child grids, keyed by the name the ScreenDefinition saves them under. */
export type ChildGrids = Record<string, ChildRow[]>;

/** A DataTable as the desktop filled it: its columns (in order, with SQL types) and rows. */
export type TransTable = { columns: { name: string; type: string }[]; rows: ChildRow[] };

/**
 * An F2 popup's data (frmDisplayTransNew's dtDisp): the tblSearch F2EntryText query of a "…Tran"
 * column, run for one record. `extra` is its second result set where it has one (Author
 * Master's AnyName popups carry their book list, dsDisp.Tables("dtAnyLibNo")).
 */
export type TransGrid = TransTable & {
  extra?: TransTable;
  /**
   * Every result set after the first, in order (`extra` is `extras[0]`). Book Master's popups
   * carry several (dsAuthor: dtAuthorAuth, dtAuthorAuthType; dsVishesh: its authors, languages
   * and the two Vishay detail tables). A screen saves them back as `<column>.Extra` (the first)
   * and `<column>.Extra<n>` (n = 2, 3, …).
   */
  extras?: TransTable[];
  /** Values a new row takes from the database (e.g. the next running number). */
  defaults?: Record<string, GridValue>;
};

/** frmDisplayTransNew's `SearchCondition(..., 0)`: the row the lookup is for. */
/** F2 on a form box with its own list: the form values it depends on (query string). */
export const f2ParamsSchema = z.record(z.string().max(64), z.string().max(4000));

export const transLookupRequestSchema = z.object({
  row: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

/** An F2 list (frmList1): column names and rows, as the query returned them. */
export type PickList = { columns: string[]; rows: GridValue[][] };

/**
 * Record ids a request carries, e.g. every row on the grid for a "within grid" search. The
 * desktop passes these as one comma-joined string with no cap; BookM (~108k) and BookT (~159k)
 * already exceed 100k, so the cap only guards against absurd payloads.
 */
const ids = z.array(z.number().int()).max(1_000_000);

export const listRequestSchema = z.object({
  /** StrId: only these records (e.g. opened from another screen's "Show In Use"). */
  ids: ids.optional(),
  /** The form's own FillList switches (Work Report's Display Count), for a screen that has them. */
  params: z.record(z.string(), z.union([z.string().max(100), z.number(), z.boolean()])).optional(),
});

export const searchValuesRequestSchema = z.object({
  columnId: z.number().int(),
  /** F2: within the grid's current records; F3: the whole table. */
  scope: z.enum(['grid', 'all']),
  gridIds: ids,
});

export const searchRequestSchema = z.object({
  columnId: z.number().int(),
  scope: z.enum(['grid', 'all']),
  gridIds: ids,
  notIn: z.boolean(),
  /** Values picked from the F2 list, or none to search by the typed text. */
  values: z.array(z.string()).max(10_000),
  text: z.string().max(1000),
});

export const rangeRequestSchema = z.object({
  columnId: z.number().int(),
  from: z.string().max(50),
  to: z.string().max(50),
});

export const blankRequestSchema = z.object({
  columnId: z.number().int(),
  /** Search For Blank (true) or For Not In Blank (false). */
  blank: z.boolean(),
  /** "Do You Want to Search Within Grid?" answered Yes: limit to these. */
  withinIds: ids.optional(),
});

export const securedIdsRequestSchema = z.object({
  ids,
  /** The Security dialog's password (frmDeleteList); checked on the server. */
  password: z.string().max(200),
});

export const lockRequestSchema = securedIdsRequestSchema.extend({ lock: z.boolean() });

const childRowSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

/** A form field's value in a save: text, a Tag id, a checkbox, or a child grid's rows. */
export type FieldValue = string | number | boolean | null | ChildRow[];

export const saveRequestSchema = z.object({
  /** 0 to add a record (StrMode "Add"). */
  id: z.number().int().min(0),
  /**
   * Flat text-box values, plus (for a screen with child grids, e.g. Author Master) one array
   * per child grid name, keyed the same way `loadChildren`/`save` on its ScreenDefinition are.
   */
  fields: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(childRowSchema).max(5000)]),
  ),
});

/**
 * A right-click action on the selected records. `params` carries what the desktop asked for
 * before running it (a picked list row, a Yes/No answer, the Security password, …).
 */
export const actionRequestSchema = z.object({
  ids,
  params: z
    .record(z.string(), z.union([z.string().max(10_000), z.number(), z.boolean(), ids]))
    .optional(),
});

/**
 * What a right-click action produced:
 * - `refreshed`: the selected rows changed (RefreshCurrentGridRecord / FillList);
 * - `list`: the grid now shows exactly these rows (FillList with a WhereCondition);
 * - `open`: records to open in another screen (the "For Selected Record" family). With no ids
 *   and a `newRecord`, the screen opens instead on an empty grid (StrId "0") in Add mode, its
 *   boxes pre-filled from `newRecord` the way `form` and newDefaults fill them (a ...Kt box's id
 *   under its own name, its text under its name column; other boxes by name), over the screen's
 *   own new-record defaults: frmInwordMaster's Send To › Letter Bhet Master when the inward has
 *   no letter yet (`{ inwordkt: <id>, inwordName: <Vibhag name> }`);
 * - `table`: a computed table the desktop pushes into Excel (SendtoExcel) or shows in frmPopup;
 * - `work-log`: a day's attendance log to show in the logout work report (frmLogout(LogId, True));
 * - `message`: just a MsgBox;
 * - `cells`: values the form writes straight into grid rows it already shows (matched by the
 *   primary key, other cells kept), with nothing re-read (frmGrVishayMaster's Show Member/Master);
 * - `form`: values for the record on screen, for the screen's own handler to put into its boxes
 *   (`fields`, a ...Kt box's id under its own name and its text under its name column) and its
 *   popups (`trans`: rows, and the rows of the popup's other tables), e.g. Anya Bhandar's fill
 *   from a picked book. A plain right-click run only shows its message.
 * - `print`: a report to show as printable A4 pages (the web's frmReport + Crystal report):
 *   Letter Bhet's Print Bhet Pahoch, Letter Demand's Print Demand.
 * - `report`: a report page of the desktop's companion web site (frmWebBrowser), built here:
 *   Author Report, Book Report, the Kruti Akaradi reports …
 * Any of them may carry a `message` to show first.
 */
export type ActionResult =
  | { kind: 'refreshed'; rows: GridRow[]; message?: string }
  | { kind: 'list'; rows: GridRow[]; message?: string }
  | {
      kind: 'open';
      screen: string;
      ids: number[];
      emptyMessage: string;
      /** With no ids: open the screen in Add mode with these values in its boxes. */
      newRecord?: GridRow;
    }
  | {
      kind: 'table';
      title: string;
      columns: string[];
      rows: GridValue[][];
      message?: string;
      emptyMessage?: string;
    }
  | { kind: 'work-log'; logId: number }
  | { kind: 'message'; message: string }
  | { kind: 'cells'; rows: GridRow[]; message?: string }
  | {
      kind: 'form';
      fields: GridRow;
      trans: Record<string, { rows: ChildRow[]; extras?: ChildRow[][] }>;
      message?: string;
    }
  | { kind: 'print'; document: PrintDocument; message?: string }
  | { kind: 'report'; document: ReportDocument };

/**
 * clsCom1.insertworkreports after a Save that modified a record: the desktop asks which Work
 * Type the change was (the WorkType rows with ColumnNo 100, searching first for the type
 * already logged today) before it writes WorkReportM. The server computes the change text;
 * the client asks, then posts it back with the chosen type.
 */
export type WorkReportPrompt = {
  recordId: number;
  /** frmList1's search text: the type logged for this record today, if any. */
  defaultType: string;
  mistake: string;
  remark: string;
  mistakeCount: number;
};

export const logWorkReportRequestSchema = z.object({
  workTypeId: z.number().int().min(1),
  mistake: z.string().max(100_000),
  remark: z.string().max(100_000),
  mistakeCount: z.number().int().min(0),
});

export type SaveResult = {
  id: number;
  row: GridRow | null;
  workReport?: WorkReportPrompt;
  /** What the form says after "Record Saved Successfully" (ScreenDefinition.save's message). */
  message?: string;
};

/** F1 on a field (Txt_KeyDown): the tblSearch HelpText reference rows (RefrenceT). */
export const saveHelpRequestSchema = z.object({
  rows: z
    .array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])))
    .max(1000),
});

/**
 * clsCommon.PrintSelectedColumn: either a saved Config_Master layout (`layoutId`, skips the
 * picker) or the columns chosen interactively (`columnIndices`, in print order), for the
 * records selected in the grid (`ids`, `dg.SelectedRows`).
 */
export const printRequestSchema = z.object({
  ids,
  layoutId: z.number().int().optional(),
  columnIndices: z.array(z.number().int()).max(200).optional(),
});
export type PrintRequest = z.infer<typeof printRequestSchema>;

export type PrintResult = { title: string; columns: string[]; rows: GridValue[][] };

/**
 * FormPrintWithSelectedColumn's "Save Config" (`tsbtnSaveConfig_Click` → `SaveConfig`): saves
 * the picker's current picks as a Config_Master layout. `configId` present means "Edit" (an
 * existing layout, picked from the dialog's own "Saved Layout" dropdown); absent means "Add".
 */
export const saveLayoutRequestSchema = z.object({
  configId: z.number().int().optional(),
  name: z.string().min(1).max(200),
  columnIndices: z.array(z.number().int()).min(1).max(200),
  remark: z.string().max(1000).optional(),
  /** "Ctrl|9" / "Alt|3" / "Shift|0", or omitted for no shortcut. */
  shortcut: z.string().max(20).optional(),
  /** The Config Condition grid's rows, saved as ConditionColumn / ConditionValue. */
  condition: z
    .array(z.object({ column: z.string().max(200), value: z.string().max(200) }))
    .max(100)
    .optional(),
});
export type SaveLayoutRequest = z.infer<typeof saveLayoutRequestSchema>;

/** One row of a record's work report (WorkReportM, joined for display). */
export type WorkReportEntry = {
  WorkReportKm: number;
  RecordNo: string;
  TableName: string;
  ColumnName: string;
  WorkTypeGId: number;
  WorkType: string;
  DoneByGId: number;
  DoneBy: string;
  WorkDate: string;
  Mistake: string;
  Remark: string;
  alterTime: string;
};

/** UserConfig fonts: every text box and grid of a form uses these (clsCommon.SetTextboxEvent). */
export type FontSpec = { family: string; sizePt: number; bold: boolean; italic: boolean };
export type UiPreferences = {
  textBoxFont: FontSpec;
  gridFont: FontSpec;
  search: SearchSyntaxPrefs;
};
export type SearchSyntaxPrefs = {
  andChar: string;
  orChar: string;
  splitChar: string;
  condition: 'Like' | 'Equal';
};

/**
 * Convert.ToString of a record value, as an integer (VB Val of the text), or 0. The column is
 * matched without regard to case (missing / NULL: 0).
 */
export function recordInt(record: GridRow, column: string): number {
  const lower = column.toLowerCase();
  const key = Object.keys(record).find((k) => k.toLowerCase() === lower);
  const n = Number(key === undefined ? 0 : (record[key] ?? 0));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/**
 * The owner lock of frmInwordMaster.FillData (also live on frmWorkGivenMaster; commented out on
 * frmIssueTran, frmMagazineMaster and frmPrakashakMaster):
 * `Not IsAdminLogin AndAlso dtSel("EnUser") <> curr_lnid`, so a non-admin
 * gets EnableDisableDataEditing's Locked toolbar (Modify, Delete and Copy off) on any record
 * someone else entered. Use it as `ScreenDefinition.lockedWhen` and `ScreenSpec.lockedWhen`;
 * the record's `Locked` column is `lockedColumns`' business. The column is matched without
 * regard to case, and a missing / NULL entry user (0) is someone else's.
 */
export function ownerLocked(
  record: GridRow,
  user: { id: number; isAdmin: boolean },
  enuserColumn = 'enuser',
): boolean {
  return !user.isAdmin && recordInt(record, enuserColumn) !== user.id;
}

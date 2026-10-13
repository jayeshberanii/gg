import type {
  ActionResult,
  FieldValue,
  GridRow,
  GridValue,
  PickList,
  SessionUser,
} from '@gglib/shared';
import type { RawBuilder } from 'kysely';
import type { Env } from '../../config/env.js';
import type { Executor } from '../../db/legacy-sql.js';
import { anyaBhandar } from './anya-bhandar.js';
import { apprisalStandard } from './apprisal-standard.js';
import { authorMaster } from './author.js';
import { authorTypeMaster } from './author-type.js';
import { bhashaMaster } from './bhasha.js';
import { bookMaster } from './book.js';
import { bookConfirmation } from './book-confirmation.js';
import { bookTran } from './book-tran.js';
import { columnMaster } from './column-master.js';
import { employeeMaster } from './employee.js';
import { englishBookVishesh } from './english-book-vishesh.js';
import { graphicsDetail } from './graphics-detail.js';
import { graphicsMaster } from './graphics-master.js';
import { grVishayMaster } from './gr-vishay.js';
import { grWordMaster } from './gr-word.js';
import { holiday } from './holiday.js';
import { inwardMaster } from './inward.js';
import { issueMaster } from './issue.js';
import { krutiMaster } from './kruti.js';
import { labIssueMaster } from './lab-issue.js';
import { leaves } from './leaves.js';
import { letterBhet } from './letter-bhet.js';
import { letterDemand } from './letter-demand.js';
import { lipiMaster } from './lipi.js';
import { magazineMaster } from './magazine.js';
import { magazineVishesh } from './magazine-vishesh.js';
import { oldLogReports } from './old-log-reports.js';
import { outsiderMaster } from './outsider.js';
import { parishishtNamsuchi } from './parishisht-namsuchi.js';
import { partyMaster } from './party.js';
import { patrika } from './patrika.js';
import { prakashakMaster } from './prakashak.js';
import { sampradayMaster } from './sampraday.js';
import { tirthRakshaMaster } from './tirth-raksha.js';
import { vishayMaster } from './vishay.js';
import { visheshMaster } from './vishesh.js';
import { workReport } from './work-report.js';

export type { ActionResult };

/** A list request's form switches (listRequestSchema.params). */
export type ListParams = Record<string, string | number | boolean>;

/** What an action gets besides the selected ids: its parameters and the server's secrets. */
export type ActionContext = {
  /** What the desktop asked for before running it (a picked row, a Yes/No, a password …). */
  params: Record<string, string | number | boolean | number[]>;
  env: Env;
  /** InputBoxProc(): the Security dialog's password, or the one the form passes it. */
  assertPassword: (given: unknown, extra?: string) => void;
  /**
   * FillList: the grid's rows, all of them or those matching a WhereCondition. `limit`: only
   * the newest `listLimit` of them (GetDataTable's @TotRecords), for a menu list over a big
   * table (frmLabIssueMaster's Show All Records).
   */
  list: (where?: RawBuilder<unknown>, opts?: { limit?: boolean }) => Promise<GridRow[]>;
};

/**
 * One F2 popup (frmDisplayTransNew) of a "…Tran" text box: its rows are tblSearch's
 * F2EntryText for the column; the lookups are the lists its cells open (SetForm_<X> with s=0),
 * keyed by the lower-cased grid column. Lookups get the row they are for, so a list that
 * depends on another cell (a Contact under its Contact Type) can bind it as a parameter.
 */
export type TransDefinition = {
  lookups?: Record<string, (db: Executor, row: Record<string, GridValue>) => Promise<PickList>>;
  /** Values a new row needs from the database (e.g. GetMaxId for a running number). */
  defaults?: (db: Executor) => Promise<Record<string, GridValue>>;
  /**
   * Placeholders of the F2EntryText besides {Id}, filled for record `id` before it runs
   * (Book Master's KrutiTran list has {GroupId}: the books sharing its common group).
   */
  placeholders?: (db: Executor, id: number) => Promise<Record<string, string>>;
  /**
   * Tables the form loads beside the F2EntryText's own result sets and hands the popup in the
   * same DataSet (Book Master's Vishesh popup adds dtVisheshDetail / dtVisheshDetailSummary).
   * They are appended to `extras`.
   */
  appendTables?: (db: Executor, id: number) => Promise<string[]>;
  /**
   * The statements the form fills the popup from itself, in place of tblSearch's F2EntryText
   * (Kruti Master's Rag and Title popups, built in FillData): the first is the popup's rows,
   * the rest its extra tables.
   */
  statements?: (db: Executor, id: number) => Promise<string[]>;
};

/**
 * A master screen as the engine needs it: the form's TransactionName and PrimaryColumn, plus
 * the parts that are specific to the form (its repository's Save and GetValidationMessage,
 * and its right-click actions). Everything else comes from tblSearch.
 */
export type ScreenDefinition = {
  screen: string;
  /** TransactionName: the table. */
  table: string;
  primaryColumn: string;
  /** Whether the table has the Locked column (Ctrl+L / Ctrl+U). */
  lockable: boolean;
  /**
   * Record columns that, when true, make the record read-only (FillData's
   * EnableDisableDataEditing(…, True): Modify, Delete and Copy off). The API then refuses to
   * edit or delete it (the edit lock, save and delete); Ctrl+U still unlocks it.
   */
  lockedColumns?: string[];
  /**
   * A record-and-user rule that, when true, makes the record read-only for this user in the
   * same way (FillData's EnableDisableDataEditing(…, True)), e.g. `ownerLocked` from
   * @gglib/shared: a non-admin cannot change a record someone else entered (frmInwordMaster).
   * `record` is the table's own row (every column, `SELECT *`), read when the user claims the
   * edit lock, saves or deletes the record; the API then refuses with 403. Adding is never
   * refused by it, and Ctrl+L / Ctrl+U are not affected. The screen's ScreenSpec.lockedWhen
   * shows the same rule on the toolbar.
   */
  lockedWhen?: (record: GridRow, user: SessionUser) => boolean;
  /**
   * FillData turning single toolbar buttons off for a record (frmLabIssueMaster: Delete off for
   * a delivered row, Modify off for a returned one), where `lockedWhen` would turn all of them
   * off. `record` is the table's own row (`SELECT *`). The API refuses the edit lock and the
   * save of a record with `modify` (403), and its delete with `delete`. The screen's
   * ScreenSpec.buttonsOff shows the same rule on the toolbar.
   */
  buttonsOff?: (record: GridRow, user: SessionUser) => { modify?: boolean; delete?: boolean };
  /**
   * A definition behind a form that has no menu item of its own (Book Master's frmBookTranNew):
   * the API lets through whoever may open this menu screen instead.
   */
  accessScreen?: string;
  /**
   * The form's own JoinCondition, appended after `FROM <table>` in the grid's queries (FillList
   * and UcSearch pass it; the record query does not). A constant of the screen, never user input.
   */
  listJoin?: string;
  /**
   * The form passes its JoinCond to GetDataTableById too (frmIssueTran: tblSearch's
   * ConfmMarkkt JoinCondition reads `ConMark.Name`, an alias of the join), so the record query
   * joins `listJoin` as the grid's do.
   */
  recordJoin?: boolean;
  /** The form builds its grid query with UcSearch.GetColumns rather than GetDataTable. */
  ucSearchColumns?: boolean;
  /**
   * Config_Master.ConfigType of the layouts the right-click Print Report menu lists (Form_Load's
   * dtConfig), when the form reads another type than the picker's TransactionName (Kruti Master
   * reads 'Kruti'; its picker saves under 'KrutiMst').
   */
  menuLayoutType?: string;
  /**
   * The form's own ListGridData in place of the tblSearch grid query (Work Report's, with its
   * Display Count grouping). `filter` is the user's `listFilter` as `AND (…)`, or nothing;
   * `params` are the form's FillList switches the client sends.
   */
  listRows?: (
    db: Executor,
    req: { ids?: number[]; params: ListParams; filter: RawBuilder<unknown> },
  ) => Promise<GridRow[]>;
  /**
   * A list-only form (frmWorkReportM): its toolbar's New / Save / Delete have no handlers, so
   * the engine refuses every write for it (save, delete, locks, work report rows, layouts).
   */
  readOnly?: boolean;
  /**
   * Who may change records, when not everyone who can open the screen (frmColumnMaster: admins,
   * AMaster and users 20 / 50; everyone else gets a Locked toolbar). Enforced on save, delete
   * and the edit lock.
   */
  writableBy?: (user: SessionUser) => boolean;
  /** FillList's changes to the rows after the query (Kruti Master appends the any names). */
  decorateList?: (db: Executor, rows: GridRow[]) => Promise<GridRow[]>;
  /**
   * GetDataTable's @TotRecords for the grid loaded without a StrId (the default condition still
   * applies): only the newest this many (0: all). Menu lists that ask for it
   * (`ActionContext.list` with `limit`) are capped the same way.
   */
  listLimit?: number;
  /** The form lists its rows in table order (no ORDER BY), not newest first. */
  listOrderAsc?: boolean;
  /**
   * The ORDER BY the form's FillList passes to ListGridData (Parishisht Namsuchi's
   * "ParishistPublicationKt Desc,Name asc"). A constant of the screen, never user input.
   */
  listOrderBy?: string;
  /**
   * The form's DefaultCond (frmHolidayM: this year's holidays), a constant of the screen. FillList
   * adds it to the grid it loads without a StrId, and UcSearch.LoadData gets it as its
   * WhereCondition, so search and Search In Range stay inside it too. A menu list with its own
   * WhereCondition ("Show All Records", `ActionContext.list`) and the record query do not use it.
   */
  defaultCondition?: RawBuilder<unknown>;
  /**
   * FillList's WhereCondition from the form's switches (`params`, e.g. the book the window was
   * opened for: frmMagazineVisheshNew's " AND BookMastKt=<pick>"), or null for none. It applies
   * to the grid FillList loads (Refresh keeps it while the client keeps sending it), never to
   * UcSearch, which the form loads with its DefaultCond only. Bind every value as a parameter.
   */
  listCondition?: (params: ListParams) => RawBuilder<unknown> | null;
  /**
   * A condition every list and record of this user's is restricted to (the form's
   * DefaultCondition, e.g. Book Master hides CM/MS/CP/SN library numbers from Operators).
   */
  listFilter?: (user: SessionUser) => RawBuilder<unknown> | null;
  /**
   * With `listFilter`: it guards every per-record endpoint too, not only the grid and the
   * record (the popups' rows, the work report, the edit lock, save, delete and Print Selected
   * Column), so a record outside it can be neither read nor changed through the API
   * (frmEmployeeNew's own-row rule).
   */
  enforceListFilter?: boolean;
  /**
   * `defaultCondition` is FillList's WhereCondition only: UcSearch is loaded without it, so
   * search and Search In Range see every row (frmEmployeeNew's " AND IsActive=1").
   */
  defaultConditionListOnly?: boolean;
  /**
   * tblSearch columns that never leave the server (Usecurity.upwd, which tblSearch marks
   * searchable and printable): dropped from the grid, the record, Search By, the search
   * lists, Print Selected Column and so Send To Excel. A change to one is logged in the work
   * report as `<column>(changed)`, never with its value. A screen that must show one to some
   * users adds it back itself (`recordExtras`).
   */
  secretColumns?: string[];
  /**
   * Who gets UcSearch's Search By combo (LoadData's boolFillCombo); everyone else gets an empty
   * one, and the search endpoints refuse them (frmEmployeeNew: the privileged only).
   */
  searchableBy?: (user: SessionUser) => boolean;
  /**
   * Who may add (`id` 0), edit or delete which record, when that depends on the user and the
   * record (frmEmployeeNew: the privileged anything, everyone else only edits their own row).
   * Enforced on save, delete and the edit lock, beside `writableBy`.
   */
  recordWritableBy?: (user: SessionUser, id: number, op: 'add' | 'edit' | 'delete') => boolean;
  /**
   * <X>Repository.GetValidationMessage, message text verbatim; '' when valid. `id` is 0 for a
   * new record (some rules apply only in Edit).
   */
  validate: (fields: Record<string, FieldValue>, id: number) => string;
  /**
   * <X>Repository.Save: returns the record id. `id` 0 adds a record. `fields` carries the
   * flat text-box values plus, for a screen with F2 popups, the rows of each popup the user
   * opened, under its tblSearch column name (the desktop's per-record DataTable parameters).
   * It may also return a `message` the form shows after "Record Saved Successfully"
   * (frmIssueTran's "(n) Records updated for SlipNo -…").
   */
  save: (
    trx: Executor,
    user: SessionUser,
    id: number,
    fields: Record<string, FieldValue>,
  ) => Promise<number | { id: number; message?: string }>;
  /** The F2 popups this screen's text boxes open, keyed by tblSearch ColumnName (Type 'T'). */
  trans?: Record<string, TransDefinition>;
  /**
   * btnNew_Click: the values a new record starts with (e.g. the next RecordNo). `user` is the
   * signed-in user (frmLeaveM's NewEntry(curr_lnid) puts them in Requested By). `params` are
   * the values of the record on screen the form carries into the new one (ScreenSpec.onNew,
   * e.g. the kept Book whose next Seq it computes), always as text, to be bound as parameters.
   */
  newDefaults?: (
    db: Executor,
    user?: SessionUser,
    params?: Record<string, string>,
  ) => Promise<Record<string, GridValue>>;
  /** <X>Repository.CheckInUse: why the record cannot be deleted; '' when it can. */
  checkInUse?: (db: Executor, id: number) => Promise<string>;
  /**
   * The form's own Delete, when it removes more than the record (child tables first). Runs in
   * the delete's transaction in place of the plain `DELETE`; returns the rows it deleted.
   */
  deleteRecord?: (trx: Executor, user: SessionUser, id: number) => Promise<number>;
  /**
   * Before the work report compares the record: the form's own adjustments to what counts as
   * a change (Book Master copies back the old Remark, PSamvatVK, … so they never do).
   */
  workReportAdjust?: (oldRow: GridRow, newRow: GridRow) => void;
  /**
   * Extra values FillData shows for a record beyond its tblSearch columns (txtSignInfo …).
   * `user` is the viewer; it is absent when the engine reads the record for itself (the work
   * report's before/after comparison).
   */
  recordExtras?: (db: Executor, id: number, user?: SessionUser) => Promise<GridRow>;
  /**
   * The form calls clsCom1.insertworkreports after Save and Delete (frmAuthorMaster does,
   * frmBhashaMaster does not), logging the change in WorkReportM.
   */
  workReport?: boolean;
  /**
   * With `workReport`: which of Add / Edit / Delete the form logs, when not all three
   * (frmPartyMaster logs Edit only; frmParishistNamSuchi logs saves, not deletes).
   */
  workReportOn?: { add?: boolean; edit?: boolean; delete?: boolean };
  /**
   * Popups whose rows, when the user opened them, are logged one by one (CompareDataTable)
   * instead of by their summary column. frmAuthorMaster does this for Samvat only: its other
   * CompareDataTable calls pass `.ToString` copies, so VB never writes their result back.
   */
  workReportTrans?: string[];
  /** The record column whose text the "Delete <name>" work report entry names. */
  deleteLabelColumn?: string;
  /** The delete's work report text, when the form words it otherwise ("DEL-<name>"). */
  deleteWorkReportText?: (label: string) => string;
  /** F1 on a field opens its tblSearch HelpText reference rows (Txt_KeyDown's F1 branch). */
  help?: boolean;
  /**
   * A text box's own F2 list, in place of its tblSearch F2EntryText (Txt_KeyDown's special
   * cases), keyed by the lower-cased box name; `params` are the form values the box sends
   * (FieldSpec.f2Params), always as text.
   */
  f2?: Record<
    string,
    (db: Executor, params: Record<string, string>, user?: SessionUser) => Promise<PickList>
  >;
  /**
   * A search-box column the form searches its own way (UcSearch "UplevelWithChild"), keyed by
   * the lower-cased tblSearch ColumnName: the list F2 shows, and the condition the picked codes
   * make (`AND …` is added).
   */
  searchOverrides?: Record<
    string,
    {
      values: (db: Executor) => Promise<PickList>;
      where: (db: Executor, codes: string[]) => Promise<RawBuilder<unknown>>;
    }
  >;
  /**
   * Lists the form opens with DisplayListForm outside any text box (menu pickers …). `params`
   * are the values the list depends on (the current row's Type for Word Master's Replace), as
   * the client sends them: always text, to be bound as parameters.
   */
  lists?: Record<string, (db: Executor, params: Record<string, string>) => Promise<PickList>>;
  /** Right-click menu actions on the selected records. */
  actions?: Record<
    string,
    (db: Executor, user: SessionUser, ids: number[], ctx: ActionContext) => Promise<ActionResult>
  >;
};

const SCREENS: ScreenDefinition[] = [
  anyaBhandar,
  apprisalStandard,
  bhashaMaster,
  authorMaster,
  authorTypeMaster,
  bookConfirmation,
  bookMaster,
  bookTran,
  columnMaster,
  employeeMaster,
  englishBookVishesh,
  graphicsDetail,
  graphicsMaster,
  grVishayMaster,
  grWordMaster,
  holiday,
  inwardMaster,
  issueMaster,
  krutiMaster,
  labIssueMaster,
  leaves,
  letterBhet,
  letterDemand,
  lipiMaster,
  magazineMaster,
  magazineVishesh,
  oldLogReports,
  outsiderMaster,
  parishishtNamsuchi,
  partyMaster,
  patrika,
  prakashakMaster,
  sampradayMaster,
  tirthRakshaMaster,
  vishayMaster,
  visheshMaster,
  workReport,
];

const byId = new Map(SCREENS.map((s) => [s.screen, s]));

export function screenDefinition(screen: string): ScreenDefinition | undefined {
  return byId.get(screen);
}

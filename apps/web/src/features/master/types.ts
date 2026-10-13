import type {
  ActionResult,
  ChildRow,
  GridRow,
  GridValue,
  PickList,
  SessionUser,
  TransTable,
} from '@gglib/shared';
import type { YesNoCancel } from '@/components/ui/MessageBox';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import type { PickResult } from '@/components/ui/PickListDialog';

/** A text box on the form, placed where the form's designer places it. */
export type FieldSpec = {
  /** The column behind the box: the desktop names it txt<name>. */
  name: string;
  /**
   * The label beside the box, when it has one of its own. Many boxes share one label (e.g.
   * "Done By/Grade"); those use `ScreenSpec.labels` instead.
   */
  label?: string;
  /** Designer coordinates inside SplitContainer1.Panel1. */
  labelAt?: { x: number; y: number };
  at: { x: number; y: number; w: number };
  /**
   * A ...Kt box: it shows a name but keeps the id (the desktop's Tag). `nameColumn` is the
   * record column holding the text, e.g. UplevelKt shows UplevelName.
   */
  kt?: boolean;
  nameColumn?: string;
  /** TextBox.ReadOnly (e.g. Author Master's txtSignInfo). */
  readOnly?: boolean;
  /**
   * ReadOnly while this returns true for the form's state (frmIssueTran.FillData's one-day rule
   * on Party / LibNo / Slip). Unlike `readOnly` the box is still sent on Save; like it, F2 does
   * not open its list (the desktop's did: a bug).
   */
  readOnlyWhen?: (ctx: FormContext) => boolean;
  /**
   * Enabled = False while this returns true for the form's state (frmIssueTran: Return Date
   * until Returned is "Yes", the boxes "continue adding" disables). The value is still sent.
   */
  disabledWhen?: (ctx: FormContext) => boolean;
  /** Visible = False: loaded and saved, never shown (Author Master's txtLibNo). */
  hidden?: boolean;
  /** The KeyPress handler lets only digits through (Validnumber). */
  numeric?: boolean;
  /** F2 opens this popup (frmDisplayTransNew) instead of a pick list: a key of `ScreenSpec.trans`. */
  trans?: string;
  /**
   * F2 opens frmVishayEntry over this popup's rows (a key of `ScreenSpec.trans`, usually built
   * with `vishayEntryTrans`), straight from the box (frmMagazineVisheshNew.SetVishayEntry): its
   * Save keeps the lines, sent with the record like any popup's, and the box shows its txtCode.
   */
  vishayEntry?: string;
  /** F2 lists the popup's rows instead (a read-only list, e.g. Author Master's txtKrutiTran). */
  transList?: string;
  /** Multiline boxes are taller (Book Master's first row); designer height in px. */
  h?: number;
  /** F2 does nothing (a box with no tblSearch row behind it). */
  noF2?: boolean;
  /**
   * The form values this box's own F2 list depends on (ScreenDefinition.f2 on the server), e.g.
   * Vishesh Master's Up Level list by the Remark box and the loaded record.
   */
  f2Params?: (ctx: FormContext) => Record<string, string | number>;
  /**
   * The F2 list's search box starts with the box's text (DisplayListForm's SearchText =
   * txt.Text.Trim: frmLetterBhetM's Inword, frmLetterDemandM's Work Given).
   */
  f2SearchText?: boolean;
  /** The form's own F2 handler for this box, in place of any list or popup. */
  onF2?: (ctx: FormContext) => void;
  /**
   * DisplayListForm with AddMore: the list reopens after each pick until cancelled, the picks
   * joined by ","; `append` keeps what the box held before (`a & "," & picks`, txtMixSign).
   */
  addMore?: { append?: boolean };
  /** Sent on Save although the box is ReadOnly (its value is computed, e.g. PSamvatVK). */
  alwaysSend?: boolean;
  /**
   * Disabled while this record column is true (FillData's `Enabled = False`); the state stays
   * until the next record sets it, as a control's Enabled does.
   */
  disabledColumn?: string;
  /**
   * The box's own KeyDown handler for any key (frmPatrika's txtRecordNo_KeyDown asks for the
   * series in Add mode). Tab, the modifier keys alone, Ctrl / Alt shortcuts and F1 / F2 never
   * reach it. Returning true swallows the key (it is not typed into the box).
   */
  onKey?: (key: string, ctx: FormContext) => boolean;
  /** PreviewKeyDown with Tab (Book Master's duplicate-name check on txtBookName). */
  onTab?: (ctx: FormContext) => void;
  /**
   * A CheckBox of the panel instead of a text box, with this text. Its value is 'True' /
   * 'False' and it is sent as a boolean; like every CheckBox, EnableDisableDataEditing leaves it
   * clickable while the panel is read-only.
   */
  checkbox?: string;
  /** Enabled = False in the designer: shown, loaded and saved, never typed into. */
  alwaysDisabled?: boolean;
  /**
   * A DropDownList ComboBox with these items instead of a text box (frmPartyMaster's
   * cmbBlockParty "Yes" / "No"). Its value is the item text.
   */
  options?: string[];
  /**
   * With `options`: the column is a bit. A record's false / NULL shows `options[0]` and its true
   * `options[1]` (frmInwordMaster's FillData: Returned "No" / "Yes", In/Out "IN" / "OUT"); Save
   * still sends the item text, for the server to turn back into the bit.
   */
  bitOptions?: boolean;
  /**
   * Shown only while this returns true for the boxes' current values (frmInwordMaster's
   * cmbReturned_SelectedIndexChanged shows dtpreturndate only for Returned = "Yes"). A box it
   * hides is still loaded and saved, as an invisible control is on the desktop.
   */
  visibleWhen?: (fields: Record<string, string>) => boolean;
  /**
   * A DateTimePicker (Format dd-MM-yyyy) instead of a text box. Its value is yyyy-MM-dd and it
   * always holds a date: clsCom.clear leaves pickers alone, so New keeps the date shown (today
   * when nothing was shown yet).
   */
  date?: boolean;
  /**
   * A MaskedTextBox with this Mask ("90:00": `0` a digit, `9` an optional digit, anything else
   * as written). Only digits can be typed; a SQL `time` loads as its hh:mm. The server keeps the
   * text only when the mask is complete (MaskCompleted).
   */
  mask?: string;
  /**
   * A text box FillTextBox fills from a `datetime` column: Convert.ToString of the DateTime,
   * "dd-MM-yyyy HH:mm:ss" on the desktops' Indian (en-IN) settings; `'date'`: the form
   * reformats it as "dd-MM-yyyy" (frmLabIssueMaster.FillData's Format(…, "dd-MM-yyyy")).
   */
  datetimeText?: boolean | 'date';
  /**
   * Enabled only for these users (frmPartyMaster's EnableDisableBlockParty: user type AMaster).
   * The server must enforce the same rule on save.
   */
  editableFor?: (user: SessionUser) => boolean;
  /** After a pick from the box's F2 list, what else the form's Txt_KeyDown does with it. */
  afterPick?: (picked: { name: string; code: string; row?: GridValue[] }, ctx: FormContext) => void;
  /** The box's own Leave handler that needs the server (Kruti Master's duplicate KrutiNo). */
  onLeave?: (ctx: FormContext) => void;
  /** Enter on the box opens its popup (Kruti Master's up-level box; its F2 is `onF2`). */
  enterOpensTrans?: boolean;
  /**
   * A PasswordChar '*' box with its Show Password CheckBox at `showAt` (frmEmployeeNew's txtupwd
   * + chkShowPassword). The server puts the value in the record only for a viewer allowed to
   * read it; the CheckBox shows only then (and for a new record). The box is write-only
   * otherwise: Save sends it only when the user changed it, so an untouched box keeps the
   * stored password.
   */
  password?: { showAt: { x: number; y: number } };
  /**
   * With `date`: a record whose column is empty sends '' (keep it) until the user picks a date,
   * instead of the date the picker happens to show (frmEmployeeNew's DOB / DOJ).
   */
  keepEmptyDate?: boolean;
  /**
   * After the user changes a DateTimePicker, a DropDownList or a CheckBox (its ValueChanged /
   * CheckedChanged), with the new
   * value; `ctx.fields` still holds the old one (frmLeaveM recomputes TotalDays).
   */
  onUserChange?: (value: string, ctx: FormContext) => void;
};

/** A Label (or LinkLabel) of the panel. */
export type LabelSpec = {
  text: string;
  at: { x: number; y: number };
  /** Label font size in pt (the designer's; most are 14.25). */
  sizePt?: number;
  /** A LinkLabel: its LinkClicked. */
  onClick?: (ctx: FormContext) => void;
  /** Its ForeColor, when the form sets one (lnkColumnReference: DarkViolet when there are rows). */
  color?: (ctx: FormContext) => string | undefined;
};

/** What a screen's own handlers get: the loaded record's boxes, and the form's dialogs. */
export type FormContext = {
  fields: Record<string, string>;
  tags: Record<string, number>;
  /** StrMode and the record the boxes show (0 for a new one). */
  strMode: 'Add' | 'Edit';
  tranKm: number;
  mode: 'normal' | 'edit';
  setField: (name: string, value: string) => void;
  setTag: (name: string, id: number) => void;
  /** The record as loaded (dtSel). */
  loaded: GridRow | null;
  alert: (text: string, title?: string) => Promise<void>;
  /** MsgBox with MsgBoxStyle.YesNo: true for Yes. */
  confirm: (text: string, title?: string) => Promise<boolean>;
  /**
   * btnCancel_Click + dgMain_Click: leave New / Modify and show the grid's current record again
   * (frmIssueTran abandons the Add when a blocked party is picked).
   */
  cancel: () => Promise<void>;
  /**
   * The form is adding the next record after "Do You Want to Continue With Add New Record?"
   * (ScreenSpec.continueAdding), until New, Cancel's row or another record.
   */
  continued: boolean;
  /** Runs a right-click action and shows its result. */
  run: (action: string, params?: ActionParams, ids?: number[]) => Promise<boolean>;
  /** Runs one and hands back what it produced, for the caller to show. */
  call: (action: string, params?: ActionParams, ids?: number[]) => Promise<ActionResult | null>;
  /** A popup's rows as the form keeps them (loaded from the server the first time). */
  loadTrans: (key: string) => Promise<TransState | null>;
  /** Opens a popup as F2 on its box would (a LinkLabel that opens one, e.g. a hidden Reference box). */
  openTrans: (key: string) => void;
  /**
   * Keeps rows for a popup as its Save would (to be sent with the record); the box's text is
   * rewritten from them unless `keepText`.
   */
  putTrans: (
    key: string,
    rows: ChildRow[],
    opts?: { keepText?: boolean; base?: TransState; extras?: TransTable[] },
  ) => void;
};

/** One of a popup's cell lists (frmDisplayTransNew.SetForm_<X> with s = 0). */
export type TransLookup = {
  /** The server's list (TransDefinition.lookups key); defaults to the lower-cased column. */
  lookup?: string;
  /** Where the picked row's first column (the Tag) goes. */
  setKt?: string;
  /** Where the picked name (the Text) goes; the cell itself when omitted. */
  setName?: string;
  /** More cells from the picked row, by its column index (e.g. BookDetail from column 2). */
  also?: Record<string, number>;
  /** The cell the desktop moves to afterwards. */
  next?: string;
  /** DisplayListForm's boolSelectFirst; false lets Enter take every row the filter left. */
  selectFirst?: boolean;
  /** The call passes no SearchText, so a typed key does not seed the list's search box. */
  noSearchText?: boolean;
  /** The list depends on other cells of the row: fetch it every time. */
  perRow?: boolean;
  /** The cell takes the Tag, not the Text (`.Value = txtPopup.Tag`). */
  valueFromTag?: boolean;
  /** With nothing picked, blank the cells (and the Kt) instead of leaving them. */
  clearOnCancel?: boolean;
  /** Move to `next` even when nothing was picked. */
  alwaysNext?: boolean;
  /** On the last row, add a row and move to `next` on it (the Bhasha / Lipi lists). */
  addRowAfter?: boolean;
  /** The pick is added to the cell with SignBetweenStr instead of replacing it (PrCpNo). */
  append?: boolean;
  /** Put before the typed key in the list's search box ("/" searches the second column). */
  searchPrefix?: string;
  /**
   * The cell asks with an InputBox instead of a list (Book Subject's dates): the prompt and the
   * text it starts with (which may depend on the row, e.g. the cell's own value).
   */
  input?: {
    prompt: string;
    initial: (row?: ChildRow) => string;
    /** `If Not String.IsNullOrEmpty(st)`: an empty answer or Cancel leaves the cell as it was. */
    keepOnCancel?: boolean;
  };
  /** Afterwards, recompute other cells (Samvat's Vksamvat). */
  after?: (
    row: ChildRow,
    picked: PickResult,
    helpers: TransHelpers,
  ) => Promise<ChildRow> | ChildRow;
};

export type TransHelpers = {
  /** Runs one of the popup's server lists for a row (e.g. a sadi's value). */
  lookup: (name: string, row: ChildRow) => Promise<PickList>;
};

/**
 * One F2 popup of a "…Tran" text box: frmDisplayTransNew with a TranName. Its rows and columns
 * come from the server (tblSearch F2EntryText); this is what SetForm_<FormName> does with them:
 * the columns it hides (s = 2), the ones it unlocks for typing, the lists its cells open (s = 0)
 * and the row it adds (s = 1).
 */
export type TransSpec = {
  /** The tblSearch column (Type 'T') whose F2EntryText fills the popup. */
  column: string;
  /** FormName "Common": Delete does not renumber seq. */
  common?: boolean;
  /** Visible = False, by column name (any case). */
  hidden: string[];
  /** ReadOnly = False, by column name (any case); "remark" always is (frmDisplayTransNew_Load). */
  editable: string[];
  /** Cell lists, keyed by the lower-cased column name. */
  lookups: Record<string, TransLookup>;
  /**
   * A new row (`dtDisp.Rows.Add(New Object() {…})`), value by column position. Omitted: a new
   * DataRow (every cell empty) with `tempKey` set to a new negative id and Seq to its place.
   */
  template?: (ctx: {
    rows: ChildRow[];
    seq: number;
    defaults: Record<string, GridValue>;
  }) => GridValue[];
  tempKey?: string;
  /** The cell a new row starts in, by name or column index. */
  firstColumn: string | number;
  /** frmDisplayTransNew's constructor flags (ShowNew, ShowSave, ShowDelete, ShowUpDown). */
  buttons?: { new?: boolean; save?: boolean; delete?: boolean; upDown?: boolean };
  /**
   * Buttons shown but Enabled = False (WorkReport). Only the click is off: their keys (F6,
   * Ctrl+N, Delete, Alt+S) call the handlers directly, as dgDisplay_KeyDown does.
   */
  disabledButtons?: ('new' | 'save' | 'delete')[];
  /** SetForm_<X>(…, 2) adds no row to an empty table (WorkReport). */
  openEmpty?: boolean;
  /**
   * A popup the form fills itself from its own boxes (Author Master's AuthorName, dtAuthorName):
   * no server rows; Save writes the row back into the boxes.
   */
  local?: {
    columns: { name: string; type: string }[];
    toRow: (fields: Record<string, string>) => ChildRow;
    fromRow: (row: ChildRow) => Record<string, string>;
  };
  /**
   * frm.TranType: the form box whose (trimmed) value the popup's cell lists depend on; it goes
   * to the server with every lookup as the row's `TranType` (Column Master's Uplevel: txtVibhag).
   */
  tranType?: string;
  /** Its rows are saved only when the text box no longer reads as loaded (Address). */
  onlyWhenTextChanged?: boolean;
  /**
   * F2 on this column opens a second popup over the rows of the table's second result set
   * that belong to this row (Author Master's AnyName › LibNo, TranName "multiLibNo").
   */
  nested?: { column: string; parentKey: string; childKey: string; spec: TransSpec };
  /** dgDisplay_CellEndEdit. */
  onCellEdit?: (
    row: ChildRow,
    column: string,
    helpers: TransHelpers,
  ) => Promise<ChildRow> | ChildRow;
  /** How the text box reads the rows after Save: the generic join, Sampraday's own, or the form's. */
  summary?: 'generic' | 'sampraday' | ((rows: ChildRow[], columns: string[]) => string);
  /**
   * The rows go back on Save whenever the popup was loaded, saved or not (Book Master writes
   * such popups from its DataTables, which F2 fills even when the popup is then cancelled).
   */
  sendLoaded?: boolean;
  /**
   * Cells that open a second popup over one of the extra tables (`extras[extra]`), the rows
   * whose `childKey` is this row's `parentKey`; `cell` is what the parent cell reads afterwards.
   */
  children?: Record<
    string,
    {
      extra: number;
      parentKey: string;
      childKey: string;
      spec: TransSpec;
      cell: (rows: ChildRow[]) => string;
    }
  >;
  /**
   * Cells that open frmVishayEntry over one of the extra tables (the rows whose RecordKt is
   * this row's `parentKey`); the cell then reads its txtCode. `unsavedMessage`: refused for a
   * row whose key is still 0.
   */
  vishayEntry?: Record<string, { extra: number; parentKey: string; unsavedMessage?: string }>;
  /** TsBtnSave's checks and seq numbering for this popup: the rows to keep, or a message. */
  beforeSave?: (rows: ChildRow[], helpers: TransHelpers) => Promise<ChildRow[] | string>;
  /** Column widths the popup sets itself (px at the web's scale). */
  widths?: Record<string, number>;
  /** New adds nothing (FormName "Book" has no SetForm_ routine for the Prapti popup). */
  newRowDisabled?: boolean;
  /** Copy loads this popup for the new record: what of it the copy keeps. */
  onCopy?: (state: TransState) => TransState;
  /** RowsDefaultCellStyle.WrapMode (ReferenceT1). */
  wrap?: boolean;
  /** Items the popup's right-click menu adds for this popup (Kruti Master's Show Book Detail). */
  menu?: {
    label: string;
    apply: (rows: ChildRow[], helpers: TransHelpers) => Promise<ChildRow[]>;
  }[];
  /**
   * Items after Send To Excel that act on the current row (WorkReport's Compare Data, which
   * cntMenu_Opening shows only for that popup).
   */
  endMenu?: { label: string; onSelect: (row: ChildRow | undefined) => void }[];
  /**
   * After the popup's Save has been kept, what else the form does: `pariCount` is the popup's
   * "Update Pariman Count" total (frm.PariCount), 0 when not asked.
   */
  onSaved?: (
    info: {
      pariCount: number;
      /** The rows the popup saved, and those it was opened with. */
      rows: ChildRow[];
      before: ChildRow[];
    },
    ctx: FormContext,
  ) => void | Promise<void>;
};

/** A popup's current contents, as the form keeps them between F2s (dtParampara, dsAnyaName …). */
export type TransState = TransTable & {
  extra?: TransTable;
  extras?: TransTable[];
  defaults?: Record<string, GridValue>;
};

export type GridColumnSpec = {
  header: string;
  field: string;
  width?: number;
  /** Visible = False: bound but not shown. */
  hidden?: boolean;
  /**
   * DefaultCellStyle.Format "dd-MM-yyyy" (`date`), or a SQL `time` shown as a TimeSpan
   * ("hh:mm:ss" plus ".fffffff" when it has a fraction) (`time`), or "dddd", the day's name
   * (`weekday`), or "dd-MM-yyyy hh:mm:ss" with a 12-hour clock and no AM/PM (`datetime12`),
   * or "dd-MM-yyyy HH:mm:ss" (`datetime`).
   */
  format?: 'date' | 'time' | 'weekday' | 'datetime12' | 'datetime';
  /** dgMain_CellFormatting's ForeColor for this column's cell only (frmIssueTran's Party Name). */
  textColor?: (row: GridRow) => string | undefined;
};

export type ActionParams = Record<string, string | number | boolean | number[]>;

export type PickOptions = {
  /** The list window's title (the desktop's is always "List"). */
  title?: string;
  /** Values the list depends on, sent as query text. */
  params?: Record<string, string | number>;
  /** DisplayListForm's boolSelectFirst. */
  selectFirst?: boolean;
  /** frmList1's empty first row (DisplayListForm adds it; a bare frmList1 does not). */
  addBlankRow?: boolean;
};

export type ScreenActions = {
  /** The records selected in the grid. */
  selectedIds: number[];
  /** dgMain.CurrentRow's record, or null when the grid has none. */
  currentId: number | null;
  /** dgMain.CurrentRow's cells (a menu item shown only for some rows reads them). */
  currentRow: GridRow | null;
  /** Every record the grid shows (GetIdFrom_GridRecord with AllRecords). */
  gridIds: number[];
  /**
   * Runs a right-click action on the server (POST action/<name>) and shows its result. False
   * when the server refused it (its error was shown).
   */
  run: (action: string, params?: ActionParams, ids?: number[]) => Promise<boolean>;
  /** Runs one and hands back what it produced, for the caller to show. */
  call: (action: string, params?: ActionParams, ids?: number[]) => Promise<ActionResult | null>;
  /** MsgBox. */
  alert: (text: string, title?: string) => Promise<void>;
  confirm: (text: string, title?: string) => Promise<boolean>;
  /** InputBox: the typed text, or null when cancelled. */
  input: (prompt: string, initial?: string) => Promise<string | null>;
  yesNoCancel: (text: string, title?: string) => Promise<YesNoCancel>;
  /** InputBoxProc: the Security dialog; the typed password, or null when cancelled. */
  askPassword: () => Promise<string | null>;
  /**
   * clsCom.DisplayListForm / frmList1 over one of the screen's server lists
   * (ScreenDefinition.lists), with the values it depends on, or over rows an action returned
   * (a `table` result, for a list that depends on the selected records): the pick, or null when
   * cancelled.
   */
  pick: (list: string | PickList, opts?: PickOptions) => Promise<PickResult | null>;
  /** The signed-in user (for menu items only some users get, cntMenu_Opening). */
  user: SessionUser | null;
  /** The form's ...Kt boxes' ids (the desktop's Tag), for items that read the record on screen. */
  tags: Record<string, number>;
  /** FillList: reload the grid as Refresh does (after a menu item changed the records). */
  refresh: () => void;
  /** The form's switches that are ticked (ToolbarCheckbox.listSwitch), as `name: true`. */
  switches: Record<string, boolean>;
  /** Sets a box of the form (a menu item that writes into the panel, e.g. txtGroupNo). */
  setField: (name: string, value: string) => void;
  /**
   * "Show All Records": drop the window's WhereCondition (`ScreenSpec.openWith`'s pick, or the
   * records another screen opened it with), then FillList.
   */
  showAll: () => void;
  /** The engine's own items, for a screen that lays out its whole menu. */
  printSelectedColumn: () => void;
  printLayouts: ContextMenuItem[];
  sendToExcel: () => void;
};

/** A CheckBox of the form outside its panel, drawn over the toolbar's right end. */
export type ToolbarCheckbox = {
  name: string;
  label: string;
  right: number;
  disabled?: boolean;
  /**
   * The box is a switch of the form, not a column of the record (frmBookMasterNew's
   * chkSearchNotInOB): it keeps its state from record to record, is not saved, is sent as a
   * switch (`name`: true) with the grid's, the search box's and the record's requests
   * (ScreenDefinition.listFilter's params), and ticking or clearing it reloads the grid
   * (CheckedChanged -> FillList). Menu items read it from `ScreenActions.switches`.
   */
  listSwitch?: boolean;
};

/** ScreenSpec.toolbarCheckbox as a list. */
export function toolbarCheckboxes(spec: { toolbarCheckbox?: ToolbarCheckbox | ToolbarCheckbox[] }) {
  const c = spec.toolbarCheckbox;
  return c === undefined ? [] : Array.isArray(c) ? c : [c];
}

/** What a master screen adds to the shared engine. */
export type ScreenSpec = {
  /** The menu's screen id (packages/shared/src/menu.ts). */
  screen: string;
  /** SplitContainer1.SplitterDistance: the height of the fields panel. */
  panelHeight: number;
  /** The panel's designer width, used to keep the field positions in proportion. */
  panelWidth: number;
  fields: FieldSpec[];
  /** Labels not tied to one box. */
  labels?: LabelSpec[];
  /**
   * GroupBoxes of the panel that hold nothing the web can show (Party Master's Photo and
   * FormFilled frames, whose PictureBoxes no code ever fills): drawn empty, with their caption.
   */
  groups?: { text: string; at: { x: number; y: number; w: number; h: number } }[];
  columns: GridColumnSpec[];
  /** The F2 popups the "…Tran" boxes open, keyed by the name `FieldSpec.trans` uses. */
  trans?: Record<string, TransSpec>;
  /**
   * btnNew_Click keeps some boxes of the record on screen (text and Tag) and computes the rest
   * from them: `keep` are the boxes it leaves, `params` what the server's newDefaults gets from
   * the form (frmMagazineVisheshNew keeps Book Name, LibNo and Work Done By, and asks the kept
   * book's next Seq).
   */
  onNew?: {
    keep?: string[];
    /**
     * When this box is empty, New first asks for it with an InputBox (`prompt`) and keeps the
     * answer; an empty answer or Cancel abandons New (frmAnyaBhandar's "Please Enter Size").
     */
    ask?: { field: string; prompt: string };
    /**
     * Popups whose rows the new record starts with, keyed like `trans`: the rows the form holds
     * (loaded for the record on screen when the form had not loaded them yet), as this returns
     * them. They are saved with the new record (frmTirthRakshaMaster carries the Reference rows,
     * with their keys and PageNo cleared).
     */
    trans?: Record<string, (state: TransState) => TransState>;
    params?: (form: {
      fields: Record<string, string>;
      tags: Record<string, number>;
      /** The popups' rows the new record starts with (`trans`). */
      trans: Record<string, TransState>;
      /**
       * dgMain.CurrentRow's cells, or null when the grid has none (frmPatrika takes the new
       * RecordNo's series from the current row).
       */
      current: GridRow | null;
    }) => Record<string, string | number>;
  };
  /**
   * The menu shows a pick list before the form opens (the opener's DisplayListForm with
   * boolSelectFirst): `list` is a ScreenDefinition.lists name. A pick becomes the window's
   * WhereCondition, sent as list switches with every FillList (Refresh keeps it, "Show All
   * Records" drops it); a cancel, or a pick `toParams` turns into null, opens the window on
   * StrId "0" (an empty grid, so New). A window another screen opens with its own records skips
   * the list.
   */
  openWith?: {
    list: string;
    title?: string;
    toParams: (picked: PickResult) => Record<string, string | number> | null;
  };
  /**
   * A CheckBox on the form, outside the panel (Author Master's chkGuru, over the toolbar), or
   * several, left to right (frmGraphicMaster's chkFinalized and chkPending).
   */
  toolbarCheckbox?: ToolbarCheckbox | ToolbarCheckbox[];
  /** Record columns that, when true, lock the record against editing (FillData). */
  lockedColumns?: string[];
  /**
   * A record-and-user rule that locks the record the same way (Modify, Delete and Copy off), e.g.
   * `ownerLocked` from @gglib/shared (frmInwordMaster: a non-admin cannot change a record
   * someone else entered). `record` is the loaded record, so the columns the rule reads must be
   * among the screen's tblSearch columns or its recordExtras. The server enforces the same rule
   * (ScreenDefinition.lockedWhen).
   */
  lockedWhen?: (record: GridRow, user: SessionUser) => boolean;
  /**
   * FillData turning single toolbar buttons off for the loaded record (frmLabIssueMaster: Delete
   * off for a delivered row, Modify off for a returned one), where `lockedWhen` turns them all
   * off. The server enforces the same rule (ScreenDefinition.buttonsOff).
   */
  buttonsOff?: (record: GridRow, user: SessionUser) => { modify?: boolean; delete?: boolean };
  /** lblEntry shows who entered and modified the record (frmAuthorMaster sets it; Bhasha no longer does). */
  entryLabel?: boolean;
  /** The form asks for the rest of Save (the rename prompt, …): extra fields, or null to stop. */
  beforeSave?: (
    ctx: SaveContext & { tags: Record<string, number> },
  ) => Promise<Record<string, string | number | boolean> | null>;
  /** Delete()'s question; the default is "Are You Sure to Delete This Record?". */
  deleteQuestion?: (row: GridRow | undefined) => string;
  /** F1 on a box opens its reference rows (tblSearch HelpText). */
  help?: boolean;
  /** dgMain_CellFormatting's ForeColor for a row (Column Master's DarkViolet for referenced rows). */
  rowTextColor?: (row: GridRow) => string | undefined;
  /**
   * Who may change records (Column Master: admins, AMaster and users 20 / 50). Anyone else gets
   * EnableDisableDataEditing's Locked toolbar with New off too: the screen is list-only for them.
   * The server enforces the same rule (ScreenDefinition.writableBy).
   */
  writableBy?: (user: SessionUser) => boolean;
  /**
   * Who gets New, Copy and Delete (frmEmployeeNew: IsAdmin and users 5 / 13); for anyone else
   * they stay disabled while Modify / Save work as usual. The server enforces the same rule
   * (ScreenDefinition.recordWritableBy).
   */
  addDeleteBy?: (user: SessionUser) => boolean;
  /**
   * Who may change a saved record (frmLeaveM: user type 1 and users 41 / 5). Anyone else gets
   * EnableDisableDataEditing's Locked toolbar on a record (Modify, Copy and Delete off) but
   * keeps New. The server enforces the same rule (ScreenDefinition.recordWritableBy).
   */
  modifyBy?: (user: SessionUser) => boolean;
  /**
   * Items below "Print Report" and "Send To Excel" in the grid's right-click menu. An item whose
   * `shortcut` is a function key ("F4" … : the ToolStripMenuItem's ShortcutKeys) also runs on
   * that key while the window has the focus and no record is being edited (any screen's menu,
   * including a whole `menu` of MasterScreenExtras).
   */
  contextMenu?: (actions: ScreenActions) => ContextMenuItem[];
  /**
   * The form passes its panel to EnableDisableDataEditing: every box is ReadOnly until Modify
   * or New, and a popup opened then shows no New / Save / Delete / Move buttons.
   */
  lockPanel?: boolean;
  /** The form's checks before "Are You Sure to Save This Record?"; '' when it may go on. */
  validate?: (ctx: SaveContext & { tags: Record<string, number> }) => string;
  /** Ctrl+L / Ctrl+U run this action (with the password and `lock`) instead of the plain lock. */
  lockAction?: string;
  /** Txt_Leave: values other boxes take when this one is left. */
  onFieldLeave?: (
    name: string,
    fields: Record<string, string>,
    tags: Record<string, number>,
  ) => Record<string, string> | null;
  /**
   * btnCopy_Click after "Do You Want to Add More With Copying Data?": boxes to clear, and the
   * popups whose rows are loaded (FillTransactionDatatable) to be saved with the copy.
   */
  copy?: { clear: string[]; loadTrans: string[]; newDefaults?: boolean };
  /**
   * A frmMasterPage form that never calls EnableDisableDataEditing (frmBookTranNew): every
   * button stays enabled, a selected row is edited in place (StrMode "Edit"), Save does not ask,
   * and after adding a row the boxes clear for the next one. Modify, Cancel, Copy and Work Report
   * have no handlers there and do nothing.
   */
  editInPlace?: boolean;
  /** The form has no btnCopy_Click: Copy is enabled as usual but does nothing (frmColumnMaster). */
  noCopy?: boolean;
  /** With `editInPlace`: New, Save, Copy and Delete are disabled (frmBookTranNew's Show All). */
  listOnly?: boolean;
  /** Delete removes every selected row, not only the current one (frmParishistNamSuchi). */
  deleteSelected?: boolean;
  /** The form's own Delete, in place of confirm + Security password + CheckInUse. */
  deleteFlow?: (
    actions: ScreenActions,
    state: import('./useMasterScreen').MasterState,
  ) => Promise<void>;
  /**
   * A frmMasterPage form that is only a grid (frmWorkReportM): no field panel, no
   * EnableDisableDataEditing — every toolbar button stays enabled, and only Refresh and Exit
   * have handlers; its Form_KeyDown knows only Ctrl+Z / Y / F / R. Moving through the grid
   * loads nothing.
   */
  reportOnly?: boolean;
  /**
   * ShowHideButton(ToolStrip1, …) on a form that never calls EnableDisableDataEditing
   * (frmBookConfirmation): only these toolbar buttons and Exit are shown, always enabled; its
   * Form_KeyDown knows Ctrl+Z / Y / F / R / L / U and Ctrl+D. The panel shows the current
   * record but nothing in it is ever saved.
   */
  fixedButtons?: ('delete' | 'refresh')[];
  /** The form's FillList switches, sent with every list request (Work Report's Display Count). */
  listParams?: Record<string, string | number | boolean>;
  /** FillList keeps using the StrId the window was opened with, Refresh included. */
  refreshKeepsIds?: boolean;
  /** The grid's row identity when the key column is not unique (Display Count's rows are all 0). */
  rowKey?: (row: GridRow) => string;
  /** lblEntry's text, for a form that writes its own (Work Report's date range). */
  toolbarLabel?: (state: import('./useMasterScreen').MasterState) => string;
  /** After a Save (the owner of a dialog form refreshes what it shows). */
  afterSave?: (id: number) => void;
  /**
   * Save()'s question in place of "Are You Sure to Save This Record?", which may need the server
   * (frmIssueTran prefixes "Return 6 Month Old Book." for a party with old books). `action`
   * runs one of the screen's actions and returns its result.
   */
  saveQuestion?: (ctx: {
    fields: Record<string, string>;
    tags: Record<string, number>;
    strMode: 'Add' | 'Edit';
    action: (name: string, params?: ActionParams) => Promise<ActionResult | null>;
  }) => Promise<string>;
  /**
   * After a new record is saved, the form asks `question` (frmIssueTran's "Do You Want to
   * Continue With Add New Record?"). Yes keeps the panel in Add mode for the next record: the
   * `clear` boxes (text and Tag) are emptied, the `defaults` keys are taken again from
   * newDefaults, and `fromRow` boxes take the saved row's column (a value the server assigned);
   * FormContext.continued is true until another record or New. No: as without it.
   */
  continueAdding?: {
    question: string;
    /**
     * The question's MsgBox title. With one, it replaces the "Record Saved Successfully" message
     * (frmGraphicsDetail asks "Do You Want to Add More With Copying Data?" under that title).
     */
    title?: string;
    clear: string[];
    defaults?: string[];
    fromRow?: Record<string, string>;
    /** Asked after saving a modified record too, not only a new one (frmGraphicsDetail). */
    edit?: boolean;
    /**
     * Popups whose rows are loaded again from the saved record (FillTransactionDatatable), with
     * their TransSpec.onCopy, to be saved with the next record.
     */
    loadTrans?: string[];
  };
  /**
   * A window another screen opened for a new record (ScreenProps.initialNew, ActionResult `open`
   * with `newRecord`). `scope`: the list switches its grid shows instead of an empty grid, kept by
   * Refresh (frmGraphicsDetail opened by Add Detail lists that book's pictures: WhereCondition
   * " and Graphickt in (<id>)"); the window still starts in Add mode with the values. `after`:
   * runs once the new record is on screen (it may fill popups from the server).
   */
  initialNew?: {
    scope?: (prefill: GridRow) => Record<string, string | number> | null;
    after?: (prefill: GridRow, ctx: FormContext) => Promise<void>;
  };
  /**
   * The form's own F2 in the search box for a Search By column (frmIssueTran's "Return Date"
   * range InputBox and "Returned" list), keyed by the column's lower-cased DisplayName; it
   * replaces UcSearch's own F2 there.
   */
  searchF2?: Record<string, (actions: ScreenActions) => Promise<void>>;
  /**
   * Ctrl shortcuts of the form's own menu items (ShortcutKeys), by lower-case key, e.g. Book
   * Master's Ctrl+G. They run in normal mode only, beside Form_KeyDown's.
   */
  ctrlKeys?: Record<
    string,
    (actions: ScreenActions, state: import('./useMasterScreen').MasterState) => void
  >;
};

export type SaveContext = {
  strMode: 'Add' | 'Edit';
  fields: Record<string, string>;
  /** The record as it was loaded (dtSel). */
  loaded: GridRow | null;
  /** Boxes the record disabled (FieldSpec.disabledColumn). */
  disabled: Record<string, boolean>;
  confirm: (text: string) => Promise<boolean>;
};

export type { ChildRow, GridRow };

'use client';

import {
  type ActionResult,
  type ChildRow,
  type GridRow,
  type GridValue,
  type MasterMeta,
  matchesFilter,
  parseSearch,
  type PickList,
  type SaveResult,
  type SearchColumn,
  type TransGrid,
  type TransTable,
  type WorkReportPrompt,
} from '@gglib/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMessageBox } from '@/components/ui/MessageBox';
import { useAuth } from '@/features/auth/AuthProvider';
import { api, ApiRequestError, errorMessage } from '@/lib/api';
import { todayIso } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { genericSummary, netString, sampradaySummary } from './transSummary';
import { type ScreenSpec, type TransState, toolbarCheckboxes } from './types';

/** The toolbar's two states (clsCommon.EnableDisableDataEditing modes 1 and 0/2). */
export type Mode = 'normal' | 'edit';

/**
 * The window's own WhereCondition (ScreenSpec.openWith): the list switches its menu pick made,
 * or the records it was opened on (StrId).
 */
export type ListScope = { ids?: number[]; params?: Record<string, string | number> };

/** One entry of the Prev/Next history (UcPrevNext). */
type HistoryEntry = { rows: GridRow[]; searchBy: string; searchText: string };

export type MasterState = ReturnType<typeof useMasterScreen>;

/** A popup's contents for the loaded record, and whether the user opened (and saved) it. */
type OpenedTrans = TransState & { opened: boolean };

/** DataRow("Column"): the record's columns are matched without regard to case (SetTextbox). */
function column(row: GridRow, name: string): GridValue | undefined {
  if (name in row) return row[name];
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(row)) if (k.toLowerCase() === lower) return v;
  return undefined;
}

/**
 * Everything a master form does, from frmMasterPage and its forms: load the grid, follow the
 * selected record into the fields, New / Modify / Save / Cancel / Delete / Refresh, the record
 * lock, the search box's filter, the Prev/Next history — and, for a form with F2 popups
 * (Author Master), the popups' rows the form keeps until the record is saved.
 */
export function useMasterScreen(
  spec: ScreenSpec,
  initialIds?: number[],
  initialScope?: ListScope,
  /** ScreenProps.initialNew: the new record another screen opened this one for. */
  initialNew?: GridRow,
) {
  const msg = useMessageBox();
  const auth = useAuth();
  const { search: syntax } = usePreferences();
  const base = `/master/${spec.screen}`;

  const [meta, setMeta] = useState<MasterMeta | null>(null);
  const [rows, setRows] = useState<GridRow[]>([]);
  const [mode, setMode] = useState<Mode>('normal');
  /** StrMode: a new record ("Add") or the one selected in the grid ("Edit"). */
  const [strMode, setStrMode] = useState<'Add' | 'Edit'>('Add');
  const [tranKm, setTranKm] = useState(0);
  const [fields, setFields] = useState<Record<string, string>>({});
  /** The ids behind ...Kt boxes (the desktop's Tag). */
  const [tags, setTags] = useState<Record<string, number>>({});
  /** Boxes a record disabled (FieldSpec.disabledColumn); they stay so until another record says otherwise. */
  const [disabled, setDisabled] = useState<Record<string, boolean>>({});
  /** The loaded record (dtSel), for what the form compares against on Save. */
  const [loaded, setLoaded] = useState<GridRow | null>(null);
  /** The F2 popups' rows for this record, loaded on first F2 (FillTransactionDatatable). */
  const [trans, setTrans] = useState<Record<string, OpenedTrans>>({});
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchBy, setSearchBy] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchIn, setSearchIn] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  /** btnCopy starts disabled and comes back with the next mode change (Work Report: see MasterToolbar). */
  const [justLoaded, setJustLoaded] = useState(true);
  const [busy, setBusy] = useState(false);
  /** Locked (or locked by the admin): Modify, Delete and Copy stay off (EnableDisableDataEditing). */
  const [locked, setLocked] = useState(false);
  const [buttonsOff, setButtonsOff] = useState<{ modify?: boolean; delete?: boolean }>({});
  /** lblEntry. */
  const [entryText, setEntryText] = useState('');
  /** insertworkreports after a modification: the Work Type still to ask for. */
  const [workReportPrompt, setWorkReportPrompt] = useState<WorkReportPrompt | null>(null);
  /** dgMain.MultiSelect (Kruti Master's Toggle MultiSelect turns it off). */
  const [multiSelect, setMultiSelect] = useState(true);
  /** dgMain.CurrentRow and dgMain.SelectedRows, as rows (for a form that reads their cells). */
  const [currentRow, setCurrentRow] = useState<GridRow | null>(null);
  const [selectedRows, setSelectedRows] = useState<GridRow[]>([]);
  /** ScreenSpec.continueAdding: adding the next record after "Continue With Add New Record?". */
  const [continued, setContinued] = useState(false);
  /** The new record another screen opened this one for is on screen (ScreenSpec.initialNew.after). */
  const [initialNewReady, setInitialNewReady] = useState(false);
  /** UcSearch.lblRange: the last Search In Range text ("from-to"). */
  const [lastRange, setLastRange] = useState('');
  const historyKeys = useRef<string[]>([]);
  const recordToken = useRef(0);
  /** The current FillList switches; read when the list reloads, whenever that is. */
  const listParams = useRef(spec.listParams);
  listParams.current = spec.listParams;
  /** ScreenSpec.openWith: the window's WhereCondition, until "Show All Records" drops it. */
  /** ScreenSpec.initialNew.scope: the window opened for a new record lists by these switches. */
  const newScope = initialNew && spec.initialNew?.scope ? spec.initialNew.scope(initialNew) : null;
  const scope = useRef<ListScope>(
    initialScope ??
      (spec.openWith && initialIds ? { ids: initialIds } : newScope ? { params: newScope } : {}),
  );
  /** ToolbarCheckbox.listSwitch: the form's ticked switches (`name: true`). */
  const [switches, setSwitches] = useState<Record<string, boolean>>({});
  const switchesRef = useRef(switches);
  /** The switches as request params, or nothing when none is ticked. */
  const switchParams = () =>
    Object.keys(switchesRef.current).length > 0 ? { params: switchesRef.current } : {};
  /** The list request: StrId (the given ids, or the window's own) and the form's switches. */
  const listBody = (ids?: number[], params = listParams.current) => {
    const strId = ids ?? (spec.refreshKeepsIds ? initialIds : undefined) ?? scope.current.ids;
    const merged = { ...params, ...scope.current.params, ...switchesRef.current };
    return {
      ...(strId ? { ids: strId } : {}),
      ...(Object.keys(merged).length > 0 || params ? { params: merged } : {}),
    };
  };

  const column0 = (id: string): SearchColumn | undefined =>
    meta?.searchColumns.find((c) => String(c.id) === id);

  /** The rows the search box leaves visible (the DataView's RowFilter). */
  const visibleRows = useMemo(() => {
    if (searchText.trim() === '' || !meta) return rows;
    const col = column0(searchBy);
    const targets =
      searchBy === ''
        ? meta.freeTextTargets
        : [
            {
              column: col?.gridColumnName || col?.joinColumnName || col?.columnName || '',
              dataType: col?.joinColumnName?.toLowerCase().endsWith('name')
                ? ''
                : (col?.dataType ?? ''),
            },
          ];
    if (searchBy !== '' && !(col?.searchOnTextChange && col.displayInGrid)) return rows;
    const parsed = parseSearch(searchText, targets, searchIn, syntax);
    if (!parsed.ok) return rows;
    return rows.filter((r) => matchesFilter(r, parsed.filter));
  }, [rows, searchText, searchBy, searchIn, meta, syntax]);

  const visibleIds = useMemo(
    () => visibleRows.map((r) => Number(r[meta?.primaryColumn ?? ''])).filter(Number.isFinite),
    [visibleRows, meta],
  );

  const pushHistory = useCallback((next: GridRow[], by: string, text: string) => {
    const key = `${historyKeys.current.length + 1}-${next.length}`;
    if (historyKeys.current.includes(key)) return;
    historyKeys.current.push(key);
    setHistory((h) => [...h, { rows: next, searchBy: by, searchText: text }]);
    setHistoryIndex((i) => (historyKeys.current.length === 1 ? 0 : i + 1));
  }, []);

  const fail = useCallback(
    async (err: unknown) => {
      await msg.alert(errorMessage(err));
    },
    [msg],
  );

  /** FillList: reload the grid from the server (`params`: switches not yet rendered into spec). */
  const reload = useCallback(
    async (ids?: number[], params?: Record<string, string | number | boolean>) => {
      try {
        const next = await api.post<GridRow[]>(
          `${base}/list`,
          listBody(ids, params ?? listParams.current),
        );
        setRows(next);
        pushHistory(next, searchBy, searchText);
        return next;
      } catch (err) {
        await fail(err);
        return [];
      }
    },
    [base, fail, pushHistory, searchBy, searchText],
  );

  /** FillList with a form's WhereCondition: the grid now shows exactly these rows. */
  const showRows = useCallback(
    (next: GridRow[]) => {
      setRows(next);
      pushHistory(next, '', '');
    },
    [pushHistory],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [m, list] = await Promise.all([
          api.get<MasterMeta>(`${base}/meta`),
          api.post<GridRow[]>(
            `${base}/list`,
            listBody(spec.openWith || newScope ? undefined : initialIds),
          ),
        ]);
        if (cancelled) return;
        setMeta(m);
        setRows(list);
        pushHistory(list, '', '');
        // Form_Load: an empty grid starts in New; so does a window opened for a new record that
        // lists other records by ScreenSpec.initialNew.scope.
        if ((list.length === 0 || newScope) && !spec.reportOnly && !spec.fixedButtons) {
          await startNew(initialNew);
          if (initialNew && !cancelled) setInitialNewReady(true);
        }
      } catch (err) {
        if (!cancelled) await fail(err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Load once per window.
  }, []);

  /** FillData: the record behind the grid's current row goes into the boxes. */
  const loadRecord = useCallback(
    async (id: number) => {
      if (spec.reportOnly) {
        setCurrentId(id);
        return;
      }
      const token = ++recordToken.current;
      setContinued(false);
      setCurrentId(id);
      setTranKm(id);
      setStrMode('Edit');
      setFields({});
      setTags({});
      setTrans({});
      setLoaded(null);
      setEntryText('');
      try {
        const [record, entry] = await Promise.all([
          api.get<GridRow>(`${base}/record/${id}${queryOf(switchParams().params)}`),
          spec.entryLabel
            ? api.get<{ text: string }>(`${base}/record/${id}/entry`)
            : Promise.resolve({ text: '' }),
        ]);
        if (token !== recordToken.current) return;
        const nextFields: Record<string, string> = {};
        const nextTags: Record<string, number> = {};
        for (const f of spec.fields) {
          const raw = f.kt ? column(record, f.nameColumn ?? '') : column(record, f.name);
          const isTrue = raw === true || raw === 1 || String(raw).toLowerCase() === 'true';
          nextFields[f.name] = f.checkbox
            ? isTrue
              ? 'True'
              : 'False'
            : f.options && f.bitOptions
              ? (f.options[isTrue ? 1 : 0] ?? '')
              : f.date
                ? cellToText(raw).slice(0, 10)
                : f.mask
                  ? maskedText(raw, f.mask)
                  : f.datetimeText
                    ? datetimeText(raw).slice(0, f.datetimeText === 'date' ? 10 : undefined)
                    : cellToText(raw);
          if (f.kt) nextTags[f.name] = Number(column(record, f.name) ?? 0) || 0;
        }
        for (const c of toolbarCheckboxes(spec)) {
          if (c.listSwitch) continue;
          const v = column(record, c.name);
          nextFields[c.name] = v === true || v === 1 || v === 'True' ? 'True' : 'False';
        }
        setFields(nextFields);
        setTags(nextTags);
        setDisabled((d) => {
          const next = { ...d };
          for (const f of spec.fields) {
            if (!f.disabledColumn) continue;
            const v = column(record, f.disabledColumn);
            next[f.name] = v === true || v === 1 || v === 'True';
          }
          return next;
        });
        setLoaded(record);
        // frmBookTranNew.SetSelectionRecord: the selected row is edited in place.
        if (spec.editInPlace) {
          setMode('edit');
          setJustLoaded(false);
        }
        setEntryText(entry.text);
        setButtonsOff(
          spec.buttonsOff && auth.status === 'authenticated'
            ? spec.buttonsOff(record, auth.user)
            : {},
        );
        setLocked(
          (spec.lockedColumns ?? []).some((c) => {
            const v = column(record, c);
            return v === true || v === 1;
          }) ||
            // ScreenSpec.lockedWhen (the owner lock): a rule on the record and the viewer.
            Boolean(
              spec.lockedWhen &&
              auth.status === 'authenticated' &&
              spec.lockedWhen(record, auth.user),
            ),
        );
      } catch (err) {
        await fail(err);
      }
    },
    [base, fail, spec, auth],
  );

  const setField = (name: string, value: string) => setFields((f) => ({ ...f, [name]: value }));
  const setTag = (name: string, id: number) => setTags((t) => ({ ...t, [name]: id }));

  // ScreenSpec.writableBy: for anyone else the toolbar stays Locked and New is off too.
  const canWrite =
    !spec.writableBy || (auth.status === 'authenticated' && spec.writableBy(auth.user));
  // ScreenSpec.modifyBy: Modify, Copy and Delete of a saved record for these users only.
  const canChangeSaved =
    !spec.modifyBy || (auth.status === 'authenticated' && spec.modifyBy(auth.user));
  const canChange =
    mode === 'normal' && visibleRows.length > 0 && !locked && canWrite && canChangeSaved;
  // ScreenSpec.buttonsOff: the loaded record's own Modify / Delete state.
  const canModify = canChange && !buttonsOff.modify;
  // ScreenSpec.addDeleteBy: New, Copy and Delete for these users only.
  const canAddDelete =
    !spec.addDeleteBy || (auth.status === 'authenticated' && spec.addDeleteBy(auth.user));

  /**
   * btnNew_Click: clear the boxes and start an empty record. `prefill`: values another screen
   * opened this one with (ScreenProps.initialNew), put in over the new-record defaults.
   */
  async function startNew(prefill?: GridRow) {
    // ScreenSpec.onNew.ask: an empty box is asked for first; no answer, no New.
    const ask = spec.onNew?.ask;
    let asked: string | null = null;
    if (ask && (fields[ask.field] ?? '').trim() === '') {
      asked = await msg.input(ask.prompt, 'Library');
      if (!asked) return;
    }
    recordToken.current++;
    setContinued(false);
    // ScreenSpec.onNew: the boxes the form carries over, and what it computes from them.
    const keep = spec.onNew?.keep ?? [];
    const keptFields: Record<string, string> = {};
    const keptTags: Record<string, number> = {};
    for (const name of keep) {
      if (fields[name] !== undefined) keptFields[name] = fields[name]!;
      if (tags[name] !== undefined) keptTags[name] = tags[name]!;
    }
    if (ask && asked !== null) keptFields[ask.field] = asked;
    // ScreenSpec.onNew.trans: popups whose rows the new record starts with (the record's own,
    // loaded now when the form had not loaded them yet), changed as the form changes them.
    const keptTrans: Record<string, OpenedTrans> = {};
    for (const [key, carry] of Object.entries(spec.onNew?.trans ?? {})) {
      const t = spec.trans?.[key];
      if (!t) continue;
      let state: TransState | undefined = trans[key];
      if (!state) {
        try {
          state = await api.get<TransGrid>(
            `${base}/trans/${t.column}/${strMode === 'Add' ? 0 : tranKm}`,
          );
        } catch (err) {
          await fail(err);
          return;
        }
      }
      keptTrans[key] = { ...carry(state), opened: true };
    }
    const newParams = spec.onNew?.params?.({
      fields: keptFields,
      tags: keptTags,
      trans: keptTrans,
      current: currentRow,
    });
    // clsCom.clear empties the text boxes; a DateTimePicker keeps the date it shows.
    setFields((f) => {
      const kept: Record<string, string> = { ...keptFields };
      for (const d of spec.fields) if (d.date && f[d.name]) kept[d.name] = f[d.name]!;
      return kept;
    });
    setTags(keptTags);
    setTrans(keptTrans);
    setLoaded(null);
    setEntryText('');
    setLocked(false);
    setButtonsOff({});
    setMode('edit');
    setStrMode('Add');
    setTranKm(0);
    setJustLoaded(false);
    try {
      const defaults = {
        ...(await api.get<GridRow>(`${base}/new-defaults${queryOf(newParams)}`)),
        ...prefill,
      };
      // A ...Kt box takes its id (the Tag) from its own name and its text from `nameColumn`.
      const kts = spec.fields.filter((d) => d.kt);
      setFields((f) => {
        const next = { ...f };
        for (const [k, v] of Object.entries(defaults)) {
          if (kts.some((d) => d.name === k)) continue;
          const box = kts.find((d) => d.nameColumn === k);
          next[box ? box.name : k] = cellToText(v);
        }
        return next;
      });
      setTags((t) => {
        const next = { ...t };
        for (const d of kts) if (d.name in defaults) next[d.name] = Number(defaults[d.name]) || 0;
        return next;
      });
    } catch (err) {
      await fail(err);
    }
  }
  const newRecord = () => void startNew();

  /** btnModify_Click: claim the record, or say who is editing it. */
  const modify = async () => {
    if (currentId === null) return;
    try {
      await api.post(`${base}/edit-lock/${currentId}`);
      setMode('edit');
      setStrMode('Edit');
      setTranKm(currentId);
      setJustLoaded(false);
    } catch (err) {
      await msg.alert(errorMessage(err), 'Record cannot be edited');
    }
  };

  const releaseLock = async (id: number) => {
    try {
      await api.del(`${base}/edit-lock/${id}`);
    } catch {
      // The record simply stays claimed; the desktop ignores this too.
    }
  };

  /** btnCancel_Click. */
  const cancel = async () => {
    await releaseLock(tranKm);
    setMode('normal');
    setJustLoaded(false);
  };

  /** btnCancel_Click + dgMain_Click: cancel, then show the grid's current record again. */
  const cancelAndReload = async () => {
    await cancel();
    if (currentId !== null) await loadRecord(currentId);
  };

  /**
   * F2 on a "…Tran" box: the popup's rows as the form last kept them, or — the first time for
   * this record — from the server.
   */
  const loadTrans = async (key: string): Promise<OpenedTrans | null> => {
    const t = spec.trans?.[key];
    if (!t) return null;
    if (trans[key]) return trans[key];
    try {
      const grid = await api.get<TransGrid>(
        `${base}/trans/${t.column}/${strMode === 'Add' ? 0 : tranKm}`,
      );
      const state: OpenedTrans = { ...grid, opened: false };
      setTrans((all) => ({ ...all, [key]: state }));
      return state;
    } catch (err) {
      await fail(err);
      return null;
    }
  };

  /** The popup's Save: keep its rows, and rewrite the text box from them. */
  const saveTrans = (
    key: string,
    fieldName: string,
    rows: ChildRow[],
    extra?: TransTable,
    extras?: TransTable[],
    opts?: { keepText?: boolean; base?: TransState; extras?: TransTable[] },
  ) => {
    const t = spec.trans?.[key];
    // `base`: rows loaded just now by the caller, not yet in this render's state.
    const current = trans[key] ?? (opts?.base ? { ...opts.base, opened: false } : undefined);
    if (!t || !current) return;
    setTrans((all) => ({
      ...all,
      [key]: {
        ...current,
        rows,
        extra: extra ?? extras?.[0] ?? current.extra,
        extras: extras ?? current.extras,
        opened: true,
      },
    }));
    if (opts?.keepText) return;
    const columns = current.columns.map((c) => c.name);
    const text =
      typeof t.summary === 'function'
        ? t.summary(rows, columns)
        : t.summary === 'sampraday'
          ? sampradaySummary(rows)
          : genericSummary(rows, columns);
    setField(fieldName, text);
  };

  /** btnSave_Click / Save(). */
  const save = async () => {
    if (spec.validate) {
      const problem = spec.validate({
        strMode,
        fields,
        loaded,
        tags,
        disabled,
        confirm: (text) => msg.confirm(text),
      });
      if (problem) {
        await msg.alert(problem, 'Record Cannot Be Saved');
        return;
      }
    }
    let question = 'Are You Sure to Save This Record?';
    if (spec.saveQuestion) {
      question = await spec.saveQuestion({
        fields,
        tags,
        strMode,
        action: async (name, params) => {
          try {
            return await api.post<ActionResult>(`${base}/action/${name}`, {
              ids: [],
              ...(params ? { params } : {}),
            });
          } catch (err) {
            await fail(err);
            return null;
          }
        },
      });
    }
    if (!spec.editInPlace && !(await msg.confirm(question))) return;
    const payload: Record<string, string | number | boolean | ChildRow[]> = {};
    for (const f of spec.fields) {
      if (f.readOnly && !f.alwaysSend) continue;
      if (f.password) {
        // Write-only unless changed: the record carries the value only for an allowed viewer.
        const before = loaded ? netString(column(loaded, f.name) ?? null) : '';
        if (strMode === 'Add' || (fields[f.name] ?? '') !== before)
          payload[f.name] = fields[f.name] ?? '';
        continue;
      }
      payload[f.name] = f.checkbox
        ? fields[f.name] === 'True'
        : f.kt
          ? (tags[f.name] ?? 0)
          : f.date
            ? fields[f.name] || (f.keepEmptyDate && strMode === 'Edit' ? '' : todayIso())
            : (fields[f.name] ?? '');
    }
    for (const c of toolbarCheckboxes(spec))
      if (!c.listSwitch) payload[c.name] = fields[c.name] === 'True';
    for (const [key, t] of Object.entries(spec.trans ?? {})) {
      const state = trans[key];
      if (!state || !(state.opened || t.sendLoaded) || t.local) continue;
      const field = spec.fields.find((f) => f.trans === key);
      // The Address rows are rewritten only when their summary changed (dtSel comparison).
      if (t.onlyWhenTextChanged && field) {
        const text = (fields[field.name] ?? '').trim();
        const before = loaded ? netString(column(loaded, field.name) ?? null).trim() : null;
        if (!((text !== '' && !loaded) || (loaded && before !== text))) continue;
      }
      payload[`${t.column}.Rows`] = state.rows;
      const extras = state.extras ?? (state.extra ? [state.extra] : []);
      extras.forEach((x, i) => {
        payload[i === 0 ? `${t.column}.Extra` : `${t.column}.Extra${i + 1}`] = x.rows;
      });
    }
    if (spec.beforeSave) {
      const extra = await spec.beforeSave({
        strMode,
        fields,
        tags,
        loaded,
        disabled,
        confirm: (text) => msg.confirm(text),
      });
      if (extra === null) return;
      Object.assign(payload, extra);
    }
    setBusy(true);
    try {
      const result = await api.post<SaveResult>(`${base}/save`, {
        id: strMode === 'Add' ? 0 : tranKm,
        fields: payload,
      });
      // ScreenSpec.continueAdding: asked now, in place of the plain message when it has a title.
      const more = spec.continueAdding;
      const asksMore = Boolean(more && (strMode === 'Add' ? result.row : more.edit));
      // frmBookTranNew's Save says nothing.
      if (!spec.editInPlace && !(asksMore && more?.title))
        await msg.alert('Record Saved Successfully');
      if (result.message) await msg.alert(result.message);
      if (result.row) {
        setRows((current) =>
          strMode === 'Add'
            ? [result.row!, ...current]
            : current.map((r) => (Number(r[meta!.primaryColumn]) === result.id ? result.row! : r)),
        );
      }
      spec.afterSave?.(result.id);
      if (spec.editInPlace) {
        // Save(): an added row clears the boxes for the next (Refresh); an edited one stays.
        if (result.workReport) setWorkReportPrompt(result.workReport);
        if (strMode === 'Add') await startNew();
        else void loadRecord(result.id);
        return;
      }
      // ScreenSpec.continueAdding: Yes keeps adding, with the panel as it is.
      if (more && asksMore && (await msg.confirm(more.question, more.title))) {
        recordToken.current++;
        if (strMode === 'Edit') {
          await releaseLock(result.id);
          if (result.workReport) setWorkReportPrompt(result.workReport);
        }
        setContinued(true);
        setStrMode('Add');
        setTranKm(0);
        setLoaded(null);
        // The popups start again with the saved record's rows, to be saved with the next one.
        if (more.loadTrans) {
          const next: Record<string, OpenedTrans> = {};
          for (const key of more.loadTrans) {
            const t = spec.trans?.[key];
            if (!t) continue;
            try {
              const grid = await api.get<TransGrid>(`${base}/trans/${t.column}/${result.id}`);
              const state: OpenedTrans = { ...grid, opened: true };
              next[key] = t.onCopy ? { ...t.onCopy(state), opened: true } : state;
            } catch (err) {
              await fail(err);
            }
          }
          setTrans(next);
        }
        const row = result.row ?? {};
        let defaults: GridRow = {};
        if (more.defaults?.length) {
          try {
            defaults = await api.get<GridRow>(`${base}/new-defaults`);
          } catch (err) {
            await fail(err);
          }
        }
        setFields((f) => {
          const next = { ...f };
          for (const name of more.clear) next[name] = '';
          for (const k of more.defaults ?? []) if (k in defaults) next[k] = cellToText(defaults[k]);
          for (const [name, col] of Object.entries(more.fromRow ?? {}))
            next[name] = cellToText(column(row, col));
          return next;
        });
        setTags((t) => {
          const next = { ...t };
          for (const name of more.clear) if (name in next) next[name] = 0;
          return next;
        });
        return;
      }
      setTranKm(result.id);
      setCurrentId(result.id);
      setStrMode('Edit');
      await releaseLock(result.id);
      setMode('normal');
      setJustLoaded(false);
      if (result.workReport) setWorkReportPrompt(result.workReport);
      if (spec.trans) void loadRecord(result.id);
    } catch (err) {
      await fail(err);
    } finally {
      setBusy(false);
    }
  };

  /** The Work Type picked for the modification: write the work report entry. */
  const logWorkReport = async (workTypeId: number) => {
    const pending = workReportPrompt;
    if (!pending) return;
    setWorkReportPrompt(null);
    try {
      await api.post(`${base}/work-report-log/${pending.recordId}`, {
        workTypeId,
        mistake: pending.mistake,
        remark: pending.remark,
        mistakeCount: pending.mistakeCount,
      });
    } catch (err) {
      await fail(err);
    }
  };

  /** Delete(): confirm, then the Security password, then remove the record. */
  const remove = async (password: string) => {
    if (currentId === null) return;
    const ids = spec.deleteSelected && selectedIds.length > 0 ? selectedIds : [currentId];
    setBusy(true);
    try {
      await api.post(`${base}/delete`, { ids, password });
      await msg.alert('Record Deleted ', 'Information');
      setRows((current) => current.filter((r) => !ids.includes(Number(r[meta!.primaryColumn]))));
      setFields({});
      setTags({});
      setTrans({});
      setLoaded(null);
      setCurrentId(null);
      return true;
    } catch (err) {
      await fail(err);
      // A record still in use: the desktop shows why and is done; a wrong password retries.
      return err instanceof ApiRequestError && err.status === 409;
    } finally {
      setBusy(false);
    }
  };

  /** Ctrl+L / Ctrl+U: lock or unlock the selected records. */
  const setRecordsLocked = async (lock: boolean, password: string) => {
    setBusy(true);
    try {
      const result = await api.post<{ message: string; rows: GridRow[] }>(`${base}/lock`, {
        ids: selectedIds,
        lock,
        password,
      });
      setRows((current) =>
        current.map(
          (r) => result.rows.find((n) => n[meta!.primaryColumn] === r[meta!.primaryColumn]) ?? r,
        ),
      );
      await msg.alert(result.message);
      return true;
    } catch (err) {
      await fail(err);
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** btnCopy_Click: keep the values on screen but save them as a new record. */
  const copy = async () => {
    // A form without a btnCopy_Click handler: the button does nothing.
    if (spec.noCopy) return;
    if (!(await msg.confirm('Do You Want to Add More With Copying Data?'))) return;
    if (spec.copy) {
      // FillTransactionDatatable(): the popups' rows as loaded, to be written for the copy.
      const loadedTrans: Record<string, OpenedTrans> = {};
      for (const key of spec.copy.loadTrans) {
        const t = spec.trans?.[key];
        if (!t) continue;
        try {
          const grid = await api.get<TransGrid>(`${base}/trans/${t.column}/${tranKm}`);
          const state: OpenedTrans = { ...grid, opened: true };
          loadedTrans[key] = t.onCopy ? { ...t.onCopy(state), opened: true } : state;
        } catch (err) {
          await fail(err);
          return;
        }
      }
      setTrans(loadedTrans);
      setFields((f) => {
        const next = { ...f };
        for (const name of spec.copy!.clear) next[name] = '';
        return next;
      });
      setLoaded(null);
      if (spec.copy.newDefaults) {
        try {
          const defaults = await api.get<GridRow>(
            `${base}/new-defaults${queryOf(spec.onNew?.params?.({ fields, tags, trans, current: currentRow }))}`,
          );
          setFields((f) => {
            const next = { ...f };
            for (const [k, v] of Object.entries(defaults)) next[k] = cellToText(v);
            return next;
          });
        } catch (err) {
          await fail(err);
        }
      }
    }
    setTranKm(0);
    setStrMode('Add');
  };

  const refresh = () => void reload();

  /** A ToolbarCheckbox.listSwitch's CheckedChanged: FillList with the new switch. */
  const setSwitch = (name: string, on: boolean) => {
    const next = { ...switchesRef.current };
    if (on) next[name] = true;
    else delete next[name];
    switchesRef.current = next;
    setSwitches(next);
    void reload();
  };

  /** "Show All Records": FillList without the window's WhereCondition (ScreenSpec.openWith). */
  const showAll = () => {
    scope.current = {};
    void reload();
  };

  /** After "Save Config" adds or edits a Print Report layout, so its lists pick up the change. */
  const reloadMeta = async () => setMeta(await api.get<MasterMeta>(`${base}/meta`));

  /** F2 on a form field: its F2EntryText list. */
  const fieldPickList = (name: string, params?: Record<string, string | number>) => {
    const query = params
      ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()}`
      : '';
    return api.get<PickList>(`${base}/f2/${encodeURIComponent(name)}${query}`);
  };

  /** F2 / F3 in the search box: the column's values, within the grid or across the table. */
  const searchValues = (columnId: number, scope: 'grid' | 'all') =>
    api.post<PickList>(`${base}/search-values`, { columnId, scope, gridIds: visibleIds });

  /** The database search the picked values (or the typed text) run. */
  const runSearch = async (
    columnId: number,
    scope: 'grid' | 'all',
    values: string[],
    text: string,
  ) => {
    setBusy(true);
    try {
      const next = await api.post<GridRow[]>(`${base}/search`, {
        columnId,
        scope,
        gridIds: visibleIds,
        notIn: !searchIn,
        values,
        text,
        ...switchParams(),
      });
      setRows(next);
      pushHistory(next, '', '');
      setSearchBy('');
      setSearchText('');
    } catch (err) {
      await fail(err);
    } finally {
      setBusy(false);
    }
  };

  const searchRange = async (columnId: number, from: string, to: string) => {
    setLastRange(`${from}-${to}`);
    try {
      setRows(
        await api.post<GridRow[]>(`${base}/search-range`, {
          columnId,
          from,
          to,
          ...switchParams(),
        }),
      );
    } catch (err) {
      await fail(err);
    }
  };

  const searchBlank = async (columnId: number, blank: boolean, withinGrid: boolean) => {
    try {
      setRows(
        await api.post<GridRow[]>(`${base}/search-blank`, {
          columnId,
          blank,
          ...(withinGrid ? { withinIds: visibleIds } : {}),
          ...switchParams(),
        }),
      );
    } catch (err) {
      await fail(err);
    }
  };

  const goHistory = (index: number) => {
    const entry = history[index];
    if (!entry) return;
    setHistoryIndex(index);
    setRows(entry.rows);
    setSearchBy(entry.searchBy);
    setSearchText(entry.searchText);
  };

  /** UcPrevNext "Remove Selected Record": drop the currently shown result set from the history. */
  const removeHistoryEntry = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const next = h.filter((_, i) => i !== historyIndex);
      historyKeys.current = historyKeys.current.filter((_, i) => i !== historyIndex);
      const nextIndex = Math.max(historyIndex >= next.length ? next.length - 1 : historyIndex, 0);
      setHistoryIndex(nextIndex);
      const entry = next[nextIndex];
      setRows(entry ? entry.rows : []);
      setSearchBy(entry ? entry.searchBy : '');
      setSearchText(entry ? entry.searchText : '');
      return next;
    });
  };

  /** UcPrevNext "Restate": clear the whole result history (Restate_Clicl empties ds.Tables). */
  const restate = () => {
    historyKeys.current = [];
    setHistory([]);
    setHistoryIndex(0);
    setRows([]);
  };

  /** RefreshCurrentGridRecord: put fresh copies of some rows into the grid. */
  /** Cells a form writes into rows it shows (ActionResult `cells`): merged by primary key. */
  const patchRows = (patch: GridRow[]) => {
    const pk = meta?.primaryColumn ?? '';
    setRows((current) =>
      current.map((r) => {
        const p = patch.find((n) => n[pk] === r[pk]);
        return p ? { ...r, ...p } : r;
      }),
    );
  };

  const replaceRows = (fresh: GridRow[]) => {
    const pk = meta?.primaryColumn ?? '';
    setRows((current) => current.map((r) => fresh.find((n) => n[pk] === r[pk]) ?? r));
    if (currentId !== null && fresh.some((n) => Number(n[pk]) === currentId))
      void loadRecord(currentId);
  };

  return {
    meta,
    spec,
    rows,
    visibleRows,
    visibleIds,
    mode,
    strMode,
    tranKm,
    currentId,
    selectedIds,
    setSelectedIds,
    currentRow,
    setCurrentRow,
    selectedRows,
    setSelectedRows,
    lastRange,
    fields,
    tags,
    disabled,
    loaded,
    trans,
    loadTrans,
    saveTrans,
    setField,
    setTag,
    searchBy,
    setSearchBy,
    searchText,
    setSearchText,
    searchIn,
    setSearchIn,
    history,
    historyIndex,
    goHistory,
    removeHistoryEntry,
    restate,
    busy,
    multiSelect,
    setMultiSelect,
    justLoaded,
    canModify,
    canNew: canWrite && canAddDelete,
    canDelete: canChange && canAddDelete && !buttonsOff.delete,
    canCopy: canAddDelete && canChangeSaved,
    locked: locked || !canWrite,
    entryText,
    workReportPrompt,
    logWorkReport,
    cancelWorkReportPrompt: () => setWorkReportPrompt(null),
    loadRecord,
    newRecord,
    initialNewReady,
    modify,
    cancel,
    cancelAndReload,
    continued,
    save,
    remove,
    setLocked: setRecordsLocked,
    copy,
    refresh,
    switches,
    setSwitch,
    showAll,
    reload,
    showRows,
    replaceRows,
    patchRows,
    reloadMeta,
    fieldPickList,
    searchValues,
    runSearch,
    searchRange,
    searchBlank,
    column: column0,
  };
}

/** `?a=1&b=2` for values the server reads as query text, or '' for none. */
function queryOf(params?: Record<string, string | number | boolean>): string {
  if (!params || Object.keys(params).length === 0) return '';
  return `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()}`;
}

/** SetTextbox: the desktop trims and unescapes what it puts in a box. */
/** A MaskedTextBox's text for a value: a SQL `time` (an ISO timestamp on 1970-01-01) as hh:mm. */
function maskedText(value: unknown, mask = ''): string {
  const text = cellToText(value);
  const time = text.match(/^1970-01-01T(\d{2}:\d{2})/);
  if (time) return time[1]!;
  // A date in a "00/00/0000" mask: FillData's Format(…, "dd-MM-yyyy"), which the mask shows
  // with its own "/" literals.
  const date = mask === '00/00/0000' ? text.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  return date ? `${date[3]}/${date[2]}/${date[1]}` : text;
}

/** Convert.ToString(DateTime) on en-IN: dd-MM-yyyy HH:mm:ss. */
function datetimeText(value: unknown): string {
  const text = cellToText(value);
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}` : text;
}

function cellToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/&gt;/g, '>').replace(/&lt;/g, '>').trim();
}

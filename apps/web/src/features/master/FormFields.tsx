'use client';

import type { ChildRow, PickList, TransGrid, TransTable } from '@gglib/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMessageBox } from '@/components/ui/MessageBox';
import { PickListDialog } from '@/components/ui/PickListDialog';
import { api, errorMessage } from '@/lib/api';
import { todayIso } from '@/lib/format';
import { fontCss, usePreferences } from '@/lib/preferences';
import { DisplayTransDialog } from './DisplayTransDialog';
import { netString } from './transSummary';
import type { FieldSpec, FormContext, TransSpec } from './types';
import type { MasterState } from './useMasterScreen';
import { VishayEntryDialog } from './VishayEntryDialog';

/** TranName "ReferenceT1" (FormName "Common"): the reference rows F1 shows for a field. */
export const REFERENCE_T1: TransSpec = {
  column: 'ReferenceT1',
  common: true,
  hidden: ['RefrenceTkm', 'Refplacekt', 'BookTKt'],
  editable: ['Subhead', 'Example', 'WordNm', 'Pgno'],
  lookups: {
    booktname: {
      setKt: 'BookTKt',
      setName: 'BookTName',
      clearOnCancel: true,
      alwaysNext: true,
      next: 'RefPlace',
    },
    refplace: { setKt: 'Refplacekt', setName: 'RefPlace', next: 'Pgno' },
  },
  template: ({ seq }) => [0, '', '', '', 0, '', 0, '', '', seq],
  firstColumn: 'Subhead',
  wrap: true,
};

type Popup =
  | {
      kind: 'trans';
      key: string;
      field: FieldSpec;
      table: TransTable;
      extra?: TransTable;
      extras?: TransTable[];
      defaults?: TransGrid['defaults'];
    }
  | { kind: 'help'; field: FieldSpec; table: TransTable }
  | { kind: 'vishay'; key: string; field: FieldSpec; table: TransTable };

/**
 * How much wider than the designer's panel the fields panel is shown (never narrower): the
 * designer places everything for a ~1000px form, and the web spreads it across the window.
 */
function useHorizontalScale(designWidth: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScale(Math.max(1, el.clientWidth / designWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [designWidth]);
  return { ref, scale };
}

/**
 * SplitContainer1.Panel1: the form's labels and text boxes, where the designer puts them —
 * stretched sideways to fill the window: every x position and box width scales with the
 * panel's width, while heights, rows and fonts stay as designed. F2
 * opens the box's list (Txt_KeyDown) or, on a "…Tran" box, its popup; F1 its reference rows;
 * Ctrl +/- changes the font size; the box with the focus turns WhiteSmoke (Txt_Enter/Leave).
 */
export function FormFields({
  state,
  ctx,
  openTransRef,
}: {
  state: MasterState;
  ctx: FormContext;
  /** Set to a function that opens a popup by its key, as F2 on its box does. */
  openTransRef?: React.RefObject<((key: string) => void) | null>;
}) {
  const { textBoxFont } = usePreferences();
  const auth = useAuth();
  const msg = useMessageBox();
  const [picking, setPicking] = useState<{
    field: FieldSpec;
    list: PickList | undefined;
    selectFirst: boolean;
    /** DisplayListForm's SearchText (FieldSpec.f2SearchText). */
    initialText?: string;
    /** AddMore: what the box held, and the names picked so far. */
    more?: { before: string; picks: string[]; tags: string[] };
  } | null>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [zoom, setZoom] = useState(0);
  /** chkShowPassword: toggles PasswordChar between '*' and none (it stays as left). */
  const [showPassword, setShowPassword] = useState(false);
  /** The record carries the password field: the server let this viewer read it. */
  const hasValue = (name: string) =>
    state.loaded !== null &&
    Object.keys(state.loaded).some((k) => k.toLowerCase() === name.toLowerCase());
  const spec = state.spec;
  const { ref: panelRef, scale } = useHorizontalScale(spec.panelWidth);
  const x = (v: number) => Math.round(v * scale);
  const isAdmin = auth.status === 'authenticated' && auth.user.isAdmin;
  const editableForUser = (f: FieldSpec) =>
    !f.editableFor || (auth.status === 'authenticated' && f.editableFor(auth.user));
  /** makeTextBoxesReadOnly: with lockPanel, every box is ReadOnly until New or Modify. */
  const panelReadOnly = Boolean(spec.lockPanel) && state.mode !== 'edit';
  /** FieldSpec.readOnlyWhen / disabledWhen: the box's state for the form as it is now. */
  const readOnlyNow = (f: FieldSpec) => Boolean(f.readOnly || f.readOnlyWhen?.(ctx));
  const disabledNow = (f: FieldSpec) =>
    Boolean(f.alwaysDisabled || (state.disabled[f.name] ?? false) || f.disabledWhen?.(ctx));

  async function openPickList(field: FieldSpec) {
    const more = field.addMore
      ? { before: state.fields[field.name] ?? '', picks: [], tags: [] }
      : undefined;
    const initialText = field.f2SearchText ? (state.fields[field.name] ?? '').trim() : undefined;
    setPicking({ field, list: undefined, selectFirst: true, initialText, more });
    try {
      setPicking({
        field,
        list: await state.fieldPickList(field.name, field.f2Params?.(ctx)),
        selectFirst: true,
        initialText,
        more,
      });
    } catch (err) {
      setPicking(null);
      await msg.alert(errorMessage(err));
    }
  }

  /** DisplayList with AddMore, once the list is cancelled: the picks joined by ",". */
  function finishAddMore(field: FieldSpec, more: { before: string; picks: string[] }) {
    const picks = more.picks.join(',');
    state.setField(
      field.name,
      field.addMore?.append && more.before !== '' ? `${more.before},${picks}` : picks,
    );
  }

  /** F2 on a "…Tran" box: its popup, with the rows the form keeps for this record. */
  async function openTrans(field: FieldSpec, key: string) {
    const t = spec.trans?.[key];
    if (!t) return;
    if (t.local) {
      setPopup({
        kind: 'trans',
        key,
        field,
        table: { columns: t.local.columns, rows: [t.local.toRow(state.fields)] },
      });
      return;
    }
    const loaded = await state.loadTrans(key);
    if (loaded)
      setPopup({
        kind: 'trans',
        key,
        field,
        table: loaded,
        extra: loaded.extra,
        extras: loaded.extras,
        defaults: loaded.defaults,
      });
  }

  useEffect(() => {
    if (!openTransRef) return;
    openTransRef.current = (key: string) => {
      const field = spec.fields.find((f) => f.trans === key);
      if (field) void openTrans(field, key);
    };
  });

  /** F2 on a box that opens frmVishayEntry (SetVishayEntry): the record's lines as kept. */
  async function openVishayEntry(field: FieldSpec, key: string) {
    const loaded = await state.loadTrans(key);
    if (loaded) setPopup({ kind: 'vishay', key, field, table: loaded });
  }

  /** F2 on txtKrutiTran: DisplayListForm over the popup's query, picks go into the box. */
  async function openTransList(field: FieldSpec, key: string) {
    setPicking({ field, list: undefined, selectFirst: false });
    const loaded = await state.loadTrans(key);
    if (!loaded) return setPicking(null);
    const columns = loaded.columns.map((c) => c.name);
    setPicking({
      field,
      selectFirst: false,
      list: { columns, rows: loaded.rows.map((r) => columns.map((c) => r[c] ?? null)) },
    });
  }

  /** F1: the field's reference rows (tblSearch HelpText), when it has any. */
  async function openHelp(field: FieldSpec) {
    try {
      const { grid } = await api.get<{ grid: TransGrid | null }>(
        `/master/${spec.screen}/help/${encodeURIComponent(field.name)}`,
      );
      if (grid) setPopup({ kind: 'help', field, table: grid });
    } catch (err) {
      await msg.alert(errorMessage(err));
    }
  }

  function onKeyDown(e: React.KeyboardEvent, f: FieldSpec) {
    // FieldSpec.onKey: the box's own KeyDown, for ordinary keys only.
    if (
      f.onKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'F1', 'F2'].includes(e.key) &&
      f.onKey(e.key, ctx)
    ) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Tab' && !e.shiftKey && f.onTab) {
      f.onTab(ctx);
    }
    if (e.key === 'Enter' && f.h) {
      // A multiline TextBox without AcceptsReturn: Enter does not add a line.
      e.preventDefault();
    }
    if (e.key === 'Enter' && f.enterOpensTrans && f.trans) {
      e.preventDefault();
      void openTrans(f, f.trans);
    }
    if (e.key === 'F2') {
      e.preventDefault();
      if (f.noF2) return;
      if (f.onF2) f.onF2(ctx);
      else if (f.vishayEntry) void openVishayEntry(f, f.vishayEntry);
      else if (f.trans) void openTrans(f, f.trans);
      else if (f.transList) void openTransList(f, f.transList);
      else if (!readOnlyNow(f) && !panelReadOnly) void openPickList(f);
    } else if (e.key === 'F1' && spec.help) {
      e.preventDefault();
      void openHelp(f);
    } else if (e.ctrlKey && (e.key === '+' || e.key === '=')) {
      e.preventDefault();
      setZoom((z) => z + 2);
    } else if (e.ctrlKey && (e.key === '-' || e.key === '_')) {
      e.preventDefault();
      setZoom((z) => Math.max(z - 2, 8 - textBoxFont.sizePt));
    }
  }

  const field = picking?.field;

  return (
    <div
      ref={panelRef}
      className="relative h-full overflow-auto bg-alice-blue"
      style={{ minWidth: spec.panelWidth }}
    >
      {(spec.labels ?? []).map((l) =>
        l.onClick ? (
          <button
            key={`${l.text}-${l.at.x}-${l.at.y}`}
            type="button"
            onClick={() => l.onClick?.(ctx)}
            className="absolute text-[#0000ff] underline"
            style={{
              ...(l.color?.(ctx) ? { color: l.color(ctx) } : {}),
              left: x(l.at.x),
              top: l.at.y,
              fontFamily: 'var(--font-field)',
              fontSize: Math.round(((l.sizePt ?? 14.25) * 4) / 3),
            }}
          >
            {l.text}
          </button>
        ) : (
          <span
            key={`${l.text}-${l.at.x}-${l.at.y}`}
            className="win-label absolute whitespace-nowrap"
            style={{
              left: x(l.at.x),
              top: l.at.y,
              ...(l.sizePt ? { fontSize: Math.round((l.sizePt * 4) / 3) } : {}),
            }}
          >
            {l.text}
          </span>
        ),
      )}
      {(spec.groups ?? []).map((g) => (
        <fieldset
          key={g.text}
          className="absolute border border-[#d5dfe5]"
          style={{
            left: x(g.at.x),
            top: g.at.y,
            width: x(g.at.x + g.at.w) - x(g.at.x),
            height: g.at.h,
          }}
        >
          <legend className="win-label ml-1 px-0.5">{g.text}</legend>
        </fieldset>
      ))}
      {spec.fields
        .filter((f) => !f.hidden && (!f.visibleWhen || f.visibleWhen(state.fields)))
        .map((f) => (
          <div key={f.name}>
            {f.label && f.labelAt && (
              <label
                htmlFor={`fld-${f.name}`}
                className="win-label absolute"
                style={{ left: x(f.labelAt.x), top: f.labelAt.y }}
              >
                {f.label}
              </label>
            )}
            {f.checkbox ? (
              <label
                className="absolute flex items-center gap-1 whitespace-nowrap"
                style={{
                  left: x(f.at.x),
                  top: f.at.y,
                  fontFamily: 'var(--font-field)',
                  fontSize: Math.round((14.25 * 4) / 3),
                }}
              >
                <input
                  id={`fld-${f.name}`}
                  type="checkbox"
                  aria-label={f.checkbox}
                  disabled={disabledNow(f) || !editableForUser(f)}
                  checked={state.fields[f.name] === 'True'}
                  onChange={(e) => {
                    const value = e.target.checked ? 'True' : 'False';
                    state.setField(f.name, value);
                    f.onUserChange?.(value, ctx);
                  }}
                />
                {f.checkbox}
              </label>
            ) : f.date ? (
              <input
                id={`fld-${f.name}`}
                type="date"
                aria-label={f.label ?? f.name}
                value={state.fields[f.name] || todayIso()}
                disabled={disabledNow(f) || !editableForUser(f) || panelReadOnly}
                // A DateTimePicker always holds a date: clearing it leaves the date it had.
                onChange={(e) => {
                  if (!e.target.value) return;
                  state.setField(f.name, e.target.value);
                  f.onUserChange?.(e.target.value, ctx);
                }}
                className="win-textbox absolute focus:bg-[#f5f5f5]"
                style={{
                  left: x(f.at.x),
                  top: f.at.y,
                  width: x(f.at.x + f.at.w) - x(f.at.x),
                  fontFamily: 'Microsoft Sans Serif, sans-serif',
                  fontSize: Math.round((9.75 * 4) / 3),
                }}
              />
            ) : f.options ? (
              <select
                id={`fld-${f.name}`}
                aria-label={f.label ?? f.name}
                value={state.fields[f.name] ?? ''}
                disabled={disabledNow(f) || !editableForUser(f) || panelReadOnly}
                onChange={(e) => {
                  state.setField(f.name, e.target.value);
                  f.onUserChange?.(e.target.value, ctx);
                }}
                className="win-textbox absolute focus:bg-[#f5f5f5]"
                style={{
                  left: x(f.at.x),
                  top: f.at.y,
                  width: x(f.at.x + f.at.w) - x(f.at.x),
                  fontFamily: 'Times New Roman',
                  fontSize: Math.round((14.25 * 4) / 3),
                }}
              >
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              (() => {
                const readOnly = readOnlyNow(f) || panelReadOnly;
                const common = {
                  id: `fld-${f.name}`,
                  'aria-label': f.label ?? f.name,
                  value: state.fields[f.name] ?? '',
                  disabled: disabledNow(f) || !editableForUser(f),
                  readOnly,
                  title: readOnly
                    ? undefined
                    : f.kt || f.trans || f.vishayEntry
                      ? 'F2 to choose'
                      : undefined,
                  ...(f.mask
                    ? { maxLength: f.mask.length, placeholder: f.mask.replace(/[09]/g, '_') }
                    : {}),
                  className: 'win-textbox absolute focus:bg-[#f5f5f5]',
                  style: {
                    left: x(f.at.x),
                    top: f.at.y,
                    width: x(f.at.x + f.at.w) - x(f.at.x),
                    ...(f.h ? { height: f.h } : {}),
                    ...fontCss(textBoxFont),
                    fontSize: `${Math.max(8, textBoxFont.sizePt + zoom) * 1.333}px`,
                  },
                  onKeyDown: (e: React.KeyboardEvent) => onKeyDown(e, f),
                  onBlur: () => {
                    const patch = spec.onFieldLeave?.(f.name, state.fields, state.tags);
                    if (patch) for (const [k, v] of Object.entries(patch)) state.setField(k, v);
                    if (!readOnly) f.onLeave?.(ctx);
                  },
                };
                if (f.password) {
                  const showable =
                    (state.mode === 'edit' && state.strMode === 'Add') || hasValue(f.name);
                  return (
                    <>
                      <input
                        {...common}
                        type={showPassword && showable ? 'text' : 'password'}
                        autoComplete="new-password"
                        onChange={(e) => !readOnly && state.setField(f.name, e.target.value)}
                      />
                      {showable && (
                        <input
                          type="checkbox"
                          aria-label="Show Password"
                          checked={showPassword}
                          onChange={(e) => setShowPassword(e.target.checked)}
                          className="absolute"
                          style={{ left: x(f.password.showAt.x), top: f.password.showAt.y }}
                        />
                      )}
                    </>
                  );
                }
                return f.h ? (
                  <textarea
                    {...common}
                    onChange={(e) => !readOnly && state.setField(f.name, e.target.value)}
                    className={`${common.className} resize-none`}
                  />
                ) : (
                  <input
                    {...common}
                    onChange={(e) => !readOnly && state.setField(f.name, e.target.value)}
                    onBeforeInput={(e) => {
                      // txtrecordno_KeyPress / txtReportNo_KeyPress: Validnumber lets digits (and the
                      // decimal, group and negative signs) through.
                      const data = (e.nativeEvent as InputEvent).data;
                      if (f.numeric && data && !/^[\d.,-]+$/.test(data)) e.preventDefault();
                      // A MaskedTextBox takes digits (and its own literals) only.
                      if (f.mask && data && !/^[\d:/.\- ]+$/.test(data)) e.preventDefault();
                    }}
                  />
                );
              })()
            )}
          </div>
        ))}

      {picking && field && (
        <PickListDialog
          title={field.label ?? field.name}
          list={picking.list}
          selectFirst={picking.selectFirst}
          {...(picking.initialText ? { initialText: picking.initialText } : {})}
          onCancel={() => {
            if (picking.more) finishAddMore(field, picking.more);
            setPicking(null);
          }}
          onPick={(r) => {
            if (picking.more) {
              // AddMore: keep the pick and open the list again.
              const more = {
                ...picking.more,
                picks: [...picking.more.picks, r.name || (r.code[0] ?? '')],
                tags: [...picking.more.tags, r.code[0] ?? ''],
              };
              setPicking({ ...picking, more });
              return;
            }
            if (field.transList) {
              const text = r.rows
                .map((row) => netString(row[row.length > 1 ? 1 : 0] ?? null))
                .join(',');
              state.setField(field.name, text);
            } else {
              state.setField(field.name, r.name || (r.code[0] ?? ''));
              if (field.kt) state.setTag(field.name, Number(r.code[0]) || 0);
              field.afterPick?.({ name: r.name, code: r.code[0] ?? '', row: r.rows[0] }, ctx);
            }
            setPicking(null);
          }}
        />
      )}

      {popup?.kind === 'trans' &&
        (() => {
          const t = spec.trans![popup.key]!;
          return (
            <DisplayTransDialog
              screen={spec.screen}
              spec={t}
              table={popup.table}
              extra={popup.extra}
              extras={popup.extras}
              defaults={popup.defaults}
              viewOnly={panelReadOnly}
              tranType={t.tranType ? (state.fields[t.tranType] ?? '').trim() : undefined}
              onClose={() => setPopup(null)}
              onSave={(
                rows: ChildRow[],
                extra?: TransTable,
                extras?: TransTable[],
                info?: { pariCount: number },
              ) => {
                if (t.local) {
                  for (const [k, v] of Object.entries(t.local.fromRow(rows[0] ?? {})))
                    state.setField(k, v);
                } else {
                  state.saveTrans(popup.key, popup.field.name, rows, extra, extras);
                }
                setPopup(null);
                void t.onSaved?.(
                  { pariCount: info?.pariCount ?? 0, rows, before: popup.table.rows },
                  ctx,
                );
              }}
            />
          );
        })()}

      {popup?.kind === 'vishay' && (
        <VishayEntryDialog
          screen={spec.screen}
          column={spec.trans![popup.key]!.column}
          recordKt={state.strMode === 'Add' ? 0 : state.tranKm}
          columns={popup.table.columns.map((c) => c.name)}
          rows={popup.table.rows}
          onClose={() => setPopup(null)}
          onSave={(rows, code) => {
            // The lines replace the record's own; the box takes frm1.txtCode.Text.Trim.
            state.saveTrans(popup.key, popup.field.name, rows, undefined, undefined, {
              keepText: true,
            });
            state.setField(popup.field.name, code.trim());
            setPopup(null);
          }}
        />
      )}

      {popup?.kind === 'help' && (
        <DisplayTransDialog
          screen={spec.screen}
          spec={REFERENCE_T1}
          table={popup.table}
          onClose={() => setPopup(null)}
          onSave={(rows) => {
            setPopup(null);
            // SaveReference runs only for an admin; for anyone else Save just closes.
            if (!isAdmin) return;
            void api
              .post(`/master/${spec.screen}/help/${encodeURIComponent(popup.field.name)}`, { rows })
              .catch((err: unknown) => msg.alert(errorMessage(err)));
          }}
        />
      )}
    </div>
  );
}

'use client';

import type { ChildRow, GridValue, PickList } from '@gglib/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';
import { useMessageBox } from '@/components/ui/MessageBox';
import { Modal, ToolButton, ToolSeparator } from '@/components/ui/Modal';
import { PickListDialog } from '@/components/ui/PickListDialog';
import { api, errorMessage } from '@/lib/api';
import { fontCss, ptToPx, usePreferences } from '@/lib/preferences';
import { netString } from './transSummary';

/** One line of the grid (dgaddVishay1): the Vishay, Vachan and Vibhakti with their keys. */
type Line = {
  Id: number;
  Vishay: string;
  Vachan: string;
  Vibhakti: string;
  Seq: number;
  VishayKt: number;
  VachanKt: number;
  VibhaktiKt: number;
  AnyaNameKt: number;
};

/** The search box and list over one cell (txtsearchVs / Vc / Vb with dgListVs / Vc / Vb). */
type Search = { row: number; col: 1 | 2 | 3; text: string; active: number };

const blank = (): Line => ({
  Id: 0,
  Vishay: '',
  Vachan: '',
  Vibhakti: '',
  Seq: 0,
  VishayKt: 0,
  VachanKt: 0,
  VibhaktiKt: 0,
  AnyaNameKt: 0,
});

const num = (v: GridValue | undefined) => Number(v) || 0;
const get = (row: ChildRow, name: string): GridValue | undefined => {
  if (name in row) return row[name];
  const key = Object.keys(row).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : row[key];
};

/**
 * frmVishayEntry: the Vishay / Vachan / Vibhakti lines of one record (a Book Subject row, a
 * Vishesh row's detail). F2 or a double click on a cell opens its search list in place; Insert
 * adds a line below and walks Vishay → Vachan → Vibhakti → the next line, Ctrl+Insert adds one
 * above; Delete removes a line. Ctrl+S keeps the lines, Alt+S (or F7) keeps them and closes.
 * The Code box shows the lines as the caller's cell will read them.
 */
export function VishayEntryDialog({
  screen,
  column,
  recordKt,
  columns,
  rows,
  onSave,
  onClose,
}: {
  screen: string;
  /** The popup's tblSearch column, whose server lookups serve the lists. */
  column: string;
  recordKt: GridValue;
  /** The caller's table columns, so the rows go back in its shape. */
  columns: string[];
  rows: ChildRow[];
  onSave: (rows: ChildRow[], code: string) => void;
  onClose: () => void;
}) {
  const msg = useMessageBox();
  const { gridFont } = usePreferences();
  const [lines, setLines] = useState<Line[]>(() => {
    const start = rows.map((r) => ({
      Id: num(get(r, 'Id')),
      Vishay: netString(get(r, 'Vishay') ?? null),
      Vachan: netString(get(r, 'Vachan') ?? null),
      Vibhakti: netString(get(r, 'Vibhakti') ?? null),
      Seq: num(get(r, 'Seq')),
      VishayKt: num(get(r, 'VishayKt')),
      VachanKt: num(get(r, 'VachanKt')),
      VibhaktiKt: num(get(r, 'VibhaktiKt')),
      AnyaNameKt: num(get(r, 'AnyaNameKt')),
    }));
    return start.length === 0 ? [blank()] : start;
  });
  const [cur, setCur] = useState({ row: 0, col: 1 });
  /** lblMode: "Insert" walks the line; "Edit" fills one cell. */
  const [mode, setMode] = useState<'' | 'Insert' | 'Edit'>('');
  /** vcontnueLine: after Vibhakti, go on to a new line. */
  const continueLine = useRef(false);
  const [changed, setChanged] = useState(false);
  const [search, setSearch] = useState<Search | null>(null);
  const [vishayList, setVishayList] = useState<PickList>({ columns: [], rows: [] });
  const [vachan, setVachan] = useState<PickList>({ columns: [], rows: [] });
  const [vibhakti, setVibhakti] = useState<PickList>({ columns: [], rows: [] });
  const [anya, setAnya] = useState<{ list: PickList; pick: GridValue[]; row: number } | null>(null);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const lookup = (name: string, row: Record<string, GridValue>) =>
    api.post<PickList>(`/master/${screen}/trans/${column}/lookup/${name}`, { row });

  // Form_Load: CreateVachanList, CreateVibhaktiList (the Vishay list is searched as you type).
  useEffect(() => {
    void Promise.all([lookup('ve-vachan', {}), lookup('ve-vibhakti', {})])
      .then(([vc, vb]) => {
        setVachan(vc);
        setVibhakti(vb);
      })
      .catch((err: unknown) => msg.alert(errorMessage(err)));
    gridRef.current?.focus();
  }, []);

  /** RefreshTextbox: every line as Vishay + Vachan + Vibhakti, each followed by a space. */
  const code = useMemo(
    () => lines.map((l) => `${l.Vishay}${l.Vachan}${l.Vibhakti} `).join(''),
    [lines],
  );

  /** CreateVishayList: the first 50 Vishay matching the search, in the desktop's search syntax. */
  useEffect(() => {
    if (search?.col !== 1) return;
    let cancelled = false;
    void lookup('ve-vishay', { search: search.text })
      .then((l) => {
        if (!cancelled) setVishayList(l);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [search?.col, search?.text]);

  /** txtsearchVc/Vb_TextChanged: names starting with the text, by id; none left keeps the last. */
  const listFor = (col: 1 | 2 | 3, text: string): GridValue[][] => {
    if (col === 1) return vishayList.rows.map((r) => [r[1] ?? null, r[0] ?? null]);
    const source = (col === 2 ? vachan : vibhakti).rows.map((r) => [r[1] ?? null, r[0] ?? null]);
    const hit = source.filter((r) => netString(r[0]).startsWith(text));
    return (hit.length > 0 ? hit : source).sort((a, b) => num(a[1]) - num(b[1]));
  };
  const listRows = search ? listFor(search.col, search.text) : [];

  function setLine(index: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function open(col: 1 | 2 | 3, row: number) {
    setCur({ row, col });
    setSearch({ row, col, text: '', active: 0 });
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  function closeSearch() {
    setSearch(null);
    setTimeout(() => gridRef.current?.focus(), 0);
  }

  /** addbelow / CompleteLine: a blank line after the current one, and its Vishay search. */
  function addBelow(after: number) {
    continueLine.current = true;
    setChanged(true);
    setLines((ls) => {
      const next = [...ls];
      const at = ls.length === 0 ? 0 : after + 1;
      next.splice(at, 0, blank());
      setTimeout(() => open(1, at), 0);
      return next;
    });
  }

  /** cmdinsetraboveClick: a blank line before the current one. */
  function addAbove(before: number) {
    continueLine.current = true;
    setChanged(true);
    setLines((ls) => {
      const next = [...ls];
      next.splice(before, 0, blank());
      setTimeout(() => open(1, before), 0);
      return next;
    });
  }

  /** removeblankRow: Esc out of a new line's Vishay search drops the line. */
  function removeBlankLine(index: number) {
    setLines((ls) => {
      const l = ls[index];
      if (!l || l.Id !== 0 || l.Vishay.trim() !== '') return ls;
      const next = ls.filter((_, i) => i !== index);
      return next.length === 0 ? [blank()] : next;
    });
  }

  /** SUBFILvishay: a Vishay with other names asks which one the line shows. */
  async function pickVishay(row: number, picked: GridValue[]) {
    const vishayKt = num(picked[1]);
    try {
      const names = await lookup('ve-anyaname', { VishayKt: vishayKt });
      if (names.rows.length > 0) {
        setAnya({ list: names, pick: picked, row });
        return;
      }
    } catch (err) {
      await msg.alert(errorMessage(err));
    }
    finishVishay(row, netString(picked[0] ?? null), vishayKt, 0);
  }

  /** SUBFILvishay's end: the line takes the name (or the chosen other name). */
  function finishVishay(row: number, name: string, vishayKt: number, anyaKt: number) {
    setLine(row, { Vishay: name, VishayKt: vishayKt, AnyaNameKt: anyaKt });
    setChanged(true);
    if (mode === 'Insert') open(2, row);
    else {
      setCur({ row, col: 1 });
      closeSearch();
    }
  }

  function pickVachan(row: number, picked: GridValue[]) {
    setLine(row, { Vachan: netString(picked[0] ?? null), VachanKt: num(picked[1]) });
    setChanged(true);
    if (mode === 'Insert') open(3, row);
    else {
      setCur({ row, col: 2 });
      closeSearch();
    }
  }

  function pickVibhakti(row: number, picked: GridValue[]) {
    setLine(row, { Vibhakti: netString(picked[0] ?? null), VibhaktiKt: num(picked[1]) });
    setChanged(true);
    if (mode === 'Insert') {
      if (continueLine.current || row >= lines.length - 1) addBelow(row);
      else open(1, row + 1);
    } else {
      setCur({ row, col: 3 });
      closeSearch();
    }
  }

  function choose(index: number) {
    if (!search) return;
    const picked = listRows[index];
    if (!picked) return;
    if (search.col === 1) void pickVishay(search.row, picked);
    else if (search.col === 2) pickVachan(search.row, picked);
    else pickVibhakti(search.row, picked);
  }

  /**
   * Save(False) (Ctrl+S, F6, the Save button): the lines are kept and, as AddBlankDataRow does,
   * a blank one is added — but the caller only takes them on Save & Exit.
   */
  function keep() {
    setLines((ls) => [...ls, blank()]);
  }

  /** Save(True): the lines renumbered, plus the blank line AddBlankDataRow always adds. */
  function result(): ChildRow[] {
    const out = [...lines.map((l, i) => ({ ...l, Seq: i + 1 })), blank()];
    return out.map((l) => {
      const row: ChildRow = {};
      const values: Record<string, GridValue> = { ...l, RecordKt: recordKt };
      for (const c of columns.length ? columns : Object.keys(values)) {
        const key = Object.keys(values).find((k) => k.toLowerCase() === c.toLowerCase());
        row[c] = key ? (values[key] ?? null) : null;
      }
      return row;
    });
  }

  async function exit() {
    if (changed && !(await msg.confirm('Exit Now', 'Close'))) return;
    onClose();
  }

  function onGridKeyDown(e: React.KeyboardEvent) {
    const key = e.key;
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (key === 'Delete') {
      handled();
      setChanged(true);
      setLines((ls) => {
        const next = ls.filter((_, i) => i !== cur.row);
        return next.length === 0 ? [blank()] : next;
      });
      setCur((c) => ({ ...c, row: Math.max(0, Math.min(c.row, lines.length - 2)) }));
    } else if (key === 'F2') {
      handled();
      setMode('Edit');
      continueLine.current = false;
      open(cur.col as 1 | 2 | 3, cur.row);
    } else if (key === 'Insert' && e.ctrlKey) {
      handled();
      setMode('Insert');
      addAbove(cur.row);
    } else if (key === 'Insert') {
      handled();
      setMode('Insert');
      addBelow(cur.row);
    } else if (key === 'Enter') {
      handled();
      if (cur.col < 3) setCur((c) => ({ ...c, col: c.col + 1 }));
    } else if ((e.ctrlKey && key.toLowerCase() === 's') || key === 'F6') {
      handled();
      keep();
    } else if ((e.altKey && key.toLowerCase() === 's') || key === 'F7') {
      handled();
      onSave(result(), code);
    } else if (key === 'Escape') {
      handled();
      setMode('');
      void exit();
    } else if (key === 'ArrowDown') {
      handled();
      setCur((c) => ({ ...c, row: Math.min(lines.length - 1, c.row + 1) }));
    } else if (key === 'ArrowUp') {
      handled();
      setCur((c) => ({ ...c, row: Math.max(0, c.row - 1) }));
    } else if (key === 'ArrowRight' || key === 'Tab') {
      handled();
      setCur((c) => ({ ...c, col: Math.min(3, c.col + 1) }));
    } else if (key === 'ArrowLeft') {
      handled();
      setCur((c) => ({ ...c, col: Math.max(1, c.col - 1) }));
    }
  }

  function onSearchKeyDown(e: React.KeyboardEvent) {
    if (!search) return;
    const key = e.key;
    if (key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      const row = search.row;
      const col = search.col;
      setMode('');
      closeSearch();
      if (col === 1) removeBlankLine(row);
    } else if (key === 'ArrowDown') {
      e.preventDefault();
      setSearch({ ...search, active: Math.min(listRows.length - 1, search.active + 1) });
    } else if (key === 'ArrowUp') {
      e.preventDefault();
      setSearch({ ...search, active: Math.max(0, search.active - 1) });
    } else if (key === 'ArrowLeft') {
      e.preventDefault();
      setSearch({ ...search, text: '', active: 0 });
    } else if (key === 'Enter') {
      e.preventDefault();
      if (listRows.length > 0) choose(search.active);
    } else if (key === "'" || key === '[' || key === ']') {
      // txtsearchVs_KeyPress: these would break the desktop's SQL.
      e.preventDefault();
    }
  }

  const cellFont = { ...fontCss(gridFont), fontSize: ptToPx(gridFont.sizePt) };
  const rowHeight = Math.round(gridFont.sizePt * 2);
  const widths = [325, 75, 75];
  const menu: ContextMenuItem[] = [
    'Cut Row',
    'Paste Row',
    'Show Granth/Code',
    'Add/Edit Vishesh/Detail',
    'Copy Records',
    'Paste Records',
  ].map((label) => ({ kind: 'item', label, onSelect: () => undefined }));

  return (
    <Modal
      title="Vishay Entry"
      maximized
      onClose={() => void exit()}
      className="flex flex-col bg-control"
    >
      <div role="toolbar" aria-label="Vishay Entry" className="win-toolstrip">
        <ToolButton icon="save" label="Save" onClick={keep} />
        <ToolSeparator />
        <ToolButton icon="save" label="Save & Exit" onClick={() => onSave(result(), code)} />
        <ToolSeparator />
        <ToolButton icon="exit" label="Close" onClick={() => void exit()} />
      </div>
      <div className="relative flex min-h-0 flex-1 gap-2 p-1">
        <div
          ref={gridRef}
          tabIndex={0}
          role="grid"
          aria-label="Vishay lines"
          onKeyDown={onGridKeyDown}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenuAt({ x: e.clientX, y: e.clientY });
          }}
          className="relative min-h-0 w-[511px] shrink-0 overflow-auto border border-control-dark bg-white outline-none"
        >
          <table
            className="border-collapse"
            style={{ tableLayout: 'fixed', width: widths.reduce((a, b) => a + b, 0) }}
          >
            <colgroup>
              {widths.map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr>
                {['Vishay', 'Vachan', 'Vibhakti'].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="border border-control-dark bg-light-steel-blue px-1 text-left font-normal text-[#404040]"
                    style={{ height: 25 }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, r) => (
                <tr key={r} style={{ height: rowHeight }}>
                  {([1, 2, 3] as const).map((c) => {
                    const value = c === 1 ? l.Vishay : c === 2 ? l.Vachan : l.Vibhakti;
                    const current = cur.row === r && cur.col === c;
                    return (
                      <td
                        key={c}
                        role="gridcell"
                        aria-selected={current}
                        onMouseDown={() => setCur({ row: r, col: c })}
                        onDoubleClick={() => {
                          continueLine.current = false;
                          open(c, r);
                        }}
                        className={`truncate border border-light-steel-blue px-1 ${current ? 'bg-selection text-white' : ''}`}
                        style={cellFont}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {search && (
            <div
              className="absolute z-20"
              style={{
                left: widths.slice(0, search.col - 1).reduce((a, b) => a + b, 0),
                top: 25 + search.row * rowHeight,
                width: widths[search.col - 1],
              }}
            >
              <input
                ref={searchRef}
                aria-label="Search"
                value={search.text}
                onChange={(e) => setSearch({ ...search, text: e.target.value, active: 0 })}
                onKeyDown={onSearchKeyDown}
                className="win-textbox w-full"
                style={{
                  fontFamily: "'Arial Unicode MS', var(--font-field)",
                  fontSize: 16,
                  height: 29,
                }}
              />
              <div
                role="listbox"
                aria-label="Choices"
                className="max-h-[178px] overflow-auto border border-control-dark bg-white"
                style={{ width: search.col === 1 ? 450 : widths[search.col - 1] }}
              >
                {listRows.map((r, i) => (
                  <div
                    key={i}
                    role="option"
                    aria-selected={i === search.active}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(i);
                    }}
                    className={`truncate px-1 ${i === search.active ? 'bg-selection text-white' : ''}`}
                    style={cellFont}
                  >
                    {netString(r[0] ?? null)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <fieldset className="flex min-h-0 flex-1 flex-col border border-control-dark px-1 pb-1">
          <legend style={{ fontFamily: "'Arial Unicode MS', var(--font-ui)", fontSize: 16 }}>
            Code
          </legend>
          <textarea
            aria-label="Code"
            value={code}
            readOnly
            className="win-textbox h-full w-full resize-none"
            style={{ fontFamily: "'Microsoft Sans Serif', var(--font-ui)", fontSize: 24 }}
          />
        </fieldset>
      </div>
      {menuAt && (
        <ContextMenu items={menu} at={menuAt} label="Lines" onClose={() => setMenuAt(null)} />
      )}
      {anya && (
        <PickListDialog
          title="Anya Name"
          list={anya.list}
          selectFirst
          onCancel={() => {
            const a = anya;
            setAnya(null);
            finishVishay(a.row, netString(a.pick[0] ?? null), num(a.pick[1]), 0);
          }}
          onPick={(r) => {
            const a = anya;
            setAnya(null);
            const kt = Number(r.code[0]) || 0;
            finishVishay(a.row, kt > 0 ? r.name : netString(a.pick[0] ?? null), num(a.pick[1]), kt);
          }}
        />
      )}
    </Modal>
  );
}

'use client';

import type { PickList } from '@gglib/shared';
import { useRef, useState } from 'react';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';
import { InputBox } from '@/components/ui/InputBox';
import { useMessageBox } from '@/components/ui/MessageBox';
import { PickListDialog } from '@/components/ui/PickListDialog';
import { SuggestComboBox } from '@/components/ui/SuggestComboBox';
import type { ScreenActions } from './types';
import type { MasterState } from './useMasterScreen';

type Picker =
  | { kind: 'columns'; list: PickList }
  | { kind: 'values'; list: PickList | undefined; columnId: number; scope: 'grid' | 'all' };

/**
 * UcSearch: "Search By" and the search box. Typing filters the rows on screen; F2 and F3 list
 * the column's values and search the database; the right-click menu adds Search In Range,
 * Search For Blank / Not In Blank, and Search With (In / Not In).
 */
export function SearchBar({ state, actions }: { state: MasterState; actions?: ScreenActions }) {
  const msg = useMessageBox();
  const [picker, setPicker] = useState<Picker | null>(null);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [prompt, setPrompt] = useState<{
    text: string;
    value: string;
    error?: string;
    onOk: (v: string) => void;
  } | null>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const column = state.column(state.searchBy);

  async function openValues(scope: 'grid' | 'all') {
    if (!column?.searchOnF2) return;
    setPicker({ kind: 'values', list: undefined, columnId: column.id, scope });
    try {
      const list = await state.searchValues(column.id, scope);
      setPicker({ kind: 'values', list, columnId: column.id, scope });
    } catch {
      setPicker(null);
    }
  }

  function onTextKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'F2' || e.key === 'F3') {
      e.preventDefault();
      if (!column) return;
      // ScreenSpec.searchF2: the form's own F2 for this column.
      const own = state.spec.searchF2?.[column.displayName.toLowerCase()];
      if (own && actions) {
        if (e.key === 'F2') void own(actions);
        return;
      }
      if (column.searchOnF2) void openValues(e.key === 'F2' ? 'grid' : 'all');
      else if (state.searchText.trim() !== '')
        void state.runSearch(column.id, 'all', [], state.searchText);
    }
  }

  async function needColumn() {
    if (column) return true;
    await msg.alert('Please choose a column in Search By first.');
    return false;
  }

  /** Search In Range: numbers "1-10", or dates dd/MM/yyyy. */
  async function searchInRange() {
    if (!(await needColumn())) return;
    const isDate = ['date', 'datetime'].includes(column!.dataType.toLowerCase());
    const today = new Date();
    const fmt = (d: Date) =>
      `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const lastMonth = new Date(today);
    lastMonth.setMonth(today.getMonth() - 1);
    setPrompt({
      text: isDate
        ? 'Please Enter Range in dd/MM/yyyy Format(Ex.:- (01/12/2015-31/12/2015)'
        : 'Please Enter Range(Ex.:- 1-10)',
      value: isDate ? `${fmt(lastMonth)}-${fmt(today)}` : '',
      onOk: (value) => {
        // UcSearch.SearchInRangeToolStripMenuItem_Click: an empty answer is a cancel; otherwise
        // the text must split on '-' into exactly two parts ("1-10", "01/12/2015-31/12/2015").
        if (value === '') {
          setPrompt(null);
          return;
        }
        const parts = value.split('-');
        const [from, to] = parts.length === 2 ? [parts[0]!.trim(), parts[1]!.trim()] : ['', ''];
        if (!from || !to) {
          void msg.alert(
            isDate
              ? 'Please Enter Proper Value in dd/MM/yyyy Format(Ex.:- (01/12/2015-31/12/2015)'
              : 'Please Enter Proper Value (Ex.:- 1-10)',
          );
          return;
        }
        setPrompt(null);
        void state.searchRange(column!.id, from, to);
      },
    });
  }

  async function searchBlank(blank: boolean) {
    if (!(await needColumn())) return;
    const withinGrid = await msg.confirm('Do You Want to Search Within Grid?');
    await state.searchBlank(column!.id, blank, withinGrid);
  }

  // UcSearch.cntMenu_Opening: Search In Range only for an int, date or datetime column.
  const rangeable = ['int', 'date', 'datetime'].includes(column?.dataType.toLowerCase() ?? '');
  const menuItems: ContextMenuItem[] = [
    ...(rangeable
      ? [{ kind: 'item', label: 'Search In Range', onSelect: () => void searchInRange() } as const]
      : []),
    { kind: 'item', label: 'Search For Blank', onSelect: () => void searchBlank(true) },
    { kind: 'item', label: 'Search For Not In Blank', onSelect: () => void searchBlank(false) },
    {
      kind: 'submenu',
      label: 'Search With',
      items: [
        {
          kind: 'item',
          label: state.searchIn ? '• In' : 'In',
          onSelect: () => state.setSearchIn(true),
        },
        {
          kind: 'item',
          label: state.searchIn ? 'Not In' : '• Not In',
          onSelect: () => state.setSearchIn(false),
        },
      ],
    },
  ];

  return (
    <>
      <div
        className="flex h-[30px] shrink-0 items-center gap-0 px-0"
        style={{ background: "url('/legacy/toolstrip-bg.jpg') center / 100% 100% no-repeat" }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuAt({ x: e.clientX, y: e.clientY });
        }}
      >
        <SuggestComboBox
          label="Search By"
          items={[
            { value: '', label: '' },
            ...(state.meta?.searchColumns ?? []).map((c) => ({
              value: String(c.id),
              label: c.displayName,
            })),
          ]}
          value={state.searchBy}
          onChange={state.setSearchBy}
          onKeyDown={(e) => {
            if (e.key !== 'F2') return;
            e.preventDefault();
            setPicker({
              kind: 'columns',
              list: {
                columns: ['Id', 'DisplayName'],
                rows: (state.meta?.searchColumns ?? []).map((c) => [c.id, c.displayName]),
              },
            });
          }}
          width={151}
          height={29}
          style={{ fontFamily: 'var(--font-grid-header)', fontSize: 16 }}
        />
        <input
          ref={textRef}
          aria-label="Search"
          value={state.searchText}
          onChange={(e) => state.setSearchText(e.target.value)}
          onKeyDown={onTextKeyDown}
          className="h-[30px] w-[295px] border border-[#7a7a7a] bg-white px-1 outline-none"
          style={{ fontFamily: 'var(--font-grid-header)', fontSize: 17 }}
        />
        {!state.searchIn && <span className="px-2">Not In</span>}
        <div className="ml-auto flex items-center gap-2 pr-2">
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12 }}>Total Records</span>
          <span
            aria-label="Total Records"
            className="h-[23px] w-[68px] border border-[#7a7a7a] bg-white px-1"
            style={{ fontFamily: 'var(--font-ui)', fontSize: 12, lineHeight: '21px' }}
          >
            {state.visibleRows.length}
          </span>
        </div>
      </div>

      {menuAt && (
        <ContextMenu items={menuItems} at={menuAt} label="Search" onClose={() => setMenuAt(null)} />
      )}
      {prompt && (
        <InputBox
          prompt={prompt.text}
          defaultValue={prompt.value}
          onOk={prompt.onOk}
          onCancel={() => setPrompt(null)}
        />
      )}
      {picker?.kind === 'columns' && (
        <PickListDialog
          title="Search By"
          list={picker.list}
          selectFirst
          addBlankRow={false}
          onCancel={() => setPicker(null)}
          onPick={(r) => {
            setPicker(null);
            state.setSearchBy(r.code[0] ?? '');
            textRef.current?.focus();
          }}
        />
      )}
      {picker?.kind === 'values' && (
        <PickListDialog
          title={column?.displayName ?? 'Value'}
          list={picker.list}
          addBlankRow={false}
          onCancel={() => setPicker(null)}
          onPick={(r) => {
            const { columnId, scope } = picker;
            setPicker(null);
            void state.runSearch(columnId, scope, r.code, '');
          }}
        />
      )}
    </>
  );
}

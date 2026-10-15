'use client';

import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';

export type ComboItem = { value: string; label: string };

/**
 * WinForms ComboBox, DropDownStyle DropDown with AutoCompleteMode SuggestAppend and
 * AutoCompleteSource ListItems (UcSearch.cmbSearchBy):
 * - typing at the end appends the rest of the first item that starts with the text (selected,
 *   so the next key replaces it) and lists every item that starts with it;
 * - Up / Down move through that list (the box shows the highlighted item), Enter takes it,
 *   Esc closes it;
 * - with no list open, Up / Down step to the previous / next item, and Alt+Down, F4 or the
 *   arrow button drop the whole list down;
 * - leaving the box (or Enter) selects the item whose text matches, ignoring case; text that
 *   matches no item clears the selection.
 */
export function SuggestComboBox({
  label,
  items,
  value,
  onChange,
  onKeyDown,
  inputRef,
  width,
  height,
  style,
}: {
  label: string;
  items: ComboItem[];
  value: string;
  onChange: (value: string) => void;
  /** Runs first; call preventDefault() to stop the combo's own handling. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  width: number;
  height: number;
  style?: CSSProperties;
}) {
  const selectedLabel = items.find((i) => i.value === value)?.label ?? '';
  const [text, setText] = useState(selectedLabel);
  /** The open list: the suggestions for the typed text, or the whole list (dropped down). */
  const [list, setList] = useState<{ items: ComboItem[]; active: number; typed: string } | null>(
    null,
  );
  const ownRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null);

  // A selection made elsewhere (Ctrl+F / F2 lists, history) shows in the box.
  useEffect(() => setText(selectedLabel), [selectedLabel]);

  useLayoutEffect(() => {
    const sel = pendingSelection.current;
    if (sel && ownRef.current) ownRef.current.setSelectionRange(sel[0], sel[1]);
    pendingSelection.current = null;
  });

  useEffect(() => {
    if (!list) return;
    listRef.current?.children[list.active]?.scrollIntoView({ block: 'nearest' });
  }, [list]);

  const real = items.filter((i) => i.label !== '');
  const startsWith = (typed: string) =>
    real.filter((i) => i.label.toLowerCase().startsWith(typed.toLowerCase()));

  function commit(t: string) {
    setList(null);
    const match = items.find((i) => i.label.toLowerCase() === t.trim().toLowerCase());
    const next = t.trim() === '' || !match ? '' : match.value;
    setText(match && t.trim() !== '' ? match.label : '');
    if (next !== value) onChange(next);
  }

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const typed = e.target.value;
    const inputType = (e.nativeEvent as InputEvent).inputType ?? '';
    const atEnd = e.target.selectionStart === typed.length;
    const matches = typed === '' ? [] : startsWith(typed);
    setList(matches.length ? { items: matches, active: -1, typed } : null);
    if (inputType.startsWith('insert') && atEnd && matches.length) {
      const full = typed + matches[0]!.label.slice(typed.length);
      pendingSelection.current = [typed.length, full.length];
      setText(full);
    } else setText(typed);
  }

  function step(delta: number) {
    const at = real.findIndex((i) => i.label.toLowerCase() === text.trim().toLowerCase());
    const next = real[Math.min(Math.max(at + delta, 0), real.length - 1)];
    if (!next) return;
    setText(next.label);
    pendingSelection.current = [0, next.label.length];
    if (next.value !== value) onChange(next.value);
  }

  function dropDown() {
    const at = items.findIndex((i) => i.value === value);
    setList({ items, active: Math.max(at, 0), typed: text });
  }

  function keyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (list) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const active = Math.min(
          Math.max(list.active + (e.key === 'ArrowDown' ? 1 : -1), 0),
          list.items.length - 1,
        );
        setList({ ...list, active });
        setText(list.items[active]!.label);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        commit(text);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setList(null);
      }
      return;
    }
    if ((e.altKey && e.key === 'ArrowDown') || e.key === 'F4') {
      e.preventDefault();
      dropDown();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      step(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter') {
      commit(text);
    }
  }

  return (
    <div
      className="relative flex shrink-0 border border-[#7a7a7a] bg-white"
      style={{ width, height }}
    >
      <input
        ref={(el) => {
          ownRef.current = el;
          if (typeof inputRef === 'function') inputRef(el);
          else if (inputRef) (inputRef as React.RefObject<HTMLInputElement | null>).current = el;
        }}
        role="combobox"
        aria-label={label}
        aria-expanded={list !== null}
        aria-autocomplete="both"
        autoComplete="off"
        spellCheck={false}
        value={text}
        onChange={onInput}
        onKeyDown={keyDown}
        onBlur={() => commit(text)}
        className="min-w-0 flex-1 bg-white px-0.5 outline-none"
        style={style}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={`${label} drop-down`}
        onMouseDown={(e) => {
          e.preventDefault();
          ownRef.current?.focus();
          if (list) setList(null);
          else dropDown();
        }}
        className="flex w-[17px] shrink-0 items-center justify-center border-l border-[#dcdcdc] bg-[#f0f0f0] hover:bg-[#e5f1fb]"
      >
        <svg width="7" height="4" viewBox="0 0 7 4" aria-hidden>
          <path d="M0 0h7L3.5 4z" fill="#000" />
        </svg>
      </button>
      {list && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label={`${label} list`}
          className="absolute top-full left-[-1px] z-50 max-h-[240px] overflow-y-auto border border-black bg-white"
          style={{ ...style, minWidth: width }}
        >
          {list.items.map((item, i) => (
            <li
              key={item.value || '(blank)'}
              role="option"
              aria-selected={i === list.active}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(item.label);
              }}
              onMouseEnter={() => setList({ ...list, active: i })}
              className={`cursor-default px-0.5 whitespace-nowrap ${
                i === list.active ? 'bg-highlight text-white' : ''
              }`}
              style={{ minHeight: '1.2em' }}
            >
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

'use client';

import type { LookupOption } from '@gglib/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from './Modal';

type Props = {
  /** Shown as the list's column header (the desktop's window title is always "List"). */
  title: string;
  options: LookupOption[] | undefined;
  onSelect: (option: LookupOption) => void;
  onClose: () => void;
};

/**
 * The F2 pick list, frmList1 (clsCommon.DisplayListForm): an AliceBlue "List" window with a
 * search box, the record count, and a grid. Type to filter, arrows to move, Enter to pick,
 * Esc to cancel.
 */
export function LookupDialog({ title, options, onSelect, onClose }: Props) {
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLTableSectionElement>(null);
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (options ?? []).filter((o) => o.name.toLowerCase().includes(f));
  }, [options, filter]);
  const index = Math.min(active, Math.max(shown.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(index + 1, shown.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(index - 1, 0));
    } else if (e.key === 'Enter' && shown[index]) {
      e.preventDefault();
      onSelect(shown[index]);
    }
  }

  return (
    <Modal title="List" onClose={onClose} width={799} className="bg-alice-blue">
      <div className="flex h-[min(467px,70vh)] flex-col">
        <div className="flex items-center gap-2">
          <input
            aria-label={`Search ${title}`}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className="w-[418px] max-w-[55%] border border-[#7a7a7a] bg-white px-1 outline-none focus:border-highlight"
            style={{ fontFamily: 'var(--font-grid-header)', fontSize: '18.4px', height: 32 }}
          />
          <span
            className="ml-auto pr-2 font-bold"
            style={{ fontFamily: "'Bookman Old Style', Bookman, serif", fontSize: 16 }}
          >
            Total Records : {shown.length}
          </span>
        </div>
        <div className="mt-1 min-h-0 flex-1 overflow-auto border border-control-dark bg-white">
          <table className="w-full border-collapse">
            <thead className="sticky top-0">
              <tr>
                <th
                  scope="col"
                  className="border border-control-dark bg-light-steel-blue px-1 py-0.5 text-left font-normal"
                  style={{ fontFamily: 'Arial, sans-serif', fontSize: '10.7px' }}
                >
                  {title}
                </th>
              </tr>
            </thead>
            <tbody ref={listRef} role="listbox" aria-label={title}>
              {options === undefined ? (
                <tr>
                  <td className="px-1 py-1 text-sm text-[#555]">Loading…</td>
                </tr>
              ) : shown.length === 0 ? (
                <tr>
                  <td className="px-1 py-1 text-sm text-[#555]">No matching entries</td>
                </tr>
              ) : (
                shown.map((o, i) => (
                  <tr
                    key={o.id}
                    role="option"
                    aria-selected={i === index}
                    onMouseDown={() => setActive(i)}
                    onDoubleClick={() => onSelect(o)}
                    className={`cursor-default ${i === index ? 'bg-selection text-white' : ''}`}
                  >
                    <td
                      className="border border-[#d4d0c8] px-1"
                      style={{ fontFamily: 'var(--font-grid-header)', fontSize: 16 }}
                    >
                      {o.name}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

'use client';

import type { PickList } from '@gglib/shared';
import { useState } from 'react';
import { useMessageBox } from '@/components/ui/MessageBox';
import { Modal, ToolButton, ToolSeparator } from '@/components/ui/Modal';
import { PickListDialog, type PickResult } from '@/components/ui/PickListDialog';
import { api, errorMessage } from '@/lib/api';
import { todayIso } from '@/lib/format';

/**
 * Kruti Master's Filter › Show Records By Work (frmKrutiWorkFilter, desktop v3.4.3.1): two
 * dates and three boxes filled from multi-select lists. The geometry and fonts are
 * frmKrutiWorkFilter.Designer.vb's (ClientSize 583x147, Times New Roman 14.25, AliceBlue).
 */

export type KrutiWorkFilter = {
  /** yyyy-MM-dd. */
  from: string;
  to: string;
  workTypes: number[];
  sampradays: number[];
  users: number[];
};

type BoxName = 'workTypes' | 'sampradays' | 'users';

/** The read-only boxes: OpenPopup's list, and whether only F2 opens it (txtWorkDoneBy). */
const BOXES: {
  name: BoxName;
  label: string;
  list: string;
  f2Only: boolean;
  labelAt: [number, number];
  at: { x: number; y: number; w: number };
}[] = [
  {
    name: 'workTypes',
    label: 'Work Type',
    list: 'work-types',
    f2Only: false,
    labelAt: [304, 37],
    at: { x: 399, y: 32, w: 176 },
  },
  {
    name: 'sampradays',
    label: 'Sampraday',
    list: 'kruti-sampraday',
    f2Only: false,
    labelAt: [304, 76],
    at: { x: 399, y: 72, w: 176 },
  },
  {
    name: 'users',
    label: 'Work Done By',
    list: 'work-users',
    f2Only: true,
    labelAt: [6, 115],
    at: { x: 143, y: 111, w: 148 },
  },
];

const DATES: { name: 'from' | 'to'; label: string; labelAt: [number, number]; y: number }[] = [
  { name: 'from', label: 'Work From Date', labelAt: [6, 37], y: 32 },
  { name: 'to', label: 'Work To Date', labelAt: [6, 76], y: 72 },
];

/** Keys that never reach a TextBox's KeyDown as a key of its own. */
const NOT_A_KEY = new Set(['Tab', 'Escape', 'Shift', 'Control', 'Alt', 'Meta']);

export function KrutiWorkFilterDialog({
  onSearch,
  onClose,
}: {
  /** btnSearch: boolSearch = True. */
  onSearch: (filter: KrutiWorkFilter) => void;
  /** btnExit, or the window's close button. */
  onClose: () => void;
}) {
  const msg = useMessageBox();
  // A DateTimePicker starts on today.
  const [dates, setDates] = useState({ from: todayIso(), to: todayIso() });
  /** Each box's Text (the names, comma separated) and Tag (the ids). */
  const [boxes, setBoxes] = useState<Record<BoxName, { text: string; ids: number[] }>>({
    workTypes: { text: '', ids: [] },
    sampradays: { text: '', ids: [] },
    users: { text: '', ids: [] },
  });
  const [picking, setPicking] = useState<{
    box: BoxName;
    title: string;
    list: PickList | undefined;
  } | null>(null);

  function openPopup(box: (typeof BOXES)[number]) {
    setPicking({ box: box.name, title: box.label, list: undefined });
    api
      .get<PickList>(`/master/kruti-master/lists/${box.list}`)
      .then((list) => setPicking((p) => (p?.box === box.name ? { ...p, list } : p)))
      .catch(async (err: unknown) => {
        setPicking(null);
        await msg.alert(errorMessage(err));
      });
  }

  /** OpenPopup: every chosen row's name joined by ","; the ids go to the Tag. */
  function picked(box: BoxName, r: PickResult) {
    const rows = r.rows.filter((row) => (Number(row[0]) || 0) !== 0);
    setBoxes((b) => ({
      ...b,
      [box]: {
        text: rows.map((row) => String(row[1] ?? '')).join(','),
        ids: rows.map((row) => Number(row[0])),
      },
    }));
  }

  return (
    <Modal title="Kruti Work Filter" width={583} className="bg-alice-blue" onClose={onClose}>
      <div className="relative" style={{ width: 583, height: 147 }}>
        <div className="win-toolstrip absolute top-0 left-0 w-full">
          {/* btnSearch.Text is "Save" on the desktop. */}
          <button
            type="button"
            title="Save"
            aria-label="Save"
            className="win-toolstrip-button"
            onClick={() =>
              onSearch({
                ...dates,
                workTypes: boxes.workTypes.ids,
                sampradays: boxes.sampradays.ids,
                users: boxes.users.ids,
              })
            }
          >
            <img src="/legacy/icons/search-small.jpg" alt="" />
          </button>
          <ToolSeparator />
          <ToolButton icon="exit" label="Close" onClick={onClose} />
        </div>

        {DATES.map((d) => (
          <div key={d.name}>
            <label
              htmlFor={`kwf-${d.name}`}
              className="win-label absolute whitespace-nowrap"
              style={{ left: d.labelAt[0], top: d.labelAt[1] }}
            >
              {d.label}
            </label>
            <input
              id={`kwf-${d.name}`}
              type="date"
              className="win-textbox absolute"
              value={dates[d.name]}
              // A DateTimePicker always holds a date.
              onChange={(e) =>
                e.target.value && setDates((v) => ({ ...v, [d.name]: e.target.value }))
              }
              style={{ left: 143, top: d.y, width: 148, height: 29 }}
            />
          </div>
        ))}

        {BOXES.map((b) => (
          <div key={b.name}>
            <label
              htmlFor={`kwf-${b.name}`}
              className="win-label absolute whitespace-nowrap"
              style={{ left: b.labelAt[0], top: b.labelAt[1] }}
            >
              {b.label}
            </label>
            <input
              id={`kwf-${b.name}`}
              readOnly
              className="win-textbox absolute"
              value={boxes[b.name].text}
              title={boxes[b.name].text}
              onKeyDown={(e) => {
                // txtWorkType / txtSampraday open on any key; txtWorkDoneBy on F2 only.
                if (b.f2Only ? e.key !== 'F2' : NOT_A_KEY.has(e.key)) return;
                e.preventDefault();
                openPopup(b);
              }}
              // BackColor = Window although ReadOnly.
              style={{
                left: b.at.x,
                top: b.at.y,
                width: b.at.w,
                height: 29,
                background: 'var(--window)',
              }}
            />
          </div>
        ))}
      </div>

      {picking && (
        <PickListDialog
          title={picking.title}
          list={picking.list}
          onCancel={() => setPicking(null)}
          onPick={(r) => {
            picked(picking.box, r);
            setPicking(null);
          }}
        />
      )}
    </Modal>
  );
}

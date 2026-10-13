'use client';

import type { GridRow, PickList } from '@gglib/shared';
import { useEffect, useState } from 'react';
import { Modal, ToolButton, ToolSeparator } from '@/components/ui/Modal';
import { useMessageBox } from '@/components/ui/MessageBox';
import { PickListDialog } from '@/components/ui/PickListDialog';
import { netString } from '@/features/master/transSummary';
import { api, errorMessage } from '@/lib/api';
import { getVikramSamvat } from './AuthorMaster';

/**
 * Book Master's "Add/Edit MS Data" (frmBookMSData): the manuscript boxes of the book as saved
 * (it reads BookM again, not the form's boxes). Save hands them back to Book Master, which
 * keeps them for its next Save.
 */

type Box = { name: string; x: number; y: number; w: number; kt?: string };

/** frmBookMSData.Designer.vb (96 DPI). */
const BOXES: Box[] = [
  { name: 'bhandarcokt', x: 121, y: 30, w: 164, kt: 'BhandarcoName' },
  { name: 'Hastpratno', x: 414, y: 30, w: 125 },
  { name: 'HastpratSize', x: 653, y: 30, w: 131 },
  { name: 'panktiAkshar', x: 885, y: 30, w: 128 },
  { name: 'PLSthalkt', x: 121, y: 66, w: 92, kt: 'PLSthalName' },
  { name: 'LSamvcokt', x: 214, y: 66, w: 71, kt: 'LsamvcoName' },
  { name: 'LSamvat', x: 415, y: 66, w: 55 },
  { name: 'LSamvatVK', x: 471, y: 66, w: 69 },
  { name: 'AdiVakya', x: 653, y: 66, w: 131 },
  { name: 'AntVakya', x: 885, y: 66, w: 128 },
];

const LABELS: [string, number, number][] = [
  ['Bhandar Name', 6, 34],
  ['Hastprat No', 287, 34],
  ['Hastprat Size', 542, 34],
  ['Pankti Aksr', 789, 34],
  ['LSthal/Samvat', 6, 70],
  ['LSamvatYr/VK', 287, 70],
  ['Adi Vakya', 542, 70],
  ['Ant Vakya', 789, 70],
];

const isNumeric = (s: string) => /^\s*[+-]?(\d+\.?\d*|\.\d+)\s*$/.test(s);

export type MSData = { fields: Record<string, string>; tags: Record<string, number> };

export function BookMSDataDialog({
  bookId,
  onClose,
  onSave,
}: {
  bookId: number;
  onClose: () => void;
  onSave: (values: MSData) => void;
}) {
  const msg = useMessageBox();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [tags, setTags] = useState<Record<string, number>>({});
  const [picking, setPicking] = useState<{ box: Box; list: PickList | undefined } | null>(null);

  // frmBookMSData_Load: the book's record (none for a new book).
  useEffect(() => {
    if (bookId <= 0) return;
    api
      .get<GridRow>(`/master/book-master/record/${bookId}`)
      .then((row) => {
        const f: Record<string, string> = {};
        const t: Record<string, number> = {};
        const get = (col: string) => {
          const key = Object.keys(row).find((k) => k.toLowerCase() === col.toLowerCase());
          return key === undefined ? '' : netString(row[key] ?? null);
        };
        for (const b of BOXES) {
          if (b.kt) {
            t[b.name] = Math.trunc(Number(get(b.name)) || 0);
            f[b.name] = get(b.kt);
          } else f[b.name] = get(b.name);
        }
        setFields(f);
        setTags(t);
      })
      .catch((err: unknown) => void msg.alert(errorMessage(err)));
  }, [bookId]);

  /** Txt_Leave on LSamvat / Lsamvcokt: LSamvatVK from the samvat's kind and year. */
  function leave(name: string) {
    if (name !== 'LSamvat' && name !== 'LSamvcokt') return;
    const text = fields.LSamvat ?? '';
    const kind = tags.LSamvcokt ?? 0;
    if ((fields.LSamvcokt ?? '') === '' || kind <= 0 || text.trim().length <= 2) return;
    let year: number | null = null;
    if (isNumeric(text.trim())) year = Math.round(Number(text));
    else {
      const head = text.substring(0, text.trim().length - 1);
      if (isNumeric(head)) year = Math.round(Number(head));
    }
    if (year !== null) setFields((f) => ({ ...f, LSamvatVK: String(getVikramSamvat(kind, year)) }));
  }

  /** Txt_KeyDown F2: the column's BookM list. */
  function f2(box: Box) {
    setPicking({ box, list: undefined });
    api
      .get<PickList>(`/master/book-master/f2/${box.name}`)
      .then((list) => setPicking((p) => (p?.box === box ? { box, list } : p)))
      .catch(async (err: unknown) => {
        setPicking(null);
        await msg.alert(errorMessage(err));
      });
  }

  // btnSave_Click: back to Book Master, trimmed as it reads them (LSamvatVK through Val).
  function save() {
    const out: MSData = { fields: {}, tags: {} };
    for (const b of BOXES) {
      if (b.kt) {
        out.tags[b.name] = tags[b.name] ?? 0;
        out.fields[b.name] = fields[b.name] ?? '';
      } else out.fields[b.name] = (fields[b.name] ?? '').trim();
    }
    out.fields.LSamvatVK = String(Math.trunc(Number.parseFloat(out.fields.LSamvatVK ?? '') || 0));
    onSave(out);
  }

  return (
    <Modal
      title="Add/Edit MS Data"
      width={1019}
      onClose={onClose}
      className="bg-alice-blue"
      onKeyDown={(e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 's') {
          e.preventDefault();
          save();
        }
      }}
    >
      <div className="relative" style={{ height: 107 }}>
        <div role="toolbar" aria-label="MS Data" className="win-toolstrip">
          <ToolButton icon="save" label="Save" onClick={save} />
          <ToolSeparator />
          <ToolButton icon="exit" label="Exit" onClick={onClose} />
          <ToolSeparator />
        </div>
        {LABELS.map(([text, x, y]) => (
          <span
            key={text}
            className="win-label absolute whitespace-nowrap"
            style={{ left: x, top: y }}
          >
            {text}
          </span>
        ))}
        {BOXES.map((b) => (
          <input
            key={b.name}
            aria-label={b.name}
            className="win-textbox absolute focus:bg-[#f5f5f5]"
            style={{ left: b.x, top: b.y, width: b.w, fontFamily: 'Times New Roman', fontSize: 19 }}
            value={fields[b.name] ?? ''}
            onChange={(e) => setFields((f) => ({ ...f, [b.name]: e.target.value }))}
            onBlur={() => leave(b.name)}
            onKeyDown={(e) => {
              if (e.key === 'F2') {
                e.preventDefault();
                f2(b);
              }
            }}
          />
        ))}
      </div>
      {picking && (
        <PickListDialog
          title={picking.box.name}
          list={picking.list}
          selectFirst
          onCancel={() => setPicking(null)}
          onPick={(r) => {
            const b = picking.box;
            setPicking(null);
            if (b.kt) {
              setTags((t) => ({ ...t, [b.name]: Math.trunc(Number(r.code[0]) || 0) }));
              setFields((f) => ({ ...f, [b.name]: r.name }));
            } else setFields((f) => ({ ...f, [b.name]: r.name }));
          }}
        />
      )}
    </Modal>
  );
}

'use client';

import type { Attachment } from '@gglib/shared';
import { useEffect, useRef, useState } from 'react';
import { useMessageBox } from '@/components/ui/MessageBox';
import { Modal, ToolButton, ToolSeparator } from '@/components/ui/Modal';
import { api, apiUrl, errorMessage } from '@/lib/api';

/** A row of dgMain: a saved attachment, or a file added with New (AttachmentKm 0) until Save. */
type Row = { key: number; saved: Attachment | null; file: File | null; name: string; type: string };

/** The save sends the files as base64 in one JSON body, which the API caps at 50 MB. */
const MAX_BYTES = 30 * 1024 * 1024;

let nextKey = -1;

/** FileSystem.GetFileInfo(name).Extension: from the last dot, or empty. */
function extension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^[^,]*,/, ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

/**
 * CommonLibrary.frmAttachments (ShowDialog from a form's Utility › Show Attachment(s), with
 * TranName = the form's table and TranKm = its record): the record's files. New picks a file,
 * Save stores the new ones and closes, Delete removes the selected rows and their files, and a
 * double click on a File Name opens the file.
 */
export function AttachmentsDialog({
  screen,
  recordId,
  onClose,
}: {
  screen: string;
  recordId: number;
  onClose: () => void;
}) {
  const msg = useMessageBox();
  const base = `/master/${screen}/attachments/${recordId}`;
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [entry, setEntry] = useState('');
  const picker = useRef<HTMLInputElement>(null);

  /** FillList: the saved rows, the first one selected and current. */
  async function fill() {
    try {
      const list = await api.get<Attachment[]>(base);
      const next = list.map((a) => ({
        key: a.id,
        saved: a,
        file: null,
        name: a.fileName,
        type: a.fileType,
      }));
      setRows(next);
      setSelected(next[0] ? [next[0].key] : []);
      setCurrent(next[0]?.key ?? null);
      setEntry(next[0]?.saved.entry ?? '');
    } catch (err) {
      await msg.alert(errorMessage(err));
    }
  }

  useEffect(() => {
    void fill();
    // Load once per dialog (frmAttachments_Load).
  }, []);

  /** btnNew_Click: the OpenFileDialog's file becomes a new row. */
  function addFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      void msg.alert(`${file.name} is too large to attach from the web app (30 MB at most).`);
      return;
    }
    setRows((r) => [
      ...r,
      { key: nextKey--, saved: null, file, name: file.name, type: extension(file.name) },
    ]);
  }

  /** btnSave_Click. */
  async function save() {
    if (!(await msg.confirm('Are you sure to save these attachments?'))) return;
    try {
      const added = rows.filter((r) => r.file);
      if (added.length > 0) {
        const files = await Promise.all(
          added.map(async (r) => ({ name: r.name, data: await toBase64(r.file!) })),
        );
        await api.post(base, { files });
      }
      onClose();
    } catch (err) {
      await msg.alert(errorMessage(err));
    }
  }

  /** btnDelete_Click: rows not saved yet just go, as FillList drops them. */
  async function remove() {
    if (!(await msg.confirm('Are you sure to delete selected records?'))) return;
    try {
      const chosen = rows.filter((r) => selected.includes(r.key));
      const ids = chosen.flatMap((r) => (r.saved ? [r.saved.id] : []));
      if (ids.length > 0) await api.post(`${base}/delete`, { ids });
      if (chosen.length > 0) {
        await msg.alert(`(${chosen.length}) Records Deleted Successfully`);
        await fill();
      }
    } catch (err) {
      await msg.alert(errorMessage(err));
    }
  }

  /** dgMain_Click: lblEntry shows who attached the current row. */
  function select(row: Row, e: React.MouseEvent) {
    setCurrent(row.key);
    setEntry(row.saved?.entry ?? '');
    setSelected((s) => {
      if (e.ctrlKey || e.metaKey)
        return s.includes(row.key) ? s.filter((k) => k !== row.key) : [...s, row.key];
      if (e.shiftKey && current !== null) {
        const a = rows.findIndex((r) => r.key === current);
        const b = rows.findIndex((r) => r.key === row.key);
        return rows.slice(Math.min(a, b), Math.max(a, b) + 1).map((r) => r.key);
      }
      return [row.key];
    });
  }

  /** dgMain_CellDoubleClick on File Name: Process.Start(FilePath). */
  function open(row: Row) {
    if (row.file) {
      window.open(URL.createObjectURL(row.file), '_blank', 'noopener');
      return;
    }
    if (!row.saved?.exists) {
      void msg.alert(`File At Location : ${row.name} Does Not Exists`, 'File Not Found');
      return;
    }
    window.open(apiUrl(`${base}/file/${row.saved.id}`), '_blank', 'noopener');
  }

  const header = {
    fontFamily: "'Arial Unicode MS', var(--font-grid-header)",
    fontSize: 12,
  };
  return (
    <Modal
      title="Attachments"
      width={572}
      className="bg-alice-blue"
      onClose={onClose}
      initialFocus='[role="grid"]'
    >
      <div role="toolbar" aria-label="Attachments" className="win-toolstrip">
        <ToolButton icon="new" label="New" onClick={() => picker.current?.click()} />
        <ToolSeparator />
        <ToolButton icon="save" label="Save" onClick={() => void save()} />
        <ToolSeparator />
        <ToolButton icon="delete" label="Delete" onClick={() => void remove()} />
        <ToolSeparator />
        <ToolButton icon="refresh" label="Refresh" onClick={() => void fill()} />
        <ToolSeparator />
        <ToolButton icon="exit" label="Exit" onClick={onClose} />
        <ToolSeparator />
        <span
          className="font-bold whitespace-pre"
          style={{ fontFamily: "'Arial Unicode MS', var(--font-grid-header)", fontSize: 11 }}
        >
          {entry}
        </span>
        <input
          ref={picker}
          type="file"
          hidden
          aria-label="Attach a file"
          onChange={(e) => {
            addFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      <div
        tabIndex={0}
        role="grid"
        aria-label="Attachments"
        className="mx-0.5 mt-px mb-0.5 overflow-auto bg-white outline-none"
        style={{ height: 339 }}
      >
        <table className="border-collapse" style={{ tableLayout: 'fixed', width: 550 }}>
          <thead className="sticky top-0">
            <tr>
              <th
                scope="col"
                className="border border-control-dark bg-light-steel-blue px-1 text-left font-normal text-dark-red"
                style={{ ...header, width: 370 }}
              >
                File Name
              </th>
              <th
                scope="col"
                className="border border-control-dark bg-light-steel-blue px-1 text-left font-normal text-dark-red"
                style={{ ...header, width: 180 }}
              >
                File Type
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const on = selected.includes(row.key);
              return (
                <tr
                  key={row.key}
                  aria-selected={on}
                  onMouseDown={(e) => select(row, e)}
                  className={on ? 'bg-selection text-white' : ''}
                  style={{ fontFamily: 'Verdana, sans-serif', fontSize: 16 }}
                >
                  <td
                    role="gridcell"
                    onDoubleClick={() => open(row)}
                    className={`cursor-pointer truncate border border-light-steel-blue px-1 underline ${
                      on ? '' : 'text-[#0000ff]'
                    }`}
                  >
                    {row.name}
                  </td>
                  <td role="gridcell" className="truncate border border-light-steel-blue px-1">
                    {row.type}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

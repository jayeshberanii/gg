'use client';

import type { LibraryFolder } from '@gglib/shared';
import { useEffect, useState } from 'react';
import { useMessageBox } from '@/components/ui/MessageBox';
import { Button, Modal } from '@/components/ui/Modal';
import { errorMessage } from '@/lib/api';
import { listLibraryFolder } from './libraryFiles';

type Entry = { kind: 'folder' | 'file'; name: string; path: string };

/** The folder a desktop path is in, or '' when it names none. */
function folderOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  return cut > 2 ? path.slice(0, cut) : '';
}

/**
 * System.Windows.Forms.OpenFileDialog for a box that keeps a file's path (Inward Master's PC
 * Location). A browser never learns the path of a file on the user's computer, so the dialog
 * lists the library folders the server reaches instead (scans, e-books, title scans …), named
 * as the desktop names them: Open (or a double click) on a file hands back its path, Cancel
 * nothing.
 */
export function LibraryFileDialog({
  screen,
  initialPath = '',
  onPick,
  onCancel,
}: {
  screen: string;
  /** The box's text: the dialog starts in that file's folder when it is a library folder. */
  initialPath?: string;
  /** DLGOPENFile.FileName. */
  onPick: (path: string) => void;
  onCancel: () => void;
}) {
  const msg = useMessageBox();
  const [folder, setFolder] = useState<LibraryFolder | null>(null);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [fileName, setFileName] = useState('');

  async function show(path: string, quiet = false): Promise<boolean> {
    try {
      setFolder(await listLibraryFolder(screen, path));
      setSelected(null);
      setFileName('');
      return true;
    } catch (err) {
      if (!quiet) await msg.alert(errorMessage(err));
      return false;
    }
  }

  useEffect(() => {
    void (async () => {
      const start = folderOf(initialPath.trim());
      if (start === '' || !(await show(start, true))) await show('');
    })();
    // Load once per dialog (ShowDialog).
  }, []);

  const entries: Entry[] = folder
    ? [
        ...folder.folders.map((f) => ({ kind: 'folder' as const, ...f })),
        ...folder.files.map((f) => ({ kind: 'file' as const, ...f })),
      ]
    : [];

  /** The Open button, Enter, or a double click. */
  async function open(entry: Entry | null) {
    if (entry?.kind === 'folder') {
      await show(entry.path);
      return;
    }
    if (entry) {
      onPick(entry.path);
      return;
    }
    const typed = fileName.trim();
    if (typed === '') return;
    const match = entries.find((e) => e.name.toLowerCase() === typed.toLowerCase());
    if (match) await open(match);
    else
      await msg.alert(`${typed}\r\nFile not found.\r\nCheck the file name and try again.`, 'Open');
  }

  return (
    <Modal
      title="Open"
      width={620}
      onClose={onCancel}
      initialFocus='[role="listbox"]'
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          void open(selected && selected.name === fileName ? selected : null);
        }
      }}
    >
      <div className="flex flex-col gap-2 p-2 text-xs">
        <div className="flex items-center gap-2">
          <label htmlFor="library-file-look-in" className="w-[62px] shrink-0">
            Look in:
          </label>
          <input
            id="library-file-look-in"
            readOnly
            className="h-[21px] min-w-0 flex-1 border border-[#7a7a7a] bg-white px-1"
            value={folder?.path === '' ? 'Library folders' : (folder?.path ?? '')}
          />
          <Button
            className="h-[23px] px-2"
            disabled={!folder || folder.parent === null}
            onClick={() => void show(folder?.parent ?? '')}
          >
            Up
          </Button>
        </div>
        <ul
          role="listbox"
          aria-label="Files"
          tabIndex={0}
          className="h-[300px] overflow-auto border border-[#7a7a7a] bg-white outline-none"
        >
          {entries.map((entry) => {
            const on = selected?.path === entry.path;
            return (
              <li
                key={`${entry.kind}:${entry.path}`}
                role="option"
                aria-selected={on}
                className={`flex cursor-default items-center gap-1.5 px-1 leading-[18px] whitespace-nowrap select-none ${
                  on ? 'bg-selection text-white' : ''
                }`}
                onMouseDown={() => {
                  setSelected(entry);
                  if (entry.kind === 'file') setFileName(entry.name);
                }}
                onDoubleClick={() => void open(entry)}
              >
                <span
                  aria-hidden
                  className={
                    entry.kind === 'folder'
                      ? 'h-[10px] w-[13px] shrink-0 border border-[#c9a227] bg-[#f6d66b]'
                      : 'h-[12px] w-[10px] shrink-0 border border-[#7a7a7a] bg-white'
                  }
                />
                {entry.name}
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-2">
          <label htmlFor="library-file-name" className="w-[62px] shrink-0">
            File name:
          </label>
          <input
            id="library-file-name"
            className="h-[21px] min-w-0 flex-1 border border-[#7a7a7a] bg-white px-1"
            value={fileName}
            onChange={(e) => {
              setFileName(e.target.value);
              setSelected(null);
            }}
          />
          <Button
            className="h-[23px] w-[75px]"
            onClick={() =>
              void open(
                selected && (selected.kind === 'folder' || selected.name === fileName)
                  ? selected
                  : null,
              )
            }
          >
            Open
          </Button>
          <Button className="h-[23px] w-[75px]" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

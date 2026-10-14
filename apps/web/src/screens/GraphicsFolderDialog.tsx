'use client';

import type { LibraryFolder } from '@gglib/shared';
import { useEffect, useState } from 'react';
import { useMessageBox } from '@/components/ui/MessageBox';
import { Button, Modal } from '@/components/ui/Modal';
import { listLibraryFolder } from '@/features/master/libraryFiles';
import { errorMessage } from '@/lib/api';

type Folder = LibraryFolder['folders'][number];

/**
 * frmGraphicsDetail's FolderBrowserDialog1 (Send Image To Folder, Showing Mismatch Of No Of
 * Images), over the folders of the desktop's drives as the server reaches them: the folder-picking
 * counterpart of features/master/LibraryFileDialog. Paths are the desktop's own (`Y:\B003955`).
 * OK takes the selected folder, or the one being shown when none is selected; `makeFolder` is the
 * dialog's Make New Folder button.
 */
export function GraphicsFolderDialog({
  screen,
  makeFolder,
  onPick,
  onCancel,
}: {
  screen: string;
  makeFolder?: (parent: string, name: string) => Promise<boolean>;
  /** FolderBrowserDialog1.SelectedPath. */
  onPick: (path: string) => void;
  onCancel: () => void;
}) {
  const msg = useMessageBox();
  const [folder, setFolder] = useState<LibraryFolder | null>(null);
  const [selected, setSelected] = useState<Folder | null>(null);

  async function show(path: string) {
    try {
      setFolder(await listLibraryFolder(screen, path));
      setSelected(null);
    } catch (err) {
      await msg.alert(errorMessage(err));
    }
  }

  useEffect(() => {
    void show('');
    // Load once per dialog (ShowDialog).
  }, []);

  async function newFolder() {
    if (!makeFolder || !folder || folder.path === '') return;
    const name = await msg.input('Folder name', 'Make New Folder', 'New folder');
    if (name === null || name.trim() === '') return;
    if (await makeFolder(folder.path, name.trim())) await show(folder.path);
  }

  const picked = selected?.path ?? folder?.path ?? '';
  return (
    <Modal
      title="Browse For Folder"
      width={520}
      onClose={onCancel}
      initialFocus='[role="listbox"]'
      onKeyDown={(e) => {
        if (e.key === 'Enter' && selected) {
          e.preventDefault();
          void show(selected.path);
        }
      }}
    >
      <div className="flex flex-col gap-2 p-2 text-xs">
        <div className="flex items-center gap-2">
          <label htmlFor="graphics-folder-current" className="w-[62px] shrink-0">
            Folder:
          </label>
          <input
            id="graphics-folder-current"
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
          aria-label="Folders"
          tabIndex={0}
          className="h-[300px] overflow-auto border border-[#7a7a7a] bg-white outline-none"
        >
          {(folder?.folders ?? []).map((entry) => {
            const on = selected?.path === entry.path;
            return (
              <li
                key={entry.path}
                role="option"
                aria-selected={on}
                className={`flex cursor-default items-center gap-1.5 px-1 leading-[18px] whitespace-nowrap select-none ${
                  on ? 'bg-selection text-white' : ''
                }`}
                onMouseDown={() => setSelected(entry)}
                onDoubleClick={() => void show(entry.path)}
              >
                <span
                  aria-hidden
                  className="h-[10px] w-[13px] shrink-0 border border-[#c9a227] bg-[#f6d66b]"
                />
                {entry.name}
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-2">
          {makeFolder && (
            <Button
              className="h-[23px] px-2"
              disabled={!folder || folder.path === ''}
              onClick={() => void newFolder()}
            >
              Make New Folder
            </Button>
          )}
          <span className="flex-1" />
          <Button
            className="h-[23px] w-[75px]"
            disabled={picked === ''}
            onClick={() => onPick(picked)}
          >
            OK
          </Button>
          <Button className="h-[23px] w-[75px]" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

'use client';

import { useRef, useState } from 'react';
import { InputBox } from './InputBox';
import { Button, Modal } from './Modal';

/** frmBixtextbox: DefaultFontSize / MaximumFontSize, in points, and the Ctrl +/- step. */
const DEFAULT_POINTS = 15;
const MAXIMIZED_POINTS = 20;
const FONT_STEP = 10;

/**
 * `frmBixtextbox` (CommonLibrary.dll), opened with F3 on a text box or a grid cell through
 * `clsCommon.bigtext1`: a 503×303 sizable window holding one RichTextBox so a long value can be
 * read in full.
 *
 * - "&Save" only shows when the box or cell it came from is editable (`Savebut`). The text can
 *   be typed over either way, as on the desktop; without Save there is nothing to keep it.
 *   "&Close" (and Esc, the CancelButton) leaves the value alone. Enter adds a line.
 * - `txtSearch_KeyDown`: F7 asks for a text and selects its first occurrence, F8 the next one
 *   (`Vfindstr`, ignoring case); Ctrl+M maximizes and Ctrl+N restores; Ctrl + adds 10pt to the
 *   font and Ctrl - takes it off again, never below the starting size.
 * - `frmBixtextbox_Resize` → `SetFont`: 15pt, or 20pt maximized, and a change of window state
 *   drops whatever Ctrl + had added.
 *
 * A browser keeps Ctrl+N for itself, so the title bar's restore button does that job too.
 *
 * The desktop leaves the window's caption at the designer's literal "frmBixtextbox"; this uses
 * the column's name instead, which is what that caption was clearly meant to say.
 */
export function BigTextBox({
  title,
  value,
  canSave = false,
  onSave,
  onClose,
}: {
  title: string;
  value: string;
  canSave?: boolean;
  onSave?: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(value);
  const [maximized, setMaximized] = useState(false);
  /** AdditionalFontSize. */
  const [extra, setExtra] = useState(0);
  const [finding, setFinding] = useState(false);
  /** StrSearch: what F7 last asked for, which F8 looks for again. */
  const strSearch = useRef('');
  const box = useRef<HTMLTextAreaElement>(null);

  const save = () => onSave?.(text.replace(/\n/g, '\r\n'));

  function setWindowState(next: boolean) {
    if (next === maximized) return;
    setMaximized(next);
    setExtra(0);
  }

  /** clsCommon.Vfindstr on the RichTextBox: select the next occurrence, ignoring case. */
  function find(fromStart: boolean) {
    const el = box.current;
    const wanted = strSearch.current;
    if (!el || wanted.trim() === '') return;
    const at = el.value
      .toLowerCase()
      .indexOf(wanted.toLowerCase(), fromStart ? 0 : el.selectionEnd);
    if (at < 0) return;
    // ScrollToCaret: a browser scrolls the selection into view when the box takes the focus.
    el.blur();
    el.setSelectionRange(at, at + wanted.length);
    el.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    // The window is drawn inside the grid or form that opened it: its keys stay its own.
    if (e.key !== 'Escape' && e.key !== 'Tab') e.stopPropagation();
    if (finding) return;
    const key = e.key.toLowerCase();
    if (e.altKey && key === 's' && canSave) {
      e.preventDefault();
      save();
    } else if (e.altKey && key === 'c') {
      e.preventDefault();
      onClose();
    }
    // F3 is the browser's "find next"; here it does nothing.
    if (e.key === 'F3') e.preventDefault();
    if (e.target !== box.current) return;
    if (e.key === 'F7') {
      e.preventDefault();
      setFinding(true);
    } else if (e.key === 'F8') {
      e.preventDefault();
      find(false);
    }
    if (!e.ctrlKey) return;
    if (key === 'm') {
      e.preventDefault();
      setWindowState(true);
    } else if (key === 'n') {
      e.preventDefault();
      setWindowState(false);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      setExtra((x) => x + FONT_STEP);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      setExtra((x) => (x > 0 ? x - FONT_STEP : x));
    }
  }

  const points = (maximized ? MAXIMIZED_POINTS : DEFAULT_POINTS) + extra;

  return (
    <>
      <Modal
        title={title}
        onClose={onClose}
        width={503}
        className={`bg-control p-0.5 ${maximized ? 'flex' : ''}`}
        initialFocus="textarea"
        maximized={maximized}
        onToggleMaximize={() => setWindowState(!maximized)}
        onKeyDown={onKeyDown}
        footer={
          <>
            {canSave && (
              <Button className="w-[67px]" onClick={save}>
                Save
              </Button>
            )}
            <Button className="w-[67px]" onClick={onClose}>
              Close
            </Button>
          </>
        }
      >
        <textarea
          ref={box}
          aria-label={title}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={`block w-full resize-none border border-[#7a7a7a] bg-white px-1 outline-none ${
            maximized ? 'min-h-0 flex-1' : 'h-[266px]'
          }`}
          style={{
            fontFamily: "'Microsoft Sans Serif', Tahoma, sans-serif",
            fontSize: `${(points * 4) / 3}px`,
          }}
        />
      </Modal>
      {finding && (
        <InputBox
          prompt="Enter text to Search "
          title="Search"
          onOk={(wanted) => {
            setFinding(false);
            strSearch.current = wanted;
            // The InputBox hands the focus back as it closes; look once it has.
            setTimeout(() => find(true));
          }}
          onCancel={() => {
            setFinding(false);
            strSearch.current = '';
          }}
        />
      )}
    </>
  );
}

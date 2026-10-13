'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type ContextMenuItem =
  | { kind: 'separator' }
  | {
      kind: 'item';
      label: string;
      shortcut?: string;
      disabled?: boolean;
      /** ToolStripMenuItem.Checked: a tick before the text. */
      checked?: boolean;
      onSelect: () => void;
    }
  /** `onSelect`: a ToolStripMenuItem with drop-down items can still be clicked itself. */
  | { kind: 'submenu'; label: string; items: ContextMenuItem[]; onSelect?: () => void };

/**
 * A ContextMenuStrip: the same look as the menu bar's drop-downs, placed at the pointer and,
 * like the desktop's, moved up or left when it would run off the screen.
 */
export function ContextMenu({
  items,
  at,
  label,
  onClose,
}: {
  items: ContextMenuItem[];
  at: { x: number; y: number };
  label: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState({ left: at.x, top: at.y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(0, Math.min(at.x, window.innerWidth - width - 2)),
      top: Math.max(0, at.y + height > window.innerHeight ? window.innerHeight - height - 2 : at.y),
    });
  }, [at.x, at.y]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
  }, []);

  return (
    <ul
      ref={ref}
      role="menu"
      aria-label={label}
      className="win-dropdown fixed z-50 min-w-48"
      style={pos}
      // Esc closes only the menu, not the dialog it was opened in.
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <MenuItems items={items} onClose={onClose} />
    </ul>
  );
}

/**
 * One level of the menu. Like a ToolStrip, at most one submenu per level is open: the one
 * whose item the pointer (or keyboard focus) last reached; moving to a sibling closes it.
 */
function MenuItems({ items, onClose }: { items: ContextMenuItem[]; onClose: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      {items.map((item, i) =>
        item.kind === 'separator' ? (
          <li key={i} role="separator" className="win-dropdown-separator" />
        ) : (
          <li
            key={i}
            role="none"
            className="relative"
            onMouseEnter={() => setOpen(item.kind === 'submenu' ? i : null)}
            onFocus={(e) => {
              // Only keyboard focus opens it (not the menu's own first-item focus), and focus
              // moving inside this item's own submenu keeps it open.
              if (
                e.target === e.currentTarget.firstElementChild &&
                e.target.matches(':focus-visible')
              )
                setOpen(item.kind === 'submenu' ? i : null);
            }}
          >
            <button
              type="button"
              role={
                item.kind === 'item' && item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'
              }
              aria-checked={
                item.kind === 'item' && item.checked !== undefined ? item.checked : undefined
              }
              aria-haspopup={item.kind === 'submenu' ? 'menu' : undefined}
              aria-expanded={item.kind === 'submenu' ? open === i : undefined}
              disabled={item.kind === 'item' && item.disabled}
              onClick={() => {
                if (item.kind === 'item' || item.onSelect) {
                  onClose();
                  item.onSelect?.();
                }
              }}
              className="win-dropdown-item"
            >
              {item.kind === 'item' && item.checked && (
                <span aria-hidden="true" className="-ml-4 w-4">
                  ✓
                </span>
              )}
              <span className="flex-1">{item.label}</span>
              {item.kind === 'item' && item.shortcut && <span>{item.shortcut}</span>}
              {item.kind === 'submenu' && <span aria-hidden="true">▸</span>}
            </button>
            {item.kind === 'submenu' && open === i && (
              <Submenu label={item.label} items={item.items} onClose={onClose} />
            )}
          </li>
        ),
      )}
    </>
  );
}

/** A submenu beside its item, to the left or higher up when it would not fit on the screen. */
function Submenu({
  label,
  items,
  onClose,
}: {
  label: string;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    const sub = ref.current;
    if (!sub) return;
    const rect = sub.getBoundingClientRect();
    if (rect.bottom > window.innerHeight)
      sub.style.top = `${Math.min(0, window.innerHeight - rect.bottom - 2)}px`;
    if (rect.right > window.innerWidth) {
      sub.style.left = 'auto';
      sub.style.right = '100%';
    }
  }, []);
  return (
    <ul
      ref={ref}
      role="menu"
      aria-label={label}
      className="win-dropdown absolute left-full top-0 z-50 min-w-48"
    >
      <MenuItems items={items} onClose={onClose} />
    </ul>
  );
}

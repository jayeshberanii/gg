'use client';

import type { Menu, MenuItem } from '@gglib/shared';
import { type ReactNode, useEffect, useRef, useState } from 'react';

/** An open MDI child, listed at the end of the Windows menu (MdiWindowListItem). */
export type WindowListItem = { id: number; title: string; active: boolean };

type BarItem = MenuItem | { kind: 'window'; id: number; label: string; checked: boolean };
type Selectable = Exclude<BarItem, { kind: 'separator' }>;

type Props = {
  menus: Menu[];
  onSelect: (item: Extract<MenuItem, { kind: 'screen' | 'action' }>) => void;
  windows?: WindowListItem[];
  onWindowSelect?: (id: number) => void;
  /** Right end of the strip: the MDI child's buttons, captions. */
  trailing?: ReactNode;
};

/**
 * Frmlibmain's MenuStrip (Professional renderer). Alt+<key> opens a menu with an access key
 * (the `&` in the desktop caption); arrows move, Right opens a submenu, Enter runs, Esc closes.
 */
export function MenuBar({ menus, onSelect, windows = [], onWindowSelect, trailing }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const ref = useRef<HTMLElement>(null);
  const barButtons = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (open === null) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return;
      const index = menus.findIndex((m) => m.accessKey && m.accessKey === e.key.toLowerCase());
      if (index < 0) return;
      e.preventDefault();
      setOpen(index);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menus]);

  const itemsOf = (menu: Menu): BarItem[] =>
    menu.label === 'Windows' && windows.length > 0
      ? [
          ...menu.items,
          { kind: 'separator' },
          ...windows.map((w, i) => ({
            kind: 'window' as const,
            id: w.id,
            label: `${i + 1} ${w.title}`,
            checked: w.active,
          })),
        ]
      : menu.items;

  return (
    <nav ref={ref} aria-label="Main menu" className="win-menustrip flex items-center px-0.5">
      <ul role="menubar" aria-label="Main menu" className="flex flex-1 flex-wrap">
        {menus.map((menu, i) => (
          <li key={menu.label} role="none" className="relative">
            <button
              ref={(el) => {
                barButtons.current[i] = el;
              }}
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={open === i}
              aria-keyshortcuts={menu.accessKey ? `Alt+${menu.accessKey.toUpperCase()}` : undefined}
              onClick={() => setOpen(open === i ? null : i)}
              onMouseEnter={() => open !== null && setOpen(i)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpen(i);
                } else if (e.key === 'ArrowRight') {
                  barButtons.current[(i + 1) % menus.length]?.focus();
                } else if (e.key === 'ArrowLeft') {
                  barButtons.current[(i - 1 + menus.length) % menus.length]?.focus();
                }
              }}
              className="win-menu-top"
            >
              <Caption label={menu.label} accessKey={menu.accessKey} />
            </button>
            {open === i && (
              <MenuList
                label={menu.label}
                items={itemsOf(menu)}
                autoFocus
                onSelect={(item) => {
                  setOpen(null);
                  if (item.kind === 'window') onWindowSelect?.(item.id);
                  else onSelect(item);
                }}
                onClose={() => {
                  setOpen(null);
                  barButtons.current[i]?.focus();
                }}
                onSideways={(dir) => setOpen((i + dir + menus.length) % menus.length)}
              />
            )}
          </li>
        ))}
      </ul>
      {trailing}
    </nav>
  );
}

/** Underlines the access key, like the desktop's `&Master`. */
function Caption({ label, accessKey }: { label: string; accessKey?: string }) {
  const at = accessKey ? label.toLowerCase().indexOf(accessKey) : -1;
  if (at < 0) return <>{label}</>;
  return (
    <>
      {label.slice(0, at)}
      <span className="underline">{label[at]}</span>
      {label.slice(at + 1)}
    </>
  );
}

function MenuList({
  label,
  items,
  autoFocus,
  onSelect,
  onClose,
  onSideways,
  nested = false,
}: {
  label: string;
  items: BarItem[];
  autoFocus?: boolean;
  onSelect: (item: Exclude<Selectable, { kind: 'submenu' }>) => void;
  onClose: () => void;
  onSideways?: (dir: 1 | -1) => void;
  nested?: boolean;
}) {
  const [sub, setSub] = useState<number | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const focusable = items
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => item.kind !== 'separator' && !(item.kind === 'screen' && item.disabled))
    .map(({ i }) => i);

  useEffect(() => {
    // Focus the first item once, when the list opens.
    if (autoFocus) buttons.current[focusable[0] ?? 0]?.focus();
  }, []);

  const move = (from: number, dir: 1 | -1) => {
    const pos = focusable.indexOf(from);
    const next = focusable[(pos + dir + focusable.length) % focusable.length];
    if (next !== undefined) buttons.current[next]?.focus();
  };

  return (
    <ul
      role="menu"
      aria-label={label}
      className={`win-dropdown z-40 min-w-48 ${
        nested
          ? // Beside the parent on wider screens; stacked under it on a phone.
            'sm:absolute sm:left-full sm:top-0 sm:-mt-[3px]'
          : 'absolute left-0 top-full max-h-[calc(100vh-4rem)] max-w-[calc(100vw-0.5rem)] overflow-y-auto sm:overflow-visible'
      }`}
    >
      {items.map((item, i) => {
        if (item.kind === 'separator') {
          return <li key={`sep-${i}`} role="separator" className="win-dropdown-separator" />;
        }
        const it = item as Selectable;
        const disabled = it.kind === 'screen' && it.disabled;
        const shortcut = it.kind === 'screen' || it.kind === 'action' ? it.shortcut : undefined;
        const checked = it.kind === 'window' ? it.checked : undefined;
        return (
          <li key={`${it.label}-${i}`} role="none" className="relative">
            <button
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              role={it.kind === 'window' ? 'menuitemradio' : 'menuitem'}
              aria-checked={checked}
              disabled={disabled}
              aria-haspopup={it.kind === 'submenu' ? 'menu' : undefined}
              aria-expanded={it.kind === 'submenu' ? sub === i : undefined}
              aria-keyshortcuts={shortcut?.replace('Ctrl', 'Control')}
              onMouseEnter={() => setSub(it.kind === 'submenu' ? i : null)}
              onClick={() => {
                if (it.kind === 'submenu') setSub(i);
                else onSelect(it);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  move(i, 1);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  move(i, -1);
                } else if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  if (it.kind === 'submenu') setSub(i);
                  else onSideways?.(1);
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  if (nested) onClose();
                  else onSideways?.(-1);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onClose();
                }
              }}
              className="win-dropdown-item relative"
            >
              <span className="flex-1">{it.label}</span>
              {shortcut && <span>{shortcut}</span>}
              {it.kind === 'submenu' && <span aria-hidden="true">▸</span>}
            </button>
            {it.kind === 'submenu' && sub === i && (
              <MenuList
                label={it.label}
                items={it.items}
                autoFocus
                nested
                onSelect={onSelect}
                onClose={() => {
                  setSub(null);
                  buttons.current[i]?.focus();
                }}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

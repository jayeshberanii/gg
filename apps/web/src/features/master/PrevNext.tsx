'use client';

import { useState } from 'react';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';
import type { MasterState } from './useMasterScreen';

/**
 * UcPrevNext: steps through the grid's earlier result sets, showing "n/N". The desktop keeps
 * every search result, so |< < > >| walk back and forth through them. Right-click gives
 * "Remove Selected Record" (drop the shown result set) and "Restate" (clear all of them).
 */
export function PrevNext({ state }: { state: MasterState }) {
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const total = Math.max(state.history.length, 1);
  const at = state.historyIndex;
  const go = (index: number) =>
    state.goHistory(Math.min(Math.max(index, 0), state.history.length - 1));
  const button = (name: string, label: string, to: number, disabled: boolean) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => go(to)}
      className="h-5 w-5 border border-[#8a9db5] bg-white bg-center bg-no-repeat disabled:opacity-40"
      style={{ backgroundImage: `url('/legacy/icons/nav-${name}.gif')` }}
    />
  );
  const menuItems: ContextMenuItem[] = [
    { kind: 'item', label: 'Remove Selected Record', onSelect: state.removeHistoryEntry },
    { kind: 'item', label: 'Restate', onSelect: state.restate },
  ];
  return (
    <div
      className="flex items-center gap-0.5 pr-1"
      aria-label="Result history"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuAt({ x: e.clientX, y: e.clientY });
      }}
    >
      {button('first', 'First result', 0, at <= 0)}
      {button('prev', 'Previous result', at - 1, at <= 0)}
      <span
        className="h-5 min-w-[82px] border border-[#8a9db5] bg-white px-1 text-center"
        style={{ fontFamily: 'Tahoma, var(--font-ui)', fontSize: 11, lineHeight: '18px' }}
      >
        {at + 1}/{total}
      </span>
      {button('next', 'Next result', at + 1, at >= state.history.length - 1)}
      {button('last', 'Last result', state.history.length - 1, at >= state.history.length - 1)}
      {menuAt && (
        <ContextMenu
          items={menuItems}
          at={menuAt}
          label="Result history"
          onClose={() => setMenuAt(null)}
        />
      )}
    </div>
  );
}

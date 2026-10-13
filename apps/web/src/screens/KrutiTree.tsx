'use client';

import type { GridValue } from '@gglib/shared';
import { useState } from 'react';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';

/** A tvLevel node: its text and its Tag (a krutimstkm). */
export type KrutiNode = { text: string; tag: number; children: KrutiNode[] };

/** The server's flat tree (id, parent index, text) as nodes. */
export function buildKrutiTree(rows: GridValue[][]): KrutiNode[] {
  const nodes = rows.map((r) => ({
    text: String(r[2] ?? ''),
    tag: Number(r[0]),
    children: [] as KrutiNode[],
  }));
  const roots: KrutiNode[] = [];
  rows.forEach((r, i) => {
    const parent = Number(r[1]);
    if (parent >= 0 && nodes[parent]) nodes[parent]!.children.push(nodes[i]!);
    else roots.push(nodes[i]!);
  });
  return roots;
}

/** ExportTreeToWord: the tree as text, each level one tab deeper (three levels, as the desktop). */
export function krutiTreeText(roots: KrutiNode[]): string {
  const lines: string[] = [];
  for (const a of roots) {
    lines.push(a.text);
    for (const b of a.children) {
      lines.push(`\t${b.text}`);
      for (const c of b.children) lines.push(`\t\t${c.text}`);
    }
  }
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * tvLevel: docked over the grid, Arial Unicode MS 15.75pt, FullRowSelect, nodes collapsed (the
 * form never expands them), sharing the grid's right-click menu. Selecting a node loads that
 * kruti (tvLevel_AfterSelect).
 */
export function KrutiTree({
  roots,
  selectedTag,
  onSelect,
  menuItems,
}: {
  roots: KrutiNode[];
  selectedTag: number | null;
  onSelect: (tag: number) => void;
  menuItems: ContextMenuItem[];
}) {
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const toggle = (key: string) =>
    setOpen((o) => {
      const next = new Set(o);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const render = (nodes: KrutiNode[], path: string) => (
    <ul role="group" className="pl-5">
      {nodes.map((n, i) => {
        const key = `${path}/${i}`;
        const expanded = open.has(key);
        return (
          <li
            key={key}
            role="treeitem"
            aria-selected={selectedTag === n.tag}
            aria-expanded={n.children.length > 0 ? expanded : undefined}
          >
            <div
              className={`flex cursor-default items-center whitespace-nowrap ${selectedTag === n.tag ? 'bg-selection text-white' : ''}`}
              onMouseDown={() => n.tag > 0 && onSelect(n.tag)}
              onDoubleClick={() => n.children.length > 0 && toggle(key)}
            >
              <button
                type="button"
                aria-label={expanded ? 'Collapse' : 'Expand'}
                className={`mr-1 h-[11px] w-[11px] border border-control-dark bg-white text-[9px] leading-[9px] text-black ${n.children.length > 0 ? '' : 'invisible'}`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => toggle(key)}
              >
                {expanded ? '−' : '+'}
              </button>
              {n.text}
            </div>
            {expanded && n.children.length > 0 && render(n.children, key)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="relative h-full">
      <div
        role="tree"
        aria-label="Kruti Level"
        className="h-full overflow-auto border border-control-dark bg-white [&>ul]:pl-1"
        style={{ fontFamily: "'Arial Unicode MS', var(--font-grid-header)", fontSize: 21 }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuAt({ x: e.clientX, y: e.clientY });
        }}
      >
        {render(roots, '')}
      </div>
      {menuAt && (
        <ContextMenu items={menuItems} at={menuAt} label="Record" onClose={() => setMenuAt(null)} />
      )}
    </div>
  );
}

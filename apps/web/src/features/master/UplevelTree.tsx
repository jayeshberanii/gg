'use client';

import type { PickList } from '@gglib/shared';
import { useState } from 'react';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';

/** A TreeNode: its text and its Tag (the record id). */
export type UplevelNode = { text: string; tag: number; children: UplevelNode[] };

/**
 * FillTree + clsCommon.AddChildNode: one root per selected grid row, and below each node the
 * records whose up level it is (dtTree.Select("<up>=<tag>", "<id>")), in id order, recursively.
 * `rows` is dtTree as [id, text, up level]. The desktop recursed without end on a loop; this
 * gives up after 1000 nodes under one root.
 */
export function buildUplevelTree(
  roots: { text: string; id: number }[],
  rows: PickList,
): UplevelNode[] {
  const byParent = new Map<number, { id: number; text: string }[]>();
  for (const r of rows.rows) {
    const parent = Number(r[2]);
    const list = byParent.get(parent) ?? [];
    list.push({ id: Number(r[0]), text: String(r[1] ?? '') });
    byParent.set(parent, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.id - b.id);

  return roots.map((root) => {
    let count = 0;
    const add = (node: UplevelNode) => {
      for (const c of byParent.get(node.tag) ?? []) {
        if (++count > 1000) return;
        const child: UplevelNode = { text: c.text, tag: c.id, children: [] };
        node.children.push(child);
        add(child);
      }
    };
    const node: UplevelNode = { text: root.text, tag: root.id, children: [] };
    add(node);
    return node;
  });
}

/** Print Tree's SetTree: each level one tab deeper (GetSpace), for SendtoWord. */
export function uplevelTreeText(roots: UplevelNode[]): string {
  let out = '';
  const walk = (node: UplevelNode, level: number) => {
    for (const child of node.children) {
      out += `\r\n${'\t'.repeat(level + 1)}${child.text}`;
      walk(child, level + 1);
    }
  };
  for (const root of roots) {
    out += `\r\n${root.text}`;
    walk(root, 0);
  }
  return out;
}

/**
 * tvTree over the grid (Visible in place of dgMain): expanded, Arial Unicode MS 12pt, sharing the
 * grid's right-click menu. Selecting a node loads that record (tvTree_AfterSelect).
 */
export function UplevelTree({
  label,
  roots,
  selectedTag,
  onSelect,
  menuItems,
  size = { w: 515, h: 342 },
}: {
  label: string;
  roots: UplevelNode[];
  selectedTag: number | null;
  onSelect: (tag: number) => void;
  menuItems: ContextMenuItem[];
  /** tvTree.Size in the designer. */
  size?: { w: number; h: number };
}) {
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);

  const render = (nodes: UplevelNode[], path: string) => (
    <ul role="group" className="pl-5">
      {nodes.map((n, i) => (
        <li
          key={`${path}-${i}`}
          role="treeitem"
          aria-selected={selectedTag === n.tag}
          aria-expanded
        >
          <span
            className={`cursor-default whitespace-nowrap px-0.5 ${selectedTag === n.tag ? 'bg-selection text-white' : ''}`}
            onMouseDown={() => n.tag > 0 && onSelect(n.tag)}
          >
            {n.text}
          </span>
          {n.children.length > 0 && render(n.children, `${path}-${i}`)}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="relative h-full">
      <div
        role="tree"
        aria-label={label}
        className="absolute left-0 top-0 overflow-auto border border-control-dark bg-white [&>ul]:pl-1"
        style={{
          width: size.w,
          height: size.h,
          fontFamily: "'Arial Unicode MS', var(--font-grid-header)",
          fontSize: 16,
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuAt({ x: e.clientX, y: e.clientY });
        }}
      >
        {render(roots, 'n')}
      </div>
      {menuAt && (
        <ContextMenu items={menuItems} at={menuAt} label="Record" onClose={() => setMenuAt(null)} />
      )}
    </div>
  );
}

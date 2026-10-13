'use client';

import type { GridValue } from '@gglib/shared';
import { useState } from 'react';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';

/** A TreeNode: its text, its Tag (an authorcokm) and its CheckBox. */
export type TreeNode = { text: string; tag: number; checked: boolean; children: TreeNode[] };

/** FillTree's link rows: Authorkt, Guru1kt, Guru (the name the child node shows). */
export type TreeLinks = { columns: string[]; rows: GridValue[][] };

/**
 * frmAuthorMaster.FillTree / FillTree1 + AddChildNode: one root per selected grid row, and
 * below it the gurus (Uplevel: rows where Authorkt is the node) or the disciples (Downlevel:
 * rows where Guru1kt is the node), recursively, in id order. Like the desktop it gives up after
 * 1000 nodes under one root, which also stops a guru chain that loops back on itself.
 */
export function buildTree(
  roots: { text: string; id: number }[],
  links: TreeLinks,
  uplevel: boolean,
): TreeNode[] {
  const col = (name: string) => links.columns.indexOf(name);
  const [iAuthor, iGuru1, iName] = [col('Authorkt'), col('Guru1kt'), col('Guru')];
  const search = uplevel ? iAuthor : iGuru1;
  const tagOf = uplevel ? iGuru1 : iAuthor;
  const bySearch = new Map<number, GridValue[][]>();
  for (const r of links.rows) {
    const key = Number(r[search]);
    bySearch.set(key, [...(bySearch.get(key) ?? []), r]);
  }
  for (const list of bySearch.values()) list.sort((a, b) => Number(a[tagOf]) - Number(b[tagOf]));

  return roots.map((root) => {
    let count = 0;
    const add = (node: TreeNode) => {
      count++;
      if (count > 1000) return;
      for (const r of bySearch.get(node.tag) ?? []) {
        const child: TreeNode = {
          text: String(r[iName] ?? ''),
          tag: Number(r[tagOf]),
          checked: false,
          children: [],
        };
        node.children.push(child);
        add(child);
      }
    };
    const node: TreeNode = { text: root.text, tag: root.id, checked: false, children: [] };
    add(node);
    return node;
  });
}

/** SetTree: the tree as text, each level one tab deeper (GetSpace), for SendtoWord. */
export function treeText(roots: TreeNode[], onlyChecked: boolean): string {
  let out = '';
  const walk = (node: TreeNode, level: number) => {
    for (const child of node.children) {
      if (child.checked || !onlyChecked) out += `\r\n${'\t'.repeat(level + 1)}${child.text}`;
      walk(child, level + 1);
    }
  };
  for (const root of roots) {
    if (root.checked || !onlyChecked) out += `\r\n${root.text}`;
    walk(root, 0);
  }
  return out;
}

/** The ticked nodes' ids, roots first then their descendants (SetCheckedTreeTag). */
export function checkedIds(roots: TreeNode[]): number[] {
  const ids: number[] = [];
  const walk = (node: TreeNode) => {
    for (const child of node.children) {
      if (child.checked) ids.push(child.tag);
      walk(child);
    }
  };
  for (const root of roots) {
    if (root.checked) ids.push(root.tag);
    walk(root);
  }
  return ids;
}

/**
 * tvTree: CheckBoxes, Arial Unicode MS 12pt, 515 × 296 at the panel's top left, sharing the
 * grid's right-click menu. Selecting a node loads that author (AfterSelect); double-clicking
 * gives its children its own tick and expands it.
 */
export function AuthorTree({
  roots,
  onChange,
  selectedTag,
  onSelect,
  menuItems,
}: {
  roots: TreeNode[];
  onChange: (roots: TreeNode[]) => void;
  selectedTag: number | null;
  onSelect: (tag: number) => void;
  menuItems: ContextMenuItem[];
}) {
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);

  /** Replaces one node (found by path) and hands back a new tree. */
  function update(path: number[], fn: (n: TreeNode) => TreeNode) {
    const rec = (nodes: TreeNode[], depth: number): TreeNode[] =>
      nodes.map((n, i) =>
        i !== path[depth]
          ? n
          : depth === path.length - 1
            ? fn(n)
            : { ...n, children: rec(n.children, depth + 1) },
      );
    onChange(rec(roots, 0));
  }

  const render = (nodes: TreeNode[], path: number[]) => (
    <ul role="group" className="pl-5">
      {nodes.map((n, i) => {
        const here = [...path, i];
        return (
          <li key={i} role="treeitem" aria-selected={selectedTag === n.tag} aria-expanded>
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <input
                type="checkbox"
                aria-label={n.text}
                checked={n.checked}
                onChange={(e) => update(here, (x) => ({ ...x, checked: e.target.checked }))}
              />
              <span
                className={`cursor-default px-0.5 ${selectedTag === n.tag ? 'bg-selection text-white' : ''}`}
                onMouseDown={() => n.tag > 0 && onSelect(n.tag)}
                onDoubleClick={() =>
                  update(here, (x) => ({
                    ...x,
                    children: x.children.map((c) => ({ ...c, checked: x.checked })),
                  }))
                }
              >
                {n.text}
              </span>
            </span>
            {n.children.length > 0 && render(n.children, here)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="relative h-full">
      <div
        role="tree"
        aria-label="Author Tree"
        className="absolute left-[3px] top-[3px] h-[296px] w-[515px] overflow-auto border border-control-dark bg-white [&>ul]:pl-1"
        style={{ fontFamily: "'Arial Unicode MS', var(--font-grid-header)", fontSize: 16 }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuAt({ x: e.clientX, y: e.clientY });
        }}
      >
        {render(roots, [])}
      </div>
      {menuAt && (
        <ContextMenu items={menuItems} at={menuAt} label="Record" onClose={() => setMenuAt(null)} />
      )}
    </div>
  );
}

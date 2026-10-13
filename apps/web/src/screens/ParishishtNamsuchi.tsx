'use client';

import { AgGridReact } from 'ag-grid-react';
import { useMemo, useState } from 'react';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import { dataGridViewTheme } from '@/components/ui/gridTheme';
import { Modal, ToolButton, ToolSeparator } from '@/components/ui/Modal';
import { MasterScreen } from '@/features/master/MasterScreen';
import type { ScreenActions, ScreenSpec } from '@/features/master/types';
import type { ScreenProps } from './registry';

/**
 * Master › Parishisht Namsuchi (frmParishistNamSuchi, titled "Parishist Nam Suchi"). Field and
 * column positions, widths and headers are the ones in frmParishistNamSuchi.Designer.vb.
 */
function makeSpec(openPublication: () => void): ScreenSpec {
  return {
    screen: 'parishisht-namsuchi',
    panelHeight: 56,
    panelWidth: 1008,
    entryLabel: true,
    deleteSelected: true,
    fields: [
      { name: 'Name', label: 'Name', labelAt: { x: 13, y: 13 }, at: { x: 68, y: 10, w: 212 } },
      {
        name: 'ParishistPublicationKt',
        at: { x: 861, y: 10, w: 125 },
        kt: true,
        nameColumn: 'ParishistPublicationName',
      },
    ],
    labels: [{ text: 'Publication', at: { x: 764, y: 13 }, onClick: openPublication }],
    columns: [
      { header: 'ParishistNamSuchiKm', field: 'ParishistNamSuchiKm', width: 5 },
      { header: 'ParishistPublicationKt', field: 'ParishistPublicationKt', hidden: true },
      { header: 'Publication', field: 'ParishistPublicationName', width: 200 },
      { header: 'Name', field: 'Name', width: 450 },
    ],
  };
}

/** cntMenu: Print Report › Selected Column / Send To Excel / Print Parishisht. */
function menu(a: ScreenActions): ContextMenuItem[] {
  return [
    {
      kind: 'submenu',
      label: 'Print Report',
      items: [
        { kind: 'item', label: 'Selected Column', onSelect: a.printSelectedColumn },
        { kind: 'item', label: 'Send To Excel', onSelect: a.sendToExcel },
        {
          kind: 'item',
          label: 'Print Parishisht',
          onSelect: () => void a.run('print-parishisht', undefined, a.selectedIds),
        },
        ...a.printLayouts,
      ],
    },
  ];
}

export function ParishishtNamsuchi(props: ScreenProps) {
  const [publicationOpen, setPublicationOpen] = useState(false);
  const spec = useMemo(() => makeSpec(() => setPublicationOpen(true)), []);
  return (
    <>
      <MasterScreen spec={spec} {...props} menu={menu} />
      {publicationOpen && <ParishishtPublication onClose={() => setPublicationOpen(false)} />}
    </>
  );
}

const publicationGridTheme = dataGridViewTheme();

/**
 * lnkPublication opens frmParishistPublication with ShowDialog. That form has no code at all
 * (its class is empty): a frmMasterPage whose toolbar has no handlers and whose grid is never
 * filled. The web dialog is the same empty form.
 */
function ParishishtPublication({ onClose }: { onClose: () => void }) {
  const noop = () => undefined;
  return (
    <Modal title="Parishisht Publication" width={911} onClose={onClose}>
      <div role="toolbar" aria-label="Record" className="win-toolstrip">
        {(['new', 'save', 'modify', 'cancel', 'copy', 'delete', 'refresh'] as const).map((icon) => (
          <span key={icon} className="flex items-center">
            <ToolButton icon={icon} label={icon[0]!.toUpperCase() + icon.slice(1)} onClick={noop} />
            <ToolSeparator />
          </span>
        ))}
        <ToolButton icon="exit" label="Exit" onClick={noop} />
      </div>
      <div className="relative" style={{ height: 185 }}>
        <span className="win-label absolute" style={{ left: 7, top: 9 }}>
          Publication
        </span>
        <input
          aria-label="Publication"
          className="win-textbox absolute"
          style={{ left: 141, top: 5, width: 103 }}
        />
        <span className="win-label absolute" style={{ left: 279, top: 9 }}>
          Vibhag
        </span>
        <input
          aria-label="Vibhag"
          className="win-textbox absolute"
          style={{ left: 346, top: 5, width: 97 }}
        />
      </div>
      <div className="dgv" style={{ height: 212 }}>
        <AgGridReact
          theme={publicationGridTheme}
          rowData={[]}
          columnDefs={[
            { headerName: 'ParishistPublicationKm', width: 5 },
            { headerName: 'Publication', width: 200 },
            { headerName: 'Vibhag', width: 400 },
          ]}
          overlayNoRowsTemplate=" "
        />
      </div>
    </Modal>
  );
}

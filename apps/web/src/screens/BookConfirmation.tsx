'use client';

import { useMemo } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { MasterScreen } from '@/features/master/MasterScreen';
import type { ScreenSpec } from '@/features/master/types';
import type { ScreenProps } from './registry';

/**
 * Issue › Book Confirmation (frmBookConfirmation). Positions, widths and headers are
 * frmBookConfirmation.designer.vb's; every panel box is ReadOnly there.
 */
function buildSpec(userId: number | null): ScreenSpec {
  return {
    screen: 'book-confirmation',
    panelHeight: 92,
    panelWidth: 1008,
    // ShowHideButton(ToolStrip1, 0, 0, 0, 0, 0, 1, 1, 0, 0): Delete and Refresh.
    fixedButtons: ['delete', 'refresh'],
    fields: [
      {
        name: 'BookTKt',
        label: 'LibNo/Ank',
        labelAt: { x: 12, y: 18 },
        at: { x: 107, y: 12, w: 107 },
        kt: true,
        nameColumn: 'BookTName',
        readOnly: true,
      },
      { name: 'Ank', at: { x: 215, y: 12, w: 107 }, readOnly: true },
      {
        name: 'BookConfirmationStatus',
        label: 'Status',
        labelAt: { x: 12, y: 55 },
        at: { x: 107, y: 49, w: 215 },
        readOnly: true,
      },
      {
        name: 'BookSentByKt',
        label: 'Sent By',
        labelAt: { x: 336, y: 18 },
        at: { x: 421, y: 12, w: 215 },
        kt: true,
        nameColumn: 'BookSentByName',
        readOnly: true,
      },
      {
        name: 'BookSentDate',
        label: 'Sent Date',
        labelAt: { x: 336, y: 57 },
        at: { x: 421, y: 49, w: 215 },
        readOnly: true,
        datetimeText: true,
      },
      {
        name: 'BookReceivedByKt',
        label: 'Received By',
        labelAt: { x: 660, y: 18 },
        at: { x: 781, y: 12, w: 215 },
        kt: true,
        nameColumn: 'BookReceivedByName',
        readOnly: true,
      },
      {
        name: 'BookReceivedDate',
        label: 'Received Date',
        labelAt: { x: 660, y: 55 },
        at: { x: 781, y: 49, w: 215 },
        readOnly: true,
        datetimeText: true,
      },
    ],
    columns: [
      { header: 'BookConfirmationkm', field: 'BookConfirmationKm', width: 5 },
      { header: 'LibNo', field: 'BookTName' },
      { header: 'Ank', field: 'Ank' },
      { header: 'Status', field: 'BookConfirmationStatus' },
      { header: 'SentByKt', field: 'BookSentByKt', hidden: true },
      { header: 'Sent By', field: 'BookSentByName', width: 140 },
      { header: 'Sent Date', field: 'BookSentDate', width: 200, format: 'datetime12' },
      { header: 'Received By', field: 'BookReceivedByName', width: 140 },
      { header: 'Received Date', field: 'BookReceivedDate', width: 200, format: 'datetime12' },
    ],
    // dgMain_CellFormatting: Sent rows black, Received rows green.
    rowTextColor: (row) => (row.BookConfirmationStatus === 'Received' ? '#008000' : undefined),
    contextMenu: (a) => {
      const row = a.currentRow;
      // cntMain_Opening: only for a Sent row someone else sent.
      const canReceive =
        row !== null && row.BookConfirmationStatus === 'Sent' && row.BookSentByKt !== userId;
      return [
        {
          kind: 'submenu',
          label: 'For Selected Record',
          // BookMToolStripMenuItem has no Click handler on the desktop.
          items: [{ kind: 'item', label: 'BookM', disabled: true, onSelect: () => undefined }],
        },
        {
          kind: 'submenu',
          label: 'Utility',
          items: [
            ...(canReceive
              ? [
                  {
                    kind: 'item' as const,
                    label: 'Receive Confirmation',
                    onSelect: async () => {
                      if (
                        await a.confirm(
                          'Are you sure to receive confirmation for selected records?',
                        )
                      )
                        await a.run('receive');
                    },
                  },
                ]
              : []),
            { kind: 'item', label: 'Show All Records', onSelect: () => void a.run('show-all') },
          ],
        },
      ];
    },
  };
}

export function BookConfirmation(props: ScreenProps) {
  const auth = useAuth();
  const userId = auth.status === 'authenticated' ? auth.user.id : null;
  const spec = useMemo(() => buildSpec(userId), [userId]);
  return <MasterScreen spec={spec} {...props} />;
}

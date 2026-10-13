import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import type { ScreenActions, TransSpec } from '@/features/master/types';

/**
 * What Letter Bhet and Letter Demand share on the web (they are near line-for-line twins on the
 * desktop): the Book Detail popup and the right-click menu's shape.
 */

/**
 * txtBookTran's popup: frmDisplayTransNew with TranName "LetterBookT", FormName "Common"
 * (SetForm_Common: LetterBookKm hidden, BookName and Nakal typed in, no cell lists). Its rows
 * are saved (delete-then-insert) only when the box's summary no longer reads as loaded.
 */
export const BOOK_TRAN: TransSpec = {
  column: 'BookTran',
  common: true,
  hidden: ['LetterBookKm'],
  editable: ['BookName', 'Nakal'],
  lookups: {},
  tempKey: 'LetterBookKm',
  firstColumn: 'BookName',
  summary: 'generic',
  onlyWhenTextChanged: true,
};

/**
 * cntMain: Print Report (Selected Column with its saved layouts, Send To Excel, and the form's
 * Crystal report as an HTML print view for the current row), Send To, and Utility › Show
 * Attachments.
 */
export function letterMenu(
  a: ScreenActions,
  opts: {
    printLabel: string;
    printAction: string;
    sendTo?: { label: string; action: string };
    attachmentsLabel: string;
  },
): ContextMenuItem[] {
  return [
    {
      kind: 'submenu',
      label: 'Print Report',
      items: [
        a.printLayouts.length > 0
          ? {
              kind: 'submenu',
              label: 'Selected Column',
              items: a.printLayouts,
              onSelect: a.printSelectedColumn,
            }
          : { kind: 'item', label: 'Selected Column', onSelect: a.printSelectedColumn },
        { kind: 'item', label: 'Send To Excel', onSelect: a.sendToExcel },
        {
          kind: 'item',
          label: opts.printLabel,
          // crReport.SetParameterValue(…, dgMain.CurrentRow …): the current row only.
          onSelect: () => {
            if (a.currentId !== null) void a.run(opts.printAction, undefined, [a.currentId]);
          },
        },
      ],
    },
    ...(opts.sendTo
      ? [
          {
            kind: 'submenu',
            label: 'Send To',
            items: [
              {
                kind: 'item',
                label: opts.sendTo.label,
                onSelect: () => void a.run(opts.sendTo!.action),
              },
            ],
          } satisfies ContextMenuItem,
        ]
      : []),
    {
      kind: 'submenu',
      label: 'Utility',
      items: [{ kind: 'item', label: opts.attachmentsLabel, onSelect: a.showAttachments }],
    },
  ];
}

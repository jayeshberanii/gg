'use client';

import { MasterScreen } from '@/features/master/MasterScreen';
import type { ScreenSpec } from '@/features/master/types';
import type { ScreenProps } from './registry';

/**
 * Master › Author Type Master (frmAuthorType). Field and column positions, widths and headers
 * are the ones in frmAuthorType.designer.vb.
 */
const spec: ScreenSpec = {
  screen: 'author-type-master',
  panelHeight: 185,
  panelWidth: 1008,
  fields: [
    { name: 'authortype', label: 'Name', labelAt: { x: 13, y: 22 }, at: { x: 116, y: 18, w: 374 } },
    {
      name: 'authtyattr',
      label: 'Attribute',
      labelAt: { x: 13, y: 62 },
      at: { x: 116, y: 58, w: 374 },
    },
    { name: 'brif', label: 'Brief', labelAt: { x: 13, y: 102 }, at: { x: 116, y: 98, w: 374 } },
    { name: 'remark', label: 'Remark', labelAt: { x: 13, y: 142 }, at: { x: 116, y: 138, w: 374 } },
    {
      name: 'short_name',
      label: 'Short Name',
      labelAt: { x: 525, y: 22 },
      at: { x: 629, y: 18, w: 360 },
    },
    {
      name: 'uplevalkt',
      label: 'Uplevel',
      labelAt: { x: 525, y: 62 },
      at: { x: 629, y: 58, w: 360 },
      kt: true,
      nameColumn: 'UplevalName',
    },
    {
      name: 'hindiword',
      label: 'Hindi Word',
      labelAt: { x: 525, y: 102 },
      at: { x: 629, y: 98, w: 360 },
    },
    { name: 'IsPrint', at: { x: 529, y: 143, w: 78 }, checkbox: 'IsPrint' },
  ],
  columns: [
    { header: 'Id', field: 'authtycokm', width: 80 },
    { header: 'Author Type', field: 'authortype' },
    { header: 'AuthAttr', field: 'authtyattr' },
    { header: 'Brief', field: 'brif' },
    { header: 'Remark', field: 'remark', width: 130 },
    { header: 'Short Name', field: 'short_name' },
    { header: 'UpLevel', field: 'UplevalName', width: 110 },
    { header: 'Hindi Word', field: 'hindiword', width: 120 },
    { header: 'CountI', field: 'countI', width: 120 },
    { header: 'Counters', field: 'counters', width: 130 },
  ],
  contextMenu: ({ run }) => [
    // {
    //   kind: 'item',
    //   label: 'Show Records Not Used In Book',
    //   onSelect: () => run('not-used-in-book'),
    // },
    // { kind: 'item', label: 'Update AuthorType Count', onSelect: () => run('update-count') },
    {
      kind: 'submenu',
      label: 'Show In Use',
      items: [
        { kind: 'item', label: 'Kruti Master', onSelect: () => run('in-use-kruti') },
        // { kind: 'item', label: 'Prakashan List', onSelect: () => run('in-use-prakashan-list') },
        { kind: 'item', label: 'Author Master', onSelect: () => run('in-use-author') },
        {
          kind: 'submenu',
          label: 'BookM',
          items: [
            { kind: 'item', label: 'Author', onSelect: () => run('in-use-book-author') },
            {
              kind: 'item',
              label: 'Magazine Vishesh',
              onSelect: () => run('in-use-book-magazine-vishesh'),
            },
          ],
        },
      ],
    },
  ],
};

export function AuthorTypeMaster(props: ScreenProps) {
  return <MasterScreen spec={spec} {...props} />;
}

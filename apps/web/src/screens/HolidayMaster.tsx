'use client';

import { MasterScreen } from '@/features/master/MasterScreen';
import type { ScreenSpec } from '@/features/master/types';
import type { ScreenProps } from './registry';

/**
 * Employee › Holiday (frmHolidayM). Positions, widths and headers are frmHolidayM.designer.vb's;
 * the Day column is HolidayDate again with Format "dddd".
 */
const spec: ScreenSpec = {
  screen: 'holiday',
  panelHeight: 107,
  panelWidth: 1008,
  fields: [
    {
      name: 'HolidayName',
      label: 'Holiday Name',
      labelAt: { x: 13, y: 22 },
      at: { x: 136, y: 18, w: 227 },
      noF2: true,
    },
    {
      name: 'HolidayDate',
      label: 'Holiday Date',
      labelAt: { x: 13, y: 63 },
      at: { x: 136, y: 60, w: 227 },
      date: true,
    },
  ],
  columns: [
    { header: 'Id', field: 'HolidayMKm', width: 80 },
    { header: 'Holiday Name', field: 'HolidayName', width: 400 },
    { header: 'Holiday Date', field: 'HolidayDate', width: 125, format: 'date' },
    { header: 'Day', field: 'HolidayDate', format: 'weekday' },
    { header: 'ModUser', field: 'modusername' },
    { header: 'Mod Date', field: 'moddate', format: 'date' },
  ],
  contextMenu: ({ run }) => [
    { kind: 'item', label: 'Show All Records', onSelect: () => run('show-all') },
  ],
};

export function HolidayMaster(props: ScreenProps) {
  return <MasterScreen spec={spec} {...props} />;
}

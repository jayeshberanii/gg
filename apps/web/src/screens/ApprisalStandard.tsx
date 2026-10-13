'use client';

import { MasterScreen } from '@/features/master/MasterScreen';
import type { ScreenSpec } from '@/features/master/types';
import type { ScreenProps } from './registry';

/**
 * Master › Apprisal Standard (frmApprisalStandard, titled "Appraisal Standards"). Field and
 * column positions, widths and headers are the ones in frmApprisalStandard.designer.vb.
 */
const spec: ScreenSpec = {
  screen: 'apprisal-standard',
  panelHeight: 88,
  panelWidth: 1008,
  fields: [
    {
      name: 'VibhagKt',
      label: 'Vibhag',
      labelAt: { x: 8, y: 23 },
      at: { x: 105, y: 18, w: 197 },
      kt: true,
      nameColumn: 'VibhagName',
    },
    {
      name: 'WorkTypeKt',
      label: 'Work Type',
      labelAt: { x: 332, y: 23 },
      at: { x: 426, y: 18, w: 197 },
      kt: true,
      nameColumn: 'WorkTypeName',
    },
    {
      name: 'PerHourWorkQty',
      label: 'Work Qty(Per Hour)',
      labelAt: { x: 673, y: 23 },
      at: { x: 840, y: 18, w: 158 },
    },
    {
      name: 'TableName',
      label: 'Form Name',
      labelAt: { x: 8, y: 60 },
      at: { x: 105, y: 55, w: 197 },
    },
    { name: 'IsManualEntry', at: { x: 336, y: 60, w: 128 }, checkbox: 'Manual Entry' },
  ],
  columns: [
    { header: 'Id', field: 'ApprisalStandardKm', width: 5 },
    { header: 'Vibhag', field: 'VibhagName', width: 250 },
    { header: 'Work Type', field: 'WorkTypeName', width: 250 },
    { header: 'Work Qty(Per Hour)', field: 'PerHourWorkQty', width: 130 },
    { header: 'IsManualEntry', field: 'IsManualEntry' },
    { header: 'Form Name', field: 'TableName' },
  ],
};

export function ApprisalStandard(props: ScreenProps) {
  return <MasterScreen spec={spec} {...props} />;
}

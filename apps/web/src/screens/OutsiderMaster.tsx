'use client';

import { MasterScreen } from '@/features/master/MasterScreen';
import type { ScreenSpec } from '@/features/master/types';
import type { ScreenProps } from './registry';

/**
 * Issue › Outsider(Visitor) Master (frmOutsiderM, "Outsider Master"). Positions, widths and
 * headers are frmOutsiderM.designer.vb's.
 */
const spec: ScreenSpec = {
  screen: 'outsider-master',
  panelHeight: 274,
  panelWidth: 1008,
  fields: [
    {
      name: 'partymkt',
      label: 'Party Name',
      labelAt: { x: 13, y: 22 },
      at: { x: 115, y: 18, w: 227 },
      kt: true,
      nameColumn: 'partymName',
    },
    {
      name: 'VisitTypekt',
      label: 'Visit Type',
      labelAt: { x: 13, y: 62 },
      at: { x: 115, y: 58, w: 227 },
      kt: true,
      nameColumn: 'VisitTypeName',
    },
    {
      name: 'VisitDate',
      label: 'Visit Date',
      labelAt: { x: 13, y: 109 },
      at: { x: 115, y: 105, w: 227 },
      date: true,
    },
    { name: 'demand', label: 'Demand', labelAt: { x: 13, y: 149 }, at: { x: 115, y: 145, w: 227 } },
    {
      name: 'suggestion',
      label: 'Suggestion',
      labelAt: { x: 13, y: 189 },
      at: { x: 115, y: 185, w: 227 },
    },
    {
      name: 'attendedbykt',
      label: 'Attended By',
      labelAt: { x: 361, y: 22 },
      at: { x: 543, y: 18, w: 161 },
      kt: true,
      nameColumn: 'attendedbyName',
    },
    {
      name: 'AttendentRemark',
      label: 'Attendent Remark',
      labelAt: { x: 361, y: 63 },
      at: { x: 543, y: 59, w: 161 },
    },
    {
      name: 'LetterTypekt',
      label: 'Letter Type',
      labelAt: { x: 361, y: 104 },
      at: { x: 543, y: 100, w: 161 },
      kt: true,
      nameColumn: 'LetterTypeName',
    },
    {
      name: 'DemandApprovedbykt',
      label: 'Demand Approved By',
      labelAt: { x: 361, y: 145 },
      at: { x: 543, y: 141, w: 161 },
      kt: true,
      nameColumn: 'DemandApprovedbyName',
    },
    {
      name: 'ApprovalComments',
      label: 'Approval Comments',
      labelAt: { x: 361, y: 186 },
      at: { x: 543, y: 182, w: 161 },
    },
    {
      name: 'WorkDonebykt',
      label: 'WorkDone By',
      labelAt: { x: 715, y: 28 },
      at: { x: 844, y: 24, w: 158 },
      kt: true,
      nameColumn: 'WorkDonebyName',
    },
    {
      name: 'WorkRemark',
      label: 'Work Remark',
      labelAt: { x: 715, y: 68 },
      at: { x: 844, y: 64, w: 158 },
      noF2: true,
    },
    {
      name: 'WorkTime',
      label: 'Work Time',
      labelAt: { x: 715, y: 108 },
      at: { x: 844, y: 104, w: 158 },
      mask: '90:00',
      noF2: true,
    },
    {
      name: 'Statuskt',
      label: 'Status',
      labelAt: { x: 715, y: 142 },
      at: { x: 844, y: 138, w: 158 },
      kt: true,
      nameColumn: 'StatusName',
    },
    {
      name: 'OutputTypekt',
      label: 'Output Type',
      labelAt: { x: 712, y: 178 },
      at: { x: 841, y: 174, w: 161 },
      kt: true,
      nameColumn: 'OutputTypeName',
    },
    {
      name: 'DataGivenDt',
      label: 'DataGiven Date',
      labelAt: { x: 715, y: 222 },
      at: { x: 844, y: 218, w: 158 },
      date: true,
    },
  ],
  columns: [
    { header: 'Id', field: 'OutsiderMkm', width: 80 },
    { header: 'Visit Date', field: 'VisitDate', format: 'date' },
    { header: 'PartyMkt', field: 'partymkt', hidden: true },
    { header: 'Party Name', field: 'partymName', width: 150 },
    { header: 'Visit Type', field: 'VisitTypeName' },
    { header: 'Attendedbykt', field: 'attendedbykt', hidden: true },
    { header: 'Attended By', field: 'attendedbyName', width: 150 },
    { header: 'DemandApprovedBykt', field: 'DemandApprovedbykt', hidden: true, width: 20 },
    { header: 'DemandApproved By', field: 'DemandApprovedbyName', width: 35 },
    { header: 'WorkDoneBykt', field: 'WorkDonebykt', hidden: true },
    { header: 'Work DoneBy', field: 'WorkDonebyName' },
    { header: 'Status', field: 'StatusName' },
    { header: 'Work Time', field: 'WorkTime', format: 'time' },
  ],
  contextMenu: (a) => [
    {
      kind: 'submenu',
      label: 'Send To',
      items: [{ kind: 'item', label: 'Party Master', onSelect: () => void a.run('send-to-party') }],
    },
    {
      kind: 'submenu',
      label: 'Utility',
      items: [{ kind: 'item', label: 'Show Attachments', onSelect: a.showAttachments }],
    },
  ],
};

export function OutsiderMaster(props: ScreenProps) {
  return <MasterScreen spec={spec} {...props} />;
}

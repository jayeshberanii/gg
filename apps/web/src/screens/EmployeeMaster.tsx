'use client';

import { canEditEmployeeUserType, isEmployeePrivileged } from '@gglib/shared';
import { MasterScreen } from '@/features/master/MasterScreen';
import type { FieldSpec, ScreenSpec } from '@/features/master/types';
import type { ScreenProps } from './registry';

/**
 * Employee › Employee Master (frmEmployeeNew). Positions, widths and headers are
 * frmEmployeeNew.Designer.vb's. The password box is write-only unless the server sent its
 * value (the Show Password rule); New / Copy / Delete, Working Hrs, Active, the Search By combo
 * and the Utility menu are for IsAdmin and users 5 / 13; User Type and Reporting To for IsAdmin
 * or AMaster. The API enforces each of these itself.
 */
const privilegedOnly: Partial<FieldSpec> = { editableFor: isEmployeePrivileged };
const typeEditors: Partial<FieldSpec> = { editableFor: canEditEmployeeUserType };

const spec: ScreenSpec = {
  screen: 'employee-master',
  panelHeight: 291,
  panelWidth: 1008,
  addDeleteBy: isEmployeePrivileged,
  fields: [
    {
      name: 'Employee_Name',
      label: 'Employee Name',
      labelAt: { x: 13, y: 22 },
      at: { x: 149, y: 18, w: 163 },
    },
    {
      name: 'uname',
      label: 'User Name',
      labelAt: { x: 13, y: 63 },
      at: { x: 149, y: 58, w: 163 },
      noF2: true,
    },
    {
      name: 'upwd',
      label: 'Password',
      labelAt: { x: 13, y: 104 },
      at: { x: 149, y: 98, w: 146 },
      noF2: true,
      password: { showAt: { x: 297, y: 107 } },
    },
    {
      name: 'DOB',
      label: 'Birth Date',
      labelAt: { x: 13, y: 145 },
      at: { x: 149, y: 138, w: 163 },
      date: true,
      keepEmptyDate: true,
    },
    {
      name: 'DOJ',
      label: 'Joining Date',
      labelAt: { x: 13, y: 186 },
      at: { x: 149, y: 178, w: 163 },
      date: true,
      keepEmptyDate: true,
    },
    {
      name: 'Refnm',
      label: 'Reference Name',
      labelAt: { x: 13, y: 227 },
      at: { x: 149, y: 218, w: 163 },
    },
    {
      name: 'UserTypeKt',
      label: 'User Type',
      labelAt: { x: 13, y: 267 },
      at: { x: 149, y: 258, w: 163 },
      kt: true,
      nameColumn: 'UserTypeName',
      ...typeEditors,
    },
    {
      name: 'Address',
      label: 'Address',
      labelAt: { x: 329, y: 22 },
      at: { x: 424, y: 18, w: 157 },
    },
    { name: 'Area', label: 'Area', labelAt: { x: 329, y: 63 }, at: { x: 424, y: 58, w: 157 } },
    { name: 'city', label: 'City/Pin', labelAt: { x: 329, y: 104 }, at: { x: 424, y: 98, w: 92 } },
    { name: 'Pincode', at: { x: 517, y: 98, w: 64 } },
    {
      name: 'Phoneno',
      label: 'Phoneno',
      labelAt: { x: 329, y: 145 },
      at: { x: 424, y: 138, w: 157 },
    },
    {
      name: 'Mobileno',
      label: 'Mobileno',
      labelAt: { x: 329, y: 186 },
      at: { x: 424, y: 178, w: 157 },
    },
    {
      name: 'EmailID',
      label: 'Email',
      labelAt: { x: 329, y: 227 },
      at: { x: 424, y: 218, w: 157 },
    },
    {
      name: 'IPAddress',
      label: 'IP Address',
      labelAt: { x: 329, y: 267 },
      at: { x: 424, y: 258, w: 157 },
    },
    // tblSearch's F2EntryText for vibhagkt is '': F2 does nothing, so it cannot be changed here.
    {
      name: 'vibhagkt',
      label: 'Vibhag',
      labelAt: { x: 593, y: 22 },
      at: { x: 703, y: 18, w: 134 },
      kt: true,
      nameColumn: 'VibhagName',
      noF2: true,
    },
    {
      name: 'Grading',
      label: 'Grading',
      labelAt: { x: 593, y: 63 },
      at: { x: 703, y: 58, w: 134 },
    },
    {
      name: 'WorkingHours',
      label: 'Working Hrs',
      labelAt: { x: 593, y: 104 },
      at: { x: 703, y: 98, w: 134 },
      mask: '90:00',
      noF2: true,
      ...privilegedOnly,
    },
    {
      name: 'per_hor_amount',
      label: 'Salary',
      labelAt: { x: 593, y: 145 },
      at: { x: 703, y: 138, w: 134 },
      noF2: true,
    },
    {
      name: 'Remark',
      label: 'Remark',
      labelAt: { x: 593, y: 186 },
      at: { x: 703, y: 179, w: 134 },
    },
    {
      name: 'ReportingToTran',
      label: 'Reporting To',
      labelAt: { x: 593, y: 227 },
      at: { x: 703, y: 218, w: 134 },
      trans: 'ReportingToTran',
      ...typeEditors,
    },
    { name: 'uadd', at: { x: 842, y: 17, w: 62 }, checkbox: 'Add' },
    { name: 'umodify', at: { x: 920, y: 17, w: 84 }, checkbox: 'Modify' },
    { name: 'udel', at: { x: 842, y: 58, w: 75 }, checkbox: 'Delete' },
    { name: 'IsActive', at: { x: 918, y: 61, w: 77 }, checkbox: 'Active', ...privilegedOnly },
  ],
  // The photo frame has no handler anywhere on the desktop: drawn empty.
  groups: [{ text: 'Empolyee Photo', at: { x: 856, y: 93, w: 141, h: 159 } }],
  trans: {
    // TranName "ReportingTo", FormName "usecurity" (SetForm_Usecurity).
    ReportingToTran: {
      column: 'ReportingToTran',
      hidden: ['EmployeeKt', 'ReportingToKt'],
      editable: [],
      lookups: {
        reportingtoname: { setKt: 'ReportingToKt', setName: 'ReportingToName' },
      },
      template: () => [0, 0, ''],
      firstColumn: 'ReportingToName',
      onlyWhenTextChanged: true,
    },
  },
  columns: [
    { header: 'Id', field: 'tid', width: 80 },
    { header: 'Employee Name', field: 'Employee_Name', width: 130 },
    { header: 'IPAddress', field: 'IPAddress', width: 125 },
    { header: 'Address', field: 'Address', width: 100 },
    { header: 'Area', field: 'Area', width: 100 },
    { header: 'City', field: 'city', width: 110 },
    { header: 'Pincode', field: 'Pincode', width: 120 },
    { header: 'PhoneNo', field: 'Phoneno', width: 120 },
    { header: 'MobileNo', field: 'Mobileno', width: 130 },
    { header: 'Email', field: 'EmailID', width: 100 },
    { header: 'BirthDate', field: 'DOB', width: 100, format: 'date' },
    { header: 'JoinDate', field: 'DOJ', width: 100, format: 'date' },
    // Unbound on the desktop (its DataPropertyName line is commented out): always blank.
    { header: 'Vibhag', field: '__vibhag_unbound', width: 100 },
    { header: 'Grading', field: 'Grading', width: 100 },
    { header: 'Reference', field: 'Refnm', width: 100 },
    { header: 'Salary', field: 'per_hor_amount', width: 100 },
  ],
  // Save(): MaskCompleted is checked before "Are You Sure to Save This Record?".
  validate: ({ fields }) =>
    /^\s?\d{1,2}:\d{2}$/.test(fields.WorkingHours ?? '') ? '' : 'Please Enter Working Hours',
  contextMenu: (a) =>
    a.user && isEmployeePrivileged(a.user)
      ? [
          {
            kind: 'submenu',
            label: 'Utility',
            items: [
              { kind: 'item', label: 'Show All Employees', onSelect: () => void a.run('show-all') },
              {
                kind: 'item',
                label: 'Show Active Employees',
                onSelect: () => void a.run('show-active'),
              },
              {
                kind: 'item',
                label: 'Show Inactive Employees',
                onSelect: () => void a.run('show-inactive'),
              },
            ],
          },
        ]
      : [],
};

export function EmployeeMaster(props: ScreenProps) {
  return <MasterScreen spec={spec} {...props} />;
}

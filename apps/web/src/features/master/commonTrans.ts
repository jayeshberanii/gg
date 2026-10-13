import { newTempId } from './DisplayTransDialog';
import type { TransSpec, TransState } from './types';

/**
 * frmDisplayTransNew's Address popup (TranName "Address", FormName "Common", SetForm_Common): the
 * PrakMAddT rows of an author, a party, a prakashak or a magazine, all under the tblSearch
 * column AddressTran.
 */
export const ADDRESS_TRANS: TransSpec = {
  column: 'AddressTran',
  common: true,
  hidden: ['prakMAddkm', 'citykt', 'statekt', 'category'],
  editable: ['Address', 'Pincode', 'PhoneNo', 'email', 'remark', 'PName', 'MobName', 'MobileNo'],
  lookups: {
    prakashakname: { setName: 'PrakashakName', next: 'Address' },
    city: { setKt: 'citykt', setName: 'City', next: 'Pincode' },
    categoryname: { setKt: 'category', setName: 'CategoryName', next: 'PName' },
  },
  tempKey: 'prakMAddkm',
  firstColumn: 'Address',
  onlyWhenTextChanged: true,
};

/**
 * A record's own frmVishayEntry lines, opened from a form box (FieldSpec.vishayEntry): the
 * popup under tblSearch column `column` (its F2EntryText lists the lines, its server lookups
 * are VISHAY_ENTRY_LOOKUPS). Copy gives every line Id 0, so the copy gets lines of its own.
 */
export function vishayEntryTrans(column: string): TransSpec {
  return {
    column,
    hidden: [],
    editable: [],
    lookups: {},
    firstColumn: 0,
    onCopy: copyWithNewKeys('Id', 'zero'),
  };
}

/**
 * Copy (btnCopy_Click) of a popup whose rows the copy must own: the key column becomes a new
 * temporary key (`temp`: the repository inserts rows whose key is negative) or 0 (`zero`:
 * VishayEntry lines with Id 0 are inserted). Without this the copy's save would rewrite the
 * original record's rows in place, as the desktop does.
 */
export function copyWithNewKeys(column: string, to: 'temp' | 'zero') {
  return (state: TransState): TransState => {
    const name = state.columns.find((c) => c.name.toLowerCase() === column.toLowerCase())?.name;
    if (!name) return state;
    return {
      ...state,
      rows: state.rows.map((r) => ({ ...r, [name]: to === 'temp' ? newTempId() : 0 })),
    };
  };
}

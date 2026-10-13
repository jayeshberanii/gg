import { describe, expect, it } from 'vitest';
import { reportedMinutes, timeDiff, validateWorkLog, type WorkLogRow } from './work-log.js';

const row = (over: Partial<WorkLogRow>): WorkLogRow => ({
  workId: 0,
  tableName: '',
  vibhagId: 1,
  vibhagName: 'V',
  workTypeId: 2,
  workTypeName: 'W',
  qty: 0,
  mistakeSum: 0,
  hrs: 0,
  min: 0,
  remark: '',
  isManualEntry: true,
  ...over,
});

describe('timeDiff (clsCommon.GetTimeDiff)', () => {
  it('formats to − from as HH:mm:ss', () => {
    expect(timeDiff('09:15:00', '17:40:30')).toBe('08:25:30');
  });

  it('returns null when a side is missing or the span is negative', () => {
    expect(timeDiff('09:00:00', null)).toBeNull();
    expect(timeDiff('10:00:00', '09:00:00')).toBeNull();
  });
});

describe('validateWorkLog (frmLogoutNew.GetValidationMessage)', () => {
  it('accepts a report within 5 minutes under the logged time', () => {
    expect(validateWorkLog([row({ hrs: 7, min: 56 })], '08:00:10')).toEqual([]);
  });

  it('rejects more reported time than logged', () => {
    expect(validateWorkLog([row({ hrs: 8, min: 1 })], '08:00:00')).toEqual([
      'Total Work Time cannot be Greater than : 08:00',
    ]);
  });

  it('rejects more than 5 minutes under the logged time', () => {
    expect(validateWorkLog([row({ hrs: 7, min: 54 })], '08:00:00')).toEqual([
      'Total Work Time cannot be Less than : 08:00',
    ]);
  });

  it('requires time on automatic rows and Vibhag / Work Type on timed rows, per line', () => {
    const messages = validateWorkLog(
      [
        row({ isManualEntry: false, tableName: 'BookM' }),
        row({ hrs: 1, vibhagId: 0, workTypeId: 0 }),
        row({}), // manual row with no time: allowed, and not saved
      ],
      '01:00:00',
    );
    expect(messages).toEqual([
      'Please Select Hrs/Min At Line 1',
      'Please Select Vibhag At Line 2',
      'Please Select Work Type At Line 2',
    ]);
  });

  it('carries minutes into hours correctly', () => {
    // The desktop subtracts 59 per carry (a bug); two 30-minute rows are exactly one hour.
    expect(reportedMinutes([row({ min: 30 }), row({ min: 30 })])).toBe(60);
  });
});

import { describe, expect, it } from 'vitest';
import { canDeliverLabIssue, labIssueButtonsOff, labIssueRowColor } from './lab-issue.js';

describe('Lab Issue rules (frmLabIssueMaster)', () => {
  it('lets only user type 3 deliver and return', () => {
    expect(canDeliverLabIssue({ userType: 3 })).toBe(true);
    for (const userType of [1, 2, 4, 5]) expect(canDeliverLabIssue({ userType })).toBe(false);
  });

  it('turns Delete off for delivered rows and Modify off for returned rows', () => {
    expect(labIssueButtonsOff({ DeliveryBykt: null, RetbackBykt: null })).toEqual({
      modify: false,
      delete: false,
    });
    expect(labIssueButtonsOff({ deliverybykt: 5 })).toEqual({ modify: false, delete: true });
    expect(labIssueButtonsOff({ DeliveryBykt: 5, RetbackBykt: 7 })).toEqual({
      modify: true,
      delete: true,
    });
  });

  it('colours the rows by delivery and return', () => {
    expect(labIssueRowColor({ DeliveryBykt: 0 })).toBeUndefined();
    expect(labIssueRowColor({ DeliveryBykt: 5 })).toBe('#8b0000');
    expect(labIssueRowColor({ DeliveryBykt: 5, RetbackBykt: 5 })).toBe('#006400');
  });
});

import { describe, expect, it } from 'vitest';
import {
  canApproveLeave,
  canEditLeave,
  isLcEgLeaveType,
  leaveStatusFor,
  seesAllLeaves,
} from './leaves.js';

const u = (id: number, userType = 3) => ({ id, userType });

describe('Leaves rules (frmLeaveM)', () => {
  it('lists every leave for user types 1 and 5 only', () => {
    expect(seesAllLeaves(u(7, 1))).toBe(true);
    expect(seesAllLeaves(u(7, 5))).toBe(true);
    expect(seesAllLeaves(u(41, 3))).toBe(false);
  });

  it('lets user type 1 and users 41 / 5 modify, not AMaster', () => {
    expect(canEditLeave(u(7, 1))).toBe(true);
    expect(canEditLeave(u(41))).toBe(true);
    expect(canEditLeave(u(5))).toBe(true);
    expect(canEditLeave(u(7, 5))).toBe(false);
    expect(canEditLeave(u(7, 3))).toBe(false);
  });

  it('lets AMaster and users 41 / 5 approve, not user type 1', () => {
    expect(canApproveLeave(u(7, 5))).toBe(true);
    expect(canApproveLeave(u(41))).toBe(true);
    expect(canApproveLeave(u(5, 2))).toBe(true);
    expect(canApproveLeave(u(7, 1))).toBe(false);
  });

  it('treats only "lc" / "eg" as LC/EG, not "LC EG"', () => {
    expect(isLcEgLeaveType(' LC ')).toBe(true);
    expect(isLcEgLeaveType('eg')).toBe(true);
    expect(isLcEgLeaveType('LC EG')).toBe(false);
    expect(isLcEgLeaveType(null)).toBe(false);
  });

  it('gives Leave Without Approval from today or earlier, Pending from tomorrow', () => {
    expect(leaveStatusFor('2026-10-06', '2026-10-06')).toBe('Leave Without Approval');
    expect(leaveStatusFor('2026-10-01', '2026-10-06')).toBe('Leave Without Approval');
    expect(leaveStatusFor('2026-10-07', '2026-10-06')).toBe('Pending');
  });
});

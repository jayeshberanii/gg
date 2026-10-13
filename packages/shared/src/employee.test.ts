import { describe, expect, it } from 'vitest';
import {
  canEditEmployeeUserType,
  canSeeEmployeePassword,
  isEmployeePrivileged,
} from './employee.js';

const u = (id: number, isAdmin = false, userType = 3) => ({ id, isAdmin, userType });

describe('Employee Master rules (frmEmployeeNew)', () => {
  it('treats IsAdmin and users 5 / 13 as privileged, not the Admin user type', () => {
    expect(isEmployeePrivileged(u(4, true))).toBe(true);
    expect(isEmployeePrivileged(u(5))).toBe(true);
    expect(isEmployeePrivileged(u(13))).toBe(true);
    expect(isEmployeePrivileged(u(29, false, 1))).toBe(false);
  });

  it('lets IsAdmin or AMaster edit User Type and Reporting To', () => {
    expect(canEditEmployeeUserType(u(7, true))).toBe(true);
    expect(canEditEmployeeUserType(u(41, false, 5))).toBe(true);
    expect(canEditEmployeeUserType(u(42, false, 2))).toBe(false);
  });

  it("shows a password to the privileged and to its owner, row 100's to user 100 only", () => {
    expect(canSeeEmployeePassword(u(5), 77)).toBe(true);
    expect(canSeeEmployeePassword(u(77), 77)).toBe(true);
    expect(canSeeEmployeePassword(u(78), 77)).toBe(false);
    expect(canSeeEmployeePassword(u(4, true), 100)).toBe(false);
    expect(canSeeEmployeePassword(u(5), 100)).toBe(false);
    expect(canSeeEmployeePassword(u(100, true), 100)).toBe(true);
  });
});

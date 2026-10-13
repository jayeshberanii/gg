import { describe, expect, it } from 'vitest';
import { ownerLocked, searchRequestSchema } from './master.js';

describe('searchRequestSchema', () => {
  const body = (gridIds: number[]) => ({
    columnId: 1,
    scope: 'grid',
    gridIds,
    notIn: false,
    values: [],
    text: 'x',
  });

  it('accepts a whole BookT grid (~159k rows) as gridIds', () => {
    const gridIds = Array.from({ length: 160_000 }, (_, i) => i + 1);
    expect(searchRequestSchema.safeParse(body(gridIds)).success).toBe(true);
  });

  it('still caps gridIds', () => {
    const gridIds = Array.from({ length: 1_000_001 }, (_, i) => i + 1);
    expect(searchRequestSchema.safeParse(body(gridIds)).success).toBe(false);
  });
});

describe('ownerLocked (frmInwordMaster.FillData)', () => {
  const user = { id: 7, isAdmin: false };
  it('locks a record someone else entered for a non-admin only', () => {
    expect(ownerLocked({ enuser: 5 }, user)).toBe(true);
    expect(ownerLocked({ EnUser: 7 }, user)).toBe(false);
    expect(ownerLocked({ enuser: null }, user)).toBe(true);
    expect(ownerLocked({ enuser: 5 }, { id: 7, isAdmin: true })).toBe(false);
    expect(ownerLocked({ createdBy: 7 }, user, 'createdby')).toBe(false);
  });
});

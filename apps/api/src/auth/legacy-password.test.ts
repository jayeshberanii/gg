import { describe, expect, it } from 'vitest';
import { decodeLegacyPassword, encodeLegacyPassword } from './legacy-password.js';

describe('legacy desktop password encoding (MdlLib enc/deco)', () => {
  it('matches bytes stored by the desktop app', () => {
    // Usecurity rows from DBLibSQL: guest = 'p' -> 0xF0, khelan = 'mo' -> 0xED 0xEF.
    expect([...encodeLegacyPassword('p')]).toEqual([240]);
    expect([...encodeLegacyPassword('mo')]).toEqual([237, 239]);
  });

  it('round-trips ASCII', () => {
    const plain = 'Abc 123!~';
    expect(decodeLegacyPassword(encodeLegacyPassword(plain))).toBe(plain);
  });

  it('stores non-ASCII as "?" like a varchar column would', () => {
    expect([...encodeLegacyPassword('é')]).toEqual([0x3f]);
  });
});

/**
 * The desktop's password scheme (`enc()` / `deco()` in MdlLib.vb): each character code + 128,
 * stored in `Usecurity.upwd` (varchar, code page 1252). It is reversible, not a hash. It stays
 * only because the desktop app still reads and writes these rows; it must not be used for
 * anything new.
 *
 * Only ASCII survives the round trip. A non-ASCII character becomes a code point above 255,
 * which a varchar column cannot hold (SQL Server stores '?'), so we encode it the same way.
 */
export function encodeLegacyPassword(plain: string): Buffer {
  const bytes = [...plain].map((ch) => {
    const code = ch.charCodeAt(0);
    return code < 128 ? code + 128 : 0x3f;
  });
  return Buffer.from(bytes);
}

/** `deco()`: bytes ≥ 128 lose 128, anything else is kept. */
export function decodeLegacyPassword(stored: Buffer): string {
  return String.fromCharCode(...stored.map((b) => (b >= 128 ? b - 128 : b)));
}

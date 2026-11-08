/** Pure FNV-1a 32-bit hex over joined string parts — no crypto dep. */

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Stable lowercase hex fingerprint of ordered string parts. */
export function fingerprintHex(parts: string[]): string {
  let h = FNV_OFFSET;
  const text = parts.join('\0');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Pure dump → overworld town markers. No Phaser/DOM. */

export type TownMarker = {
  id: string;
  /** Square ortho column (q = x). */
  q: number;
  /** Square ortho row (r = y). */
  r: number;
  gap01?: number;
};

const SETTLEMENT_RE = /^settlement:(\S+)(?:\s+gap01=([0-9.]+))?/;
const SITE_RE = /^site:(\S+)(?:\s+gap01=([0-9.]+))?/;

/** Place markers on a square ortho grid — spaced 2 cells apart. */
function cellForIndex(i: number): { q: number; r: number } {
  const cols = 4;
  return { q: (i % cols) * 2, r: Math.floor(i / cols) * 2 };
}

function parseLines(
  dump: string,
  re: RegExp,
): Array<{ id: string; gap01?: number }> {
  const out: Array<{ id: string; gap01?: number }> = [];
  for (const line of dump.split('\n')) {
    const m = line.match(re);
    if (!m) continue;
    const gap = m[2] !== undefined ? Number(m[2]) : undefined;
    out.push({
      id: m[1]!,
      gap01: gap !== undefined && Number.isFinite(gap) ? gap : undefined,
    });
  }
  return out;
}

/**
 * Prefer authored `settlement:` rows; fall back to gap `site:` rows.
 * Assigns synthetic q/r for square-ortho overworld chips.
 */
export function townsFromDump(dump: string): TownMarker[] {
  const raw = parseLines(dump, SETTLEMENT_RE);
  const rows = raw.length > 0 ? raw : parseLines(dump, SITE_RE);
  return rows.map((row, i) => {
    const cell = cellForIndex(i);
    return { id: row.id, q: cell.q, r: cell.r, gap01: row.gap01 };
  });
}

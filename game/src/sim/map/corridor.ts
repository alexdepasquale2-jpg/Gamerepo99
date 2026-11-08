/** Bresenham / ortho corridor helpers for stamp roads. Pure; no Phaser. */

export type Cell = { q: number; r: number };

/** Inclusive Bresenham line from (q0,r0) to (q1,r1). */
export function bresenhamLine(q0: number, r0: number, q1: number, r1: number): Cell[] {
  const out: Cell[] = [];
  let q = q0;
  let r = r0;
  const dq = Math.abs(q1 - q0);
  const dr = Math.abs(r1 - r0);
  const sq = q0 < q1 ? 1 : -1;
  const sr = r0 < r1 ? 1 : -1;
  let err = dq - dr;
  for (;;) {
    out.push({ q, r });
    if (q === q1 && r === r1) break;
    const e2 = err * 2;
    if (e2 > -dr) {
      err -= dr;
      q += sq;
    }
    if (e2 < dq) {
      err += dq;
      r += sr;
    }
  }
  return out;
}

/** Key for sparse cell maps. */
export function cellKey(q: number, r: number): string {
  return `${q},${r}`;
}

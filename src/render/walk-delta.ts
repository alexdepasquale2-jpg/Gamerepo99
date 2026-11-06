/** Pure overworld walk step — no Phaser. Presentation only. */

export function walkDelta(
  dx: number,
  dy: number,
  deltaMs: number,
  tilesPerSec: number,
  tilePx: number,
): { dx: number; dy: number } {
  if (dx === 0 && dy === 0) return { dx: 0, dy: 0 };
  let nx = dx;
  let ny = dy;
  if (dx !== 0 && dy !== 0) {
    const inv = 1 / Math.hypot(dx, dy);
    nx = dx * inv;
    ny = dy * inv;
  }
  const speed = tilesPerSec * tilePx * (deltaMs / 1000);
  return { dx: nx * speed, dy: ny * speed };
}

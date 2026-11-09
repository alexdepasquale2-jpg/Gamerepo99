/**
 * Pixel strips for the creatures you fight (2 frames, side view facing right; flipX for left): wolf, boar,
 * bear, the ash-hound and cinder-wraith born of despair, and the Despair Colossus. People (bandits,
 * soldiers, the hollow) are drawn as figures instead. Pure canvas, in the actors' painter style.
 */
import { makeCanvas, outline, pen, shade, type Pen } from '../actors/paint';

export type Strip = { canvas: HTMLCanvasElement; fw: number; fh: number };

function strip(fw: number, fh: number, draw: (P: Pen, f: number) => void): Strip {
  const { canvas, g } = makeCanvas(fw * 2, fh);
  for (let f = 0; f < 2; f++) draw(pen(g, f * fw, 0, fw, fh), f);
  outline(g, canvas.width, canvas.height, fw, fh);
  return { canvas, fw, fh };
}
const legs = (P: Pen, f: number, xs: number[], y: number, h: number, c: string): void =>
  xs.forEach((x, i) => P.r(x + ((i + f) % 2 ? 1 : 0), y, 1, h, c));

const STRIPS: Record<string, () => Strip> = {
  wolf: () => strip(22, 13, (P, f) => {
    const c = '#7a7a80';
    P.r(4, 4, 12, 5, c); P.r(4, 8, 11, 1, shade(c, 0.3)); P.r(15, 2, 5, 4, c); P.r(19, 4, 2, 2, shade(c, -0.2));
    P.p(16, 1, c); P.p(18, 1, c); P.p(18, 3, '#e8c040'); P.r(0, 4 - f, 4, 2, shade(c, -0.15));
    legs(P, f, [5, 7, 12, 14], 9, 4, shade(c, -0.35));
  }),
  ash_hound: () => strip(22, 13, (P, f) => {
    const c = '#3a3438';
    P.r(4, 4, 12, 5, c); P.r(15, 2, 5, 4, c); P.r(19, 4, 2, 2, c); P.p(16, 1, c); P.p(18, 1, c);
    P.p(18, 3, '#ff8a2a'); P.p(17, 3, '#ff8a2a');
    for (let x = 5; x < 15; x += 3) P.p(x + f, 5, '#e8602a');
    P.r(0, 3 + f, 4, 2, '#e8602a'); P.p(0, 2 + f, '#ffd060');
    legs(P, f, [5, 7, 12, 14], 9, 4, '#1e1a1c');
  }),
  boar: () => strip(20, 13, (P, f) => {
    const c = '#6a4a32';
    P.r(2, 3, 13, 6, c); P.r(3, 2, 9, 1, shade(c, -0.2)); P.r(14, 4, 4, 4, c); P.r(17, 6, 2, 2, '#b07a60');
    P.p(15, 5, '#1e1a1c'); P.p(18, 4, '#f0ece4'); P.p(18, 3, '#f0ece4');
    for (let x = 3; x < 12; x += 2) P.p(x, 2 - (x % 4 === 1 ? 1 : 0), '#3a2a1a');
    legs(P, f, [4, 6, 11, 13], 9, 3, shade(c, -0.4));
  }),
  bear: () => strip(28, 20, (P, f) => {
    const c = '#5a3e2a';
    P.r(3, 5, 18, 9, c); P.r(5, 3, 13, 3, c); P.r(19, 4, 7, 7, c); P.r(24, 8, 3, 3, shade(c, 0.25));
    P.p(20, 3, c); P.p(23, 3, c); P.p(23, 6, '#1e1a1c'); P.p(26, 8, '#1e1a1c');
    P.r(4, 6, 14, 2, shade(c, 0.12));
    P.r(4 + f, 14, 3, 5, shade(c, -0.3)); P.r(9 - f, 14, 3, 5, shade(c, -0.3)); P.r(15 + f, 14, 3, 5, shade(c, -0.3)); P.r(19 - f, 14, 3, 5, shade(c, -0.3));
  }),
  wraith: () => strip(16, 22, (P, f) => {
    const robe = '#3a2a4a';
    P.r(4, 2, 8, 6, robe); P.r(3, 7, 10, 9, robe); P.r(2 + f, 16, 3, 3, robe); P.r(7, 16, 3, 4 - f, robe); P.r(11 - f, 16, 3, 3, robe);
    P.r(6, 4, 4, 3, '#120c18'); P.p(7, 5, '#ff8a2a'); P.p(9, 5, '#ff8a2a');
    P.r(6, 10, 4, 3, '#e8602a'); P.r(7, 11, 2, 1, '#ffd060');
    P.r(0, 9 - f, 3, 2, robe); P.r(13, 9 + f, 3, 2, robe);
  }),
  colossus: () => strip(34, 38, (P, f) => {
    const c = '#2e2a30', crack = '#e8602a';
    P.r(8, 4, 18, 22, c); P.r(11, 0, 12, 6, c); P.r(13, 2, 2, 2, '#ffb040'); P.r(19, 2, 2, 2, '#ffb040');
    P.r(2, 8 + f, 7, 16, c); P.r(25, 8 - f, 7, 16, c); P.r(1, 23 + f, 8, 5, shade(c, 0.1)); P.r(25, 23 - f, 8, 5, shade(c, 0.1));
    P.r(10, 26, 6, 11, c); P.r(18, 26, 6, 11, c);
    for (const [x, y] of [[12, 8], [15, 12], [18, 9], [20, 15], [14, 18], [17, 21], [11, 14]] as [number, number][]) P.r(x, y, 2, 1, crack);
    P.r(15, 14, 4, 4, f ? '#ffd060' : crack);
  }),
};

export const foeStrip = (art: string): Strip => (STRIPS[art] ?? STRIPS.wolf!)();
export const hasStrip = (art: string): boolean => art in STRIPS;

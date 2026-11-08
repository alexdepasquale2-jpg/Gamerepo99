/**
 * Pixel sheets for animals and road traffic: each fauna species and each vehicle is a 2-frame strip
 * (side view, facing right; flipX for left). Pure canvas.
 */
import { makeCanvas, outline, pen, shade, type Pen } from './paint';

export type Strip = { canvas: HTMLCanvasElement; fw: number; fh: number };

function strip(fw: number, fh: number, draw: (P: Pen, f: number) => void): Strip {
  const { canvas, g } = makeCanvas(fw * 2, fh);
  for (let f = 0; f < 2; f++) draw(pen(g, f * fw, 0, fw, fh), f);
  outline(g, canvas.width, canvas.height, fw, fh);
  return { canvas, fw, fh };
}

const legs = (P: Pen, f: number, xs: number[], y: number, h: number, c: string) =>
  xs.forEach((x, i) => P.r(x + ((i + f) % 2 ? 1 : 0), y, 1, h, c));

const FAUNA: Record<string, () => Strip> = {
  rabbit: () => strip(12, 10, (P, f) => {
    const c = '#a89078';
    P.r(2, 5 - f, 6, 4, c); P.r(7, 3 - f, 3, 3, c); P.r(8, 0 - f, 1, 3, c); P.r(9, 1 - f, 1, 2, shade(c, 0.2));
    P.p(9, 4 - f, '#2a2020'); P.p(1, 6 - f, '#f0ece4'); P.r(3, 9 - f, 2, 1, shade(c, -0.3)); P.r(6, 9 - f, 2, 1, shade(c, -0.3));
  }),
  deer: () => strip(18, 18, (P, f) => {
    const c = '#8a6038';
    P.r(3, 7, 10, 5, c); P.r(4, 11, 8, 1, shade(c, 0.3)); P.r(12, 4, 2, 5, c); P.r(13, 3, 4, 3, c);
    P.p(15, 4, '#2a2020'); P.r(13, 0, 1, 3, '#d8c8a0'); P.r(15, 0, 1, 3, '#d8c8a0'); P.p(12, 1, '#d8c8a0'); P.p(16, 1, '#d8c8a0');
    P.r(2, 7, 1, 2, '#f0ece4');
    legs(P, f, [4, 6, 10, 12], 12, 5, shade(c, -0.3));
  }),
  bird: () => strip(10, 8, (P, f) => {
    const c = '#4a4a58';
    P.r(2, 3, 5, 3, c); P.r(6, 2, 2, 2, c); P.p(8, 3, '#e0a040'); P.p(7, 2, '#f0ece4');
    if (f === 0) P.r(2, 0, 4, 3, shade(c, 0.2)); else P.r(2, 5, 4, 2, shade(c, 0.2));
    P.r(0, 4, 2, 1, c);
  }),
  pig: () => strip(14, 10, (P, f) => {
    const c = '#e0a8a0';
    P.r(2, 2, 9, 5, c); P.r(10, 3, 3, 3, c); P.r(12, 4, 1, 2, shade(c, -0.2)); P.p(10, 3, '#2a2020'); P.p(9, 1, shade(c, -0.15));
    P.p(1, 3, shade(c, -0.2));
    legs(P, f, [3, 5, 8, 10], 7, 3, shade(c, -0.25));
  }),
  fox: () => strip(16, 10, (P, f) => {
    const c = '#d06a2a';
    P.r(4, 3, 8, 4, c); P.r(11, 1, 4, 4, c); P.p(11, 0, c); P.p(13, 0, c); P.p(13, 2, '#2a2020'); P.r(12, 4, 3, 1, '#f0ece4');
    P.r(0, 3, 4, 2, c); P.p(0, 3, '#f0ece4'); P.r(5, 6, 6, 1, '#f0ece4');
    legs(P, f, [5, 7, 9, 11], 7, 3, '#3a2a20');
  }),
  fish: () => strip(10, 8, (P, f) => {
    const c = '#8ab0c0';
    P.r(2, 3 - f, 6, 3, c); P.r(3, 2 - f, 4, 1, shade(c, 0.25)); P.r(0, 2 - f + f * 2, 2, 3 - f, shade(c, -0.2)); P.p(7, 3 - f, '#2a2020');
  }),
  heron: () => strip(14, 18, (P, f) => {
    const c = '#b8bcc4';
    P.r(3, 5, 6, 4, c); P.r(8, 1, 1, 5, c); P.r(8, 0, 3, 2, c); P.r(11, 1, 3, 1, '#e0b040'); P.p(9, 0, '#2a2020');
    P.r(2, 5, 2, 2, shade(c, -0.3)); P.r(4, 6, 4, 1, shade(c, -0.15));
    P.r(5 + f, 9, 1, 8, '#a08050'); P.r(7 - f, 9, 1, 8, '#a08050');
  }),
  rat: () => strip(12, 8, (P, f) => {
    const c = '#6a6460';
    P.r(3, 3, 6, 3, c); P.r(8, 3, 3, 2, c); P.p(9, 2, shade(c, 0.2)); P.p(10, 3, '#2a2020');
    P.r(0, 5, 3, 1, '#c09088');
    legs(P, f, [4, 7], 6, 2, shade(c, -0.3));
  }),
};

export const faunaStrip = (id: string): Strip => (FAUNA[id] ?? FAUNA.rabbit!)();
export const FAUNA_IDS = Object.keys(FAUNA);

/** Covered trade wagon (wheels turn between frames). */
export const wagonStrip = (): Strip => strip(34, 24, (P, f) => {
  const wood = '#7a5432', cover = '#e8dcc0';
  P.r(2, 2, 28, 10, cover); P.r(2, 2, 28, 2, shade(cover, -0.12));
  for (let x = 6; x < 30; x += 7) P.r(x, 2, 1, 10, shade(cover, -0.2));
  P.r(1, 12, 31, 4, wood); P.r(30, 14, 3, 1, wood);
  const wheel = (cx: number) => { P.r(cx - 3, 16, 6, 6, '#3a2a1a'); P.r(cx - 2, 17, 4, 4, shade(wood, 0.15)); P.p(cx + (f ? -1 : 0), 18 + (f ? 1 : 0), '#3a2a1a'); };
  wheel(7); wheel(25);
});

/** The ox in front of a wagon. */
export const oxStrip = (): Strip => strip(20, 14, (P, f) => {
  const c = '#8a6a4a';
  P.r(2, 3, 12, 6, c); P.r(13, 2, 5, 5, c); P.p(17, 1, '#e8dcc0'); P.p(14, 1, '#e8dcc0'); P.p(16, 3, '#2a2020'); P.r(16, 5, 2, 2, shade(c, 0.2));
  P.r(3, 3, 9, 1, shade(c, 0.15)); P.r(1, 4, 1, 3, shade(c, -0.2));
  legs(P, f, [3, 5, 10, 12], 9, 5, shade(c, -0.35));
});

/** A village handcart with goods aboard. */
export const cartStrip = (): Strip => strip(22, 16, (P, f) => {
  const wood = '#8a6238';
  P.r(3, 3, 6, 4, '#c8a060'); P.r(9, 2, 5, 5, '#a07850'); P.r(4, 1, 3, 2, '#7aa050');
  P.r(1, 7, 16, 3, wood); P.r(17, 7, 5, 1, wood);
  P.r(6, 10, 5, 5, '#3a2a1a'); P.r(7, 11, 3, 3, shade(wood, 0.15)); P.p(8 + f, 12, '#3a2a1a');
});

/** A courier on foot with a letter satchel (seal colour drawn by the layer as a tint). */
export const courierStrip = (): Strip => strip(12, 18, (P, f) => {
  const coat = '#4a6678', skin = '#e0b890';
  P.r(4, 1, 4, 4, skin); P.r(3, 0, 6, 2, '#5a4634'); P.p(7, 3, '#2a2020');
  P.r(3, 5, 6, 6, coat); P.r(1, 7, 3, 3, '#e8e0c8'); P.p(2, 8, '#c8553d');
  P.r(4 + f, 11, 2, 6, '#3a3438'); P.r(7 - f, 11, 2, 6, '#3a3438');
});

/** Soft round ground shadow. */
export function shadowCanvas(): HTMLCanvasElement {
  const { canvas, g } = makeCanvas(16, 6);
  g.fillStyle = 'rgba(0,0,0,0.24)';
  g.beginPath();
  g.ellipse(8, 3, 7.5, 2.6, 0, 0, Math.PI * 2);
  g.fill();
  return canvas;
}

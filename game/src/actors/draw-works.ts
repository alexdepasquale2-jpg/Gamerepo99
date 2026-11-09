/**
 * Pixel strips for the Works in the world: the war cart, steam wagon, landship and airship (2-frame side
 * views facing right; flipX for left; wheels turn, smoke puffs, rotors spin), a band's banner (it flaps),
 * and a camp tent. The handcart and ox wagon reuse the village cart and the trade wagon. Pure canvas.
 */
import { makeCanvas, outline, pen, shade, type Pen } from './paint';
import type { Strip } from './draw-critters';

function strip(fw: number, fh: number, draw: (P: Pen, f: number) => void): Strip {
  const { canvas, g } = makeCanvas(fw * 2, fh);
  for (let f = 0; f < 2; f++) draw(pen(g, f * fw, 0, fw, fh), f);
  outline(g, canvas.width, canvas.height, fw, fh);
  return { canvas, fw, fh };
}

const wheel = (P: Pen, f: number, cx: number, y: number, r: number, rim: string, hub: string): void => {
  P.r(cx - r, y, r * 2, r * 2, rim);
  P.r(cx - r + 1, y + 1, r * 2 - 2, r * 2 - 2, hub);
  P.p(cx + (f ? -1 : 0), y + r - 1 + (f ? 1 : 0), rim);
  P.p(cx - (f ? -1 : 0), y + r - (f ? 1 : 0), rim);
};

/** A shielded wagon bristling with spears. */
export const warCartStrip = (): Strip => strip(30, 24, (P, f) => {
  const wood = '#6a4a2c', shield = '#9a3a2a';
  P.r(2, 11, 24, 5, wood); P.r(26, 13, 4, 1, wood);
  for (let x = 3; x < 25; x += 6) { P.r(x, 5, 5, 7, shield); P.r(x + 2, 7, 1, 3, '#e0c070'); }
  for (let x = 4; x < 26; x += 5) P.r(x, 0, 1, 6, '#b8b0a0');
  wheel(P, f, 7, 16, 3, '#2a2018', shade(wood, 0.2));
  wheel(P, f, 21, 16, 3, '#2a2018', shade(wood, 0.2));
});

/** An iron steam wagon: boiler, stack, cab, cargo bed. */
export const steamWagonStrip = (): Strip => strip(38, 28, (P, f) => {
  const iron = '#4a4e58', brass = '#c8963a', bed = '#7a5432';
  P.r(2, 12, 16, 7, bed); P.r(3, 9, 6, 3, '#c8a060'); P.r(10, 9, 6, 3, '#a07850');
  P.r(18, 8, 13, 11, iron); P.r(18, 8, 13, 2, shade(iron, 0.25)); P.r(30, 10, 5, 7, shade(iron, -0.2)); P.r(34, 12, 2, 3, brass);
  P.r(26, 2, 3, 6, '#2a2a30'); P.r(25, 1, 5, 1, brass);
  P.r(20, 4, 5, 4, '#5a3a2a'); P.r(21, 5, 3, 2, '#f0d878');
  // smoke
  P.r(26 - f, 0, 2, 1, '#c8c8c8');
  wheel(P, f, 8, 19, 4, '#1e1e22', iron);
  wheel(P, f, 26, 19, 4, '#1e1e22', iron);
  P.r(18, 15, 1, 1, brass); P.r(31, 15, 1, 1, brass);
});

/** A landship: an armoured hull on six wheels, two guns, a stack and a pennant. */
export const landshipStrip = (): Strip => strip(56, 34, (P, f) => {
  const plate = '#5a5e52', dark = '#3a3d36', rivet = '#a8a890';
  P.r(3, 10, 48, 15, plate); P.r(3, 10, 48, 3, shade(plate, 0.2)); P.r(3, 22, 48, 3, dark);
  for (let x = 6; x < 50; x += 6) { P.p(x, 14, rivet); P.p(x, 20, rivet); }
  P.r(18, 4, 18, 7, plate); P.r(18, 4, 18, 2, shade(plate, 0.2)); P.r(24, 6, 6, 2, '#1e1e1e');
  P.r(36, 6, 14, 2, dark); P.r(49, 5, 3, 4, dark);
  P.r(0, 15, 6, 2, dark);
  P.r(13, 0, 2, 5, '#2a2a30'); P.r(12 + f, 0, 1, 1, '#c8c8c8');
  P.r(38, 0, 1, 5, '#8a7a60'); P.r(39, 0, 5, 2 + f, '#c8553d');
  for (const cx of [8, 19, 30, 41, 50]) wheel(P, f, cx, 25, 4, '#1e1e22', dark);
});

/** An airship: gasbag over a gondola, rotor at the stern (flies; drawn high with its shadow on the road). */
export const airshipStrip = (): Strip => strip(60, 34, (P, f) => {
  const bag = '#d8c8a0', rib = '#b8a47a', wood = '#7a5432';
  P.r(6, 2, 46, 16, bag); P.r(3, 5, 52, 10, bag); P.r(10, 0, 38, 2, bag);
  for (let x = 12; x < 50; x += 8) P.r(x, 1, 1, 17, rib);
  P.r(3, 9, 52, 1, rib); P.r(52, 6, 6, 8, rib);
  P.r(20, 18, 1, 6, '#5a4634'); P.r(38, 18, 1, 6, '#5a4634');
  P.r(16, 24, 26, 6, wood); P.r(18, 25, 4, 2, '#f0d878'); P.r(26, 25, 4, 2, '#f0d878'); P.r(34, 25, 4, 2, '#f0d878');
  P.r(1, 7 + f * 2, 2, 6 - f * 4, '#6a6a70'); P.r(0, 9, 4, 2, '#4a4a50');
  P.r(44, 22, 4, 4, '#f0b030');
});

/** The band's banner on a pole (it flaps). */
export const bannerStrip = (): Strip => strip(14, 30, (P, f) => {
  P.r(2, 0, 1, 30, '#6a4a2c'); P.r(1, 0, 3, 1, '#e0c070');
  const red = '#a82a2a';
  P.r(3, 2, 9, 8 - f, red); P.r(3, 10 - f, 4, 2, red); P.r(8, 10 - f, 4, 1 + f, red);
  P.r(6, 4, 3, 3, '#f0d878');
});

/** A camp tent. */
export const tentStrip = (): Strip => strip(24, 18, (P, f) => {
  const canvas = '#c8b890';
  for (let y = 0; y < 14; y++) P.r(11 - Math.floor(y * 0.8), 2 + y, 2 + Math.floor(y * 1.6), 1, y % 5 === 4 ? shade(canvas, -0.12) : canvas);
  P.r(10, 9, 4, 7, '#3a2a1a');
  P.r(11, 0, 1, 3, '#6a4a2c'); P.p(12 + f, 0, '#a82a2a');
});

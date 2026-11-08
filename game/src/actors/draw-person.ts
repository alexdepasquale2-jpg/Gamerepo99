/**
 * Pixel figures for people and inhabitant bodies: humans (builds, dresses, hats, hair), ogres and
 * basilisks. A sheet is 9 frames of FW x FH in a row: down, up, side (facing right) x step 0 / stand / step 2.
 * Pure canvas; looks.ts turns the canvas into a Phaser texture.
 */
import { makeCanvas, outline, pen, shade, type Pen } from './paint';

export const FW = 16;
export const FH = 20;
export const FRAMES = 9;
export type Dir = 0 | 1 | 2; // down, up, side
export const frameOf = (dir: Dir, step: number): string => String(dir * 3 + step);

export type Species = 'human' | 'ogre' | 'basilisk';
export type Hat = 'none' | 'cap' | 'tall' | 'straw' | 'hood' | 'kerchief';
export type Build = 'slim' | 'mid' | 'stout';

export type Look = {
  species: Species;
  skin: string;
  hair: string;
  /** 0 short, 1 long, 2 cropped, 3 bun. */
  hairStyle: number;
  cloth: string;
  /** Trim / apron / belt. */
  trim: string;
  pants: string;
  shoes: string;
  hat: Hat;
  hatColor: string;
  build: Build;
  dress: boolean;
  beard: boolean;
  apron: boolean;
};

const EYE = '#2a2020';

export function paintSheet(look: Look): HTMLCanvasElement {
  const { canvas, g } = makeCanvas(FW * FRAMES, FH);
  for (let dir = 0 as Dir; dir < 3; dir = (dir + 1) as Dir) {
    for (let step = 0; step < 3; step++) {
      const P = pen(g, (dir * 3 + step) * FW, 0, FW, FH);
      if (look.species === 'ogre') ogre(P, look, dir, step);
      else if (look.species === 'basilisk') basilisk(P, look, dir, step);
      else human(P, look, dir, step);
    }
  }
  outline(g, canvas.width, canvas.height, FW, FH);
  return canvas;
}

// ---------- humans ----------

function human(P: Pen, L: Look, dir: Dir, step: number): void {
  const w = L.build === 'slim' ? 6 : L.build === 'stout' ? 10 : 8;
  const tx = 8 - w / 2;
  const walk = step !== 1;
  const lift = step === 0 ? -1 : step === 2 ? 1 : 0; // which leg is up
  const dark = shade(L.cloth, -0.28);
  if (dir === 2) return humanSide(P, L, step);
  // legs + shoes
  const lw = L.build === 'stout' ? 4 : 3;
  const lx = 8 - lw, rx = 8;
  const legTop = L.dress ? 16 : 14;
  const lUp = walk && lift < 0 ? 1 : 0, rUp = walk && lift > 0 ? 1 : 0;
  P.r(lx, legTop, lw, 18 - legTop - lUp, L.pants);
  P.r(rx, legTop, lw, 18 - legTop - rUp, L.pants);
  P.r(lx, 18 - lUp, lw, 2, L.shoes);
  P.r(rx, 18 - rUp, lw, 2, L.shoes);
  // torso
  P.r(tx, 8, w, 6, L.cloth);
  P.r(tx, 13, w, 1, dir === 0 ? L.trim : dark);
  if (L.dress) {
    P.r(tx - 1, 13, w + 2, 3, L.cloth);
    P.r(tx - 1, 15, w + 2, 1, dark);
  }
  if (L.apron && dir === 0) P.r(tx + 1, 10, w - 2, L.dress ? 6 : 5, L.trim);
  // arms swing opposite the legs
  const la = walk ? (lift < 0 ? 1 : -1) : 0;
  P.r(tx - 1, 8 + Math.max(0, la), 1, 5, L.cloth);
  P.r(tx + w, 8 + Math.max(0, -la), 1, 5, L.cloth);
  P.p(tx - 1, 13 + Math.max(0, la), L.skin);
  P.p(tx + w, 13 + Math.max(0, -la), L.skin);
  // head
  P.r(5, 2, 6, 6, L.skin);
  if (dir === 0) {
    P.p(6, 5, EYE);
    P.p(9, 5, EYE);
    if (L.beard) P.r(6, 6, 4, 2, L.hair);
  }
  hair(P, L, dir);
  hat(P, L, dir);
}

function hair(P: Pen, L: Look, dir: Dir): void {
  const H = L.hair;
  if (L.hairStyle === 2) { P.r(5, 2, 6, 1, H); if (dir === 1) P.r(5, 2, 6, 3, H); return; }
  P.r(5, 1, 6, 2, H);
  if (dir === 1) P.r(5, 1, 6, L.hairStyle === 1 ? 9 : 5, H);
  else { P.r(5, 3, 1, L.hairStyle === 1 ? 6 : 2, H); P.r(10, 3, 1, L.hairStyle === 1 ? 6 : 2, H); }
  if (L.hairStyle === 3) P.r(7, 0, 2, 1, H);
}

function hat(P: Pen, L: Look, dir: Dir): void {
  const c = L.hatColor, d = shade(c, -0.3);
  switch (L.hat) {
    case 'cap': P.r(5, 1, 6, 2, c); P.r(dir === 1 ? 5 : 4, 3, dir === 1 ? 6 : 8, 1, d); break;
    case 'tall': P.r(6, 0, 4, 3, c); P.r(6, 2, 4, 1, L.trim); P.r(4, 3, 8, 1, d); break;
    case 'straw': P.r(6, 1, 4, 2, c); P.r(3, 3, 10, 1, d); break;
    case 'hood': P.r(5, 1, 6, 2, c); P.r(4, 2, 1, 6, c); P.r(11, 2, 1, 6, c); if (dir === 1) P.r(5, 1, 6, 7, c); break;
    case 'kerchief': P.r(5, 1, 6, 2, c); P.p(11, 3, c); if (dir === 1) P.r(6, 3, 4, 2, d); break;
    default: break;
  }
}

function humanSide(P: Pen, L: Look, step: number): void {
  const w = L.build === 'slim' ? 5 : L.build === 'stout' ? 8 : 6;
  const tx = 8 - Math.floor(w / 2);
  const dark = shade(L.cloth, -0.28);
  // legs: stand together, or stride front/back
  const legTop = L.dress ? 16 : 14;
  if (step === 1) {
    P.r(7, legTop, 3, 18 - legTop, L.pants);
    P.r(7, 18, 4, 2, L.shoes);
  } else {
    const f = step === 0 ? 1 : -1;
    P.r(8 + f, legTop, 2, 18 - legTop, shade(L.pants, -0.15));
    P.r(7 - f, legTop, 2, 18 - legTop, L.pants);
    P.r(8 + f, 18, 3, 2, L.shoes);
    P.r(7 - f, 18, 3, 2, L.shoes);
  }
  P.r(tx, 8, w, 6, L.cloth);
  P.r(tx, 13, w, 1, dark);
  if (L.dress) P.r(tx - 1, 13, w + 2, 3, L.cloth);
  if (L.apron) P.r(tx + w - 2, 10, 2, L.dress ? 6 : 4, L.trim);
  // one arm, swinging
  const ax = step === 1 ? 8 : step === 0 ? 9 : 7;
  P.r(ax, 9, 2, 4, dark);
  P.p(ax, 13, L.skin);
  // head facing right
  P.r(6, 2, 5, 6, L.skin);
  P.p(11, 5, L.skin);
  P.p(9, 4, EYE);
  if (L.beard) P.r(8, 6, 3, 2, L.hair);
  if (L.hairStyle !== 2) {
    P.r(6, 1, 5, 2, L.hair);
    P.r(6, 3, 2, L.hairStyle === 1 ? 6 : 3, L.hair);
    if (L.hairStyle === 3) P.r(5, 2, 1, 2, L.hair);
  } else P.r(6, 2, 4, 1, L.hair);
  const c = L.hatColor, d = shade(c, -0.3);
  if (L.hat === 'cap') { P.r(6, 1, 5, 2, c); P.r(9, 3, 4, 1, d); }
  else if (L.hat === 'tall') { P.r(7, 0, 4, 3, c); P.r(7, 2, 4, 1, L.trim); P.r(5, 3, 8, 1, d); }
  else if (L.hat === 'straw') { P.r(7, 1, 4, 2, c); P.r(4, 3, 10, 1, d); }
  else if (L.hat === 'hood') { P.r(5, 1, 5, 2, c); P.r(5, 2, 2, 6, c); }
  else if (L.hat === 'kerchief') { P.r(6, 1, 5, 2, c); P.p(5, 3, c); }
}

// ---------- ogre: broad, low small head, tusks, hide strap ----------

function ogre(P: Pen, L: Look, dir: Dir, step: number): void {
  const skin = L.skin, dk = shade(skin, -0.25), hide = L.cloth;
  const lift = step === 0 ? 1 : step === 2 ? -1 : 0;
  if (dir === 2) {
    P.r(5, 15, 3, 3 - Math.max(0, lift), dk);
    P.r(8, 15, 3, 3 - Math.max(0, -lift), skin);
    P.r(4, 18 - Math.max(0, lift), 4, 2, shade(skin, -0.4));
    P.r(8, 18 - Math.max(0, -lift), 4, 2, shade(skin, -0.4));
    P.r(3, 7, 10, 8, skin);
    P.r(3, 12, 10, 3, hide);
    P.r(7 + lift, 8, 3, 7, dk);
    P.r(9, 4, 5, 5, skin);
    P.p(12, 5, EYE);
    P.p(13, 8, '#f4ecd8');
    P.r(9, 4, 3, 1, L.hair);
    return;
  }
  P.r(4, 15, 3, 3 - Math.max(0, lift), skin);
  P.r(9, 15, 3, 3 - Math.max(0, -lift), skin);
  P.r(3, 18 - Math.max(0, lift), 4, 2, shade(skin, -0.4));
  P.r(9, 18 - Math.max(0, -lift), 4, 2, shade(skin, -0.4));
  P.r(2, 7, 12, 8, skin);
  P.r(3, 12, 10, 3, hide);
  if (dir === 0) for (let i = 0; i < 6; i++) P.p(4 + i, 7 + i, shade(hide, -0.2)); // strap
  P.r(1, 8 + Math.max(0, lift), 2, 6, dk);
  P.r(13, 8 + Math.max(0, -lift), 2, 6, dk);
  P.r(6, 3, 4, 5, skin);
  if (dir === 0) {
    P.p(6, 5, EYE);
    P.p(9, 5, EYE);
    P.p(6, 7, '#f4ecd8');
    P.p(9, 7, '#f4ecd8');
  } else P.r(6, 3, 4, 2, L.hair);
  P.r(6, 3, 4, 1, L.hair);
}

// ---------- basilisk: low lizard with a crest ----------

function basilisk(P: Pen, L: Look, dir: Dir, step: number): void {
  const sc = L.skin, dk = shade(sc, -0.3), belly = shade(sc, 0.35), crest = L.trim, eye = '#f2d048';
  const lift = step === 0 ? 1 : step === 2 ? -1 : 0;
  if (dir === 2) {
    P.r(1, 14, 3, 1, dk); P.r(2, 15, 2, 1, dk); // tail
    P.r(3, 12, 8, 5, sc);
    P.r(4, 16, 6, 1, belly);
    P.r(10, 10, 4, 4, sc);
    P.p(12, 11, eye);
    P.r(4, 11, 6, 1, crest);
    P.r(4 + lift, 17, 2, 2, dk);
    P.r(8 - lift, 17, 2, 2, dk);
    return;
  }
  P.r(4, 13, 8, 5, sc);
  if (dir === 0) {
    P.r(6, 14, 4, 3, belly);
    P.r(5, 10, 6, 4, sc);
    P.p(6, 11, eye);
    P.p(9, 11, eye);
  } else {
    P.r(5, 10, 6, 3, dk);
    P.r(7, 17, 2, 3, dk); // tail
  }
  P.r(7, 9, 2, dir === 1 ? 8 : 1, crest);
  P.r(3, 15 + Math.max(0, lift), 1, 3, dk);
  P.r(12, 15 + Math.max(0, -lift), 1, 3, dk);
}

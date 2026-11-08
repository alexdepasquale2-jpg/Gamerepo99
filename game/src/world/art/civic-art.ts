/**
 * Civic art, code-drawn at 1x and shown at 2x like the settlement stamps: one building per kind a plot
 * can raise (data/items/buildings.json + zones.json civicBuildings), so a town reads by its roofs — the
 * barn, the windmill, the smoking forge, the kiln, the chapel's bell, the market's awning, the barracks'
 * shield, the hall's clock. Plus the town's own granary and storehouse (sites.json: every town keeps one),
 * the zone stakes (zones.json), the tier pennants and the war / pact marks. Painted once per scene.
 */
import type Phaser from 'phaser';
import { makeTex, type Px } from './px';

const W = 64, H = 72;
export const civicTex = (kind: string): string => `w-civ-${CIVIC[kind] ? kind : 'house'}`;
export const civicMarkTex = (id: string): string => `w-civm-${id}`;

/** A plain gabled body every trade dresses: walls, a darker side, a door at the foot (bottom centre). */
function body(p: Px, o: { left: number; width: number; top: number; wall: string; side: string; roof: string; light: string; roofH: number; door?: string }): void {
  const { left, width, top } = o;
  p.disc(32, 69, width / 2 + 6, 3, '#000000', 0.25);
  p.rect(left - 2, 66, width + 4, 6, '#615845');
  p.rect(left, top, width, 67 - top, o.wall).rect(left + width - 7, top + 1, 7, 66 - top, o.side);
  p.roof(left - 5, top - o.roofH + 1, width + 10, o.roofH, o.roof, o.light);
  p.rect(left - 5, top + 1, width + 10, 3, '#654936').rect(left - 3, top + 4, width + 6, 2, '#000000', 0.18);
  p.rect(27, 51, 10, 17, '#654936').rect(29, 53, 6, 14, o.door ?? '#8d6240').rect(34, 59, 1, 2, '#ecc76e');
}
const win = (p: Px, x: number, y: number): void => void p.rect(x - 1, y - 1, 10, 10, '#69523a').rect(x, y, 8, 8, '#e7c17e').rect(x + 3, y, 1, 8, '#8c7656').rect(x, y + 4, 8, 1, '#8c7656');
/** A hanging trade sign on a bracket by the door, with a small emblem painted on it. */
function sign(p: Px, emblem: (x: number, y: number) => void): void {
  p.rect(40, 44, 9, 1, '#3a2a1c').rect(41, 45, 1, 2, '#3a2a1c').rect(47, 45, 1, 2, '#3a2a1c');
  p.rect(40, 47, 9, 8, '#e8d8b0').rect(40, 47, 9, 1, '#a88a5a');
  emblem(41, 48);
}

const CIVIC: Record<string, (p: Px) => void> = {
  house: (p) => { body(p, { left: 12, width: 40, top: 37, wall: '#c9b48a', side: '#a68d66', roof: '#8a4a32', light: '#a85a3a', roofH: 21 }); win(p, 16, 46); win(p, 39, 46); p.rect(20, 13, 6, 15, '#998f77'); },
  farm: (p) => {
    // A red barn, white-braced doors, a hay bale and a sheaf on the gable.
    body(p, { left: 8, width: 48, top: 34, wall: '#a8443a', side: '#7a2e28', roof: '#5a4a3a', light: '#6a5a48', roofH: 22, door: '#e8dcc0' });
    p.rect(24, 46, 16, 21, '#e8dcc0').rect(25, 47, 14, 19, '#a8443a');
    for (let i = 0; i < 14; i++) { p.px(25 + i, 47 + Math.round(i * 19 / 14), '#e8dcc0'); p.px(38 - i, 47 + Math.round(i * 19 / 14), '#e8dcc0'); }
    p.rect(29, 20, 6, 6, '#3a2a1c').rect(30, 21, 4, 4, '#e8c060');
    p.disc(53, 64, 7, 5, '#d8b860').rect(48, 62, 11, 1, '#a88a3a');
  },
  mill: (p) => {
    // A stone tower windmill: four lattice sails over a round cap.
    p.disc(32, 69, 16, 3, '#000000', 0.25).rect(20, 30, 24, 38, '#a8a090').rect(22, 30, 8, 38, '#c8c0ae').rect(38, 30, 6, 38, '#888070');
    p.roof(17, 18, 30, 13, '#7a3a28', '#9a4a32');
    for (let i = 0; i < 16; i++) { p.rect(16 + i * 2, 4 + i * 2, 3, 2, '#5a3e26'); p.rect(46 - i * 2, 4 + i * 2, 3, 2, '#5a3e26'); }
    p.rect(13, 4, 9, 4, '#e8dcc0').rect(42, 4, 9, 4, '#e8dcc0').rect(13, 32, 9, 4, '#e8dcc0').rect(42, 32, 9, 4, '#e8dcc0').disc(32, 19, 3, 3, '#3a2a1c');
    p.rect(27, 52, 10, 16, '#3a2a1c').rect(29, 54, 6, 13, '#6a4a2a').rect(30, 38, 4, 5, '#f2d28a');
  },
  bakery: (p) => {
    body(p, { left: 12, width: 40, top: 37, wall: '#d8c49a', side: '#b0996e', roof: '#b0603a', light: '#c8784a', roofH: 20 });
    win(p, 15, 46);
    // A domed bread oven against the side wall, glowing mouth, and a loaf on the sign.
    p.disc(53, 62, 9, 7, '#a87a5a').disc(53, 61, 7, 5, '#c8946a').rect(50, 62, 6, 4, '#2a1a10').rect(51, 63, 4, 2, '#f08a30');
    p.rect(20, 10, 6, 16, '#8a7a6a').disc(23, 8, 3, 2, '#d8d0c8', 0.7);
    sign(p, (x, y) => p.disc(x + 3.5, y + 3.5, 3.5, 2.2, '#c8862e').rect(x + 1, y + 2, 5, 1, '#e8b860'));
  },
  smithy: (p) => {
    // A dark open-fronted forge: soot roof, glowing hearth inside, an anvil on the stoop.
    body(p, { left: 10, width: 44, top: 38, wall: '#6a6058', side: '#4a423c', roof: '#3a3634', light: '#4a4644', roofH: 18, door: '#2a1a10' });
    p.rect(14, 46, 14, 14, '#2a1a10').rect(16, 52, 10, 6, '#f08a30').rect(18, 53, 6, 3, '#f8d860');
    p.rect(44, 12, 8, 20, '#5a5048').rect(43, 10, 10, 3, '#7a7068').disc(48, 7, 4, 3, '#a8a098', 0.6);
    p.rect(40, 62, 12, 3, '#4a4a52').rect(43, 65, 6, 3, '#3a3a42').rect(38, 61, 4, 2, '#4a4a52');
    sign(p, (x, y) => p.rect(x + 1, y + 2, 6, 2, '#4a4a52').rect(x + 3, y + 4, 2, 2, '#4a4a52'));
  },
  weavery: (p) => {
    body(p, { left: 12, width: 40, top: 37, wall: '#c8b8a0', side: '#a0907a', roof: '#4a6a7a', light: '#5a7a8a', roofH: 20 });
    win(p, 15, 46);
    // Dyed cloth hung out to dry on a line beside the door.
    p.rect(2, 40, 1, 27, '#5a3a24').rect(2, 40, 12, 1, '#3a2a1c');
    for (const [x, c] of [[4, '#b8324a'], [8, '#3a6aa8'], [11, '#d8a830']] as const) p.rect(x, 41, 3, 12, c);
    sign(p, (x, y) => p.rect(x, y + 1, 7, 1, '#b8324a').rect(x, y + 3, 7, 1, '#3a6aa8').rect(x, y + 5, 7, 1, '#d8a830'));
  },
  pottery: (p) => {
    body(p, { left: 16, width: 36, top: 38, wall: '#c8a888', side: '#a08060', roof: '#9a5a3a', light: '#b06a48', roofH: 18 });
    // A beehive kiln with a fire mouth, pots drying on a plank.
    p.disc(9, 58, 9, 11, '#a85a3a').disc(9, 56, 7, 9, '#c06a48').rect(6, 62, 6, 5, '#2a1a10').rect(7, 63, 4, 3, '#f08a30').rect(7, 44, 4, 4, '#7a3a28');
    p.rect(38, 62, 22, 2, '#7a5a3a');
    for (const x of [40, 47, 54]) p.disc(x + 2, 59, 3, 3, '#b8784a').rect(x + 1, 55, 3, 2, '#b8784a');
    sign(p, (x, y) => p.disc(x + 3.5, y + 4, 3, 3, '#b8784a').rect(x + 2, y, 3, 2, '#b8784a'));
  },
  ropewalk: (p) => {
    // A long low shed (the walk) with coils stacked outside.
    p.disc(32, 69, 30, 3, '#000000', 0.25).rect(2, 66, 60, 6, '#615845');
    p.rect(4, 44, 56, 23, '#b8a07a').rect(4, 44, 56, 2, '#8a7050');
    p.roof(1, 32, 62, 13, '#7a5a3a', '#8a6a48');
    p.rect(27, 51, 10, 17, '#654936').rect(29, 53, 6, 14, '#8d6240');
    for (const x of [8, 16, 44, 52]) p.disc(x + 3, 62, 4, 3, '#c8a868').disc(x + 3, 62, 2, 1.5, '#8a7040');
    sign(p, (x, y) => p.disc(x + 3.5, y + 3.5, 3, 3, '#a88a4a').disc(x + 3.5, y + 3.5, 1.5, 1.5, '#e8d8b0'));
  },
  sawmill: (p) => {
    body(p, { left: 14, width: 36, top: 40, wall: '#a88a62', side: '#86694a', roof: '#6a5a4a', light: '#7a6a58', roofH: 16 });
    // A log pile and a saw-pit trestle with a long blade.
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) p.disc(5 + j * 6 + i * 3, 64 - i * 5, 3, 3, '#7a5232').disc(5 + j * 6 + i * 3, 64 - i * 5, 1.5, 1.5, '#d9b07a');
    p.rect(50, 56, 12, 2, '#9a6a3a').rect(51, 58, 1, 9, '#6a4a2a').rect(60, 58, 1, 9, '#6a4a2a').rect(53, 50, 1, 12, '#c8c8d0');
    sign(p, (x, y) => p.rect(x, y + 3, 7, 2, '#c8c8d0').px(x + 1, y + 5, '#c8c8d0').px(x + 3, y + 5, '#c8c8d0').px(x + 5, y + 5, '#c8c8d0'));
  },
  chapel: (p) => {
    // A whitewashed chapel with a bell in its steeple.
    body(p, { left: 14, width: 36, top: 36, wall: '#e8e0cc', side: '#c0b8a4', roof: '#5a5a6a', light: '#6a6a7a', roofH: 18, door: '#7a5a3a' });
    p.rect(27, 6, 10, 24, '#e8e0cc').rect(34, 6, 3, 24, '#c0b8a4').roof(25, 0, 14, 8, '#5a5a6a').rect(29, 12, 6, 6, '#3a3030').disc(32, 16, 2, 2, '#d8a830');
    p.rect(19, 44, 5, 9, '#7a9ab8').rect(41, 44, 5, 9, '#7a9ab8');
  },
  granary: (p) => {
    // The common granary: a tall timber crib on staddle stones, sacks at the hatch.
    p.disc(32, 69, 24, 3, '#000000', 0.25);
    for (const x of [12, 28, 44]) p.rect(x, 58, 8, 10, '#8a857a').disc(x + 4, 58, 6, 2, '#a8a398');
    p.rect(8, 24, 48, 34, '#b89a62').rect(48, 25, 8, 33, '#937a4a');
    for (let y = 28; y < 58; y += 5) p.rect(8, y, 48, 1, '#8a7046');
    p.roof(4, 6, 56, 19, '#6a5a3a', '#7a6a48').rect(27, 34, 10, 12, '#5a4026').rect(28, 35, 8, 10, '#e8c870');
    p.disc(14, 64, 4, 3, '#c8a46a').disc(50, 64, 4, 3, '#c8a46a');
  },
  market: (p) => {
    // An open market hall: striped awnings on posts, a counter heaped with goods.
    p.disc(32, 69, 28, 3, '#000000', 0.25).rect(2, 66, 60, 6, '#8a7a5a');
    for (const x of [4, 22, 40, 58]) p.rect(x, 30, 3, 37, '#6a4a2a');
    for (let x = 0; x < 64; x += 8) p.rect(x, 22, 8, 10, (x / 8) % 2 ? '#f4e6c8' : '#c8423a');
    p.roof(0, 10, 64, 13, '#a8342e', '#c8423a');
    p.rect(6, 52, 52, 6, '#8a5a32').rect(6, 52, 52, 1, '#a8743e');
    for (const [x, c] of [[9, '#d9a45b'], [17, '#b8324a'], [25, '#6aa84f'], [33, '#d8c070'], [41, '#8a5a32'], [49, '#6aa84f']] as const) p.rect(x, 48, 6, 4, c);
  },
  barracks: (p) => {
    // A long stone barracks with a shield over the door and the town's banner.
    body(p, { left: 6, width: 52, top: 36, wall: '#8a8a84', side: '#6a6a64', roof: '#4a3a32', light: '#5a4a40', roofH: 16, door: '#5a3a24' });
    for (let y = 40; y < 66; y += 6) p.rect(6, y, 52, 1, '#727268');
    for (const x of [12, 46]) p.rect(x, 46, 6, 4, '#2a2a2a');
    p.disc(32, 44, 5, 5, '#a83a30').rect(31, 40, 2, 9, '#e8d8b0').rect(28, 43, 8, 2, '#e8d8b0');
    p.rect(58, 8, 1, 30, '#5a3a24').rect(59, 9, 5, 9, '#a83a30').rect(59, 12, 5, 1, '#e8d8b0');
  },
  townhall: (p) => {
    // The town hall: a broad stone hall under a clock tower flying the flag.
    body(p, { left: 4, width: 56, top: 38, wall: '#c8bca0', side: '#a09478', roof: '#5a4a6a', light: '#6a5a7a', roofH: 14, door: '#6a3a24' });
    p.rect(24, 4, 16, 34, '#b8ac90').rect(36, 4, 4, 34, '#988c70').roof(22, 0, 20, 6, '#5a4a6a');
    p.disc(32, 16, 5, 5, '#e8e0cc').rect(32, 12, 1, 4, '#3a3030').rect(32, 16, 3, 1, '#3a3030');
    for (const x of [9, 17, 43, 51]) p.rect(x, 46, 5, 9, '#7a9ab8');
    p.rect(20, 66, 24, 2, '#a8a090');
  },
};

/** The town stores and the signs of the town's standing and its district's quarrels. */
const MARKS: Record<string, [number, number, (p: Px) => void]> = {
  // The town's granary (food) and storehouse (everything else): small, so they sit by the plaza.
  'store-granary': [30, 34, (p) => {
    p.shadow(15, 13, 2);
    for (const x of [4, 13, 22]) p.rect(x, 28, 4, 5, '#8a857a');
    p.rect(3, 12, 24, 16, '#b89a62').rect(22, 13, 5, 15, '#937a4a');
    for (let y = 15; y < 28; y += 4) p.rect(3, y, 24, 1, '#8a7046');
    p.roof(1, 2, 28, 11, '#6a5a3a', '#7a6a48').rect(12, 17, 6, 7, '#5a4026');
  }],
  'store-house': [34, 28, (p) => {
    p.shadow(17, 15, 2);
    p.rect(3, 11, 28, 16, '#9a8462').rect(25, 12, 6, 15, '#7a6648').roof(1, 3, 32, 9, '#5a5a5a', '#6a6a6a');
    p.rect(12, 15, 10, 12, '#4a3624').rect(13, 16, 8, 11, '#6a5038').rect(16, 16, 1, 11, '#4a3624');
  }],
  sack: [7, 7, (p) => { p.disc(3.5, 4.5, 3.2, 2.5, '#c8a46a').rect(2, 1, 3, 2, '#b08a54').px(3, 0, '#7a5a34'); }],
  crate: [7, 6, (p) => { p.rect(0, 0, 7, 6, '#8a6a3e').rect(0, 0, 7, 1, '#b08a54').rect(0, 0, 1, 6, '#6a4a2a').rect(6, 0, 1, 6, '#6a4a2a').rect(1, 3, 5, 1, '#6a4a2a'); }],
  // Zone stakes: a post with a pennant in the zone's colour and its emblem.
  'zone-farm': [10, 16, (p) => zoneStake(p, '#c8a830', (x, y) => p.rect(x + 2, y, 1, 4, '#5a4a1a').rect(x + 1, y, 3, 1, '#5a4a1a'))],
  'zone-craft': [10, 16, (p) => zoneStake(p, '#8a5a3a', (x, y) => p.rect(x, y, 4, 2, '#e8d8b0').rect(x + 1, y + 2, 2, 2, '#e8d8b0'))],
  'zone-market': [10, 16, (p) => zoneStake(p, '#c8423a', (x, y) => p.disc(x + 2, y + 2, 1.6, 1.6, '#f2d27a'))],
  'zone-civic': [10, 16, (p) => zoneStake(p, '#4a6aa8', (x, y) => p.rect(x + 1, y, 2, 3, '#e8e0cc').rect(x, y + 3, 4, 1, '#e8e0cc'))],
  'zone-housing': [10, 16, (p) => zoneStake(p, '#6a9a4a', (x, y) => p.roof(x, y, 5, 2, '#e8e0cc').rect(x + 1, y + 2, 3, 2, '#e8e0cc'))],
  // Tier pennants on the signpost's pole: one per tier above hamlet, the city's gilded.
  'tier-pole': [6, 30, (p) => { p.shadow(3, 2, 1).rect(2, 0, 2, 30, '#59412d').rect(2, 0, 1, 30, '#7a5a3a').disc(3, 0.5, 1.5, 1.2, '#d8b860'); }],
  'pennant-village': [10, 6, (p) => pennant(p, '#4a7a4a', '#6a9a5a')],
  'pennant-town': [12, 7, (p) => pennant(p, '#3a5a9a', '#5a7ab8')],
  'pennant-city': [14, 8, (p) => { pennant(p, '#a83a30', '#c8504a'); p.rect(0, 0, 14, 1, '#f2d27a').rect(0, 7, 3, 1, '#f2d27a'); }],
  // War: a levy poster nailed by the board (red sheet, crossed blades) and a black-and-red banner.
  'levy-poster': [12, 16, (p) => {
    p.rect(5, 6, 2, 10, '#59412d').rect(0, 0, 12, 10, '#e8d8b0').rect(0, 0, 12, 2, '#a83a30');
    for (let i = 0; i < 6; i++) { p.px(3 + i, 3 + i, '#3a3030'); p.px(8 - i, 3 + i, '#3a3030'); }
  }],
  'war-banner': [14, 34, (p) => {
    p.shadow(4, 3, 1).rect(3, 0, 2, 34, '#3a2a1c').rect(5, 2, 9, 14, '#2a2222').rect(5, 2, 9, 3, '#a83a30').rect(5, 13, 9, 3, '#a83a30');
    for (let i = 0; i < 5; i++) { p.px(7 + i, 6 + i, '#d8c8a8'); p.px(11 - i, 6 + i, '#d8c8a8'); }
  }],
  // A pact: a gold-knotted ribbon on its own staff (a trade pact with a neighbour district).
  'pact-ribbon': [12, 30, (p) => {
    p.shadow(3, 2, 1).rect(2, 0, 2, 30, '#59412d').rect(4, 2, 7, 4, '#d8a830').rect(4, 6, 2, 8, '#d8a830').rect(8, 6, 2, 6, '#d8a830').disc(6, 4, 2, 2, '#f2d27a');
  }],
};

function zoneStake(p: Px, colour: string, emblem: (x: number, y: number) => void): void {
  p.shadow(3, 2, 1).rect(2, 2, 2, 14, '#6a4a2a').rect(2, 2, 1, 14, '#8a6a4a');
  p.rect(4, 2, 6, 7, colour).rect(4, 2, 6, 1, '#000000', 0.15);
  emblem(5, 3);
}
function pennant(p: Px, c: string, light: string): void {
  for (let x = 0; x < p.w; x++) {
    const h = Math.max(1, Math.round(p.h * (1 - x / p.w)));
    const y0 = Math.floor((p.h - h) / 2);
    p.rect(x, y0, 1, h, x % 3 ? c : light);
  }
}

export function paintCivicTextures(scene: Phaser.Scene): void {
  for (const [kind, draw] of Object.entries(CIVIC)) makeTex(scene, civicTex(kind), W, H, draw);
  for (const [id, [w, h, draw]] of Object.entries(MARKS)) makeTex(scene, civicMarkTex(id), w, h, draw);
}

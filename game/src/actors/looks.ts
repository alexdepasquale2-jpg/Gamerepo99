/**
 * Who looks like what. Villagers get a look from their id and their settlement's kind (city folk dye their
 * cloth and wear tall hats; villagers wear undyed linen, aprons and straw), plus a walking tempo. The
 * inhabitant's body comes from its traits: sprite scale and walk speed (sim/embodiment) and its archetype's
 * species tags and tint. Textures are painted once per distinct look and cached on the scene.
 */
import type Phaser from 'phaser';
import type { SettlementKind } from '../sim/map/world-layout';
import type { DataTables } from '../sim/load-data';
import type { SimState } from '../sim/types/runtime';
import { spriteScale, walkSpeedMul } from '../sim/embodiment';
import { deriveRng } from '../sim/rng';
import { FH, FW, FRAMES, paintSheet, type Build, type Hat, type Look, type Species } from './draw-person';
import { cartStrip, courierStrip, faunaStrip, oxStrip, shadowCanvas, wagonStrip, type Strip } from './draw-critters';
import { hash, makeCanvas, outline, shade } from './paint';
import { manifestFrame } from '../world/assets';
import { packHeadingTex, packTex } from '../world/art/pack-art';
import { thingTex } from '../world/art/thing-art';
import { noteUse } from '../sim/data-use-world';

export const ART_SCALE = 2;
export const SHADOW_TEX = 'act-shadow';

const SKIN = ['#f2d0b0', '#e8b890', '#d09a70', '#b07a50', '#8a5a3a', '#6a4430'];
const HAIR = ['#2a2020', '#4a3020', '#6a4428', '#8a5a30', '#b08040', '#d8b870', '#a04a2a', '#3a3438'];
const GREY = ['#a8a4a0', '#d8d4cc'];

type Wardrobe = { cloth: string[]; trim: string[]; pants: string[]; hats: Hat[]; hatColors: string[]; apron: number; dress: number };
const WARDROBE: Record<SettlementKind, Wardrobe> = {
  city: {
    cloth: ['#3a4a8a', '#8a2a3a', '#5a3a7a', '#2a6a6a', '#b08a2a', '#2a2a3a', '#6a2a5a'],
    trim: ['#e8c878', '#e8dcc8', '#c8d0dc', '#c45a3a'],
    pants: ['#2a2a32', '#3a3438', '#4a4050'],
    hats: ['none', 'none', 'tall', 'cap', 'none', 'kerchief'],
    hatColors: ['#2a2a32', '#5a2a3a', '#3a4a6a'],
    apron: 0.08,
    dress: 0.4,
  },
  town: {
    cloth: ['#4a7a4a', '#7a5a3a', '#a0502a', '#4a6678', '#b89040', '#6a7a8a', '#8a6a5a'],
    trim: ['#d8c8a0', '#5a4634', '#e8dcc8'],
    pants: ['#4a4038', '#3e4a52', '#5a4a3a'],
    hats: ['none', 'cap', 'kerchief', 'none', 'hood'],
    hatColors: ['#5a4634', '#3e4a52', '#7a3a2a', '#4a6044'],
    apron: 0.3,
    dress: 0.4,
  },
  village: {
    cloth: ['#c8b890', '#8a7458', '#6a7048', '#9a8a70', '#7a6a5a', '#a89068', '#5a6050'],
    trim: ['#e8dcc0', '#7a5a3a', '#b8a888'],
    pants: ['#5a4a38', '#6a5a48', '#4a4438'],
    hats: ['straw', 'none', 'hood', 'kerchief', 'straw', 'none'],
    hatColors: ['#d8b860', '#8a7458', '#a89068', '#c8a050'],
    apron: 0.45,
    dress: 0.35,
  },
};

export type PersonLook = {
  look: Look;
  /** Walk speed multiplier and animation tempo (frames/sec) for this person. */
  speed: number;
  fps: number;
  /** Phase for the idle breath. */
  bob: number;
  /** Sprite scale (children are small). */
  scale: number;
};

/** A villager's look: deterministic from their id, dressed for their settlement kind. */
export function villagerLook(p: { id: string; tags?: string[]; age?: number }, kind: SettlementKind, seed: number): PersonLook {
  const rng = deriveRng(seed, 'look', p.id);
  const pick = <T>(xs: readonly T[]): T => xs[rng.int(0, xs.length)]!;
  const W = WARDROBE[kind];
  const age = p.age ?? 20 + rng.int(0, 40);
  const child = age < 14;
  const old = age >= 58;
  const dress = rng.next() < W.dress;
  const build: Build = child ? 'slim' : pick(['slim', 'mid', 'mid', 'stout'] as const);
  const cloth = pick(W.cloth);
  const look: Look = {
    species: 'human',
    skin: pick(SKIN),
    hair: old ? pick(GREY) : pick(HAIR),
    hairStyle: dress ? pick([1, 1, 3, 0]) : pick([0, 0, 2, 1]),
    cloth,
    trim: pick(W.trim),
    pants: pick(W.pants),
    shoes: shade(pick(W.pants), -0.35),
    hat: child ? 'none' : pick(W.hats),
    hatColor: pick(W.hatColors),
    build,
    dress,
    beard: !dress && !child && rng.next() < (old ? 0.6 : 0.25),
    apron: !child && rng.next() < W.apron,
  };
  const tempo = kind === 'city' ? 1.12 : kind === 'town' ? 1 : 0.88;
  const speed = (0.82 + rng.next() * 0.36) * tempo * (old ? 0.8 : child ? 1.15 : 1);
  return { look, speed, fps: 5 + speed * 3, bob: rng.next() * Math.PI * 2, scale: child ? ART_SCALE * 0.72 : ART_SCALE };
}

/** The inhabitant's body: species from its archetype's tags, its tint as the skin, scale and speed from traits. */
export function inhabitantLook(st: SimState, variant = 0): PersonLook {
  const arch = ((st.data as DataTables | undefined)?.archetypes ?? []).find((a) => a.id === st.player.archetypeId) as
    | { speciesTags?: string[]; tint?: string }
    | undefined;
  const tags = arch?.speciesTags ?? [];
  const species: Species = tags.includes('ogre') ? 'ogre' : tags.includes('basilisk') ? 'basilisk' : 'human';
  const tint = arch?.tint;
  const rng = deriveRng(st.seed, 'inhabitant-look', st.player.archetypeId, variant);
  const base = species === 'ogre' ? '#b8c49a' : species === 'basilisk' ? '#9fd4b0' : '#e8b890';
  const skin = species === 'human' ? SKIN[1]! : shade(tint ?? base, (variant % 3) * 0.08 - 0.08);
  const look: Look = {
    species,
    skin,
    hair: species === 'ogre' ? '#3a3020' : HAIR[rng.int(0, 4)]!,
    hairStyle: 0,
    cloth: species === 'ogre' ? '#6a4a30' : tint ?? '#5a6a82',
    trim: species === 'basilisk' ? ['#c8e060', '#e0a040', '#a0d0e0'][variant % 3]! : '#b89040',
    pants: '#3a3438',
    shoes: '#2a2420',
    hat: 'none',
    hatColor: '#3a3438',
    build: 'mid',
    dress: false,
    beard: false,
    apron: false,
  };
  const speed = walkSpeedMul(st.player);
  // A basilisk is drawn low in its frame; scale it so the trait's size reads against a human.
  const drawn = species === 'basilisk' ? 1.35 : 1;
  return { look, speed, fps: 7 * speed, bob: 0, scale: ART_SCALE * spriteScale(st.player) * drawn };
}

/** Texture for a look (painted on first use, then shared by everyone who looks the same). */
export function lookTexture(scene: Phaser.Scene, look: Look): string {
  const key = `act-p-${hash(JSON.stringify(look)).toString(36)}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.addCanvas(key, paintSheet(look));
  if (tex) for (let i = 0; i < FRAMES; i++) tex.add(String(i), 0, i * FW, 0, FW, FH);
  return key;
}

export const addStrip = (scene: Phaser.Scene, key: string, make: () => Strip): string => {
  if (scene.textures.exists(key)) return key;
  const s = make();
  const tex = scene.textures.addCanvas(key, s.canvas);
  if (tex) for (let i = 0; i < 2; i++) tex.add(String(i), 0, i * s.fw, 0, s.fw, s.fh);
  return key;
};

export const faunaTexture = (scene: Phaser.Scene, id: string): string => addStrip(scene, `act-fauna-${id}`, () => faunaStrip(id));
const VEHICLE = { wagon: wagonStrip, ox: oxStrip, cart: cartStrip, 'cart-empty': emptyCart, courier: courierStrip };
export const vehicleTexture = (scene: Phaser.Scene, kind: keyof typeof VEHICLE): string => addStrip(scene, `act-${kind}`, VEHICLE[kind]);

/** The strip outline's colour (actors/paint outline's default), for the line re-drawn on an emptied cart. */
const OUTLINE: [number, number, number, number] = [27, 22, 18, 230];

/**
 * The handcart with its painted goods lifted off (everything above the bed), for a pack-art load on top.
 * Clearing those rows takes the bed's top outline with them, so it is drawn back over the bed.
 */
function emptyCart(): Strip {
  const s = cartStrip(), w = s.canvas.width;
  const g = s.canvas.getContext('2d', { willReadFrequently: true })!;
  g.clearRect(0, 0, w, CART_BED_Y);
  const img = g.getImageData(0, CART_BED_Y - 1, w, 2), d = img.data;
  for (let x = 0; x < w; x++) if (d[(w + x) * 4 + 3]! > 40) d.set(OUTLINE, x * 4);
  g.putImageData(img, 0, CART_BED_Y - 1);
  return s;
}
/** Row of the cart strip's bed top (1x px from its top), and its height: where a load sits. */
export const CART_BED_Y = 7;
export const CART_H = 16;

/*
 * Cart loads from the art packs (overworld-assets cargo.*, plus ore and crop frames for the goods those
 * show best). Goods with no pack frame keep the painted cart and its generic load.
 */
const CARGO: Record<string, string> = {
  grain: 'cargo.food_grain', flour: 'cargo.food_grain', bread: 'cargo.food_grain', berries: 'cargo.food_grain', fish: 'cargo.food_grain',
  timber: 'cargo.timber', wood: 'cargo.fuel_cord', kindling: 'cargo.fuel_cord',
  wool: 'cargo.wool', cloth: 'cargo.wool', coin: 'cargo.coin',
  ore: 'ore.ore_copper', stone: 'ore.ore_iron', flax: 'crop.crop_flax',
};
/** Largest load on a cart bed, in 1x px: it sits on the bed and must not dwarf the cart. */
const LOAD_W = 13, LOAD_H = 10;
/** Frames drawn top-down that would stand up like a board on the bed: squashed into a low heap instead. */
const FLAT: Record<string, [number, number]> = { 'cargo.food_grain': [12, 6] };

/** The pack texture for a load of `itemId` (null if its goods have no frame or the packs are not in yet). */
export function cargoTexture(scene: Phaser.Scene, itemId: string): string | null {
  const key = CARGO[itemId];
  const mf = key ? manifestFrame(scene, key) : null;
  // Timber's frame is in a pack the game does not ship; the painted log stack stands in for it.
  if (key === 'cargo.timber' && !mf) { noteUse('art', key); return thingTex('timber'); }
  if (!key || !mf) return null;
  const fr = scene.textures.getFrame(mf.tex, mf.frame);
  // Fit the frame inside the load box, never finer than the world's own 2:1 pack pixel.
  const flat = FLAT[key];
  const f = flat ? fr.cutWidth / flat[0] : Math.max(2, Math.ceil(Math.max(fr.cutWidth / LOAD_W, fr.cutHeight / LOAD_H) * 2) / 2);
  const tex = packTex(scene, key, f, flat ? fr.cutHeight / flat[1] : f);
  if (tex) noteUse('art', key);
  return tex;
}

/** 8-way heading index (0 N, 1 NE … 7 NW) of a screen direction. */
export const heading8 = (dx: number, dy: number): number => ((Math.round(Math.atan2(dx, -dy) / (Math.PI / 4)) % 8) + 8) % 8;

/** A caravan's pack mule facing `heading` (caravan.caravaner, 8-way), or null before the packs load. */
export function muleTexture(scene: Phaser.Scene, heading: number): string | null {
  const tex = packHeadingTex(scene, 'caravan.caravaner', heading, 1.5, outlinedMule);
  if (tex) noteUse('art', 'caravan.caravaner');
  return tex;
}

/** The baked caravan strip has no outline; the wagon and ox it walks with do, so it gets theirs. */
function outlinedMule(c: HTMLCanvasElement): HTMLCanvasElement {
  const { canvas, g } = makeCanvas(c.width + 2, c.height + 2);
  g.drawImage(c, 1, 1);
  outline(g, canvas.width, canvas.height, canvas.width, canvas.height);
  return canvas;
}

/** A rat (fauna.rat, a 16 px frame, shrunk to sit below a cart's size) come to pick at a wreck's spill. */
export function ratTexture(scene: Phaser.Scene): string | null {
  const tex = packTex(scene, 'fauna.rat', 1.5);
  if (tex) noteUse('art', 'fauna.rat');
  return tex;
}

export function ensureShadow(scene: Phaser.Scene): string {
  if (!scene.textures.exists(SHADOW_TEX)) scene.textures.addCanvas(SHADOW_TEX, shadowCanvas());
  return SHADOW_TEX;
}

/** Height of a figure's head above its foot, in world px. */
export const headHeight = (scale: number): number => FH * scale - 2;

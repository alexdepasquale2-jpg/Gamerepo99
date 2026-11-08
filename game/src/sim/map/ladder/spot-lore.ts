/**
 * Wild spots as places with a past (data/world/spots.json): which prop arrangement a spot is drawn with,
 * and for the notable ones (ruin, shrine, camp, cairn, clearing, cart, pond) a seeded name in the local
 * culture ("the Old Kettle Ruin", "Wyn's Shrine") and a one-line story. Everything is a pure function of
 * (seed, spot id, type): the map labels a prop with it and the sim re-derives the same name for the story
 * verb, so nothing is stored. Pure, deterministic, no Phaser/DOM.
 */
import cfg from '../../../data/world/spots.json';
import { districtAt, districtAtTile, DISTRICTS } from '../districts';
import { fhash, FEATURES } from './features';

/** One layout op (see spots.json _doc). */
export type LayoutOp = (string | number)[];
type Named = { heart: string[]; names: string[]; history: string[]; plain: string[] };
type Words = { grim: string[]; soft: string[]; saint: string[]; land: Record<string, string[]> };

const LAYOUTS = cfg.layouts as Record<string, LayoutOp[][]>;
const NAMED = cfg.named as Record<string, Named>;
const VERB = cfg.verb as Record<string, { label: string; short: string }>;
const WORDS = cfg.words as Words;

/** The tag a dressed prop carries when it belongs to a named spot. */
export type SpotTag = { id: string; type: string };

/** The arrangement for a spot of this type; `roll` in [0,1) picks among its variants. */
export function spotLayout(type: string, roll: number): { ops: LayoutOp[]; variant: number } {
  const all = LAYOUTS[type] ?? [];
  const variant = Math.min(all.length - 1, Math.floor(roll * all.length));
  return { ops: all[variant] ?? [], variant: Math.max(0, variant) };
}

export const isNamedSpot = (type: string): boolean => type in NAMED;
/** The props that are the spot itself (the shrine of a shrine), labelled by its bare name. */
export const isSpotHeart = (type: string, propType: string): boolean => !!NAMED[type]?.heart.includes(propType);
export const spotVerb = (type: string): { label: string; short: string } => VERB[type] ?? VERB.default!;

// A district is a few hundred hashes to work out; a chunk names a handful of spots, so keep the last few.
const charCache = new Map<string, { culture: string; land: string }>();
function localCharacter(seed: number, q: number, r: number): { culture: string; land: string } | null {
  const d = districtAtTile(q, r);
  if (!d) return null;
  const key = `${seed}:${d.col},${d.row}`;
  let c = charCache.get(key);
  if (!c) {
    const ch = districtAt(seed, d.col, d.row).character;
    c = { culture: ch.culture, land: ch.land };
    if (charCache.size > 64) charCache.clear();
    charCache.set(key, c);
  }
  return c;
}

/** `spot#X,Y` → its anchor cell's middle tile (where its district and land are read). */
function anchorTile(id: string): { q: number; r: number } | null {
  const m = /^spot#(-?\d+),(-?\d+)$/.exec(id);
  if (!m) return null;
  const A = FEATURES.anchorTiles;
  return { q: Number(m[1]) * A + A / 2, r: Number(m[2]) * A + A / 2 };
}

export type SpotLore = { name: string; person: string; root: string; land: string };

/** A named spot's name and the words it was named from (null for an unnamed type or a bad id). */
export function spotLore(seed: number, id: string, type: string): SpotLore | null {
  const row = NAMED[type], at = anchorTile(id);
  if (!row || !at) return null;
  const h = (i: number) => fhash(seed ^ 0x10e5, at.q, at.r, i);
  const pick = <T>(arr: readonly T[], i: number): T => arr[Math.floor(h(i) * arr.length) % arr.length]!;
  const local = localCharacter(seed, at.q, at.r);
  const culture = DISTRICTS.cultures.find((c) => c.id === local?.culture) ?? pick(DISTRICTS.cultures, 1);
  const lands = WORDS.land[local?.land ?? ''] ?? WORDS.land[pick(Object.keys(WORDS.land), 2)]!;
  const lore = { person: pick(culture.people, 3), root: pick(culture.roots, 4), land: pick(lands, 5) };
  const name = fill(pick(row.names, 6), { ...lore, grim: pick(WORDS.grim, 7), soft: pick(WORDS.soft, 8), saint: pick(WORDS.saint, 9) });
  return { name, ...lore };
}

/** The spot's one-line story: a history template around `gist` (a beat of the world's past), else a plain one. */
export function spotStory(seed: number, id: string, type: string, gist?: string): string | null {
  const row = NAMED[type], lore = spotLore(seed, id, type), at = anchorTile(id);
  if (!row || !lore || !at) return null;
  const pool = gist && row.history.length ? row.history : row.plain;
  const line = pool[Math.floor(fhash(seed ^ 0x570e, at.q, at.r, gist ? 1 : 2) * pool.length) % pool.length]!;
  return `${title(lore.name)}. ${fill(line, { ...lore, gist: gist ?? '' })}`;
}

export const title = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const fill = (t: string, w: Record<string, string>): string => t.replace(/\{(\w+)\}/g, (_, k: string) => w[k] ?? '');

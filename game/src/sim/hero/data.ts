/** The hero's tables (data/hero/*.json) and lookups. Pure: no state. */
import foesJson from '../../data/hero/foes.json';
import gearJson from '../../data/hero/gear.json';
import skillsJson from '../../data/hero/skills.json';
import type { Slot } from './types';

export type Family = 'despair' | 'bandit' | 'beast' | 'rival';
export type FoeRow = {
  id: string; name: string; family: Family; ai: 'melee' | 'ranged' | 'charger' | 'boss';
  art?: string; figure?: boolean; tint?: string; boss?: boolean; scale?: number;
  hp: number; dmg: number; speed: number; reach: number; cd: number; windup: number; aggro: number; size: number; xp: number;
  summon?: string;
  drops: { coin: [number, number]; items: { id: string; chance: number; n: number }[]; gear: number };
};
export type LairRow = { name: string; boss: string; guard: string[] };
export type BaseRow = { id: string; name: string; slot: Slot; level: number; dmg?: [number, number]; rate?: number; reach?: number; arc?: number; shot?: number; armor?: number; speed?: number; sparkRegen?: number };
export type RarityRow = { id: string; name: string; weight: number; affixes: number; color: string };
export type AffixRow = { stat: string; name: string; range: [number, number]; slots: Slot[] };
export type SkillRow = {
  id: string; name: string; branch: string; level: number; max: number; spark: number; cd: number; kind: string; desc: string;
  mult?: number[]; reach?: number; radius?: number; dur?: number | number[]; heal?: number[];
};

const F = foesJson as unknown as { scaling: { hp: number; dmg: number; xp: number }; families: Record<Family, { name: string; color: string }>; foes: FoeRow[]; packs: Record<Family, string[][]>; lairs: Record<Family, LairRow> };
export const FOES = F.foes;
export const FOE_SCALING = F.scaling;
export const FAMILIES = F.families;
export const PACKS = F.packs;
export const LAIRS = F.lairs;
const FOE_BY_ID = new Map(FOES.map((f) => [f.id, f]));
export const foeRow = (id: string): FoeRow | undefined => FOE_BY_ID.get(id);

const G = gearJson as unknown as { perLevel: number; bases: BaseRow[]; rarities: RarityRow[]; affixes: AffixRow[]; names: { prefix: string[]; suffix: string[] }; start: Record<string, { base: string; rarity: string; level: number; name: string }> };
export const GEAR_PER_LEVEL = G.perLevel;
export const BASES = G.bases;
export const RARITIES = G.rarities;
export const AFFIXES = G.affixes;
export const GEAR_NAMES = G.names;
export const START_GEAR = G.start;
const BASE_BY_ID = new Map(BASES.map((b) => [b.id, b]));
export const baseRow = (id: string): BaseRow | undefined => BASE_BY_ID.get(id);
export const rarityRow = (id: string): RarityRow => RARITIES.find((r) => r.id === id) ?? RARITIES[0]!;

const S = skillsJson as unknown as { branches: Record<string, string>; skills: SkillRow[]; start: { skills: Record<string, number>; slots: (string | null)[] } };
export const BRANCHES = S.branches;
export const SKILLS = S.skills;
export const START_SKILLS = S.start;
const SKILL_BY_ID = new Map(SKILLS.map((s) => [s.id, s]));
export const skillRow = (id: string): SkillRow | undefined => SKILL_BY_ID.get(id);
/** A per-rank number (rank 1 = index 0), or a flat one. */
export const atRank = (v: number | number[] | undefined, rank: number, fallback = 0): number =>
  v === undefined ? fallback : Array.isArray(v) ? v[Math.max(0, Math.min(v.length - 1, rank - 1))]! : v;

/** Experience to go from this level to the next. */
export const xpToNext = (level: number): number => Math.round(60 * Math.pow(level, 1.55));
export const MAX_LEVEL = 30;
/** Days a cleared lair lies quiet. */
export const LAIR_RESPAWN = 12;

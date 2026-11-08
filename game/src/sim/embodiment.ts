/**
 * Embodiment and perception rules for the player's inhabitant. Everything here reads trait data on
 * the inhabitant (walk speed, size, ways in, bodies, perception) — never the archetype id. Entrances
 * are data (data/world/entrances.json), read against embodiment.allowedApproachTags and blockedTileTags.
 * Pure: no Phaser/DOM.
 */

import { prettyTownId } from './map/districts';
import entrancesJson from '../data/world/entrances.json';
import fallbackJson from '../data/dialogue/surface-fallbacks.json';
import { approachTags, canEnterTile } from './inhabitant';
import { jobOf } from './goods/jobs';
import type { BodyState, Inhabitant, SimState } from './types/runtime';

export const WITH_YOU = 'with_you';

/** One way into an interior (data/world/entrances.json). */
export type Entrance = { id: string; tags: string[]; lineKey?: string };
type EntrancesFile = { kinds: Record<string, Entrance[]>; refuseKey?: Record<string, string>; fallback: Entrance[] };
const ENTRANCE_FILE = entrancesJson as EntrancesFile;
/** How each interior kind can be entered (data). A body gets in through any one entrance it may use. */
export const ENTRANCES: Readonly<Record<string, readonly Entrance[]>> = ENTRANCE_FILE.kinds;
const LINES = (fallbackJson as { lines: Record<string, string[]> }).lines;

/** May this body use this entrance: every tag allowed (when the body lists its ways in), none blocked. */
function mayUse(inh: Inhabitant, e: Entrance): boolean {
  const allowed = approachTags(inh);
  return canEnterTile(inh, e.tags) && (!allowed || e.tags.every((t) => allowed.includes(t)));
}

/** The entrance this body comes in by (the first it may use), or null when none lets it in. */
export function entranceFor(inh: Inhabitant, kind: string): Entrance | null {
  return (ENTRANCES[kind] ?? ENTRANCE_FILE.fallback).find((e) => mayUse(inh, e)) ?? null;
}

export function walkSpeedMul(inh: Inhabitant): number {
  return inh.embodiment.walkSpeedMul ?? 1;
}

export function spriteScale(inh: Inhabitant): number {
  return inh.embodiment.spriteScale ?? 1;
}

/** Can this body get into an interior of this kind (through any of its entrances)? */
export function canEnterBuilding(inh: Inhabitant, kind: string): boolean {
  return entranceFor(inh, kind) !== null;
}

const pick = (key: string | undefined, salt: string): string | undefined => {
  const pool = key ? LINES[key] : undefined;
  if (!pool?.length) return undefined;
  let h = 0;
  for (const c of salt) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return pool[h % pool.length];
};
const activeBodyName = (inh: Inhabitant): string => inh.bodies?.find((b) => b.id === inh.activeBodyId)?.name ?? 'You';

/** Said as the body comes in by a way other than the front door ("Ash slips in through the vent."), else undefined. */
export function entryLine(inh: Inhabitant, e: Entrance, salt = ''): string | undefined {
  return pick(e.lineKey, salt + e.id)?.replace(/\{body\}/g, activeBodyName(inh));
}

/**
 * Why this body is kept out of a kind of room: its own blockedLine when a blocked tag stopped it (an ogre
 * and a cottage door), else the room's refusal line (an office for people with business on paper).
 */
export function refusedDoorLine(inh: Inhabitant, kind: string): string {
  const entrances = ENTRANCES[kind] ?? ENTRANCE_FILE.fallback;
  const blocked = entrances.some((e) => !canEnterTile(inh, e.tags));
  const room = pick(ENTRANCE_FILE.refuseKey?.[kind], kind);
  return (blocked ? inh.embodiment.blockedLine : undefined) ?? room ?? blockedDoorLine(inh);
}

export function blockedDoorLine(inh: Inhabitant): string {
  return inh.embodiment.blockedLine ?? "You can't get through this door.";
}

// ---------- multi-body (e.g. the brood) ----------

export function isMultiBody(inh: Inhabitant): boolean {
  return (inh.bodies?.length ?? 0) > 1;
}

/** Bodies travelling with the player, the active one first. */
export function bodiesWithYou(inh: Inhabitant): BodyState[] {
  const all = inh.bodies ?? [];
  return [...all.filter((b) => b.id === inh.activeBodyId), ...all.filter((b) => b.at === WITH_YOU && b.id !== inh.activeBodyId)];
}

/** Bodies waiting in some town other than the one the player stands in. */
export function bodiesElsewhere(inh: Inhabitant): BodyState[] {
  return (inh.bodies ?? []).filter((b) => b.at !== WITH_YOU && b.at !== inh.townId);
}

/** Bodies waiting in the player's current town (they can be called back). */
export function bodiesHere(inh: Inhabitant): BodyState[] {
  return (inh.bodies ?? []).filter((b) => b.at !== WITH_YOU && b.at === inh.townId);
}

/** Leave one following body in the current town. Returns it, or null if none can stay. */
export function leaveBodyHere(state: SimState): BodyState | null {
  const inh = state.player;
  if (!inh.townId) return null;
  const follower = (inh.bodies ?? []).find((b) => b.at === WITH_YOU && b.id !== inh.activeBodyId);
  if (!follower) return null;
  follower.at = inh.townId;
  return follower;
}

/** Every body waiting in the current town rejoins the player. */
export function callBodiesBack(state: SimState): BodyState[] {
  const here = bodiesHere(state.player);
  for (const b of here) b.at = WITH_YOU;
  return here;
}

/**
 * Take control of a body waiting in another town. The bodies with you stay behind where you stood;
 * the player is now in the target body's town. Returns that town id, or null.
 */
export function switchToBody(state: SimState, bodyId: string): string | null {
  const inh = state.player;
  const target = inh.bodies?.find((b) => b.id === bodyId);
  if (!target || target.at === WITH_YOU || !inh.townId) return null;
  const dest = target.at;
  for (const b of inh.bodies ?? []) if (b.at === WITH_YOU) b.at = inh.townId;
  target.at = WITH_YOU;
  inh.activeBodyId = target.id;
  inh.townId = dest;
  return dest;
}

/** What idle bodies overheard at dawn: the most despairing person in each town where one waits. */
export function eavesdropReports(state: SimState): string[] {
  const out: string[] = [];
  // A sibling set to watch a place reports what it saw there instead (sim/contrib/body-acts).
  const watching = state.bodyActs?.watches ?? {};
  for (const b of bodiesElsewhere(state.player)) {
    if (watching[b.id]?.townId === b.at) continue;
    const folk = Object.values(state.people).filter((p) => p.townId === b.at);
    if (!folk.length) continue;
    const low = folk.reduce((a, p) => (p.flame < a.flame ? p : a));
    const said = (low as { tellGivenUp?: string; firstLine?: string }).tellGivenUp ?? (low as { firstLine?: string }).firstLine;
    const who = low.name ?? low.id;
    out.push(said ? `${b.name}, waiting in ${townName(b.at)}, heard ${who}: "${said}"` : `${b.name}, waiting in ${townName(b.at)}, watched ${who} sit still all night.`);
  }
  return out;
}

function townName(id: string): string {
  return prettyTownId(id);
}

// ---------- perception ----------

/** Neutral first-impression trust; perception pulls halfway from here toward its own trust value. */
export const FIRST_TRUST_NEUTRAL = 0.35;

/** Trust a person starts with toward this inhabitant: perception baseline plus any trade-kinship bonus. */
export function firstTrust(state: SimState, personId: string): number {
  const perc = (state.player.perception ?? {}) as { trust?: number; trustBonusByJob?: Record<string, number> };
  let t = FIRST_TRUST_NEUTRAL;
  if (typeof perc.trust === 'number') t += (perc.trust - FIRST_TRUST_NEUTRAL) * 0.5;
  if (perc.trustBonusByJob) t += perc.trustBonusByJob[jobOf(state, personId).id] ?? 0;
  return Math.min(1, Math.max(0, t));
}

// ---------- day flags read by hooks ----------

/** Note what the player did today (after a resolved act). */
export function noteActToday(state: SimState, methodId: string, interactionKind: string | undefined): void {
  const m = ((state.flags.methodsUsedToday ??= []) as string[]);
  if (!m.includes(methodId)) m.push(methodId);
  if (interactionKind) {
    const k = ((state.flags.interactionKindsToday ??= []) as string[]);
    if (!k.includes(interactionKind)) k.push(interactionKind);
  }
}

/** Embodiment flags for dusk/dawn hooks. */
export function setBodyFlags(state: SimState): void {
  const inh = state.player;
  const apart = bodiesElsewhere(inh).length > 0;
  state.flags.bodiesInMultipleTowns = apart;
  state.flags.allBodiesSameTown = !apart;
  state.flags.playerAtHome = !!inh.homeTownId && inh.townId === inh.homeTownId;
}

/** Start of a dawn: today's acts become yesterday's; embodiment flags refreshed. */
export function rollDayFlags(state: SimState): void {
  state.flags.methodsUsedYesterday = (state.flags.methodsUsedToday as string[] | undefined) ?? [];
  state.flags.interactionKindsYesterday = (state.flags.interactionKindsToday as string[] | undefined) ?? [];
  state.flags.methodsUsedToday = [];
  state.flags.interactionKindsToday = [];
  setBodyFlags(state);
}

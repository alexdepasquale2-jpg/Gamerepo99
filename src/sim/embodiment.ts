/**
 * Embodiment and perception rules for the player's inhabitant. Everything here reads trait data on
 * the inhabitant (walk speed, size, blocked entrances, bodies, perception) — never the archetype id.
 * Pure: no Phaser/DOM.
 */

import { canEnterTile } from './inhabitant';
import { jobOf } from './goods/jobs';
import type { BodyState, Inhabitant, SimState } from './types/runtime';

export const WITH_YOU = 'with_you';

/** How each interior can be entered. A body gets in if any one entrance's tags are all allowed. */
export const ENTRANCES: Record<'house' | 'shop' | 'inn', string[][]> = {
  house: [['door_front', 'interior_tight']],
  shop: [['door_front', 'interior']],
  inn: [['door_front', 'interior'], ['yard']],
};

export function walkSpeedMul(inh: Inhabitant): number {
  return inh.embodiment.walkSpeedMul ?? 1;
}

export function spriteScale(inh: Inhabitant): number {
  return inh.embodiment.spriteScale ?? 1;
}

/** Can this body get into an interior of this kind (through any of its entrances)? */
export function canEnterBuilding(inh: Inhabitant, kind: keyof typeof ENTRANCES): boolean {
  return (ENTRANCES[kind] ?? [['door_front']]).some((tags) => canEnterTile(inh, tags));
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
  for (const b of bodiesElsewhere(state.player)) {
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
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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

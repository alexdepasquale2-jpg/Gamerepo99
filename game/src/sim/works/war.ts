/**
 * Waging war: raise a band at a yard with a barracks, enlist townsfolk, arm them from the yard (spears,
 * shields, mail, muskets), roll war machines in beside them, and feed them: every soldier eats a ration
 * each dawn, and a hungry band loses heart and then soldiers. March on a town (provisions for the road are
 * packed from the yard) and fight it at the far end: the band's power against the town's own weight.
 * A town taken becomes your vassal: tribute every dawn, despair from the conquest, and a revolt when that
 * despair runs high and no feast has been held there. The fallen are sent home wounded, never killed.
 * Pure + deterministic (deriveRng).
 */
import { strength, atWar } from '../economy/polity';
import { addItem } from '../goods/inventory';
import { deriveRng } from '../rng';
import { planRoad } from '../road-journey';
import type { SimState } from '../types/runtime';
import { DESIGN_BY_ID, TUNING, plural, stockText } from './data';
import { eatRation, rationsIn } from './lines';
import { bump, coinOf, depotAt, eraOf, freeHands, hasBuilding, news, personFirst, roadDays, take, townName, worksIfAny, worksOf } from './state';
import type { Band, Result } from './types';
import { isWarMachine, statsOf, vehicleById, wear } from './vehicles';

export const bandOf = (state: SimState): Band | undefined => worksIfAny(state)?.band;
export const bandCap = (state: SimState): number => TUNING.bandMax[eraOf(state)] ?? 4;
export const isVassal = (state: SimState, townId: string): boolean => !!worksIfAny(state)?.vassals.some((v) => v.townId === townId);
/** A town that is yours to stand in: a yard of yours, or a vassal. */
export const friendly = (state: SimState, townId: string): boolean => !!depotAt(state, townId) || isVassal(state, townId);

export function raiseBand(state: SimState, townId: string): Result {
  const w = worksOf(state);
  if (w.band) return { ok: false, line: 'You already have a band.' };
  if (!hasBuilding(state, townId, 'barracks')) return { ok: false, line: 'A band is raised at a barracks in one of your yards.' };
  w.band = { townId, soldiers: [], kit: {}, vehicles: [], morale: 0.8, battles: 0 };
  return { ok: true, line: `You hang a banner over the barracks in ${townName(state, townId)}. Now you need people under it.` };
}

export function enlist(state: SimState, personId?: string): Result {
  const b = bandOf(state);
  if (!b) return { ok: false, line: 'You have no band to enlist into. Raise one at a barracks.' };
  if (b.march) return { ok: false, line: 'The band is on the march.' };
  if (b.soldiers.length >= bandCap(state)) return { ok: false, line: `The band is as big as this age allows (${bandCap(state)}).` };
  const free = freeHands(state, b.townId);
  const willing = (id: string): boolean => (state.people[id]?.flame ?? 50) >= MIN_FLAME;
  const pick = personId ?? free.find(willing);
  if (!pick || !free.includes(pick)) return { ok: false, line: `Nobody free in ${townName(state, b.townId)} will take the bounty.` };
  if (!willing(pick)) return { ok: false, line: `${personFirst(state, pick)} has no fire left to fight for anyone.` };
  if (coinOf(state) < TUNING.enlistCoin) return { ok: false, line: `The bounty is ${TUNING.enlistCoin} coin.` };
  addItem(state, 'coin', -TUNING.enlistCoin);
  b.soldiers.push(pick);
  bump(worksOf(state), 'enlisted');
  return { ok: true, line: `${personFirst(state, pick)} takes the bounty and joins the band.` };
}
export function dismiss(state: SimState): Result {
  const p = bandOf(state)?.soldiers.pop();
  return p ? { ok: true, line: `${personFirst(state, p)} goes home.` } : { ok: false, line: 'Nobody is left to send home.' };
}

const ARMS = ['spear', 'shield', 'mail', 'musket'];
/** Someone this far gone (flame) will not take a bounty to fight. */
const MIN_FLAME = 5;
/** Draw arms from the yard where the band stands, up to one of each kind per soldier. */
export function arm(state: SimState): Result {
  const b = bandOf(state);
  if (!b || !depotAt(state, b.townId)) return { ok: false, line: 'The band must stand in one of your yards to draw arms.' };
  const drawn: string[] = [];
  for (const id of ARMS) {
    const want = Math.max(0, b.soldiers.length - (b.kit[id] ?? 0));
    const have = depotAt(state, b.townId)!.stock[id] ?? 0;
    const n = Math.min(want, have);
    if (n > 0) { take(state, b.townId, { [id]: n }, false); b.kit[id] = (b.kit[id] ?? 0) + n; drawn.push(`${n} ${id}${n === 1 ? '' : 's'}`); }
  }
  return drawn.length ? { ok: true, line: `The band draws ${drawn.join(', ')}.` } : { ok: false, line: 'There are no arms in the yard to hand out.' };
}

export function attach(state: SimState, vehicleId: string): Result {
  const b = bandOf(state);
  const v = vehicleById(state, vehicleId);
  if (!b || !v) return { ok: false, line: 'Nothing to attach.' };
  if (v.townId !== b.townId || v.job !== 'idle') return { ok: false, line: `${v.name} must stand idle where the band is.` };
  v.job = 'band';
  b.vehicles.push(v.id);
  return { ok: true, line: `${v.name} rolls in with the band.` };
}
export function detach(state: SimState, vehicleId: string): Result {
  const b = bandOf(state);
  const v = vehicleById(state, vehicleId);
  if (!b || !v || !b.vehicles.includes(v.id)) return { ok: false, line: 'It is not with the band.' };
  if (b.march) return { ok: false, line: 'Not while the band is on the march.' };
  b.vehicles = b.vehicles.filter((x) => x !== v.id);
  v.job = 'idle';
  return { ok: true, line: `${v.name} is stood down.` };
}

export type Power = { soldiers: number; attack: number; guard: number; machines: number; total: number };
export function powerOf(state: SimState): Power {
  const b = bandOf(state);
  if (!b) return { soldiers: 0, attack: 0, guard: 0, machines: 0, total: 0 };
  const n = b.soldiers.length;
  const k = (id: string): number => Math.min(n, b.kit[id] ?? 0);
  const muskets = k('musket'), spears = Math.min(n - muskets, k('spear'));
  const attack = n + muskets * 3 + spears * 1;
  const guard = k('shield') * 0.5 + k('mail') * 1;
  let machines = 0;
  for (const id of b.vehicles) { const v = vehicleById(state, id); if (v) { const s = statsOf(v); machines += s.fire * 2 + s.armor; } }
  const total = Math.round((attack + guard + machines) * (0.5 + 0.5 * b.morale) * 10) / 10;
  return { soldiers: n, attack, guard, machines, total };
}
/**
 * How much a town stands against you: its own weight (people, buildings, companies, techs), and every town
 * you already hold makes the rest band together (+25% each), so the Crown is a climb, not a stroll.
 */
export const defenceOf = (state: SimState, townId: string): number =>
  Math.round((4 + strength(state, townId) * 0.35) * (1 + 0.25 * (worksIfAny(state)?.vassals.length ?? 0)));

/** Rations a march of this many days needs (a field stove saves a quarter). */
export function marchRations(state: SimState, days: number): number {
  const b = bandOf(state);
  if (!b) return 0;
  const stove = b.vehicles.some((id) => { const v = vehicleById(state, id); return v ? statsOf(v).stove : false; });
  return Math.ceil(b.soldiers.length * days * (stove ? 0.75 : 1));
}
export function marchDays(state: SimState, target: string): number {
  const b = bandOf(state);
  if (!b) return Infinity;
  return roadDays(state, b.townId, target);
}

/** March the band: to a friendly town to move it, or on any other town to take it. */
export function march(state: SimState, target: string): Result {
  const b = bandOf(state);
  if (!b) return { ok: false, line: 'You have no band.' };
  if (b.march) return { ok: false, line: 'The band is already on the march.' };
  if (!b.soldiers.length) return { ok: false, line: 'A band of nobody goes nowhere.' };
  if (target === b.townId || !state.towns?.[target]) return { ok: false, line: 'There is nowhere to march.' };
  const days = marchDays(state, target);
  if (!Number.isFinite(days)) return { ok: false, line: 'No open road runs there.' };
  const need = marchRations(state, days);
  if (!depotAt(state, b.townId)) return { ok: false, line: 'Provisions are packed from a yard. Move the band to one first.' };
  const have = rationsIn(state, b.townId);
  if (have < need) return { ok: false, line: `The march takes ${plural(days, 'day')}: the band needs ${need} rations, and the yard has ${have}.` };
  for (const id of b.vehicles) {
    const v = vehicleById(state, id);
    const fuel = v ? DESIGN_BY_ID.get(v.design)!.fuel : {};
    if (v && Object.keys(fuel).length && !take(state, b.townId, fuel, false)) return { ok: false, line: `${v.name} has no fuel for the march (${stockText(fuel)}).` };
  }
  for (let i = 0; i < need; i++) eatRation(state, b.townId);
  const road = planRoad(state, b.townId, target);
  b.march = { target, daysLeft: days, from: b.townId, days, ...(road?.legs.length ? { legs: road.legs } : {}) };
  const why = friendly(state, target) ? `to ${townName(state, target)}` : `on ${townName(state, target)}`;
  return { ok: true, line: `The band marches ${why}: ${plural(days, 'day')} on the road, ${need} rations packed.` };
}

function battle(state: SimState, target: string): void {
  const w = worksOf(state);
  const b = w.band!;
  const p = powerOf(state);
  const def = defenceOf(state, target);
  const rng = deriveRng(state.seed, 'works-battle', state.day, target);
  const atk = p.total * (0.8 + rng.next() * 0.45);
  const hold = def * (0.8 + rng.next() * 0.45);
  const won = atk > hold;
  b.battles++;
  const ratio = Math.min(1, hold / Math.max(1, atk));
  const lossShare = won ? 0.35 * ratio : 0.5;
  const armour = Math.min(0.6, p.guard / Math.max(1, p.soldiers) * 0.4);
  const fallen = Math.min(b.soldiers.length, Math.floor(b.soldiers.length * lossShare * (1 - armour)));
  const sent = b.soldiers.splice(b.soldiers.length - fallen, fallen);
  for (const id of b.vehicles) { const v = vehicleById(state, id); if (v) wear(v, 3); }
  const town = townName(state, target);
  const homeTown = state.player.homeTownId ?? '';
  if (won) {
    w.vassals.push({ townId: target, since: state.day });
    b.townId = target;
    const t = state.towns?.[target];
    const liberated = !!homeTown && atWar(state, homeTown, target);
    if (t) t.despair = Math.min(1, Math.max(0, t.despair + (liberated ? -0.03 : TUNING.conquestDespair)));
    const loot = 5 + Math.floor(def / 2);
    addItem(state, 'coin', loot);
    w.renown += TUNING.renownPerVictory;
    bump(w, 'victories');
    const teller = b.soldiers[0];
    news(state, `${teller ? `${personFirst(state, teller)} says ` : ''}the band took ${town}${fallen ? `; ${plural(fallen, 'soldier')} sent home wounded` : ''}. ${loot} coin from its strongroom. ${town} answers to you now.`, teller, target);
  } else {
    b.morale = Math.max(0, b.morale - 0.3);
    bump(w, 'defeats');
    const teller = b.soldiers[0] ?? sent[0];
    news(state, `${teller ? `${personFirst(state, teller)} says ` : ''}${town} held. The band fell back${fallen ? ` and ${plural(fallen, 'soldier')} went home wounded` : ''}.`, teller, b.townId);
  }
}

/** Dawn: marches advance (and battles are fought), the band eats, vassals pay tribute or rise. */
export function tickWar(state: SimState): void {
  const w = worksIfAny(state);
  if (!w) return;
  const b = w.band;
  if (b?.march) {
    b.march.daysLeft--;
    if (b.march.daysLeft <= 0) {
      const target = b.march.target;
      b.march = undefined;
      if (friendly(state, target)) { b.townId = target; news(state, `The band has come into ${townName(state, target)}.`, b.soldiers[0], target); }
      else battle(state, target);
    }
  } else if (b && b.soldiers.length) {
    const stove = b.vehicles.some((id) => { const v = vehicleById(state, id); return v ? statsOf(v).stove : false; });
    const need = Math.ceil(b.soldiers.length * (stove ? 0.75 : 1));
    let fed = 0;
    if (depotAt(state, b.townId)) for (let i = 0; i < need; i++) if (eatRation(state, b.townId)) fed++;
    if (fed < need && isVassal(state, b.townId)) {
      const t = state.towns?.[b.townId];
      if (t) t.despair = Math.min(1, t.despair + 0.005 * (need - fed));
      fed += Math.floor((need - fed) / 2);
    }
    if (fed >= need) b.morale = Math.min(1, b.morale + 0.05);
    else {
      b.morale = Math.max(0, b.morale - 0.15 * (1 - fed / need));
      if (b.morale < TUNING.desertBelow) {
        const gone = b.soldiers.pop()!;
        news(state, `${personFirst(state, gone)} walked off from the band in the night. There was nothing to eat.`, gone, b.townId);
      } else if (state.day % 2 === 0) news(state, `${personFirst(state, b.soldiers[0]!)} says the band went hungry. Send rations.`, b.soldiers[0], b.townId);
    }
  }
  const crown = w.boons.includes('war');
  for (const v of [...w.vassals]) {
    addItem(state, 'coin', TUNING.tributeCoin * (crown ? 2 : 1));
    bump(w, 'tribute', TUNING.tributeCoin * (crown ? 2 : 1));
    const t = state.towns?.[v.townId];
    const guarded = b && !b.march && b.townId === v.townId && b.soldiers.length >= 3;
    if (crown || guarded || !t || t.despair <= TUNING.revoltDespair || (v.feastUntil ?? 0) >= state.day) continue;
    if (deriveRng(state.seed, 'works-revolt', state.day, v.townId).next() < TUNING.revoltOdds) {
      w.vassals = w.vassals.filter((x) => x !== v);
      bump(w, 'revolts');
      news(state, `${townName(state, v.townId)} has risen and thrown out your reeve. Despair does that.`, undefined, v.townId);
    }
  }
}

/** Let a vassal go free: its despair eases, and it remembers. */
export function release(state: SimState, townId: string): Result {
  const w = worksOf(state);
  if (!isVassal(state, townId)) return { ok: false, line: 'That town is not yours to free.' };
  w.vassals = w.vassals.filter((v) => v.townId !== townId);
  const t = state.towns?.[townId];
  if (t) t.despair = Math.max(0, t.despair - 0.1);
  bump(w, 'freed');
  return { ok: true, line: `You give ${townName(state, townId)} back to itself. People there will remember it.` };
}

export const warTargets = (state: SimState): { townId: string; days: number; defence: number }[] => {
  const b = bandOf(state);
  if (!b) return [];
  return Object.keys(state.towns ?? {}).filter((t) => t !== b.townId).map((townId) => ({ townId, days: marchDays(state, townId), defence: defenceOf(state, townId) }))
    .filter((t) => Number.isFinite(t.days)).sort((a, b2) => a.days - b2.days || a.townId.localeCompare(b2.townId));
};
export const warMachines = (state: SimState): number => (worksIfAny(state)?.vehicles ?? []).filter(isWarMachine).length;

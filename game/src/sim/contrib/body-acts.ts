/**
 * Verbs only some bodies have (A9). Each is gated on the inhabitant's embodiment trait fields
 * (embodiment.tags, allowedApproachTags; data/people/body-acts.json), never on who they are:
 *
 *   (a stuck wheel is no chip: it is lifted by holding to work at the wagon, sim/tasks; its lines are
 *   body.lift_wagon[.heard] there, and crates unloaded by hand speak body.carry_crates in sim/carry)
 *   board  ledger hand +    Read the town's ledger      (deal)  food cover, what is short, who owes; the town eases a little
 *          civic way in
 *   board, multi bodies     Leave a sibling to watch    (work)  a sibling stays by the place and reports at dawn
 *   hearth
 *
 * Every act answers with a line, and the town hears of it through a resident (moment.beat). A sibling's
 * watch is told at dawn through the people (dawn lines). Lines: data/dialogue/surface-fallbacks.json.
 * Pure and deterministic: no Phaser/DOM.
 */
import { noteUse } from '../data-use-people';
import actsJson from '../../data/people/body-acts.json';
import { registerDawnLines } from '../dawn-lines';
import { prettyTownId } from '../map/districts';
import { fallbackLine } from '../fallback-lines';
import { HOUSEHOLD, townNeeds as villageNeeds } from '../economy/village-economy';
import { leaveBodyHere, WITH_YOU } from '../embodiment';
import { itemName } from '../goods/inventory';
import { townNeeds as storeNeeds } from '../goods/town-needs';
import { approachTags, bodyTags, ensureInhabitantParts } from '../inhabitant';
import { pushJuice } from '../packets';
import { registerTargetProvider, type ActOutcome, type ProvidedAction } from '../play-session/action-providers';
import { targetActionId, type Target, type TargetKind } from '../play-session/targets';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { townOfTarget } from './target-data';
import { markUsed, residentOf, usedToday } from './use-effects';

/** A sibling left watching a place: which town, which place, since when. */
export type BodyWatch = { townId: string; place: 'board' | 'hearth'; since: number };
export type BodyActsState = { watches: Record<string, BodyWatch> };

type ActRow = { id: string; targets: TargetKind[]; family: string; label: string; short: string; tagsAny?: string[]; approachAny?: string[] };
const FILE = actsJson as { acts: ActRow[]; ledger: { despairRelief: number } };
const ACTS = FILE.acts;

const verbOf = (actionId: string): string => actionId.slice(0, actionId.indexOf('@'));
const pretty = (id: string): string => id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** A body-act line (grammar in surface-fallbacks.json talk), seeded per save, act, salt and day. */
const line = (state: SimState, key: string, salt: string, vars: Record<string, string | undefined> = {}, tags: string[] = []): string =>
  fallbackLine(key, `${state.seed}|body-line|${salt}|${state.day}`, vars, tags);

/** This body has the act: its trait tags and ways in match the row. */
function hasAct(state: SimState, row: ActRow): boolean {
  ensureInhabitantParts(state);
  const tags = bodyTags(state.player);
  const ways = approachTags(state.player) ?? [];
  return (!row.tagsAny || row.tagsAny.some((t) => tags.includes(t))) && (!row.approachAny || row.approachAny.some((t) => ways.includes(t)));
}

/** The town hears of it: a resident says so (not the person the act was about). */
function heard(state: SimState, townId: string | undefined, key: string, salt: string, not?: string): void {
  const who = residentOf(state, townId, `${key}:${salt}`);
  const said = line(state, key, salt, townId ? { town: prettyTownId(townId) } : {});
  if (who && who !== not && said) pushJuice(state, 'moment.beat', { personId: who, line: said, townId, momentId: key });
}


// ---------- board: the ledger ----------

const ledgerKey = (townId: string) => `body.ledger@${townId}`;

function readLedger(state: SimState, townId: string | undefined): ActOutcome {
  if (!townId) return { ok: false, line: 'No town keeps this board.' };
  if (usedToday(state, ledgerKey(townId))) return { ok: false, line: 'You have read this ledger today. The numbers have not moved.' };
  const l = state.villageEconomy?.towns[townId];
  const food = HOUSEHOLD.food.eats.reduce((n, i) => n + (l?.goods[i] ?? 0), 0);
  const need = l?.need.food ?? 0;
  // Households' food cover when the village ledger has run a dawn; else the town store's grain.
  const grain = state.towns?.[townId]?.stock.food_grain;
  const cover = need > 0 ? `food for ${Math.floor(food / need)} days` : grain !== undefined ? `${Math.floor(grain)} crates of grain in store` : 'no food counted yet';
  const village = villageNeeds(state, townId).map((n) => (n.itemId === 'food' ? 'food' : itemName(n.itemId).toLowerCase()));
  const store = storeNeeds(state, townId).shortages.map((s) => (s.items[0] ?? s.resource).toLowerCase());
  const shorts = [...new Set([...village, ...store])].slice(0, 2);
  const short = shorts.length ? `Short of ${shorts.join(' and ')}.` : 'Nothing short.';
  const folk = Object.values(state.people).filter((p) => p.townId === townId).sort((a, b) => a.flame - b.flame || a.id.localeCompare(b.id));
  const owing = folk[0];
  const who = owing?.name ?? (owing ? pretty(owing.id) : 'nobody');
  const town = state.towns?.[townId];
  if (town && town.economyOptIn !== false) town.despair = Math.max(0, town.despair - FILE.ledger.despairRelief);
  markUsed(state, ledgerKey(townId));
  heard(state, townId, 'body.read_ledger.heard', townId, owing?.id);
  return { ok: true, line: line(state, 'body.read_ledger', townId, { cover, short, who: owing ? who : undefined }, owing ? [] : ['no_folk']) || `The ledger: ${cover}. ${short}` };
}

// ---------- board / hearth: a sibling keeps watch ----------

const watches = (state: SimState): Record<string, BodyWatch> => (state.bodyActs ??= { watches: {} }).watches;
const follower = (state: SimState) => (state.player.bodies ?? []).find((b) => b.at === WITH_YOU && b.id !== state.player.activeBodyId);
const placeName = (k: string): string => (k === 'board' ? 'noticeboard' : 'hearth');

function leaveToWatch(state: SimState, t: Target): ActOutcome {
  if (t.kind !== 'board' && t.kind !== 'hearth') return { ok: false };
  const body = leaveBodyHere(state);
  if (!body) return { ok: false, line: 'Nobody is with you to stay behind.' };
  watches(state)[body.id] = { townId: body.at, place: t.kind, since: state.day };
  return { ok: true, line: line(state, 'body.watch_left', body.id, { body: body.name, place: placeName(t.kind) }) || `${body.name} stays to watch.` };
}

/** At dawn each watching sibling tells what it saw at its place, naming someone there. Ended watches drop. */
export function watchReports(state: SimState): string[] {
  const w = state.bodyActs?.watches;
  if (!w) return [];
  const out: string[] = [];
  for (const [bodyId, watch] of Object.entries(w).sort(([a], [b]) => a.localeCompare(b))) {
    const body = state.player.bodies?.find((b) => b.id === bodyId);
    if (!body || body.at !== watch.townId) { delete w[bodyId]; continue; }
    const folk = Object.values(state.people).filter((p) => p.townId === watch.townId).sort((a, b) => a.id.localeCompare(b.id));
    if (!folk.length) continue;
    const low = folk.reduce((a, p) => (p.flame < a.flame ? p : a));
    const seen = watch.place === 'hearth' ? low : folk[deriveRng(state.seed, 'watch', bodyId, state.day).int(0, folk.length)]!;
    const need = villageNeeds(state, watch.townId)[0];
    const item = need ? (need.itemId === 'food' ? 'food' : itemName(need.itemId).toLowerCase()) : '';
    const key = watch.place === 'hearth' ? 'body.watch_report.hearth' : item ? 'body.watch_report.board' : 'body.watch_report.quiet';
    const said = line(state, key, bodyId, { body: body.name, town: prettyTownId(watch.townId), who: seen.name ?? pretty(seen.id), item });
    if (said) out.push(said);
  }
  return out;
}

registerDawnLines('brood-watch', watchReports);

// ---------- the provider ----------

const KINDS = [...new Set(ACTS.flatMap((a) => a.targets))];

function offer(state: SimState, row: ActRow, t: Target): ProvidedAction | null {
  const chip = (label = row.label): ProvidedAction => ({ id: targetActionId(`body.${row.id}`, t), label, short: row.short, family: row.family });
  switch (row.id) {
    case 'read_ledger': { const town = townOfTarget(state, t); return town && !usedToday(state, ledgerKey(town)) ? chip() : null; }
    case 'watch_place': { const f = follower(state); return f ? chip(`Leave ${f.name} to watch the ${placeName(t.kind)}`) : null; }
    default: return null;
  }
}

registerTargetProvider({
  id: 'body-acts',
  kinds: KINDS,
  list(state, t) {
    const out: ProvidedAction[] = [];
    for (const row of ACTS) {
      if (!row.targets.includes(t.kind) || !hasAct(state, row)) continue;
      const a = offer(state, row, t);
      if (a) out.push(a);
    }
    return out;
  },
  act(state, actionId, t) {
    const verb = verbOf(actionId);
    if (!verb.startsWith('body.')) return false;
    const row = ACTS.find((r) => `body.${r.id}` === verb);
    if (!row || !row.targets.includes(t.kind)) return false;
    if (!hasAct(state, row)) return { ok: false, line: 'Not in this body.' };
    let out: ActOutcome;
    switch (row.id) {
      case 'read_ledger': out = readLedger(state, townOfTarget(state, t)); break;
      case 'watch_place': out = leaveToWatch(state, t); break;
      default: return false;
    }
    if (out.ok) noteUse('people/body-acts', row.id);
    return out;
  },
});

/**
 * Interaction bridge: methodId@personId → resolveInteraction + the play juice special-bar / ripples
 * listen for. SimState is the source of truth; the interaction runtime is the resolver.
 *
 *  sync in   person.flame/trust/marks + player.spark → runtime person
 *  refusal   authored refusal hook for the legacy method → refusal.coal_flicker (no resolve)
 *  resolve   resolveInteraction (baseStrain/sparkGain; no methods.sparkCost, no spark.spend)
 *  marks     legacy method markWeights roll folded into runtime marks; new stacks → mark.applied
 *            + cross-town packet.emit
 *  sync out  runtime flame01/trust/marks/spark → person + player
 *  juice     person.wound (method vs wound chemistry), person.reaction, person.reignite, site.kindle
 */

import { recordActBond } from '../legacy/bonds';
import type { DataTables } from '../load-data';
import { actMuls, refuseMethod, rollMethodMark, selectReactionLine, type MethodSimState } from '../methods';
import { noteActToday } from '../embodiment';
import { maybeEmitCrossTownPacket, pushJuice } from '../packets';
import { resolveInteraction, type CompatRuntime } from '../interaction';
import { encodeUnspokenForState } from '../social/unspoken';
import { applyDoctrineAct } from '../doctrine-tick';
import { fireNotorietyEvent } from '../hoard/events';
import { applyStashAct, ensureHoard, leverageDiscount, notePeakCoin } from '../hoard';
import { applyPatronInteraction } from '../patrons';
import { runHooks } from '../hooks';
import { happeningMethodMul } from '../happenings';
import { clamp } from '../interaction/interaction-state';
import type { PersonState, SimState } from '../types/runtime';
import type { PlayLastResolve } from './play-session-types';

type PlayEvent = { type: string; methodId?: string };
type MethodRow = { id: string; family?: string; effectiveness?: Record<string, number> };

export type InteractionActExtras = {
  tickN: number;
  metrics: { firstConsequenceAtTick?: number };
  setLastResolve: (r: PlayLastResolve | undefined) => void;
};

const FLAME_SCALE = 100;

function marksRecord(person: PersonState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of person.marks ?? []) out[m.markId] = (out[m.markId] ?? 0) + m.stacks;
  return out;
}

function marksList(marks: Record<string, number>): { markId: string; stacks: number }[] {
  return Object.entries(marks)
    .filter(([, stacks]) => stacks > 0)
    .map(([markId, stacks]) => ({ markId, stacks }));
}

/**
 * Resolve an interaction for a legacy method act and emit play juice. Caller checks rt has personId.
 * `line` replaces the host method's reaction line; `failLine` is said when the interaction's
 * assertFailIfMarksAny trips (it then does not resolve). Returns whether it resolved.
 */
export function actInteraction(
  state: SimState,
  rt: CompatRuntime,
  args: { personId: string; methodId: string; interactionId: string; line?: string; failLine?: string },
  eventLog: PlayEvent[],
  extras?: InteractionActExtras,
): 'resolved' | 'refused' {
  const { personId, methodId, interactionId } = args;
  const s = state as MethodSimState;
  const person = s.people[personId];
  const ip = rt.people.get(personId);
  if (!person || !ip) throw new Error(`UNKNOWN person: ${personId}`);
  const data = s.data as DataTables;
  const beforeLen = s.bus?.lastIds?.length ?? 0;
  const sparkBefore = s.player.spark;
  const flameBefore = person.flame;
  const marksBefore = marksRecord(person);

  // Sync in: SimState wins over whatever the runtime last saw.
  ip.spark = s.player.spark;
  ip.flame01 = clamp(person.flame / FLAME_SCALE, 0, 1);
  if (typeof person.trust === 'number') ip.trust = person.trust;
  ip.marks = { ...marksBefore };

  const finish = (resolve: PlayLastResolve): void => {
    for (const type of s.bus?.lastIds?.slice(beforeLen) ?? []) eventLog.push({ type, methodId: interactionId });
    extras?.setLastResolve(resolve);
    if (extras && extras.metrics.firstConsequenceAtTick == null) {
      extras.metrics.firstConsequenceAtTick = extras.tickN;
    }
  };

  const refusal = refuseMethod(s, personId, methodId);
  if (refusal) {
    pushJuice(s, 'refusal.coal_flicker', { personId, methodId, interactionId, line: refusal.line });
    fireNotorietyEvent(s, 'refusal');
    finish({ kind: 'refused', flameDelta: 0, sparkCost: sparkBefore - s.player.spark, personId, methodId });
    return 'refused';
  }

  // Assert-fail (e.g. empty cheer on someone hollowed out): they see through it; nothing resolves.
  const assertMarks = (rt.catalog.get(interactionId) as { assertFailIfMarksAny?: string[] } | undefined)?.assertFailIfMarksAny;
  if (assertMarks?.some((m) => (marksBefore[m] ?? 0) > 0)) {
    pushJuice(s, 'refusal.coal_flicker', { personId, methodId, interactionId, line: args.failLine ?? 'They see straight through it.' });
    finish({ kind: 'refused', flameDelta: 0, sparkCost: 0, personId, methodId });
    return 'refused';
  }

  // The inhabitant's body and habits bend every act: method modifiers, status traits, ember zone.
  const muls = actMuls(s, methodId);
  // A happening in the person's town can blunt a method for the day (e.g. the market ghost and inspire).
  muls.powerMul *= happeningMethodMul(s, person.townId, methodId);
  const res = resolveInteraction(rt, interactionId, personId, muls);
  // Compat: burn the draw legacy commitMethod spent on flame fuzz so seeded mark rolls stay identical.
  s.rng.next();
  const rolled = rollMethodMark(s, personId, methodId);
  if (rolled) ip.marks[rolled] = (ip.marks[rolled] ?? 0) + 1;

  // Leverage edge: notoriety forgives some strain on hard/defiant acts.
  const strain = sparkBefore - ip.spark;
  if (strain > 0) ip.spark += Math.round(strain * leverageDiscount(s, rt.catalog.get(interactionId)?.tags));

  // Sync out.
  s.player.spark = ip.spark;
  person.flame = Math.round(ip.flame01 * FLAME_SCALE);
  person.trust = ip.trust;
  person.marks = marksList(ip.marks);

  // Personal costs that bite when an act lands (e.g. ink integrity after a lie), then today's record for dusk/dawn hooks.
  runHooks(s, 'on_method_resolve', { data, rng: s.rng, methodId, targetId: personId, targetWoundId: person.woundId });
  noteActToday(s, methodId, rt.catalog.get(interactionId)?.kind);

  // Wound x method chemistry: how this method sits against their wound (data: methods.json effectiveness).
  const actDef = rt.catalog.get(interactionId);
  const methodRow = ((data.methods ?? []) as MethodRow[]).find((m) => m.id === methodId);
  const woundMul = person.woundId ? methodRow?.effectiveness?.[person.woundId] : undefined;
  if (typeof woundMul === 'number' && woundMul !== 1 && !actDef?.stashAct && !actDef?.patronAccept && !actDef?.patronFulfil) {
    pushJuice(s, 'person.wound', { personId, methodId, interactionId, woundId: person.woundId, woundMul });
  }

  for (const { markId, stacks } of person.marks) {
    if (stacks <= (marksBefore[markId] ?? 0)) continue;
    pushJuice(s, 'mark.applied', { personId, markId, interactionId });
    maybeEmitCrossTownPacket(s, personId, markId);
    // Seeing someone grow for real feeds your own spark (hooks: on_witness_genuine_growth).
    if (markId === 'genuine_growth') runHooks(s, 'on_witness_genuine_growth', { data, rng: s.rng, targetId: personId });
  }

  const reaction = selectReactionLine({
    personId,
    methodId,
    seed: s.seed,
    state: s,
    features: { bakedDynamismLines: (data.player as { features?: { bakedDynamismLines?: boolean } }).features?.bakedDynamismLines ?? false },
  });
  pushJuice(s, 'person.reaction', { personId, methodId, interactionId, line: args.line ?? reaction.text, source: args.line ? 'deed' : reaction.source });

  if (res.reignited) pushJuice(s, 'person.reignite', { personId, interactionId });
  encodeUnspokenForState(s, interactionId, personId, { tags: rt.catalog.get(interactionId)?.tags, reignited: res.reignited });
  const def0 = rt.catalog.get(interactionId);
  if (def0?.coinGain) {
    s.player.coin = (s.player.coin ?? 0) + def0.coinGain;
    notePeakCoin(s);
  }
  if (def0?.stashAct) applyStashAct(s, def0.stashAct, personId);
  if (res.reignited) ensureHoard(s).reigniteCount += 1;
  recordActBond(s, { personId, methodId, interactionId, flameBefore, reignited: res.reignited, marksChanged: person.marks.some((m) => m.stacks !== (marksBefore[m.markId] ?? 0)) });
  applyPatronInteraction(s, personId, def0?.patronAccept, def0?.patronFulfil);
  const doctrineAct = rt.catalog.get(interactionId)?.doctrineAct;
  for (const actId of doctrineAct === undefined ? [] : [doctrineAct].flat()) applyDoctrineAct(s, actId, personId);
  if (rt.catalog.get(interactionId)?.kind === 'stand_up' && person.flame > flameBefore && person.townId) {
    const byTown = ((s.flags.standUpByTown ??= {}) as Record<string, string[]>);
    const ids = (byTown[person.townId] ??= []);
    if (!ids.includes(personId)) ids.push(personId);
    const traitsBefore = [...s.player.statusTraits];
    runHooks(s, 'on_interaction', { data, rng: s.rng, targetId: personId });
    for (const id of s.player.statusTraits) {
      if (!traitsBefore.includes(id)) pushJuice(s, 'status.gain', { traitId: id, personId, townId: person.townId, interactionId });
    }
  }
  // A site kindles when its keeper reignites / burns past threshold, or when a helping hand warms them there.
  const def = rt.catalog.get(interactionId);
  const helpedAtSite = def?.ripple === 'help' && person.flame > flameBefore && !!person.siteId;
  if (res.reignited || person.flame >= data.reigniteThreshold || helpedAtSite) {
    pushJuice(s, 'site.kindle', { personId, siteId: person.siteId, interactionId });
  }

  s.flags.lastTouchedPersonId = personId;
  const townFx = (rt.catalog.get(interactionId) as { town?: { despair?: number } } | undefined)?.town;
  const tState = person.townId ? s.towns?.[person.townId] : undefined;
  if (tState && townFx?.despair) tState.despair = Math.min(1, Math.max(0, tState.despair + townFx.despair));
  if (person.townId) {
    const lt = ((s.flags.lastTouchDayByTown ??= {}) as Record<string, number>);
    lt[person.townId] = Number((s as { day?: number }).day ?? 0);
  }
  const row = ((data.methods ?? []) as MethodRow[]).find((m) => m.id === methodId);
  if (row?.family === 'kind') s.flags.kindSuccessToday = true;

  finish({
    kind: 'resolved',
    flameDelta: person.flame - flameBefore,
    sparkCost: sparkBefore - s.player.spark,
    marks: person.marks.map((m) => ({ ...m })),
    personId,
    methodId,
  });
  eventLog.push({ type: 'interaction', methodId: interactionId });
  return 'resolved';
}

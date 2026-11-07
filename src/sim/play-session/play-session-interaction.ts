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
 *  juice     person.reaction, person.reignite, site.kindle
 */

import type { DataTables } from '../load-data';
import { refuseMethod, rollMethodMark, selectReactionLine, type MethodSimState } from '../methods';
import { maybeEmitCrossTownPacket, pushJuice } from '../packets';
import { resolveInteraction, type CompatRuntime } from '../interaction';
import { encodeUnspokenForState } from '../social/unspoken';
import { applyDoctrineAct } from '../doctrine-tick';
import { applyStashAct, ensureHoard, leverageDiscount, notePeakCoin } from '../hoard';
import { applyPatronInteraction } from '../patrons';
import { runHooks } from '../hooks';
import { clamp } from '../interaction/interaction-state';
import type { PersonState, SimState } from '../types/runtime';
import type { PlayLastResolve } from './play-session-types';

type PlayEvent = { type: string; methodId?: string };
type MethodRow = { id: string; family?: string };

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

/** Resolve an interaction for a legacy method act and emit play juice. Caller checks rt has personId. */
export function actInteraction(
  state: SimState,
  rt: CompatRuntime,
  args: { personId: string; methodId: string; interactionId: string },
  eventLog: PlayEvent[],
  extras?: InteractionActExtras,
): void {
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
    finish({ kind: 'refused', flameDelta: 0, sparkCost: sparkBefore - s.player.spark, personId, methodId });
    return;
  }

  const res = resolveInteraction(rt, interactionId, personId);
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

  for (const { markId, stacks } of person.marks) {
    if (stacks <= (marksBefore[markId] ?? 0)) continue;
    pushJuice(s, 'mark.applied', { personId, markId, interactionId });
    maybeEmitCrossTownPacket(s, personId, markId);
  }

  const reaction = selectReactionLine({
    personId,
    methodId,
    seed: s.seed,
    state: s,
    features: { bakedDynamismLines: false },
  });
  pushJuice(s, 'person.reaction', { personId, methodId, interactionId, line: reaction.text, source: reaction.source });

  if (res.reignited) pushJuice(s, 'person.reignite', { personId, interactionId });
  encodeUnspokenForState(s, interactionId, personId, { tags: rt.catalog.get(interactionId)?.tags, reignited: res.reignited });
  const def0 = rt.catalog.get(interactionId);
  if (def0?.coinGain) {
    s.player.coin = (s.player.coin ?? 0) + def0.coinGain;
    notePeakCoin(s);
  }
  if (def0?.stashAct) applyStashAct(s, def0.stashAct);
  if (res.reignited) ensureHoard(s).reigniteCount += 1;
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
      if (!traitsBefore.includes(id)) pushJuice(s, 'status.gain', { traitId: id, personId, interactionId });
    }
  }
  // A site kindles when its keeper reignites / burns past threshold, or when a helping hand warms them there.
  const def = rt.catalog.get(interactionId);
  const helpedAtSite = def?.ripple === 'help' && person.flame > flameBefore && !!person.siteId;
  if (res.reignited || person.flame >= data.reigniteThreshold || helpedAtSite) {
    pushJuice(s, 'site.kindle', { personId, siteId: person.siteId, interactionId });
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
}

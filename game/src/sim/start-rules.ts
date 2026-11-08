/**
 * Each body starts its own way (A10). An inhabitant's start rule (parts.startRule, from archetypes.json)
 * names a tag; the tag picks a settlement of the generated world by what is around it:
 *
 *   den_near_hills  the den town if this world has one, else the settlement with the most hills around it
 *   ledger_office   the largest town (city, then town; biggest polity): it has a ledger office
 *   warm_rock       open, dry, sun-warmed ground (hills and fields over wood and water), never the den
 *   mill_row        a settlement with a mill, else the most rural working village, never the den
 *
 * The den is a role, not one authored id (denOf): the authored den (towns.json isDen) where the world has
 * it; in a generated district (towns d<col>_<row>_t<i>) the most hill-sheltered village, a hollow a den
 * could be dug in. Happenings read the same role for den-biased events (sim/happening-world denTown); the
 * den fire you must bank each night stays at your home hearth, so a district den never goes cold on you.
 *
 * Then the first spoken moment: on the run's first act or rest, someone in town greets the newcomer in
 * a way only that body would be greeted, and the inhabitant answers (moment.beat juice, lines in
 * data/dialogue/surface-fallbacks.json under start.<tag> and start.<tag>.self). Pure and deterministic.
 */
import townsJson from '../data/world/towns.json';
import type { FabricWorld } from './gen/world';
import { jobOf } from './goods/jobs';
import { districtOfTown, prettyTownId } from './map/districts';
import { fallbackLine } from './fallback-lines';
import { placeSettlements, settlementKind, type SettlementKind } from './map/world-layout';
import { biomeAt, type Biome } from './map/terrain';
import { pushJuice } from './packets';
import type { InhabitantParts, SimState } from './types/runtime';

type StartRule = NonNullable<InhabitantParts['startRule']>;
type Cand = {
  id: string;
  rank: number;
  size: number;
  gap01: number;
  den: boolean;
  mill: boolean;
  /** Share (0..1) of sampled ground around the town by biome. */
  ground: Record<Biome, number>;
};

const AUTHORED_DEN = new Set(((townsJson as { towns: { id: string; isDen?: boolean }[] }).towns).filter((t) => t.isDen).map((t) => t.id));
const RANK = { village: 0, town: 1, city: 2 } as const;
/** Tiles out from a town's centre where its surroundings are sampled (outside the town's own meadow). */
const RINGS = [22, 40, 64];
const SPOKES = 16;

function groundAround(seed: number, q: number, r: number): Record<Biome, number> {
  const n: Record<Biome, number> = { forest: 0, hills: 0, water: 0, fields: 0, meadow: 0 };
  for (const rad of RINGS) for (let i = 0; i < SPOKES; i++) {
    const a = (i / SPOKES) * Math.PI * 2;
    n[biomeAt(seed, Math.round(q + Math.cos(a) * rad), Math.round(r + Math.sin(a) * rad))] += 1;
  }
  const total = RINGS.length * SPOKES;
  for (const k of Object.keys(n) as Biome[]) n[k] /= total;
  return n;
}

/** A settlement as the den role sees it: its kind and where it sits. */
export type DenSite = { id: string; kind: SettlementKind; q: number; r: number };

/**
 * The den of a world: the authored den when present. Otherwise only a generated district gets one (a home
 * world without its den keeps none, as before): its village with the most hills around it, ties by id; a
 * district with no villages uses its smallest kind. Deterministic in (sites, seed).
 */
export function denOf(sites: DenSite[], seed: number): string | undefined {
  const authored = sites.find((s) => AUTHORED_DEN.has(s.id));
  if (authored) return authored.id;
  const generated = sites.filter((s) => districtOfTown(s.id));
  if (!generated.length) return undefined;
  const low = Math.min(...generated.map((s) => RANK[s.kind]));
  let best: { id: string; hills: number } | undefined;
  for (const s of [...generated].sort((a, b) => a.id.localeCompare(b.id))) {
    if (RANK[s.kind] !== low) continue;
    const hills = groundAround(seed, s.q, s.r).hills;
    if (!best || hills > best.hills) best = { id: s.id, hills };
  }
  return best?.id;
}

/** How well a settlement suits each start tag (higher is better). */
const SCORE: Record<string, (c: Cand) => number> = {
  den_near_hills: (c) => (c.den ? 100 : 0) + c.ground.hills * 10 - c.gap01,
  ledger_office: (c) => (c.rank > 0 ? 100 : 0) + c.rank * 10 + c.size / 10000,
  warm_rock: (c) => (c.den ? -100 : 0) + (c.ground.hills + c.ground.fields - c.ground.water - c.ground.forest) * 10,
  mill_row: (c) => (c.den ? -100 : 0) + (c.mill ? 50 : 0) + (2 - c.rank) * 5 + c.ground.fields * 10,
};

/** The settlement a start rule picks among `eligible` ids, or null when the tag is not a known rule. */
export function resolveStartTown(rule: StartRule | undefined, world: FabricWorld, seed: number, eligible: string[]): string | null {
  const score = rule ? SCORE[rule.tag] : undefined;
  if (!score || !eligible.length) return null;
  const placed = new Map(placeSettlements(world.settlements ?? [], seed).map((p) => [p.id, p]));
  const den = denOf((world.settlements ?? []).flatMap((s) => {
    const p = placed.get(s.id);
    return p ? [{ id: s.id, kind: settlementKind(s), q: p.q, r: p.r }] : [];
  }), seed);
  const mills = new Set((world.facilities ?? []).filter((f) => f.kind === 'mill' && f.townId).map((f) => f.townId!));
  let best: { id: string; s: number } | null = null;
  for (const s of [...(world.settlements ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
    const p = placed.get(s.id);
    if (!p || !eligible.includes(s.id)) continue;
    const c: Cand = {
      id: s.id, rank: RANK[settlementKind(s)], size: s.politySize, gap01: s.gap01,
      den: s.id === den, mill: mills.has(s.id), ground: groundAround(seed, p.q, p.r),
    };
    const v = score(c);
    if (!best || v > best.s) best = { id: s.id, s: v };
  }
  return best?.id ?? null;
}

// ---------- the first spoken moment ----------

const FLAG = 'startMoment';

/** Who greets this body: someone in its town the rule prefers (by tag, then by trade), else the first by id. */
function greeter(state: SimState, rule: StartRule): string | undefined {
  const folk = Object.values(state.people).filter((p) => p.townId === state.player.townId).sort((a, b) => a.id.localeCompare(b.id));
  const byTag = rule.greeterTagsAny?.length ? folk.find((p) => p.tags?.some((t) => rule.greeterTagsAny!.includes(t))) : undefined;
  const byJob = rule.greeterJobsAny?.length ? folk.find((p) => rule.greeterJobsAny!.includes(jobOf(state, p.id).id)) : undefined;
  return (byTag ?? byJob ?? folk[0])?.id;
}

/** On the run's first act or rest: the body's own first moment, through a townsperson and the inhabitant. Once per save. */
export function maybeFirstMoment(state: SimState): void {
  const rule = state.player.parts?.startRule;
  if (!rule || state.flags[FLAG] !== undefined || !state.player.townId) return;
  state.flags[FLAG] = state.day;
  const salt = `${state.seed}:${state.player.townId}`;
  const who = greeter(state, rule);
  // The greeter's name and town fill any {name}/{town} a start grammar (or a shared rule it uses) asks for.
  const name = who ? (state.people[who]?.name ?? '').split(' ')[0] : undefined;
  const slots = { name: name || undefined, town: prettyTownId(state.player.townId) };
  const said = fallbackLine(`start.${rule.tag}`, salt, slots);
  if (who && said) pushJuice(state, 'moment.beat', { personId: who, line: said, momentId: `start.${rule.tag}` });
  // The inhabitant's own thought: the town, never the greeter's name.
  const self = fallbackLine(`start.${rule.tag}.self`, salt, { town: slots.town });
  if (self) pushJuice(state, 'moment.beat', { personId: 'player', line: self, momentId: `start.${rule.tag}.self` });
}

/**
 * The council (civic slice 6): each town's leader (its doctrine's leader where one sits there, else the
 * eldest resident) keeps the zoning, the levy and the town's own works.
 *   dawn (late)  tier: a town that grows a tier is news, and history (chronicle 'tier').
 *                levy: a share of every company's new takings moves into the town's treasury;
 *                the treasury pays builders on the council's own works (barracks, town hall).
 *                the council sits now and then: gives a lot over to the zone that wants ground,
 *                moves the levy, stakes a work its tier allows.
 *   dawn lines   the leader tells it, in the player's town.
 *   board        "Zones & standing" page; the ring chip "Petition council" asks for a lot to be re-zoned.
 * Logic for lots and tiers lives in sim/civic; data in data/civic/zones.json. Pure: no Phaser/DOM.
 */
import { boardPages, registerBoardPage } from '../board-pages';
import { chronicleCivic } from '../chronicle';
import { eldestOf } from '../civic/founding';
import { builtCount, nextTier, residentsOf, tierIndex, tierNeeded, tierOf, townPopulation, unlockedIn, unlocksAt } from '../civic/tiers';
import {
  addNews, bandName, civicOf, COUNCIL, crowdedZone, lotsOf, nextTax, rezoneFor, sectorName, yearName, zoneFor, zoneName, ZONES,
  type CivicNews, type ZoneId,
} from '../civic/zoning';
import { registerDawnLines } from '../dawn-lines';
import { registerDawnTick } from '../dawn-ticks';
import { doctrineRow } from '../doctrine-tick';
import { activePlans, BUILDING_BY_ID, claimsIn, stakePlan } from '../economy/build-plans';
import { companiesIn } from '../economy/companies';
import { prettyTownId } from '../map/districts';
import { registerTargetProvider, type ProvidedAction } from '../play-session/action-providers';
import { targetActionId } from '../play-session/targets';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { noteUse } from '../data-use-civic';

/** Who speaks for a town: the leader of a doctrine seated there, else its eldest. */
export function leaderOf(state: SimState, townId: string): string | undefined {
  for (const d of Object.values(state.doctrines ?? {}).sort((a, b) => a.id.localeCompare(b.id))) {
    if (d.townId !== townId) continue;
    const id = doctrineRow(state, d.id)?.leaderPersonId;
    if (id && state.people[id]?.townId === townId) return id;
  }
  return eldestOf(state, residentsOf(state, townId));
}

const first = (state: SimState, id: string | undefined): string => (id ? (state.people[id]?.name ?? 'Someone').split(' ')[0]! : 'Someone');
const kindName = (kind: string): string => BUILDING_BY_ID.get(kind)?.name ?? kind;
const pct = (t: number): string => String(Math.round(t * 100));

/** The zone a town most wants more ground for: turned-away ambitions first, else its most crowded zone. */
function wantedZone(state: SimState, townId: string): ZoneId | null {
  const c = civicOf(state, townId);
  const top = Object.entries(c.wanted).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return (top?.[0] as ZoneId | undefined) ?? crowdedZone(state, townId, claimsIn(state, townId));
}

function townDawn(state: SimState, townId: string): void {
  const c = civicOf(state, townId);
  const leader = leaderOf(state, townId);

  // Tier: growing is news and history; shrinking is quiet (nobody announces that).
  const tier = tierOf(state, townId);
  noteUse('civic/zones', `tier:${tier.id}`);
  if (c.tier === undefined) c.tier = tier.id;
  else if (tierIndex(tier.id) > tierIndex(c.tier)) {
    c.tier = tier.id;
    addNews(state, townId, { day: state.day, kind: 'tier', tier: tier.id, by: leader });
    chronicleCivic(state, 'tier', tier.id, townId, { tier: tier.name, when: `the year of ${yearName(state.seed, state.day)}` });
  } else if (tier.id !== c.tier) c.tier = tier.id;

  // Levy: a share of what each company took since yesterday (a new company starts from what it has).
  const cos = companiesIn(state, townId);
  for (const co of cos) {
    const seen = c.taxSeen[co.id];
    c.taxSeen[co.id] = co.revenue;
    if (seen === undefined) continue;
    const take = Math.min(co.coin, Math.max(0, co.revenue - seen) * c.tax);
    if (take <= 0) continue;
    co.coin -= take;
    c.treasury += take;
  }
  for (const id of Object.keys(c.taxSeen)) if (!cos.some((co) => co.id === id)) delete c.taxSeen[id];

  // The treasury pays builders on the council's works: coin goes to a resident's purse, the work goes up.
  const works = activePlans(state, townId).filter((p) => p.council);
  const folk = residentsOf(state, townId);
  let paid = 0;
  for (const w of works) {
    const need = (BUILDING_BY_ID.get(w.kind)?.labor ?? 0) - w.laborDone;
    if (w.stage !== 'building' || !folk.length) continue;
    // Never pay for more work than is left (tickBuildPlans finishes it at the next dawn).
    for (let k = 0; k < need && paid < COUNCIL.maxLaborPerDawn && c.treasury >= COUNCIL.wagePerLabor; k++) {
      const hand = folk[deriveRng(state.seed, 'council-hand', state.day, w.id, paid).int(0, folk.length)]!;
      const purse = (state.companies ??= { list: [], next: 1, purse: {} }).purse;
      purse[hand] = (purse[hand] ?? 0) + COUNCIL.wagePerLabor;
      c.treasury -= COUNCIL.wagePerLabor;
      w.laborDone += 1;
      paid += 1;
    }
  }

  // The council sits now and then.
  if (!leader || state.day - (c.lastCouncil ?? -1e9) < COUNCIL.minGap) return;
  const rng = deriveRng(state.seed, 'council', state.day, townId);
  if (rng.next() >= COUNCIL.chance) return;
  c.lastCouncil = state.day;
  const want = wantedZone(state, townId);
  if (want) {
    const lot = rezoneFor(state, townId, want, claimsIn(state, townId), `council${state.day}`);
    if (lot !== null) addNews(state, townId, { day: state.day, kind: 'rezone', lot, zone: want, by: leader });
  }
  c.wanted = {};
  const despair = state.towns?.[townId]?.despair ?? 0;
  const tax = nextTax(c.tax, despair, works.length > 0);
  if (tax !== c.tax) {
    addNews(state, townId, { day: state.day, kind: 'tax', tax, prevTax: c.tax, by: leader });
    c.tax = tax;
  }
  // A work of its own the tier allows and the town lacks (one at a time).
  if (!works.length && rng.next() < COUNCIL.raiseChance) {
    const has = new Set((state.build?.plans ?? []).filter((p) => p.townId === townId && p.stage !== 'abandoned').map((p) => p.kind));
    const kind = COUNCIL.leaderRaises.find((k) => !has.has(k) && unlockedIn(state, townId, k));
    if (kind && stakePlan(state, leader, townId, kind, { council: true })) addNews(state, townId, { day: state.day, kind: 'raise', buildingKind: kind, by: leader });
  }
}

export function tickCivic(state: SimState): void {
  for (const townId of Object.keys(state.towns ?? {}).sort()) townDawn(state, townId);
}
registerDawnTick('late', 'civic-zoning', tickCivic);

// ---- Dawn lines: the leader tells the player's town what the council did. ----

const L = ZONES.lines;
function say(state: SimState, key: string, salt: string, slots: Record<string, string>): string {
  const pool = L[key] ?? [];
  if (!pool.length) return '';
  const tpl = pool[deriveRng(state.seed, `civic-${key}`, state.day, salt).int(0, pool.length)]!;
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => slots[k] ?? m);
}

function newsLine(state: SimState, townId: string, n: CivicNews): string {
  const base = { who: first(state, n.by), town: prettyTownId(townId) };
  switch (n.kind) {
    case 'rezone': return say(state, 'rezone', townId, { ...base, sector: sectorName(n.lot ?? 0), zone: zoneName(n.zone ?? 'housing') });
    case 'tax': return say(state, (n.tax ?? 0) > (n.prevTax ?? 0) ? 'taxUp' : 'taxDown', townId, { ...base, pct: pct(n.tax ?? 0) });
    case 'tier': {
      const opens = unlocksAt(n.tier ?? '')[0];
      const tier = ZONES.tiers.find((t) => t.id === n.tier)?.name ?? 'place';
      return opens ? say(state, 'tier', townId, { ...base, tier, kind: kindName(opens) }) : say(state, 'tierPlain', townId, { ...base, tier });
    }
    case 'raise': return say(state, 'raise', townId, { ...base, kind: kindName(n.buildingKind ?? 'townhall') });
    default: return '';
  }
}

export function civicDawnLines(state: SimState): string[] {
  const here = state.player.townId;
  const news = here ? state.build?.civic?.[here]?.news ?? [] : [];
  // A petition was answered on the spot; the rest is told the morning after.
  return news.filter((n) => n.day === state.day && n.kind !== 'petition').map((n) => newsLine(state, here!, n)).filter(Boolean).slice(0, 3);
}
registerDawnLines('civic-zoning', civicDawnLines);

// ---- Board: zones and standing. ----

export const ZONES_PAGE = 'zones';
registerBoardPage({
  id: ZONES_PAGE,
  title: 'Zones & standing',
  render(state, townId, nameOf) {
    const c = state.build?.civic?.[townId];
    const tier = tierOf(state, townId);
    const pop = townPopulation(state, townId), built = builtCount(state, townId);
    const next = nextTier(tier);
    const left = [
      `${nameOf(townId)} is a ${tier.name}: ${pop} folk, ${built} ${built === 1 ? 'building' : 'buildings'} standing.`,
      next ? `A ${next.name} wants ${next.pop} folk and ${next.built} buildings.` : 'No place hereabouts is grander.',
      `The council: ${first(state, leaderOf(state, townId))}. Levy ${pct(c?.tax ?? COUNCIL.taxStart)} in the hundred of company takings; ${Math.floor(c?.treasury ?? 0)} coin kept.`,
    ];
    const civic = Object.keys(ZONES.unlocks);
    const open = civic.filter((k) => unlockedIn(state, townId, k)).map(kindName);
    const shut = civic.filter((k) => !unlockedIn(state, townId, k)).map((k) => `${kindName(k)} (${tierNeeded(k)?.name})`);
    if (open.length) left.push(`May be raised here: ${open.join(', ')}.`);
    if (shut.length) left.push(`Not yet: ${shut.join(', ')}.`);
    const last = c?.news.filter((n) => n.kind !== 'tier' && n.kind !== 'petition').slice(-1)[0];
    if (last) left.push(`Last word from the council (day ${last.day}): ${newsLine(state, townId, last)}`);
    // Right: each zone and where its lots lie, with what stands on them.
    const lots = lotsOf(state, townId);
    const claims = claimsIn(state, townId);
    const right = ZONES.zones.map((z) => {
      const where = lots.map((x, i) => (x === z.id ? `${sectorName(i)} ${bandName(i)}` : '')).filter(Boolean);
      const on = claims.filter((cl) => (cl.zone ?? zoneFor(cl.kind)) === z.id);
      const up = on.filter((cl) => cl.status === 'built').length;
      return `${z.name.replace(/^./, (ch) => ch.toUpperCase())}: ${where.join(', ') || 'none'}${on.length ? ` (${up} up, ${on.length - up} staked)` : ''}.`;
    });
    return { columns: [left, right] };
  },
});

// ---- Ring: petition the council (the noticeboard is where the town's business is posted). ----

const verbOf = (id: string): string => id.slice(0, id.indexOf('@'));
const PETITION = 'civic.petition';
/** What the player would ask for: the zone the town wants most, else more workshop ground. */
const petitionZone = (state: SimState, townId: string): ZoneId => wantedZone(state, townId) ?? 'craft';
const canPetition = (state: SimState, townId: string): boolean => {
  const c = state.build?.civic?.[townId];
  return !!state.towns?.[townId] && state.player.townId === townId && state.day - (c?.petitioned ?? -1e9) >= COUNCIL.petitionGap;
};

registerTargetProvider({
  id: 'civic-petition',
  kinds: ['board'],
  list(state, t): ProvidedAction[] {
    if (!canPetition(state, t.id)) return [];
    return [{ id: targetActionId(PETITION, t), label: `Petition the council to zone a lot for ${zoneName(petitionZone(state, t.id))}`, short: 'Petition council', family: 'ask' }];
  },
  act(state, actionId, t) {
    if (verbOf(actionId) !== PETITION) return false;
    if (!canPetition(state, t.id)) return { ok: false, line: 'The council heard you lately. Give it time.' };
    const townId = t.id;
    const c = civicOf(state, townId);
    c.petitioned = state.day;
    const who = leaderOf(state, townId);
    const zone = petitionZone(state, townId);
    const odds = COUNCIL.petitionBase + (state.towns?.[townId]?.standing ?? 0) * COUNCIL.petitionStanding;
    const yes = deriveRng(state.seed, 'petition', state.day, townId).next() < odds;
    const lot = yes ? rezoneFor(state, townId, zone, claimsIn(state, townId), `petition${state.day}`) : null;
    addNews(state, townId, { day: state.day, kind: 'petition', by: who, zone, ok: lot !== null, ...(lot !== null ? { lot } : {}) });
    const slots = { who: first(state, who), sector: sectorName(lot ?? 0), zone: zoneName(zone), town: prettyTownId(townId) };
    return { ok: true, hours: COUNCIL.petitionHours, line: say(state, lot !== null ? 'petitionYes' : 'petitionNo', townId, slots) };
  },
});

/** The zones page's index among the board's pages (for the dev hook and tests). */
export const zonesPageIndex = (): number => boardPages().findIndex((p) => p.id === ZONES_PAGE);

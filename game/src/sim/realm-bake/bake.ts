/**
 * The realm's past, baked. Before day 1 every district lives `dawns` days (0..BAKE_MAX) on an abstract
 * day, all hundred at once: food by season, land and the year's weather; despair pulled toward the wound
 * the land carries, eased or deepened by how its hearths burn (glow); rulers who die and are followed;
 * rare events (plague, fire, a golden harvest, a spark-carrier walking in); and every neighbouring pair
 * feuding, writing, sealing pacts and going to war on the meters civic/district-relations uses in play.
 * A district that goes dark long enough has fallen; one that burns long enough is a beacon.
 *
 * The cost is flat per dawn (typed arrays, one rng stream: about a hundred thousand dawns a second), and
 * memory is flat whatever the length: each district keeps only its greatest and its latest events, and the
 * realm's time is cut into at most ten named ages. Day numbers run up to 0 (the dawn before day 1).
 * A pure function of (seed, dawns): nothing is saved but `dawns`. No Phaser/DOM.
 */
import table from '../../data/world/realm-bake.json';
import polityJson from '../../data/civic/district-polity.json';
import { DISTRICTS, realm, type District } from '../map/districts';
import { createRng, deriveRng } from '../rng';
import { DAYS_PER_SEASON } from '../season';

type Range = [number, number];
type EventRow = {
  weight: number; note: number; despair?: number | Range; glow?: number | Range; food?: number; foodMul?: number; pop?: number; popMul?: Range;
  feud?: number; trust?: number; lands?: string[]; despairAbove?: number; despairBelow?: number; foodAbove?: number;
};
type TellRow = { gist: string; summaries: string[]; codas: string[] };
export type BakePreset = { id: string; dawns: number; label: string; hint: string };
type Table = {
  maxDawns: number; presets: BakePreset[];
  tuning: {
    eventChance: number; keepGreat: number; keepRecent: number;
    food: { start: number; cap: number; rate: number; work: number; workDespair: number; eat: number; eatPop: number; plenty: number; plentyDespair: number; plentyPop: number; famineDespair: number; faminePop: number; famineAfter: number; famineGap: number };
    harvestBySeason: number[]; fertility: Record<string, number>; weather: Range;
    despair: { pull: number; glowRelief: number; decadenceBelow: number; decadence: number; floor: number; cap: number };
    tide: { local: number; localYears: Range; realm: number; realmYears: Range };
    glow: { from: number; rate: number; keep: number };
    pop: { pull: number; min: number; max: number };
    status: { fallDespair: number; fallGlow: number; riseDespair: number; beaconDespair: number; beaconGlow: number; dimDespair: number };
    reign: Range; contested: number;
    pairs: { letterTrust: number; grievanceEase: number; pactRelief: number; warDespair: number; loseDespair: number; losePop: number; winFood: number; wearyPerWar: number; wearyFade: number; wearyCooldown: number };
    ages: { count: number; minDawns: number };
  };
  events: Record<string, EventRow>; notes: Record<string, number>;
  ages: Record<string, string[]>;
  tell: { warNames: string[]; kinds: Record<string, TellRow> };
};
export const BAKE = table as unknown as Table;
export const BAKE_MAX = BAKE.maxDawns;
/** Dawns in a year (four seasons). */
export const YEAR_DAWNS = DAYS_PER_SEASON * 4;

type Polity = { tuning: Record<string, number> & { startFeud: Range }; rivalStyles: [string, string][]; woundFeud: Record<string, number> };
const POL = polityJson as unknown as Polity;

/**
 * Something a district remembers. `day` <= 0. `town` and `u` are seeds resolved when it is told (which of
 * its towns, which name); `other` is the index of the other district it concerns.
 */
export type BakeEvent = { day: number; kind: string; w: number; town: number; u: number; other?: number };
export type BakedDistrict = {
  id: string; index: number;
  /** 0..1, where the seed's despair has drifted to. */
  despair: number;
  /** -1..1: how its hearths burn against the seed (above 0 some are lit that were not; below, the ash lies deeper). */
  glow: number;
  /** Head count against the seed's (1 = as generated). */
  people: number;
  /** Days of food in store (20 is where every district starts). */
  food: number;
  fallen: boolean; beacon: boolean;
  /** Seat-holders since the bake began. */
  rulers: number;
  counts: Record<string, number>;
  /** Its greatest and latest events, oldest first. */
  events: BakeEvent[];
};
export type BakedPair = { a: string; b: string; trust: number; feud: number; state: 'peace' | 'pact' | 'war'; since: number; lastWar: number; warEnds?: number; winner?: string };
export type BakedAge = { from: number; to: number; kind: string; name: string };
export type RealmBake = {
  seed: number; dawns: number;
  districts: BakedDistrict[];
  byId: Record<string, BakedDistrict>;
  pairs: Record<string, BakedPair>;
  /** Named stretches of the realm's time, oldest first (days <= 0). */
  ages: BakedAge[];
  totals: Record<string, number>;
};

export const clampDawns = (n: unknown): number => {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.min(BAKE_MAX, Math.max(0, v)) : 0;
};
const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);
const span = (v: number | Range | undefined, u: number): number => (v === undefined ? 0 : typeof v === 'number' ? v : v[0] + (v[1] - v[0]) * u);

export type Baker = {
  readonly dawns: number;
  /** Dawns baked so far. */
  done(): number;
  /** Bake up to `n` more dawns; true when finished. */
  step(n: number): boolean;
  result(): RealmBake;
};

/** A bake you can run in slices (the New game screen shows it filling). */
export function createBaker(seed: number, dawnsRaw: number): Baker {
  const T = clampDawns(dawnsRaw);
  const K = BAKE.tuning, P = POL.tuning, KP = K.pairs;
  const ds: District[] = realm(seed);
  const N = ds.length;
  const { cols, rows } = DISTRICTS.grid;
  const rng = deriveRng(seed, 'realm-bake', T);

  // ---- districts ----
  const base0 = new Float64Array(N), tideEvery = new Float64Array(N), tideSign = new Float64Array(N);
  const base = new Float64Array(N), despair = new Float64Array(N), glow = new Float64Array(N), pop = new Float64Array(N).fill(1);
  const food = new Float64Array(N).fill(K.food.start), fert = new Float64Array(N), weather = new Float64Array(N).fill(1);
  const woundFeud = new Float64Array(N);
  const hungry = new Int32Array(N), lastFamine = new Int32Array(N).fill(-1e9), reignEnds = new Int32Array(N), rulers = new Int32Array(N).fill(1);
  const fallen = new Uint8Array(N), beacon = new Uint8Array(N);
  const counts: Record<string, number>[] = [], great: BakeEvent[][] = [], recent: BakeEvent[][] = [];
  const nbrs: number[][] = [];
  for (let i = 0; i < N; i++) {
    const d = ds[i]!;
    base0[i] = base[i] = despair[i] = d.despair;
    // Each land's own slow tide: it starts level, rising in some and falling in others.
    const tr = deriveRng(seed, 'bake-tide', i);
    tideEvery[i] = (K.tide.localYears[0] + tr.next() * (K.tide.localYears[1] - K.tide.localYears[0])) * YEAR_DAWNS;
    tideSign[i] = tr.next() < 0.5 ? 1 : -1;
    fert[i] = K.fertility[d.character.land] ?? 1;
    woundFeud[i] = POL.woundFeud[d.character.wound] ?? 0;
    reignEnds[i] = 1 + Math.floor(deriveRng(seed, 'bake-reign', i).next() * K.reign[1]);
    counts.push({}); great.push([]); recent.push([]); nbrs.push([]);
  }

  const realmTide = deriveRng(seed, 'bake-tide', 'realm');
  const realmEvery = (K.tide.realmYears[0] + realmTide.next() * (K.tide.realmYears[1] - K.tide.realmYears[0])) * YEAR_DAWNS;
  const realmSign = realmTide.next() < 0.5 ? 1 : -1;
  const TAU = Math.PI * 2;

  // ---- neighbouring pairs (right and down of each cell) ----
  const pa: number[] = [], pb: number[] = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const i = row * cols + col;
    if (col + 1 < cols) { pa.push(i); pb.push(i + 1); }
    if (row + 1 < rows) { pa.push(i); pb.push(i + cols); }
  }
  const M = pa.length;
  const rivals = new Set(POL.rivalStyles.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
  const trust = new Float64Array(M), feud = new Float64Array(M), grown0 = new Float64Array(M), weary = new Float64Array(M);
  const pstate = new Uint8Array(M), since = new Int32Array(M), lastWar = new Int32Array(M).fill(-1e9), warEnds = new Int32Array(M), winner = new Int8Array(M).fill(-1);
  const pairsOf: number[][] = ds.map(() => []);
  for (let k = 0; k < M; k++) {
    const a = pa[k]!, b = pb[k]!;
    const rival = rivals.has(`${ds[a]!.character.doctrine.style}|${ds[b]!.character.doctrine.style}`);
    const r = deriveRng(seed, 'district-relation', pairKey(ds[a]!.id, ds[b]!.id));
    feud[k] = r.int(P.startFeud[0], P.startFeud[1] + 1) + (rival ? P.rivalStartFeud! : 0);
    grown0[k] = (rival ? P.rivalStyleFeud! : 0) + (woundFeud[a]! + woundFeud[b]!) / 2;
    nbrs[a]!.push(b); nbrs[b]!.push(a);
    pairsOf[a]!.push(k); pairsOf[b]!.push(k);
  }

  // ---- events ----
  const kinds = Object.keys(BAKE.events);
  const rowsOf = kinds.map((k) => BAKE.events[k]!);
  const landOk = kinds.map((_, e) => ds.map((d) => !rowsOf[e]!.lands || rowsOf[e]!.lands!.includes(d.character.land)));
  const totals: Record<string, number> = {};
  const W = new Float64Array(kinds.length);

  /** Remember an event: the latest few always, the greatest few for good. */
  function note(i: number, day: number, kind: string, w: number, other?: number): void {
    counts[i]![kind] = (counts[i]![kind] ?? 0) + 1;
    totals[kind] = (totals[kind] ?? 0) + 1;
    const ev: BakeEvent = { day, kind, w: w + rng.next(), town: rng.next(), u: rng.next(), ...(other !== undefined ? { other } : {}) };
    const rec = recent[i]!;
    rec.push(ev);
    if (rec.length <= K.keepRecent) return;
    const old = rec.shift()!;
    const g = great[i]!;
    if (g.length < K.keepGreat) { g.push(old); return; }
    let lo = 0;
    for (let j = 1; j < g.length; j++) if (g[j]!.w < g[lo]!.w) lo = j;
    if (old.w > g[lo]!.w) g[lo] = old;
  }

  function rollEvent(i: number, day: number): void {
    const d = despair[i]!;
    let total = 0;
    for (let e = 0; e < kinds.length; e++) {
      const r = rowsOf[e]!;
      let w = r.weight;
      if (r.lands && !landOk[e]![i]) w *= 0.3;
      if (r.despairAbove !== undefined && d <= r.despairAbove) w = 0;
      if (r.despairBelow !== undefined && d >= r.despairBelow) w = 0;
      if (r.foodAbove !== undefined && food[i]! <= r.foodAbove) w = 0;
      const k = kinds[e]!;
      // The dark draws the spark-carriers; plenty breeds quarrels; hunger breeds bandits.
      if (k === 'sparkbearer') w *= 0.3 + d * 1.6 + (fallen[i] ? 1 : 0);
      else if (k === 'harvest') w *= 1.3 - d;
      else if (k === 'schism') w *= d < K.despair.decadenceBelow ? 3 : 1;
      else if (k === 'bandit') w *= 0.5 + d;
      else if (k === 'plague') w *= pop[i]!;
      W[e] = w;
      total += w;
    }
    let pick = rng.next() * total, e = 0;
    for (; e < kinds.length - 1; e++) { pick -= W[e]!; if (pick <= 0) break; }
    const r = rowsOf[e]!, kind = kinds[e]!, u = rng.next();
    despair[i] = despair[i]! + span(r.despair, u);
    glow[i] = glow[i]! + span(r.glow, u);
    food[i] = Math.max(0, food[i]! * (r.foodMul ?? 1) + (r.food ?? 0));
    pop[i] = pop[i]! * (r.popMul ? span(r.popMul, u) : 1) + (r.pop ?? 0);
    let other: number | undefined;
    const ns = nbrs[i]!;
    if (kind === 'exodus') {
      // They go where the hearths are warmer.
      other = ns.reduce((best, n) => (despair[n]! < despair[best]! ? n : best), ns[0]!);
      pop[other] = pop[other]! * 1.05;
    } else if (r.feud || r.trust) {
      const k = pairsOf[i]![Math.floor(u * pairsOf[i]!.length)]!;
      other = pa[k] === i ? pb[k]! : pa[k]!;
      feud[k] = clamp(feud[k]! + (r.feud ?? 0), 0, 100);
      trust[k] = clamp(trust[k]! + (r.trust ?? 0), -100, 100);
    }
    note(i, day, kind, r.note, other);
  }

  // ---- ages ----
  const ageLen = T > 0 ? Math.max(K.ages.minDawns, Math.ceil(T / K.ages.count)) : 0;
  const ages: BakedAge[] = [];
  let ageFrom = 1, ageWar = 0, ageGrey = 0, agePlenty = 0, ageSpark = 0, ageDespair0 = mean(despair);
  const usedAges = new Set<string>();
  function closeAge(t: number): void {
    const len = t - ageFrom + 1;
    if (len <= 0) return;
    // A short tail belongs to the age before it.
    if (t === T && len < ageLen / 3 && ages.length) { ages[ages.length - 1]!.to = 0; return; }
    const now = mean(despair), dd = now - ageDespair0;
    const score: Record<string, number> = {
      war: ageWar / (M * len) / 0.05,
      grey: ageGrey / (N * len) * 1000 / 2.2,
      plenty: agePlenty / (N * len) * 1000 / 1.6,
      dimming: dd / 0.035,
      kindling: -dd / 0.035 + ageSpark / (N * len) * 1000 / 1.2,
    };
    let kind = 'quiet', best = 1;
    for (const k of Object.keys(score)) if (score[k]! > best) { best = score[k]!; kind = k; }
    const pool = BAKE.ages[kind] ?? BAKE.ages.quiet!;
    const r = deriveRng(seed, 'bake-age', T, ages.length);
    let name = pool[r.int(0, pool.length)]!;
    for (let j = 0; usedAges.has(name) && j < pool.length; j++) name = pool[(pool.indexOf(name) + 1) % pool.length]!;
    for (const nth of ['Second', 'Third', 'Fourth']) { if (!usedAges.has(name)) break; name = `The ${nth} ${pool[r.int(0, pool.length)]!.replace(/^The /, '')}`; }
    usedAges.add(name);
    ages.push({ from: ageFrom - T, to: t - T, kind, name });
    ageFrom = t + 1; ageWar = ageGrey = agePlenty = ageSpark = 0; ageDespair0 = now;
  }

  // ---- the day ----
  const F = K.food, Dp = K.despair, G = K.glow, S = K.status;
  const warFeud = P.warFeud!, warCooldown = P.warCooldown!, warMin = P.warMin!, warSpread = P.warSpread!;
  function dawn(t: number): void {
    const day = t - T;
    const harvest = K.harvestBySeason[Math.floor((t - 1) / DAYS_PER_SEASON) % 4]!;
    const newYear = (t - 1) % YEAR_DAWNS === 0;
    const realmNow = newYear ? realmSign * K.tide.realm * Math.sin((TAU * t) / realmEvery) : 0;
    for (let i = 0; i < N; i++) {
      if (newYear) {
        weather[i] = K.weather[0] + rng.next() * (K.weather[1] - K.weather[0]);
        base[i] = base0[i]! + realmNow + tideSign[i]! * K.tide.local * Math.sin((TAU * t) / tideEvery[i]!);
      }
      let d = despair[i]!, g = glow[i]!, f = food[i]!, p = pop[i]!;
      f += F.rate * (harvest * fert[i]! * weather[i]! * (F.work - F.workDespair * d) - (F.eat + F.eatPop * p));
      if (f <= 0) {
        f = 0;
        d += F.famineDespair; p -= F.faminePop;
        if (++hungry[i]! === F.famineAfter && t - lastFamine[i]! > F.famineGap) { lastFamine[i] = t; ageGrey++; note(i, day, 'famine', BAKE.notes.famine!); }
      } else {
        hungry[i] = 0;
        if (f > F.cap) f = F.cap;
        if (f > F.plenty) { d -= F.plentyDespair; p += F.plentyPop; }
      }
      // Despair is pulled home to the wound; lit hearths ease it, deep ash feeds it; ease breeds neglect.
      d += (base[i]! - d) * Dp.pull - Dp.glowRelief * g;
      if (d < Dp.decadenceBelow) d += Dp.decadence;
      g = (g + (G.from - d) * G.rate) * G.keep;
      p += (1 - p) * K.pop.pull;
      despair[i] = d; glow[i] = g; food[i] = f; pop[i] = p;

      if (t >= reignEnds[i]!) {
        rulers[i] = rulers[i]! + 1;
        reignEnds[i] = t + K.reign[0] + Math.floor(rng.next() * (K.reign[1] - K.reign[0]));
        if (rng.next() < K.contested * (0.5 + d)) { despair[i] = d + 0.05; note(i, day, 'two_seats', BAKE.notes.two_seats!); }
        else counts[i]!.succession = (counts[i]!.succession ?? 0) + 1;
      }
      if (rng.next() < K.eventChance) {
        const before = totals.sparkbearer ?? 0, grey = (totals.plague ?? 0) + (totals.blight ?? 0), fat = totals.harvest ?? 0;
        rollEvent(i, day);
        ageSpark += (totals.sparkbearer ?? 0) - before;
        ageGrey += (totals.plague ?? 0) + (totals.blight ?? 0) - grey;
        agePlenty += (totals.harvest ?? 0) - fat;
      }
      d = despair[i] = clamp(despair[i]!, Dp.floor, Dp.cap);
      g = glow[i] = clamp(glow[i]!, -1, 1);
      pop[i] = clamp(pop[i]!, K.pop.min, K.pop.max);

      if (fallen[i]) { if (d < S.riseDespair) { fallen[i] = 0; note(i, day, 'rekindled', BAKE.notes.rekindled!); } }
      else if (d >= S.fallDespair && g <= S.fallGlow) { fallen[i] = 1; beacon[i] = 0; note(i, day, 'fell', BAKE.notes.fell!); }
      if (beacon[i]) { if (d > S.dimDespair) { beacon[i] = 0; note(i, day, 'dimmed', BAKE.notes.dimmed!); } }
      else if (d <= S.beaconDespair && g >= S.beaconGlow) { beacon[i] = 1; note(i, day, 'beacon', BAKE.notes.beacon!); }
    }

    for (let k = 0; k < M; k++) {
      const a = pa[k]!, b = pb[k]!;
      if (pstate[k] === 2) {
        ageWar++;
        if (t >= warEnds[k]!) {
          // The stronger side holds the field: heads, steadied or sapped by despair (as in play).
          const sa = pop[a]! * Math.max(1, ds[a]!.population) * (1.2 - despair[a]!), sb = pop[b]! * Math.max(1, ds[b]!.population) * (1.2 - despair[b]!);
          const win = sa >= sb ? a : b, lose = win === a ? b : a;
          despair[lose] = despair[lose]! + KP.loseDespair;
          pop[lose] = pop[lose]! * (1 - KP.losePop);
          food[win] = Math.min(F.cap, food[win]! + KP.winFood);
          pstate[k] = 0; since[k] = day; lastWar[k] = t; winner[k] = win === a ? 0 : 1;
          feud[k] = P.truceFeud!; trust[k] = Math.min(trust[k]!, P.truceTrust!);
          weary[k] = weary[k]! + KP.wearyPerWar;
          note(win, day, 'war_won', BAKE.notes.war!, lose);
          note(lose, day, 'war_lost', BAKE.notes.war! + 1, win);
        } else { despair[a] = despair[a]! + KP.warDespair; despair[b] = despair[b]! + KP.warDespair; }
        continue;
      }
      const D = despair[a]! > despair[b]! ? despair[a]! : despair[b]!;
      let tr = trust[k]!, fe = feud[k]!;
      const at = tr < 0 ? -tr : tr;
      const drift = Math.min(at, P.trustDrift! + P.trustDriftPerTrust! * at);
      tr += (tr < 0 ? drift : -drift) + (pstate[k] === 1 ? P.pactTrustPerDay! : 0);
      // Leaders write: a grievance eases the feud, anything else warms trust (less so the hotter the feud).
      if (fe >= P.grievanceAt!) { fe -= KP.grievanceEase; tr += KP.letterTrust * 0.25; }
      else tr += KP.letterTrust * (1 - fe / 100);
      fe += (grown0[k]! + P.despairFeud! * Math.max(0, D - P.despairCalm!)) * (1 + P.despairFeudMul! * D) - P.feudDecay! - (P.trustSoothe! * Math.max(0, tr)) / 100;
      tr = clamp(tr, -100, 100); fe = clamp(fe, 0, 100);
      if (weary[k]! > 0) weary[k] = Math.max(0, weary[k]! - 1 / KP.wearyFade);
      if (pstate[k] === 1 && (fe >= P.breakFeud! || tr < P.breakTrust!)) { pstate[k] = 0; since[k] = day; }
      else if (pstate[k] === 0 && tr >= P.pactTrust! && fe < P.pactFeud!) {
        pstate[k] = 1; since[k] = day;
        note(a, day, 'pact', BAKE.notes.pact!, b); note(b, day, 'pact', BAKE.notes.pact!, a);
      } else if (pstate[k] === 0 && fe >= warFeud && t - lastWar[k]! >= warCooldown * (1 + weary[k]! * KP.wearyCooldown)) {
        pstate[k] = 2; since[k] = day; lastWar[k] = t; winner[k] = -1;
        warEnds[k] = t + warMin + Math.floor(rng.next() * (warSpread + 1));
        totals.wars = (totals.wars ?? 0) + 1;
      }
      if (pstate[k] === 1) { despair[a] = despair[a]! - KP.pactRelief; despair[b] = despair[b]! - KP.pactRelief; }
      trust[k] = tr; feud[k] = fe;
    }
    if (t % ageLen === 0 || t === T) closeAge(t);
  }

  let t = 0;
  let out: RealmBake | undefined;
  return {
    dawns: T,
    done: () => t,
    step(n) {
      const to = Math.min(T, t + Math.max(1, Math.floor(n)));
      while (t < to) dawn(++t);
      return t >= T;
    },
    result() {
      if (out) return out;
      while (t < T) dawn(++t);
      const districts: BakedDistrict[] = ds.map((d, i) => ({
        id: d.id, index: i, despair: despair[i]!, glow: T ? glow[i]! : 0, people: pop[i]!, food: food[i]!,
        fallen: !!fallen[i], beacon: !!beacon[i], rulers: rulers[i]!, counts: counts[i]!,
        events: [...great[i]!, ...recent[i]!].sort((x, y) => x.day - y.day),
      }));
      const pairs: Record<string, BakedPair> = {};
      for (let k = 0; k < M; k++) {
        const ia = ds[pa[k]!]!.id, ib = ds[pb[k]!]!.id, [a, b] = ia < ib ? [ia, ib] : [ib, ia];
        const st = pstate[k] === 2 ? 'war' : pstate[k] === 1 ? 'pact' : 'peace';
        pairs[pairKey(a, b)] = {
          a, b, trust: trust[k]!, feud: feud[k]!, state: st, since: since[k]!,
          lastWar: lastWar[k]! < 0 ? -999 : lastWar[k]! - T,
          ...(st === 'war' ? { warEnds: warEnds[k]! - T + 1 } : {}),
          ...(winner[k]! >= 0 ? { winner: winner[k] === 0 ? ds[pa[k]!]!.id : ds[pb[k]!]!.id } : {}),
        };
      }
      totals.fallen = districts.filter((d) => d.fallen).length;
      totals.beacons = districts.filter((d) => d.beacon).length;
      totals.rulers = districts.reduce((n, d) => n + d.rulers, 0);
      out = { seed, dawns: T, districts, byId: Object.fromEntries(districts.map((d) => [d.id, d])), pairs, ages, totals };
      return out;
    },
  };
}

function mean(xs: Float64Array): number {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i]!;
  return s / xs.length;
}
export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

const MEMO = new Map<string, RealmBake>();
/** The baked realm for (seed, dawns), worked out once (the last few are kept). */
export function bakeRealm(seed: number, dawnsRaw: number): RealmBake {
  const dawns = clampDawns(dawnsRaw), key = `${seed}:${dawns}`;
  const hit = MEMO.get(key);
  if (hit) return hit;
  return rememberBake(createBaker(seed, dawns).result());
}
/** Hand over a bake made in slices so nothing bakes it twice. */
export function rememberBake(b: RealmBake): RealmBake {
  if (MEMO.size > 3) MEMO.delete(MEMO.keys().next().value!);
  MEMO.set(`${b.seed}:${b.dawns}`, b);
  return b;
}

/** A stable stream for telling an event (which town, which name, which words). */
export const tellRng = (seed: number, districtId: string, ev: BakeEvent) => createRng(Math.floor(ev.u * 4294967295) ^ (seed >>> 0) ^ (districtId.length * 2654435761));

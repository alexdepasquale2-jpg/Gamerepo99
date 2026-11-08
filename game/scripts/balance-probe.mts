/**
 * Balance and performance probe. Plays headless sessions like a bot over seeds x archetypes x playstyles and
 * prints what the economy of spark and despair does over a long run, plus how long a dawn takes.
 *
 * Playstyles:
 *   idle   rests every day, does nothing else.
 *   wild   rests, and leans on the wild: sits by every linger prop it can find each day (the cheese path).
 *   kind   a few kind deeds a day on the dimmest people in town (talk gentle, help, give, promise).
 *   harsh  the same number of deeds, all hard or savage (talk hard, shame, break a promise, empty cheer).
 *   late   idle for the first twelfth of the run, then kind: a neglected home town greys, then is lit again
 *          (shows despair moving both ways in one town).
 *
 * Measured per run: spark min/mean/end, days at zero, burnouts (first burnout day), people reignited,
 * mean town despair at day 0/30/60/90/120 and for the home town vs the rest, happenings fired, wars begun,
 * and dawn cost (p50/max ms). A second pass walks each seed's first trunk road into a generated district
 * and times dawns there.
 *
 * Deterministic: everything the bot chooses comes from the session's own state (sorted ids), never
 * Math.random, so the same seed gives the same table (timings aside). The script checks that by running one
 * cell twice.
 *
 * Run: npx vite-node --config game/vite.config.ts game/scripts/balance-probe.mts [--days N] [--quick] [--with-introduce]
 */
import archetypesJson from '../src/data/people/archetypes.json';
import { createPlaySession } from '../src/sim/play-session/play-session';
import type { PlaySession } from '../src/sim/play-session/play-session-types';

const args = process.argv.slice(2);
const argNum = (name: string, dflt: number): number => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : dflt;
};
const QUICK = args.includes('--quick');
const DAYS = argNum('--days', QUICK ? 40 : 120);
const SEEDS = QUICK ? [42] : [1, 7, 42, 99];
const ARCHETYPES: string[] = (archetypesJson as { archetypes: { id: string }[] }).archetypes.map((a) => a.id);
const STYLES = ['idle', 'wild', 'kind', 'harsh', 'late'] as const;
type Style = (typeof STYLES)[number];
const DEEDS_PER_DAY = 4;
const DISTRICT_DAYS = QUICK ? 10 : 30;

// 'introduce' is left out: introducing the same pair twice pushes a duplicate kin edge (play-session-act) and
// the next dawn's letters throw "duplicate social edge id" (letters-scale createSocialGraph). Logic, not
// tuning; reported in the PR. Pass --with-introduce to put it back and see the crash.
const KIND_DEEDS = ['talk_gentle', 'gift_give', 'promise_make', 'promise_keep', 'carry_goods', 'trade_fair', 'stand_up', ...(args.includes('--with-introduce') ? ['introduce'] : [])];
const HARSH_DEEDS = ['talk_hard_shame', 'promise_break', 'talk_hard', 'talk_empty_cheer'];
/** Wild props a walker meets most days, with a linger tag (props.json): resting is sitting there, not a verb. */
const WILD_PROPS: string[] = ['tree', 'hay', 'boulder', 'campfire', 'tent', 'shrine', 'log', 'camp', 'waystation', 'cart', 'rock'];
/** Seconds the cheese walker sits by each one a day (well past what the daily prop cap pays for). */
const LINGER_SECS = 120;

/** Runs that threw inside the sim (where, which day, the first line of the error). */
const CRASHES: { where: string; day: number; error: string }[] = [];

type Run = {
  seed: number; arch: string; style: Style;
  sparkMin: number; sparkMean: number; sparkEnd: number; daysAtZero: number; burnouts: number; firstBurnout: number | null; ended: number | null; lived: number;
  reignited: number; despair: number[]; sparkAt: number[]; homeD0: number; homeD1: number; homeMax: number; restD0: number; restD1: number;
  happenings: number; wars: number; dawnP50: number; dawnMax: number; fingerprint: string;
};

const pct = (xs: number[], p: number): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
};
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function boot(seed: number, arch: string): PlaySession {
  const s = createPlaySession({ mode: 'play', seed, archetypeId: arch }) as PlaySession;
  s.start({ seed, archetypeId: arch });
  return s;
}

/** People of the player's town, dimmest first (ties by id). */
function townFolk(s: PlaySession): string[] {
  const st = s.getState()!;
  const town = st.player.townId;
  return Object.values(st.people)
    .filter((p) => p.townId === town)
    .sort((a, b) => (a.flame as number) - (b.flame as number) || a.id.localeCompare(b.id))
    .map((p) => p.id);
}

function dayOfDeeds(s: PlaySession, style: 'kind' | 'harsh', day: number): void {
  const want = style === 'kind' ? KIND_DEEDS : HARSH_DEEDS;
  const folk = townFolk(s);
  let done = 0;
  for (let i = 0; i < folk.length && done < DEEDS_PER_DAY; i++) {
    const pid = folk[(i + day) % folk.length]!;
    const offered = new Set(s.listActions(pid).map((a) => a.id.split('@')[0]!));
    // Rotate the preferred deed by day and by deed so a day mixes verbs (as a player would), not one on repeat.
    const k = (day + done) % want.length;
    const pick = [...want.slice(k), ...want.slice(0, k)].find((d) => offered.has(d));
    if (!pick) continue;
    if (s.snapshot().spark <= 0 || s.successionOffer()) return;
    s.act(`${pick}@${pid}`);
    done++;
  }
}

function dayOfWild(s: PlaySession, day: number): void {
  for (const type of WILD_PROPS) s.linger(`prop:${type}@${day % 7},${(day * 3) % 11}`, LINGER_SECS);
}

function playRun(seed: number, arch: string, style: Style, days = DAYS): Run {
  const s = boot(seed, arch);
  let happenings = 0;
  s.onJuice((id, p) => {
    // events.json happenings carry an eventId; legitimacy remarks reuse the bubble without one.
    if (id === 'happening.start' && (p as { eventId?: unknown } | undefined)?.eventId) happenings++;
  });
  const wars = new Set<string>();
  const sparks: number[] = [];
  const dawns: number[] = [];
  const despair: number[] = [];
  const sparkAt: number[] = [];
  let burnouts = 0;
  let firstBurnout: number | null = null;
  const st0 = s.getState()!;
  const home = st0.player.townId!;
  const td = (): { home: number; rest: number; all: number } => {
    const d = s.townDespair();
    const rest = Object.entries(d).filter(([id]) => id !== home).map(([, v]) => v);
    return { home: d[home] ?? 0, rest: mean(rest), all: mean(Object.values(d)) };
  };
  const d0 = td();
  despair.push(d0.all);
  let homeMax = d0.home;
  let lived = 0;
  let ended: number | null = null;
  for (let day = 1; day <= days; day++) {
    try {
      const lateKind = style === 'late' && day > Math.floor(days / 12);
      if (style === 'kind' || style === 'harsh' || lateKind) dayOfDeeds(s, style === 'harsh' ? 'harsh' : 'kind', day);
      if (style === 'wild') dayOfWild(s, day);
      const t0 = performance.now();
      s.tick();
      dawns.push(performance.now() - t0);
      if (s.successionOffer()) {
        burnouts++;
        firstBurnout ??= day;
        // No heir (nobody bonded enough to carry it on): this line of lives is over and the world waits on
        // the succession screen, so the run stops here and its remaining days count as days at zero.
        if (!s.chooseSuccession('continue').ok) ended = day;
      }
      lived = day;
      sparks.push(ended ? 0 : s.snapshot().spark);
      for (const w of s.getState()?.polity?.wars ?? []) wars.add(w.id);
      const now = td();
      homeMax = Math.max(homeMax, now.home);
      if (day % 30 === 0) despair.push(now.all);
      if (day % 30 === 0) sparkAt.push(sparks[sparks.length - 1]!);
      if (ended) break;
    } catch (e) {
      // A sim crash is a finding, not the end of the probe: note it and keep the run's numbers so far.
      CRASHES.push({ where: `seed ${seed} ${arch} ${style}`, day, error: String((e as Error).message ?? e).split('\n')[0]! });
      break;
    }
  }
  if (ended) while (sparks.length < days) {
    sparks.push(0);
    if (sparks.length % 30 === 0) sparkAt.push(0);
  }
  const d1 = td();
  const snap = s.snapshot();
  return {
    seed, arch, style,
    sparkMin: sparks.length ? Math.min(...sparks) : 0, sparkMean: mean(sparks), sparkEnd: sparks[sparks.length - 1] ?? 0,
    daysAtZero: sparks.filter((x) => x <= 0).length, burnouts, firstBurnout, ended, lived,
    reignited: snap.reignitedCount, despair, sparkAt, homeD0: d0.home, homeD1: d1.home, homeMax, restD0: d0.rest, restD1: d1.rest,
    happenings, wars: wars.size, dawnP50: pct(dawns, 0.5), dawnMax: dawns.length ? Math.max(...dawns) : 0, fingerprint: snap.fingerprint,
  };
}

/** Walk the first trunk road and time dawns in the district at its end. */
function districtRun(seed: number): { name: string; people: number; p50: number; max: number; homeP50: number } {
  const s = boot(seed, ARCHETYPES[0]!);
  // Perf only: keep the walker's fire full so the trunk road and every dawn after it run in full (a burned-out
  // walker waits on the succession screen and the dawn never comes). Balance is measured by playRun, not here.
  const keepLit = (): void => {
    const st = s.getState();
    if (st) st.player.spark = 100;
  };
  const homeDawns: number[] = [];
  for (let i = 0; i < 12; i++) {
    keepLit();
    const t0 = performance.now();
    s.tick();
    homeDawns.push(performance.now() - t0);
  }
  const road = s.trunkRoads()[0];
  if (!road) return { name: '(no trunk road)', people: 0, p50: 0, max: 0, homeP50: pct(homeDawns, 0.5) };
  keepLit();
  const res = s.journeyDistrict(road.to);
  const dawns: number[] = [];
  for (let i = 0; i < DISTRICT_DAYS; i++) {
    keepLit();
    const t0 = performance.now();
    try {
      s.tick();
    } catch (e) {
      CRASHES.push({ where: `seed ${seed} district ${road.id}`, day: i + 1, error: String((e as Error).message ?? e).split('\n')[0]! });
      break;
    }
    dawns.push(performance.now() - t0);
  }
  return { name: res?.name ?? road.name, people: Object.keys(s.getState()?.people ?? {}).length, p50: pct(dawns, 0.5), max: Math.max(...dawns), homeP50: pct(homeDawns, 0.5) };
}

const f = (n: number, d = 1): string => n.toFixed(d);

function main(): void {
  const t0 = performance.now();
  const runs: Run[] = [];
  for (const seed of SEEDS) for (const arch of ARCHETYPES) for (const style of STYLES) runs.push(playRun(seed, arch, style));

  console.log(`\n## Balance probe: ${SEEDS.length} seeds x ${ARCHETYPES.length} archetypes x ${STYLES.length} styles, ${DAYS} days, ${DEEDS_PER_DAY} deeds/day\n`);
  console.log('### Per style (mean over seeds x archetypes)\n');
  console.log('| style | spark min | spark mean | spark end | days at 0 | burnouts | 1st burnout (mean day) | life over, no heir | days lived | reignited | home despair d0 -> max -> end | rest despair d0 -> end | happenings | wars |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const style of STYLES) {
    const rs = runs.filter((r) => r.style === style);
    const fb = rs.map((r) => r.firstBurnout).filter((x): x is number => x !== null);
    console.log(`| ${style} | ${f(mean(rs.map((r) => r.sparkMin)))} | ${f(mean(rs.map((r) => r.sparkMean)))} | ${f(mean(rs.map((r) => r.sparkEnd)))} | ${f(mean(rs.map((r) => r.daysAtZero)))} | ${f(mean(rs.map((r) => r.burnouts)), 2)} | ${fb.length ? `${f(mean(fb), 0)} (${fb.length}/${rs.length} runs)` : '-'} | ${rs.filter((r) => r.ended).length}/${rs.length} | ${f(mean(rs.map((r) => r.lived)), 0)} | ${f(mean(rs.map((r) => r.reignited)))} | ${f(mean(rs.map((r) => r.homeD0)), 3)} -> ${f(mean(rs.map((r) => r.homeMax)), 3)} -> ${f(mean(rs.map((r) => r.homeD1)), 3)} | ${f(mean(rs.map((r) => r.restD0)), 3)} -> ${f(mean(rs.map((r) => r.restD1)), 3)} | ${f(mean(rs.map((r) => r.happenings)))} | ${f(mean(rs.map((r) => r.wars)), 2)} |`);
  }

  console.log('\n### Per style x archetype (mean over seeds)\n');
  console.log('| style | archetype | spark min | spark mean | days at 0 | 1st burnout (day, per seed) | reignited | home despair end |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const style of STYLES) for (const arch of ARCHETYPES) {
    const rs = runs.filter((r) => r.style === style && r.arch === arch);
    console.log(`| ${style} | ${arch} | ${f(mean(rs.map((r) => r.sparkMin)))} | ${f(mean(rs.map((r) => r.sparkMean)))} | ${f(mean(rs.map((r) => r.daysAtZero)))} | ${rs.map((r) => r.firstBurnout ?? '-').join(' ')} | ${f(mean(rs.map((r) => r.reignited)))} | ${f(mean(rs.map((r) => r.homeD1)), 3)} |`);
  }

  const marks = Array.from({ length: Math.floor(DAYS / 30) + 1 }, (_, i) => i * 30);
  // Means over the runs still alive at that mark (a run that ended early has no later despair reading).
  const at = (xs: (number | undefined)[]): string => {
    const ys = xs.filter((x): x is number => typeof x === 'number');
    return ys.length ? f(mean(ys), 3) : '-';
  };
  console.log('\n### Mean spark over time (dead ends count as 0)\n');
  console.log(`| style | ${marks.slice(1).map((m) => `d${m}`).join(' | ')} |`);
  console.log(`|---|${marks.slice(1).map(() => '---').join('|')}|`);
  for (const style of STYLES) {
    const rs = runs.filter((r) => r.style === style);
    console.log(`| ${style} | ${marks.slice(1).map((_, i) => f(mean(rs.map((r) => r.sparkAt[i] ?? 0)))).join(' | ')} |`);
  }
  console.log('\n### Mean town despair over time (all towns, over runs alive at that day)\n');
  console.log(`| style | ${marks.map((m) => `d${m}`).join(' | ')} |`);
  console.log(`|---|${marks.map(() => '---').join('|')}|`);
  for (const style of STYLES) {
    const rs = runs.filter((r) => r.style === style);
    console.log(`| ${style} | ${marks.map((_, i) => at(rs.map((r) => r.despair[i]))).join(' | ')} |`);
  }

  console.log('\n### Per seed (all archetypes and styles)\n');
  console.log('| seed | happenings (mean) | wars (mean) | dawn p50 ms | dawn max ms |');
  console.log('|---|---|---|---|---|');
  for (const seed of SEEDS) {
    const rs = runs.filter((r) => r.seed === seed);
    console.log(`| ${seed} | ${f(mean(rs.map((r) => r.happenings)))} | ${f(mean(rs.map((r) => r.wars)), 2)} | ${f(pct(rs.map((r) => r.dawnP50), 0.5), 2)} | ${f(Math.max(...rs.map((r) => r.dawnMax)), 1)} |`);
  }

  console.log(`\n### Dawn cost in a generated district (first trunk road, ${DISTRICT_DAYS} dawns)\n`);
  console.log('| seed | district | people | home p50 ms | district p50 ms | district max ms |');
  console.log('|---|---|---|---|---|---|');
  for (const seed of SEEDS) {
    const d = districtRun(seed);
    console.log(`| ${seed} | ${d.name} | ${d.people} | ${f(d.homeP50, 2)} | ${f(d.p50, 2)} | ${f(d.max, 1)} |`);
  }

  // Determinism: the same cell twice gives the same fingerprint and numbers.
  const a = playRun(SEEDS[0]!, ARCHETYPES[0]!, 'kind', Math.min(DAYS, 30));
  const b = playRun(SEEDS[0]!, ARCHETYPES[0]!, 'kind', Math.min(DAYS, 30));
  const same = a.fingerprint === b.fingerprint && a.sparkMean === b.sparkMean && a.reignited === b.reignited && a.happenings === b.happenings;
  if (CRASHES.length) {
    console.log(`\n### Sim crashes (${CRASHES.length}; the run stops at the crash, its numbers so far are kept)\n`);
    for (const c of CRASHES) console.log(`- ${c.where}, day ${c.day}: ${c.error}`);
  }

  console.log(`\nDeterminism (seed ${SEEDS[0]}, ${ARCHETYPES[0]}, kind, 30 days, twice): ${same ? 'same' : 'DIFFERENT'}`);
  console.log(`Probe took ${f((performance.now() - t0) / 1000, 1)}s`);
  if (!same) process.exitCode = 1;
}

main();

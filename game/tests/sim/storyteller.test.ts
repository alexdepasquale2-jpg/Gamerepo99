import { describe, expect, it } from 'vitest';
import '../../src/sim/contrib';
import { boardPages } from '../../src/sim/board-pages';
import { collectDawnLinesBySource } from '../../src/sim/dawn-lines';
import { foodHave } from '../../src/sim/economy/food-stock';
import { supplyTown } from '../../src/sim/economy/village-economy';
import { ITEM_BY_ID } from '../../src/sim/goods/inventory';
import { happeningRows } from '../../src/sim/happenings';
import { packFor } from '../../src/sim/hero/spawns';
import { createPlaySession } from '../../src/sim/play-session/play-session';
import type { PlaySession } from '../../src/sim/play-session/play-session-types';
import { deriveRng } from '../../src/sim/rng';
import { DEFAULT_TELLER, STORY, TELLERS, chooseStoryteller, fireIncident, incidentById, mercyNow, pressureAt, routPack, startArc, storyIfAny, storyOf, tellerById, tidings } from '../../src/sim/storyteller';
import type { SimState } from '../../src/sim/types/runtime';

function play(storyteller?: string, seed = 42): { s: PlaySession; st: SimState } {
  const s = createPlaySession({ mode: 'play', seed, archetypeId: 'marrow' }) as PlaySession;
  s.start({ seed, archetypeId: 'marrow', ...(storyteller ? { storyteller } : {}) });
  return { s, st: s.getState()! };
}
/** Let `days` pass with the fire kept up (an idle inhabitant burns out, which is another test's business). */
function run(s: PlaySession, st: SimState, days: number): void {
  for (let i = 0; i < days; i++) { st.player.spark = 80; s.tick(); }
}
const rng = (st: SimState) => deriveRng(st.seed, 'test', st.day);
const stockSum = (st: SimState, town: string): number => Object.values(st.towns![town]!.stock).reduce((a, b) => a + b, 0);

describe('storyteller table', () => {
  it('names only things that exist', () => {
    const events = new Set(happeningRows(play().st).map((e) => e.id));
    const ids = new Set(STORY.incidents.map((i) => i.id));
    expect(ids.size).toBe(STORY.incidents.length);
    for (const inc of STORY.incidents) {
      for (const op of [...inc.ops, ...(inc.resolve?.win ?? []), ...(inc.resolve?.lose ?? [])]) {
        if (op.op === 'item') expect(ITEM_BY_ID.has(op.id), `${inc.id}: ${op.id}`).toBe(true);
        if (op.op === 'happening') expect(events.has(op.id), `${inc.id}: ${op.id}`).toBe(true);
      }
      expect(inc.say.length && inc.news.length, inc.id).toBeTruthy();
      if (inc.resolve) { expect(inc.days, inc.id).toBeGreaterThan(0); expect(inc.board, inc.id).toBeTruthy(); expect(inc.resolve.winLines.length && inc.resolve.loseLines.length, inc.id).toBeTruthy(); }
      if (inc.resolve?.by === 'rout') expect(inc.ops.some((o) => o.op === 'pressure'), inc.id).toBe(true);
      if (inc.arcOnly) expect(STORY.arcs.some((a) => a.steps.some((s) => [s.incident, s.won, s.lost].includes(inc.id))), inc.id).toBe(true);
    }
    for (const arc of STORY.arcs) for (const step of arc.steps) for (const id of [step.incident, step.won, step.lost]) if (id) expect(ids.has(id), `${arc.id}: ${id}`).toBe(true);
    for (const t of TELLERS) for (const p of Object.values(t.phases)) { expect(t.phases[p.next], `${t.id}: ${p.next}`).toBeTruthy(); expect(STORY.phaseLines[p.next]).toBeTruthy(); }
    expect(TELLERS.length).toBeGreaterThanOrEqual(3);
  });
});

describe('the storyteller paces the days', () => {
  it('a new game has the teller you chose (the first by default); an old save gets the first', () => {
    expect(storyIfAny(play().st)!.teller).toBe(DEFAULT_TELLER);
    expect(storyIfAny(play('gale').st)!.teller).toBe('gale');
    expect(storyIfAny(play('nobody').st)!.teller).toBe(DEFAULT_TELLER);
    const { s, st } = play('weaver');
    delete (st as SimState & { storyteller?: unknown }).storyteller;
    s.tick();
    expect(storyIfAny(st)!.teller).toBe(DEFAULT_TELLER);
  });

  it('tells the same tale for the same world and teller, and another for another teller', () => {
    const tale = (teller: string): string => { const { s, st } = play(teller); run(s, st, 30); return JSON.stringify(storyOf(st).log); };
    expect(tale('ember')).toBe(tale('ember'));
    expect(tale('ember')).not.toBe(tale('gale'));
  });

  it('moves through calm, rising, peak and ebb, and something happens in each tale', () => {
    const { s, st } = play('ember');
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) { run(s, st, 1); seen.add(storyOf(st).phase); }
    expect([...seen].sort()).toEqual(['calm', 'ebb', 'peak', 'rising']);
    const log = storyOf(st).log;
    expect(log.length).toBeGreaterThan(6);
    expect(new Set(log.map((l) => l.kind)).size).toBeGreaterThan(2);
  });

  it('never tells the same thing twice running, and keeps to the teller\'s gap', () => {
    for (const teller of TELLERS) {
      const { s, st } = play(teller.id);
      run(s, st, 60);
      const begun = storyOf(st).log.filter((l) => !l.outcome);
      for (let i = 1; i < begun.length; i++) expect(begun[i]!.id, `${teller.id} day ${begun[i]!.day}`).not.toBe(begun[i - 1]!.id);
      // Whatever the teller chose to begin (not a chain's own next step) keeps its gap from the last thing begun.
      const chosen = begun.filter((l) => !incidentById(l.id)?.arcOnly);
      for (let i = 1; i < chosen.length; i++) expect(chosen[i]!.day - chosen[i - 1]!.day, `${teller.id} day ${chosen[i]!.day}`).toBeGreaterThanOrEqual(1);
      expect(begun.length, teller.id).toBeGreaterThan(5);
    }
  });

  it('a merciful teller holds trouble back while you are nearly out', () => {
    const { st } = play('ember');
    st.player.spark = 5;
    expect(mercyNow(st, tellerById('ember'))).toBe(true);
    expect(mercyNow(st, tellerById('gale'))).toBe(false);
    st.player.spark = 80;
    expect(mercyNow(st, tellerById('ember'))).toBe(false);
  });
});

describe('incidents you can answer', () => {
  it('a raid takes stores and gathers bandits round the town; routing them brings the stores back', () => {
    const { st } = play();
    const town = st.player.townId!;
    const before = stockSum(st, town), despair = st.towns![town]!.despair;
    const a = fireIncident(st, incidentById('bandit_raid')!, town, rng(st))!;
    expect(stockSum(st, town)).toBeLessThan(before);
    expect(st.towns![town]!.despair).toBeGreaterThan(despair);
    expect(pressureAt(st, town)?.family).toBe('bandit');
    expect(tidings(st, town).join(' ')).toContain('Raiders are camped');
    // Packs by that town are nearly always there, and nearly always bandits.
    let packs = 0, bandits = 0;
    for (let cx = 0; cx < 40; cx++) { const p = packFor(st, cx, 7, { nearRoad: false, despair: 0, night: false, hostile: false, nearTown: town }); if (p) { packs++; if (p.family === 'bandit') bandits++; } }
    expect(packs).toBeGreaterThan(30);
    expect(bandits / packs).toBeGreaterThan(0.7);
    const coin = st.player.coin ?? 0;
    for (let i = a.need!; i > 1; i--) expect(routPack(st, 'bandit', town)!.done).toBe(false);
    expect(routPack(st, 'beast', town)).toBeNull();
    expect(routPack(st, 'bandit', town)!.done).toBe(true);
    expect(stockSum(st, town)).toBe(before);
    expect(pressureAt(st, town)).toBeUndefined();
    expect(st.player.coin ?? 0).toBeGreaterThan(coin);
    expect(storyOf(st).log.at(-1)).toMatchObject({ id: 'bandit_raid', outcome: 'won' });
    expect(st.bus!.lastIds).toContain('happening.start');
  });

  it('a raid nobody answers is lost at its deadline, and told at dawn', () => {
    const { s, st } = play();
    const town = st.player.townId!;
    chooseStoryteller(st, 'ember');
    const a = fireIncident(st, incidentById('bandit_raid')!, town, rng(st))!;
    const after = stockSum(st, town);
    let lines: string[] = [];
    for (let i = 0; i < 12 && storyOf(st).active.includes(a); i++) { run(s, st, 1); lines = collectDawnLinesBySource(st).storyteller ?? []; }
    expect(storyOf(st).log.some((l) => l.id === 'bandit_raid' && l.outcome === 'lost')).toBe(true);
    expect(lines.length).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(0);
  });

  it('a blighted town comes through if it is kept fed', () => {
    const { s, st } = play();
    const town = st.player.townId!;
    const food = foodHave(st, town);
    const a = fireIncident(st, incidentById('blight')!, town, rng(st))!;
    expect(foodHave(st, town)).toBeLessThan(food);
    for (let i = 0; i < 10 && storyOf(st).active.includes(a); i++) { supplyTown(st, town, 'grain', 200); run(s, st, 1); }
    expect(storyOf(st).log.some((l) => l.id === 'blight' && l.outcome === 'won')).toBe(true);
  });

  it('an arc runs its steps in one town, and its ending turns on yours', () => {
    const { s, st } = play();
    const town = st.player.townId!;
    expect(startArc(st, STORY.arcs.find((a) => a.id === 'bandit_king')!, town, rng(st))).toBe(true);
    expect(storyOf(st).arc?.id).toBe('bandit_king');
    expect(startArc(st, STORY.arcs[1]!, town, rng(st))).toBe(false);
    for (let i = 0; i < 20 && storyOf(st).arc; i++) {
      run(s, st, 1);
      const p = pressureAt(st, town);
      if (p) for (let k = p.need!; k > 0; k--) routPack(st, 'bandit', town);
    }
    const ids = storyOf(st).log.filter((l) => l.townId === town).map((l) => l.id);
    expect(ids).toContain('cut_purses');
    expect(ids).toContain('bandit_raid');
    expect(ids).toContain('kings_fall');
    expect(ids).not.toContain('tribute');
    expect(storyOf(st).arc).toBeUndefined();
  });

  it('the board has a Tidings page', () => {
    const { st } = play();
    const page = boardPages().find((p) => p.id === 'tidings')!;
    expect(page.render(st, st.player.townId!, (id) => id).lines!.length).toBeGreaterThan(1);
  });
});

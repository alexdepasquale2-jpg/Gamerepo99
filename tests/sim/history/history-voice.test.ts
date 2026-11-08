import { describe, expect, it } from 'vitest';
import { createPlaySession } from '../../../src/sim';
import type { PlaySession } from '../../../src/sim/play-session/play-session';
import type { HistoryEvent } from '../../../src/sim/gen/world-types';
import type { PersonState, SimState } from '../../../src/sim/types/runtime';
import {
  VOICE,
  beatRow,
  buildRetelling,
  dawnHistoryLine,
  eraOf,
  gistOf,
  knowing,
  shortName,
  tellNextBeat,
  untoldBeats,
} from '../../../src/sim/history-voice';
import { collectDawnLines } from '../../../src/sim/dawn-lines';
import { presentJuice } from '../../../src/ui/surface';

const person = (id: string, extra: Partial<PersonState> = {}): PersonState => ({ id, flame: 20, name: `${id[0]!.toUpperCase()}${id.slice(1)} Doe`, ...extra });

const HISTORY: HistoryEvent[] = [
  { id: 'hb_founding_mill', at: 1, tags: ['founding', 'arc:mill_compact', 'mill_founded'], personIds: ['ann', 'kid'] },
  { id: 'hb_doctrine_strand', at: 2, tags: ['doctrine_arrival'], personIds: ['ann'] },
  { id: 'hb_loss_mill_fire', at: 3, tags: ['loss', 'arc:mill_compact'], personIds: ['ann', 'bo'] },
];

function mini(people: PersonState[], history = HISTORY): SimState {
  return {
    day: 3,
    seed: 9,
    player: { townId: 'lowmere' } as SimState['player'],
    people: Object.fromEntries(people.map((p) => [p.id, p])),
    flags: {},
    packets: [],
    history,
  };
}

function session(seed = 42): PlaySession {
  const s = createPlaySession({ mode: 'play', seed, archetypeId: 'marrow' }) as PlaySession;
  s.start({ seed, archetypeId: 'marrow' });
  return s;
}

describe('history voice: who knows what', () => {
  it('named people, the town a beat is tied to, and elders know a beat; children only their own', () => {
    const strand = HISTORY[1]!; // tied to lowmere
    expect(knowing(person('ann'), strand)).toBe('named');
    expect(knowing(person('lo', { townId: 'lowmere' }), strand)).toBe('town');
    expect(knowing(person('gran', { age: 70 }), strand)).toBe('elder');
    expect(knowing(person('stranger', { age: 30, townId: 'ashford' }), strand)).toBeNull();
    expect(knowing(person('tot', { age: 8, townId: 'lowmere' }), strand)).toBeNull();
    expect(knowing(person('kid', { age: 8 }), HISTORY[0]!)).toBe('named');
    // Your own town's story ranks as the town's even when it names you.
    expect(knowing(person('ann', { townId: 'lowmere' }), strand)).toBe('town');
    // A beat with no authored row has nothing to retell.
    expect(knowing(person('gran', { age: 70 }), { id: 'hb_empty', personIds: ['gran'] })).toBeNull();
    expect(shortName(person('x', { name: undefined, id: 'harold_finch' }))).toBe('Harold');
  });

  it('town stories come first, each beat is told once, then the chip has nothing left', () => {
    const s = mini([person('lo', { townId: 'lowmere', age: 60 })]);
    const order = untoldBeats(s, 'lo').map((b) => b.id);
    expect(order[0]).toBe('hb_doctrine_strand');
    expect(order).toHaveLength(3);
    const told = [tellNextBeat(s, 'lo'), tellNextBeat(s, 'lo'), tellNextBeat(s, 'lo')].map((t) => t?.beatId);
    expect(new Set(told).size).toBe(3);
    expect(s.historyTold?.lo).toEqual(told);
    expect(tellNextBeat(s, 'lo')).toBeNull();
    expect(untoldBeats(s, 'lo')).toEqual([]);
  });
});

describe('history voice: the line builder', () => {
  it('eras split oldest/middle/newest', () => {
    expect(HISTORY.map((b) => eraOf(b, HISTORY))).toEqual(['deep', 'middle', 'recent']);
  });

  it('a retelling is opener + the beat summary + a coda, all from data, deterministic', () => {
    const people = { ann: person('ann', { townId: 'ashford' }), bo: person('bo', { townId: 'ashford' }) };
    const inp = { seed: 3, teller: people.ann, beat: HISTORY[2]!, history: HISTORY, people };
    const line = buildRetelling(inp);
    expect(line).toBe(buildRetelling(inp));
    expect(line).toContain(beatRow('hb_loss_mill_fire')!.summary);
    const openers = [...Object.values(VOICE.openers.witness.recent), ...Object.values(VOICE.openers.hearsay.recent)];
    expect(openers.some((o) => line.startsWith(o))).toBe(true);
    const codas = [...VOICE.codas.kind.loss!, ...VOICE.codas.otherWitness.map((c) => c.replace('{name}', 'Bo'))];
    expect(codas.some((c) => line.endsWith(c))).toBe(true);
    expect(line.length).toBeLessThan(160);
  });

  it('deep-past beats never point to a living witness', () => {
    const people = { ann: person('ann'), kid: person('kid') };
    for (let seed = 0; seed < 40; seed++) {
      const line = buildRetelling({ seed, teller: people.ann, beat: HISTORY[0]!, history: HISTORY, people });
      expect(line).not.toMatch(/Kid/);
    }
  });

  it('short names and gists', () => {
    expect(shortName(person('harold', { name: 'Harold Finch', age: 51 }), { old: true })).toBe('Old Harold');
    expect(shortName(person('harold', { name: 'Harold Finch', age: 51 }))).toBe('Harold');
    expect(shortName(person('tom', { name: 'Old Tom Briggs', age: 67 }), { old: true })).toBe('Old Tom');
    expect(gistOf(HISTORY[2]!)).toBe('the week the mill burned');
    expect(gistOf({ id: 'unknown_beat', tags: ['feud'] })).toBe(VOICE.kindGists.feud);
  });

  it('every procedural beat has a gist', () => {
    const missing = ['hb_founding_mill', 'hb_loss_mill_fire', 'hb_feud_notice', 'hb_miracle_yeast', 'hb_drift_gap', 'hb_departure_port']
      .filter((id) => !VOICE.gists[id]);
    expect(missing).toEqual([]);
  });

  it('dawn: now and then a local tells an old story, by name', () => {
    const s = mini([person('lo', { name: 'Lorna Pike', townId: 'lowmere', age: 66 }), person('far', { townId: 'ashford', age: 80 })]);
    const lines: string[] = [];
    for (let d = 1; d <= 40; d++) {
      s.day = d;
      const l = dawnHistoryLine(s);
      if (l) lines.push(l);
    }
    expect(lines.length).toBeGreaterThan(3);
    expect(lines.length).toBeLessThan(35);
    expect(lines.every((l) => l.includes('Old Lorna'))).toBe(true);
    s.day = 5;
    expect(dawnHistoryLine(s)).toBe(dawnHistoryLine(s));
  });
});

describe('history in play', () => {
  it('boot carries the world history; the ring offers "Ask about the old days"; asking surfaces a bubble', () => {
    const s = session();
    const st = s.getState()!;
    expect(st.history).toEqual(s.getWorld()!.history);
    expect(st.history!.length).toBeGreaterThan(0);
    const ask = s.listActions().find((a) => a.id === 'ask_past@harold_finch');
    expect(ask).toMatchObject({ label: 'Ask about the old days' });
    const juice: { id: string; p: { personId: string; line: string } }[] = [];
    s.onJuice((id, p) => juice.push({ id, p: p as { personId: string; line: string } }));
    const sparkBefore = st.player.spark;
    s.act('ask_past@harold_finch');
    const told = juice.find((j) => j.id === 'history.told');
    expect(told?.p.personId).toBe('harold_finch');
    expect(told?.p.line.length).toBeGreaterThan(10);
    expect(st.player.spark).toBe(sparkBefore);
    expect(s.events()).toContainEqual({ type: 'history.told', methodId: 'ask_past@harold_finch' });
    expect(presentJuice('history.told', told!.p)).toMatchObject({ kind: 'line', personId: 'harold_finch', line: told!.p.line });
    expect(st.historyTold?.harold_finch).toHaveLength(1);
  }, 60_000);

  it('told beats survive save/load; history is rebuilt for saves that never had it', () => {
    const s = session();
    s.act('ask_past@harold_finch');
    const blob = s.saveBlob()!;
    expect(blob.sim?.history).toBeUndefined(); // rebuilt from the seed, never saved
    expect(blob.sim?.historyTold).toBeTruthy();
    const old = structuredClone(blob);
    delete (old.sim as Record<string, unknown>).history;
    delete (old.sim as Record<string, unknown>).historyTold;
    const t = session();
    t.loadBlob(blob);
    expect(t.getState()!.historyTold?.harold_finch).toEqual(s.getState()!.historyTold?.harold_finch);
    expect(t.getState()!.history).toEqual(s.getState()!.history);
    t.loadBlob(old);
    expect(t.getState()!.history).toEqual(s.getState()!.history);
    expect(t.listActions().some((a) => a.id === 'ask_past@harold_finch')).toBe(true);
  }, 60_000);

  it('a history line reaches dawn on some days of a real run', () => {
    const s = session(7);
    const st = s.getState()!;
    let heard = 0;
    for (let d = 0; d < 20; d++) {
      s.tick();
      if (collectDawnLines(st).some((l) => /telling the children|at the fire|by the well|told the story/.test(l))) heard++;
    }
    expect(heard).toBeGreaterThan(0);
  }, 60_000);
});

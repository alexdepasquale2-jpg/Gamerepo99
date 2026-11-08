import { describe, expect, it } from 'vitest';
import '../../../src/sim/contrib';
import { collectDawnLines } from '../../../src/sim/dawn-lines';
import { carryItOn, ensureLegacy, tickInheritedDependence } from '../../../src/sim/legacy';
import { inheritedDependenceLines } from '../../../src/sim/contrib/inner-state';
import { actMethod } from '../../../src/sim/play-session/play-session-act';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import type { SimState } from '../../../src/sim/types/runtime';
import { bondedState, burnOut } from '../legacy/helpers';

type J = { id: string; p: Record<string, unknown> };
function capture(state: SimState): J[] {
  const out: J[] = [];
  const bus = state.bus as { emit?: (e: string, p: unknown) => void };
  const inner = bus.emit;
  bus.emit = (e, p) => {
    inner?.(e, p);
    out.push({ id: e, p: (p ?? {}) as Record<string, unknown> });
  };
  return out;
}

const act = (state: SimState, rt: unknown, id: string): void =>
  actMethod(state, id, [], undefined, { interactionCompat: rt as never });

describe('person.wound: method vs wound chemistry rides out of a live act', () => {
  it('carry on exhaustion is deep; challenge on fear slides off (methods.json effectiveness)', () => {
    const { state, interactionRt } = bootPlayState(7, 'marrow');
    const got = capture(state);
    act(state, interactionRt, 'carry_burden@harold_finch');
    act(state, interactionRt, 'challenge@jonah_pike');
    const wounds = got.filter((j) => j.id === 'person.wound').map((j) => [j.p.personId, j.p.woundId, j.p.woundMul]);
    expect(wounds).toContainEqual(['harold_finch', 'exhaustion', 1.5]);
    expect(wounds).toContainEqual(['jonah_pike', 'fear', 0.5]);
    // Chemistry comes before the person's own reaction line.
    const ids = got.map((j) => j.id);
    expect(ids.indexOf('person.wound')).toBeLessThan(ids.indexOf('person.reaction'));
  });

  it('is deterministic for a seed', () => {
    const run = (): string => {
      const { state, interactionRt } = bootPlayState(11, 'marrow');
      const got = capture(state);
      act(state, interactionRt, 'inspire@elias_boone');
      act(state, interactionRt, 'challenge@marta_ellison');
      return JSON.stringify(got.filter((j) => j.id === 'person.wound' || j.id === 'mark.applied'));
    };
    expect(run()).toBe(run());
  });
});

describe('status.gain carries the town so the crowd can say it', () => {
  it('civic_voice gain names the town of the stand-up', () => {
    const { state, interactionRt } = bootPlayState(7, 'marrow');
    const got = capture(state);
    const townId = 'ashford';
    const folk = Object.values(state.people).filter((p) => p.townId === townId).slice(0, 3);
    expect(folk).toHaveLength(3);
    for (const p of folk) p.flame = 0;
    for (const p of folk) act(state, interactionRt, `challenge@${p.id}`);
    expect(state.player.statusTraits).toContain('civic_voice');
    expect(got.find((j) => j.id === 'status.gain')?.p).toMatchObject({ traitId: 'civic_voice', townId });
  });
});

describe('inherited dependence at dawn', () => {
  const heir = (): SimState => {
    const { state, pid } = bondedState();
    ensureLegacy(state).bonds[pid] = { events: { dependence_stack: 20, carry_completed: 1 }, resentment: 0 };
    burnOut(state);
    carryItOn(state);
    state.player.spark = 50;
    return state;
  };

  it('while held, someone in town names it and the life before', () => {
    const state = heir();
    expect(state.player.statusTraits).toContain('inherited_dependence');
    const lines = inheritedDependenceLines(state);
    expect(lines).toHaveLength(1);
    const prev = ensureLegacy(state).lineage.at(-1)!.imprint.displayName;
    expect(lines[0]).toContain(prev);
    expect(lines[0]).toMatch(/lean|reach/);
    expect(collectDawnLines(state)).toContain(lines[0]);
  });

  it('the dawn it lets go says so once, then goes quiet', () => {
    const state = heir();
    state.player.spark = 90;
    expect(tickInheritedDependence(state)).toBe(true);
    expect(ensureLegacy(state).dependenceResolvedDay).toBe(state.day);
    const lines = inheritedDependenceLines(state);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/own|steadied/);
    expect(collectDawnLines(state)).toContain(lines[0]);
    state.day += 1;
    expect(inheritedDependenceLines(state)).toEqual([]);
  });

  it('a life without it hears nothing', () => {
    const { state } = bootPlayState(7, 'marrow');
    expect(inheritedDependenceLines(state)).toEqual([]);
  });
});

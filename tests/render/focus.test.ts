import { describe, it, expect } from 'vitest';
import { KIND_PRIORITY, TIE_PX, focusScore, pickFocus, type FocusCandidate } from '../../src/render/interact/focus';

const me = { x: 100, y: 100 };
const down = { dx: 0, dy: 1 };
const c = (kind: FocusCandidate['kind'], id: string, x: number, y: number, reach = 60): FocusCandidate => ({ kind, id, x, y, reach });

describe('focus resolver', () => {
  it('nothing in reach: no focus', () => {
    expect(pickFocus([c('node', 'n', 300, 300)], me, down)).toBeNull();
    expect(pickFocus([], me, down)).toBeNull();
  });

  it('each thing has its own reach', () => {
    expect(pickFocus([c('node', 'n', 140, 100, 30)], me, down)).toBeNull();
    expect(pickFocus([c('node', 'n', 140, 100, 50)], me, down)?.id).toBe('n');
  });

  it('the nearest thing wins', () => {
    const got = pickFocus([c('hearth', 'h', 100, 120), c('person', 'p', 100, 140), c('node', 'n', 100, 150)], me, down);
    expect(got?.id).toBe('h');
  });

  it('a thing in front beats a nearer thing behind you', () => {
    const behind = c('person', 'behind', 100, 80); // 20 px, against the facing
    const ahead = c('node', 'ahead', 100, 126); // 26 px, in front
    expect(pickFocus([behind, ahead], me, down)?.id).toBe('ahead');
    // Turn around and the other one is in front.
    expect(pickFocus([behind, ahead], me, { dx: 0, dy: -1 })?.id).toBe('behind');
    expect(focusScore(behind, me, down)).toBeGreaterThan(focusScore(ahead, me, down));
  });

  it('ties (within TIE_PX) go by kind priority: board and signpost first, the hearth last', () => {
    const person = c('person', 'p', 100, 130);
    const board = c('board', 'b', 100, 130 + TIE_PX - 1);
    const hearth = c('hearth', 'h', 100, 132);
    expect(pickFocus([person, hearth, board], me, down)?.kind).toBe('board');
    expect(pickFocus([person, hearth], me, down)?.kind).toBe('person');
    expect(KIND_PRIORITY.indexOf('door')).toBeLessThan(KIND_PRIORITY.indexOf('person'));
    expect(KIND_PRIORITY.indexOf('person')).toBeLessThan(KIND_PRIORITY.indexOf('node'));
    expect(KIND_PRIORITY.at(-1)).toBe('hearth');
  });

  it('a node right beside a person never steals E from them (the old "E gather" bug)', () => {
    // Before: the node prompt showed while E opened the person. Now one focus decides both.
    const person = c('person', 'p', 100, 124);
    const node = c('node', 'n', 104, 126);
    expect(pickFocus([node, person], me, down)?.kind).toBe('person');
  });

  it('same scene, same answer: ties of one kind settle by id', () => {
    const a = c('node', 'a', 100, 130), b = c('node', 'b', 100, 130);
    expect(pickFocus([b, a], me, down)?.id).toBe('a');
    expect(pickFocus([a, b], me, down)?.id).toBe('a');
  });

  it('standing still (no facing) is plain distance', () => {
    expect(pickFocus([c('node', 'far', 100, 140), c('node', 'near', 100, 80)], me, { dx: 0, dy: 0 })?.id).toBe('near');
  });
});

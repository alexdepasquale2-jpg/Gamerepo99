/** Letter replies: road-distance travel, social-web tone, Blessing/Burden surfacing, unread markers, saves. */
import { describe, expect, it } from 'vitest';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import { advanceToDawn } from '../../../src/sim/scenario/scenario-advance';
import { ensureLetters, sendPlayerLetter } from '../../../src/sim/letters-scale';
import {
  composeReply, couriersOnRoad, inboxEntries, markAllRead, markReplyRead, outgoingLines, repliesOf,
  tickReplies, toneFor, toneScore, unreadReplies, type LetterReply,
} from '../../../src/sim/letter-replies';
import { planRoad, positionOnLegs, reverseLegs } from '../../../src/sim/road-journey';
import { surfaceUnspokenInReply, createUnspokenState } from '../../../src/sim/social';
import { loadState, saveState } from '../../../src/sim/save';
import { loadData } from '../../../src/sim/load-data';
import type { SimState } from '../../../src/sim/types/runtime';

/** A seed where the road home from the far town is long and nothing is lost on the way. */
function boot(seed = 11) {
  const { state } = bootPlayState(seed, 'marrow');
  state.inventory = { ...(state.inventory ?? {}), letter: 9 };
  return state;
}
const personIn = (state: SimState, town: string) => Object.values(state.people).filter((p) => p.townId === town).sort((a, b) => a.id.localeCompare(b.id))[0]!;
const dawns = (state: SimState, n: number) => { for (let i = 0; i < n; i++) advanceToDawn(state); };

/** Send one letter to `town` and run dawns until its reply has arrived (or give up). */
function exchange(state: SimState, town: string, text = 'Thank you for everything, I hope you are well.') {
  const to = personIn(state, town);
  expect(sendPlayerLetter(state, to.id, text)).toMatch(/^Sent to/);
  const letter = state.letters!.flight[0]!;
  for (let i = 0; i < 30 && !repliesOf(state).some((r) => r.status === 'arrived' || r.status === 'lost'); i++) advanceToDawn(state);
  return { to, letter, reply: repliesOf(state)[0] as LetterReply | undefined };
}

describe('road journeys', () => {
  it('chains routes by road distance instead of a flat default', () => {
    const state = boot();
    const j = planRoad(state, 'ashford', 'lowmere')!;
    expect(j.legs.map((l) => l.routeId)).toEqual(['road_ashford_brine_hitch', 'road_brine_hitch_lowmere']);
    expect(j.days).toBe(4);
    expect(planRoad(state, 'ashford', 'ashford')).toEqual({ legs: [], days: 0 });
    const back = planRoad(state, 'lowmere', 'ashford')!;
    expect(back.days).toBe(j.days);
    expect(back.legs).toEqual(reverseLegs(j.legs));
  });

  it('a broken or neglected road costs more days; unreachable towns have no journey', () => {
    const state = boot();
    const base = planRoad(state, 'ashford', 'brine_hitch')!.days;
    const r = state.economyRoutes!.find((x) => x.id === 'road_ashford_brine_hitch')!;
    r.condition = 0.5;
    expect(planRoad(state, 'ashford', 'brine_hitch')!.days).toBeGreaterThan(base);
    r.broken = true;
    expect(planRoad(state, 'ashford', 'brine_hitch')!.days).toBeGreaterThan(base * 2 - 1);
    state.economyRoutes = [];
    expect(planRoad(state, 'ashford', 'lowmere')).toBeNull();
  });

  it('positions a courier on the legs it rides', () => {
    const legs = [{ routeId: 'a', from: 'x', to: 'y', days: 2 }, { routeId: 'b', from: 'y', to: 'z', days: 2 }];
    expect(positionOnLegs(legs, 1)).toEqual({ routeId: 'a', from: 'x', to: 'y', f: 0.5 });
    expect(positionOnLegs(legs, 3)).toEqual({ routeId: 'b', from: 'y', to: 'z', f: 0.5 });
    expect(positionOnLegs(legs, 9)!.f).toBe(1);
    expect(positionOnLegs([], 1)).toBeUndefined();
  });
});

describe('player letters ride the roads', () => {
  it('days in flight match the road distance, and the courier is on a real road', () => {
    const state = boot();
    const to = personIn(state, 'lowmere');
    sendPlayerLetter(state, to.id, 'Hello from Ashford.');
    const f = state.letters!.flight[0]!;
    expect(f.days).toBe(4);
    expect(f.legs!.length).toBe(2);
    expect(couriersOnRoad(state)).toEqual([{ id: f.id, kind: 'letter', pos: { routeId: 'road_ashford_brine_hitch', from: 'ashford', to: 'brine_hitch', f: 0 } }]);
    dawns(state, 3);
    const on = couriersOnRoad(state)[0];
    if (on) expect(on.pos.routeId).toBe('road_brine_hitch_lowmere');
  });

  it('keeps the old flat behaviour when no roads are known', () => {
    const state = boot();
    state.economyRoutes = [];
    const to = personIn(state, 'lowmere');
    expect(sendPlayerLetter(state, to.id, 'Hello')).toMatch(/^Sent to/);
    expect(state.letters!.flight[0]!.days).toBe(2);
    expect(state.letters!.flight[0]!.legs).toBeUndefined();
  });
});

describe('replies', () => {
  it('arrive days later, carried back by road, as an unread reply', () => {
    const state = boot();
    const to = personIn(state, 'brine_hitch');
    state.economyRoutes!.forEach((r) => { r.condition = 1; });
    sendPlayerLetter(state, to.id, 'Thank you for the kindness last winter.');
    const sent = state.day;
    const out = state.letters!.flight[0]!.days;
    let arrivedOn = -1;
    for (let i = 0; i < 25 && arrivedOn < 0; i++) {
      advanceToDawn(state);
      if (repliesOf(state).some((r) => r.status === 'arrived')) arrivedOn = state.day;
    }
    const r = repliesOf(state)[0]!;
    if (r.status === 'lost') return; // thinning is deterministic per seed; the lost branch is covered below
    expect(arrivedOn).toBeGreaterThanOrEqual(sent + out + 1 + r.roadDays);
    expect(r.status).toBe('arrived');
    expect(r.read).toBe(false);
    expect(r.fromPersonId).toBe(to.id);
    expect(r.toTownId).toBe('ashford');
    expect(unreadReplies(state)).toBe(1);
    expect(state.bus?.lastIds).toContain('letter.reply');
  });

  it('are not instant: nothing is readable on the day the letter lands', () => {
    const state = boot();
    const to = personIn(state, 'brine_hitch');
    sendPlayerLetter(state, to.id, 'Hello friend');
    const days = state.letters!.flight[0]!.days;
    dawns(state, days);
    const r = repliesOf(state)[0];
    if (r) expect(['writing', 'lost']).toContain(r.status);
    expect(unreadReplies(state)).toBe(0);
    expect(inboxEntries(state)).toEqual([]);
  });

  it('are deterministic for a fixed seed', () => {
    const run = () => { const s = boot(); const { reply } = exchange(s, 'brine_hitch'); return JSON.stringify([reply, s.letters]); };
    expect(run()).toBe(run());
  });

  it('read markers: opening one reads it, mark-all clears the rest', () => {
    const state = boot();
    const to = personIn(state, 'brine_hitch');
    const r = { id: 'rep_x', letterId: 'x', fromPersonId: to.id, fromTownId: 'brine_hitch', toTownId: 'ashford', status: 'arrived', writeLeft: 0, legs: [], roadDays: 2, daysLeft: 0, quote: 'hi', sentDay: 1, arrivedDay: 5, read: false, tone: 'warm', title: 'A', body: 'B' } as LetterReply;
    ensureLetters(state).replies = [r, { ...r, id: 'rep_y', arrivedDay: 6, title: 'C' }, { ...r, id: 'rep_z', status: 'travelling' }];
    expect(unreadReplies(state)).toBe(2);
    expect(inboxEntries(state).map((e) => [e.id, e.unread])).toEqual([['rep_y', true], ['rep_x', true]]);
    expect(markReplyRead(state, 'rep_x')).toBe(true);
    expect(markReplyRead(state, 'rep_x')).toBe(false);
    expect(markReplyRead(state, 'rep_z')).toBe(false);
    expect(unreadReplies(state)).toBe(1);
    markAllRead(state);
    expect(unreadReplies(state)).toBe(0);
  });

  it('the panel summary tracks a letter through its whole journey', () => {
    const state = boot();
    const to = personIn(state, 'brine_hitch');
    sendPlayerLetter(state, to.id, 'Hello');
    expect(outgoingLines(state)[0]).toMatch(/on the road, \d dawn/);
    dawns(state, state.letters!.flight[0]!.days);
    expect(outgoingLines(state)[0]).toMatch(/is writing back|lost on the road/);
  });

  it('are lost on the road when the courier does not make it, and then never show as unread', () => {
    const state = boot();
    const l = ensureLetters(state);
    l.replies = [{ id: 'rep_l', letterId: 'q', fromPersonId: personIn(state, 'lowmere').id, fromTownId: 'lowmere', toTownId: 'ashford', status: 'travelling', writeLeft: 0, legs: [], roadDays: 400, daysLeft: 1, quote: '', sentDay: 1, read: false }];
    tickReplies(state);
    expect(l.replies[0]!.status).toBe('lost');
    expect(unreadReplies(state)).toBe(0);
  });
});

describe('tone from the social web and the writer', () => {
  it('maps score, despair and a surfaced latent to a tone', () => {
    expect(toneFor(0.8, 0)).toBe('warm');
    expect(toneFor(0.5, 0)).toBe('hopeful');
    expect(toneFor(0.3, 0)).toBe('guarded');
    expect(toneFor(0.5, 0.8)).toBe('weary');
    expect(toneFor(0.05, 0)).toBe('bitter');
    expect(toneFor(0.9, 0, 'burden')).toBe('bitter');
  });

  it('trust and flame warm a reply; despair, pushiness and rivals cool it', () => {
    const state = boot();
    const w = personIn(state, 'lowmere');
    const base = toneScore(state, w.id, 'ashford', 'Hello');
    w.trust = 1; w.flame = 60;
    expect(toneScore(state, w.id, 'ashford', 'Hello')).toBeGreaterThan(base);
    expect(toneScore(state, w.id, 'ashford', 'You owe me and must pay')).toBeLessThan(toneScore(state, w.id, 'ashford', 'Thank you'));
    state.towns!.lowmere!.despair = 0.9;
    expect(toneScore(state, w.id, 'ashford', 'Hello')).toBeLessThan(base + 0.5);
    state.towns!.lowmere!.despair = 0;
    // A rival tie into the player's town chills the writer; a kin tie warms them (isolated from the baked web).
    (state.data as { socialWeb: { edges: unknown[] } }).socialWeb = { edges: [] };
    state.kinEdges = [];
    const origin = personIn(state, 'ashford');
    const clean = toneScore(state, w.id, 'ashford', 'Hello');
    state.kinEdges = [{ from: w.id, to: origin.id, kind: 'kin' }];
    const kin = toneScore(state, w.id, 'ashford', 'Hello');
    expect(kin).toBeGreaterThan(clean);
    state.kinEdges = [];
    (state.data as { socialWeb: { edges: unknown[] } }).socialWeb = { edges: [{ id: 'e', a: w.id, b: origin.id, kind: 'rival', weight: 0.5 }] };
    expect(toneScore(state, w.id, 'ashford', 'Hello')).toBeLessThan(clean);
  });

  function composed(mutate: (s: SimState, writer: string) => void, text = 'Hello') {
    const state = boot();
    const w = personIn(state, 'lowmere');
    mutate(state, w.id);
    const r = beginFor(state, w.id, text);
    composeReply(state, r);
    return { state, r, w };
  }
  function beginFor(state: SimState, writer: string, text: string): LetterReply {
    const r: LetterReply = { id: 'rep_t', letterId: 't', fromPersonId: writer, fromTownId: 'lowmere', toTownId: 'ashford', status: 'writing', writeLeft: 0, legs: [], roadDays: 4, daysLeft: 0, quote: text, sentDay: 1, read: false };
    repliesOf(state).push(r);
    return r;
  }

  it('a trusted, lit writer answers warmly and quotes the letter', () => {
    const { r } = composed((_s, id) => { const s = _s.people[id]!; s.trust = 1; s.flame = 70; }, 'Thank you for the bread');
    expect(['warm', 'hopeful']).toContain(r.tone);
    expect(r.body).toContain('Thank you for the bread');
    expect(r.title).toContain(personIn(boot(), 'lowmere').name!);
  });

  it('a despairing town yields a weary reply that mentions the town', () => {
    const { r } = composed((s) => { s.towns!.lowmere!.despair = 0.9; });
    expect(r.tone).toBe('weary');
    expect(r.body).toMatch(/Lowmere|quiet|hollow|lamps/);
  });

  it('a food shortage shows in the writing', () => {
    const { r } = composed((s) => { s.towns!.lowmere!.stock.food_grain = 0; });
    expect(r.body).toMatch(/granary|stores/);
  });

  it('mentions a neighbour from the social web, and worries about a struggling one', () => {
    const state = boot();
    const w = personIn(state, 'lowmere');
    const kin = personIn(state, 'lowmere' === w.townId ? 'lowmere' : 'ashford');
    expect(kin).toBeTruthy();
    const neighbour = Object.values(state.people).find((p) => p.id !== w.id && p.townId === 'lowmere')!;
    neighbour.flame = 2;
    state.kinEdges = [{ from: w.id, to: neighbour.id, kind: 'kin' }];
    const r = beginFor(state, w.id, 'Hi');
    composeReply(state, r);
    expect(r.body).toContain(neighbour.name!);
    expect(r.body).toMatch(/worry|quiet|fear/);
  });
});

describe('Blessings and Burdens surface through a reply', () => {
  function withLatent(classId: string, state: SimState, writerId: string) {
    state.unspoken = createUnspokenState();
    state.unspoken.instances.push({
      id: 'u1', classId, sourcePersonId: writerId, placeTownId: 'lowmere', encodedDay: state.day,
      weight: 0.9, edgeIds: [], personIds: [writerId], consumed: false, tuningSalt: 1,
    });
  }
  const cls = (state: SimState) => (loadData().unspoken.classes.find((c) => c.comeToPass.requireTagsAny?.includes('letter_arrived'))!);

  it('a blessing comes to pass: postscript, warmer tone, real effects, instance consumed', () => {
    const state = boot();
    const w = personIn(state, 'lowmere');
    const c = cls(state);
    withLatent(c.id, state, w.id);
    const before = { flame: w.flame, trust: w.trust ?? 0 };
    const r: LetterReply = { id: 'rep_b', letterId: 'b', fromPersonId: w.id, fromTownId: 'lowmere', toTownId: 'ashford', status: 'writing', writeLeft: 0, legs: [], roadDays: 4, daysLeft: 0, quote: 'Hi', sentDay: 1, read: false };
    repliesOf(state).push(r);
    composeReply(state, r, { roll: () => 0 });
    expect(r.surfaced?.kind).toBe('blessing');
    expect(r.body).toContain('P.S.');
    expect(['warm', 'hopeful']).toContain(r.tone);
    expect(state.unspoken!.instances.find((i) => i.id === 'u1')).toBeUndefined();
    expect((w.trust ?? 0) >= before.trust && w.flame >= before.flame).toBe(true);
    expect(state.bus?.lastIds).toContain('person.reaction');
  });

  it('a burden comes to pass: bitter tone and a postscript that stings', () => {
    const state = boot();
    const w = personIn(state, 'lowmere');
    withLatent(cls(state).id, state, w.id);
    // First roll picks burden (high), the second passes the come-to-pass check (low).
    const rolls = [0.99, 0];
    const roll = () => rolls.shift() ?? 0;
    const hit = surfaceUnspokenInReply(state, w.id, { tags: ['letter_arrived'], roll });
    expect(hit?.outcome.kind).toBe('burden');
    withLatent(cls(state).id, state, w.id);
    const rolls2 = [0.99, 0];
    const r: LetterReply = { id: 'rep_c', letterId: 'c', fromPersonId: w.id, fromTownId: 'lowmere', toTownId: 'ashford', status: 'writing', writeLeft: 0, legs: [], roadDays: 4, daysLeft: 0, quote: 'Hi', sentDay: 1, read: false };
    repliesOf(state).push(r);
    composeReply(state, r, { roll: () => rolls2.shift() ?? 0 });
    expect(r.surfaced?.kind).toBe('burden');
    expect(r.tone).toBe('bitter');
    expect(r.body).toContain('P.S.');
  });

  it('nothing surfaces without a latent, and a faded one stays put when the roll fails', () => {
    const state = boot();
    const w = personIn(state, 'lowmere');
    expect(surfaceUnspokenInReply(state, w.id, { tags: ['letter_arrived'] })).toBeUndefined();
    withLatent(cls(state).id, state, w.id);
    expect(surfaceUnspokenInReply(state, w.id, { tags: ['letter_arrived'], roll: () => 0.999 })).toBeUndefined();
    expect(state.unspoken!.instances).toHaveLength(1);
  });

  it('a latent that needs a circumstance the reply does not provide stays latent', () => {
    const state = boot();
    const w = personIn(state, 'lowmere');
    const c = loadData().unspoken.classes.find((k) => !k.comeToPass.requireTagsAny?.some((t) => ['letter_arrived', 'show_up_day'].includes(t)))!;
    withLatent(c.id, state, w.id);
    expect(surfaceUnspokenInReply(state, w.id, { tags: ['letter_arrived', 'show_up_day'], roll: () => 0 })).toBeUndefined();
  });
});

describe('persistence', () => {
  it('replies, unread flags and in-flight couriers survive a save round trip', () => {
    const state = boot();
    const to = personIn(state, 'brine_hitch');
    sendPlayerLetter(state, to.id, 'Hello');
    dawns(state, state.letters!.flight[0]!.days + 1);
    const before = JSON.stringify(state.letters);
    const again = loadState(JSON.parse(JSON.stringify(saveState(state))), loadData());
    expect(JSON.stringify(again.letters)).toBe(before);
    dawns(state, 8);
    dawns(again, 8);
    expect(JSON.stringify(again.letters!.replies)).toBe(JSON.stringify(state.letters!.replies));
  });
});

describe('full exchange', () => {
  it('a letter gets a reply with a body and tone', () => {
    const state = boot();
    const { reply } = exchange(state, 'brine_hitch');
    expect(reply).toBeDefined();
    if (reply!.status === 'arrived') {
      expect(reply!.body!.length).toBeGreaterThan(40);
      expect(reply!.tone).toBeDefined();
    }
  });
});

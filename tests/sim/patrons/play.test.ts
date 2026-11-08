import { describe, expect, it } from 'vitest';
import { createPlaySession } from '../../../src/sim';
import type { PlaySession } from '../../../src/sim/play-session/play-session';
import { collectDawnLines } from '../../../src/sim/dawn-lines';
import { ensureHoard } from '../../../src/sim/hoard';
import { patronSeat, patronTable } from '../../../src/sim/patrons';
import { offerLine, patronDawnLines } from '../../../src/sim/contrib/patrons';
import { presentJuice } from '../../../src/ui/surface';

function session(): PlaySession {
  const s = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' }) as PlaySession;
  s.start({ seed: 42, archetypeId: 'marrow' });
  return s;
}
const chips = (s: PlaySession, personId: string) => s.listActions().filter((a) => a.id.endsWith('@' + personId));
const wardens = (s: PlaySession) => patronTable(s.getState()!)!.patrons.find((p) => p.id === 'patron_strand_wardens')!;

describe('patron deals in play (seed 42)', () => {
  it('a patron whose authored town is absent sits with its doctrine leader', () => {
    const s = session();
    const st = s.getState()!;
    expect(st.people.leon_march!.townId).toBe('peat_ladder');
    expect(patronSeat(st, wardens(s))).toBe('peat_ladder');
  });

  it('only voices in a patron seat broker; accept chips wait on a name', () => {
    const s = session();
    const st = s.getState()!;
    const leon = chips(s, 'leon_march');
    expect(leon).toContainEqual({ id: 'hear_patron_strand_wardens@leon_march', family: 'deed', label: 'Hear the Wardens offer' });
    expect(leon.some((a) => a.id.startsWith('patron_accept'))).toBe(false);
    // Not a voice / not in a seat: nothing.
    const other = Object.keys(st.people).find((id) => st.people[id]!.townId === 'peat_ladder' && !st.people[id]!.tags?.length)!;
    expect(chips(s, other).some((a) => a.id.includes('patron'))).toBe(false);
    const elsewhere = Object.keys(st.people).find((id) => st.people[id]!.townId === 'marrow_den')!;
    expect(chips(s, elsewhere).some((a) => a.id.includes('patron'))).toBe(false);
    ensureHoard(st).notoriety = 0.5;
    expect(chips(s, 'leon_march')).toContainEqual({ id: 'patron_accept_warden_guard@leon_march', family: 'deed', label: 'Accept the Wardens deal (caravan)' });
  });

  it('hearing the offer surfaces the broker saying the real terms', () => {
    const s = session();
    const st = s.getState()!;
    const seen: { id: string; p: unknown }[] = [];
    s.onJuice((id, p) => seen.push({ id, p }));
    s.act('hear_patron_strand_wardens@leon_march');
    const closed = seen.find((e) => e.id === 'patron.offer')!;
    expect(presentJuice(closed.id, closed.p)).toMatchObject({ personId: 'leon_march', kind: 'line' });
    expect((closed.p as { line: string }).line).toMatch(/Strand Road Wardens/);
    ensureHoard(st).notoriety = 0.5;
    expect(offerLine(st, wardens(s), 'leon_march')).toBe(
      'The Strand Road Wardens offers 15 coin and 2 timber for the town stores, if you ride guard on their caravan within 4 days.',
    );
  });

  it('accept then deliver changes deal state, with townsfolk noticing', () => {
    const s = session();
    const st = s.getState()!;
    ensureHoard(st).notoriety = 0.5;
    const seen: { id: string; p: unknown }[] = [];
    s.onJuice((id, p) => seen.push({ id, p }));
    s.act('patron_accept_warden_guard@leon_march');
    expect(st.patronDeals?.deal_warden_guard_caravan?.status).toBe('active');
    expect(st.player.coin).toBe(15);
    const deal = seen.find((e) => e.id === 'patron.deal')!;
    const line = presentJuice(deal.id, deal.p, { nearbyPersonId: (t) => (t === 'peat_ladder' ? 'tom' : undefined) });
    expect(line).toMatchObject({ personId: 'tom', kind: 'line' });
    expect(line!.line).not.toMatch(/\{patron\}/);
    // Taken: no second accept; deliver is on offer.
    const now = chips(s, 'leon_march');
    expect(now.some((a) => a.id.startsWith('patron_accept_warden_guard'))).toBe(false);
    expect(now).toContainEqual({ id: 'patron_guard_warden_caravan@leon_march', family: 'deed', label: 'Deliver on the deal (caravan)' });
    s.act('patron_guard_warden_caravan@leon_march');
    expect(st.patronDeals!.deal_warden_guard_caravan!.status).toBe('fulfilled');
    expect(seen.some((e) => e.id === 'patron.fulfilled')).toBe(true);
    expect(chips(s, 'leon_march').some((a) => a.id.startsWith('patron_guard'))).toBe(false);
  });

  it('a tithe is only deliverable with the coin in hand', () => {
    const s = session();
    const st = s.getState()!;
    ensureHoard(st).notoriety = 0.5;
    const ruth = 'ruth_calder';
    expect(chips(s, ruth).map((a) => a.label)).toContain('Accept the Mill Trust deal (tithe)');
    s.act(`patron_accept_mill_tithe@${ruth}`);
    expect(st.patronDeals?.deal_mill_tithe_coin?.status).toBe('active');
    st.player.coin = 5;
    expect(chips(s, ruth).some((a) => a.id.startsWith('patron_pay_mill_tithe'))).toBe(false);
    st.player.coin = 30;
    expect(chips(s, ruth).some((a) => a.id.startsWith('patron_pay_mill_tithe'))).toBe(true);
    s.act(`patron_pay_mill_tithe@${ruth}`);
    expect(st.patronDeals!.deal_mill_tithe_coin!.status).toBe('fulfilled');
    expect(st.player.coin).toBe(20);
  });

  it('dawn brings the man asking as the deadline nears, then word when it lapses', () => {
    const s = session();
    const st = s.getState()!;
    ensureHoard(st).notoriety = 0.5;
    s.act('patron_accept_warden_guard@leon_march');
    const d = st.patronDeals!.deal_warden_guard_caravan!;
    d.dueDay = st.day + 4;
    const heard: string[][] = [];
    for (let i = 0; i < 4; i++) {
      s.tick();
      heard.push(collectDawnLines(st));
    }
    // Betrayal is a seeded roll; this seed keeps the Wardens honest long enough to lapse.
    expect(heard[0]!.some((l) => l.includes('Wardens'))).toBe(false); // three days out: quiet
    expect(heard[1]!.find((l) => l.includes('Wardens'))).toMatch(/^The Strand Road Wardens' man .*Two days left/);
    expect(heard[2]!.find((l) => l.includes('Wardens'))).toMatch(/One day left/);
    expect(['broken', 'betrayed']).toContain(d.status); // lapsed, or the seeded roll turned them first
    expect(heard[3]!.some((l) => /Wardens/.test(l) && /caravan deal/.test(l))).toBe(true);
  });

  it('dawn lines read each ending', () => {
    const s = session();
    const st = s.getState()!;
    ensureHoard(st).notoriety = 0.5;
    s.act('patron_accept_warden_guard@leon_march');
    const d = st.patronDeals!.deal_warden_guard_caravan!;
    d.dueDay = st.day + 2;
    expect(patronDawnLines(st)).toEqual([expect.stringMatching(/Two days left/)]);
    for (const status of ['betrayed', 'void'] as const) {
      d.status = status;
      d.endedDay = st.day;
      expect(patronDawnLines(st)).toHaveLength(1);
      expect(patronDawnLines(st)[0]).toMatch(/Strand Road Wardens/);
    }
    d.endedDay = st.day - 1;
    expect(patronDawnLines(st)).toEqual([]);
    // Kept by holding back: watched, not chased.
    s.act('patron_accept_mill_deny@ruth_calder');
    st.patronDeals!.deal_mill_deny_reignite!.dueDay = st.day + 1;
    expect(patronDawnLines(st)).toEqual(["The Ashford Mill Trust's man is watching your hands. One day left on the cold hearths deal."]);
  });
});

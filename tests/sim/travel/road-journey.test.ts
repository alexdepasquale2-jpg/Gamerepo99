import { describe, expect, it, vi } from 'vitest';
import { createPlaySession, type PlaySession } from '../../../src/sim';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import { roadViews, runJourney, type RoadView } from '../../../src/sim/travel/journey';
import { loadTravelTrades } from '../../../src/sim/travel/road-trades';
import type { TravelSimState } from '../../../src/sim/travel/travel';
import { addItem, inventoryOf } from '../../../src/sim/goods/inventory';
import { presentJuice } from '../../../src/ui/surface';

// Each test boots whole worlds (~0.2–1s each under load).
vi.setConfig({ testTimeout: 60_000 });

const play = (seed = 42): PlaySession => {
  const s = createPlaySession({ mode: 'play', seed, archetypeId: 'marrow' }) as PlaySession;
  s.start({ seed, archetypeId: 'marrow' });
  return s;
};

/** Move the calendar until some road out of here offers tradeId (offers are seeded per day). */
function findOffer(state: TravelSimState, tradeId: string): RoadView | undefined {
  for (let i = 0; i < 80; i++) {
    const hit = roadViews(state).find((v) => v.offers.some((o) => o.tradeId === tradeId));
    if (hit) return hit;
    state.day += 1;
  }
  return undefined;
}

describe('road hire offers', () => {
  it('are deterministic per seed/day/route, 1–3 per road, and never show lean', () => {
    const a = play().roads();
    const b = play().roads();
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    for (const r of a) {
      expect(r.walkDays).toBeGreaterThanOrEqual(1);
      expect(r.offers.length).toBeGreaterThanOrEqual(1);
      expect(r.offers.length).toBeLessThanOrEqual(3);
      for (const o of r.offers) {
        expect(o.tellLines.length).toBeGreaterThan(0);
        expect(o).not.toHaveProperty('lean');
        expect(o.roleLabel).not.toMatch(/gouger|highwayman|false guide|shortcut/);
      }
    }
    // Another day brings other travellers somewhere.
    const st = bootPlayState(42, 'marrow').state as TravelSimState;
    const day1 = JSON.stringify(roadViews(st));
    const later = [2, 3, 4, 5].map((d) => ((st.day = d), JSON.stringify(roadViews(st))));
    expect(later.some((v) => v !== day1)).toBe(true);
  });

  it('a crook quotes the price and role of the honest trade it poses as', () => {
    const st = bootPlayState(42, 'marrow').state as TravelSimState;
    const road = findOffer(st, 'gouger_cart')!;
    expect(road).toBeDefined();
    const o = road.offers.find((x) => x.tradeId === 'gouger_cart')!;
    expect(o.roleLabel).toBe('a carter');
    const gouger = loadTravelTrades().find((t) => t.id === 'gouger_cart')!;
    expect(o.coin).toBeLessThan(gouger.baseCoin);
  });
});

describe('journeys', () => {
  it('walking runs one world day per road day, moves the player and gains only the road\'s +2', () => {
    const st = bootPlayState(42, 'marrow').state as TravelSimState;
    const road = roadViews(st)[0]!;
    const day0 = st.day;
    const spark0 = st.player.spark;
    let worldDays = 0;
    const res = runJourney(st, road.routeId, { runDay: (s) => { s.day += 1; worldDays++; s.player.spark += 12; } });
    expect(res.ok).toBe(true);
    expect(res.days).toBe(road.walkDays);
    expect(worldDays).toBe(res.days);
    expect(st.day).toBe(day0 + res.days);
    expect(st.player.townId).toBe(road.toId);
    expect(res.lines[0]).toMatch(/on foot/);
    // A hearth's +12 never lands on the road; encounters can only take.
    expect(st.player.spark).toBeLessThanOrEqual(spark0 + 2 * res.days);
  });

  it('session.journey runs the real dawn pipeline and hiring applies the trade', () => {
    const s = play();
    const st = s.getState() as TravelSimState;
    const road = s.roads().find((r) => r.offers.some((o) => o.days < r.walkDays)) ?? s.roads()[0]!;
    const offer = road.offers.reduce((a, b) => (b.days < a.days ? b : a));
    const day0 = s.snapshot().day;
    const spark0 = st.player.spark;
    const res = s.journey(road.routeId, offer.tradeId)!;
    expect(res.ok).toBe(true);
    expect(res.tradeId).toBe(offer.tradeId);
    expect(res.paidSpark + res.paidCoin).toBeGreaterThan(0);
    expect(s.snapshot().day).toBe(day0 + res.days);
    expect(s.snapshot().townId).toBe(road.toId);
    expect(st.player.spark).toBeLessThan(spark0 + 2 * res.days);
    expect(s.events().some((e) => e.type === 'travel')).toBe(true);
    expect(s.roads().every((r) => r.toId !== road.toId)).toBe(true); // roads now lead out of the new town
  });

  it('unknown or unaffordable hires are refused without moving anyone', () => {
    const st = bootPlayState(42, 'marrow').state as TravelSimState;
    const road = roadViews(st)[0]!;
    const here = st.player.townId;
    expect(runJourney(st, road.routeId, { tradeId: 'nobody_here' }).reason).toBe('not_on_offer');
    st.player.spark = 2;
    expect(runJourney(st, road.routeId, { tradeId: road.offers[0]!.tradeId }).reason).toBe('cant_pay');
    expect(st.player.townId).toBe(here);
  });

  it('crooked trades cheat: the gouger overcharges, the posed carter robs, and you know them next time', () => {
    const st = bootPlayState(42, 'marrow').state as TravelSimState;
    const g = findOffer(st, 'gouger_cart')!;
    const quote = g.offers.find((o) => o.tradeId === 'gouger_cart')!;
    const gouged = runJourney(st, g.routeId, { tradeId: 'gouger_cart' });
    expect(gouged.cheat).toBe('overcharged');
    expect(gouged.paidSpark + gouged.paidCoin).toBeGreaterThan(quote.spark + quote.coin);
    expect(gouged.lines.join(' ')).toMatch(/for the axle/);

    const h = findOffer(st, 'highwayman_as_carter')!;
    addItem(st, 'coin', 10 - (inventoryOf(st).coin ?? 0));
    const robbed = runJourney(st, h.routeId, { tradeId: 'highwayman_as_carter' });
    expect(robbed.cheat).toBe('robbed');
    expect(inventoryOf(st).coin ?? 0).toBeLessThan(10);
    expect(robbed.encounters.some((e) => e.id === 'enc_highwayman')).toBe(true);
    expect(st.road?.cheatedBy).toEqual(expect.arrayContaining(['gouger_cart', 'highwayman_as_carter']));

    const again = findOffer(st, 'highwayman_as_carter')!;
    const known = again.offers.find((o) => o.tradeId === 'highwayman_as_carter')!;
    expect(known.known).toBe(true);
    expect(known.roleLabel).toBe('a highwayman');
  });

  it('the false guide strays: more days than quoted', () => {
    const st = bootPlayState(7, 'marrow').state as TravelSimState;
    const r = findOffer(st, 'false_guide')!;
    const quote = r.offers.find((o) => o.tradeId === 'false_guide')!;
    const res = runJourney(st, r.routeId, { tradeId: 'false_guide' });
    expect(res.days).toBeGreaterThan(quote.days);
    expect(res.cheat).toBe('strayed');
  });

  it('encounters emit encounter.spawn and the loud ones surface as a line from someone at the far end', () => {
    const payloads: Array<Record<string, unknown>> = [];
    for (let seed = 1; seed <= 6; seed++) {
      const st = bootPlayState(seed, 'marrow').state as TravelSimState;
      const emit = st.bus!.emit;
      st.bus!.emit = (e, p) => {
        if (e === 'encounter.spawn') payloads.push(p as Record<string, unknown>);
        emit?.(e, p);
      };
      for (let k = 0; k < 3; k++) runJourney(st, roadViews(st)[0]!.routeId);
    }
    expect(payloads.length).toBeGreaterThan(0);
    const loud = payloads.filter((p) => !p.quiet);
    const quiet = payloads.filter((p) => p.quiet);
    expect(loud.length).toBeGreaterThan(0);
    expect(quiet.length).toBeGreaterThan(0);
    const ctx = { nearbyPersonId: () => 'someone' };
    for (const p of loud) {
      const line = presentJuice('encounter.spawn', p, ctx);
      expect(line?.kind).toBe('line');
      expect(line?.line).toBeTruthy();
    }
    expect(presentJuice('encounter.spawn', quiet[0], ctx)).toBeNull();
  });

  it('saves keep road memory, and saves from before roads load', () => {
    const s = play();
    const st = s.getState() as TravelSimState;
    const old = s.saveBlob()!;
    expect((old.sim as { road?: unknown }).road).toBeUndefined();
    s.journey(s.roads()[0]!.routeId);
    expect(st.road?.journeys).toBe(1);
    const blob = s.saveBlob()!;
    const back = play();
    back.loadBlob(blob);
    expect((back.getState() as TravelSimState).road?.journeys).toBe(1);
    const legacy = play();
    legacy.loadBlob(old);
    expect(legacy.roads().length).toBeGreaterThan(0);
    expect(legacy.journey(legacy.roads()[0]!.routeId)?.ok).toBe(true);
  });
});

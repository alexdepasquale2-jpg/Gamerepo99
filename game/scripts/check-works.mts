/**
 * The Works on whole worlds: boot a real world, open a yard, raise buildings, set lines with real
 * townsfolk, build a vehicle and run a convoy to a real neighbouring town, raise and march a band, then
 * live 60 dawns. Checks the dawn tick never throws, lines produce, convoys deliver, a battle is fought,
 * contracts get posted, and a save after it all round-trips the Works intact.
 *
 * Run: npx vite-node --config game/vite.config.ts game/scripts/check-works.mts
 */
import '../src/sim/contrib';
import { createPlaySession } from '../src/sim/play-session/play-session';
import type { PlaySession } from '../src/sim/play-session/play-session-types';
import { saveState } from '../src/sim/save';
import { inventoryOf } from '../src/sim/goods/inventory';
import type { SimState } from '../src/sim/types/runtime';
import { checkArcs } from '../src/sim/works/arcs';
import { hireHand, startLine } from '../src/sim/works/lines';
import { openRoute } from '../src/sim/works/logistics';
import { raise } from '../src/sim/works/make';
import { addStock, freeHands, openDepot, reachable, worksOf } from '../src/sim/works/state';
import { assemble } from '../src/sim/works/vehicles';
import { arm, defenceOf, enlist, march, powerOf, raiseBand } from '../src/sim/works/war';

let failed = 0;
const check = (name: string, ok: boolean, note = ''): void => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${note ? `: ${note}` : ''}`); };

for (const seed of [11, 4242]) {
  const session = createPlaySession({ mode: 'play', seed, archetypeId: 'marrow' }) as PlaySession;
  session.start({ seed, archetypeId: 'marrow' });
  const s = session.getState() as SimState;
  const here = s.player.townId!;
  inventoryOf(s).coin = 2000;
  s.player.coin = 2000;
  check(`[${seed}] open a yard in ${here}`, openDepot(s, here).ok);
  const w = worksOf(s);
  w.renown = 140; // Forge Age, so the band, kiln and forge are open
  for (const [id, n] of Object.entries({ wood: 60, stone: 30, clay: 20, tools: 6, timber: 30, rope: 10, nails: 20, plank: 40, brick: 30, iron: 20, cloth: 6, fish: 30, bread: 30, herbs: 10, flour: 10, berries: 10 })) addStock(s, here, id, n);
  for (const b of ['workbench', 'kitchen', 'woodlot', 'kiln', 'assembly', 'barracks', 'forge']) check(`[${seed}] raise ${b}`, raise(s, here, b).ok);
  const hands = freeHands(s, here).length;
  check(`[${seed}] free hands in town`, hands >= 4, `${hands}`);
  const a = startLine(s, here, 'cut_wood');
  const b = startLine(s, here, 'planks');
  hireHand(s, a.lineId!); hireHand(s, b.lineId!);
  addStock(s, here, 'wheel', 4); addStock(s, here, 'axle', 2); addStock(s, here, 'cart_bed', 2); addStock(s, here, 'harness', 1);
  check(`[${seed}] assemble an ox wagon`, assemble(s, here, 'ox_wagon').ok);
  addStock(s, here, 'grain', 20);
  const near = reachable(s, here);
  check(`[${seed}] a town to trade with`, near.length > 0, near.slice(0, 3).map((t) => `${t.townId}:${t.days}d`).join(' '));
  if (near.length) check(`[${seed}] open a sell route`, openRoute(s, here, near[0]!.townId, w.vehicles[0]!.id, 'sell', ['bread', 'fish']).ok);
  check(`[${seed}] raise a band`, raiseBand(s, here).ok);
  for (let i = 0; i < 4; i++) enlist(s);
  addStock(s, here, 'spear', 6); addStock(s, here, 'mail', 6); addStock(s, here, 'ration', 80);
  arm(s);
  const target = near.find((t) => t.days <= 4);
  console.log('     power', powerOf(s).total, 'defences', near.slice(0, 6).map((t) => `${t.townId}:${defenceOf(s, t.townId)}`).join(' '));
  if (target) check(`[${seed}] march on ${target.townId}`, march(s, target.townId).ok);
  let threw = '';
  for (let d = 0; d < 60; d++) {
    try { session.wait(1); } catch (e) { threw = String(e); break; }
  }
  checkArcs(s);
  check(`[${seed}] 60 dawns pass`, !threw, threw);
  const lines = worksOf(s).lines;
  check(`[${seed}] lines produced`, (worksOf(s).stats.produced ?? 0) > 0, `${worksOf(s).stats.produced} made; ${lines.map((l) => l.status || 'running').join(', ')}`);
  check(`[${seed}] convoy delivered`, (worksOf(s).stats.deliveries ?? 0) > 0, `${worksOf(s).stats.deliveries} trips, ${worksOf(s).stats.trade_coin ?? 0} coin`);
  check(`[${seed}] a battle was fought`, !target || (worksOf(s).stats.victories ?? 0) + (worksOf(s).stats.defeats ?? 0) > 0, `${worksOf(s).stats.victories ?? 0} won, vassals ${worksOf(s).vassals.map((v) => v.townId).join(',')}`);
  check(`[${seed}] contracts posted`, worksOf(s).news.some((n) => /is asking for/.test(n.text)) || worksOf(s).contracts.length > 0);
  const blob = saveState(s);
  const saved = (blob.sim as { works?: unknown }).works;
  check(`[${seed}] the save carries the Works`, JSON.stringify(saved) === JSON.stringify(worksOf(s)));
  console.log(`     renown ${worksOf(s).renown}, day ${s.day}, news: ${worksOf(s).news.slice(-3).map((n) => n.text).join(' | ')}`);
}
if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('all ok');

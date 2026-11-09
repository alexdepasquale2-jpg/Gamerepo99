/** Overview: live vitals, time and world controls, and charts of every recorded dawn. */
import { getWalkMul, setWalkMul } from '../../dev/dev-flags';
import { inventoryOf } from '../../sim/goods/inventory';
import { pushSample, sample } from './history';
import type { God, Tab } from './types';
import { btn, card, el, fmt, row, slider, spark } from './ui';

const PHASES: [string, number][] = [['Dawn', 0.02], ['Morning', 0.2], ['Noon', 0.5], ['Dusk', 0.72], ['Night', 0.88]];

/** Skip whole dawns through the session, then let every area rebuild from the new state. */
export function fastForward(g: God, days: number): void {
  const st = g.state();
  if (!st) return;
  const from = st.day;
  // One dawn at a time, so every skipped day lands in the charts.
  for (let i = 0; i < days; i++) {
    g.ctx.session.wait(1);
    const now = g.state();
    if (!now || now.ended) break;
    pushSample(g.history, sample(now));
  }
  g.ctx.events.emit('state-replaced', {});
  g.ctx.events.emit('dawn', { day: st.day, lines: [] });
  g.commit(`Skipped ${st.day - from} dawn${st.day - from === 1 ? '' : 's'} → day ${st.day}`);
}

function kpi(value: string | number, label: string, tone = ''): HTMLDivElement {
  const k = el('div', 'g-kpi');
  k.append(el('div', `v ${tone}`, typeof value === 'number' ? fmt(value) : value), el('div', 'l', label));
  return k;
}

export const overviewTab: Tab = {
  id: 'overview',
  label: 'Overview',
  render(g, body) {
    const st = g.state();
    if (!st) { body.append(el('p', 'dim', 'No world loaded.')); return; }
    const s = sample(st);
    const kpis = el('div', 'g-kpis');
    kpis.append(
      kpi(s.day, 'Day'),
      kpi(`${Math.round(st.player.spark)}/${st.player.sparkMax ?? 100}`, 'Spark', s.spark < 20 ? 'red' : 'gold'),
      kpi(s.people, 'People'),
      kpi(`${s.lit}`, `Lit (≥${g.threshold()} flame)`, 'green'),
      kpi(s.avgFlame, 'Avg flame'),
      kpi(`${Math.round(s.despair * 100)}%`, 'Avg despair', s.despair > 0.6 ? 'red' : ''),
      kpi(s.goods, 'Goods in stores'),
      kpi(s.carts, 'Carts on road', 'cyan'),
      kpi(s.wars, 'Wars', s.wars ? 'red' : ''),
      kpi(s.plans, 'Builds under way'),
      kpi(s.households, 'Households'),
      kpi(inventoryOf(st).coin ?? 0, 'Your coin', 'gold'),
    );
    body.append(kpis);

    const grid = el('div', 'g-grid');
    // Time
    const phase = g.ctx.world.phase();
    grid.append(card('Time',
      row(btn('Next dawn (rest)', () => { g.ctx.events.emit('overlay', { open: false }); void g.ctx.rest(); g.commit('Resting…'); }, 'hot'),
        ...[1, 7, 30, 100].map((n) => btn(`+${n} dawn${n === 1 ? '' : 's'}`, () => fastForward(g, n)))),
      row(el('span', 'dim', `Phase ${phase.toFixed(2)}`), slider(Math.round(phase * 100), 0, 99, (v) => { g.ctx.world.setPhase(v / 100); g.commit(`Phase ${v / 100}`); })),
      row(...PHASES.map(([l, p]) => btn(l, () => { g.ctx.world.setPhase(p); g.commit(l); }))),
    ));
    // Movement and travel
    const walk = getWalkMul();
    grid.append(card('Movement',
      row(el('span', 'dim', 'Walk speed'), ...[1, 3, 10, 30, 80].map((n) => btn(`${n}×`, () => { setWalkMul(n); g.commit(`Walk ${n}×`); }, walk === n ? 'hot' : ''))),
      el('div', 'dim', 'Go to town'),
      row(...g.ctx.layout.settlements.map((t) => btn(t.id.replace(/_/g, ' '), () => { g.ctx.arriveAt(t.id); g.commit(`Arrived at ${t.id}`); }, t.id === st.player.townId ? 'hot' : ''))),
    ));
    // World-wide levers
    const all = Object.values(st.people);
    grid.append(card('Acts of god',
      row(
        btn('Kindle everyone', () => { for (const p of all) p.flame = Math.max(p.flame, g.threshold() + 10); g.commit('Every hearth is lit'); }),
        btn('Snuff everyone', () => { for (const p of all) p.flame = 0; g.commit('Every flame is out'); }, 'danger'),
      ),
      row(
        btn('+10 flame all', () => { for (const p of all) p.flame += 10; g.commit('+10 flame to all'); }),
        btn('−10 flame all', () => { for (const p of all) p.flame = Math.max(0, p.flame - 10); g.commit('−10 flame to all'); }),
      ),
      row(
        btn('Lift all despair', () => { for (const t of Object.values(st.towns ?? {})) t.despair = 0; g.commit('Despair lifted'); }),
        btn('Max despair', () => { for (const t of Object.values(st.towns ?? {})) t.despair = 1; g.commit('Despair everywhere'); }, 'danger'),
      ),
      row(
        btn('End all wars', () => { for (const w of st.polity?.wars ?? []) if (w.status === 'active') { w.status = 'ended'; w.winner = w.defender; } g.commit('Peace'); }),
        btn('Clear the roads', () => { if (st.logistics) st.logistics.wrecks = []; for (const r of st.economyRoutes ?? []) r.broken = false; g.commit('Roads mended'); }),
      ),
    ));
    body.append(grid);

    const h = g.history;
    const charts = el('div', 'g-grid');
    charts.style.marginTop = '10px';
    const series = (f: (x: typeof h[number]) => number): number[] => h.map(f);
    charts.append(
      card(`History · ${h.length} dawn${h.length === 1 ? '' : 's'}`, spark(series((x) => x.spark), '#F2B84B', 'Spark'), spark(series((x) => x.coin), '#F2B84B', 'Coin')),
      card('People', spark(series((x) => x.avgFlame), '#e08a4f', 'Avg flame'), spark(series((x) => x.lit), '#7fb069', 'Lit'), spark(series((x) => x.people), '#5EC8C8', 'Population')),
      card('Economy', spark(series((x) => x.goods), '#5EC8C8', 'Goods'), spark(series((x) => x.carts), '#5EC8C8', 'Carts'), spark(series((x) => x.plans), '#c9a0dc', 'Builds')),
      card('Strife', spark(series((x) => x.despair * 100), '#d0654f', 'Despair %'), spark(series((x) => x.wars), '#d0654f', 'Wars'), spark(series((x) => x.households), '#7fb069', 'Households')),
    );
    if (h.length < 2) charts.append(el('p', 'dim', 'Charts fill in as dawns pass. Try +30 dawns.'));
    body.append(charts);
  },
};

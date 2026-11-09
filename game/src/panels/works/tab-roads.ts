/** The Roads tab: convoys out of this yard (set up, watch, stand down) and the contracts towns have posted. */
import { goodName } from '../../sim/works/data';
import { closeRoute, fulfil, openRoute } from '../../sim/works/logistics';
import { depotAt, reachable, stockOf, townName, worksIfAny } from '../../sim/works/state';
import { statsOf, vehiclesIn } from '../../sim/works/vehicles';
import { el } from '../dom';
import { btn, row, section, type WorksUi } from './kit';

export function renderRoads(ui: WorksUi, body: HTMLElement): void {
  const { st, town } = ui;
  const w = worksIfAny(st);

  const cons = section('Contracts', 'Towns post what they want. Deliver from your yard in that town (a convoy that hauls in fills them on arrival).');
  const list = w?.contracts ?? [];
  if (!list.length) cons.append(el('p', 'hf-muted hf-small', w && Object.keys(w.depots).length ? 'Nothing posted right now. Towns near your yards post at dawn.' : 'Keep a yard and towns near it will start posting.'));
  for (const c of list) {
    const have = stockOf(st, c.townId)[c.good] ?? 0;
    const yard = !!depotAt(st, c.townId);
    cons.append(row(`${townName(st, c.townId)}: ${c.qty} ${goodName(c.good).toLowerCase()}`, `${c.coin} coin · by day ${c.due} · ${yard ? `your yard there has ${have}` : 'you keep no yard there: haul one in or rent one'}`, [
      btn('Deliver', () => ui.run((x) => fulfil(x, c.id), 'contract'), { disabled: !yard || have < c.qty, hot: true, id: `works-fill-${c.id}` }),
    ]));
  }
  body.append(cons);

  if (!depotAt(st, town)) { body.append(el('p', 'hf-muted', 'Take on a yard here to send convoys from it.')); return; }
  const out = section(`Convoys from ${townName(st, town)}`, 'A vehicle runs the route on its own: loads at dawn, burns its fuel, hauls into your far yard or sells to the far town (food into a hungry town eases it).');
  const routes = (w?.routes ?? []).filter((r) => r.from === town);
  for (const r of routes) {
    const v = w!.vehicles.find((x) => x.id === r.vehicleId);
    const what = r.goods.length ? r.goods.map((g) => goodName(g).toLowerCase()).join(', ') : 'anything in the yard';
    out.append(row(`${v?.name ?? '?'} → ${townName(st, r.to)} (${r.mode})`, `${what} · ${r.trips} trips · ${r.status}${r.on ? '' : ' · standing down'}`, [btn('Stand down', () => ui.run((x) => closeRoute(x, r.id), 'route'), { disabled: !r.on })]));
  }
  const idle = vehiclesIn(st, town).filter((v) => v.job === 'idle');
  if (!idle.length) out.append(el('p', 'hf-muted hf-small', routes.length ? 'Every vehicle here is out working.' : 'No idle vehicle here. Build one in the Garage tab.'));
  else out.append(routeForm(ui, idle.map((v) => ({ id: v.id, label: `${v.name} (cargo ${statsOf(v).cap})` }))));
  body.append(out);
}

function routeForm(ui: WorksUi, vehicles: { id: string; label: string }[]): HTMLElement {
  const { st, town } = ui;
  const box = el('div', 'hf-works-row');
  const sel = (label: string, opts: { v: string; t: string }[]): HTMLSelectElement => {
    const s = el('select', 'hf-works-select', undefined, { 'aria-label': label });
    for (const o of opts) { const e = el('option', '', o.t); e.value = o.v; s.append(e); }
    return s;
  };
  const veh = sel('Vehicle', vehicles.map((v) => ({ v: v.id, t: v.label })));
  const to = sel('To', reachable(st, town).map((t) => ({ v: t.townId, t: `${townName(st, t.townId)} (${t.days}d)${depotAt(st, t.townId) ? ' · your yard' : ''}` })));
  const mode = sel('Mode', [{ v: 'sell', t: 'Sell there' }, { v: 'haul', t: 'Haul to my yard' }]);
  const goods = Object.keys(stockOf(st, town)).sort();
  const what = sel('Cargo', [{ v: '', t: 'Anything in the yard' }, ...goods.map((g) => ({ v: g, t: goodName(g) }))]);
  if (!to.options.length) { box.append(el('p', 'hf-muted hf-small', 'No road leads anywhere from here.')); return box; }
  const go = btn('Send', () => ui.run((x) => openRoute(x, town, to.value, veh.value, mode.value as 'sell' | 'haul', what.value ? [what.value] : []), 'convoy'), { hot: true, id: 'works-send-convoy' });
  const text = el('div', 'hf-works-row__text');
  text.append(el('strong', '', 'New convoy'));
  const acts = el('div', 'hf-works-row__acts');
  acts.append(veh, to, mode, what, go);
  box.append(text, acts);
  return box;
}

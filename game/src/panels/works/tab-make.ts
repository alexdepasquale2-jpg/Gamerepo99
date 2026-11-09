/** The Make tab: hand work and cooking at the yard's buildings, meals to eat, and a town feast. */
import { feast } from '../../sim/works/feast-voyage';
import { BUILDING_BY_ID, GOODS, TUNING, recipeEra, recipeHours } from '../../sim/works/data';
import { eat, make, recipesView } from '../../sim/works/make';
import { depotAt, stockOf } from '../../sim/works/state';
import { el } from '../dom';
import { btn, recipeText, row, section, type WorksUi } from './kit';

export function renderMake(ui: WorksUi, body: HTMLElement): void {
  const { st, town, here } = ui;
  if (!depotAt(st, town)) { body.append(el('p', 'hf-muted', 'Take on a yard here first (Yard tab).')); return; }
  if (town !== here) body.append(el('p', 'hf-note hf-small', 'You are away from this yard: hand work needs you there. Set a line to it instead.'));
  const views = recipesView(st, town);
  if (!views.length) body.append(el('p', 'hf-muted', 'Raise a workbench or a kitchen in the Yard tab to start making things.'));
  const by = new Map<string, typeof views>();
  for (const v of views) by.set(v.row.at, [...(by.get(v.row.at) ?? []), v]);
  for (const [at, list] of by) {
    const s = section(BUILDING_BY_ID.get(at)?.name ?? at);
    for (const v of list) {
      const r = v.row;
      const detail = v.locked ? `Era ${recipeEra(r)}.` : `${recipeText(r.in, r.out)} · ${recipeHours(r)}h${r.spark ? ` · costs ${r.spark} spark` : ''}${r.line === false ? ' · by hand only' : ''}${v.short.length ? ` · short: ${v.short.join(', ')}` : ''}`;
      s.append(row(r.label, detail, [btn(at === 'kitchen' ? 'Cook' : 'Make', () => ui.run((x) => make(x, town, r.id), at === 'kitchen' ? 'cook' : 'make'), { disabled: !v.ok, id: `works-make-${r.id}` })], v.locked ? 'is-locked' : ''));
    }
    body.append(s);
  }

  const stock = stockOf(st, town);
  const meals = GOODS.filter((g) => g.meal && (stock[g.id] ?? 0) > 0);
  if (meals.length) {
    const s = section('At the table', 'Eat here for spark. Rations, hardtack, porridge and stew also feed crews and soldiers.');
    for (const g of meals) s.append(row(`${g.name} ×${stock[g.id]}`, `+${g.meal!.spark} spark${g.meal!.ration ? ' · feeds a hand for a dawn' : ''}`, [btn('Eat', () => ui.run((x) => eat(x, town, g.id), 'eat'), { disabled: town !== here })]));
    body.append(s);
  }
  if (depotAt(st, town)?.buildings.includes('kitchen')) {
    const s = section('A town feast', `${TUNING.feastPlatters} feast platters for the whole town: despair eases, everyone's flame rises, and a vassal that feasts will not rise for a season.`);
    s.append(row('Hold a feast', `The yard has ${stock.feast_platter ?? 0} platters.`, [btn('Hold it', () => ui.run((x) => feast(x, town), 'feast'), { disabled: town !== here || (stock.feast_platter ?? 0) < TUNING.feastPlatters, hot: true, id: 'works-feast' })]));
    body.append(s);
  }
}

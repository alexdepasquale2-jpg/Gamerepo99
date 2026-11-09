/** The Yard tab: open a yard here, stow your satchel, what the yard holds, and its buildings to raise. */
import { goodName, isWorksGood, TUNING } from '../../sim/works/data';
import { buildingsView, raise } from '../../sim/works/make';
import { depotAt, depotCap, depotCount, eraRow, openDepot, stockOf, stowSatchel, takeOut, townName } from '../../sim/works/state';
import { el } from '../dom';
import { btn, row, section, stockList, recipeText, type WorksUi } from './kit';

export function renderYard(ui: WorksUi, body: HTMLElement): void {
  const { st, town, here } = ui;
  const d = depotAt(st, town);
  if (!d) {
    const s = section(`No yard in ${townName(st, town)}`, 'A yard is where the Works lives in a town: stock, buildings, lines and vehicles.');
    const first = depotCount(st) === 0;
    const full = depotCount(st) >= depotCap(st);
    const why = full ? `The ${eraRow(st).name} allows ${depotCap(st)} yards.` : first ? 'Your first yard is free.' : `${TUNING.depotCoin} coin.`;
    s.append(row('Take on a yard', why, [btn(first ? 'Take it on' : `Rent (${TUNING.depotCoin})`, () => ui.run((x) => openDepot(x, town), 'depot'), { disabled: full || town !== here, hot: true, id: 'works-open-depot' })]));
    if (town !== here) s.append(el('p', 'hf-muted hf-small', 'You have to stand in the town to take on a yard there.'));
    body.append(s);
    return;
  }
  const stock = section(`Your yard in ${townName(st, town)}`, town === here ? 'Your satchel counts too when you build or make by hand here.' : 'You are away: lines and convoys still work it.');
  if (town === here) stock.append(row('Stow your satchel', 'Everything but coin, letters, keepsakes and one of each tool.', [btn('Stow', () => ui.run((x) => stowSatchel(x, town), 'stow'), { id: 'works-stow' })]));
  stock.append(stockList(stockOf(st, town), 'The yard is empty. Stow what you carry, or set a line to bring things in.'));
  if (town === here) {
    const takeable = Object.entries(stockOf(st, town)).filter(([id, n]) => n > 0 && !isWorksGood(id)).slice(0, 12);
    if (takeable.length) {
      const acts = el('div', 'hf-works-row__acts');
      for (const [id] of takeable) acts.append(btn(`Take ${goodName(id).toLowerCase()}`, () => ui.run((x) => takeOut(x, town, id), 'take')));
      stock.append(acts);
    }
  }
  body.append(stock);

  const builds = section('Buildings', 'Each building opens recipes (Make tab) and line slots (Lines tab).');
  for (const b of buildingsView(st, town)) {
    const cost = recipeText(b.row.cost, {}).replace(/ → $/, '') + (b.row.coin ? ` + ${b.row.coin} coin` : '');
    const detail = b.built ? b.row.blurb : b.locked ? `Era ${b.row.era}. ${b.row.blurb}` : `${cost}. ${b.row.blurb}${b.short.length ? ` Short: ${b.short.join(', ')}.` : ''}`;
    const buttons = b.built ? [] : [btn('Raise', () => ui.run((x) => raise(x, town, b.row.id), 'raise'), { disabled: b.locked || b.short.length > 0, id: `works-raise-${b.row.id}` })];
    builds.append(row(`${b.row.name}${b.built ? ' ✓' : ''}${b.row.lines ? ` · ${b.row.lines} line${b.row.lines === 1 ? '' : 's'}` : ''}`, detail, buttons, b.built ? 'is-done' : b.locked ? 'is-locked' : ''));
  }
  body.append(builds);
}

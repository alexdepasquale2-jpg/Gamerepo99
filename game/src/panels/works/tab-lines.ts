/** The Lines tab: manufacturing lines in this yard: set one up, take on hands, feed, improve, stop. */
import { BUILDING_BY_ID, RECIPE_BY_ID, TUNING } from '../../sim/works/data';
import { dropHand, hireHand, lineCap, lineChoices, linesIn, scrapLine, startLine, toggleLine, upgradeLine } from '../../sim/works/lines';
import { depotAt, freeHands, personFirst, townName, worksIfAny } from '../../sim/works/state';
import { el } from '../dom';
import { btn, recipeText, row, section, type WorksUi } from './kit';

export function renderLines(ui: WorksUi, body: HTMLElement): void {
  const { st, town } = ui;
  if (!depotAt(st, town)) { body.append(el('p', 'hf-muted', 'Take on a yard here first (Yard tab).')); return; }
  const lines = linesIn(st, town);
  const free = freeHands(st, town).length;
  const all = (worksIfAny(st)?.lines ?? []).length;
  const s = section(`Lines in ${townName(st, town)}`, `Each hand makes one batch a dawn from the yard's stock (${TUNING.wage} coin wage each). Feeding the crew a ration makes half again. ${free} free ${free === 1 ? 'person' : 'people'} here could take work · ${all} line${all === 1 ? '' : 's'} in all your yards.`);
  if (!lines.length) s.append(el('p', 'hf-muted hf-small', 'No lines yet. Pick a recipe below to chalk one out.'));
  for (const l of lines) {
    const r = RECIPE_BY_ID.get(l.recipeId);
    if (!r) continue;
    const who = l.workers.map((p) => personFirst(st, p)).join(', ') || 'nobody';
    const status = l.status ? ` · ${l.status}` : ' · running';
    const detail = `${recipeText(r.in, r.out)} · hands ${l.workers.length}/${lineCap(l.level)} (${who}) · level ${l.level}${l.fed ? ' · fed' : ''} · made ${l.made}${status}`;
    s.append(row(r.label, detail, [
      btn('+ Hand', () => ui.run((x) => hireHand(x, l.id), 'hire'), { disabled: l.workers.length >= lineCap(l.level) || !free, id: `works-hire-${l.id}` }),
      btn('− Hand', () => ui.run((x) => dropHand(x, l.id), 'drop'), { disabled: !l.workers.length }),
      btn(l.fed ? 'Unfeed' : 'Feed', () => ui.run((x) => toggleLine(x, l.id, 'fed'), 'feed')),
      btn('Improve', () => ui.run((x) => upgradeLine(x, l.id), 'improve'), { disabled: l.level >= 3, title: improveTip(l.level) }),
      btn(l.on ? 'Stop' : 'Start', () => ui.run((x) => toggleLine(x, l.id, 'on'), 'toggle')),
      btn('Scrap', () => ui.run((x) => scrapLine(x, l.id), 'scrap')),
    ], l.status ? '' : 'is-done'));
  }
  body.append(s);

  const choices = lineChoices(st, town);
  const add = section('Set up a line', 'One line per slot; each building has its own slots.');
  if (!choices.length) add.append(el('p', 'hf-muted hf-small', 'No free slots. Raise more buildings (Yard tab), or a later age opens more recipes.'));
  for (const id of choices) {
    const r = RECIPE_BY_ID.get(id)!;
    add.append(row(r.label, `${BUILDING_BY_ID.get(r.at)?.name} · ${recipeText(r.in, r.out)} per hand per dawn`, [btn('Set up', () => ui.run((x) => startLine(x, town, id), 'line'), { id: `works-line-${id}` })]));
  }
  body.append(add);
}

function improveTip(level: number): string {
  const cost = TUNING.lineUpgrade[level];
  return cost ? `Costs ${recipeText(cost, {}).replace(/ → $/, '')}; room for ${lineCap(level + 1)} hands.` : 'As good as it gets.';
}

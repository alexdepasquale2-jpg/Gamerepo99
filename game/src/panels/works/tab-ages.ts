/** The Ages tab: your Era and renown, the five arcs with every tier, and what to aim at next. */
import { arcsView, titleOf } from '../../sim/works/arcs';
import { ERAS } from '../../sim/works/data';
import { eraRow, nextEra, worksIfAny } from '../../sim/works/state';
import { el } from '../dom';
import { bar, section, type WorksUi } from './kit';

export function renderAges(ui: WorksUi, body: HTMLElement): void {
  const { st } = ui;
  const w = worksIfAny(st);
  const era = eraRow(st);
  const next = nextEra(st);
  const renown = w?.renown ?? 0;
  const head = section('Renown and the ages', `${titleOf(st)} · ${renown} renown${next ? ` · ${next.renown - renown} to the ${next.name}` : ' · the last age'}`);
  if (next) head.append(bar(renown - era.renown, next.renown - era.renown));
  const ladder = el('p', 'hf-small hf-muted', ERAS.map((e) => `${e.era <= era.era ? '●' : '○'} ${e.name} (${e.renown})`).join('  '));
  head.append(ladder);
  body.append(head);

  if (!w) {
    body.append(el('p', 'hf-note', 'Start in the Yard tab: take on a yard in this town, raise a workbench and a kitchen, and make something. Every step of an arc below pays renown, and renown opens the next age.'));
  }

  const arcs = section('Arcs', 'Walk any of them at once. Each step pays renown and coin the moment it is met; the fifth grants a lasting boon.');
  for (const v of arcsView(st)) {
    const box = el('div', 'hf-works-arc');
    box.append(el('h4', '', `${v.arc.name}${v.complete ? ' ✓' : ''}`));
    box.append(el('p', 'hf-small hf-muted', `${v.arc.role}: ${v.arc.blurb}`));
    for (const t of v.tiers) {
      const cls = t.done ? 'is-done' : t.current ? 'is-next' : 'is-later';
      const line = el('div', `hf-works-tier ${cls}`);
      const mark = t.done ? '✓' : t.current ? '▸' : '·';
      const count = t.current ? ` (${Math.min(t.have, t.tier.n)}/${t.tier.n})` : '';
      line.append(el('span', '', mark), el('span', '', `${t.tier.label}${count}`), el('span', 'hf-muted', `+${t.tier.renown}`));
      box.append(line);
      if (t.current) box.append(bar(t.have, t.tier.n));
    }
    box.append(el('p', 'hf-small hf-muted', `Boon: ${v.arc.boon}`));
    arcs.append(box);
  }
  body.append(arcs);

  const recent = (w?.news ?? []).slice(-6).reverse();
  if (recent.length) {
    const s = section('Lately');
    for (const n of recent) s.append(el('p', 'hf-small', `Day ${n.day}: ${n.text}`));
    body.append(s);
  }
}

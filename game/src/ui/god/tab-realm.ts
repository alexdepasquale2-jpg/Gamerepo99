/**
 * Realm: the whole grid of districts. Pick one to see its land, wound, doctrine and towns; Jump puts you
 * there at once (the same swap a trunk road makes, without the days on the road), then the scene restarts
 * in the new district. Trunk-road travel stays in the signpost's road sheet.
 */
import { DISTRICTS, districtAt } from '../../sim/map/districts';
import { bakeOf, districtTale, realmSummary, standingOf } from '../../sim/realm-bake';
import type { God, Tab } from './types';
import { btn, card, el, pill, row } from './ui';

type Memo = { sel?: { col: number; row: number } };

/** Swap to another district now and rebuild the world there. */
export function jumpToDistrict(g: God, to: { col: number; row: number }): void {
  const d = districtAt(g.ctx.seed, to.col, to.row);
  const townId = g.ctx.session.enterDistrict(to);
  if (!townId) { g.toast(`Couldn't enter ${d.name}`); return; }
  g.ctx.autosave();
  const restart = g.ctx.scene.registry.get('restart') as (() => void) | undefined;
  g.close();
  if (restart) restart();
  else g.ctx.arriveAt(townId);
}

export const realmTab: Tab = {
  id: 'realm',
  label: 'Realm',
  render(g, body) {
    const st = g.state();
    if (!st) return;
    const m = (g.memo.realm ??= {}) as Memo;
    const here = g.ctx.session.district();
    const { cols, rows } = DISTRICTS.grid;
    const sel = m.sel ?? here;

    const bake = bakeOf(st);
    const now = (id: string, seed: number): number => bake?.byId[id]?.despair ?? seed;
    const grid = el('div');
    grid.style.cssText = `display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:3px;max-width:720px`;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const d = districtAt(g.ctx.seed, c, r);
        const isHere = c === here.col && r === here.row;
        const isSel = c === sel.col && r === sel.row;
        const cell = el('button', 'g-b');
        cell.type = 'button';
        const desp = now(d.id, d.despair), b = bake?.byId[d.id];
        cell.title = `${d.name} · ${d.character.woundLabel} · despair ${Math.round(desp * 100)}%${b ? ` · ${standingOf(b)}` : ''}`;
        cell.style.cssText = `min-height:44px;padding:3px;font:10px/1.15 var(--g-mono);overflow:hidden;text-overflow:ellipsis;`
          + `background:rgba(208,101,79,${(0.08 + desp * 0.45).toFixed(2)});`
          + (isHere ? 'border-color:var(--g-gold);color:var(--g-gold);' : '') + (isSel ? 'outline:2px solid var(--g-cyan);' : '');
        cell.textContent = `${d.home ? '⌂ ' : ''}${b?.beacon ? '✦ ' : b?.fallen ? '✕ ' : ''}${d.name}`;
        cell.addEventListener('click', () => { m.sel = { col: c, row: r }; g.rerender(); });
        cell.addEventListener('dblclick', () => jumpToDistrict(g, { col: c, row: r }));
        grid.append(cell);
      }
    }

    const d = districtAt(g.ctx.seed, sel.col, sel.row);
    const isHere = sel.col === here.col && sel.row === here.row;
    const info = card(d.name,
      row(d.home ? pill('home', 'gold') : '', isHere ? pill('you are here', 'ok') : '', el('span', 'dim', `column ${sel.col}, row ${sel.row}`)),
      el('div', '', `${d.character.epithet}`),
      row(el('span', 'dim', 'Wound'), el('b', '', d.character.woundLabel), el('span', 'dim', 'Land'), el('b', '', d.character.land)),
      row(el('span', 'dim', 'Doctrine'), el('b', 'gold', d.character.doctrine.name), el('span', 'dim', `promises ${d.character.doctrine.promise}`)),
      row(el('span', 'dim', bake ? 'Despair after its past' : 'Starting despair'), el('b', 'red', `${Math.round(now(d.id, d.despair) * 100)}%`), el('span', 'dim', 'Population'), el('b', '', d.population ? Math.round(d.population * (bake?.byId[d.id]?.people ?? 1)) : '—')),
      ...(bake?.byId[d.id] ? [row(pill(standingOf(bake.byId[d.id]!), bake.byId[d.id]!.beacon ? 'gold' : bake.byId[d.id]!.fallen ? 'bad' : 'ok'), el('span', 'dim', `${bake.byId[d.id]!.rulers} seat-holders`))] : []),
      el('div', 'dim', d.towns.length ? `Towns: ${d.towns.map((t) => `${t.name}${t.seat ? ' (seat)' : ''}`).join(', ')}` : d.home ? 'Your home towns.' : 'No towns.'),
      row(isHere ? el('span', 'dim', 'You are already here.') : btn(`Jump to ${d.name}`, () => jumpToDistrict(g, sel), 'hot')),
    );

    const split = el('div', 'g-split');
    const left = el('div');
    left.append(el('div', 'dim', 'Tap a district to inspect it. Double-tap, or use Jump, to go there now. No days pass. Redder means more despair.'), grid);
    left.firstElementChild!.setAttribute('style', 'margin-bottom:6px');
    if (bake) {
      left.append(el('div', 'dim', realmSummary(bake).join(' ')));
      const tale = card('What it remembers', ...districtTale(bake, d.id).reverse().map((t) => el('div', '', t.line)));
      info.append(tale);
    }
    split.append(left, info);
    body.append(split);
  },
};

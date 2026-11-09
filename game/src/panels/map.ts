/**
 * The world map (M) as a side sheet, and the always-on minimap in the top-right corner of the canvas. The
 * minimap steps aside while any sheet, menu or ring is open, and a tap on it opens the big map.
 */
import type { GameContext, SheetDef } from '../app/contracts';
import { button, el } from './dom';
import { districtAtPoint, districtLine, districtPast, drawRealm, playerDistrict, realmAges } from './realm-draw';
import { bakeOf } from '../sim/realm-bake';
import { realm, type District } from '../sim/map/districts';
import { CART_COLOR, LINK_COLOR, PLAYER_COLOR, WAGON_COLOR, drawMap, mapModel, despairColor, type MapModel } from './map-draw';

export const MAP_ID = 'map';

export type WorldMapView = {
  sheet(): SheetDef;
  /** Redraw what is showing (called from the panels tick). */
  tick(now: number, mapOpen: boolean, hideMini: boolean): void;
  /** Rebuild towns and roads (new world / load). */
  reset(): void;
  destroy(): void;
};

export function createWorldMap(ctx: GameContext, layer: HTMLElement, openMap: () => void): WorldMapView {
  let model: MapModel = mapModel(ctx);
  const mini = el('canvas', 'hf-minimap', undefined, { role: 'button', 'aria-label': 'Minimap: open the world map', tabindex: 0, 'data-id': 'minimap' });
  mini.width = 132;
  mini.height = 92;
  mini.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
  mini.addEventListener('click', (e) => { e.stopPropagation(); openMap(); });
  mini.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMap(); } });
  layer.append(mini);

  let big: HTMLCanvasElement | null = null;
  /** Which view the big map shows: this district's towns and roads, or the whole realm of districts. */
  let view: 'local' | 'realm' = 'local';
  let picked: District | null = null;
  let lastMini = -1e9, lastBig = -1e9;

  const sizeBig = (c: HTMLCanvasElement): void => {
    const w = Math.max(200, Math.min(640, Math.floor(c.parentElement?.clientWidth || 320)));
    const h = Math.max(140, Math.round(w * Math.min(1.2, Math.max(0.5, model.h / model.w))));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  };

  const legend = (): HTMLElement => {
    const ul = el('ul', 'hf-legend hf-small hf-muted', undefined, { 'aria-label': 'Map key' });
    const item = (color: string, label: string, dash = false): void => {
      const li = el('li');
      const sw = el('i');
      sw.style.background = dash ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)` : color;
      li.append(sw, document.createTextNode(label));
      ul.append(li);
    };
    item(PLAYER_COLOR, 'you');
    item(despairColor(0), 'town (greys as it despairs)');
    item('rgba(242,230,184,0.6)', 'land ring');
    item(LINK_COLOR.alliance, 'allies');
    item(LINK_COLOR.trade, 'trade pact', true);
    item(LINK_COLOR.war, 'war');
    item(CART_COLOR, 'village carts');
    item(WAGON_COLOR, 'caravans');
    item('#e8d27a', 'mills, camps, mines, waystations (grey: idle)');
    return ul;
  };

  const sheet = (): SheetDef => ({
    id: MAP_ID,
    title: 'The known world',
    onClose: () => { big = null; },
    render(body) {
      body.replaceChildren();
      const tabs = el('div', 'hf-row', undefined, { role: 'tablist', 'aria-label': 'Map view' });
      tabs.append(
        button('This district', () => { view = 'local'; rerender(body); }, { id: 'map-view-local', pressed: view === 'local' }),
        button('The realm', () => { view = 'realm'; rerender(body); }, { id: 'map-view-realm', pressed: view === 'realm' }),
      );
      body.append(tabs);
      if (view === 'realm') return renderRealm(body);
      const c = el('canvas', 'hf-map-canvas', undefined, { role: 'img', 'aria-label': 'Map of the known world', 'data-id': 'world-map' });
      body.append(c, legend());
      const desp = ctx.session.townDespair();
      const towns = el('p', 'hf-small', model.towns.map((t) => `${t.name} (${t.kind}${(desp[t.id] ?? 0) > 0.4 ? ', despairing' : ''})`).join(' · '));
      body.append(towns, button('Close map', () => ctx.panels.map.toggle(), { id: 'map-close' }));
      big = c;
      sizeBig(c);
      drawMap(c, ctx, model, true);
      // The body may not be laid out yet on the first render: size again next frame.
      requestAnimationFrame(() => { if (big === c) { sizeBig(c); drawMap(c, ctx, model, true); } });
    },
  });

  const rerender = (body: HTMLElement): void => sheet().render(body);

  /** The realm: a grid of districts; tap one to read about it. */
  const renderRealm = (body: HTMLElement): void => {
    big = null;
    const c = el('canvas', 'hf-map-canvas', undefined, { role: 'img', 'aria-label': 'Map of the realm: every district', 'data-id': 'realm-map' });
    const w = Math.max(200, Math.min(640, Math.floor(body.clientWidth || 320)));
    c.width = w; c.height = w;
    const info = el('p', 'hf-small', undefined, { 'aria-live': 'polite', 'data-id': 'realm-info' });
    // An older world: how the picked district stands after its past, and the tales it keeps.
    const past = el('div', 'hf-small', undefined, { 'data-id': 'realm-past' });
    const here = playerDistrict(ctx);
    const show = (d: District | null): void => {
      picked = d;
      drawRealm(c, ctx, d);
      const desp = Object.values(ctx.session.townDespair());
      const baked = d ? bakeOf(ctx.session.getState())?.byId[d.id]?.despair : undefined;
      info.textContent = d ? districtLine(d, desp.length ? desp.reduce((a, b) => a + b, 0) / desp.length : undefined, baked) : 'Tap a district to read about it.';
      past.replaceChildren();
      const p = d ? districtPast(ctx, d) : null;
      if (p) past.append(el('p', 'hf-small hf-muted', p.standing), ...p.tales.slice(0, 4).map((t) => el('p', 'hf-small', t)));
    };
    c.addEventListener('click', (e) => { const r = c.getBoundingClientRect(); show(districtAtPoint(c, ctx, e.clientX - r.left, e.clientY - r.top)); });
    const all = realm(ctx.seed);
    const towns = all.reduce((a, d) => a + d.towns.length, 0) + model.towns.length;
    const ages = realmAges(ctx);
    body.append(c, el('p', 'hf-small hf-muted', `${all.length} districts and ${towns} towns and villages. Gold outline: your home district. Grey: despair has the upper hand. A gold line joins districts under a trade pact; red dashes and crossed blades mark a war.${ages ? ' A gold ring marks a beacon; a dark cross, a land fallen to ash.' : ''}`), ...(ages ? [el('p', 'hf-small', ages, { 'data-id': 'realm-ages' })] : []), info, past,
      button('Close map', () => ctx.panels.map.toggle(), { id: 'map-close' }));
    show(picked ?? all.find((d) => here && d.col === here.col && d.row === here.row) ?? null);
  };

  return {
    sheet,
    tick(now, mapOpen, hideMini) {
      mini.hidden = hideMini;
      if (!hideMini && now - lastMini > 500) {
        lastMini = now;
        drawMap(mini, ctx, model, false);
      }
      if (mapOpen && big?.isConnected && now - lastBig > 500) {
        lastBig = now;
        sizeBig(big);
        drawMap(big, ctx, model, true);
      }
    },
    reset() { model = mapModel(ctx); lastMini = -1e9; },
    destroy() { mini.remove(); },
  };
}

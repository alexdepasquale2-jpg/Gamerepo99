/**
 * The world map (M) as a side sheet, and the always-on minimap in the top-right corner of the canvas. The
 * minimap steps aside while any sheet, menu or ring is open, and a tap on it opens the big map.
 */
import type { GameContext, SheetDef } from '../app/contracts';
import { button, el } from './dom';
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

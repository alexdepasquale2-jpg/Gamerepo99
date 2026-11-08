/**
 * Item icons for the hotbar, satchel and trade rows. Where the shared art (`assets/sprites`, served from
 * the public root) has a fitting frame we use it as a CSS sprite; every other item gets a 12×12 pixel
 * icon drawn once from the item's own colour (data/items/items.json) and cached as a data URL.
 */
import { ITEM_BY_ID, type ItemRow } from '../sim/goods/inventory';
import { el } from './dom';

const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/');
const SIZE = 24;

/** Item id → frame on a 32 px baked sheet (asset manifest: ore.* on sheet-ores, crop.* on sheet-crops). */
const SPRITES: Record<string, { sheet: string; frame: number; frames: number }> = {
  ore: { sheet: 'sprites/sheet-ores.png', frame: 0, frames: 3 },
  stone: { sheet: 'sprites/sheet-ores.png', frame: 1, frames: 3 },
  berries: { sheet: 'sprites/sheet-crops.png', frame: 2, frames: 5 },
};

/** 12×12 pixel shapes. o outline · s shade · c colour · h highlight · w paper · k dark detail · r seal red. */
const SHAPES: Record<string, string[]> = {
  food: ['', '', '    oooo', '  oohhhhoo', ' ohhcchcchho', ' ohcchcchcco', ' occcccccsso', ' osccccccsso', '  osssssssoo', '   oooooooo'],
  fish: ['', '', '', '   oooo   oo', '  ohhhhoo oco', ' ohkhcccccco', ' occcccccsco', '  osssssoo oco', '   oooo   oo'],
  wood: ['', '        oooo', '      oohhho', '    oohcchso', '  oohccchso', ' ohccccsso', 'ohwkwcsso', 'okwkwsso', 'ohwkwso', ' oooo'],
  stone: ['', '', '    ooooo', '   ohhhcco', '  ohhcccsso', ' ohcccccsso', ' occccccsso', ' osccccsssso', '  osssssssoo', '   oooooooo'],
  herb: ['', '     oo', '    ohco  oo', '   ohcco ohco', '   occso ocso', '    oso osco', '  oo okooso', ' ohco ko oo', ' occsoko', '  ooskko', '     ko', '     ko'],
  wool: ['', '', '    ooooo', '  oohhwhhoo', ' ohwhhhwhhho', ' ohhhcchhhco', ' ochhhhhhcco', ' occcchhccso', '  osscccssoo', '   oooooooo'],
  cloth: ['', '', ' oooooooooo', ' ohhhhhhhhso', ' occcccccsso', ' ohhhhhhhhso', ' occcccccsso', ' ohhhhhhhhso', ' osssssssss o', ' oooooooooo'],
  tool: ['', ' oooooo', 'ohhhhhho', 'occcccsso', 'ossssssso', ' ooookoo', '    oko', '    oko', '    oko', '    oko', '    oko', '     o'],
  keepsake: ['', '    o  o', '   o    o', '   o    o', '    o  o', '    oooo', '   ohhhco', '  ohhcccso', '  ohcccsso', '   occsso', '    osso', '     oo'],
  letter: ['', '', 'oooooooooooo', 'owwwwwwwwwwo', 'okwwwwwwwwko', 'owkwwwwwwkwo', 'owwkwrrwkwwo', 'owwwkrrkwwwo', 'owwwwwwwwwwo', 'oooooooooooo'],
  coin: ['', '    oooo', '  oohhhhoo', ' ohhccccsso', ' ohcckkccso', ' ohckcccsso', ' occckkcsso', ' occccckcso', ' osckkkcsso', '  oosssssoo', '    oooo'],
  grain: ['  o  o  o', ' oho oho oho', ' oco oco oco', ' oho oho oho', ' oco oco oco', '  os os os', '   oskso', '    oko', '   ohcco', '   oskko', '    oko', '    oko'],
  sack: ['', '    oooo', '     ko', '   oohhoo', '  ohhhhcco', ' ohhhcccsso', ' ohcccccsso', ' occccccsso', ' osccccssso', '  osssssso', '   oooooo'],
  pot: ['', '   oooooo', '   ohhhso', '  oohhcsoo', ' ohhcccccso', ' ohcccccsso', ' occccccsso', ' osccccssso', '  osssssso', '   oooooo'],
  rope: ['', '   oooooo', '  ohhhhhho', ' ohcoooocho', ' ocoohhoocso', ' ocohcccocso', ' ocoscsoocso', ' oscooooscso', '  osssssso', '   oooooo k', '         kk'],
  nails: ['', ' ooo  ooo', ' ohho ohho', ' ooo  ooo', '  oh   oh', '  oc   oc', '  oc   oc', '  oc   oc', '  os   os', '  os   os', '   o    o'],
  brick: ['', '', '', ' oooooooooo', ' ohhhhhhhhco', ' ohcccccccso', ' occcccccsso', ' osssssssss o', ' oooooooooo'],
};
/** Item id → shape where the icon kind alone would mislead. */
const BY_ID: Record<string, string> = { fish: 'fish', grain: 'grain', flax: 'grain', flour: 'sack', pots: 'pot', rope: 'rope', nails: 'nails', clay: 'brick' };

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (hex: string, toward: number, f: number): string => {
  const [r, g, b] = hexToRgb(hex);
  const m = (v: number): number => Math.round(v + (toward - v) * f);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
};

const cache = new Map<string, string>();

function drawIcon(item: ItemRow): string {
  const hit = cache.get(item.id);
  if (hit) return hit;
  const shape = SHAPES[BY_ID[item.id] ?? item.icon] ?? SHAPES.stone!;
  const canvas = document.createElement('canvas');
  canvas.width = 12;
  canvas.height = 12;
  const g = canvas.getContext('2d');
  if (!g) return '';
  const pal: Record<string, string> = {
    o: mix(item.color, 16, 0.78), s: mix(item.color, 0, 0.35), c: item.color, h: mix(item.color, 255, 0.38),
    w: '#f4e6c8', k: '#3a2a1a', r: '#b8324a',
  };
  shape.forEach((row, y) => {
    for (let x = 0; x < Math.min(12, row.length); x++) {
      const col = pal[row[x]!];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  });
  const url = canvas.toDataURL();
  cache.set(item.id, url);
  return url;
}

/** Apply an item's icon to an element (background image, sized to SIZE px). */
export function paintIcon(target: HTMLElement, itemId: string): void {
  const item = ITEM_BY_ID.get(itemId);
  if (!item) return;
  const sp = SPRITES[itemId];
  const k = SIZE / 32;
  if (sp) {
    target.style.backgroundImage = `url("${BASE}${sp.sheet}")`;
    target.style.backgroundSize = `${sp.frames * 32 * k}px ${SIZE}px`;
    target.style.backgroundPosition = `${-sp.frame * 32 * k}px 0`;
  } else {
    target.style.backgroundImage = `url("${drawIcon(item)}")`;
    target.style.backgroundSize = `${SIZE}px ${SIZE}px`;
    target.style.backgroundPosition = '0 0';
  }
}

/** `<span class="hf-icon">` showing the item. */
export function itemIcon(itemId: string): HTMLSpanElement {
  const span = el('span', 'hf-icon', undefined, { 'aria-hidden': 'true', 'data-item': itemId });
  paintIcon(span, itemId);
  return span;
}

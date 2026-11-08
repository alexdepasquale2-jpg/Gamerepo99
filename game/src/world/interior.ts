/**
 * Building interiors (sim/map/interiors plans): the room is drawn far off the map on the tile grid, so
 * the navigator, foot sort and camera work unchanged inside. The world area draws the room and its exit;
 * the actors area puts the residents in (at `seats`), interact draws the prompt and ring.
 */
import Phaser from 'phaser';
import art from '../data/art/settlements.json';
import { TILE_PX } from '../sim/map/constants';
import { EXIT_REACH, exitMat, interiorPlan, solidTiles, type Building, type Furniture, type InteriorPlan } from '../sim/map/interiors';
import { DECAL_DEPTH, GROUND_DEPTH, tileFoot, type Pt } from './depth';
import { hexNum, shade } from './art/px';

const T = TILE_PX;
/** Room floor's top-left tile: far from any world (tile aligned). */
export const ROOM_Q0 = 12500, ROOM_R0 = 9375;
const WALL_ROWS = 2;
const ACCENTS = ['#b5524a', '#4f7a8a', '#7a8f4a'];
const FLOOR: Record<string, [string, string]> = { house: ['#b88d5a', '#a87f50'], shop: ['#c9a56e', '#b8955f'], inn: ['#9c6f45', '#8d633e'] };

export type Room = {
  building: Building;
  plan: InteriorPlan;
  spawn: Pt;
  seats: Pt[];
  exit: Pt;
  exitReach: number;
  /** Room rect in world px (walls included). */
  rect: { x: number; y: number; w: number; h: number };
  centre: Pt;
  /** Walkable floor tile (world tile coords)? */
  walkable(q: number, r: number): boolean;
  inside(q: number, r: number): boolean;
  setLantern(lit: boolean): void;
  update(time: number): void;
  destroy(): void;
};

export function buildRoom(scene: Phaser.Scene, b: Building, lanternLit: boolean): Room {
  const plan = interiorPlan(b.kind, b.id);
  const ox = ROOM_Q0 * T, oy = ROOM_R0 * T, w = plan.cols * T, h = plan.rows * T;
  const objs: Phaser.GameObjects.GameObject[] = [];
  const flames: Phaser.GameObjects.Ellipse[] = [];
  let lantern: { glow: Phaser.GameObjects.Arc; shadeG: Phaser.GameObjects.Graphics; x: number; y: number } | null = null;
  const pal = art.palettes[b.paletteIndex % art.palettes.length]!;
  const keep = <O extends Phaser.GameObjects.GameObject>(o: O): O => { objs.push(o); return o; };

  // Backdrop, walls and floor.
  keep(scene.add.rectangle(ox + w / 2, oy + h / 2, w + 2000, h + 1400, 0x14100c).setDepth(GROUND_DEPTH + 1));
  const g = keep(scene.add.graphics().setDepth(DECAL_DEPTH));
  const fill = (x: number, y: number, rw: number, rh: number, c: string | number, a = 1) => g.fillStyle(typeof c === 'number' ? c : hexNum(c), a).fillRect(x, y, rw, rh);
  const wall = pal.wall, wallShadow = pal.shadow;
  const [fa, fb] = FLOOR[plan.kind]!;
  fill(ox - 12, oy - WALL_ROWS * T - 12, w + 24, h + WALL_ROWS * T + 36, '#2a1f17');
  fill(ox, oy - WALL_ROWS * T, w, WALL_ROWS * T, wall);
  fill(ox, oy - WALL_ROWS * T, w, 6, shade(wall, 0.9));
  for (let x = 0; x < w; x += 24) fill(ox + x, oy - WALL_ROWS * T + 8, 2, WALL_ROWS * T - 24, shade(wall, 0.95));
  fill(ox, oy - 22, w, 14, wallShadow);
  fill(ox, oy - 22, w, 2, shade(wallShadow, 0.8));
  fill(ox, oy - 8, w, 8, '#654936');
  for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) {
    fill(ox + c * T, oy + r * T, T, T, (c + r) % 2 ? fa : fb);
    fill(ox + c * T, oy + r * T + T - 2, T, 2, shade(fa, 0.82));
    fill(ox + c * T + ((r * 7 + c * 3) % 5) * 5 + 3, oy + r * T + 10 + (c % 3) * 5, 4, 1, shade(fa, 0.88));
  }
  fill(ox, oy, w, 6, 0x000000, 0.18);
  fill(ox - 12, oy - WALL_ROWS * T, 12, h + WALL_ROWS * T + 12, '#3b2c20');
  fill(ox + w, oy - WALL_ROWS * T, 12, h + WALL_ROWS * T + 12, '#3b2c20');
  const dx = ox + plan.doorCol * T;
  fill(ox, oy + h, dx - ox, 12, '#3b2c20');
  fill(dx + T, oy + h, ox + w - dx - T, 12, '#3b2c20');
  fill(dx - 3, oy + h - 2, T + 6, 3, '#654936');
  fill(dx, oy + h, T, 12, '#cfe3a8');
  fill(dx + 2, oy + h - 14, T - 4, 12, '#8a3a2c');
  fill(dx + 4, oy + h - 12, T - 8, 8, '#b85a40');

  for (const o of plan.furniture) drawPiece(o);

  function drawPiece(o: Furniture): void {
    const x = ox + o.col * T, pw = o.w * T, ph = o.h * T;
    const y = o.wall ? oy - WALL_ROWS * T + 10 : oy + o.row * T;
    const accent = ACCENTS[plan.accent]!;
    const pg = keep(scene.add.graphics());
    pg.setDepth(o.wall ? DECAL_DEPTH + 2 : o.type === 'rug' ? DECAL_DEPTH + 1 : oy + (o.row + o.h) * T - 0.1);
    const r = (rx: number, ry: number, rw: number, rh: number, c: string, a = 1) => pg.fillStyle(hexNum(c), a).fillRect(x + rx, y + ry, rw, rh);
    const wood = '#8d6240', dark = '#654936', light = '#c4a06c';
    switch (o.type) {
      case 'rug': r(2, 2, pw - 4, ph - 4, accent); r(6, 6, pw - 12, ph - 12, shade(accent, 1.25)); r(10, 10, pw - 20, ph - 20, shade(accent, 0.85)); break;
      case 'bed': r(0, 0, pw, ph, dark); r(2, 2, pw - 4, 14, wood); r(6, 14, pw - 12, ph - 20, '#f0e4c8'); r(10, 16, pw - 20, 14, '#fff6e0'); r(6, 34, pw - 12, ph - 40, accent); r(0, ph - 6, pw, 6, dark); break;
      case 'table': r(3, ph - 8, 5, 8, dark); r(pw - 8, ph - 8, 5, 8, dark); r(0, 4, pw, ph - 14, light); r(0, ph - 12, pw, 5, wood); r(pw / 2 - 5, 3, 10, 6, '#e7e1d0'); break;
      case 'stool': r(6, 16, 3, 10, dark); r(T - 9, 16, 3, 10, dark); r(4, 10, T - 8, 8, wood); r(4, 10, T - 8, 3, light); break;
      case 'armchair': r(3, 4, T - 6, 22, shade(accent, 0.8)); r(6, 14, T - 12, 12, accent); r(1, 10, 5, 16, shade(accent, 0.7)); r(T - 6, 10, 5, 16, shade(accent, 0.7)); break;
      case 'hearth': {
        r(6, -WALL_ROWS * T + 10, pw - 12, WALL_ROWS * T - 6, '#8a8f86'); r(8, -WALL_ROWS * T + 10, pw - 16, WALL_ROWS * T - 10, '#a5a899');
        r(0, 0, pw, T, '#777f79'); r(2, 2, pw - 4, 6, '#c6c3a5'); r(8, 10, pw - 16, T - 10, '#1d1511'); r(pw / 2 - 10, T - 6, 20, 4, '#5a3a24');
        const cx = x + pw / 2, cy = y + T - 8;
        keep(scene.add.circle(cx, cy - 4, 26, 0xf2b84b, 0.2).setBlendMode(Phaser.BlendModes.ADD).setDepth(pg.depth + 0.2));
        flames.push(keep(scene.add.ellipse(cx, cy - 4, 12, 15, 0xf08a30).setDepth(pg.depth + 0.1)), keep(scene.add.ellipse(cx, cy - 2, 6, 9, 0xffe08a).setDepth(pg.depth + 0.11)));
        break;
      }
      case 'shelf': case 'books': {
        const top = o.wall ? 0 : -34, rows = o.wall ? [4, 22] : [-30, -12, 6];
        r(0, top, pw, o.wall ? 46 : T + 34, dark); r(2, top + 2, pw - 4, o.wall ? 42 : T + 30, shade(wood, 0.9));
        for (const sy of rows) {
          r(2, sy + 13, pw - 4, 3, light);
          for (let i = 0, ix = 5; ix < pw - 8; i++, ix += o.type === 'books' ? 5 : 11) {
            const c = ['#b5524a', '#4f7a8a', '#c9a04e', '#7a8f4a', '#8a6aa0'][(i + plan.accent) % 5]!;
            if (o.type === 'books') r(ix, sy + 1, 4, 12, c); else r(ix, sy + 5, 8, 8, c);
          }
        }
        break;
      }
      case 'counter': r(0, 6, pw, T - 6, wood); r(0, 2, pw, 8, light); r(0, 10, pw, 2, dark); r(10, -4, 8, 8, '#d6b582'); r(pw - 26, -2, 14, 5, '#e8d6a8'); break;
      case 'plant': r(9, 18, 14, 11, '#a65f45'); r(8, 16, 16, 3, '#c27d59'); for (const [px, py] of [[10, 4], [16, 2], [6, 9], [19, 9], [13, 8]] as const) { r(px, py, 6, 10, '#547b3a'); r(px + 1, py, 4, 5, '#7fa54f'); } break;
      case 'chest': r(3, 10, T - 6, 18, dark); r(5, 12, T - 10, 14, wood); r(3, 8, T - 6, 6, light); r(T / 2 - 2, 14, 4, 5, '#ecc76e'); break;
      case 'crate': r(3, 8, T - 6, T - 10, wood); r(3, 8, T - 6, 3, light); r(3, 8, 3, T - 10, dark); r(T - 6, 8, 3, T - 10, dark); r(8, 2, 8, 8, '#d6b582'); break;
      case 'barrel': r(5, 6, T - 10, T - 8, wood); r(7, 4, T - 14, 3, light); r(5, 12, T - 10, 2, '#4a3a2c'); r(5, 22, T - 10, 2, '#4a3a2c'); break;
      case 'lantern': {
        r(T / 2 - 5, T - 6, 10, 4, '#4a3a2c'); r(T / 2 - 1, 10, 2, T - 14, '#4a3a2c'); r(T / 2 - 6, 2, 12, 10, '#e9d4a2'); r(T / 2 - 6, 2, 12, 2, light);
        const shadeG = keep(scene.add.graphics().setDepth(pg.depth + 0.01));
        const glow = keep(scene.add.circle(x + T / 2, y + 8, 24, 0xffd877, 0.16).setBlendMode(Phaser.BlendModes.ADD).setDepth(pg.depth + 0.3));
        lantern = { glow, shadeG, x: x + T / 2 - 4, y: y + 6 };
        break;
      }
      case 'window': r(0, 0, pw, 40, dark); r(3, 3, pw - 6, 34, '#9ec7d8'); r(3, 3, pw - 6, 12, '#cfe3ec'); r(pw / 2 - 1, 3, 2, 34, dark); r(3, 19, pw - 6, 2, dark); r(-2, 38, pw + 4, 4, light); break;
      case 'sign': {
        r(pw / 2 - 22, 0, 2, 8, '#4a3a2c'); r(pw / 2 + 20, 0, 2, 8, '#4a3a2c'); r(pw / 2 - 28, 8, 56, 20, wood); r(pw / 2 - 26, 10, 52, 16, light);
        // A painted emblem instead of words: a loaf (shop), a mug (inn), a roof (house).
        if (plan.kind === 'inn') { r(pw / 2 - 5, 12, 9, 11, '#e9d4a2'); r(pw / 2 + 4, 15, 3, 5, '#8d6240'); }
        else if (plan.kind === 'shop') { r(pw / 2 - 9, 15, 18, 7, '#c8963e'); r(pw / 2 - 7, 14, 14, 2, '#e0b060'); }
        else { r(pw / 2 - 8, 17, 16, 6, pal.wall); r(pw / 2 - 10, 13, 20, 4, pal.roof); }
        break;
      }
    }
  }

  const solid = solidTiles(plan);
  const local = (q: number, r: number) => ({ c: q - ROOM_Q0, r: r - ROOM_R0 });
  const mat = exitMat(plan);
  const seat = tileFoot(ROOM_Q0 + plan.npc.col, ROOM_R0 + plan.npc.row);
  const room: Room = {
    building: b,
    plan,
    spawn: { x: ox + (plan.spawn.col + 0.5) * T, y: oy + (plan.spawn.row + 1) * T - 4 },
    seats: [{ x: seat.x, y: seat.y - 2 }],
    exit: { x: ox + mat.x, y: oy + mat.y },
    exitReach: EXIT_REACH,
    rect: { x: ox - 12, y: oy - WALL_ROWS * T - 12, w: w + 24, h: h + WALL_ROWS * T + 36 },
    centre: { x: ox + w / 2, y: oy + (h - WALL_ROWS * T) / 2 },
    inside: (q, r) => { const l = local(q, r); return l.c >= -2 && l.r >= -4 && l.c < plan.cols + 2 && l.r < plan.rows + 2; },
    walkable: (q, r) => { const l = local(q, r); return l.c >= 0 && l.r >= 0 && l.c < plan.cols && l.r < plan.rows && !solid.has(`${l.c},${l.r}`); },
    setLantern(lit) {
      if (!lantern) return;
      lantern.glow.setVisible(lit);
      lantern.shadeG.clear().fillStyle(lit ? 0xffe9a8 : 0x7a6a50, 1).fillRect(lantern.x, lantern.y, 8, 4);
    },
    update(time) {
      for (const f of flames) { const k = 0.88 + Math.sin(time / 90 + f.x) * 0.1 + Math.sin(time / 37) * 0.05; f.setScale(k, 0.9 + (k - 0.85) * 2); }
    },
    destroy() { for (const o of objs) { scene.tweens.killTweensOf(o); o.destroy(); } },
  };
  room.setLantern(lanternLit);
  return room;
}

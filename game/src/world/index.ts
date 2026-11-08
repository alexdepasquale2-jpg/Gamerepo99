/**
 * WORLD area (stub). Owner: the world agent. Replace everything in src/world/ — keep the three exports.
 * See game/README.md "world".
 */
import type Phaser from 'phaser';
import type { GameContext, WorldApi } from '../app/contracts';
import { TILE_PX } from '../sim/map/constants';
import { createTerrainAccess } from '../sim/map/terrain-access';
import { createNavigator } from '../sim/map/nav';

export function preloadWorldAssets(_scene: Phaser.Scene): void {}
export function createWorldAssets(_scene: Phaser.Scene): void {}

export function attachWorld(ctx: GameContext): WorldApi {
  const terrain = createTerrainAccess(ctx.layout, ctx.seed, undefined, () => ctx.session.getState()?.tileEdits);
  const nav = createNavigator(terrain);
  let phase = 0.3;
  const foot = (t: { q: number; r: number }) => ({ x: t.q * TILE_PX + TILE_PX / 2, y: t.r * TILE_PX + TILE_PX });
  const tileOf = (p: { x: number; y: number }) => ({ q: Math.floor(p.x / TILE_PX), r: Math.floor(p.y / TILE_PX) });
  return {
    nav,
    foot,
    tileOf,
    passable: (p) => { const t = tileOf(p); return terrain.passable(t.q, t.r); },
    spawnPoint: (townId) => { const s = ctx.layout.settlements.find((x) => x.id === townId) ?? ctx.layout.settlements[0]!; return foot({ q: s.q, r: s.r + 2 }); },
    townAt: () => null,
    things: () => [],
    refresh: () => {},
    phase: () => phase,
    setPhase: (p) => { phase = p; },
    room: () => null,
    enterRoom: () => false,
    leaveRoom: () => {},
    update: () => {},
  };
}

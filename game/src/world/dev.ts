/**
 * World QA hooks on window.__hearth.dev (app/dev-hooks.ts):
 *   tile(q, r)        ground there: biome, edit, drawn ground and props, passable, town
 *   teleport(q, r)    stand on the nearest walkable tile (chunks built at once)
 *   things(radius?)   Things around the player (facing included), as plain rows
 *   nearThing(kind)   stand just south of the nearest Thing of a kind, facing it; returns its key
 *   room(), enterRoom(id), leaveRoom(), setPhase(p), despair(), chunks(), facilities(), plots(), graves()
 *   chunkStats()      chunk build times in ms (ground paint and whole build: avg, max, last)
 *   artGallery(on?)   lay every manifest frame from the credited packs out beside the player (false clears it)
 */
import type Phaser from 'phaser';
import type { GameContext, Thing } from '../app/contracts';
import { registerDevHook } from '../app/dev-hooks';
import type { TerrainAccess } from '../sim/map/terrain-access';
import { TILE_PX } from '../sim/map/constants';
import type { ChunkLayer } from './chunk-layer';
import type { WorldThings } from './things';
import type { TownToneDriver } from './town-tone';
import type { Settlements } from './settlements';
import { tileFoot, type Pt } from './depth';
import { loadManifestArt, manifestFrame } from './assets';

export type WorldInternals = {
  terrain: TerrainAccess;
  chunks: ChunkLayer;
  things: WorldThings;
  tone: TownToneDriver;
  towns: Settlements;
  syncChunks: (p: Pt, force?: boolean) => void;
  nameOf: (townId: string) => string;
};
const internals = new WeakMap<GameContext, WorldInternals>();
export const setWorldInternals = (ctx: GameContext, w: WorldInternals): void => void internals.set(ctx, w);

const row = (t: Thing) => ({ key: t.key, kind: t.kind, id: t.id, label: t.label, x: Math.round(t.x), y: Math.round(t.y), reach: t.reach ?? 48 });

function teleport(ctx: GameContext, w: WorldInternals, q: number, r: number): { q: number; r: number } {
  const at = ctx.world.nav.snap(Math.round(q), Math.round(r), 12) ?? { q: Math.round(q), r: Math.round(r) };
  const f = tileFoot(at.q, at.r);
  ctx.world.leaveRoom();
  ctx.actors.player.setPos(f);
  w.syncChunks(f, true);
  ctx.scene.cameras.main.centerOn(f.x, f.y);
  return at;
}

registerDevHook('tile', (ctx) => (q: number, r: number) => {
  const w = internals.get(ctx);
  if (!w) return null;
  const drawn = w.chunks.drawn(q, r);
  return {
    biome: w.terrain.biome(q, r), natural: w.terrain.natural(q, r), edit: w.terrain.edit(q, r) ?? null,
    ground: drawn.ground ?? null, props: drawn.props, passable: ctx.world.nav.walkable(q, r),
    town: ctx.world.townAt(tileFoot(q, r)),
  };
});

registerDevHook('teleport', (ctx) => (q: number, r: number) => {
  const w = internals.get(ctx);
  return w ? teleport(ctx, w, q, r) : null;
});

registerDevHook('things', (ctx) => (radius = 160) => {
  const p = ctx.actors.player.pos();
  return ctx.world.things(p, radius, ctx.actors.player.facing()).map(row);
});

registerDevHook('nearThing', (ctx) => (kind: string) => {
  const w = internals.get(ctx);
  if (!w) return null;
  const p = ctx.actors.player.pos();
  const best = ctx.world.things(p, TILE_PX * 200).filter((t) => t.kind === kind)[0];
  if (!best) return null;
  const at = teleport(ctx, w, Math.floor(best.x / TILE_PX), Math.floor((best.y - 2) / TILE_PX) + 1);
  return { key: best.key, standing: at };
});

registerDevHook('room', (ctx) => () => ctx.world.room());
registerDevHook('enterRoom', (ctx) => (buildingId?: string) => {
  const w = internals.get(ctx);
  const town = ctx.world.townAt(ctx.actors.player.pos()) ?? ctx.session.snapshot().townId;
  const b = w?.towns.byId.get(town)?.buildings[0];
  return ctx.world.enterRoom(buildingId ?? b?.id ?? '');
});
registerDevHook('leaveRoom', (ctx) => () => ctx.world.leaveRoom());
registerDevHook('setPhase', (ctx) => (p: number) => { ctx.world.setPhase(p); return ctx.world.phase(); });
registerDevHook('despair', (ctx) => () => ({ sim: ctx.session.townDespair(), shown: internals.get(ctx)?.tone.despair() }));
registerDevHook('pulse', (ctx) => (townId?: string) => internals.get(ctx)?.tone.pulse(townId ?? ctx.session.snapshot().townId));
registerDevHook('chunks', (ctx) => () => internals.get(ctx)?.chunks.count());
registerDevHook('chunkStats', (ctx) => () => internals.get(ctx)?.chunks.stats());
registerDevHook('facilities', (ctx) => () => internals.get(ctx)?.things.facilities.list());
registerDevHook('plots', (ctx) => () => internals.get(ctx)?.things.plots.list());
registerDevHook('graves', (ctx) => () => internals.get(ctx)?.things.graves.list());
registerDevHook('chest', (ctx) => (siteId: string) => internals.get(ctx)?.things.chests.tally(siteId));

const galleries = new WeakMap<GameContext, Phaser.GameObjects.Image[]>();
registerDevHook('artGallery', (ctx) => async (on = true) => {
  for (const img of galleries.get(ctx) ?? []) img.destroy();
  galleries.delete(ctx);
  if (!on) return [];
  const keys = await loadManifestArt(ctx.scene);
  const p = ctx.actors.player.pos(), CELL = 72, COLS = 7, imgs: Phaser.GameObjects.Image[] = [];
  keys.forEach((key, i) => {
    const f = manifestFrame(ctx.scene, key);
    if (!f) return;
    const img = ctx.scene.add.image(p.x + ((i % COLS) - 3) * CELL, p.y - 120 + Math.floor(i / COLS) * CELL, f.tex, f.frame).setOrigin(0.5, 1).setDepth(1e6);
    img.setScale(Math.min(4, Math.floor(60 / Math.max(img.width, img.height)) || 1));
    imgs.push(img);
  });
  galleries.set(ctx, imgs);
  return keys;
});

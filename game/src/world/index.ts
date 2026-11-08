/**
 * WORLD area: terrain chunks streamed around the player, settlements and buildings, props, every
 * interactable world Thing, interiors, the day light and each town's despair palette, and asset loading.
 * Other areas reach it only through WorldApi (app/contracts.ts). See game/README.md.
 */
import Phaser from 'phaser';
import type { GameContext, Thing, WorldApi } from '../app/contracts';
import { CHUNK_SIZE, TILE_PX } from '../sim/map/constants';
import { createTerrainAccess } from '../sim/map/terrain-access';
import { createNavigator } from '../sim/map/nav';
import { buildRoads, createStampRasterSource } from '../sim/map/stamp-raster';
import { lanternLit } from '../sim/goods/item-use';
import { EXIT_DOOR } from '../sim/contrib/objects';
import { tileFoot, type Pt } from './depth';
import { createChunkLayer } from './chunk-layer';
import { createSettlements } from './settlements';
import { inTownBox } from './town-spots';
import { createWorldThings } from './things';
import { civicMarksOf, createCivicMarks } from './civic-marks';
import { buildRoom, roomOccupant, type Room } from './interior';
import { occupantOf } from '../sim/map/interiors';
import { counterThing } from './things/stalls';
import { adoptLegacyBuildingFlags } from '../sim/map/building-ids';
import { createDayClock, lightAt, nightAt } from './day';
import { createLightFx } from './light-fx';
import { createTownTone } from './town-tone';
import { setWorldInternals } from './dev';
import { attachLinger } from './linger';
import { restageFields } from './crop-fields';

export { preloadWorldAssets, createWorldAssets } from './assets';

const POLL_S = 1;
const LIGHT_RANGE = TILE_PX * 30;

export function attachWorld(ctx: GameContext): WorldApi {
  const scene = ctx.scene;
  const session = ctx.session;
  const st = () => session.getState();
  const world = session.getWorld();
  if (!world) throw new Error('world area needs a started session');
  const names = new Map((world.settlements ?? []).map((s) => [s.id, s.name]));
  const nameOf = (id: string) => names.get(id) ?? id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const edits = () => st()?.tileEdits;
  const roads = buildRoads(ctx.layout);
  const terrain = createTerrainAccess(ctx.layout, ctx.seed, roads, edits);
  const source = createStampRasterSource(world, ctx.seed, edits);

  // Ground id of a tile just outside a chunk, so chunk borders and road ribbons carry across.
  const around = (q: number, r: number): string => {
    const e = terrain.edit(q, r);
    if (e) return e;
    if (roads.has(`${q},${r}`)) return terrain.isBridge(q, r) ? 'road_bridge' : 'road';
    if (terrain.isDeck(q, r)) return 'bridge_deck';
    if (terrain.isFord(q, r)) return 'ford';
    if (terrain.isFerry(q, r)) return 'ferry';
    return terrain.biome(q, r);
  };

  let room: Room | null = null;
  let returnTo: Pt | null = null;
  // The navigator walks the room's floor while inside (it sits on the tile grid far from the map).
  const passableTile = (q: number, r: number): boolean => (room?.inside(q, r) ? room.walkable(q, r) : terrain.passable(q, r));
  const nav = createNavigator({ passable: passableTile, stepCost: (q, r) => (room?.inside(q, r) ? 1 : terrain.stepCost(q, r)) });

  const chunks = createChunkLayer(scene, source, around, (q, r) => terrain.natural(q, r), edits, ctx.seed);
  const towns = createSettlements(scene, ctx.layout.settlements);
  const things = createWorldThings({ scene, getState: st, seed: ctx.seed, layout: ctx.layout, towns: towns.spots, nameOf, terrain, drawn: chunks.drawn, propsNear: chunks.propsNear, roadPoint: nav.roadPoint });
  // Town stores, tier pennants, zone stakes, war and pact marks (world/civic-marks).
  const civic = createCivicMarks(scene, towns.spots);
  const clock = createDayClock(0.3);
  const fx = createLightFx(scene);
  const townOf = (p: Pt): string | null => {
    if (room) return room.building.townId;
    return ctx.layout.settlements.find((t) => inTownBox(t, p))?.id ?? null;
  };
  const tone = createTownTone(session, new Map(towns.spots.map((s) => [s.town.id, { x: s.centre.x, y: s.centre.y - 40 }])), () => st()?.player.townId);

  const tileOf = (p: Pt) => nav.tileAt(p.x, p.y);
  const setOutdoorsVisible = (on: boolean) => { chunks.setVisible(on); towns.setVisible(on); things.setVisible(on); civic.setVisible(on); };

  const refresh: WorldApi['refresh'] = (what = 'all') => {
    const all = what === 'all';
    if (all || what === 'nodes') things.nodes.refresh();
    if (all || what === 'chests') things.chests.refresh();
    if (all || what === 'ground') things.ground.refresh();
    if (all || what === 'plots') things.plots.refresh();
    if (all || what === 'edits') chunks.refreshEdits(edits());
    if (all) { things.facilities.refresh(); things.graves.refresh(); things.work.refresh(); towns.refresh(st(), session.townDespair()); }
    if (all) civic.refresh(st());
  };

  let lastKey = '';
  let pending = false;
  const syncChunks = (p: Pt, force = false): void => {
    const t = tileOf(p);
    const key = `${Math.floor(t.q / CHUNK_SIZE)},${Math.floor(t.r / CHUNK_SIZE)}`;
    if (!force && !pending && key === lastKey) return;
    lastKey = key;
    pending = chunks.sync(t.q, t.r, force);
  };

  const leaveRoom = (): void => {
    if (!room) return;
    const left = room.building;
    room.destroy();
    room = null;
    scene.cameras.main.removeBounds();
    setOutdoorsVisible(true);
    const back = returnTo ?? left.door;
    returnTo = null;
    const t = tileOf(back);
    const at = passableTile(t.q, t.r) ? null : nav.snap(t.q, t.r, 4);
    const out = at ? tileFoot(at.q, at.r) : back;
    ctx.actors?.player.setPos(out);
    syncChunks(out, true);
    scene.cameras.main.centerOn(out.x, out.y);
    scene.cameras.main.fadeIn(200, 20, 16, 12);
    ctx.events.emit('room-leave', { buildingId: left.id });
  };

  // Old saves keyed per-building flags (lanterns) by plan index. Once per loaded state, on first use (a room
  // entered, or the next poll), every town's keys move to the stable ids — while this build's plan still
  // matches the one the save was made with, and before the next save writes them back out.
  const adopted = new WeakSet<object>();
  const adoptOnce = (): void => {
    const s = st();
    if (!s || adopted.has(s)) return;
    adopted.add(s);
    adoptLegacyBuildingFlags(s, towns.spots.flatMap((x) => x.buildings));
  };

  const keeperSeen = new Map<string, string>();
  const enterRoom = (buildingId: string): boolean => {
    if (room) return false;
    const b = towns.spots.flatMap((s) => s.buildings).find((x) => x.id === buildingId);
    if (!b) return false;
    adoptOnce();
    const s = st();
    const spot = towns.spots.find((x) => x.town.id === b.townId);
    const alive = (id: string | undefined): string | undefined => (id && s?.people[id] ? id : undefined);
    // Furnish for the building's keeper — the people layer's home for it, so the room matches who the
    // street sees go in, through arrivals and departures. Nobody housed (no actors yet): the keeper this
    // room was last furnished for, so it holds still between visits, else the building's dealt occupant.
    const who = alive(ctx.actors?.keeperOf(b.id)) ?? alive(keeperSeen.get(b.id))
      ?? (s && spot ? occupantOf(b, spot.buildings, Object.values(s.people).filter((p) => p.townId === b.townId).map((p) => p.id)) : undefined);
    if (who) keeperSeen.set(b.id, who);
    room = buildRoom(scene, b, !!s && lanternLit(s, b.id), s ? roomOccupant(s, who) : {});
    returnTo = { x: b.door.x, y: b.door.y + 12 };
    setOutdoorsVisible(false);
    ctx.actors?.player.stop();
    ctx.actors?.player.setPos(room.spawn);
    // Bounds at least the viewport, centred on the room: the following camera holds still inside.
    const cam = scene.cameras.main;
    const vw = cam.width / cam.zoom, vh = cam.height / cam.zoom;
    const bw = Math.max(vw, room.rect.w), bh = Math.max(vh, room.rect.h);
    cam.setBounds(room.rect.x + room.rect.w / 2 - bw / 2, room.rect.y + room.rect.h / 2 - bh / 2, bw, bh);
    cam.centerOn(room.centre.x, room.centre.y);
    cam.fadeIn(220, 20, 16, 12);
    ctx.events.emit('room-enter', { buildingId });
    return true;
  };

  const api: WorldApi = {
    nav,
    foot: (t) => tileFoot(t.q, t.r),
    tileOf,
    passable: (p) => { const t = tileOf(p); return passableTile(t.q, t.r); },
    spawnPoint(townId) {
      const s = towns.byId.get(townId) ?? towns.spots[0];
      if (!s) return { x: TILE_PX / 2, y: TILE_PX };
      const t = tileOf(s.spawn), at = nav.snap(t.q, t.r, 8);
      return at && (at.q !== t.q || at.r !== t.r) ? tileFoot(at.q, at.r) : s.spawn;
    },
    townAt: townOf,
    things(near, radius, facing) {
      let out: Thing[];
      if (room) {
        const e = room.exit;
        out = Math.hypot(e.x - near.x, e.y - near.y) <= radius
          ? [{ key: `door:${EXIT_DOOR}`, kind: 'door', id: EXIT_DOOR, x: e.x, y: e.y, reach: room.exitReach, label: 'Door', target: { kind: 'door', id: EXIT_DOOR } }]
          : [];
        const counter = counterThing({ buildingId: room.building.id, kind: room.building.kind, seat: room.seats[0] }, keeperSeen.get(room.building.id), near, radius);
        if (counter) out.push(counter);
      } else out = things.things(near, radius, facing);
      return out.sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y));
    },
    refresh,
    phase: () => clock.phase(),
    setPhase: (p) => clock.set(p),
    room: () => (room ? { buildingId: room.building.id, townId: room.building.townId, kind: room.building.kind, seats: room.seats.map((p) => ({ ...p })), exit: { ...room.exit } } : null),
    enterRoom,
    leaveRoom,
    update(dt, player) {
      const time = scene.time.now;
      clock.advance(dt);
      tone.update(dt);
      poll += dt;
      if (poll > POLL_S) { poll = 0; adoptOnce(); refresh('all'); }
      const phase = clock.phase(), night = nightAt(phase), day = lightAt(phase);
      if (room) {
        room.update(time);
        if (poll === 0) { const s = st(); room.setLantern(!!s && lanternLit(s, room.building.id)); }
        const d = tone.despair()[room.building.townId] ?? 0;
        const soft: [number, number, number] = [0.55 + day[0] * 0.45, 0.55 + day[1] * 0.45, 0.55 + day[2] * 0.45];
        fx?.apply({ day: soft, night: night * 0.5, towns: [{ ...room.centre, despair: d, warm: 0 }], lights: [], townR: [4000, 10] });
        return;
      }
      // Fields first, so a chunk mounted this frame already shows today's crop stage.
      restageFields(st()?.day);
      syncChunks(player);
      things.nodes.update(player);
      things.facilities.update(time);
      things.work.update();
      towns.update(time, player, night);
      const lights = towns.spots
        .filter((s) => Math.hypot(s.hearth.x - player.x, s.hearth.y - player.y) < LIGHT_RANGE)
        .map((s) => ({ x: s.hearth.x, y: s.hearth.y - 8, radius: 170 }));
      fx?.apply({ day, night, towns: tone.tones(), lights, townR: [320, 260] });
    },
  };
  let poll = 0;

  // First draw: everything from the session, chunks around the start town.
  refresh('all');
  const start = api.spawnPoint(session.snapshot().townId);
  syncChunks(start, true);
  const offs = [
    ctx.events.on('act', () => refresh('all')),
    ctx.events.on('dawn', () => refresh('all')),
    ctx.events.on('state-replaced', () => { leaveRoom(); tone.snap(); chunks.invalidate(); lastKey = ''; refresh('all'); }),
  ];
  // Standing still by a tree, rock or fire sits you down (no rest verbs on the ring).
  const offLinger = attachLinger(ctx, chunks.propsNear);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    for (const off of offs) off();
    tone.destroy();
    room?.destroy();
    things.destroy();
    civic.destroy();
    towns.destroy();
    chunks.destroy();
    fx?.destroy();
    offLinger();
  });
  setWorldInternals(ctx, { terrain, chunks, things, tone, towns, syncChunks, nameOf });
  civicMarksOf.set(ctx, civic);
  return api;
}

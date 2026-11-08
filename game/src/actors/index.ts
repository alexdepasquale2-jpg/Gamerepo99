/**
 * ACTORS area: the player (keys, tap-to-walk, body from traits, the brood), villagers (homes, schedules,
 * looks, marks, leaders, newcomers), animals, and traffic on the roads. Everything culls to the camera.
 * See game/README.md.
 */
import type { ActorsApi, GameContext, Pt, Thing } from '../app/contracts';
import { registerDevHook } from '../app/dev-hooks';
import { getWalkMul, setWalkMul } from '../dev/dev-flags';
import { TILE_PX } from '../sim/map/constants';
import { createBrood, type BroodCtl } from './brood';
import { createFauna, type FaunaCtl } from './fauna';
import { createNameLayer, type NameLayer } from './name-layer';
import { createPeople, type PeopleCtl } from './people';
import { createPlayer, type PlayerCtl } from './player';
import { createTownIndex } from './towns';
import { createWagons, type WagonsCtl } from './wagons';
import { createRoomFolk } from './room-folk';

type Internals = { player: PlayerCtl; people: PeopleCtl; fauna: FaunaCtl; wagons: WagonsCtl; brood: BroodCtl; names: NameLayer };
const runs = new WeakMap<GameContext, Internals>();

export function attachActors(ctx: GameContext): ActorsApi {
  const towns = createTownIndex(ctx.layout.settlements);
  const player = createPlayer(ctx, towns);
  const people = createPeople(ctx, towns);
  const fauna = createFauna(ctx, towns);
  const wagons = createWagons(ctx);
  const brood = createBrood(ctx, player);
  const names = createNameLayer(ctx.scene);
  const roomFolk = createRoomFolk(ctx, people);
  runs.set(ctx, { player, people, fauna, wagons, brood, names });

  const sync = (): void => {
    people.sync();
    player.refreshLook();
  };
  const offs = [ctx.events.on('state-replaced', sync)];
  let time = 0;

  const teardown = (): void => {
    offs.forEach((off) => off());
    names.destroy();
    roomFolk.destroy();
    people.destroy();
    fauna.destroy();
    wagons.destroy();
    brood.destroy();
    player.destroy();
  };
  ctx.scene.events.once('shutdown', teardown);
  ctx.scene.events.once('destroy', () => names.destroy());

  return {
    player,
    headOf: (id) => (id === 'player' ? player.head() : roomFolk.headOf(id) ?? people.headOf(id)),
    things(near: Pt, radius: number): Thing[] {
      if (ctx.world.room()) return roomFolk.things(near, radius);
      const out = [...people.things(near, radius), ...fauna.things(near, radius), ...wagons.things(near, radius)];
      const d = (t: Thing) => (t.x - near.x) ** 2 + (t.y - near.y) ** 2;
      return out.sort((a, b) => d(a) - d(b));
    },
    sync,
    update(dt) {
      time += dt;
      const p = player.pos();
      names.begin();
      player.update(dt, time);
      brood.update(dt, time);
      people.update(dt, time, p, names);
      fauna.update(dt, time, p);
      wagons.update(dt, time, names);
      roomFolk.update(names);
      names.end();
    },
    brood,
    residentsOf: (b) => people.residentsOf(b),
    lookOf: (id) => people.lookOf(id),
  };
}

const internals = (ctx: GameContext): Internals => {
  const i = runs.get(ctx);
  if (!i) throw new Error('actors not attached');
  return i;
};

registerDevHook('people', (ctx) => () => internals(ctx).people.list());
registerDevHook('teleportTo', (ctx) => (personId: string) => {
  const { people } = internals(ctx);
  const who = people.list().find((p) => p.id === personId);
  if (!who) return false;
  const st = ctx.session.getState();
  if (st && st.player.townId !== who.townId) ctx.arriveAt(who.townId);
  ctx.world.leaveRoom();
  ctx.actors.player.setPos({ x: who.x + TILE_PX, y: who.y + 4 });
  return true;
});
registerDevHook('speed', () => ({ get: () => getWalkMul(), set: (n: number) => setWalkMul(n) }));
registerDevHook('fauna', (ctx) => () => internals(ctx).fauna.list());
registerDevHook('traffic', (ctx) => () => internals(ctx).wagons.list());
registerDevHook('actorThings', (ctx) => (radius = 160) => ctx.actors.things(ctx.actors.player.pos(), radius).map((t) => ({ key: t.key, label: t.label, x: Math.round(t.x), y: Math.round(t.y) })));
registerDevHook('brood', (ctx) => ({
  withYou: () => ctx.actors.brood.withYou(),
  here: () => ctx.actors.brood.here(),
  elsewhere: () => ctx.actors.brood.elsewhere(),
  leave: () => ctx.actors.brood.leave(),
  callBack: () => ctx.actors.brood.callBack(),
  switchTo: (id: string) => ctx.actors.brood.switchTo(id),
}));

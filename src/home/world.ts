import { applyFields, stepActor } from './ai';
import { actorById, actorStrength, canHarm, dist, killPlayer, stepHazards, stepShots } from './combat';
import { circleBlocked, createLaMancha, tryMove } from './map';
import { deriveRng } from '../sim/rng';
import { emptyBook } from './book';
import { defOf, packCount } from './roster';
import { resolveTug, struggleScale } from './tug';
import type { Actor, BuildingKind, HomeEvent, HomeInput, HomeWorld } from './types';

export type CreateHomeOpts = {
  seed: number;
  book?: HomeWorld['book'];
  /** Default true. Tests pass false and place actors themselves. */
  populate?: boolean;
  mercyMs?: number;
};

export function createHomeWorld(opts: CreateHomeOpts): HomeWorld {
  const map = createLaMancha(opts.seed);
  const populate = opts.populate !== false;
  const world: HomeWorld = {
    seed: opts.seed,
    timeMs: 0,
    map,
    player: {
      x: map.width / 2,
      y: map.height / 2,
      vx: 0,
      vy: 0,
      kx: 0,
      ky: 0,
      alive: true,
      stunMs: 0,
      slipMs: 0,
      reeledBy: null,
      radius: 8,
    },
    buildings: [],
    shots: [],
    hazards: [],
    book: opts.book ?? emptyBook(),
    mercyMs: opts.mercyMs ?? (populate ? 1800 : 0),
    contestMs: 0,
    rng: deriveRng(opts.seed, 'home'),
    nextId: 1,
    deaths: opts.book?.totalDeaths ?? 0,
    tug: null,
    lastEpitaph: null,
    epitaphMs: 0,
    respawnMs: 0,
  };
  if (populate) placeTown(world);
  return world;
}

export function addBuilding(world: HomeWorld, kind: BuildingKind, x: number, y: number): Actor {
  const def = defOf(kind);
  const actor: Actor = {
    id: `b${world.nextId++}`,
    kind,
    x,
    y,
    homeX: x,
    homeY: y,
    vx: 0,
    vy: 0,
    facing: 0,
    state: def.playable ? 'doze' : 'stub',
    stateMs: 0,
    cooldownMs: 0,
    attackId: null,
    resolved: false,
    scale: 1,
    swallows: 0,
    brawlTarget: null,
    brawlCd: 0,
    burstMs: 0,
    contactMs: 0,
    prevDist: Number.POSITIVE_INFINITY,
    packId: null,
    radius: def.radius,
  };
  world.buildings.push(actor);
  return actor;
}

function spot(world: HomeWorld, taken: Array<{ x: number; y: number }>, minDist: number): { x: number; y: number } {
  const cx = world.map.width / 2;
  const cy = world.map.height / 2;
  for (let i = 0; i < 70; i++) {
    const ang = world.rng.next() * Math.PI * 2;
    const rad = 220 + world.rng.next() * 320;
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad;
    if (y < 80 || x < 80 || x > world.map.width - 80 || y > world.map.height - 80) continue;
    if (circleBlocked(world.map, x, y, 18)) continue;
    if (taken.some((p) => Math.hypot(p.x - x, p.y - y) < minDist)) continue;
    return { x, y };
  }
  const ang = world.rng.next() * Math.PI * 2;
  return { x: cx + Math.cos(ang) * 280, y: cy + Math.sin(ang) * 200 };
}

function placeTown(world: HomeWorld): void {
  const taken: Array<{ x: number; y: number }> = [];
  const drop = (kind: BuildingKind, minDist: number): Actor => {
    const at = spot(world, taken, minDist);
    taken.push(at);
    return addBuilding(world, kind, at.x, at.y);
  };
  drop('outhouse', 110);
  drop('outhouse', 110);
  drop('well', 140);
  drop('farmhouse', 130);
  drop('farmhouse', 130);
  drop('bakery', 130);
  drop('tavern', 130);
  drop('blacksmith', 130);
  drop('windmill', 150);

  const anchor = spot(world, taken, 120);
  const packId = `pack${world.nextId}`;
  const count = packCount(world.rng.next());
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    let x = anchor.x + Math.cos(ang) * 42;
    let y = anchor.y + Math.sin(ang) * 42;
    if (circleBlocked(world.map, x, y, 14)) {
      x = anchor.x;
      y = anchor.y;
    }
    const stall = addBuilding(world, 'market_stall', x, y);
    stall.packId = packId;
    taken.push({ x, y });
  }
}

function integratePlayer(world: HomeWorld, input: HomeInput, dt: number): void {
  const player = world.player;
  const dtS = dt / 1000;
  player.stunMs = Math.max(0, player.stunMs - dt);
  player.slipMs = Math.max(0, player.slipMs - dt);
  let ix = input.x;
  let iy = input.y;
  if (player.slipMs > 0) {
    const turned = ix;
    ix = -iy;
    iy = turned;
  }
  const mag = Math.hypot(ix, iy);
  if (player.stunMs <= 0 && mag > 0) {
    const spd = 122 * (player.slipMs > 0 ? 1.28 : 1);
    player.vx = (ix / mag) * spd;
    player.vy = (iy / mag) * spd;
  } else {
    player.vx = 0;
    player.vy = 0;
  }
  player.vx += player.kx;
  player.vy += player.ky;
  const decay = Math.exp(-3.4 * dtS);
  player.kx *= decay;
  player.ky *= decay;
  if (Math.hypot(player.kx, player.ky) < 4) {
    player.kx = 0;
    player.ky = 0;
  }
  tryMove(world.map, player, player.radius, player.vx * dtS, player.vy * dtS);
}

function ragdoll(world: HomeWorld, dt: number): void {
  const player = world.player;
  const dtS = dt / 1000;
  const decay = Math.exp(-1.3 * dtS);
  player.kx *= decay;
  player.ky *= decay;
  tryMove(world.map, player, player.radius, player.kx * dtS, player.ky * dtS);
  for (const actor of world.buildings) {
    if (actor.state !== 'swallow') continue;
    actor.stateMs += dt;
  }
  world.respawnMs -= dt;
  if (world.respawnMs <= 0) respawn(world);
}

export function respawn(world: HomeWorld): void {
  const player = world.player;
  player.x = world.map.width / 2;
  player.y = world.map.height / 2;
  player.vx = 0;
  player.vy = 0;
  player.kx = 0;
  player.ky = 0;
  player.alive = true;
  player.stunMs = 0;
  player.slipMs = 0;
  player.reeledBy = null;
  world.mercyMs = 1500;
  world.contestMs = 0;
  world.tug = null;
  world.respawnMs = 0;
  world.shots = [];
  world.hazards = [];
  for (const actor of world.buildings) {
    actor.x = actor.homeX;
    actor.y = actor.homeY;
    actor.vx = 0;
    actor.vy = 0;
    actor.attackId = null;
    actor.brawlTarget = null;
    actor.contactMs = 0;
    actor.burstMs = 0;
    actor.cooldownMs = 0;
    actor.prevDist = Number.POSITIVE_INFINITY;
    actor.state = defOf(actor.kind).playable ? 'doze' : 'stub';
    actor.stateMs = 0;
    actor.resolved = false;
  }
}

function separate(world: HomeWorld): void {
  const list = world.buildings;
  for (let i = 0; i < list.length; i++) {
    const a = list[i]!;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const need = (a.radius + b.radius) * 0.62;
      if (d >= need) continue;
      const push = (need - d) / 2;
      a.x -= (dx / d) * push;
      a.y -= (dy / d) * push;
      b.x += (dx / d) * push;
      b.y += (dy / d) * push;
    }
  }
}

function resolveContest(world: HomeWorld, input: HomeInput, dt: number, events: HomeEvent[]): void {
  if (!world.player.alive) return;
  const grabbers = world.buildings.filter((actor) => {
    if (actor.state !== 'grab' && actor.state !== 'tug') return false;
    return dist(actor.x, actor.y, world.player.x, world.player.y) < actor.radius + 72;
  });
  if (grabbers.length === 0) {
    world.contestMs = 0;
    world.tug = null;
    return;
  }
  world.contestMs += dt;
  if (grabbers.length === 1) {
    const only = grabbers[0]!;
    const d = dist(only.x, only.y, world.player.x, world.player.y) || 1;
    let pullX = ((only.x - world.player.x) / d) * 110;
    let pullY = ((only.y - world.player.y) / d) * 110;
    const scale = struggleScale(input.x, input.y, pullX, pullY);
    pullX *= scale;
    pullY *= scale;
    tryMove(world.map, world.player, world.player.radius, pullX * (dt / 1000), pullY * (dt / 1000));
    world.tug = { winnerId: only.id, stalemate: false, margin: 1 };
    if (canHarm(world) && world.contestMs >= 700 && dist(only.x, only.y, world.player.x, world.player.y) < only.radius + 18) {
      killPlayer(world, only, 'swallow', events);
    }
    return;
  }
  for (const actor of grabbers) actor.state = 'tug';
  const resolved = resolveTug(
    grabbers.map((actor) => ({
      id: actor.id,
      kind: actor.kind,
      x: actor.x,
      y: actor.y,
      strength: actorStrength(world, actor),
    })),
    world.player.x,
    world.player.y,
    world.contestMs,
  );
  const scale = struggleScale(input.x, input.y, resolved.pullX, resolved.pullY);
  tryMove(
    world.map,
    world.player,
    world.player.radius,
    resolved.pullX * scale * (dt / 1000),
    resolved.pullY * scale * (dt / 1000),
  );
  world.tug = { winnerId: resolved.winnerId, stalemate: resolved.stalemate, margin: resolved.margin };
  if (resolved.swallow && resolved.winnerId) {
    const winner = actorById(world, resolved.winnerId);
    if (winner) killPlayer(world, winner, 'swallow', events);
  }
}

function slipIntoABuilding(world: HomeWorld, events: HomeEvent[]): void {
  if (!canHarm(world) || world.player.slipMs <= 0) return;
  for (const actor of world.buildings) {
    if (dist(actor.x, actor.y, world.player.x, world.player.y) > actor.radius + world.player.radius) continue;
    const tavern = world.buildings.find((b) => b.kind === 'tavern' && defOf(b.kind).playable);
    killPlayer(world, tavern ?? actor, tavern ? 'wine_slip' : 'swallow', events);
    return;
  }
}

/** One simulation step. Mutates `world` and returns presentation events. */
export function stepHome(world: HomeWorld, input: HomeInput, dtMs: number): HomeEvent[] {
  const dt = Math.max(0, Math.min(100, dtMs));
  if (dt === 0) return [];
  const events: HomeEvent[] = [];
  world.timeMs += dt;
  world.mercyMs = Math.max(0, world.mercyMs - dt);
  world.epitaphMs = Math.max(0, world.epitaphMs - dt);
  if (!world.player.alive) {
    ragdoll(world, dt);
    return events;
  }
  integratePlayer(world, input, dt);
  stepShots(world, dt, events);
  stepHazards(world, dt, events);
  const order = [...world.buildings].sort((a, b) => a.id.localeCompare(b.id));
  for (const actor of order) stepActor(world, actor, dt, events);
  applyFields(world, dt);
  slipIntoABuilding(world, events);
  resolveContest(world, input, dt, events);
  separate(world);
  return events;
}

export { actorSpeed, actorStrength } from './combat';

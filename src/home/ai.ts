import { actorById, actorSpeed, canHarm, connectAttack, dist, enter, killPlayer, launchShot } from './combat';
import { circleBlocked, tryMove } from './map';
import { attackOf, defOf } from './roster';
import type { Actor, AiState, AttackDef, HomeEvent, HomeWorld } from './types';

function face(actor: Actor, x: number, y: number): void {
  actor.facing = Math.atan2(y - actor.y, x - actor.x);
}

function steer(world: HomeWorld, actor: Actor, tx: number, ty: number, speed: number, dt: number): void {
  if (speed <= 0) {
    face(actor, tx, ty);
    return;
  }
  const dx = tx - actor.x;
  const dy = ty - actor.y;
  const d = Math.hypot(dx, dy) || 1;
  face(actor, tx, ty);
  if (d < 6) return;
  const step = speed * (dt / 1000);
  const ux = (dx / d) * step;
  const uy = (dy / d) * step;
  const radius = actor.radius * 0.55;
  if (!circleBlocked(world.map, actor.x + ux, actor.y + uy, radius)) {
    actor.x += ux;
    actor.y += uy;
    return;
  }
  const sign = actor.id.charCodeAt(actor.id.length - 1) % 2 === 0 ? 1 : -1;
  const px = (-dy / d) * step * sign;
  const py = (dx / d) * step * sign;
  if (!circleBlocked(world.map, actor.x + px, actor.y + py, radius)) {
    actor.x += px;
    actor.y += py;
  }
}

function nearestBuilding(world: HomeWorld, actor: Actor, range: number): Actor | null {
  let best: Actor | null = null;
  let bestD = range;
  for (const other of world.buildings) {
    if (other.id === actor.id || other.state === 'stub') continue;
    const d = dist(actor.x, actor.y, other.x, other.y);
    if (d < bestD) {
      best = other;
      bestD = d;
    }
  }
  return best;
}

function pickAttack(world: HomeWorld, actor: Actor, dPlayer: number): AttackDef | null {
  if (actor.cooldownMs > 0) return null;
  const starters = defOf(actor.kind).attacks.filter((a) => a.starter && dPlayer <= a.range);
  if (starters.length === 0) return null;
  // Prefer a lethal option when one is in range, otherwise any starter. Ties use the rng.
  const lethal = starters.filter((a) => a.kill && !a.shot);
  const pool = lethal.length > 0 && dPlayer < 70 ? lethal : starters;
  const index = world.rng.int(0, pool.length);
  return pool[index] ?? null;
}

function startBrawl(actor: Actor, other: Actor): void {
  enter(actor, 'brawl');
  enter(other, 'brawl');
  actor.brawlTarget = other.id;
  other.brawlTarget = actor.id;
  actor.brawlCd = 1400;
  other.brawlCd = 1400;
}

function crowdNearPlayer(world: HomeWorld, actor: Actor): boolean {
  return world.buildings.some((other) => other.id !== actor.id && other.state !== 'stub' && other.state !== 'doze' && dist(other.x, other.y, world.player.x, world.player.y) < 120);
}

export function stepActor(world: HomeWorld, actor: Actor, dt: number, events: HomeEvent[]): void {
  const def = defOf(actor.kind);
  if (!def.playable) {
    actor.state = 'stub';
    return;
  }
  actor.cooldownMs = Math.max(0, actor.cooldownMs - dt);
  actor.burstMs = Math.max(0, actor.burstMs - dt);
  actor.brawlCd = Math.max(0, actor.brawlCd - dt);
  const dPlayer = dist(actor.x, actor.y, world.player.x, world.player.y);
  const speed = actorSpeed(world, actor);

  switch (actor.state) {
    case 'stub':
      return;
    case 'doze':
      if (world.mercyMs > 0) return;
      if (dPlayer < def.wake) {
        enter(actor, 'seek');
        if (actor.kind === 'outhouse') actor.burstMs = 680;
      }
      return;
    case 'swallow':
      actor.stateMs += dt;
      if (actor.stateMs > 520) enter(actor, 'seek');
      return;
    case 'lure': {
      face(actor, world.player.x, world.player.y);
      if (canHarm(world) && dPlayer < actor.radius + 16) {
        const door = attackOf(actor.kind, 'open_door');
        if (door) killPlayer(world, actor, door.id, events);
        return;
      }
      if (dPlayer > 180) enter(actor, 'seek');
      actor.prevDist = dPlayer;
      return;
    }
    case 'reel': {
      face(actor, world.player.x, world.player.y);
      actor.stateMs += dt;
      if (canHarm(world) && dPlayer < actor.radius + 12) {
        killPlayer(world, actor, 'bucket_dunk', events);
        return;
      }
      if (actor.stateMs > 2400 || world.player.reeledBy !== actor.id) {
        world.player.reeledBy = null;
        enter(actor, 'recover');
        actor.cooldownMs = 400;
      }
      return;
    }
    case 'grab':
    case 'tug':
      face(actor, world.player.x, world.player.y);
      actor.stateMs += dt;
      // Hold the rope. Letting go early turns the contest into a free hit.
      if (dPlayer > actor.radius + 130) enter(actor, 'seek');
      return;
    case 'brawl': {
      actor.stateMs += dt;
      const other = actorById(world, actor.brawlTarget);
      if (!other || other.state === 'stub') {
        enter(actor, 'seek');
        return;
      }
      steer(world, actor, other.x, other.y, speed, dt);
      const gap = dist(actor.x, actor.y, other.x, other.y);
      if (gap < actor.radius + other.radius * 0.45 && !actor.resolved) {
        actor.resolved = true;
        const mx = (actor.x + other.x) / 2;
        const my = (actor.y + other.y) / 2;
        if (canHarm(world) && dist(mx, my, world.player.x, world.player.y) < 34) {
          const bully = actor.kind === 'tavern' || other.kind !== 'tavern' ? actor : other;
          const killer = actor.kind === 'tavern' ? actor : other.kind === 'tavern' ? other : bully;
          killPlayer(world, killer, 'brawl', events);
        }
      }
      if (actor.stateMs > 920) enter(actor, 'seek');
      return;
    }
    case 'windup': {
      actor.stateMs += dt;
      const attack = actor.attackId ? attackOf(actor.kind, actor.attackId) : undefined;
      const creep = actor.burstMs > 0 ? speed : speed * 0.35;
      if (!def.stationary) steer(world, actor, world.player.x, world.player.y, creep, dt);
      else face(actor, world.player.x, world.player.y);
      if (attack && actor.stateMs >= attack.windupMs) enter(actor, 'strike');
      else if (!attack) enter(actor, 'seek');
      return;
    }
    case 'strike': {
      const attack = actor.attackId ? attackOf(actor.kind, actor.attackId) : undefined;
      if (!attack) {
        enter(actor, 'seek');
        return;
      }
      if (!actor.resolved) {
        actor.resolved = true;
        resolveStrike(world, actor, attack, dPlayer, events);
      }
      actor.stateMs += dt;
      if (actor.stateMs >= attack.activeMs) {
        actor.cooldownMs = attack.cooldownMs;
        enter(actor, 'recover');
      }
      return;
    }
    case 'recover':
      actor.stateMs += dt;
      if (actor.stateMs >= 180) enter(actor, 'seek');
      maybeGrab(world, actor, dPlayer);
      return;
    case 'seek':
      stepSeek(world, actor, dt, dPlayer, speed, events);
      return;
    default: {
      const neverState: never = actor.state;
      return neverState;
    }
  }
}

function resolveStrike(world: HomeWorld, actor: Actor, attack: AttackDef, dPlayer: number, events: HomeEvent[]): void {
  if (attack.shot) {
    launchShot(world, actor, attack);
    return;
  }
  const reach = Math.max(attack.range, attack.aoe);
  if (dPlayer <= reach) connectAttack(world, actor, attack, events);
}

function maybeGrab(world: HomeWorld, actor: Actor, dPlayer: number): void {
  if (actor.state !== 'seek' && actor.state !== 'recover') return;
  if (!canHarm(world)) return;
  if (dPlayer > actor.radius + 20) return;
  if (!crowdNearPlayer(world, actor)) return;
  enter(actor, 'grab');
}

function stepSeek(world: HomeWorld, actor: Actor, dt: number, dPlayer: number, speed: number, events: HomeEvent[]): void {
  const def = defOf(actor.kind);
  if (def.brawlAll && actor.brawlCd <= 0) {
    const other = nearestBuilding(world, actor, 112);
    if (other && other.state !== 'brawl' && other.state !== 'swallow') {
      startBrawl(actor, other);
      return;
    }
  }
  if (!def.brawlAll && actor.brawlCd <= 0 && def.rivals.length > 0) {
    const rival = world.buildings.find((other) => other.id !== actor.id && def.rivals.includes(other.kind) && dist(actor.x, actor.y, other.x, other.y) < 96);
    if (rival && (rival.state === 'seek' || rival.state === 'recover' || rival.state === 'windup')) {
      startBrawl(actor, rival);
      return;
    }
  }
  if (def.lure && actor.prevDist < 10_000 && dPlayer < 150 && dPlayer < actor.prevDist - 0.4 && actor.cooldownMs <= 0) {
    enter(actor, 'lure');
    actor.prevDist = dPlayer;
    return;
  }
  const attack = pickAttack(world, actor, dPlayer);
  if (attack && world.player.alive) {
    actor.attackId = attack.id;
    enter(actor, 'windup');
    actor.prevDist = dPlayer;
    return;
  }
  if (!def.stationary) {
    const packOff = packOffset(actor);
    steer(world, actor, world.player.x + packOff.x, world.player.y + packOff.y, speed, dt);
  } else {
    face(actor, world.player.x, world.player.y);
  }
  // Suction hub: held against the mill long enough.
  if (def.suction > 0 && canHarm(world)) {
    if (dPlayer < actor.radius + 6) {
      actor.contactMs += dt;
      if (actor.contactMs > 300) killPlayer(world, actor, 'suction_hub', events);
    } else actor.contactMs = 0;
  }
  actor.prevDist = dPlayer;
  maybeGrab(world, actor, dist(actor.x, actor.y, world.player.x, world.player.y));
}

function packOffset(actor: Actor): { x: number; y: number } {
  if (!actor.packId) return { x: 0, y: 0 };
  const n = actor.id.charCodeAt(actor.id.length - 1);
  const ang = ((n % 4) / 4) * Math.PI * 2;
  return { x: Math.cos(ang) * 36, y: Math.sin(ang) * 28 };
}

export function applyFields(world: HomeWorld, dt: number): void {
  if (!world.player.alive) return;
  const dtS = dt / 1000;
  const player = world.player;
  for (const actor of world.buildings) {
    const def = defOf(actor.kind);
    if (actor.state === 'doze' || actor.state === 'stub' || actor.state === 'swallow') continue;
    if (def.suction > 0 && world.mercyMs <= 0) {
      const d = dist(actor.x, actor.y, player.x, player.y);
      if (d < def.suctionRange && d > 0.5) {
        tryMove(world.map, player, player.radius, ((actor.x - player.x) / d) * def.suction * dtS, ((actor.y - player.y) / d) * def.suction * dtS);
      }
    }
    if (actor.state === 'lure' && world.mercyMs <= 0) {
      const d = dist(actor.x, actor.y, player.x, player.y);
      if (d < 170 && d > 0.5) {
        tryMove(world.map, player, player.radius, ((actor.x - player.x) / d) * 36 * dtS, ((actor.y - player.y) / d) * 36 * dtS);
      }
    }
    if (actor.state === 'reel' && player.reeledBy === actor.id) {
      const d = dist(actor.x, actor.y, player.x, player.y);
      if (d > 0.5) {
        tryMove(world.map, player, player.radius, ((actor.x - player.x) / d) * 155 * dtS, ((actor.y - player.y) / d) * 155 * dtS);
      }
    }
  }
}

export type { AiState };

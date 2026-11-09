import { describeEnd, endKey, recordEnd } from './book';
import { attackOf, defOf } from './roster';
import type { Actor, AttackDef, Hazard, HomeEvent, HomeWorld, Shot } from './types';

export function canHarm(world: HomeWorld): boolean {
  return world.player.alive && world.mercyMs <= 0;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function actorById(world: HomeWorld, id: string | null): Actor | undefined {
  if (!id) return undefined;
  return world.buildings.find((b) => b.id === id);
}

export function enter(actor: Actor, state: Actor['state']): void {
  actor.state = state;
  actor.stateMs = 0;
  actor.resolved = false;
}

export function knockFrom(world: HomeWorld, fromX: number, fromY: number, power: number): void {
  const dx = world.player.x - fromX;
  const dy = world.player.y - fromY;
  const d = Math.hypot(dx, dy) || 1;
  world.player.kx += (dx / d) * power;
  world.player.ky += (dy / d) * power;
  const mag = Math.hypot(world.player.kx, world.player.ky);
  if (mag > 520) {
    world.player.kx *= 520 / mag;
    world.player.ky *= 520 / mag;
  }
}

export function rivalNearby(world: HomeWorld, actor: Actor): boolean {
  const rivals = defOf(actor.kind).rivals;
  if (rivals.length === 0) return false;
  return world.buildings.some((other) => other.id !== actor.id && rivals.includes(other.kind) && dist(other.x, other.y, world.player.x, world.player.y) < 300);
}

export function actorSpeed(world: HomeWorld, actor: Actor): number {
  const def = defOf(actor.kind);
  let speed = def.speed;
  if (actor.scale > 1) speed *= 0.92;
  if (rivalNearby(world, actor)) speed *= 1.22;
  if (actor.burstMs > 0) speed *= 2.15;
  return speed;
}

export function actorStrength(world: HomeWorld, actor: Actor): number {
  const def = defOf(actor.kind);
  return def.strength * actor.scale * (rivalNearby(world, actor) ? 1.35 : 1);
}

export function killPlayer(world: HomeWorld, owner: Actor, attackId: string, events: HomeEvent[]): void {
  if (!world.player.alive) return;
  const described = describeEnd(owner.kind, attackId);
  const attack = attackOf(owner.kind, attackId);
  knockFrom(world, owner.x, owner.y, (attack?.knock ?? 80) + 160);
  world.player.alive = false;
  world.player.reeledBy = null;
  world.respawnMs = 1700;
  world.deaths += 1;
  world.lastEpitaph = described.epitaph;
  world.epitaphMs = 2200;
  world.contestMs = 0;
  world.tug = null;
  owner.swallows += 1;
  owner.scale = Math.min(2.4, owner.scale + 0.16);
  enter(owner, 'swallow');
  world.book = recordEnd(world.book, { kind: owner.kind, attackId, atMs: world.timeMs });
  events.push({
    type: 'death',
    x: world.player.x,
    y: world.player.y,
    epitaph: described.epitaph,
    key: endKey(owner.kind, attackId),
    shake: 0.022,
    stop: 170,
  });
  events.push({ type: 'grow', id: owner.id, scale: owner.scale });
}

function hazardAttackId(ownerKind: Actor['kind'], attackId: string): string {
  if (ownerKind === 'bakery' && attackId === 'flaming_loaf') return 'oven_fire';
  return attackId;
}

export function spawnHazard(world: HomeWorld, owner: Actor, attackId: string, x: number, y: number, hazard: Hazard['hazard']): void {
  world.hazards.push({
    id: world.nextId++,
    ownerId: owner.id,
    kind: owner.kind,
    attackId: hazardAttackId(owner.kind, attackId),
    hazard,
    x,
    y,
    r: hazard === 'wine' ? 36 : 26,
    ttl: hazard === 'wine' ? 2600 : 1800,
    tick: 200,
  });
}

export function launchShot(world: HomeWorld, owner: Actor, attack: AttackDef): void {
  if (!attack.shot) return;
  const ang = Math.atan2(world.player.y - owner.y, world.player.x - owner.x);
  const speed = attack.shotSpeed ?? 180;
  const radius = attack.shot === 'barrel' ? 11 : attack.shot === 'bucket' ? 8 : 6;
  const shot: Shot = {
    id: world.nextId++,
    ownerId: owner.id,
    kind: owner.kind,
    attackId: attack.id,
    shot: attack.shot,
    x: owner.x + Math.cos(ang) * (owner.radius + 6),
    y: owner.y + Math.sin(ang) * (owner.radius + 6),
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    lifeMs: 1500,
    radius,
    kill: attack.kill,
    knock: attack.knock,
    hazard: attack.hazard ?? null,
    stunMs: attack.stunMs,
  };
  world.shots.push(shot);
}

export function connectAttack(world: HomeWorld, owner: Actor, attack: AttackDef, events: HomeEvent[]): void {
  if (!canHarm(world)) return;
  if (attack.stunMs > 0) world.player.stunMs = Math.max(world.player.stunMs, attack.stunMs);
  if (attack.knock > 0) knockFrom(world, owner.x, owner.y, attack.knock);
  events.push({
    type: 'bonk',
    x: world.player.x,
    y: world.player.y - 18,
    text: attack.name,
    shake: attack.kill ? 0.014 : 0.007,
    stop: attack.kill ? 90 : 55,
  });
  if (attack.hazard && !attack.shot) {
    const ang = Math.atan2(world.player.y - owner.y, world.player.x - owner.x);
    const reach = Math.min(attack.range * 0.55, Math.max(20, dist(owner.x, owner.y, world.player.x, world.player.y) * 0.7));
    spawnHazard(world, owner, attack.id, owner.x + Math.cos(ang) * reach, owner.y + Math.sin(ang) * reach, attack.hazard);
  }
  if (attack.kill) killPlayer(world, owner, attack.id, events);
}

export function stepShots(world: HomeWorld, dt: number, events: HomeEvent[]): void {
  const dtS = dt / 1000;
  for (const shot of world.shots) {
    shot.x += shot.vx * dtS;
    shot.y += shot.vy * dtS;
    shot.lifeMs -= dt;
    const hit = dist(shot.x, shot.y, world.player.x, world.player.y) < shot.radius + world.player.radius;
    if (!hit || !canHarm(world)) continue;
    shot.lifeMs = 0;
    const owner = actorById(world, shot.ownerId);
    if (!owner) continue;
    if (shot.shot === 'bucket') {
      enter(owner, 'reel');
      world.player.reeledBy = owner.id;
      events.push({ type: 'bonk', x: shot.x, y: shot.y, text: 'REEL', shake: 0.008, stop: 60 });
      continue;
    }
    if (shot.stunMs > 0) world.player.stunMs = Math.max(world.player.stunMs, shot.stunMs);
    if (shot.knock > 0) knockFrom(world, shot.x, shot.y, shot.knock);
    events.push({
      type: 'bonk',
      x: shot.x,
      y: shot.y,
      text: shot.shot === 'loaf' ? 'LOAF' : shot.shot === 'fruit' ? 'SQUISH' : shot.shot === 'blade' ? 'TING' : 'BONK',
      shake: shot.kill ? 0.013 : 0.006,
      stop: shot.kill ? 80 : 45,
    });
    if (shot.hazard) {
      spawnHazard(world, owner, shot.attackId, shot.x, shot.y, shot.hazard);
      shot.hazard = null;
    }
    if (shot.kill) killPlayer(world, owner, shot.attackId, events);
  }
  const kept: Shot[] = [];
  for (const shot of world.shots) {
    if (shot.lifeMs <= 0) {
      if (shot.hazard && shot.shot !== 'bucket') {
        const owner = actorById(world, shot.ownerId);
        if (owner) spawnHazard(world, owner, shot.attackId, shot.x, shot.y, shot.hazard);
      }
      continue;
    }
    kept.push(shot);
  }
  world.shots = kept;
}

export function stepHazards(world: HomeWorld, dt: number, events: HomeEvent[]): void {
  for (const hazard of world.hazards) {
    hazard.ttl -= dt;
    if (!canHarm(world)) continue;
    const near = dist(hazard.x, hazard.y, world.player.x, world.player.y) < hazard.r + world.player.radius;
    if (!near) continue;
    if (hazard.hazard === 'wine') {
      world.player.slipMs = 520;
      continue;
    }
    hazard.tick -= dt;
    if (hazard.tick > 0) continue;
    hazard.tick = 280;
    const owner = actorById(world, hazard.ownerId);
    if (!owner) continue;
    killPlayer(world, owner, hazard.attackId, events);
  }
  world.hazards = world.hazards.filter((h) => h.ttl > 0);
}

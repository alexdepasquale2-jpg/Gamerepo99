import { describe, expect, it } from 'vitest';
import { actorSpeed } from '../../src/home/combat';
import { defOf } from '../../src/home/roster';
import { addBuilding, createHomeWorld, stepHome } from '../../src/home/world';

function arena(seed = 1) {
  return createHomeWorld({ seed, populate: false, mercyMs: 0 });
}

function steps(world: ReturnType<typeof arena>, n: number, dt = 16, input = { x: 0, y: 0 }) {
  for (let i = 0; i < n; i++) stepHome(world, input, dt);
}

describe('building AI states', () => {
  it('lets a stubbed church stand on the player and do nothing', () => {
    const world = arena();
    const church = addBuilding(world, 'church', world.player.x, world.player.y);
    expect(church.state).toBe('stub');
    steps(world, 40);
    expect(church.state).toBe('stub');
    expect(world.player.alive).toBe(true);
    expect(world.book.entries).toHaveLength(0);
  });

  it('wakes an outhouse from doze into a hunt, then the door jaw ends you', () => {
    const world = arena();
    const shack = addBuilding(world, 'outhouse', world.player.x + 400, world.player.y);
    shack.state = 'doze';
    steps(world, 20);
    expect(shack.state).toBe('doze');
    world.player.x = shack.x + 30;
    world.player.y = shack.y;
    steps(world, 1);
    expect(shack.state === 'doze' || shack.state === 'stub').toBe(false);

    const kill = arena();
    const jaw = addBuilding(kill, 'outhouse', kill.player.x, kill.player.y + 20);
    jaw.state = 'strike';
    jaw.attackId = 'door_jaw';
    jaw.resolved = false;
    stepHome(kill, { x: 0, y: 0 }, 16);
    expect(kill.player.alive).toBe(false);
    expect(kill.book.entries.map((e) => e.key)).toContain('outhouse:door_jaw');
    expect(jaw.swallows).toBe(1);
    expect(jaw.scale).toBeGreaterThan(1);
  });

  it('walks windup into strike for the door jaw', () => {
    const world = arena();
    const shack = addBuilding(world, 'outhouse', world.player.x + 200, world.player.y);
    shack.state = 'windup';
    shack.attackId = 'door_jaw';
    shack.stateMs = 190;
    stepHome(world, { x: 0, y: 0 }, 16);
    expect(shack.state).toBe('strike');
    expect(world.player.alive).toBe(true);
  });

  it('reels a bucket into the well and dunks', () => {
    const world = arena();
    const well = addBuilding(world, 'well', world.player.x + 80, world.player.y);
    well.state = 'strike';
    well.attackId = 'bucket_reel';
    well.resolved = false;
    stepHome(world, { x: 0, y: 0 }, 16);
    expect(world.shots.some((s) => s.shot === 'bucket')).toBe(true);
    const shot = world.shots[0]!;
    shot.x = world.player.x;
    shot.y = world.player.y;
    stepHome(world, { x: 0, y: 0 }, 16);
    expect(world.player.reeledBy).toBe(well.id);
    expect(well.state).toBe('reel');
    world.player.x = well.x + 10;
    world.player.y = well.y;
    stepHome(world, { x: 0, y: 0 }, 16);
    expect(world.player.alive).toBe(false);
    expect(world.book.entries.some((e) => e.key === 'well:bucket_dunk')).toBe(true);
  });

  it('swallows a guest who takes the farmhouse up on its open door', () => {
    const world = arena();
    const house = addBuilding(world, 'farmhouse', world.player.x, world.player.y + 12);
    house.state = 'lure';
    stepHome(world, { x: 0, y: 0 }, 16);
    expect(world.player.alive).toBe(false);
    expect(world.book.entries.some((e) => e.key === 'farmhouse:open_door')).toBe(true);
  });

  it('sucks the player toward the windmill', () => {
    const world = arena();
    const mill = addBuilding(world, 'windmill', world.player.x - 90, world.player.y);
    mill.state = 'seek';
    mill.cooldownMs = 10_000;
    const start = world.player.x;
    steps(world, 12);
    expect(world.player.alive).toBe(true);
    expect(world.player.x).toBeLessThan(start - 6);
  });

  it('stomps, flails, and throws a loaf as different endings', () => {
    const stomp = arena();
    const house = addBuilding(stomp, 'farmhouse', stomp.player.x + 40, stomp.player.y);
    house.state = 'strike';
    house.attackId = 'stomp';
    house.resolved = false;
    stepHome(stomp, { x: 0, y: 0 }, 16);
    expect(stomp.book.entries.some((e) => e.key === 'farmhouse:stomp')).toBe(true);

    const flail = arena();
    const mill = addBuilding(flail, 'windmill', flail.player.x + 40, flail.player.y);
    mill.state = 'strike';
    mill.attackId = 'blade_flail';
    mill.resolved = false;
    stepHome(flail, { x: 0, y: 0 }, 16);
    expect(flail.book.entries.some((e) => e.key === 'windmill:blade_flail')).toBe(true);

    const bake = arena();
    const oven = addBuilding(bake, 'bakery', bake.player.x + 40, bake.player.y);
    oven.state = 'strike';
    oven.attackId = 'flaming_loaf';
    oven.resolved = false;
    stepHome(bake, { x: 0, y: 0 }, 16);
    const loaf = bake.shots.find((s) => s.shot === 'loaf');
    expect(loaf).toBeTruthy();
    loaf!.x = bake.player.x;
    loaf!.y = bake.player.y;
    stepHome(bake, { x: 0, y: 0 }, 16);
    expect(bake.book.entries.some((e) => e.key === 'bakery:flaming_loaf')).toBe(true);
  });

  it('sends a tavern into a brawl with whoever is standing next to it', () => {
    const world = arena();
    const tavern = addBuilding(world, 'tavern', world.player.x + 500, world.player.y);
    const house = addBuilding(world, 'farmhouse', tavern.x + 40, tavern.y);
    tavern.state = 'seek';
    house.state = 'seek';
    stepHome(world, { x: 0, y: 0 }, 32);
    expect(tavern.state).toBe('brawl');
    expect(house.state).toBe('brawl');
    tavern.resolved = false;
    house.resolved = false;
    world.player.x = (tavern.x + house.x) / 2;
    world.player.y = tavern.y;
    stepHome(world, { x: 0, y: 0 }, 16);
    expect(world.player.alive).toBe(false);
    expect(world.book.entries.some((e) => e.key === 'tavern:brawl')).toBe(true);
  });

  it('makes the bakery hurry when the blacksmith is also after you', () => {
    const calm = arena();
    const alone = addBuilding(calm, 'bakery', calm.player.x - 200, calm.player.y);
    alone.state = 'seek';
    alone.cooldownMs = 10_000;
    const rival = arena();
    const bakery = addBuilding(rival, 'bakery', rival.player.x - 200, rival.player.y);
    bakery.state = 'seek';
    bakery.cooldownMs = 10_000;
    const smith = addBuilding(rival, 'blacksmith', rival.player.x + 260, rival.player.y);
    smith.state = 'stub';
    smith.cooldownMs = 10_000;
    expect(actorSpeed(rival, bakery)).toBeGreaterThan(actorSpeed(calm, alone));
    expect(actorSpeed(rival, bakery)).toBeCloseTo(defOf('bakery').speed * 1.22);
    steps(calm, 8, 50);
    steps(rival, 8, 50);
    expect(bakery.x - (rival.player.x - 200)).toBeGreaterThan(alone.x - (calm.player.x - 200) + 2);
  });
});

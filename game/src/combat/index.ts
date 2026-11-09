/**
 * COMBAT area: the action layer. Foes come out of the wilds (spawner), think and strike (foe), and you
 * fight back (actions) with Space / a tap on a foe / the Attack button, Shift to dodge, Q R F for skills
 * and C for the hero sheet. Kills pay experience, coin, goods and gear and leave their mark on the world
 * (sim/hero/deeds). Health is yours alone; spark is what skills burn, and it comes back while you fight.
 * Fall, and you wake in the last town you were in, a little poorer. Combat pauses while a sheet or menu
 * is up. Towns are safe: nothing spawns or follows you into one.
 */
import type Phaser from 'phaser';
import type { CombatApi, GameContext, Pt } from '../app/contracts';
import { registerDevHook } from '../app/dev-hooks';
import { claimTap } from '../app/tap-claim';
import { foeRow } from '../sim/hero/data';
import { onKill } from '../sim/hero/deeds';
import { gainXp, afterArmor, fall, heal, heroOf, hurt, statsOf } from '../sim/hero/hero';
import { townName } from '../sim/works/state';
import { createMoves } from './actions';
import { Foe } from './foe';
import { createFx } from './fx';
import { createCombatHud } from './hud';
import { createSpawner } from './spawner';

export function attachCombat(ctx: GameContext): CombatApi {
  // One list for the whole run (the spawner pushes into it): pruned in place, never replaced.
  const foes: Foe[] = [];
  const prune = (): void => { for (let i = foes.length - 1; i >= 0; i--) if (foes[i]!.dead) foes.splice(i, 1); };
  const fx = createFx(ctx.scene);
  const spawner = createSpawner(ctx, foes);
  const moves = createMoves(ctx, () => foes, fx, (f) => died.push(f));
  const died: Foe[] = [];
  let attackHeld = false;
  let spawnWait = 0;
  let falling = false;
  let time = 0;
  let fighting = false;
  const hud = createCombatHud(ctx, moves, { attackHeld: (h) => { attackHeld = h; if (h) api.attack(); }, openHero: () => ctx.panels.hero.toggle() });

  const st = () => ctx.session.getState();
  const paused = (): boolean => falling || !!ctx.ui?.blocking() || !!ctx.panels?.anyOpen() || !!ctx.interact?.isOpen() || !!ctx.world.room();
  const inWilds = (): boolean => !ctx.world.townAt(ctx.actors.player.pos());

  // ---- kills and their spoils ----
  const settleDeaths = (): void => {
    const s = st();
    if (!s || !died.length) return;
    for (const f of died.splice(0)) {
      const spoils = onKill(s, f.row.id, f.level, spawner.contextOf(f));
      fx.number({ x: f.x, y: f.y - f.height - 14 }, `+${spoils.xp} xp`, '#c8a0f0');
      const bits = [spoils.coin ? `${spoils.coin} coin` : '', ...Object.entries(spoils.items).map(([id, n]) => `${n} ${id.replace('_', ' ')}`)].filter(Boolean);
      if (bits.length) fx.number({ x: f.x, y: f.y - f.height - 28 }, bits.join(' · '), '#f2b84b');
      if (spoils.gear) ctx.voice?.tell(`Found: ${spoils.gear.name}`, 'player');
      if (spoils.levels) { ctx.voice?.sfx?.('reignite'); ctx.voice?.tell(`Level ${heroOf(s).level}! New points to spend (C).`, 'player'); }
      for (const line of spoils.lines.filter((l) => !l.startsWith('You reach'))) ctx.voice?.tell(line, 'player');
    }
    for (const c of spawner.settle()) {
      ctx.voice?.sfx?.('reignite');
      fx.ring(c.at, 120, 0xf2b84b);
      ctx.voice?.tell(`The ${c.site.name.toLowerCase()} is cleared! The chest holds ${c.coin} coin and ${c.gearName}.`, 'player');
    }
    ctx.events.emit('inventory', {});
  };

  // ---- harm to you ----
  const harm = (dmg: number, at: Pt): void => {
    const s = st();
    if (!s || moves.invulnerable() || falling) return;
    const n = Math.max(1, Math.round(afterArmor(dmg, statsOf(s).armor) * moves.guard()));
    fx.number({ x: at.x, y: at.y - 40 }, `-${n}`, '#ff6a5a');
    ctx.scene.cameras.main.shake(90, 0.004);
    if (hurt(s, n)) void fallDown();
  };

  const fallDown = async (): Promise<void> => {
    const s = st();
    if (!s || falling) return;
    falling = true;
    attackHeld = false;
    ctx.actors.player.setFrozen(true);
    const cam = ctx.scene.cameras.main;
    await new Promise<void>((done) => { cam.fadeOut(900, 40, 0, 0); cam.once('camerafadeoutcomplete', () => done()); window.setTimeout(done, 1500); });
    for (const f of foes) f.destroy();
    foes.length = 0;
    spawner.clear();
    fx.clear();
    moves.reset();
    const lost = fall(s);
    const town = s.player.townId ?? s.player.homeTownId ?? '';
    if (town) ctx.arriveAt(town);
    ctx.events.emit('inventory', {});
    cam.fadeIn(900, 0, 0, 0);
    ctx.actors.player.setFrozen(false);
    falling = false;
    ctx.voice?.tell(`You fall… and wake by the fire in ${townName(s, town)}${lost ? `, ${lost} coin lighter` : ''}.`, 'player');
  };

  // ---- input ----
  const typing = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  const onKey = (e: KeyboardEvent): void => {
    if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyC' && !e.repeat && !ctx.ui?.blocking() && !ctx.interact?.isOpen()) { e.preventDefault(); ctx.panels.hero.toggle(); return; }
    if (paused()) return;
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { attackHeld = true; api.attack(); } return; }
    if (e.repeat) return;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { e.preventDefault(); moves.dodge(); return; }
    const slot = ({ KeyQ: 0, KeyR: 1, KeyF: 2 } as Record<string, number>)[e.code];
    if (slot !== undefined) { e.preventDefault(); moves.skill(slot); }
  };
  const onKeyUp = (e: KeyboardEvent): void => { if (e.code === 'Space') attackHeld = false; };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  // A tap or click on a foe is an attack toward it (not a walk).
  const onTap = (ptr: Phaser.Input.Pointer): void => {
    if (paused() || ptr.button !== 0) return;
    const at = ctx.scene.cameras.main.getWorldPoint(ptr.x, ptr.y);
    const hit = foes.find((f) => !f.dead && Math.abs(f.x - at.x) < f.row.size + 12 && at.y < f.y + 8 && at.y > f.y - f.height - 10);
    if (!hit) return;
    claimTap();
    api.attack({ x: hit.x, y: hit.y });
  };
  ctx.scene.input.on('pointerup', onTap);

  const api: CombatApi = {
    inCombat: () => fighting,
    attack(at) { if (!paused()) moves.attack(at); },
    dodge() { if (!paused()) moves.dodge(); },
    skill(slot) { if (!paused()) moves.skill(slot); },
    update(dt) {
      const s = st();
      if (!s) return;
      hud.sync(inWilds(), fighting);
      if (paused()) return;
      time += dt;
      const hero = ctx.actors.player.pos();
      spawnWait -= dt;
      if (spawnWait <= 0) { spawnWait = 0.5; spawner.update(hero); prune(); }
      if (attackHeld) moves.attack();
      moves.update(dt);
      const s0 = statsOf(s);
      ctx.actors.player.setSpeedMul(s0.move);
      // Foes think; their blows land on you.
      const busy = !!ctx.world.townAt(hero);
      fighting = false;
      for (const f of foes) {
        if (f.dead) continue;
        const hit = f.update(dt, time, hero, busy, foes);
        if (f.aggro) fighting = true;
        if (!hit) continue;
        if (hit.kind === 'shot') fx.shoot(hit.at, hit.to!, 260, hit.dmg, false, { range: f.row.reach + 60 });
        else if (hit.kind === 'slam') { fx.ring(hit.at, hit.radius!, 0xe8602a); if (Math.hypot(hero.x - hit.at.x, hero.y - hit.at.y) < hit.radius!) harm(hit.dmg, hero); }
        else if (Math.hypot(hero.x - f.x, hero.y - f.y) < f.row.reach + 24) harm(hit.dmg, hero);
        // A boss calls its kind at two-thirds and one-third health.
        const row = f.row;
        if (row.summon && f.summoned < 2 && f.hp < f.maxHp * (f.summoned === 0 ? 0.66 : 0.33)) {
          f.summoned++;
          const kid = foeRow(row.summon);
          if (kid) for (let k = 0; k < 2; k++) foes.push(new Foe(ctx, kid, f.level, { x: f.x + (k ? 40 : -40), y: f.y + 20 }, f.packKey, 100 + f.summoned * 2 + k));
          fx.ring({ x: f.x, y: f.y }, 80, 0x7a3aa8);
        }
      }
      // Shots in flight.
      fx.update(dt);
      for (const shot of fx.shots()) {
        if (shot.life <= 0) continue;
        if (shot.mine) {
          for (const f of foes) {
            if (f.dead || shot.hit.has(f.uid)) continue;
            const c = f.center();
            if (Math.hypot(c.x - shot.x, c.y - shot.y) > f.row.size + shot.size + 4) continue;
            shot.hit.add(f.uid);
            moves.strike(f, shot.tag === 'spark' && f.row.family === 'despair' ? shot.dmg * 2 : shot.dmg);
            if (!shot.pierce) { shot.life = 0; break; }
          }
        } else if (Math.hypot(hero.x - shot.x, hero.y - 16 - shot.y) < 14) { harm(shot.dmg, hero); shot.life = 0; }
      }
      settleDeaths();
      // Health comes back out of a fight (fast in a town); spark comes back in one.
      const h = heroOf(s);
      if (!fighting && h.hp < s0.maxHp) heal(s, s0.maxHp * (busy ? 0.08 : 0.025) * dt);
      if (fighting) s.player.spark = Math.min(s.player.sparkMax ?? 100, s.player.spark + s0.sparkRegen * dt);
    },
  };

  const teardown = (): void => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKeyUp);
    ctx.scene.input.off('pointerup', onTap);
    for (const f of foes) f.destroy();
    spawner.clear();
    fx.clear();
    hud.destroy();
  };
  ctx.scene.events.once('shutdown', teardown);
  ctx.scene.events.once('destroy', teardown);
  ctx.events.on('state-replaced', () => { for (const f of foes) f.destroy(); foes.length = 0; spawner.clear(); fx.clear(); moves.reset(); });
  heroOf(ctx.session.getState()!);
  devCtl = { foes: () => foes, spawner, gainXp: (n: number) => gainXp(st()!, n), harm };
  return api;
}

let devCtl: { foes: () => Foe[]; spawner: ReturnType<typeof createSpawner>; gainXp: (n: number) => number; harm: (d: number, at: Pt) => void } | null = null;

// ---- QA hooks (window.__hearth.dev.combat) ----
registerDevHook('combat', (ctx) => ({
  foes: () => (devCtl?.foes() ?? []).filter((f) => !f.dead).map((f) => ({ uid: f.uid, id: f.row.id, level: f.level, hp: f.hp, x: Math.round(f.x), y: Math.round(f.y), state: f.state, aggro: f.aggro })),
  lairs: () => devCtl?.spawner.lairs() ?? [],
  /** Spawn a foe a little ahead of you (for testing). */
  spawn: (id: string, level = 1) => {
    const row = foeRow(id);
    if (!row || !devCtl) return false;
    const p = ctx.actors.player.pos();
    devCtl.foes().push(new Foe(ctx, row, level, { x: p.x + 140, y: p.y }, `dev:${Date.now()}`, 0));
    return true;
  },
  xp: (n: number) => devCtl?.gainXp(n) ?? 0,
  hero: () => { const s = ctx.session.getState(); return s ? { ...heroOf(s), stats: statsOf(s) } : null; },
}));

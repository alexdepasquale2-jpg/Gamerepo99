import Phaser from 'phaser';
import type { AppHooks, GameContext } from './contracts';
import type { PlaySession } from '../sim/play-session/play-session-types';
import { layoutWorld } from '../sim/map/world-layout';
import { collectDawnLines } from '../sim/dawn-lines';
import { createEvents } from './events';
import { attachGlue } from './glue';
import { installDevHooks, registerDevHook } from './dev-hooks';
import { attachWorld, preloadWorldAssets, createWorldAssets } from '../world';
import { attachActors } from '../actors';
import { attachVoice } from '../voice';
import { attachUi, trackCanvas } from '../ui';
import { pickGameSize, setGameSize } from '../ui/kit/layer';
import { attachPanels } from '../panels';
import { attachInteract } from '../interact';
import '../sim/contrib';
import { waitDays } from '../sim/contrib/clock';

export const WIDTH = 640;
export const HEIGHT = 360;

class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }
  preload(): void { preloadWorldAssets(this); }
  create(): void { createWorldAssets(this); this.scene.start('world'); }
}

/** The one play scene: builds the context, attaches every area in order, runs their updates. */
class WorldScene extends Phaser.Scene {
  private ctx!: GameContext;
  private resting = false;
  constructor() { super('world'); }

  create(): void {
    const session = this.registry.get('session') as PlaySession;
    const autosave = (this.registry.get('autosave') as (() => void) | undefined) ?? (() => {});
    const world = session.getWorld();
    if (!world) throw new Error('world scene needs a started session');
    const seed = session.getSeed();
    const ctx = {
      scene: this,
      session,
      events: createEvents(),
      layout: layoutWorld(world, seed),
      seed,
      autosave,
      rest: () => this.rest(),
      arriveAt: (townId: string) => this.arriveAt(townId),
    } as unknown as GameContext; // areas are attached just below, in order
    this.ctx = ctx;
    ctx.world = attachWorld(ctx);
    ctx.actors = attachActors(ctx);
    ctx.voice = attachVoice(ctx);
    ctx.ui = attachUi(ctx);
    ctx.panels = attachPanels(ctx);
    ctx.interact = attachInteract(ctx);
    const offGlue = attachGlue(ctx);
    // A wait at the hearth (contrib/clock) is a longer rest: the same fade, the days on the clock.
    const offWait = ctx.events.on('act', (e) => {
      const days = waitDays(e.actionId);
      if (days && e.outcome?.ok) void this.rest(days);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { offGlue(); offWait(); });
    installDevHooks(ctx);
    const town = session.snapshot().townId;
    ctx.actors.player.setPos(ctx.world.spawnPoint(town));
    ctx.events.emit('arrive', { townId: town });
  }

  update(_time: number, delta: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const dt = Math.min(delta, 50) / 1000;
    ctx.actors.update(dt);
    ctx.world.update(dt, ctx.actors.player.pos());
  }

  private arriveAt(townId: string): void {
    const ctx = this.ctx;
    ctx.world.leaveRoom();
    ctx.actors.player.setPos(ctx.world.spawnPoint(townId));
    ctx.actors.sync();
    ctx.world.refresh('all');
    ctx.events.emit('arrive', { townId });
  }

  /**
   * Rest until dawn, or wait `days` (one evening, then the clock: whole dawns, or the LOD stretch for a
   * long one). The sim runs it in session.wait(); people speak the morning.
   */
  private rest(days = 1): Promise<void> {
    const ctx = this.ctx;
    if (this.resting) return Promise.resolve();
    this.resting = true;
    ctx.events.emit('rest-start', {});
    ctx.actors.player.setFrozen(true);
    const cam = this.cameras.main;
    return new Promise((done) => {
      cam.fadeOut(700, 0, 0, 0);
      cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        if (days > 1) ctx.session.wait(days);
        else ctx.session.tick();
        const st = ctx.session.getState();
        const lines = st ? collectDawnLines(st) : [];
        ctx.world.setPhase(0.02);
        ctx.actors.sync();
        ctx.world.refresh('all');
        ctx.events.emit('inventory', {});
        cam.fadeIn(900, 0, 0, 0);
        cam.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => {
          ctx.actors.player.setFrozen(false);
          this.resting = false;
          ctx.events.emit('dawn', { day: ctx.session.snapshot().day, lines });
          ctx.autosave();
          void ctx.voice.dawn(lines).then(done, done);
        });
      });
    });
  }
}

registerDevHook('rest', (ctx) => () => ctx.rest());
registerDevHook('arriveAt', (ctx) => (townId: string) => ctx.arriveAt(townId));
registerDevHook('towns', (ctx) => () => ctx.layout.settlements.map((t) => t.id));
registerDevHook('where', (ctx) => () => ({ ...ctx.world.tileOf(ctx.actors.player.pos()), day: ctx.session.snapshot().day, room: ctx.world.room() }));

/** Start, stop and pause the Phaser game for the title flow. */
export function createApp(): AppHooks {
  let game: Phaser.Game | null = null;
  const hooks: AppHooks = {
    start(session, autosave) {
      game?.destroy(true);
      const size = pickGameSize(window.innerWidth, window.innerHeight);
      setGameSize(size.w, size.h);
      const g = new Phaser.Game({
        type: Phaser.AUTO,
        parent: 'game',
        width: size.w,
        height: size.h,
        backgroundColor: '#0b0d12',
        pixelArt: true,
        antialias: false,
        roundPixels: true,
        scene: [BootScene, WorldScene],
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        callbacks: {
          preBoot: (pg) => {
            pg.registry.set('session', session);
            pg.registry.set('autosave', autosave);
            // A new district is a new world: the whole game is rebuilt around the same session.
            pg.registry.set('restart', () => window.setTimeout(() => hooks.start(session, autosave), 0));
          },
        },
      });
      g.events.once(Phaser.Core.Events.READY, () => trackCanvas(g.canvas));
      // Rotating a phone flips between the landscape and portrait sizes; cameras follow the scale manager.
      const onResize = (): void => {
        const next = pickGameSize(window.innerWidth, window.innerHeight);
        if (next.w === g.scale.gameSize.width && next.h === g.scale.gameSize.height) return;
        setGameSize(next.w, next.h);
        g.scale.setGameSize(next.w, next.h);
        for (const sc of g.scene.getScenes(true)) sc.cameras.main.setSize(next.w, next.h);
      };
      window.addEventListener('resize', onResize);
      g.events.once(Phaser.Core.Events.DESTROY, () => window.removeEventListener('resize', onResize));
      game = g;
    },
    stop() {
      game?.destroy(true);
      game = null;
      trackCanvas(null);
    },
    setPaused(paused) {
      if (!game) return;
      for (const s of game.scene.getScenes(false)) {
        if (paused && game.scene.isActive(s.scene.key)) s.scene.pause();
        else if (!paused && game.scene.isPaused(s.scene.key)) s.scene.resume();
      }
    },
  };
  return hooks;
}

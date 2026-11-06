/** Continuous chunked 2.5D overworld — stamp TileSource + foot-Y depth. */

import Phaser from 'phaser';
import {
  createPlaySession,
  createStampRasterSource,
  layoutWorld,
  type PlaySession,
  type TileSource,
} from '../sim';
import { CHUNK_SIZE, TILE_PX } from '../sim/map/constants';
import { chunksAround } from '../sim/map/chunks-around';
import type { WorldLayout } from '../sim/map/world-layout';
import { FEEL } from './feel';
import { createChunkLayer, type ChunkLayer } from './chunk-layer';
import { applySpriteSort, tileFootWorld } from './depth-sort';
import { walkDelta } from './walk-delta';

const PLAYER = 0xf2b84b;
const CHUNK_MARGIN = 1;
const NEAR_TOWN_PX = TILE_PX * 2.5;

export class OverworldScene extends Phaser.Scene {
  private session!: PlaySession;
  private source!: TileSource;
  private layout!: WorldLayout;
  private layer!: ChunkLayer;
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private sparkFill = 1;
  private sparkBar!: Phaser.GameObjects.Rectangle;
  private hint!: Phaser.GameObjects.Text;
  private lastChunkKey = '';

  constructor() {
    super('overworld');
  }

  create(): void {
    this.bootSession();
    const world = this.session.getWorld();
    const seed = this.session.getSeed();
    if (!world) throw new Error('overworld requires booted world');
    this.layout = layoutWorld(world, seed);
    this.source = createStampRasterSource(world, seed);

    this.layer = createChunkLayer(this, this.source, this.layout.settlements);
    this.spawnPlayer();
    this.createSparkHud();
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as typeof this.wasd;

    this.add
      .text(8, 8, '2.5D overworld — WASD/arrows · Enter near town for methods', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#f2e9e4',
      })
      .setScrollFactor(0)
      .setDepth(1_000_000);

    this.hint = this.add
      .text(8, 26, `settlements: ${this.layout.settlements.length}`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#8a7a68',
      })
      .setScrollFactor(0)
      .setDepth(1_000_000);

    this.input.keyboard?.on('keydown-ENTER', () => this.tryOpenMethods());
    this.syncChunks(true);
    this.syncSparkFromSession(false);
    const hud = this.registry.get('hud') as { setStatus?: (s: string) => void } | undefined;
    hud?.setStatus?.('continuous overworld');
  }

  update(_time: number, delta: number): void {
    let dx = 0;
    let dy = 0;
    if (this.cursors.left?.isDown || this.wasd.A.isDown) dx -= 1;
    if (this.cursors.right?.isDown || this.wasd.D.isDown) dx += 1;
    if (this.cursors.up?.isDown || this.wasd.W.isDown) dy -= 1;
    if (this.cursors.down?.isDown || this.wasd.S.isDown) dy += 1;
    if (dx !== 0 || dy !== 0) {
      const step = walkDelta(
        dx,
        dy,
        delta,
        FEEL.overworld.walkTilesPerSec,
        TILE_PX,
      );
      this.player.x += step.dx;
      this.player.y += step.dy;
      applySpriteSort(this.player);
    }
    this.syncChunks(false);
  }

  private bootSession(): void {
    const existing = this.registry.get('playSession') as PlaySession | undefined;
    if (existing && typeof existing.dump === 'function' && existing.getWorld?.()) {
      this.session = existing;
      return;
    }
    const s = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' });
    if (!s || !('start' in s)) throw new Error('overworld requires play session');
    this.session = s as PlaySession;
    this.session.start({ seed: 42, archetypeId: 'marrow' });
    this.registry.set('playSession', this.session);
  }

  private spawnPlayer(): void {
    const start = this.layout.settlements[0];
    const foot = start
      ? tileFootWorld(start.q, start.r + 1)
      : { x: TILE_PX / 2, y: TILE_PX };
    this.player = this.add
      .rectangle(foot.x, foot.y, TILE_PX * 0.55, TILE_PX * 0.8, PLAYER)
      .setStrokeStyle(2, 0x5ec8c8, 1);
    applySpriteSort(this.player);
    const cam = this.cameras.main;
    cam.setRoundPixels(true);
    cam.startFollow(
      this.player,
      true,
      FEEL.overworld.camLerp,
      FEEL.overworld.camLerp,
    );
    cam.setDeadzone(FEEL.overworld.camDeadzoneX, FEEL.overworld.camDeadzoneY);
    cam.setZoom(1);
  }

  private syncChunks(force: boolean): void {
    const q = Math.floor(this.player.x / TILE_PX);
    const r = Math.floor(this.player.y / TILE_PX);
    const coords = chunksAround(q, r, CHUNK_SIZE, CHUNK_MARGIN);
    const key = coords.map((c) => `${c.cx},${c.cy}`).join('|');
    if (!force && key === this.lastChunkKey) return;
    this.lastChunkKey = key;
    this.layer.sync(coords);
  }

  private createSparkHud(): void {
    const h = FEEL.hud;
    this.add
      .rectangle(h.sparkBarX, h.sparkBarY, h.sparkBarWidth, h.sparkBarHeight, h.emptyColor)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(1_000_001);
    this.sparkBar = this.add
      .rectangle(h.sparkBarX, h.sparkBarY, h.sparkBarWidth, h.sparkBarHeight - 2, h.fillColor)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(1_000_002);
  }

  private syncSparkFromSession(lerp: boolean): void {
    const next = Math.max(0, Math.min(1, this.session.snapshot().spark / 100));
    if (lerp) {
      this.tweens.add({
        targets: { v: this.sparkFill },
        v: next,
        duration: FEEL.spark.lifespanMs,
        onUpdate: (tw) => {
          const v = (tw.targets[0] as { v: number }).v;
          this.sparkFill = v;
          this.sparkBar.width = FEEL.hud.sparkBarWidth * v;
        },
      });
    } else {
      this.sparkFill = next;
      this.sparkBar.width = FEEL.hud.sparkBarWidth * next;
    }
  }

  private tryOpenMethods(): void {
    const town = this.nearestTown();
    if (!town) return;
    this.hint.setText(`near ${town.id} — methods`);
    const menu = this.registry.get('methodMenu') as
      | { show: (a: { id: string }[], cb: (id: string) => void) => unknown }
      | undefined;
    menu?.show(this.session.listActions(), (actionId) => {
      this.session.act(actionId);
      this.syncSparkFromSession(true);
    });
    const hud = this.registry.get('hud') as { setTown?: (id: string) => void } | undefined;
    hud?.setTown?.(town.id);
  }

  private nearestTown(): { id: string; q: number; r: number } | null {
    let best: { id: string; q: number; r: number } | null = null;
    let bestD = Infinity;
    for (const t of this.layout.settlements) {
      const foot = tileFootWorld(t.q, t.r);
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, foot.x, foot.y);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return bestD <= NEAR_TOWN_PX ? best : null;
  }
}

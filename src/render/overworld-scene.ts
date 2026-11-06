/** Minimal Phaser overworld — colored 32px town chips from session dump. */

import Phaser from 'phaser';
import {
  createPlaySession,
  townsFromDump,
  type PlaySession,
  type TownMarker,
} from '../sim';
import { FEEL } from './feel';
import { GRID } from './asset-manifest';

const TILE = 32;
const TOWN_FILL = 0xd97b3a;
const GROUND = 0x2f4f3a;
const PLAYER = 0xf2b84b;

export type OverworldRegistry = {
  playSession: PlaySession;
};

export class OverworldScene extends Phaser.Scene {
  private session!: PlaySession;
  private towns: TownMarker[] = [];
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private sparkFill = 1;
  private sparkBar!: Phaser.GameObjects.Rectangle;
  private hint!: Phaser.GameObjects.Text;

  constructor() {
    super('overworld');
  }

  create(): void {
    const existing = this.registry.get('playSession') as PlaySession | undefined;
    if (existing && typeof existing.dump === 'function') {
      this.session = existing;
    } else {
      const s = createPlaySession({
        mode: 'play',
        seed: 42,
        archetypeId: 'marrow',
      });
      if (!s || !('start' in s)) {
        throw new Error('overworld requires play session');
      }
      this.session = s as PlaySession;
      this.session.start({ seed: 42, archetypeId: 'marrow' });
      this.registry.set('playSession', this.session);
    }

    this.towns = townsFromDump(this.session.dump());
    this.drawGround();
    this.drawTowns();
    this.spawnPlayer();
    this.createSparkHud();
    this.cursors = this.input.keyboard!.createCursorKeys();

    this.add
      .text(8, 8, 'Overworld — arrows move · Enter/click town to enter', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#f2e9e4',
      })
      .setScrollFactor(0)
      .setDepth(20);

    this.hint = this.add
      .text(8, 26, `towns: ${this.towns.length}`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#8a7a68',
      })
      .setScrollFactor(0)
      .setDepth(20);

    this.input.keyboard?.on('keydown-ENTER', () => this.tryEnterTown());
    this.syncSparkFromSession(false);
  }

  update(): void {
    const step = TILE;
    let dx = 0;
    let dy = 0;
    if (this.cursors.left?.isDown) dx -= 1;
    if (this.cursors.right?.isDown) dx += 1;
    if (this.cursors.up?.isDown) dy -= 1;
    if (this.cursors.down?.isDown) dy += 1;
    if (dx !== 0 || dy !== 0) {
      this.player.x += dx * 2;
      this.player.y += dy * 2;
      this.cameras.main.centerOn(this.player.x, this.player.y);
    }
  }

  private drawGround(): void {
    const w = Math.max(8, ...this.towns.map((t) => t.q + 2)) * TILE;
    const h = Math.max(6, ...this.towns.map((t) => t.r + 2)) * TILE;
    this.add.rectangle(w / 2, h / 2, w + TILE * 4, h + TILE * 4, GROUND).setDepth(0);
    this.cameras.main.setBounds(-TILE, -TILE, w + TILE * 4, h + TILE * 4);
  }

  private drawTowns(): void {
    for (const town of this.towns) {
      const cell = GRID.qrToCell(town.q, town.r);
      const x = cell.x * TILE + TILE / 2;
      const y = cell.y * TILE + TILE / 2;
      const rect = this.add
        .rectangle(x, y, TILE - 2, TILE - 2, TOWN_FILL)
        .setStrokeStyle(2, 0xf2b84b, 0.9)
        .setDepth(2)
        .setInteractive({ useHandCursor: true });
      rect.on('pointerdown', () => this.enterTown(town.id));
      this.add
        .text(x, y - TILE * 0.7, town.id, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#f2e9e4',
        })
        .setOrigin(0.5)
        .setDepth(3);
    }
  }

  private spawnPlayer(): void {
    const start = this.towns[0];
    const cell = start
      ? GRID.qrToCell(start.q, start.r)
      : { x: 0, y: 0 };
    const x = cell.x * TILE + TILE / 2;
    const y = cell.y * TILE + TILE / 2 + TILE;
    this.player = this.add
      .rectangle(x, y, TILE * 0.55, TILE * 0.55, PLAYER)
      .setStrokeStyle(2, 0x5ec8c8, 1)
      .setDepth(5);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
  }

  private createSparkHud(): void {
    const h = FEEL.hud;
    this.add
      .rectangle(h.sparkBarX, h.sparkBarY, h.sparkBarWidth, h.sparkBarHeight, h.emptyColor)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(40);
    this.sparkBar = this.add
      .rectangle(h.sparkBarX, h.sparkBarY, h.sparkBarWidth, h.sparkBarHeight - 2, h.fillColor)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(41);
  }

  private syncSparkFromSession(lerp: boolean): void {
    const snap = this.session.snapshot();
    const next = Math.max(0, Math.min(1, snap.spark / 100));
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

  private tryEnterTown(): void {
    const nearest = this.nearestTown();
    if (nearest) this.enterTown(nearest.id);
  }

  private nearestTown(): TownMarker | null {
    let best: TownMarker | null = null;
    let bestD = Infinity;
    for (const t of this.towns) {
      const cell = GRID.qrToCell(t.q, t.r);
      const x = cell.x * TILE + TILE / 2;
      const y = cell.y * TILE + TILE / 2;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return bestD <= TILE * 1.6 ? best : null;
  }

  private enterTown(townId: string): void {
    this.hint.setText(`entering ${townId}`);
    this.scene.start('town', { townId });
  }
}

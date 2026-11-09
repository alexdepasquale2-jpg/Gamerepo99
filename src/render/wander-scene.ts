import Phaser from 'phaser';
import mapData from '../data/world/map.json';
import { createWorld, tick, type World } from '../sim';
import { FEEL } from './feel';
import { attachSparkFx } from './spark-fx';

const TILE_COLORS: Record<string, number> = {
  grass: 0x2f4f3a,
  path: 0x6b5a45,
  stone: 0x4a4e57,
};

/** Presentation-only NPC palette — kept out of sim. */
const NPC_COLORS = [0xe8a87c, 0x85dcb8, 0xc38d9e, 0x41b3a3, 0xe27d60];

function npcColor(id: string): number {
  const n = Number.parseInt(id.replace(/\D/g, ''), 10) || 0;
  return NPC_COLORS[(Math.max(n, 1) - 1) % NPC_COLORS.length];
}

export class WanderScene extends Phaser.Scene {
  private world!: World;
  private npcGfx = new Map<string, Phaser.GameObjects.Arc>();
  private player!: Phaser.GameObjects.Arc;
  private sparkFill = 1;
  private sparkBarBg!: Phaser.GameObjects.Rectangle;
  private sparkBarFill!: Phaser.GameObjects.Rectangle;
  private sparkBarOutline!: Phaser.GameObjects.Rectangle;
  private readonly tileSize: number;
  private accum = 0;
  private readonly stepMs = 280;

  constructor() {
    super('wander');
    this.tileSize = mapData.tileSize;
  }

  create(): void {
    this.world = createWorld({
      seed: mapData.seed,
      width: mapData.width,
      height: mapData.height,
      npcCount: mapData.npcCount,
    });

    this.drawTiles();
    this.spawnNpcSprites();
    this.spawnPlayer();
    this.createSparkHud();

    this.add
      .text(8, 8, 'WelCum HoMe — wander leftover', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#f2e9e4',
      })
      .setScrollFactor(0)
      .setDepth(10);

    this.cameras.main.setBounds(
      0,
      0,
      this.world.width * this.tileSize,
      this.world.height * this.tileSize,
    );
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    attachSparkFx(this, this.world.bus, {
      getPlayerPos: () => ({ x: this.player.x, y: this.player.y }),
      onSparkSpentHud: (amount01) => {
        this.sparkFill = Math.max(0, this.sparkFill - amount01);
        this.redrawSparkHud();
      },
    });

    this.add
      .text(8, 28, 'VFX demo: 1 spark spend · 2 reignite · 3 refusal · 4 burnout', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#8a7a68',
      })
      .setScrollFactor(0)
      .setDepth(10);

    this.input.keyboard?.on('keydown-ONE', () => {
      this.world.bus.emit('vfx.spark_spent', {
        x: this.player.x,
        y: this.player.y,
        amount01: 0.2,
      });
    });
    this.input.keyboard?.on('keydown-TWO', () => {
      this.world.bus.emit('vfx.reignite', {
        x: this.player.x + 40,
        y: this.player.y,
        warmthBefore: 0.2,
        warmthAfter: 0.8,
      });
    });
    this.input.keyboard?.on('keydown-THREE', () => {
      this.world.bus.emit('vfx.refusal', {
        x: this.player.x + 24,
        y: this.player.y,
        kind: 'shame_child',
      });
    });
    this.input.keyboard?.on('keydown-FOUR', () => {
      this.world.bus.emit('vfx.burnout', { x: this.player.x, y: this.player.y });
    });
  }

  update(_time: number, delta: number): void {
    this.accum += delta;
    while (this.accum >= this.stepMs) {
      this.accum -= this.stepMs;
      tick(this.world);
      this.syncNpcSprites();
    }
  }

  private spawnPlayer(): void {
    const x = (this.world.width * this.tileSize) / 2;
    const y = (this.world.height * this.tileSize) / 2;
    this.player = this.add.circle(x, y, this.tileSize * 0.38, 0xf2b84b);
    this.player.setStrokeStyle(2, 0x5ec8c8, 1);
    this.player.setDepth(8);
  }

  private createSparkHud(): void {
    const h = FEEL.hud;
    this.sparkBarBg = this.add
      .rectangle(h.sparkBarX, h.sparkBarY, h.sparkBarWidth, h.sparkBarHeight, h.emptyColor)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(40);
    this.sparkBarFill = this.add
      .rectangle(h.sparkBarX, h.sparkBarY, h.sparkBarWidth, h.sparkBarHeight - 2, h.fillColor)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(41);
    this.sparkBarOutline = this.add
      .rectangle(h.sparkBarX, h.sparkBarY, h.sparkBarWidth, h.sparkBarHeight, h.emptyColor, 0)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, h.outlineColor, 1)
      .setScrollFactor(0)
      .setDepth(42);
    this.add
      .text(h.sparkBarX, h.sparkBarY - 14, 'SPARK', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#5ec8c8',
      })
      .setScrollFactor(0)
      .setDepth(40);
    this.redrawSparkHud();
  }

  private redrawSparkHud(): void {
    const h = FEEL.hud;
    this.sparkBarFill.width = Math.max(0, h.sparkBarWidth * this.sparkFill);
  }

  private drawTiles(): void {
    for (let y = 0; y < this.world.height; y++) {
      for (let x = 0; x < this.world.width; x++) {
        const tile = this.world.tiles[y][x];
        const color = TILE_COLORS[tile.kind] ?? 0x333333;
        this.add
          .rectangle(
            x * this.tileSize + this.tileSize / 2,
            y * this.tileSize + this.tileSize / 2,
            this.tileSize - 1,
            this.tileSize - 1,
            color,
          )
          .setOrigin(0.5);
      }
    }
  }

  private spawnNpcSprites(): void {
    for (const npc of this.world.npcs) {
      const circle = this.add.circle(
        npc.x * this.tileSize + this.tileSize / 2,
        npc.y * this.tileSize + this.tileSize / 2,
        this.tileSize * 0.32,
        npcColor(npc.id),
      );
      circle.setStrokeStyle(2, 0xffffff, 0.7);
      circle.setDepth(5);
      this.npcGfx.set(npc.id, circle);
    }
  }

  private syncNpcSprites(): void {
    for (const npc of this.world.npcs) {
      const gfx = this.npcGfx.get(npc.id);
      if (!gfx) continue;
      gfx.setPosition(
        npc.x * this.tileSize + this.tileSize / 2,
        npc.y * this.tileSize + this.tileSize / 2,
      );
    }
  }
}

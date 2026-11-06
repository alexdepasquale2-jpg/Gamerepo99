import Phaser from 'phaser';
import mapData from '../data/map.json';
import { createWorld, tick, type World } from '../sim';
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

    this.add
      .text(8, 8, 'The Last Spark — M1 wander demo', {
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

    attachSparkFx(this, this.world.bus);
    this.add
      .text(8, 28, 'VFX demo: 1 spark spend · 2 reignite · 3 refusal · 4 burnout', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#8a7a68',
      })
      .setScrollFactor(0)
      .setDepth(10);

    const center = () => ({
      x: (this.world.width * this.tileSize) / 2,
      y: (this.world.height * this.tileSize) / 2,
    });
    this.input.keyboard?.on('keydown-ONE', () => {
      const c = center();
      this.world.bus.emit('vfx.spark_spent', { ...c, amount01: 0.2 });
    });
    this.input.keyboard?.on('keydown-TWO', () => {
      const c = center();
      this.world.bus.emit('vfx.reignite', { ...c, warmthBefore: 0.2, warmthAfter: 0.8 });
    });
    this.input.keyboard?.on('keydown-THREE', () => {
      const c = center();
      this.world.bus.emit('vfx.refusal', { ...c, kind: 'shame_child' });
    });
    this.input.keyboard?.on('keydown-FOUR', () => {
      const c = center();
      this.world.bus.emit('vfx.burnout', c);
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

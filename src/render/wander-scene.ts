import Phaser from 'phaser';
import mapData from '../data/map.json';
import { createWorld, tick, type World } from '../sim';

const TILE_COLORS: Record<string, number> = {
  grass: 0x2f4f3a,
  path: 0x6b5a45,
  stone: 0x4a4e57,
};

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
        npc.color,
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

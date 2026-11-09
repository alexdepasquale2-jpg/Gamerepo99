import Phaser from 'phaser';
import { TAGLINES, TITLE } from './copy';
import { attackOf, defOf, stubKinds } from './roster';
import { allEnds } from './book';
import { PALETTE, groundColor } from './palette';
import type { Actor, BookOfEnds, BuildingKind, GroundTile, HomeWorld, ShotKind } from './types';
import { createHomeWorld, stepHome } from './world';

const TEX_W = 64;
const TEX_H = 80;

function baseScale(kind: BuildingKind): number {
  switch (kind) {
    case 'outhouse':
      return 0.82;
    case 'well':
      return 0.95;
    case 'market_stall':
      return 0.88;
    case 'farmhouse':
      return 1.18;
    case 'bakery':
      return 1.08;
    case 'tavern':
      return 1.12;
    case 'blacksmith':
      return 1.08;
    case 'windmill':
      return 1.32;
    case 'church':
      return 1.28;
    case 'bullring':
      return 1.4;
    case 'aqueduct':
      return 1.5;
    case 'castle':
      return 1.55;
    default: {
      const neverKind: never = kind;
      return neverKind;
    }
  }
}

function paintBuilding(g: Phaser.GameObjects.Graphics, kind: BuildingKind): void {
  const wall = kind === 'blacksmith' ? PALETTE.soot : PALETTE.whitewash;
  const roof = PALETTE.path;
  const roofDark = PALETTE.pathDark;
  const door = kind === 'outhouse' ? PALETTE.ink : PALETTE.trim;
  switch (kind) {
    case 'outhouse':
      g.fillStyle(roofDark, 1);
      g.fillRect(18, 10, 28, 8);
      g.fillStyle(roof, 1);
      g.fillRect(20, 6, 24, 8);
      g.fillStyle(wall, 1);
      g.fillRect(22, 16, 20, 30);
      g.fillStyle(door, 1);
      g.fillRect(28, 28, 8, 18);
      g.fillStyle(PALETTE.sky, 1);
      g.fillRect(40, 4, 6, 6);
      return;
    case 'well':
      g.fillStyle(PALETTE.stoneDark, 1);
      g.fillRect(16, 28, 32, 18);
      g.fillStyle(PALETTE.stone, 1);
      g.fillRect(18, 26, 28, 14);
      g.fillStyle(PALETTE.trimDark, 1);
      g.fillRect(22, 30, 20, 8);
      g.fillStyle(roof, 1);
      g.fillRect(14, 12, 36, 6);
      g.fillStyle(PALETTE.wood, 1);
      g.fillRect(18, 16, 4, 14);
      g.fillRect(42, 16, 4, 14);
      g.fillStyle(PALETTE.ink, 1);
      g.fillRect(30, 18, 4, 8);
      return;
    case 'market_stall':
      g.fillStyle(roof, 1);
      g.fillRect(8, 14, 48, 10);
      g.fillStyle(PALETTE.plaza, 1);
      g.fillRect(8, 18, 8, 6);
      g.fillRect(24, 18, 8, 6);
      g.fillRect(40, 18, 8, 6);
      g.fillStyle(PALETTE.wood, 1);
      g.fillRect(12, 24, 3, 22);
      g.fillRect(49, 24, 3, 22);
      g.fillStyle(wall, 1);
      g.fillRect(16, 28, 32, 14);
      g.fillStyle(PALETTE.loaf, 1);
      g.fillRect(20, 32, 6, 6);
      g.fillStyle(PALETTE.wine, 1);
      g.fillRect(30, 32, 6, 6);
      return;
    case 'farmhouse':
      g.fillStyle(roofDark, 1);
      g.fillRect(8, 14, 48, 10);
      g.fillStyle(roof, 1);
      g.fillRect(10, 8, 44, 10);
      g.fillStyle(wall, 1);
      g.fillRect(12, 20, 40, 28);
      g.fillStyle(door, 1);
      g.fillRect(28, 30, 10, 18);
      g.fillStyle(PALETTE.trim, 1);
      g.fillRect(16, 26, 8, 8);
      g.fillRect(42, 26, 8, 8);
      return;
    case 'bakery':
      g.fillStyle(roofDark, 1);
      g.fillRect(10, 16, 40, 8);
      g.fillStyle(roof, 1);
      g.fillRect(12, 10, 36, 10);
      g.fillStyle(wall, 1);
      g.fillRect(14, 22, 34, 26);
      g.fillStyle(PALETTE.stone, 1);
      g.fillRect(40, 4, 8, 20);
      g.fillStyle(PALETTE.ink, 1);
      g.fillRect(42, 0, 4, 6);
      g.fillStyle(door, 1);
      g.fillRect(26, 32, 10, 16);
      g.fillStyle(PALETTE.loaf, 1);
      g.fillRect(16, 28, 8, 6);
      return;
    case 'tavern':
      g.fillStyle(roofDark, 1);
      g.fillRect(6, 16, 52, 8);
      g.fillStyle(roof, 1);
      g.fillRect(8, 10, 48, 10);
      g.fillStyle(wall, 1);
      g.fillRect(10, 22, 44, 26);
      g.fillStyle(door, 1);
      g.fillRect(26, 30, 14, 18);
      g.fillStyle(PALETTE.wine, 1);
      g.fillRect(14, 26, 8, 8);
      g.fillStyle(PALETTE.wood, 1);
      g.fillRect(44, 8, 3, 16);
      g.fillStyle(PALETTE.plaza, 1);
      g.fillRect(40, 6, 12, 8);
      return;
    case 'blacksmith':
      g.fillStyle(PALETTE.ink, 1);
      g.fillRect(8, 18, 48, 30);
      g.fillStyle(wall, 1);
      g.fillRect(12, 20, 40, 26);
      g.fillStyle(PALETTE.stoneDark, 1);
      g.fillRect(18, 34, 14, 8);
      g.fillStyle(PALETTE.fire, 1);
      g.fillRect(36, 30, 10, 8);
      g.fillStyle(PALETTE.trimDark, 1);
      g.fillRect(22, 24, 8, 6);
      return;
    case 'windmill':
      g.fillStyle(PALETTE.stoneDark, 1);
      g.fillRect(24, 18, 16, 32);
      g.fillStyle(PALETTE.stone, 1);
      g.fillRect(26, 8, 12, 42);
      g.fillStyle(roof, 1);
      g.fillRect(22, 4, 20, 8);
      g.fillStyle(door, 1);
      g.fillRect(29, 34, 6, 12);
      return;
    case 'church':
      g.fillStyle(wall, 1);
      g.fillRect(16, 20, 32, 28);
      g.fillStyle(roof, 1);
      g.fillRect(14, 12, 36, 10);
      g.fillStyle(PALETTE.stone, 1);
      g.fillRect(30, 0, 8, 18);
      g.fillStyle(door, 1);
      g.fillRect(28, 32, 10, 16);
      return;
    case 'bullring':
      g.fillStyle(PALETTE.pathDark, 1);
      g.fillEllipse(32, 34, 52, 28);
      g.fillStyle(PALETTE.dust, 1);
      g.fillEllipse(32, 34, 36, 16);
      return;
    case 'aqueduct':
      g.fillStyle(PALETTE.stone, 1);
      g.fillRect(4, 16, 56, 10);
      g.fillRect(8, 26, 8, 22);
      g.fillRect(28, 26, 8, 22);
      g.fillRect(48, 26, 8, 22);
      g.fillStyle(PALETTE.trim, 1);
      g.fillRect(16, 28, 12, 12);
      g.fillRect(36, 28, 12, 12);
      return;
    case 'castle':
      g.fillStyle(PALETTE.stoneDark, 1);
      g.fillRect(6, 16, 52, 32);
      g.fillStyle(PALETTE.stone, 1);
      g.fillRect(8, 8, 10, 40);
      g.fillRect(46, 8, 10, 40);
      g.fillRect(24, 12, 16, 36);
      g.fillStyle(door, 1);
      g.fillRect(28, 32, 10, 16);
      g.fillStyle(PALETTE.ink, 1);
      g.fillRect(10, 14, 4, 6);
      g.fillRect(50, 14, 4, 6);
      return;
    default: {
      const neverKind: never = kind;
      return neverKind;
    }
  }
}

type Wasd = {
  W: Phaser.Input.Keyboard.Key;
  A: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
};

type Floater = { text: Phaser.GameObjects.Text; life: number };

export class HomeScene extends Phaser.Scene {
  private world!: HomeWorld;
  private player!: Phaser.GameObjects.Image;
  private bodies = new Map<string, Phaser.GameObjects.Image>();
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private ground!: Phaser.GameObjects.Graphics;
  private lowFx!: Phaser.GameObjects.Graphics;
  private highFx!: Phaser.GameObjects.Graphics;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Wasd;
  private started = false;
  private bookOpen = false;
  private hitstop = 0;
  private spin = 0;
  private flash = 0;
  private intro?: Phaser.GameObjects.Container;
  private epitaph?: Phaser.GameObjects.Text;
  private hud!: Phaser.GameObjects.Text;
  private tag!: Phaser.GameObjects.Text;
  private bookLayer?: Phaser.GameObjects.Container;
  private floaters: Floater[] = [];

  constructor() {
    super('home');
  }

  create(): void {
    const saved = this.game.registry.get('book') as BookOfEnds | undefined;
    this.world = createHomeWorld({ seed: 42, book: saved });
    this.paintGround();
    this.paintTextures();
    this.player = this.add.image(this.world.player.x, this.world.player.y, 'wh-player').setOrigin(0.5, 1).setScale(2);
    this.lowFx = this.add.graphics().setDepth(2);
    this.highFx = this.add.graphics().setDepth(900);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Wasd;
    this.cameras.main.setBounds(0, 0, this.world.map.width, this.world.map.height);
    this.cameras.main.setBackgroundColor(PALETTE.sky);
    this.cameras.main.startFollow(this.player, true, 0.16, 0.16);
    this.cameras.main.setDeadzone(36, 24);
    this.cameras.main.setRoundPixels(true);
    this.add.rectangle(320, 22, 640, 44, 0xf4efe4, 0.9).setScrollFactor(0).setDepth(1990);
    this.add.rectangle(320, 346, 640, 28, 0xf4efe4, 0.9).setScrollFactor(0).setDepth(1990);
    this.hud = this.add.text(8, 6, '', this.uiFont(14, '#2c2118')).setScrollFactor(0).setDepth(2000);
    this.tag = this.add.text(8, 24, TAGLINES[0], this.uiFont(11, '#24485e')).setScrollFactor(0).setDepth(2000);
    this.add.text(56, 338, 'WASD move    B book of ends    Esc pause', this.uiFont(11, '#3e2a22')).setScrollFactor(0).setDepth(2000);
    this.epitaph = this.add
      .text(320, 150, '', this.uiFont(16, '#8e3d22'))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2100)
      .setAlign('center')
      .setWordWrapWidth(420)
      .setBackgroundColor('#f4efe4')
      .setPadding(8, 6, 8, 6)
      .setVisible(false);
    this.makeIntro();
    this.input.keyboard?.on('keydown-B', () => {
      if (!this.started) return;
      this.bookOpen = !this.bookOpen;
      this.layoutBook();
    });
    this.input.keyboard?.on('keydown-ENTER', () => this.dismissIntro());
    this.input.keyboard?.on('keydown-SPACE', () => this.dismissIntro());
    this.input.on('pointerdown', () => {
      if (!this.started) this.dismissIntro();
    });
    this.syncActors();
    this.paintHud();
    const hook = window as unknown as { __welcum?: { world: HomeWorld; scene: HomeScene } };
    hook.__welcum = { world: this.world, scene: this };
  }

  private uiFont(size: number, color: string): Phaser.Types.GameObjects.Text.TextStyle {
    return { fontFamily: 'Courier New, monospace', fontSize: `${size}px`, color };
  }

  private paintGround(): void {
    this.ground = this.add.graphics().setDepth(0);
    const map = this.world.map;
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        const tile = map.tiles[r * map.cols + c] as GroundTile;
        const x = c * map.tile;
        const y = r * map.tile;
        if (tile === 'trim') {
          this.ground.fillStyle(PALETTE.plaza, 1);
          this.ground.fillRect(x, y, map.tile, map.tile);
          this.ground.fillStyle(PALETTE.trim, 1);
          const cc = c - Math.floor(map.cols / 2);
          const rr = r - Math.floor(map.rows / 2);
          if (Math.abs(cc) >= 4) this.ground.fillRect(x + (cc > 0 ? map.tile - 4 : 0), y, 4, map.tile);
          if (Math.abs(rr) >= 3) this.ground.fillRect(x, y + (rr > 0 ? map.tile - 4 : 0), map.tile, 4);
        } else {
          this.ground.fillStyle(groundColor(tile), 1);
          this.ground.fillRect(x, y, map.tile, map.tile);
        }
        if (tile === 'olive') {
          this.ground.fillStyle(PALETTE.oliveDark, 1);
          this.ground.fillCircle(x + 16, y + 22, 8);
          this.ground.fillStyle(PALETTE.olive, 1);
          this.ground.fillCircle(x + 16, y + 14, 11);
        } else if (tile === 'stone') {
          this.ground.fillStyle(PALETTE.stoneDark, 1);
          this.ground.fillRect(x + 8, y + 14, 16, 10);
        } else if (tile === 'path') {
          this.ground.fillStyle(PALETTE.pathDark, 0.35);
          this.ground.fillRect(x, y + 26, map.tile, 4);
        }
      }
    }
  }

  private paintTextures(): void {
    this.bake('wh-player', 16, 24, (g) => {
      g.fillStyle(PALETTE.hat, 1);
      g.fillRect(2, 2, 12, 4);
      g.fillRect(4, 0, 8, 3);
      g.fillStyle(PALETTE.loaf, 1);
      g.fillRect(5, 6, 6, 5);
      g.fillStyle(PALETTE.plaza, 1);
      g.fillRect(4, 12, 8, 6);
      g.fillStyle(PALETTE.ink, 1);
      g.fillRect(4, 18, 3, 6);
      g.fillRect(9, 18, 3, 6);
      g.fillStyle(PALETTE.wood, 1);
      g.fillRect(13, 8, 2, 12);
    });
    const kinds: BuildingKind[] = [
      'outhouse',
      'well',
      'market_stall',
      'farmhouse',
      'bakery',
      'tavern',
      'blacksmith',
      'windmill',
      'church',
      'bullring',
      'aqueduct',
      'castle',
    ];
    for (const kind of kinds) {
      this.bake(`wh-${kind}`, TEX_W, TEX_H, (g) => paintBuilding(g, kind));
    }
  }

  private bake(key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
    this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  private makeIntro(): void {
    const box = this.add.rectangle(320, 168, 460, 150, PALETTE.plaza, 0.94).setStrokeStyle(3, PALETTE.trim);
    const title = this.add.text(320, 112, TITLE, this.uiFont(32, '#8e3d22')).setOrigin(0.5);
    const lines = TAGLINES.map((line, i) => this.add.text(320, 148 + i * 18, line, this.uiFont(13, '#24485e')).setOrigin(0.5));
    const hint = this.add.text(320, 214, 'WASD, arrows, or the mouse. They wake when you do.', this.uiFont(12, '#8e3d22')).setOrigin(0.5);
    this.intro = this.add.container(0, 0, [box, title, ...lines, hint]).setScrollFactor(0).setDepth(3000);
  }

  private dismissIntro(): void {
    if (this.started) return;
    this.started = true;
    this.intro?.destroy();
    this.intro = undefined;
  }

  private readInput(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.cursors.left?.isDown || this.wasd.A.isDown) x -= 1;
    if (this.cursors.right?.isDown || this.wasd.D.isDown) x += 1;
    if (this.cursors.up?.isDown || this.wasd.W.isDown) y -= 1;
    if (this.cursors.down?.isDown || this.wasd.S.isDown) y += 1;
    if (x === 0 && y === 0 && this.input.activePointer.isDown) {
      const dx = this.input.activePointer.worldX - this.world.player.x;
      const dy = this.input.activePointer.worldY - this.world.player.y;
      if (Math.hypot(dx, dy) > 14) return { x: dx, y: dy };
    }
    return { x, y };
  }

  update(_time: number, delta: number): void {
    const moving = this.readInput();
    if (!this.started) {
      if (moving.x !== 0 || moving.y !== 0) this.dismissIntro();
      else {
        this.syncActors();
        return;
      }
    }
    if (this.bookOpen) {
      this.syncActors();
      return;
    }
    if (this.hitstop > 0) {
      this.hitstop -= delta;
      this.syncActors();
      this.tickFloaters(delta);
      this.paintHud();
      return;
    }
    const events = stepHome(this.world, moving, Math.min(delta, 32));
    for (const event of events) {
      if (event.type === 'bonk') {
        this.hitstop = Math.max(this.hitstop, event.stop);
        this.cameras.main.shake(140, event.shake);
        this.flash = 90;
        this.spawnFloater(event.x, event.y, event.text);
      } else if (event.type === 'death') {
        this.hitstop = Math.max(this.hitstop, event.stop);
        this.cameras.main.shake(280, event.shake);
        this.flash = 200;
        this.persistBook();
      }
    }
    this.syncActors();
    this.tickFloaters(delta);
    this.paintHud();
  }

  private persistBook(): void {
    this.game.registry.set('book', this.world.book);
    const persist = this.game.registry.get('persistBook') as ((book: BookOfEnds) => void) | undefined;
    persist?.(this.world.book);
  }

  private spawnFloater(x: number, y: number, label: string): void {
    const text = this.add.text(x, y, label.toUpperCase(), this.uiFont(12, '#8e3d22')).setOrigin(0.5).setDepth(1200);
    this.floaters.push({ text, life: 700 });
  }

  private tickFloaters(delta: number): void {
    this.floaters = this.floaters.filter((floater) => {
      floater.life -= delta;
      floater.text.y -= delta * 0.03;
      floater.text.setAlpha(Math.max(0, floater.life / 700));
      if (floater.life <= 0) floater.text.destroy();
      return floater.life > 0;
    });
  }

  private syncActors(): void {
    const world = this.world;
    this.lowFx.clear();
    this.highFx.clear();
    const seen = new Set<string>();
    for (const actor of world.buildings) {
      seen.add(actor.id);
      const scale = baseScale(actor.kind) * actor.scale;
      let body = this.bodies.get(actor.id);
      if (!body) {
        body = this.add.image(actor.x, actor.y, `wh-${actor.kind}`).setOrigin(0.5, 1);
        this.bodies.set(actor.id, body);
        const label = this.add.text(actor.x, actor.y, '', this.uiFont(10, '#8e3d22')).setOrigin(0.5, 1).setDepth(1100);
        this.labels.set(actor.id, label);
      }
      body.setPosition(actor.x, actor.y);
      body.setScale(scale);
      body.setDepth(actor.y);
      this.drawLegs(actor, scale);
      const label = this.labels.get(actor.id);
      if (label) {
        label.setPosition(actor.x, actor.y - 78 * scale);
        label.setText(this.caption(actor));
        label.setDepth(actor.y + 2);
      }
    }
    this.drawAir();
    const player = world.player;
    this.player.setPosition(player.x, player.y);
    this.player.setDepth(player.y + 1);
    if (!player.alive) {
      this.spin += 18;
      this.player.setAngle(this.spin);
    } else {
      this.spin = 0;
      this.player.setAngle(0);
    }
    if (this.flash > 0) {
      this.player.setTint(0xffb089);
      this.flash -= 16;
    } else this.player.clearTint();
    if (this.epitaph) {
      const show = world.epitaphMs > 0 && Boolean(world.lastEpitaph);
      this.epitaph.setText(show ? (world.lastEpitaph ?? '') : '');
      this.epitaph.setVisible(show);
    }
  }

  private caption(actor: Actor): string {
    switch (actor.state) {
      case 'lure':
        return 'come in';
      case 'windup':
        return actor.attackId ? (attackOf(actor.kind, actor.attackId)?.name ?? '') : '';
      case 'reel':
        return 'reel';
      case 'grab':
      case 'tug':
        return 'MINE';
      case 'brawl':
        return 'HEY';
      case 'swallow':
        return 'gulp';
      case 'strike':
        return actor.attackId ? (attackOf(actor.kind, actor.attackId)?.name ?? '') : '';
      case 'doze':
      case 'seek':
      case 'recover':
      case 'stub':
        return '';
      default: {
        const neverState: never = actor.state;
        return neverState;
      }
    }
  }

  private drawLegs(actor: Actor, scale: number): void {
    if (actor.kind === 'well') return;
    const moving = actor.state === 'seek' || actor.state === 'windup' || actor.state === 'brawl';
    const bob = Math.sin(this.time.now / 80 + actor.x) * (moving ? 5 : 1.2);
    const leg = 16 * scale;
    this.lowFx.lineStyle(2, PALETTE.wood, 1);
    for (let i = 0; i < 4; i++) {
      const side = i < 2 ? -1 : 1;
      const phase = (i % 2 === 0 ? bob : -bob) * scale;
      const hipX = actor.x + side * 7 * scale;
      const hipY = actor.y - leg;
      const footX = actor.x + side * (10 + (i % 2) * 5) * scale + phase;
      this.lowFx.lineBetween(hipX, hipY, footX, actor.y);
    }
    if (actor.kind === 'windmill') {
      const ang = this.time.now / 160;
      const len = 36 * scale;
      const cx = actor.x;
      const cy = actor.y - 52 * scale;
      this.highFx.lineStyle(4, PALETTE.pathDark, 1);
      for (let i = 0; i < 4; i++) {
        const a = ang + (i * Math.PI) / 2;
        this.highFx.lineBetween(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len * 0.72);
      }
    }
    if (actor.kind === 'farmhouse') {
      this.highFx.lineStyle(1, PALETTE.trimDark, 1);
      this.highFx.lineBetween(actor.x - 22 * scale, actor.y - 36 * scale, actor.x + 24 * scale, actor.y - 30 * scale);
    }
    if (actor.state === 'lure') {
      this.highFx.fillStyle(0xf2b84b, 0.9);
      this.highFx.fillRect(actor.x - 5, actor.y - 34 * scale, 10, 18 * scale);
    }
  }

  private drawAir(): void {
    for (const hazard of this.world.hazards) {
      this.lowFx.fillStyle(hazard.hazard === 'fire' ? PALETTE.fire : PALETTE.wine, hazard.hazard === 'fire' ? 0.8 : 0.55);
      this.lowFx.fillEllipse(hazard.x, hazard.y, hazard.r * 2, hazard.r);
    }
    for (const shot of this.world.shots) {
      const color = shotColor(shot.shot);
      this.highFx.fillStyle(color, 1);
      this.highFx.fillRect(shot.x - shot.radius, shot.y - shot.radius, shot.radius * 2, shot.radius * 2);
      if (shot.shot === 'bucket') {
        const owner = this.world.buildings.find((b) => b.id === shot.ownerId);
        if (owner) {
          this.highFx.lineStyle(1, PALETTE.wood, 1);
          this.highFx.lineBetween(owner.x, owner.y - 20, shot.x, shot.y);
        }
      }
    }
    if (this.world.player.reeledBy) {
      const well = this.world.buildings.find((b) => b.id === this.world.player.reeledBy);
      if (well) {
        this.highFx.lineStyle(2, PALETTE.wood, 1);
        this.highFx.lineBetween(well.x, well.y - 16, this.world.player.x, this.world.player.y - 10);
      }
    }
    for (const actor of this.world.buildings) {
      const def = defOf(actor.kind);
      if (def.suction <= 0 || actor.state === 'doze' || actor.state === 'stub') continue;
      this.highFx.lineStyle(1, PALETTE.trim, 0.35);
      this.highFx.strokeCircle(actor.x, actor.y - 10, def.suctionRange * 0.45);
    }
  }

  private paintHud(): void {
    const unique = this.world.book.entries.length;
    const tug = !this.world.player.alive
      ? 'inside'
      : this.world.tug
        ? this.world.tug.stalemate
          ? 'TUG OF WAR'
          : 'THEY PULL'
        : this.world.mercyMs > 0
          ? 'they stir'
          : 'still outside';
    this.hud.setText(`${TITLE}   ends ${unique}   deaths ${this.world.deaths}   ${tug}`);
    const line = TAGLINES[Math.floor(this.world.timeMs / 2400) % TAGLINES.length] ?? TAGLINES[0];
    this.tag.setText(line);
  }

  private layoutBook(): void {
    this.bookLayer?.destroy();
    this.bookLayer = undefined;
    if (!this.bookOpen) return;
    const catalog = allEnds();
    const known = new Set(this.world.book.entries.map((e) => e.key));
    const written = this.world.book.entries.length;
    const box = this.add.rectangle(320, 180, 500, 300, PALETTE.plaza, 0.96).setStrokeStyle(3, PALETTE.trim);
    const title = this.add.text(90, 48, `Book of Ends  ${written} / ${catalog.length}`, this.uiFont(16, '#8e3d22'));
    const lines: Phaser.GameObjects.Text[] = [];
    const shown = this.world.book.entries.slice(0, 8);
    if (shown.length === 0) {
      lines.push(this.add.text(90, 80, 'No endings yet. Step outside and let them try.', this.uiFont(13, '#2c2118')));
    }
    shown.forEach((entry, i) => {
      lines.push(this.add.text(90, 78 + i * 22, `x${entry.count}  ${entry.epitaph}`, this.uiFont(12, '#2c2118')).setWordWrapWidth(440));
    });
    const dreaming = stubKinds().map((d) => d.name).join(', ');
    const foot = this.add.text(90, 268, `Still dreaming: ${dreaming}`, this.uiFont(12, '#24485e'));
    const hidden = catalog.length - known.size;
    const more = this.add.text(90, 290, `${hidden} ends still unwritten. B closes the book.`, this.uiFont(12, '#3e6d8c'));
    this.bookLayer = this.add.container(0, 0, [box, title, ...lines, foot, more]).setScrollFactor(0).setDepth(4000);
  }
}

function shotColor(shot: ShotKind): number {
  switch (shot) {
    case 'loaf':
      return PALETTE.fire;
    case 'pottery':
      return PALETTE.pathDark;
    case 'fruit':
      return 0xc63b3b;
    case 'barrel':
      return PALETTE.wood;
    case 'blade':
      return PALETTE.stone;
    case 'bucket':
      return PALETTE.trimDark;
    default: {
      const neverShot: never = shot;
      return neverShot;
    }
  }
}

/**
 * Cozy building interior: a small room (floor, walls, furniture) with the resident, if any.
 * Launched by OverworldScene (which sleeps meanwhile). E at the door mat or Esc leaves.
 */

import Phaser from 'phaser';
import art from '../data/art/settlements.json';
import { TILE_PX } from '../sim/map/constants';
import {
  EMPTY_ROOM_LINE, INTERIOR_TITLE, OCCUPANT_ROLE, exitMat, interiorLine, interiorPlan, interiorWalkable, nearExit,
  type Furniture, type InteriorKind, type InteriorPlan,
} from '../sim/map/interiors';
import { FEEL } from './feel';
import { walkDelta } from './walk-delta';
import { HERO_TEX, SHADOW_TEX } from './sheet-frames';
import { heroWalkAnim } from './painters/overworld-paint';

export const INTERIOR_SCENE_KEY = 'interior';

export type InteriorEnterData = {
  returnTo: string;
  buildingId: string;
  townId: string;
  townName: string;
  kind: InteriorKind;
  paletteIndex: number;
  occupant?: { id: string; name: string; tint: number };
  despair01: number;
};

export type InteriorState = {
  active: boolean;
  buildingId: string;
  townId: string;
  kind: InteriorKind;
  occupantId: string | null;
  /** Player position in room tiles (origin = floor top-left). */
  player: { col: number; row: number };
  furnitureCount: number;
};

const T = TILE_PX;
const WALL_ROWS = 2;
const ACCENTS = [0xb5524a, 0x4f7a8a, 0x7a8f4a];
const FLOOR: Record<InteriorKind, [number, number]> = { house: [0xb88d5a, 0xa87f50], shop: [0xc9a56e, 0xb8955f], inn: [0x9c6f45, 0x8d633e] };
const talkNear = 58;

const hex = (s: string): number => parseInt(s.replace('#', ''), 16);
const shade = (c: number, k: number): number => {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * k)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * k)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * k)));
  return (r << 16) | (g << 8) | b;
};

export class InteriorScene extends Phaser.Scene {
  private data0!: InteriorEnterData;
  private plan!: InteriorPlan;
  private ox = 0;
  private oy = 0;
  private player!: Phaser.GameObjects.Sprite;
  private npc?: Phaser.GameObjects.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private prompt!: Phaser.GameObjects.Text;
  private bubble!: Phaser.GameObjects.Text;
  private flames: { obj: Phaser.GameObjects.Ellipse | Phaser.GameObjects.Arc; base: number }[] = [];
  private leaving = false;
  private born = 0;
  private visits = 0;
  private bubbleTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super(INTERIOR_SCENE_KEY);
  }

  init(data: InteriorEnterData): void {
    this.data0 = data;
    this.leaving = false;
    this.visits = 0;
    this.flames = [];
  }

  create(): void {
    const d = this.data0;
    this.born = this.time.now;
    this.plan = interiorPlan(d.kind, d.buildingId);
    const p = this.plan;
    const W = this.scale.width, H = this.scale.height;
    this.ox = Math.round((W - p.cols * T) / 2);
    this.oy = Math.round((H - (p.rows + WALL_ROWS) * T) / 2 + WALL_ROWS * T - 8);
    this.cameras.main.setBackgroundColor('#14100c').setZoom(1).setScroll(0, 0);
    this.cameras.main.fadeIn(220, 20, 16, 12);
    // Esc means "leave the room" here, not "open the pause menu" (see ui/game-flow.ts).
    document.body.dataset.hfLocalOverlay = 'true';

    this.drawRoom();
    for (const o of p.furniture) this.drawFurniture(o);
    this.spawnPeople();
    this.addHud();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as typeof this.wasd;
    this.input.keyboard?.on('keydown-E', () => this.onInteract());
    this.input.keyboard?.on('keydown-ENTER', () => this.onInteract());
    this.input.keyboard?.on('keydown-ESC', () => this.leave());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.body.dataset.hfLocalOverlay = 'false';
      this.input.keyboard?.removeAllListeners();
      this.bubbleTimer?.remove();
    });
  }

  /** Test/e2e snapshot. */
  state(): InteriorState {
    return {
      active: this.scene.isActive(),
      buildingId: this.data0.buildingId,
      townId: this.data0.townId,
      kind: this.data0.kind,
      occupantId: this.data0.occupant?.id ?? null,
      player: { col: (this.player.x - this.ox) / T, row: (this.player.y - this.oy) / T },
      furnitureCount: this.plan.furniture.length,
    };
  }

  /** Leave via the door: fade, then wake the overworld. Safe to call repeatedly. */
  leave(instant = false): void {
    if (this.leaving) return;
    this.leaving = true;
    const done = (): void => {
      const back = this.data0.returnTo;
      this.scene.stop();
      this.scene.wake(back, { fromInterior: this.data0.buildingId });
    };
    if (instant) return done();
    this.cameras.main.fadeOut(180, 20, 16, 12);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, done);
  }

  // ── drawing ──────────────────────────────────────────────────────────────

  private drawRoom(): void {
    const { plan: p, ox, oy } = this;
    const pal = art.palettes[this.data0.paletteIndex % art.palettes.length]!;
    const wall = hex(pal.wall), wallShadow = hex(pal.shadow);
    const g = this.add.graphics().setDepth(0);
    const [fa, fb] = FLOOR[p.kind];
    const w = p.cols * T, h = p.rows * T;
    // outer frame + back wall + floor
    g.fillStyle(0x2a1f17).fillRect(ox - 12, oy - WALL_ROWS * T - 12, w + 24, (p.rows + WALL_ROWS) * T + 12 + 24);
    g.fillStyle(wall).fillRect(ox, oy - WALL_ROWS * T, w, WALL_ROWS * T);
    g.fillStyle(shade(wall, 0.9)).fillRect(ox, oy - WALL_ROWS * T, w, 6);
    for (let x = 0; x < w; x += 24) g.fillStyle(shade(wall, 0.95)).fillRect(ox + x, oy - WALL_ROWS * T + 8, 2, WALL_ROWS * T - 24);
    g.fillStyle(wallShadow).fillRect(ox, oy - 22, w, 14); // wainscot
    g.fillStyle(shade(wallShadow, 0.8)).fillRect(ox, oy - 22, w, 2);
    g.fillStyle(0x654936).fillRect(ox, oy - 8, w, 8); // baseboard
    for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) {
      g.fillStyle((c + r) % 2 ? fa : fb).fillRect(ox + c * T, oy + r * T, T, T);
      g.fillStyle(shade(fa, 0.82)).fillRect(ox + c * T, oy + r * T + T - 2, T, 2);
      g.fillStyle(shade(fa, 0.88)).fillRect(ox + c * T + ((r * 7 + c * 3) % 5) * 5 + 3, oy + r * T + 10 + (c % 3) * 5, 4, 1);
    }
    g.fillStyle(0x000000, 0.18).fillRect(ox, oy, w, 6); // soft wall shadow on floor
    // side walls (thin) and front wall with doorway
    g.fillStyle(0x3b2c20).fillRect(ox - 12, oy - WALL_ROWS * T, 12, h + WALL_ROWS * T + 12);
    g.fillStyle(0x3b2c20).fillRect(ox + w, oy - WALL_ROWS * T, 12, h + WALL_ROWS * T + 12);
    const dx = ox + p.doorCol * T;
    g.fillStyle(0x3b2c20).fillRect(ox, oy + h, dx - ox, 12).fillRect(dx + T, oy + h, ox + w - dx - T, 12);
    g.fillStyle(0x654936).fillRect(dx - 3, oy + h - 2, T + 6, 3);
    g.fillStyle(0xcfe3a8).fillRect(dx, oy + h, T, 12); // daylight through the open door
    g.fillStyle(0x8a3a2c).fillRect(dx + 2, oy + h - 14, T - 4, 12).fillStyle(0xb85a40).fillRect(dx + 4, oy + h - 12, T - 8, 8); // door mat
    g.fillStyle(0x1b1612).fillRect(ox - 12, oy + h + 12, w + 24, 12);
    // warm vignette
    this.add.rectangle(ox + w / 2, oy + h / 2 - WALL_ROWS * T / 2, w, h + WALL_ROWS * T, 0xf2b070, 0.06).setDepth(900_000);
  }

  private drawFurniture(o: Furniture): void {
    const { ox, oy, plan } = this;
    const x = ox + o.col * T, w = o.w * T, h = o.h * T;
    const y = o.wall ? oy - WALL_ROWS * T + 10 : oy + o.row * T;
    const accent = ACCENTS[plan.accent]!;
    const g = this.add.graphics();
    const rect = (rx: number, ry: number, rw: number, rh: number, c: number, a = 1): void => void g.fillStyle(c, a).fillRect(x + rx, y + ry, rw, rh);
    const wood = 0x8d6240, woodDark = 0x654936, woodLight = 0xc4a06c;
    // Depth: sort by the base of the piece, like sprites (origin bottom).
    g.setDepth(o.wall ? 3 : o.type === 'rug' ? 2 : oy + (o.row + o.h) * T - 0.1);
    switch (o.type) {
      case 'rug': {
        rect(2, 2, w - 4, h - 4, accent); rect(6, 6, w - 12, h - 12, shade(accent, 1.25)); rect(10, 10, w - 20, h - 20, shade(accent, 0.85));
        for (let i = 14; i < w - 14; i += 8) rect(i, 2, 3, 4, 0xe8d6a8);
        break;
      }
      case 'bed': {
        rect(0, 0, w, h, woodDark); rect(2, 2, w - 4, 14, wood); rect(6, 14, w - 12, h - 20, 0xf0e4c8);
        rect(10, 16, w - 20, 14, 0xfff6e0); rect(6, 34, w - 12, h - 40, accent); rect(6, 34, w - 12, 4, shade(accent, 1.25));
        rect(0, h - 6, w, 6, woodDark);
        break;
      }
      case 'table': {
        rect(3, h - 8, 5, 8, woodDark); rect(w - 8, h - 8, 5, 8, woodDark);
        rect(0, 4, w, h - 14, woodLight); rect(0, h - 12, w, 5, wood); rect(2, 8, w - 4, 1, shade(woodLight, 0.85));
        if (this.plan.kind === 'inn') { rect(w / 2 - 3, 2, 6, 7, 0xd9d3c0); rect(w / 2 - 1, 0, 2, 3, 0xffd877); }
        else { rect(w / 2 - 5, 3, 10, 6, 0xe7e1d0); rect(w / 2 - 2, 4, 4, 2, 0xb5524a); }
        break;
      }
      case 'stool': {
        rect(6, 16, 3, 10, woodDark); rect(T - 9, 16, 3, 10, woodDark); rect(4, 10, T - 8, 8, wood); rect(4, 10, T - 8, 3, woodLight);
        break;
      }
      case 'armchair': {
        rect(3, 4, T - 6, 22, shade(accent, 0.8)); rect(6, 14, T - 12, 12, accent); rect(1, 10, 5, 16, shade(accent, 0.7)); rect(T - 6, 10, 5, 16, shade(accent, 0.7));
        rect(4, 26, 4, 4, woodDark); rect(T - 8, 26, 4, 4, woodDark);
        break;
      }
      case 'hearth': {
        // chimney breast climbs the back wall; stone surround with a lit opening
        rect(6, -WALL_ROWS * T + 10, w - 12, WALL_ROWS * T - 10 + 4, 0x8a8f86);
        rect(8, -WALL_ROWS * T + 10, w - 16, WALL_ROWS * T - 10, 0xa5a899);
        rect(0, 0, w, T, 0x777f79); rect(2, 2, w - 4, 6, 0xc6c3a5);
        rect(8, 10, w - 16, T - 10, 0x1d1511); rect(8, 10, w - 16, 2, 0x55392a);
        rect(w / 2 - 10, T - 6, 20, 4, 0x5a3a24);
        const cx = x + w / 2, cy = y + T - 8;
        this.add.circle(cx, cy - 4, 26, 0xf2b84b, 0.2).setBlendMode(Phaser.BlendModes.ADD).setDepth(901_000);
        const fl = this.add.ellipse(cx, cy - 4, 12, 15, 0xf08a30).setDepth(oy + o.row * T + T);
        const core = this.add.ellipse(cx, cy - 2, 6, 9, 0xffe08a).setDepth(oy + o.row * T + T + 0.1);
        this.flames.push({ obj: fl, base: 1 }, { obj: core, base: 1 });
        break;
      }
      case 'shelf': case 'books': {
        const bookish = o.type === 'books';
        // Floor unit climbs into the wall band; the wall-mounted version sits wholly inside it.
        const top = o.wall ? 0 : -34, rows = o.wall ? [4, 22] : [-30, -12, 6];
        rect(0, top, w, (o.wall ? 46 : T + 34), woodDark); rect(2, top + 2, w - 4, (o.wall ? 42 : T + 30), shade(wood, 0.9));
        for (const sy of rows) {
          rect(2, sy + 13, w - 4, 3, woodLight);
          for (let i = 0, ix = 5; ix < w - 8; i++, ix += bookish ? 5 : 11) {
            const c = [0xb5524a, 0x4f7a8a, 0xc9a04e, 0x7a8f4a, 0x8a6aa0][(i + plan.accent + (sy < 0 ? 1 : 0)) % 5]!;
            if (bookish) rect(ix, sy + 1, 4, 12, c);
            else { rect(ix, sy + 5, 8, 8, c); rect(ix + 1, sy + 3, 6, 3, shade(c, 1.2)); }
          }
        }
        break;
      }
      case 'counter': {
        rect(0, 6, w, T - 6, wood); rect(0, 2, w, 8, woodLight); rect(0, 10, w, 2, woodDark);
        for (let i = 6; i < w - 6; i += 18) rect(i, 16, 1, T - 20, shade(wood, 0.8));
        if (plan.kind === 'shop') { rect(10, -4, 8, 8, 0xd6b582); rect(11, -6, 6, 3, 0xc27d59); rect(w - 26, -2, 14, 5, 0xe8d6a8); rect(w - 24, -5, 4, 4, 0xffd877); rect(w / 2, -4, 10, 6, accent); }
        else for (let i = 14; i < w - 10; i += 28) { rect(i, -3, 6, 7, 0xd9d3c0); rect(i + 1, -1, 4, 2, 0xe0b24a); }
        break;
      }
      case 'plant': {
        rect(9, 18, 14, 11, 0xa65f45); rect(8, 16, 16, 3, 0xc27d59);
        for (const [px, py, pw] of [[10, 4, 6], [16, 2, 6], [6, 9, 6], [19, 9, 6], [13, 8, 6]] as const) { rect(px, py, pw, 10, 0x547b3a); rect(px + 1, py, pw - 2, 5, 0x7fa54f); }
        break;
      }
      case 'chest': {
        rect(3, 10, T - 6, 18, woodDark); rect(5, 12, T - 10, 14, wood); rect(3, 8, T - 6, 6, woodLight); rect(T / 2 - 2, 14, 4, 5, 0xecc76e);
        break;
      }
      case 'crate': {
        rect(3, 8, T - 6, T - 10, wood); rect(3, 8, T - 6, 3, woodLight); rect(3, 8, 3, T - 10, woodDark); rect(T - 6, 8, 3, T - 10, woodDark); rect(5, 18, T - 10, 2, woodDark);
        rect(8, 2, 8, 8, 0xd6b582); rect(18, 4, 6, 6, 0x82a05c);
        break;
      }
      case 'barrel': {
        rect(5, 6, T - 10, T - 8, wood); rect(7, 4, T - 14, 3, woodLight); rect(5, 12, T - 10, 2, 0x4a3a2c); rect(5, 22, T - 10, 2, 0x4a3a2c); rect(5, 6, 2, T - 8, woodDark); rect(T - 7, 6, 2, T - 8, woodDark);
        break;
      }
      case 'lantern': {
        // standing lamp: base, pole, glowing shade
        rect(T / 2 - 5, T - 6, 10, 4, 0x4a3a2c); rect(T / 2 - 1, 10, 2, T - 14, 0x4a3a2c);
        rect(T / 2 - 6, 2, 12, 10, 0xe9d4a2); rect(T / 2 - 6, 2, 12, 2, 0xc4a06c); rect(T / 2 - 4, 6, 8, 4, 0xffe9a8);
        const c = this.add.circle(x + T / 2, y + 8, 24, 0xffd877, 0.16).setBlendMode(Phaser.BlendModes.ADD).setDepth(901_000);
        this.flames.push({ obj: c, base: 0.16 });
        break;
      }
      case 'window': {
        rect(0, 0, w, 40, woodDark); rect(3, 3, w - 6, 34, 0x9ec7d8); rect(3, 3, w - 6, 12, 0xcfe3ec); rect(w / 2 - 1, 3, 2, 34, woodDark); rect(3, 19, w - 6, 2, woodDark);
        rect(-2, 38, w + 4, 4, woodLight);
        this.add.rectangle(x + w / 2, y + 40 + 16, w - 10, 28, 0xfff0b8, 0.07).setDepth(1);
        break;
      }
      case 'sign': {
        rect(w / 2 - 22, 0, 2, 8, 0x4a3a2c); rect(w / 2 + 20, 0, 2, 8, 0x4a3a2c); rect(w / 2 - 28, 8, 56, 20, wood); rect(w / 2 - 26, 10, 52, 16, woodLight);
        this.add.text(x + w / 2, y + 18, INTERIOR_TITLE[plan.kind], { fontFamily: 'Georgia, serif', fontSize: '9px', color: '#3b2c20' }).setOrigin(0.5).setDepth(4);
        break;
      }
    }
  }

  private spawnPeople(): void {
    const { plan: p, ox, oy } = this;
    const hasFrame = this.textures.exists(HERO_TEX) && this.textures.get(HERO_TEX).has('7');
    const put = (col: number, row: number, tint?: number): Phaser.GameObjects.Sprite => {
      const x = ox + (col + 0.5) * T, y = oy + (row + 1) * T - 2;
      if (this.textures.exists(SHADOW_TEX)) this.add.image(x, y - 2, SHADOW_TEX).setScale(1.4, 0.9).setDepth(y - 0.5);
      const s = this.add.sprite(x, y, HERO_TEX, hasFrame ? '7' : undefined).setOrigin(0.5, 1).setScale(FEEL.worldScale.artScale).setDepth(y);
      if (tint !== undefined) s.setTint(tint);
      if (this.anims.exists('hero-idle-down')) s.play('hero-idle-down');
      return s;
    };
    const occ = this.data0.occupant;
    if (occ) {
      this.npc = put(p.npc.col, p.npc.row, occ.tint);
      this.add.text(this.npc.x, this.npc.y - 36, `${occ.name}`, { fontFamily: 'Georgia, serif', fontSize: '10px', color: '#f4e6c8', stroke: '#1b1612', strokeThickness: 3 })
        .setOrigin(0.5, 1).setDepth(998_000);
    }
    this.player = put(p.spawn.col, p.spawn.row);
    this.player.y = oy + (p.spawn.row + 0.5) * T + 8;
    this.player.setDepth(this.player.y);
  }

  private addHud(): void {
    const d = this.data0;
    const style = { fontFamily: 'Georgia, serif', fontSize: '12px', color: '#f2e2b8', stroke: '#1b1612', strokeThickness: 3 };
    this.add.text(10, 8, `${d.townName} · ${INTERIOR_TITLE[d.kind]}`, { ...style, fontSize: '13px', color: '#f2b84b' }).setScrollFactor(0).setDepth(1_000_000);
    this.add.text(10, 26, d.occupant ? `${d.occupant.name} ${OCCUPANT_ROLE[d.kind]}.` : 'Empty for now.', { ...style, fontSize: '11px', color: '#c8b898' })
      .setScrollFactor(0).setDepth(1_000_000);
    this.add.text(10, this.scale.height - 20, 'Walk: WASD · E: talk / leave at the door · Esc: leave', { ...style, fontSize: '11px', color: '#c8b898' })
      .setScrollFactor(0).setDepth(1_000_000);
    this.prompt = this.add.text(0, 0, '', { ...style, color: '#f2b84b' }).setOrigin(0.5, 1).setDepth(998_500).setVisible(false);
    this.bubble = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#f2e9e4', backgroundColor: '#1b1612', padding: { x: 5, y: 3 }, wordWrap: { width: 210 },
    }).setOrigin(0.5, 1).setDepth(999_000).setVisible(false);
  }

  // ── play ─────────────────────────────────────────────────────────────────

  private nearNpc(): boolean {
    return !!this.npc && Phaser.Math.Distance.Between(this.player.x, this.player.y, this.npc.x, this.npc.y) < talkNear;
  }

  private local(): { x: number; y: number } {
    return { x: this.player.x - this.ox, y: this.player.y - this.oy };
  }

  private onInteract(): void {
    if (this.leaving || this.time.now - this.born < 250) return;
    if (nearExit(this.plan, this.local())) return this.leave();
    if (this.nearNpc() && this.npc) {
      this.say(this.data0.occupant ? interiorLine(this.data0.kind, this.data0.despair01, this.visits++) : EMPTY_ROOM_LINE);
      return;
    }
    if (!this.data0.occupant) this.say(EMPTY_ROOM_LINE, this.player);
  }

  private say(text: string, at: { x: number; y: number } | undefined = this.npc): void {
    if (!at) return;
    this.bubble.setText(text).setPosition(Phaser.Math.Clamp(at.x, 120, this.scale.width - 120), at.y - 44).setVisible(true).setAlpha(1);
    this.bubbleTimer?.remove();
    this.bubbleTimer = this.time.delayedCall(3600, () => this.bubble.setVisible(false));
  }

  update(time: number, delta: number): void {
    for (const f of this.flames) {
      const k = 0.88 + Math.sin(time / 90 + f.obj.x) * 0.1 + Math.sin(time / 37) * 0.05;
      if (f.base === 1) f.obj.setScale(k, 0.9 + (k - 0.85) * 2);
      else f.obj.setAlpha(f.base * (0.8 + (k - 0.88) * 2.5));
    }
    if (this.leaving) return;
    let dx = 0, dy = 0;
    if (this.cursors.left?.isDown || this.wasd.A.isDown) dx -= 1;
    if (this.cursors.right?.isDown || this.wasd.D.isDown) dx += 1;
    if (this.cursors.up?.isDown || this.wasd.W.isDown) dy -= 1;
    if (this.cursors.down?.isDown || this.wasd.S.isDown) dy += 1;
    const ptr = this.input.activePointer;
    if (dx === 0 && dy === 0 && ptr.isDown) {
      const ex = ptr.worldX - this.player.x, ey = ptr.worldY - this.player.y;
      if (Math.abs(ex) > T / 2) dx = Math.sign(ex);
      if (Math.abs(ey) > T / 2) dy = Math.sign(ey);
    }
    if (dx !== 0 || dy !== 0) {
      const step = walkDelta(dx, dy, delta, FEEL.overworld.walkTilesPerSec, T);
      const n = Math.max(1, Math.ceil(Math.hypot(step.dx, step.dy) / 6));
      for (let i = 0; i < n; i++) {
        const lx = this.player.x - this.ox, ly = this.player.y - this.oy;
        if (interiorWalkable(this.plan, lx + step.dx / n, ly)) this.player.x += step.dx / n;
        if (interiorWalkable(this.plan, this.player.x - this.ox, ly + step.dy / n)) this.player.y += step.dy / n;
      }
      this.player.setDepth(this.player.y);
      const { key, flipX } = heroWalkAnim(dx, dy);
      this.player.setFlipX(flipX);
      if (this.anims.exists(key) && this.player.anims.currentAnim?.key !== key) this.player.play(key, true);
    } else if (this.player.anims?.currentAnim?.key?.startsWith('hero-walk') && this.anims.exists('hero-idle-down')) {
      this.player.play('hero-idle-down', true);
    }
    // Context prompt: leave at the door, talk beside the resident.
    const mat = exitMat(this.plan);
    if (nearExit(this.plan, this.local())) {
      this.prompt.setText('E · Leave').setVisible(true).setPosition(this.ox + mat.x, this.oy + mat.y - 44 - Math.abs(Math.sin(time / 300)) * 3);
    } else if (this.nearNpc() && this.npc) {
      this.prompt.setText('E · Talk').setVisible(true).setPosition(this.npc.x, this.npc.y - 50 - Math.abs(Math.sin(time / 300)) * 3);
    } else this.prompt.setVisible(false);
    if (this.npc) this.npc.setScale(FEEL.worldScale.artScale, FEEL.worldScale.artScale + Math.sin(time / 600) * 0.05);
  }
}

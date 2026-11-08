/**
 * Cozy building interior: a small room (floor, walls, furniture) with whoever is home.
 *
 * The room lives INSIDE the overworld scene - it is drawn far off the map and the main camera is
 * parked on it - so the world keeps running behind the door (day clock, residents coming and going,
 * caravans, mail) and the shared overlays (satchel, map, letters, action ring) work unchanged.
 * OverworldScene owns input and calls `update`; E at the exit mat / Esc leaves.
 */

import Phaser from 'phaser';
import art from '../data/art/settlements.json';
import { TILE_PX } from '../sim/map/constants';
import {
  EMPTY_ROOM_LINE, INTERIOR_TITLE, OCCUPANT_ROLE, dayPartLabel, exitMat, interiorLine, interiorPlan, interiorWalkable, nearExit,
  type Furniture, type InteriorKind, type InteriorPlan,
} from '../sim/map/interiors';
import { FEEL } from './feel';
import { walkDelta } from './walk-delta';
import { HERO_TEX, SHADOW_TEX } from './sheet-frames';
import { heroWalkAnim } from './painters/overworld-paint';
import { skyAt } from './world-life';

/** Where the room is drawn in world space: well clear of the map, depth-sorted among itself. */
export const ROOM_ORIGIN = { x: 400_000, y: 300_000 };

export type InteriorEnterData = {
  buildingId: string;
  townId: string;
  townName: string;
  kind: InteriorKind;
  paletteIndex: number;
  despair01: number;
};

export type RoomResident = { id: string; name: string; tint: number };

export type RoomHooks = {
  /** Who is in this building right now (live; polled every frame so people can arrive and leave). */
  residents: (buildingId: string) => RoomResident[];
  /** Is this building's lantern lit (state flag)? */
  lanternLit: (buildingId: string) => boolean;
  /** Day clock 0..1. */
  phase: () => number;
  /** Fully closed (fade done): put the world back. */
  onClosed: (buildingId: string) => void;
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

type Pt = { x: number; y: number };
type Seated = { info: RoomResident; sprite: Phaser.GameObjects.Sprite; shadow?: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; mode: 'idle' | 'arriving' | 'leaving' };

const T = TILE_PX;
const WALL_ROWS = 2;
const ACCENTS = [0xb5524a, 0x4f7a8a, 0x7a8f4a];
const FLOOR: Record<InteriorKind, [number, number]> = { house: [0xb88d5a, 0xa87f50], shop: [0xc9a56e, 0xb8955f], inn: [0x9c6f45, 0x8d633e] };
const talkNear = 58;
const WALK_MS = 1300;

const hex = (s: string): number => parseInt(s.replace('#', ''), 16);
const shade = (c: number, k: number): number => {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * k)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * k)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * k)));
  return (r << 16) | (g << 8) | b;
};

export class InteriorRoom {
  active = false;
  private d!: InteriorEnterData;
  private plan!: InteriorPlan;
  private ox = 0;
  private oy = 0;
  private player!: Phaser.GameObjects.Sprite;
  private playerShadow?: Phaser.GameObjects.Image;
  private seated: Seated | null = null;
  private title!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private light!: Phaser.GameObjects.Rectangle;
  private bubble!: Phaser.GameObjects.Text;
  private lantern?: { glow: Phaser.GameObjects.Arc; shade: Phaser.GameObjects.Graphics; x: number; y: number };
  private flames: { obj: Phaser.GameObjects.Ellipse | Phaser.GameObjects.Arc; base: number }[] = [];
  private owned: Phaser.GameObjects.GameObject[] = [];
  private leaving = false;
  private born = 0;
  private visits = 0;
  private bubbleTimer?: Phaser.Time.TimerEvent;
  private bg = 'rgba(0,0,0,0)';
  private tracked?: Phaser.GameObjects.GameObjectFactory;

  constructor(private host: Phaser.Scene, private hooks: RoomHooks) {}

  private get textures() { return this.host.textures; }
  private get anims() { return this.host.anims; }
  private get scale() { return this.host.scale; }
  private get time() { return this.host.time; }
  /** The host's factory, but everything it makes is remembered so closing the room can remove it. */
  private get add(): Phaser.GameObjects.GameObjectFactory {
    return (this.tracked ??= new Proxy(this.host.add, {
      get: (target, key) => {
        const v = (target as unknown as Record<string | symbol, unknown>)[key];
        if (typeof v !== 'function') return v;
        return (...args: unknown[]) => {
          const made = (v as (...a: unknown[]) => unknown).apply(target, args);
          if (made instanceof Phaser.GameObjects.GameObject) this.owned.push(made);
          return made;
        };
      },
    }));
  }

  /** Build the room, park the camera on it. The caller has already faded out. */
  enter(data: InteriorEnterData): void {
    this.d = data;
    this.active = true;
    this.leaving = false;
    this.visits = 0;
    this.flames = [];
    this.lantern = undefined;
    this.owned = [];
    this.seated = null;
    this.born = this.time.now;
    this.plan = interiorPlan(data.kind, data.buildingId);
    const p = this.plan;
    const W = this.scale.width, H = this.scale.height;
    this.ox = ROOM_ORIGIN.x + Math.round((W - p.cols * T) / 2);
    this.oy = ROOM_ORIGIN.y + Math.round((H - (p.rows + WALL_ROWS) * T) / 2 + WALL_ROWS * T - 8);
    const cam = this.host.cameras.main;
    this.bg = cam.backgroundColor.rgba;
    cam.stopFollow();
    cam.setDeadzone();
    cam.setBackgroundColor('#14100c').setZoom(1).setScroll(ROOM_ORIGIN.x, ROOM_ORIGIN.y);
    cam.fadeIn(220, 20, 16, 12);

    this.drawRoom();
    for (const o of p.furniture) this.drawFurniture(o);
    this.addHud();
    this.spawnPlayer();
    this.syncResident(true);
  }

  /** Test/e2e snapshot. */
  state(): InteriorState | null {
    if (!this.active) return null;
    return {
      active: true,
      buildingId: this.d.buildingId,
      townId: this.d.townId,
      kind: this.d.kind,
      occupantId: this.seated?.info.id ?? null,
      player: { col: (this.player.x - this.ox) / T, row: (this.player.y - this.oy) / T },
      furnitureCount: this.plan.furniture.length,
    };
  }

  /** Where the player stands (world px, room space). */
  playerPos(): Pt { return { x: this.player.x, y: this.player.y }; }
  /** The seated resident's id and head anchor, when there is one to talk to. */
  residentHead(id?: string): { id: string; x: number; y: number } | null {
    const r = this.seated;
    if (!r || (id && r.info.id !== id)) return null;
    return { id: r.info.id, x: r.sprite.x, y: r.sprite.y - 36 };
  }
  /** QA hook: put the player right beside the seated resident (instant). */
  debugStandBesideResident(): boolean {
    const r = this.seated;
    if (!r) return false;
    this.player.setPosition(r.sprite.x - 6, r.sprite.y + 14);
    this.playerShadow?.setPosition(this.player.x, this.player.y - 2);
    return true;
  }
  residentSprite(id: string): Phaser.GameObjects.Sprite | undefined { return this.seated?.info.id === id ? this.seated.sprite : undefined; }
  distanceToResident(): number {
    return this.seated ? Phaser.Math.Distance.Between(this.player.x, this.player.y, this.seated.sprite.x, this.seated.sprite.y) : Infinity;
  }

  /** Leave via the door: fade, then hand the world back. Safe to call repeatedly. */
  leave(instant = false): void {
    if (!this.active || this.leaving) return;
    this.leaving = true;
    const done = (): void => {
      const id = this.d.buildingId;
      this.dispose();
      this.hooks.onClosed(id);
    };
    if (instant) return done();
    const cam = this.host.cameras.main;
    cam.fadeOut(180, 20, 16, 12);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, done);
  }

  private dispose(): void {
    this.bubbleTimer?.remove();
    for (const o of this.owned) this.host.tweens.killTweensOf(o);
    for (const o of this.owned) o.destroy();
    this.owned = [];
    this.seated = null;
    this.active = false;
    this.host.cameras.main.setBackgroundColor(this.bg);
  }

  // ── drawing ──────────────────────────────────────────────────────────────

  private drawRoom(): void {
    const { plan: p, ox, oy } = this;
    const pal = art.palettes[this.d.paletteIndex % art.palettes.length]!;
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
        rect(T / 2 - 6, 2, 12, 10, 0xe9d4a2); rect(T / 2 - 6, 2, 12, 2, 0xc4a06c);
        const shade = this.add.graphics().setDepth(g.depth + 0.01);
        const c = this.add.circle(x + T / 2, y + 8, 24, 0xffd877, 0.16).setBlendMode(Phaser.BlendModes.ADD).setDepth(901_000);
        this.lantern = { glow: c, shade, x: x + T / 2 - 4, y: y + 6 };
        this.paintLantern();
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

  /** Lit lanterns show the warm core and glow; unlit ones go dark. Driven by the saved flag. */
  paintLantern(): void {
    const l = this.lantern; if (!l) return;
    const lit = this.hooks.lanternLit(this.d.buildingId);
    l.glow.setVisible(lit);
    l.shade.clear().fillStyle(lit ? 0xffe9a8 : 0x7a6a50, 1).fillRect(l.x, l.y, 8, 4);
  }

  private hasFrame(): boolean {
    return this.textures.exists(HERO_TEX) && this.textures.get(HERO_TEX).has('7');
  }

  private makeSprite(x: number, y: number, tint?: number): { sprite: Phaser.GameObjects.Sprite; shadow?: Phaser.GameObjects.Image } {
    const shadow = this.textures.exists(SHADOW_TEX) ? this.add.image(x, y - 2, SHADOW_TEX).setScale(1.4, 0.9).setDepth(y - 0.5) : undefined;
    const sprite = this.add.sprite(x, y, HERO_TEX, this.hasFrame() ? '7' : undefined).setOrigin(0.5, 1).setScale(FEEL.worldScale.artScale).setDepth(y);
    if (tint !== undefined) sprite.setTint(tint);
    if (this.anims.exists('hero-idle-down')) sprite.play('hero-idle-down');
    return { sprite, shadow };
  }

  private tileXY(col: number, row: number): Pt {
    return { x: this.ox + (col + 0.5) * T, y: this.oy + (row + 1) * T - 2 };
  }

  private spawnPlayer(): void {
    const sp = this.plan.spawn;
    const at = this.tileXY(sp.col, sp.row);
    const { sprite, shadow } = this.makeSprite(at.x, this.oy + (sp.row + 0.5) * T + 8);
    this.player = sprite;
    this.playerShadow = shadow;
    this.player.setDepth(this.player.y);
  }

  /** Make the room's seated person match who is really inside: they walk in from the door or out through it. */
  private syncResident(instant = false): void {
    const here = this.hooks.residents(this.d.buildingId)[0];
    const cur = this.seated;
    if (cur && cur.mode !== 'leaving' && cur.info.id !== here?.id) this.sendOut(cur);
    if (here && !this.seated) this.seat(here, instant);
    this.refreshTitle();
  }

  private seat(info: RoomResident, instant: boolean): void {
    const spot = this.tileXY(this.plan.npc.col, this.plan.npc.row);
    const mat = exitMat(this.plan);
    const from = instant ? spot : { x: this.ox + mat.x, y: this.oy + mat.y - 6 };
    const { sprite, shadow } = this.makeSprite(from.x, from.y, info.tint);
    const label = this.add.text(from.x, from.y - 36, info.name, { fontFamily: 'Georgia, serif', fontSize: '10px', color: '#f4e6c8', stroke: '#1b1612', strokeThickness: 3 })
      .setOrigin(0.5, 1).setDepth(998_000);
    const r: Seated = { info, sprite, shadow, label, mode: instant ? 'idle' : 'arriving' };
    this.seated = r;
    if (instant) return;
    this.say(`${info.name} comes in.`, this.playerPos());
    const { key } = heroWalkAnim(0, -1);
    if (this.anims.exists(key)) sprite.play(key, true);
    this.host.tweens.add({
      targets: sprite, x: spot.x, y: spot.y, duration: WALK_MS, ease: 'Sine.inOut',
      onComplete: () => { if (this.seated === r) { r.mode = 'idle'; if (this.anims.exists('hero-idle-down')) sprite.play('hero-idle-down', true); } },
    });
  }

  private sendOut(r: Seated): void {
    r.mode = 'leaving';
    this.say(`${r.info.name} heads out.`, this.playerPos());
    const mat = exitMat(this.plan);
    const { key } = heroWalkAnim(0, 1);
    if (this.anims.exists(key)) r.sprite.play(key, true);
    this.host.tweens.killTweensOf(r.sprite);
    this.host.tweens.add({
      targets: r.sprite, x: this.ox + mat.x, y: this.oy + mat.y - 6, duration: WALK_MS, ease: 'Sine.inOut',
      onComplete: () => {
        for (const o of [r.sprite, r.shadow, r.label]) o?.destroy();
        if (this.seated === r) this.seated = null;
      },
    });
  }

  private refreshTitle(): void {
    const d = this.d, r = this.seated;
    const who = r && r.mode !== 'leaving' ? `${r.info.name} ${OCCUPANT_ROLE[d.kind]}.` : 'Nobody is home right now.';
    const text = `${d.townName} · ${INTERIOR_TITLE[d.kind]} — ${who}`;
    if (this.title.text !== text) this.title.setText(text);
  }

  private addHud(): void {
    const style = { fontFamily: 'Georgia, serif', fontSize: '12px', color: '#f2e2b8', stroke: '#1b1612', strokeThickness: 3 };
    this.title = this.add.text(10, 8, '', { ...style, fontSize: '12px', color: '#f2b84b' }).setScrollFactor(0).setDepth(1_000_000);
    this.clockText = this.add.text(this.scale.width - 10, 8, '', { ...style, fontSize: '11px', color: '#c8b898' }).setOrigin(1, 0).setScrollFactor(0).setDepth(1_000_000);
    this.add.text(10, this.scale.height - 20, 'Walk: WASD · E: talk / leave at the door · I: satchel · L: letters · M: map · Esc: leave', { ...style, fontSize: '10px', color: '#c8b898' })
      .setScrollFactor(0).setDepth(1_000_000);
    // Daylight/dusk through the windows follows the live day clock.
    this.light = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0xffffff, 0).setScrollFactor(0).setDepth(899_000);
    this.bubble = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#f2e9e4', backgroundColor: '#1b1612', padding: { x: 5, y: 3 }, wordWrap: { width: 210 },
    }).setOrigin(0.5, 1).setDepth(999_000).setVisible(false);
  }

  // ── play ─────────────────────────────────────────────────────────────────

  private nearNpc(): boolean {
    const r = this.seated;
    return !!r && r.mode === 'idle' && this.distanceToResident() < talkNear;
  }

  private local(): Pt {
    return { x: this.player.x - this.ox, y: this.player.y - this.oy };
  }

  /**
   * What is in reach in here, for the host's focus resolver (it draws the one prompt and opens the ring):
   * the exit mat (a door with id 'exit') and the seated resident. Empty while arriving or leaving.
   */
  focusCandidates(): { kind: 'door' | 'person'; id: string; x: number; y: number; reach: number; anchor: Pt }[] {
    if (!this.active || this.leaving || this.time.now - this.born < 250) return [];
    const out: { kind: 'door' | 'person'; id: string; x: number; y: number; reach: number; anchor: Pt }[] = [];
    const me = this.playerPos();
    if (nearExit(this.plan, this.local())) {
      const mat = exitMat(this.plan);
      const at = { x: this.ox + mat.x, y: this.oy + mat.y };
      out.push({ kind: 'door', id: 'exit', x: me.x, y: me.y, reach: 1, anchor: { x: at.x, y: at.y - 44 } });
    }
    const r = this.seated;
    if (r && this.nearNpc()) out.push({ kind: 'person', id: r.info.id, x: r.sprite.x, y: r.sprite.y, reach: talkNear, anchor: { x: r.sprite.x, y: r.sprite.y - 42 } });
    return out;
  }

  /** E pressed. Returns the resident to talk to (host opens the action ring), or null when handled here. */
  interact(): { id: string; x: number; y: number } | null {
    if (this.leaving || this.time.now - this.born < 250) return null;
    if (nearExit(this.plan, this.local())) { this.leave(); return null; }
    if (this.nearNpc()) return this.residentHead();
    if (!this.seated) this.say(EMPTY_ROOM_LINE, this.playerPos());
    return null;
  }

  /** The room-flavoured murmur (the 'Chat' chip). */
  chat(): void {
    if (this.seated) this.say(interiorLine(this.d.kind, this.d.despair01, this.visits++), this.seated.sprite);
  }

  say(text: string, at: Pt | undefined = this.seated?.sprite): void {
    if (!at) return;
    this.bubble.setText(text).setPosition(Phaser.Math.Clamp(at.x, ROOM_ORIGIN.x + 120, ROOM_ORIGIN.x + this.scale.width - 120), at.y - 44).setVisible(true).setAlpha(1);
    this.bubbleTimer?.remove();
    this.bubbleTimer = this.time.delayedCall(3600, () => this.bubble.setVisible(false));
  }

  /** Per-frame: `dx`,`dy` is the walk intent; `frozen` stops the player (overlay or ring open). */
  update(time: number, delta: number, dx: number, dy: number, frozen: boolean): void {
    if (!this.active) return;
    for (const f of this.flames) {
      const k = 0.88 + Math.sin(time / 90 + f.obj.x) * 0.1 + Math.sin(time / 37) * 0.05;
      if (f.base === 1) f.obj.setScale(k, 0.9 + (k - 0.85) * 2);
      else f.obj.setAlpha(f.base * (0.8 + (k - 0.88) * 2.5));
    }
    const phase = this.hooks.phase();
    const sky = skyAt(phase);
    this.light.setFillStyle(sky.color, sky.alpha * 0.55);
    const label = dayPartLabel(phase);
    if (this.clockText.text !== label) this.clockText.setText(label);
    this.syncResident();
    const r = this.seated;
    if (r) {
      r.sprite.setDepth(r.sprite.y);
      r.shadow?.setPosition(r.sprite.x, r.sprite.y - 2).setDepth(r.sprite.y - 0.5);
      r.label.setPosition(r.sprite.x, r.sprite.y - 36);
      if (r.mode === 'idle') r.sprite.setScale(FEEL.worldScale.artScale, FEEL.worldScale.artScale + Math.sin(time / 600) * 0.05);
    }
    if (this.leaving) return;
    if (frozen) { dx = 0; dy = 0; }
    if (dx !== 0 || dy !== 0) {
      const step = walkDelta(dx, dy, delta, FEEL.overworld.walkTilesPerSec, T);
      const n = Math.max(1, Math.ceil(Math.hypot(step.dx, step.dy) / 6));
      for (let i = 0; i < n; i++) {
        const lx = this.player.x - this.ox, ly = this.player.y - this.oy;
        if (interiorWalkable(this.plan, lx + step.dx / n, ly)) this.player.x += step.dx / n;
        if (interiorWalkable(this.plan, this.player.x - this.ox, ly + step.dy / n)) this.player.y += step.dy / n;
      }
      this.player.setDepth(this.player.y);
      this.playerShadow?.setPosition(this.player.x, this.player.y - 2).setDepth(this.player.y - 0.5);
      const { key, flipX } = heroWalkAnim(dx, dy);
      this.player.setFlipX(flipX);
      if (this.anims.exists(key) && this.player.anims.currentAnim?.key !== key) this.player.play(key, true);
    } else if (this.player.anims?.currentAnim?.key?.startsWith('hero-walk') && this.anims.exists('hero-idle-down')) {
      this.player.play('hero-idle-down', true);
    }
  }
}

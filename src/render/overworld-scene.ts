/** Continuous chunked 2.5D overworld — stamp TileSource + foot-Y depth. */

import Phaser from 'phaser';
import {
  createEventBus,
  createPlaySession,
  createStampRasterSource,
  layoutWorld,
  type PlaySession,
  type TileSource,
  forceSpark,
} from '../sim';
import { CHUNK_SIZE, TILE_PX } from '../sim/map/constants';
import { chunksAround } from '../sim/map/chunks-around';
import type { WorldLayout } from '../sim/map/world-layout';
import { createTerrainAccess } from '../sim/map/terrain-access';
import { createNavigator, type Navigator } from '../sim/map/nav';
import { FEEL } from './feel';
import { attachSurface } from './surface-layer';
import { createChunkLayer, type ChunkLayer } from './chunk-layer';
import { applySpriteSort, tileFootWorld } from './depth-sort';
import { walkDelta } from './walk-delta';
import { HERO_TEX, SHADOW_TEX } from './sheet-frames';
import { heroWalkAnim } from './painters/overworld-paint';
import { createPeopleLayer, pretty, tintOf, type PeopleLayer, type Person } from './people-layer';
import { INTERIOR_SCENE_KEY, type InteriorEnterData, type InteriorScene } from './interior-scene';
import { allBuildings, nearestDoor, type Building, type InteriorKind } from '../sim/map/interiors';
import { deedLabel } from '../sim/play-session/play-session-act';
import { createActionRing, type ActionRing, type Chip } from './action-ring';
import { createWorldLife, type WorldLife } from './world-life';
import { attachSparkFx } from './spark-fx';
import { attachOverworldGoods, type OverworldGoods } from './goods/overworld-goods';

const CHUNK_MARGIN = 1;
const VERB: Record<string, string> = {
  inspire: 'Inspire', carry_burden: 'Carry burden', challenge: 'Challenge', shame: 'Shame',
  lie: 'Lie', show_up: 'Show up', listen: 'Listen',
};

export class OverworldScene extends Phaser.Scene {
  private session!: PlaySession;
  private source!: TileSource;
  private terrain!: ReturnType<typeof createTerrainAccess>;
  private nav!: Navigator;
  private layout!: WorldLayout;
  private layer!: ChunkLayer;
  private player!: Phaser.GameObjects.Sprite;
  private playerShadow?: Phaser.GameObjects.Image;
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
  private uiTap = false;
  private people!: PeopleLayer;
  private ring!: ActionRing;
  private life!: WorldLife;
  private bus = createEventBus();
  private ringFor: string | null = null;
  private resting = false;
  private moving = false;
  private goods!: OverworldGoods;
  private buildings: Building[] = [];
  private doorPrompt!: Phaser.GameObjects.Text;
  private inside: Building | null = null;
  private entering = false;

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
    this.terrain = createTerrainAccess(this.layout, seed);
    this.nav = createNavigator(this.terrain);

    this.layer = createChunkLayer(this, this.source, this.layout.settlements.map((t) => ({ ...t, name: world.settlements?.find((s) => s.id === t.id)?.name })));
    this.spawnPlayer();
    this.ring = createActionRing(this);
    this.people = createPeopleLayer(
      this,
      this.session,
      this.layout.settlements,
      (p) => this.openRing(p),
      (id) => this.chipsFor(id).length > 0,
      this.nav,
    );
    this.buildings = allBuildings(this.layout.settlements);
    this.life = createWorldLife(this, this.layout.settlements);
    this.goods = attachOverworldGoods(this, this.session, world, this.layout, this.people, this.life, () => ({ x: this.player.x, y: this.player.y }), this.nav);
    const surface = attachSurface(this, this.session, this.layout.settlements, (id) =>
      this.ringFor === id || this.people.byId.has(id) ? this.people.headOf(id) : undefined,
    );
    attachSparkFx(this, this.bus, { getPlayerPos: () => ({ x: this.player.x, y: this.player.y - 20 }) });
    // QA hook (presentation-side overrides + synthetic feed; real sim path for ticks/spark).
    (window as unknown as { __hearth?: unknown }).__hearth = {
      session: this.session,
      scene: this,
      surface,
      towns: this.layout.settlements.map((t) => t.id),
      burnOut: () => {
        forceSpark(this.session, 0);
        this.session.tick();
      },
      // Interiors: enter(spec?) teleports to a door and walks in (instant, for screenshots/e2e).
      interior: {
        residents: (buildingId: string) => this.people.insideOf(buildingId),
        /** Jump the day clock and re-settle who is indoors (instant; for screenshots/e2e). */
        setHour: (p01: number) => { this.life.setPhase(p01); this.people.settle(); },
        /** Per villager: { id, inside: buildingId|null, visible } - the exclusivity check. */
        whereabouts: () => this.people.people.map((p) => ({ id: p.id, inside: p.inside?.id ?? null, visible: p.sprite.visible })),
        buildings: () => this.buildings.map((b) => ({ id: b.id, townId: b.townId, kind: b.kind, door: { ...b.door } })),
        enter: (spec?: string | { buildingId?: string; townId?: string; kind?: InteriorKind }) => this.debugEnterInterior(spec),
        exit: () => this.interiorScene()?.leave(true),
        state: () => this.interiorScene()?.state() ?? null,
      },
    };
    this.createSparkHud();
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as typeof this.wasd;

    this.hint = this.add
      .text(8, 28, 'Walk: WASD · E: talk/gather/enter doors/rest · I: satchel · F: use · L: letters · M: map', { fontFamily: 'Georgia, serif', fontSize: '11px', color: '#c8b898', stroke: '#1b1612', strokeThickness: 3 })
      .setScrollFactor(0)
      .setDepth(1_000_000);
    this.time.delayedCall(7000, () => this.tweens.add({ targets: this.hint, alpha: 0, duration: 800 }));

    const interact = (): void => this.interact();
    this.input.keyboard?.on('keydown-E', interact);
    this.input.keyboard?.on('keydown-ENTER', interact);
    this.doorPrompt = this.add
      .text(0, 0, 'E · Enter', { fontFamily: 'Georgia, serif', fontSize: '13px', color: '#f2b84b', stroke: '#1b1612', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(998_500)
      .setVisible(false);
    this.events.on(Phaser.Scenes.Events.WAKE, () => this.onWake());
    this.input.keyboard?.on('keydown-ESC', () => { this.closeRing(); this.goods.closeOverlays(); });
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT'].forEach((k, i) =>
      this.input.keyboard?.on(`keydown-${k}`, () => (this.ring.isOpen() ? this.ring.pickIndex(i) : this.goods.selectSlot(i))),
    );
    this.input.keyboard?.addCapture('TAB');
    this.input.keyboard?.on('keydown-I', () => this.goods.toggleInventory());
    this.input.keyboard?.on('keydown-TAB', () => this.goods.toggleInventory());
    this.input.keyboard?.on('keydown-M', () => this.goods.toggleMap());
    this.input.keyboard?.on('keydown-F', () => { const line = this.goods.useSelected(); if (line) this.say(line); this.syncSparkFromSession(true); });
    this.input.keyboard?.on('keydown-L', () => this.goods.letters());
    // Any press that lands on the world (not a person/chip) closes the ring and does not start a walk.
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: unknown[]) => {
      if (over.length > 0 || this.resting) this.uiTap = true;
      else if (this.ring.isOpen()) {
        this.closeRing();
        this.uiTap = true;
      }
    });
    this.input.on('pointerup', () => (this.uiTap = false));
    this.syncChunks(true);
    this.syncSparkFromSession(false);
    const hud = this.registry.get('hud') as { setStatus?: (s: string) => void } | undefined;
    hud?.setStatus?.('continuous overworld');
  }

  update(_time: number, delta: number): void {
    if (this.goods.overlayOpen()) { this.tickLife(delta); return; }
    let dx = 0;
    let dy = 0;
    if (this.cursors.left?.isDown || this.wasd.A.isDown) dx -= 1;
    if (this.cursors.right?.isDown || this.wasd.D.isDown) dx += 1;
    if (this.cursors.up?.isDown || this.wasd.W.isDown) dy -= 1;
    if (this.cursors.down?.isDown || this.wasd.S.isDown) dy += 1;
    const ptr = this.input.activePointer;
    if (this.resting) return;
    if (dx === 0 && dy === 0 && ptr.isDown && !this.uiTap) {
      const ox = ptr.worldX - this.player.x;
      const oy = ptr.worldY - this.player.y;
      const dead = TILE_PX / 2;
      if (Math.abs(ox) > dead) dx = Math.sign(ox);
      if (Math.abs(oy) > dead) dy = Math.sign(oy);
    }
    if (dx !== 0 || dy !== 0) {
      const step = walkDelta(
        dx,
        dy,
        delta,
        FEEL.overworld.walkTilesPerSec,
        TILE_PX,
      );
      // Substeps prevent tunnelling during a slow frame; slide along banks.
      const n = Math.max(1, Math.ceil(Math.hypot(step.dx, step.dy) / 6));
      const safe = (x: number, y: number) => [-5, 5].every((off) => this.terrain.passable(Math.floor((x + off) / TILE_PX), Math.floor((y - 2) / TILE_PX)));
      for (let i = 0; i < n; i++) {
        if (safe(this.player.x + step.dx / n, this.player.y)) this.player.x += step.dx / n;
        if (safe(this.player.x, this.player.y + step.dy / n)) this.player.y += step.dy / n;
      }
      applySpriteSort(this.player);
      if (this.playerShadow) {
        this.playerShadow.setPosition(this.player.x, this.player.y - 2);
        this.playerShadow.setDepth(this.player.y - 0.5);
      }
      this.playHeroWalk(dx, dy);
    } else if (this.player.anims?.currentAnim?.key?.startsWith('hero-walk')) {
      this.player.play('hero-idle-down', true);
    }
    this.moving = dx !== 0 || dy !== 0;
    // Physical arrival and social/economy IDs must agree for deeds/deliveries.
    const arrived = this.layout.settlements.find((t) => {
      const p = tileFootWorld(t.q, t.r);
      return Math.hypot(p.x - this.player.x, p.y - this.player.y) < TILE_PX * 12;
    });
    const state = this.session.getState();
    if (arrived && state) state.player.townId = arrived.id;
    this.syncChunks(false);
    this.tickLife(delta);
  }

  private tickLife(delta: number): void {
    const t = this.time.now;
    this.people.update(t, delta, this.player);
    this.goods.update(t, delta, this.player);
    this.life.update(t, delta, this.player, this.moving);
    const hearth = this.life.nearestHearth(this.player);
    this.life.setPrompt(!!hearth && !this.ring.isOpen() && !this.resting, hearth?.pos);
    const near = this.ring.isOpen() ? null : this.people.nearest(this.player);
    this.people.setPrompt(near);
    const door = this.doorTarget(near);
    this.doorPrompt.setVisible(!!door);
    if (door) this.doorPrompt.setPosition(door.door.x, door.door.y - 78 - Math.abs(Math.sin(this.time.now / 300)) * 3);
    if (this.ringFor && this.moving) {
      const p = this.people.byId.get(this.ringFor);
      if (!p || Phaser.Math.Distance.Between(this.player.x, this.player.y, p.sprite.x, p.sprite.y) > 90) this.closeRing();
    }
  }

  private chipsFor(id: string): Chip[] {
    return this.session
      .listActions()
      .filter((a) => a.id.endsWith('@' + id))
      .slice(0, 14)
      .map((a) => {
        const m = a.id.slice(0, a.id.indexOf('@'));
        return { id: a.id, label: deedLabel(m) ?? VERB[m] ?? pretty(m), savage: a.family === 'savage' };
      });
  }

  private openRing(p: Person): void {
    if (this.resting) return;
    const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.sprite.x, p.sprite.y);
    if (d > 110) {
      this.say('Too far. Walk closer.');
      return;
    }
    const chips = this.chipsFor(p.id);
    if (!chips.length) return;
    this.ringFor = p.id;
    this.people.freeze(p.id);
    this.people.setPrompt(null);
    const h = this.people.headOf(p.id);
    this.ring.open({ x: h.x, y: h.y - 6 }, chips, (c) => this.commit(p, c));
  }

  private closeRing(): void {
    this.ring.close();
    this.ringFor = null;
    this.people.freeze(null);
  }

  private say(text: string): void {
    this.hint.setText(text).setAlpha(1);
    this.time.delayedCall(2200, () => this.tweens.add({ targets: this.hint, alpha: 0, duration: 600 }));
  }

  private interact(): void {
    if (this.resting || this.goods.overlayOpen()) return;
    if (this.ring.isOpen()) return;
    if (this.goods.readBoard(this.player)) return;
    if (this.goods.meetCaravan(this.player)) return;
    const p = this.people.nearest(this.player);
    const door = this.doorTarget(p);
    if (door) return this.enterBuilding(door);
    if (p) return this.openRing(p);
    const got = this.goods.gatherNear(this.player);
    if (got) return this.say(got);
    if (this.life.nearestHearth(this.player)) this.rest();
  }

  /** Door in reach, unless a villager you could talk to is standing closer. */
  private doorTarget(talk: Person | null): Building | null {
    if (this.resting || this.entering || this.goods.overlayOpen() || this.ring.isOpen()) return null;
    const hit = nearestDoor(this.buildings, this.player);
    if (!hit) return null;
    if (talk && Phaser.Math.Distance.Between(this.player.x, this.player.y, talk.sprite.x, talk.sprite.y) < hit.dist) return null;
    return hit.building;
  }

  private interiorScene(): InteriorScene | undefined {
    return this.scene.isActive(INTERIOR_SCENE_KEY) ? (this.scene.get(INTERIOR_SCENE_KEY) as InteriorScene) : undefined;
  }

  /** Walk through a door: fade, put the overworld to sleep, launch the room. */
  private enterBuilding(b: Building, instant = false): void {
    if (this.inside || this.entering) return;
    this.entering = true;
    this.closeRing();
    this.doorPrompt.setVisible(false);
    const world = this.session.getWorld();
    const town = world?.settlements?.find((s) => s.id === b.townId);
    // Only people the schedule has actually put in this room are there; if the resident is out, it is empty.
    const resident = this.people.insideOf(b.id)[0];
    const payload: InteriorEnterData = {
      returnTo: this.scene.key,
      buildingId: b.id,
      townId: b.townId,
      townName: town?.name ?? pretty(b.townId),
      kind: b.kind,
      paletteIndex: b.paletteIndex,
      occupant: resident ? { id: resident, name: pretty(resident).split(' ')[0]!, tint: tintOf(resident) } : undefined,
      despair01: this.session.townDespair()[b.townId] ?? 0,
    };
    const go = (): void => {
      this.inside = b;
      this.entering = false;
      this.moving = false;
      this.scene.launch(INTERIOR_SCENE_KEY, payload);
      this.scene.sleep();
    };
    if (instant) return go();
    this.cameras.main.fadeOut(160, 20, 16, 12);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, go);
  }

  /** Back from a room: stand just outside the door. */
  private onWake(): void {
    const b = this.inside;
    this.inside = null;
    this.entering = false;
    this.input.keyboard?.resetKeys();
    const cam = this.cameras.main;
    cam.resetFX();
    if (b) {
      const x = b.door.x, y = b.door.y + 12;
      if (this.terrain.passable(Math.floor(x / TILE_PX), Math.floor((y - 2) / TILE_PX))) this.player.setPosition(x, y);
      applySpriteSort(this.player);
      this.playerShadow?.setPosition(this.player.x, this.player.y - 2).setDepth(this.player.y - 0.5);
      if (this.anims.exists('hero-idle-down')) this.player.play('hero-idle-down', true);
      cam.centerOn(this.player.x, this.player.y);
      this.syncChunks(false);
    }
    cam.fadeIn(200, 20, 16, 12);
  }

  /** QA hook: teleport to a door and step inside without fades. */
  private debugEnterInterior(spec?: string | { buildingId?: string; townId?: string; kind?: InteriorKind }): { id: string; kind: InteriorKind } | null {
    if (this.inside || this.entering) return null;
    const q = typeof spec === 'string' ? (spec in { house: 1, shop: 1, inn: 1 } ? { kind: spec as InteriorKind } : { buildingId: spec }) : spec ?? {};
    const home = q.townId ?? this.session.snapshot().townId;
    const match = (b: Building): boolean => (!q.buildingId || b.id === q.buildingId) && (!q.kind || b.kind === q.kind);
    const b = (q.buildingId || q.townId ? this.buildings.filter(match).filter((x) => !q.townId || x.townId === q.townId) : [
      ...this.buildings.filter((x) => x.townId === home && match(x)),
      ...this.buildings.filter(match),
    ])[0];
    if (!b) return null;
    this.player.setPosition(b.door.x, b.door.y + 12);
    applySpriteSort(this.player);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.syncChunks(false);
    this.enterBuilding(b, true);
    return { id: b.id, kind: b.kind };
  }

  private commit(p: Person, c: Chip): void {
    const pre = this.goods.beforeDeed(c.id.slice(0, c.id.indexOf('@')), p.id);
    if (!pre.ok) {
      this.closeRing();
      this.say(pre.line ?? 'Not now.');
      return;
    }
    if (pre.line) this.say(pre.line);
    const before = this.session.snapshot().spark;
    let juiced = 0;
    const off = this.session.onJuice(() => juiced++);
    this.session.act(c.id);
    off();
    const after = this.session.snapshot().spark;
    const r = this.session.lastResolve();
    this.closeRing();
    const spent = Math.max(0, (before - after) / 100);
    const h = this.people.headOf(p.id);
    this.bus.emit('vfx.spark_spent', { x: h.x, y: h.y + 10, amount01: spent > 0 ? spent : 0.12 });
    this.syncSparkFromSession(true);
    this.tweens.add({ targets: p.sprite, y: p.sprite.y - 5, duration: 110, yoyo: true });
    if (juiced === 0) {
      const who = pretty(p.id).split(' ')[0];
      const line =
        r?.kind === 'refused'
          ? `${who} turns away.`
          : (r?.flameDelta ?? 0) > 0
            ? `${who} stands a little straighter.`
            : (r?.flameDelta ?? 0) < 0
              ? `${who} goes quiet.`
              : `${who} nods.`;
      const t = this.add
        .text(h.x, h.y - 4, line, { fontFamily: 'monospace', fontSize: '10px', color: '#f2e9e4', backgroundColor: '#1b1612', padding: { x: 4, y: 2 } })
        .setOrigin(0.5, 1)
        .setDepth(999_100);
      this.tweens.add({ targets: t, y: t.y - 10, alpha: 0, delay: 1800, duration: 700, onComplete: () => t.destroy() });
    }
  }

  private rest(): void {
    this.resting = true;
    this.closeRing();
    const cam = this.cameras.main;
    cam.fadeOut(700, 8, 8, 20);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.session.tick();
      this.life.dawn();
      this.people.settle();
      this.goods.onDawn();
      (this.registry.get('autosave') as (() => void) | undefined)?.();
      this.syncSparkFromSession(false);
      this.time.delayedCall(350, () => {
        cam.fadeIn(900, 8, 8, 20);
        cam.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => {
          this.resting = false;
          this.say(`Dawn. Day ${this.session.snapshot().day}.`);
        });
      });
    });
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
    const start = this.layout.settlements.find((s) => s.id === this.session.snapshot().townId) ?? this.layout.settlements[0];
    const foot = start
      ? tileFootWorld(start.q, start.r + 1)
      : { x: TILE_PX / 2, y: TILE_PX };
    // Exact single ansimuz hero frame (16×16 sheet), scaled ×2; soft shadow sibling.
    if (this.textures.exists(SHADOW_TEX)) {
      this.playerShadow = this.add.image(foot.x, foot.y - 2, SHADOW_TEX);
      this.playerShadow.setScale(FEEL.worldScale.artScale * 0.7, FEEL.worldScale.artScale * 0.5);
      this.playerShadow.setDepth(foot.y - 0.5);
    }
    const frame = this.textures.exists(HERO_TEX) && this.textures.get(HERO_TEX).has('7') ? '7' : undefined;
    this.player = this.add.sprite(foot.x, foot.y, HERO_TEX, frame);
    this.player.setScale(FEEL.worldScale.artScale);
    applySpriteSort(this.player);
    if (this.anims.exists('hero-idle-down')) this.player.play('hero-idle-down');
    const cam = this.cameras.main;
    cam.setRoundPixels(true);
    cam.startFollow(
      this.player,
      true,
      FEEL.overworld.camLerp,
      FEEL.overworld.camLerp,
    );
    cam.setDeadzone(FEEL.overworld.camDeadzoneX, FEEL.overworld.camDeadzoneY);
    cam.setZoom(FEEL.worldScale.camZoom);
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

  private playHeroWalk(dx: number, dy: number): void {
    const { key, flipX } = heroWalkAnim(dx, dy);
    this.player.setFlipX(flipX);
    if (this.anims.exists(key) && this.player.anims.currentAnim?.key !== key) {
      this.player.play(key, true);
    }
  }
}

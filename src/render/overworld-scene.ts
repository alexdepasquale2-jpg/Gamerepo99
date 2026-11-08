/** Continuous chunked 2.5D overworld — stamp TileSource + foot-Y depth. */

import { playSfx, toggleSfxMute } from './sfx';
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
import { createPeopleLayer, firstName, pretty, tintOf, type PeopleLayer, type Person } from './people-layer';
import { InteriorRoom, type InteriorEnterData } from './interior-room';
import { allBuildings, nearestDoor, type Building, type InteriorKind } from '../sim/map/interiors';
import { deedLabel } from '../sim/play-session/play-session-act';
import { createActionRing, type ActionRing, type Chip } from './action-ring';
import { createWorldLife, type WorldLife } from './world-life';
import { attachSparkFx } from './spark-fx';
import { attachSessionFx } from './spark-fx/session-fx';
import { isSuccessionOpen } from '../sim/succession';
import { lanternLit, lightLantern } from '../sim/goods/item-use';
import { attachOverworldGoods, type OverworldGoods } from './goods/overworld-goods';
import { getWalkMul, setWalkMul } from '../dev/dev-flags';
import { attachInhabitantBody, bodyLook, type InhabitantBody } from './inhabitant-body';
import { blockedDoorLine, canEnterBuilding, walkSpeedMul } from '../sim/embodiment';
import { collectDawnLines } from '../sim/dawn-lines';
import { kinStrainOf } from '../sim/social/kin-strain';
import { attachRoads, type RoadsHandle } from './road-signs';
import { featuresIn } from '../sim/map/ladder/features';
import { labourLeft, workLandHere, type LandTown } from '../sim/land-acts';

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
  private body!: InhabitantBody;
  private buildings: Building[] = [];
  private doorPrompt!: Phaser.GameObjects.Text;
  private inside: Building | null = null;
  private entering = false;
  private room!: InteriorRoom;
  /** Last walking direction (tiles), so X works the ground in front of you. */
  private facing = { dx: 0, dy: 1 };
  private landTowns: LandTown[] = [];
  /** Drawn ground + prop types per tile of chunks the player tried to work (built on demand, dropped on edit). */
  private drawnCache = new Map<string, Map<string, { ground?: string; props: string[] }>>();
  private roads!: RoadsHandle;

  constructor() {
    super('overworld');
  }

  create(): void {
    this.bootSession();
    const world = this.session.getWorld();
    const seed = this.session.getSeed();
    if (!world) throw new Error('overworld requires booted world');
    this.layout = layoutWorld(world, seed);
    this.source = createStampRasterSource(world, seed, () => this.session.getState()?.tileEdits);
    this.terrain = createTerrainAccess(this.layout, seed, undefined, () => this.session.getState()?.tileEdits);
    this.landTowns = this.layout.settlements.map((t) => ({ id: t.id, q: t.q, r: t.r, name: world.settlements?.find((s) => s.id === t.id)?.name }));
    this.nav = createNavigator(this.terrain);

    this.layer = createChunkLayer(this, this.source, this.layout.settlements.map((t) => ({ ...t, name: world.settlements?.find((s) => s.id === t.id)?.name })));
    this.spawnPlayer();
    this.body = attachInhabitantBody({
      scene: this,
      session: this.session,
      player: () => this.player,
      townSpot: (townId, slot) => {
        const t = this.layout.settlements.find((x) => x.id === townId);
        if (!t) return null;
        const f = tileFootWorld(t.q + 2 + slot, t.r + 2);
        return { x: f.x, y: f.y };
      },
      moveTo: (townId) => this.arriveAt(townId),
      say: (text) => this.say(text),
    });
    if (this.session.getState()?.player.bodies?.length) {
      this.time.delayedCall(8000, () => this.say('B: leave a sibling in this town, call them back, or become one elsewhere.'));
    }
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
    this.room = new InteriorRoom(this, {
      residents: (buildingId) => this.people.insideOf(buildingId).map((id) => ({ id, name: this.nameOf(id), tint: tintOf(id) })),
      lanternLit: (id) => !!this.session.getState() && lanternLit(this.session.getState()!, id),
      phase: () => this.life.phase(),
      onClosed: (buildingId) => this.onRoomClosed(buildingId),
    });
    this.goods = attachOverworldGoods(this, this.session, world, this.layout, this.people, this.life, () => ({ x: this.player.x, y: this.player.y }), this.nav, (l) => this.say(l), () => this.room.active);
    this.roads = attachRoads({
      scene: this,
      session: this.session,
      settlements: this.layout.settlements,
      nameOf: (id) => world.settlements?.find((s) => s.id === id)?.name ?? id,
      arriveAt: (id) => this.arriveAt(id),
      afterJourney: () => {
        this.life.dawn();
        this.people.sync();
        this.people.settle();
        this.goods.onDawn();
        (this.registry.get('autosave') as (() => void) | undefined)?.();
        this.syncSparkFromSession(false);
      },
      say: (t) => this.say(t),
      setBusy: (b) => (this.resting = b),
    });
    const headOf = (id: string): { x: number; y: number } | undefined =>
      this.room.residentHead(id) ?? (this.ringFor === id || this.people.byId.has(id) ? this.people.headOf(id) : undefined);
    const surface = attachSurface(this, this.session, this.layout.settlements, headOf);
    const playerCoal = (): { x: number; y: number } => { const a = this.room.active ? this.room.playerPos() : this.player; return { x: a.x, y: a.y - 20 }; };
    attachSparkFx(this, this.bus, { getPlayerPos: playerCoal });
    // Refusals flicker at the person's head; burnout snuffs the player's coal before succession opens.
    const sessionFx = attachSessionFx(this, this.session, this.bus, {
      // Indoors only the room's residents are on screen; overworld heads would be off camera.
      headOf: (id) => (this.room.active ? this.room.residentHead(id) ?? undefined : headOf(id)),
      playerPos: playerCoal,
      // Not while resting or while any camera fade covers the screen (running, or held black after a fade-out).
      canPlayBurnout: () => !this.resting && !this.cameras.main.fadeEffect.isRunning && !(this.cameras.main.fadeEffect.isComplete && this.cameras.main.fadeEffect.direction),
      say: (line) => this.say(line),
    });
    // QA hook (presentation-side overrides + synthetic feed; real sim path for ticks/spark).
    (window as unknown as { __hearth?: unknown }).__hearth = {
      session: this.session,
      scene: this,
      surface,
      fx: sessionFx.log,
      towns: this.layout.settlements.map((t) => t.id),
      burnOut: () => {
        forceSpark(this.session, 0);
        this.session.tick();
      },
      // Interiors: enter(spec?) teleports to a door and walks in (instant, for screenshots/e2e).
      // Dev menu hooks (src/ui/dev-menu.ts).
      dev: {
        where: () => {
          const q = Math.floor(this.player.x / TILE_PX), r = Math.floor(this.player.y / TILE_PX);
          return { q, r, biome: this.terrain.biome(q, r), tile: this.terrain.edit(q, r), passable: this.terrain.passable(q, r), objects: this.children.list.length, fps: Math.round(this.game.loop.actualFps), day: this.session.snapshot().day };
        },
        teleport: (q: number, r: number) => {
          const at = this.nav.snap(Math.round(q), Math.round(r), 12) ?? { q: Math.round(q), r: Math.round(r) };
          const f = tileFootWorld(at.q, at.r);
          this.player.setPosition(f.x, f.y);
          this.syncChunks(true);
        },
        towns: () => this.layout.settlements.map((t) => ({ id: t.id, q: t.q, r: t.r + 2 })),
        /** Nearest feature of a kind ('farm', 'outcrop', 'stream') or spot type ('camp', 'ruin', ...) within ~400 tiles. */
        nearest: (what: string) => {
          const q = Math.floor(this.player.x / TILE_PX), r = Math.floor(this.player.y / TILE_PX), R = 400;
          let best: { q: number; r: number } | null = null, bd = Infinity;
          for (const f of featuresIn(this.session.getSeed(), this.layout.settlements, q - R, r - R, q + R, r + R)) {
            const pts = f.kind === 'stream' ? (f.kind === what ? f.cells : [])
              : f.kind === 'farm' ? (what === 'farm' ? [f.house] : [])
              : f.kind === 'outcrop' ? (what === 'outcrop' ? [f.center] : [])
              : f.type === what ? [f.center] : [];
            for (const p of pts) { const d = Math.hypot(p.q - q, p.r - r); if (d > 6 && d < bd) { bd = d; best = { q: p.q, r: p.r + 2 }; } }
          }
          return best;
        },
        speed: { get: getWalkMul, set: setWalkMul },
        dawn: () => this.session.tick(),
        /** A real rest at a hearth: fade, dusk + dawn, dawn lines; resolves when the lines start. */
        rest: () => new Promise<string[]>((done) => this.rest(done)),
        /** Ring chips on offer for a person (all pages): [{ id, label }]. */
        chips: (personId: string) => this.chipsFor(personId).map((c) => ({ id: c.id, label: c.label })),
        /** Open the ring on a person as if E was pressed beside them (walks you there first). */
        ring: (personId: string) => {
          const p = this.people.byId.get(personId);
          if (!p) return false;
          this.player.setPosition(p.sprite.x + 20, p.sprite.y);
          this.openRing(p);
          return this.ring.isOpen();
        },
        /** Open a town's noticeboard at a page index or page id. */
        board: (townId: string, page?: number | string) => this.goods.openBoard(townId, page),
        /** Put the player at a town (as arriving there). */
        arriveAt: (townId: string) => this.arriveAt(townId),
        /** Ground at a tile: current biome, the player's edit there (if any), whether it can be walked. */
        tile: (q: number, r: number) => ({ biome: this.terrain.biome(q, r), edit: this.terrain.edit(q, r) ?? null, passable: this.terrain.passable(q, r) }),
        /** Work the land in reach (as pressing X), optionally facing (dx, dy) first. */
        work: (dx?: number, dy?: number) => { if (dx !== undefined || dy !== undefined) this.facing = { dx: dx ?? 0, dy: dy ?? 0 }; return this.workLand(); },
        /** Roads out of the player's town with today's travellers; a town's signpost tile; take a road (resolves on arrival). */
        roads: () => this.session.roads(),
        signpost: (townId: string) => this.roads.signpost(townId),
        travel: (routeId: string, tradeId?: string) => this.roads.travel(routeId, tradeId),
        /** Facilities on the roads: [{ id, name, type, state, q, r }] (q, r is the foot tile; stand at r + 1). */
        facilities: () => this.goods.facilities.views(),
        /** Last line shown by say(). */
        lastSay: () => this.hint.text,
        /** A person's 0..1 kin strain across the gap (city kin of a villager, or the reverse). */
        kinStrain: (personId: string) => { const st = this.session.getState(); return st ? kinStrainOf(st, personId) : 0; },
        give: (itemId: string, n: number) => {
          const st = this.session.getState();
          if (!st) return;
          if (itemId === 'coin') st.player.coin = (st.player.coin ?? 0) + n;
          else st.inventory = { ...(st.inventory ?? {}), [itemId]: (st.inventory?.[itemId] ?? 0) + n };
        },
      },
      interior: {
        residents: (buildingId: string) => this.people.insideOf(buildingId),
        /** Jump the day clock and re-settle who is indoors (instant; for screenshots/e2e). */
        setHour: (p01: number) => { this.life.setPhase(p01); this.people.settle(); },
        /** Per villager: { id, inside: buildingId|null, visible } - the exclusivity check. */
        whereabouts: () => this.people.people.map((p) => ({ id: p.id, inside: p.inside?.id ?? null, visible: p.sprite.visible })),
        buildings: () => this.buildings.map((b) => ({ id: b.id, townId: b.townId, kind: b.kind, door: { ...b.door } })),
        enter: (spec?: string | { buildingId?: string; townId?: string; kind?: InteriorKind }) => this.debugEnterInterior(spec),
        exit: () => this.room.leave(true),
        standBesideResident: () => this.room.debugStandBesideResident(),
        ringChips: () => (this.ring.isOpen() ? this.ringFor : null),
        state: () => this.room.state(),
      },
    };
    this.createSparkHud();
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as typeof this.wasd;

    this.hint = this.add
      .text(8, 28, 'Walk: WASD · E: talk/gather/enter doors/rest · I: satchel · F: use · X: work the land · L: letters · M: map', { fontFamily: 'Georgia, serif', fontSize: '11px', color: '#c8b898', stroke: '#1b1612', strokeThickness: 3 })
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
    // Esc closes whatever is open first (ring, satchel, map, letters); with nothing open it leaves the room.
    this.input.keyboard?.on('keydown-ESC', () => {
      const open = this.ring.isOpen() || this.goods.overlayOpen();
      this.closeRing();
      this.goods.closeOverlays();
      if (!open && this.room.active) this.room.leave();
    });
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT'].forEach((k, i) =>
      this.input.keyboard?.on(`keydown-${k}`, () => (this.ring.isOpen() ? this.ring.pickIndex(i) : this.goods.selectSlot(i))),
    );
    this.input.keyboard?.addCapture('TAB');
    this.input.keyboard?.on('keydown-I', () => this.goods.toggleInventory());
    this.input.keyboard?.on('keydown-TAB', () => this.goods.toggleInventory());
    this.input.keyboard?.on('keydown-M', () => this.goods.toggleMap());
    this.input.keyboard?.on('keydown-F', () => {
      // Stone or timber in hand beside ground it can mend: F works the land with it.
      const held = this.goods.selectedItem();
      if (held && this.workLand(held)) return;
      const line = this.goods.useSelected(this.room.active); if (line) this.say(line); this.syncSparkFromSession(true);
    });
    this.input.keyboard?.on('keydown-X', () => this.workLand());
    this.input.keyboard?.on('keydown-G', () => { const st = this.session.getState(); if (!this.room.active || !st) return; this.say(lightLantern(st, this.room.state()!.buildingId)); this.room.paintLantern(); });
    this.input.keyboard?.on('keydown-L', () => this.goods.letters());
    this.input.keyboard?.on('keydown-N', () => this.say(toggleSfxMute() ? 'Sound off.' : 'Sound on.'));
    this.input.keyboard?.on('keydown-B', () => { if (!this.resting && !this.room.active) this.body.openMenu(); });
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
    if (this.room.active) { this.updateRoom(_time, delta); return; }
    if (this.goods.overlayOpen() || this.roads.isOpen()) { this.tickLife(delta); return; }
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
        FEEL.overworld.walkTilesPerSec * getWalkMul() * this.bodyWalkMul(),
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
      this.facing = { dx, dy };
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

  /** Inside a room the world still runs (clock, residents, caravans, mail); only the player stands elsewhere. */
  private updateRoom(time: number, delta: number): void {
    let dx = 0, dy = 0;
    const blocked = this.goods.overlayOpen();
    if (!blocked) {
      if (this.cursors.left?.isDown || this.wasd.A.isDown) dx -= 1;
      if (this.cursors.right?.isDown || this.wasd.D.isDown) dx += 1;
      if (this.cursors.up?.isDown || this.wasd.W.isDown) dy -= 1;
      if (this.cursors.down?.isDown || this.wasd.S.isDown) dy += 1;
      const ptr = this.input.activePointer;
      if (dx === 0 && dy === 0 && ptr.isDown && !this.uiTap) {
        const me = this.room.playerPos();
        const ex = ptr.worldX - me.x, ey = ptr.worldY - me.y;
        if (Math.abs(ex) > TILE_PX / 2) dx = Math.sign(ex);
        if (Math.abs(ey) > TILE_PX / 2) dy = Math.sign(ey);
      }
    }
    this.room.update(time, delta, dx, dy, blocked);
    this.moving = false;
    this.people.update(this.time.now, delta, { x: -1e9, y: -1e9 });
    this.goods.update(this.time.now, delta, this.player);
    this.life.update(this.time.now, delta, this.player, false);
    this.people.setPrompt(null);
    this.life.setPrompt(false);
    this.doorPrompt.setVisible(false);
    if (this.ringFor) {
      // Walking away from the resident closes the ring, like outdoors.
      if (dx !== 0 || dy !== 0) { if (this.room.distanceToResident() > 90) this.closeRing(); }
      if (!this.room.residentHead(this.ringFor)) this.closeRing(); // they left the room
    }
    document.body.dataset.hfLocalOverlay = 'true'; // Esc leaves the room, not the pause menu
  }

  private tickLife(delta: number): void {
    const t = this.time.now;
    this.body.update();
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

  /** A villager's given name as it shows over their head. */
  private nameOf(id: string): string {
    return firstName({ id, name: this.session.getState()?.people[id]?.name });
  }

  private chipsFor(id: string): Chip[] {
    return this.session
      .listActions()
      .filter((a) => a.id.endsWith('@' + id))
      .map((a) => {
        const m = a.id.slice(0, a.id.indexOf('@'));
        return { id: a.id, label: a.label ?? deedLabel(m) ?? VERB[m] ?? pretty(m), savage: a.family === 'savage' };
      });
  }

  private openRing(p: Person): void {
    if (this.resting || p.inside) return;
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
    this.ring.open({ x: h.x, y: h.y - 6 }, chips, (c) => this.commit(p.id, p.sprite, () => this.people.headOf(p.id), c));
  }

  /** Same deeds, same interaction system, with the resident of the room you are standing in. */
  private openRoomRing(id: string): void {
    const sprite = this.room.residentSprite(id);
    const head = this.room.residentHead(id);
    if (!sprite || !head) return;
    const chips: Chip[] = [...this.chipsFor(id), { id: '@chat', label: 'Chat', savage: false }];
    this.ringFor = id;
    this.ring.open({ x: head.x, y: head.y - 6 }, chips, (c) => {
      if (c.id === '@chat') { this.closeRing(); this.room.chat(); return; }
      this.commit(id, sprite, () => this.room.residentHead(id) ?? { x: sprite.x, y: sprite.y - 36 }, c);
    });
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
    // The coal is out: no deeds or rest while the burnout plays and succession is pending; nor while the road menu is open.
    if (this.resting || this.goods.overlayOpen() || this.roads.isOpen() || isSuccessionOpen(this.session)) return;
    if (this.ring.isOpen()) return;
    if (this.room.active) {
      const who = this.room.interact();
      if (who) this.openRoomRing(who.id);
      return;
    }
    if (this.goods.readBoard(this.player)) return;
    if (this.roads.interact(this.player)) return;
    if (this.goods.meetCaravan(this.player)) return;
    if (this.goods.workFacility(this.player)) return this.syncSparkFromSession(true);
    const p = this.people.nearest(this.player);
    const door = this.doorTarget(p);
    if (door) {
      const me = this.session.getState()?.player;
      // Some bodies don't fit every door (an ogre and a cottage): the body's traits decide, not its name.
      if (me && !canEnterBuilding(me, door.kind)) return this.say(blockedDoorLine(me));
      return this.enterBuilding(door);
    }
    if (p) return this.openRing(p);
    const got = this.goods.gatherNear(this.player);
    if (got) return this.say(got);
    if (this.life.nearestHearth(this.player)) this.rest();
  }

  /**
   * X (or F with stone/timber selected): lay stones, clear brush or mend the path in reach (sim/land-acts).
   * With `itemId`, only acts that use that item; returns false when there was nothing for it to do.
   */
  private workLand(itemId?: string): boolean {
    const st = this.session.getState();
    if (!st || this.resting || this.room.active || this.goods.overlayOpen() || this.ring.isOpen()) return false;
    const at = this.nav.tileAt(this.player.x, this.player.y);
    const view = { ...this.terrain, drawn: (q: number, r: number) => this.drawnAt(q, r) };
    const res = workLandHere(st, view, at, this.facing, this.landTowns, itemId);
    // F with an item only takes over when the work happens; otherwise the item is used as usual.
    if (!res || (itemId && !res.ok)) return false;
    if (res.ok && res.q !== undefined && res.r !== undefined) {
      const cx = Math.floor(res.q / CHUNK_SIZE), cy = Math.floor(res.r / CHUNK_SIZE);
      this.drawnCache.delete(`${cx},${cy}`);
      this.layer.invalidate([{ cx, cy }]);
      this.syncChunks(true);
      this.goods.refreshInventory();
      this.tweens.add({ targets: this.player, y: this.player.y - 3, duration: 90, yoyo: true, repeat: 1 });
      const left = labourLeft(st);
      this.say(left > 0 ? res.line : `${res.line} Your back is done for today.`);
    } else this.say(res.line);
    return true;
  }

  private drawnAt(q: number, r: number): { ground?: string; props: string[] } {
    const cx = Math.floor(q / CHUNK_SIZE), cy = Math.floor(r / CHUNK_SIZE), key = `${cx},${cy}`;
    let tiles = this.drawnCache.get(key);
    if (!tiles) {
      tiles = new Map();
      const chunk = this.source.getChunk({ cx, cy });
      for (const t of chunk.tiles) tiles.set(`${t.q},${t.r}`, { ground: t.biomeId, props: [] });
      for (const p of chunk.props) {
        const k = `${p.position.x},${p.position.y}`;
        const cell = tiles.get(k) ?? { props: [] };
        cell.props.push(p.type);
        tiles.set(k, cell);
      }
      this.drawnCache.set(key, tiles);
    }
    return tiles.get(`${q},${r}`) ?? { props: [] };
  }

  /** Door in reach, unless a villager you could talk to is standing closer. */
  private doorTarget(talk: Person | null): Building | null {
    if (this.resting || this.entering || this.goods.overlayOpen() || this.ring.isOpen()) return null;
    const hit = nearestDoor(this.buildings, this.player);
    if (!hit) return null;
    if (talk && Phaser.Math.Distance.Between(this.player.x, this.player.y, talk.sprite.x, talk.sprite.y) < hit.dist) return null;
    return hit.building;
  }

  /** Walk through a door: fade, then the camera moves to the room. The world keeps running behind it. */
  private enterBuilding(b: Building, instant = false): void {
    if (this.inside || this.entering) return;
    this.entering = true;
    this.closeRing();
    this.doorPrompt.setVisible(false);
    const town = this.session.getWorld()?.settlements?.find((s) => s.id === b.townId);
    const payload: InteriorEnterData = {
      buildingId: b.id,
      townId: b.townId,
      townName: town?.name ?? pretty(b.townId),
      kind: b.kind,
      paletteIndex: b.paletteIndex,
      despair01: this.session.townDespair()[b.townId] ?? 0,
    };
    const go = (): void => {
      this.inside = b;
      this.entering = false;
      this.moving = false;
      this.hint.setVisible(false);
      this.life.setSkyVisible(false);
      this.input.keyboard?.resetKeys();
      this.room.enter(payload);
    };
    if (instant) return go();
    this.cameras.main.fadeOut(160, 20, 16, 12);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, go);
  }

  /** Back from a room: stand just outside the door, camera follows the player again. */
  private onRoomClosed(_buildingId: string): void {
    const b = this.inside;
    this.inside = null;
    this.entering = false;
    this.closeRing();
    this.input.keyboard?.resetKeys();
    this.hint.setVisible(true);
    this.life.setSkyVisible(true);
    const cam = this.cameras.main;
    cam.resetFX();
    this.followPlayer();
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

  private commit(id: string, sprite: Phaser.GameObjects.Sprite, headOf: () => { x: number; y: number }, c: Chip): void {
    const pre = this.goods.beforeDeed(c.id.slice(0, c.id.indexOf('@')), id);
    if (!pre.ok) {
      this.closeRing();
      this.say(pre.line ?? 'Not now.');
      return;
    }
    if (pre.line) this.say(pre.line);
    const before = this.session.snapshot().spark;
    let juiced = 0;
    let reignited = false;
    const off = this.session.onJuice((jid) => {
      juiced++;
      if (jid === 'person.reignite' || jid === 'site.kindle') reignited = true;
      if (jid === 'moment.beat') reignited = true; // an authored moment landing gets the warm burst too
    });
    this.session.act(c.id);
    this.goods.onAct();
    off();
    const after = this.session.snapshot().spark;
    const r = this.session.lastResolve();
    this.closeRing();
    const spent = Math.max(0, (before - after) / 100);
    const h = headOf();
    this.bus.emit('vfx.spark_spent', { x: h.x, y: h.y + 10, amount01: spent > 0 ? spent : 0.12 });
    if (reignited) this.bus.emit('vfx.reignite', { x: h.x, y: h.y + 10, warmthBefore: 0.2, warmthAfter: 0.8 });
    this.syncSparkFromSession(true);
    this.tweens.add({ targets: sprite, y: sprite.y - 5, duration: 110, yoyo: true });
    if (juiced === 0) {
      const who = this.nameOf(id);
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

  private rest(onLines?: (lines: string[]) => void): void {
    this.resting = true;
    this.closeRing();
    const cam = this.cameras.main;
    cam.fadeOut(700, 8, 8, 20);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.session.tick();
      this.life.dawn();
      // Children come of age and newcomers arrive: give them a body, a free house if there is one, then place everyone.
      this.people.sync();
      this.goods.onDawn();
      this.people.settle();
      (this.registry.get('autosave') as (() => void) | undefined)?.();
      this.syncSparkFromSession(false);
      this.time.delayedCall(350, () => {
        cam.fadeIn(900, 8, 8, 20);
        cam.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => {
          this.resting = false;
          playSfx('dawn');
          this.say(`Dawn. Day ${this.session.snapshot().day}.`);
          // Everything systems want you to hear on waking (sim/dawn-lines), one after another.
          const st = this.session.getState();
          const lines = st ? collectDawnLines(st) : [];
          lines.forEach((line, i) => this.time.delayedCall(2600 * (i + 1), () => this.say(line)));
          onLines?.(lines);
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
    // Size and tint come from the inhabitant's body traits (an ogre looms, a basilisk sibling is small).
    const look = bodyLook(this.session);
    this.player.setScale(FEEL.worldScale.artScale * look.scale);
    if (look.tint !== undefined) this.player.setTint(look.tint);
    this.playerShadow?.setScale(FEEL.worldScale.artScale * 0.7 * look.scale, FEEL.worldScale.artScale * 0.5 * look.scale);
    applySpriteSort(this.player);
    if (this.anims.exists('hero-idle-down')) this.player.play('hero-idle-down');
    this.followPlayer();
  }

  private bodyWalkMul(): number {
    const me = this.session.getState()?.player;
    return me ? walkSpeedMul(me) : 1;
  }

  /** Put the player at a town's hearth side (brood switching, road travel, tests). */
  arriveAt(townId: string): void {
    const t = this.layout.settlements.find((x) => x.id === townId);
    if (!t) return;
    const st = this.session.getState();
    if (st) st.player.townId = townId;
    const foot = tileFootWorld(t.q, t.r + 1);
    this.player.setPosition(foot.x, foot.y);
    applySpriteSort(this.player);
    this.playerShadow?.setPosition(foot.x, foot.y - 2).setDepth(foot.y - 0.5);
    this.cameras.main.centerOn(foot.x, foot.y);
    this.syncChunks(true);
  }

  private followPlayer(): void {
    const cam = this.cameras.main;
    cam.setRoundPixels(true);
    cam.startFollow(this.player, true, FEEL.overworld.camLerp, FEEL.overworld.camLerp);
    cam.setDeadzone(FEEL.overworld.camDeadzoneX, FEEL.overworld.camDeadzoneY);
    cam.setZoom(FEEL.worldScale.camZoom);
  }

  /** Rebuild the chunks around the player (after the land itself changed, e.g. a tile edit). */
  refreshChunks(): void {
    this.drawnCache.clear();
    this.layer.invalidate();
    this.syncChunks(true);
  }

  private syncChunks(force: boolean): void {
    const q = Math.floor(this.player.x / TILE_PX);
    const r = Math.floor(this.player.y / TILE_PX);
    const coords = chunksAround(q, r, CHUNK_SIZE, CHUNK_MARGIN);
    const key = coords.map((c) => `${c.cx},${c.cy}`).join('|');
    if (!force && key === this.lastChunkKey) return;
    // Streamed chunks are built a few per frame; keep syncing until none are pending.
    this.lastChunkKey = this.layer.sync(coords, force) ? '' : key;
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

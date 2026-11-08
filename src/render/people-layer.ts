/** People who live in the overworld: deterministic homes, idle bob, slow wander, proximity labels/prompts. */

import Phaser from 'phaser';
import type { PlaySession } from '../sim';
import { TILE_PX } from '../sim/map/constants';
import { applySpriteSort, tileFootWorld } from './depth-sort';
import { HERO_TEX, SHADOW_TEX } from './sheet-frames';
import { heroWalkAnim } from './painters/overworld-paint';
import type { Navigator } from '../sim/map/nav';
import type { Building } from '../sim/map/interiors';
import { DOOR_ARRIVE_PX, DOOR_GIVE_UP_MS, scheduledBuilding } from '../sim/map/residency';
import { strongestMarkTell } from './mark-tells';

type Settlement = { id: string; q: number; r: number };

const tileArgs = (nav: Navigator, pt: { x: number; y: number }): [number, number] => {
  const t = nav.tileAt(pt.x, pt.y);
  return [t.q, t.r];
};

export const pretty = (id: string): string =>
  id.split(/[_-]/).filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');

export function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h >>> 0;
}

const TINTS = [0xffffff, 0xf2b8a0, 0xa8d4c8, 0xe6c86e, 0xb8a0e0, 0xd89a82, 0x9ec27a, 0xe0a0b8];
/** Stable villager tint — shared with interiors so an occupant looks the same indoors. */
export const tintOf = (id: string): number => TINTS[hash(id) % TINTS.length]!;
const LABEL_NEAR = 84;
export const TALK_NEAR = 52;

export type Person = {
  id: string;
  town: Settlement;
  sprite: Phaser.GameObjects.Sprite;
  shadow?: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  /** Tiny glyph by the name for their strongest mark (absent when unmarked). */
  tell?: Phaser.GameObjects.Text;
  home: { x: number; y: number };
  target: { x: number; y: number };
  nextPick: number;
  bob: number;
  /** Remaining waypoints toward `target`; routed over land, bridges and fords only. */
  path?: { x: number; y: number }[];
  /** The room they are standing in right now. While set they are not drawn, not talkable, and not outdoors. */
  inside: Building | null;
  /** Building they are walking to because the schedule says it is time to go in. */
  entering: string | null;
  enteringMs: number;
};

export type PeopleLayer = {
  people: Person[];
  byId: Map<string, Person>;
  /** Head anchor in world coords. */
  headOf: (id: string) => { x: number; y: number };
  update: (time: number, dt: number, player: { x: number; y: number }) => void;
  /** Nearest person within talk range that has actions. */
  nearest: (player: { x: number; y: number }) => Person | null;
  setPrompt: (p: Person | null) => void;
  freeze: (id: string | null) => void;
  /** Daily schedule: where a person should be now (null = home). */
  setSchedule: (fn: (p: Person) => { x: number; y: number } | null) => void;
  /** Day clock (0..1) and each villager's building; together they decide who is indoors. */
  setResidency: (clock: () => number, homes: Map<string, Building>) => void;
  /** Snap everyone to where the schedule says they are (indoors people vanish, others emerge) - for load/dawn. */
  settle: () => void;
  /** Ids of the villagers actually inside this building right now. */
  insideOf: (buildingId: string) => string[];
  /** Add bodies for people who joined since the layer was built (births, arrivals); remove the gone. */
  sync: () => void;
  /** QA: the mark tell drawn on a person ({ markId, glyph, visible }) or null. */
  markTell: (id: string) => { markId: string; glyph: string; visible: boolean } | null;
};

export function createPeopleLayer(
  scene: Phaser.Scene,
  session: PlaySession,
  settlements: Settlement[],
  onTap: (p: Person) => void,
  hasActions: (id: string) => boolean,
  nav?: Navigator,
): PeopleLayer {
  const people: Person[] = [];
  const byId = new Map<string, Person>();
  const idx = new Map<string, number>();
  const hasFrame = scene.textures.exists(HERO_TEX) && scene.textures.get(HERO_TEX).has('7');
  const addPerson = (p: { id: string; townId?: string }): void => {
    if (byId.has(p.id)) return;
    const town = settlements.find((s) => s.id === p.townId) ?? settlements[hash(p.id) % settlements.length];
    if (!town) return;
    const n = idx.get(town.id) ?? 0;
    idx.set(town.id, n + 1);
    const foot = tileFootWorld(town.q, town.r);
    const h = hash(p.id);
    const ang = ((n * 2.399 + (h % 100) / 100) % (Math.PI * 2)) + 0.4;
    const rad = TILE_PX * (2.2 + (n % 3) * 0.9 + ((h >> 8) % 5) * 0.12);
    const home = { x: foot.x + Math.cos(ang) * rad, y: foot.y + 20 + Math.abs(Math.sin(ang)) * rad * 0.7 };
    const shadow = scene.textures.exists(SHADOW_TEX)
      ? scene.add.image(home.x, home.y - 2, SHADOW_TEX).setScale(1.4, 0.9)
      : undefined;
    const sprite = scene.add.sprite(home.x, home.y, HERO_TEX, hasFrame ? '7' : undefined).setScale(2);
    applySpriteSort(sprite);
    sprite.setTint(TINTS[h % TINTS.length]!);
    sprite.setInteractive({ useHandCursor: true, hitArea: new Phaser.Geom.Rectangle(-4, -6, 24, 24), hitAreaCallback: Phaser.Geom.Rectangle.Contains });
    const label = scene.add
      .text(0, 0, pretty(p.id).split(' ')[0]!, { fontFamily: 'Georgia, serif', fontSize: '10px', color: '#f4e6c8', stroke: '#1b1612', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(998_000)
      .setAlpha(0);
    const person: Person = { id: p.id, town, sprite, shadow, label, home, target: { ...home }, nextPick: (h % 4000) + 500, bob: (h % 628) / 100, inside: null, entering: null, enteringMs: 0 };
    sprite.on('pointerdown', () => onTap(person));
    people.push(person);
    byId.set(p.id, person);
  };
  for (const p of session.listPeople()) addPerson(p);

  // Marks are readable at a glance: the strongest one rides beside the name, always (outdoors) on.
  const tellMark = new Map<string, string>();
  const refreshTell = (person: Person, marks: { markId: string; stacks: number }[] | undefined): void => {
    const t = strongestMarkTell(marks);
    if (!t) {
      person.tell?.destroy();
      person.tell = undefined;
      tellMark.delete(person.id);
      return;
    }
    if (!person.tell) {
      person.tell = scene.add
        .text(0, 0, '', { fontFamily: 'Georgia, serif', fontSize: '10px', color: t.color, stroke: '#1b1612', strokeThickness: 3 })
        .setOrigin(0, 1)
        .setDepth(998_000);
      person.tell.setVisible(!person.inside);
    }
    person.tell.setText(t.glyph).setColor(t.color);
    tellMark.set(person.id, t.markId);
  };
  const refreshTells = (onlyId?: string): void => {
    for (const v of session.listPeople()) {
      if (onlyId && v.id !== onlyId) continue;
      const person = byId.get(v.id);
      if (person) refreshTell(person, v.marks);
    }
  };
  refreshTells();
  const offMarks = session.onJuice((jid, payload) => {
    if (jid !== 'mark.applied') return;
    const pid = (payload as { personId?: unknown } | undefined)?.personId;
    if (typeof pid === 'string') refreshTells(pid);
  });
  scene.events.once('shutdown', offMarks);

  const prompt = scene.add
    .text(0, 0, '…', { fontFamily: 'Georgia, serif', fontSize: '16px', color: '#f2b84b', stroke: '#1b1612', strokeThickness: 3 })
    .setOrigin(0.5, 1)
    .setDepth(998_500)
    .setVisible(false);
  let promptFor: Person | null = null;
  let frozen: string | null = null;
  let schedule: (p: Person) => { x: number; y: number } | null = () => null;
  let clock: (() => number) | null = null;
  let homes = new Map<string, Building>();
  const wantInside = (p: Person): Building | null => (clock ? scheduledBuilding(p.id, homes, clock()) : null);
  const doorStep = (b: Building) => ({ x: b.door.x, y: b.door.y + 12 });
  const setHidden = (p: Person, hidden: boolean): void => {
    p.sprite.setVisible(!hidden);
    p.shadow?.setVisible(!hidden);
    p.label.setVisible(!hidden);
    p.tell?.setVisible(!hidden);
    if (p.sprite.input) p.sprite.input.enabled = !hidden;
  };
  const goIn = (p: Person, b: Building): void => {
    p.inside = b;
    p.entering = null;
    p.path = [];
    p.sprite.setPosition(doorStep(b).x, doorStep(b).y);
    setHidden(p, true);
  };
  const comeOut = (p: Person): void => {
    const b = p.inside;
    p.inside = null;
    p.entering = null;
    if (b) {
      const d = doorStep(b);
      p.sprite.setPosition(d.x, d.y);
      p.target = { ...d };
    }
    p.path = [];
    p.nextPick = 0;
    setHidden(p, false);
  };
  const headOf = (id: string) => {
    const s = byId.get(id)?.sprite;
    return s ? { x: s.x, y: s.y - 36 } : { x: 0, y: 0 };
  };

  return {
    people,
    byId,
    headOf,
    sync() {
      // People born or arrived since the layer was built get a body; anyone gone loses theirs.
      const now = session.listPeople();
      for (const p of now) addPerson(p);
      const alive = new Set(now.map((p) => p.id));
      for (let i = people.length - 1; i >= 0; i--) {
        const p = people[i]!;
        if (alive.has(p.id)) continue;
        p.sprite.destroy();
        p.shadow?.destroy();
        p.label.destroy();
        p.tell?.destroy();
        tellMark.delete(p.id);
        people.splice(i, 1);
        byId.delete(p.id);
      }
      // Marks shift overnight (fading hope, relapse); redraw every tell.
      refreshTells();
    },
    markTell(id) {
      const p = byId.get(id);
      const markId = tellMark.get(id);
      return p?.tell && markId ? { markId, glyph: p.tell.text, visible: p.tell.visible } : null;
    },
    freeze: (id) => (frozen = id),
    setSchedule: (fn) => (schedule = fn),
    setResidency(c, h) {
      clock = c;
      homes = h;
      for (const p of people) { const w = wantInside(p); if (w && !p.inside) goIn(p, w); }
    },
    settle() {
      for (const p of people) {
        const w = wantInside(p);
        if (w && p.inside?.id !== w.id) goIn(p, w);
        else if (!w && p.inside) comeOut(p);
      }
    },
    insideOf: (buildingId) => people.filter((p) => p.inside?.id === buildingId).map((p) => p.id),
    setPrompt: (p) => (promptFor = p),
    nearest(player) {
      let best: Person | null = null;
      let bd = TALK_NEAR;
      for (const p of people) {
        const d = Phaser.Math.Distance.Between(player.x, player.y, p.sprite.x, p.sprite.y);
        if (!p.inside && d < bd && hasActions(p.id)) {
          bd = d;
          best = p;
        }
      }
      return best;
    },
    update(time, dt, player) {
      for (const p of people) {
        const s = p.sprite;
        let moving = false;
        if (frozen !== p.id) {
          // Indoors <-> outdoors is decided by the schedule and is exclusive: one place at a time.
          const want = wantInside(p);
          if (p.inside && want?.id !== p.inside.id) comeOut(p);
          if (p.inside) continue;
          if (want) {
            if (p.entering !== want.id) { p.entering = want.id; p.enteringMs = 0; p.nextPick = 0; }
            p.enteringMs += dt;
            const dd = doorStep(want);
            if (Math.hypot(dd.x - s.x, dd.y - s.y) <= DOOR_ARRIVE_PX || p.enteringMs > DOOR_GIVE_UP_MS) { goIn(p, want); continue; }
          } else p.entering = null;
          p.nextPick -= dt;
          if (p.nextPick <= 0) {
            const r = hash(p.id + Math.floor(time / 1000));
            const wander = TILE_PX * 1.1;
            const c = want ? doorStep(want) : schedule(p) ?? p.home;
            p.target =
              want || r % 3 === 0
                ? { ...c }
                : { x: c.x + ((r % 200) / 100 - 1) * wander, y: c.y + (((r >> 8) % 200) / 100 - 1) * wander * 0.6 };
            p.nextPick = 2500 + (r % 5000);
            p.path = [];
            if (nav) {
              // Never aim at water: snap to footing, then route via bridges/fords.
              if (!nav.walkableAt(p.target.x, p.target.y)) {
                const t = nav.snap(...tileArgs(nav, p.target));
                p.target = t ? nav.centerOf(t.q, t.r) : { x: s.x, y: s.y };
              }
              const way = nav.route({ x: s.x, y: s.y }, p.target);
              if (way) { p.path = way; const end = way[way.length - 1]; if (end) p.target = { ...end }; } else p.target = { x: s.x, y: s.y };
            }
          }
          const goal = p.path?.[0] ?? p.target;
          const dx = goal.x - s.x;
          const dy = goal.y - s.y;
          const d = Math.hypot(dx, dy);
          const rest = Math.hypot(p.target.x - s.x, p.target.y - s.y);
          if (d > 2) {
            const step = Math.min(d, (((p.entering ? 52 : rest > TILE_PX * 3 ? 34 : 14)) * dt) / 1000);
            const nx = s.x + (dx / d) * step, ny = s.y + (dy / d) * step;
            if (nav && !nav.walkableAt(nx, ny)) {
              // Hard guard: never step onto water (off bridge/ford); abandon this walk.
              p.path = [];
              p.target = { x: s.x, y: s.y };
            } else {
              s.x = nx;
              s.y = ny;
              moving = true;
              const horiz = Math.abs(dx) > Math.abs(dy);
              const { key, flipX } = heroWalkAnim(horiz ? Math.sign(dx) : 0, horiz ? 0 : Math.sign(dy));
              s.setFlipX(flipX);
              if (scene.anims.exists(key) && s.anims.currentAnim?.key !== key) s.play(key, true);
            }
          } else if (p.path?.length) p.path.shift();
        }
        if (!moving && s.anims.currentAnim?.key?.startsWith('hero-walk') && scene.anims.exists('hero-idle-down')) s.play('hero-idle-down', true);
        const breathe = moving ? 0 : Math.sin(time / 600 + p.bob);
        s.setDepth(s.y);
        s.setScale(2, 2 + breathe * 0.05);
        p.shadow?.setPosition(s.x, s.y - 2).setDepth(s.y - 0.5);
        const dist = Phaser.Math.Distance.Between(player.x, player.y, s.x, s.y);
        const want = dist < LABEL_NEAR && promptFor !== p ? 1 : 0;
        p.label.setPosition(s.x, s.y - 34).setAlpha(p.label.alpha + (want - p.label.alpha) * 0.15);
        // Beside the name when it shows, just off the head when it doesn't.
        p.tell?.setPosition(s.x + 3 + (p.label.width / 2) * p.label.alpha, s.y - 33).setDepth(998_000);
      }
      if (promptFor) {
        const h = headOf(promptFor.id);
        prompt.setVisible(true).setPosition(h.x, h.y - 2 - Math.abs(Math.sin(time / 300)) * 3);
      } else prompt.setVisible(false);
    },
  };
}

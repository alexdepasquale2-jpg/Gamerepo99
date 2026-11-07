/** People who live in the overworld: deterministic homes, idle bob, slow wander, proximity labels/prompts. */

import Phaser from 'phaser';
import type { PlaySession } from '../sim';
import { TILE_PX } from '../sim/map/constants';
import { applySpriteSort, tileFootWorld } from './depth-sort';
import { HERO_TEX, SHADOW_TEX } from './sheet-frames';
import { heroWalkAnim } from './painters/overworld-paint';
import type { Navigator } from '../sim/map/nav';

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
  home: { x: number; y: number };
  target: { x: number; y: number };
  nextPick: number;
  bob: number;
  /** Remaining waypoints toward `target`; routed over land, bridges and fords only. */
  path?: { x: number; y: number }[];
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
  for (const p of session.listPeople()) {
    const town = settlements.find((s) => s.id === p.townId) ?? settlements[hash(p.id) % settlements.length];
    if (!town) continue;
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
    const person: Person = { id: p.id, town, sprite, shadow, label, home, target: { ...home }, nextPick: (h % 4000) + 500, bob: (h % 628) / 100 };
    sprite.on('pointerdown', () => onTap(person));
    people.push(person);
    byId.set(p.id, person);
  }

  const prompt = scene.add
    .text(0, 0, '…', { fontFamily: 'Georgia, serif', fontSize: '16px', color: '#f2b84b', stroke: '#1b1612', strokeThickness: 3 })
    .setOrigin(0.5, 1)
    .setDepth(998_500)
    .setVisible(false);
  let promptFor: Person | null = null;
  let frozen: string | null = null;
  let schedule: (p: Person) => { x: number; y: number } | null = () => null;
  const headOf = (id: string) => {
    const s = byId.get(id)?.sprite;
    return s ? { x: s.x, y: s.y - 36 } : { x: 0, y: 0 };
  };

  return {
    people,
    byId,
    headOf,
    freeze: (id) => (frozen = id),
    setSchedule: (fn) => (schedule = fn),
    setPrompt: (p) => (promptFor = p),
    nearest(player) {
      let best: Person | null = null;
      let bd = TALK_NEAR;
      for (const p of people) {
        const d = Phaser.Math.Distance.Between(player.x, player.y, p.sprite.x, p.sprite.y);
        if (d < bd && hasActions(p.id)) {
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
          p.nextPick -= dt;
          if (p.nextPick <= 0) {
            const r = hash(p.id + Math.floor(time / 1000));
            const wander = TILE_PX * 1.1;
            const c = schedule(p) ?? p.home;
            p.target =
              r % 3 === 0
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
            const step = Math.min(d, ((rest > TILE_PX * 3 ? 34 : 14) * dt) / 1000);
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
      }
      if (promptFor) {
        const h = headOf(promptFor.id);
        prompt.setVisible(true).setPosition(h.x, h.y - 2 - Math.abs(Math.sin(time / 300)) * 3);
      } else prompt.setVisible(false);
    },
  };
}

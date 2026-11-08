/**
 * The player's body on screen, read from inhabitant traits: scale and tint, and for a multi-body
 * inhabitant (the brood) the siblings trailing you, siblings waiting in towns, and a small menu to
 * leave one behind, call them back, or switch to one elsewhere. Sim rules live in sim/embodiment.
 */
import Phaser from 'phaser';
import { applySpriteSort } from './depth-sort';
import { FEEL } from './feel';
import { HERO_TEX } from './sheet-frames';
import { openMenu, type MenuItem } from '../ui/kit/menu';
import { overlays } from '../ui/kit/overlay-stack';
import {
  bodiesElsewhere,
  bodiesHere,
  bodiesWithYou,
  callBodiesBack,
  isMultiBody,
  leaveBodyHere,
  spriteScale,
  switchToBody,
} from '../sim/embodiment';
import type { PlaySession } from '../sim/play-session/play-session';
import type { DataTables } from '../sim/load-data';

export type BodyLook = { scale: number; tint?: number };

/** Sprite scale and tint for the current inhabitant (tint from its archetype row, if any). */
export function bodyLook(session: PlaySession): BodyLook {
  const st = session.getState();
  if (!st) return { scale: 1 };
  const arch = ((st.data as DataTables | undefined)?.archetypes ?? []).find((a) => a.id === st.player.archetypeId) as
    | { tint?: string }
    | undefined;
  const tint = arch?.tint ? Number.parseInt(arch.tint.replace('#', ''), 16) : undefined;
  return { scale: spriteScale(st.player), tint: Number.isFinite(tint) ? tint : undefined };
}

export type InhabitantBody = {
  /** Call every overworld frame: followers trail the player, waiting siblings are placed in their towns. */
  update(): void;
  /** Open the brood menu. Returns false for single-body inhabitants. */
  openMenu(): boolean;
  destroy(): void;
};

type Opts = {
  scene: Phaser.Scene;
  session: PlaySession;
  player: () => Phaser.GameObjects.Sprite;
  /** World position to stand a waiting sibling in a town (null if the town is not laid out). */
  townSpot: (townId: string, slot: number) => { x: number; y: number } | null;
  /** Move the player to a town after switching bodies. */
  moveTo: (townId: string) => void;
  say: (text: string) => void;
};

const TRAIL_STEP = 10; // history samples between followers
const TRAIL_LEN = 64;

export function attachInhabitantBody(o: Opts): InhabitantBody {
  const sprites = new Map<string, Phaser.GameObjects.Sprite>();
  const trail: { x: number; y: number }[] = [];

  const sprite = (id: string): Phaser.GameObjects.Sprite => {
    let s = sprites.get(id);
    if (!s) {
      const look = bodyLook(o.session);
      s = o.scene.add.sprite(0, 0, HERO_TEX, o.scene.textures.get(HERO_TEX).has('7') ? '7' : undefined);
      s.setScale(FEEL.worldScale.artScale * look.scale * 0.9);
      if (look.tint !== undefined) s.setTint(look.tint);
      if (o.scene.anims.exists('hero-idle-down')) s.play('hero-idle-down');
      sprites.set(id, s);
    }
    return s;
  };

  function update(): void {
    const st = o.session.getState();
    if (!st || !isMultiBody(st.player)) return;
    const p = o.player();
    const last = trail[0];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 2) {
      trail.unshift({ x: p.x, y: p.y });
      trail.length = Math.min(trail.length, TRAIL_LEN);
    }
    const seen = new Set<string>();
    bodiesWithYou(st.player).slice(1).forEach((b, i) => {
      const at = trail[Math.min(trail.length - 1, (i + 1) * TRAIL_STEP)] ?? { x: p.x, y: p.y };
      const s = sprite(b.id).setVisible(true);
      s.setPosition(at.x + (i % 2 ? 6 : -6), at.y);
      applySpriteSort(s);
      seen.add(b.id);
    });
    [...bodiesHere(st.player), ...bodiesElsewhere(st.player)].forEach((b, i) => {
      const spot = o.townSpot(b.at, i);
      if (!spot) return;
      const s = sprite(b.id).setVisible(true).setPosition(spot.x, spot.y);
      applySpriteSort(s);
      seen.add(b.id);
    });
    for (const [id, s] of sprites) if (!seen.has(id)) s.setVisible(false);
  }

  function menu(): boolean {
    const st = o.session.getState();
    if (!st || !isMultiBody(st.player) || overlays.count('menu', 'modal') > 0) return false;
    const inh = st.player;
    let handle: ReturnType<typeof openMenu> | null = null;
    const done = (line?: string) => {
      handle?.close();
      if (line) o.say(line);
    };
    const withYou = bodiesWithYou(inh);
    const here = bodiesHere(inh);
    const items: MenuItem[] = [];
    if (withYou.length > 1 && inh.townId) {
      items.push({
        id: 'leave',
        label: `Leave ${withYou[1]!.name} here`,
        hint: 'They stay in this town and listen while you go on.',
        onPick: () => {
          const b = leaveBodyHere(st);
          done(b ? `${b.name} curls up by a warm wall. They will listen.` : undefined);
        },
      });
    }
    if (here.length) {
      items.push({
        id: 'call',
        label: `Call ${here.map((b) => b.name).join(' and ')} back`,
        onPick: () => {
          const back = callBodiesBack(st);
          done(back.length ? `${back.map((b) => b.name).join(' and ')} rejoin you.` : undefined);
        },
      });
    }
    for (const b of bodiesElsewhere(inh)) {
      items.push({
        id: `switch-${b.id}`,
        label: `Become ${b.name}, in ${b.at.replace(/_/g, ' ')}`,
        hint: 'Your eyes open there. The others stay where you stood.',
        onPick: () => {
          const town = switchToBody(st, b.id);
          done(town ? `You are ${b.name} now.` : undefined);
          if (town) o.moveTo(town);
        },
      });
    }
    items.push({ id: 'back', label: 'Back', onPick: () => done() });
    const where = withYou.map((b) => b.name).join(', ');
    // A side sheet that holds the world still while you choose (the overlay stack's pause flag).
    handle = openMenu('The Brood', items, { id: 'hf-brood-menu', placement: 'sheet', pause: true, onEscape: () => done(), note: `With you: ${where}. One spark between you.` });
    return true;
  }

  return {
    update,
    openMenu: menu,
    destroy: () => {
      for (const s of sprites.values()) s.destroy();
      sprites.clear();
    },
  };
}

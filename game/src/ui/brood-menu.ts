/**
 * The Brood: split and recall for multi-body inhabitants (Brood button on touch, B on keys).
 * A sheet-slot menu that holds the world still while you choose. If the actors area grows its own
 * `brood.open()`, that wins; until then this drives the sim's embodiment helpers directly.
 */
import type { ActorsApi, GameContext } from '../app/contracts';
import {
  bodiesElsewhere,
  bodiesHere,
  bodiesWithYou,
  callBodiesBack,
  isMultiBody,
  leaveBodyHere,
  switchToBody,
} from '../sim/embodiment';
import { openMenu, type MenuHandle, type MenuItem } from './kit/menu';
import { overlays } from './kit/overlay-stack';

const town = (id: string): string => id.replace(/_/g, ' ');

export function isBrood(ctx: GameContext): boolean {
  const st = ctx.session.getState();
  return !!st && isMultiBody(st.player);
}

export function openBroodMenu(ctx: GameContext): boolean {
  // TODO(actors): ActorsApi has no brood hook yet; when it adds `brood.open()`, the ui defers to it.
  const own = (ctx.actors as ActorsApi & { brood?: { open: () => void } }).brood;
  if (own) return own.open(), true;
  const st = ctx.session.getState();
  if (!st || !isMultiBody(st.player) || overlays.count('menu', 'modal') > 0) return false;
  const inh = st.player;
  let handle: MenuHandle | null = null;
  const done = (line?: string, moved?: string | null): void => {
    handle?.close();
    if (moved) ctx.arriveAt(moved);
    else ctx.actors.sync();
    if (line) ctx.voice.say('player', line);
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
      label: `Become ${b.name}, in ${town(b.at)}`,
      hint: 'Your eyes open there. The others stay where you stood.',
      onPick: () => {
        const dest = switchToBody(st, b.id);
        done(dest ? `You are ${b.name} now.` : undefined, dest);
      },
    });
  }
  items.push({ id: 'back', label: 'Back', onPick: () => done() });
  const where = withYou.map((b) => b.name).join(', ');
  handle = openMenu('The Brood', items, {
    id: 'hf-brood-menu',
    placement: 'sheet',
    pause: true,
    onEscape: () => done(),
    note: `With you: ${where}. One spark between you.`,
  });
  return true;
}

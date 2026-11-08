/** Menu flow: title -> game <-> pause/save/load/world file. Owns the Phaser lifecycle; sim state is only touched via session load paths. */
import { createPlaySession, type PlaySession } from '../sim';
import { AUTO_SLOT, createSaveSlots } from './save-slots';
import { openPauseMenu } from './menus/pause-menu';
import { openSaveMenu } from './menus/save-menu';
import { openTitleMenu } from './menus/title-menu';
import { openInhabitantMenu } from './menus/inhabitant-menu';
import { openWorldMenu, rollWorldSeed } from './menus/world-menu';
import { playableArchetypes, rollArchetype } from '../sim/inhabitant';
import { loadData } from '../sim/load-data';
import { openWorldFileMenu } from './menus/world-file-menu';
import type { MenuHandle } from './kit/menu';
import { getHud } from './kit/hud';
import { overlays } from './kit/overlay-stack';
import { watchSession } from './kit/session-events';

export type GameHost = {
  /** Boot (or reboot) the Phaser game around this session. */
  start: (session: PlaySession, autosave: () => void) => void;
  stop: () => void;
  setPaused: (paused: boolean) => void;
};

export function runGameFlow(host: GameHost): void {
  const slots = createSaveSlots();
  let session: PlaySession | null = null;
  let menu: MenuHandle | null = null;
  const open = (m: MenuHandle) => ((menu = m), m);
  // Day and phase sit at top-centre, muted (kit HUD); `#hf-status` keeps its text and data-* for e2e.
  const hud = getHud();
  const status = hud.status;
  let unwatch: (() => void) | undefined;

  function refreshStatus(): void {
    const snap = session?.snapshot();
    hud.setDay(snap ? snap.day : null);
    if (!snap) hud.setPhase(null);
    status.dataset.day = String(snap?.day ?? '');
    status.dataset.fingerprint = snap?.fingerprint ?? '';
    status.dataset.spark = String(snap?.spark ?? '');
    status.dataset.world = session ? String(session.getSeed()) : '';
  }

  function begin(s: PlaySession): void {
    session = s;
    unwatch?.();
    unwatch = watchSession(s, refreshStatus);
    hud.setMenuButton(true);
    host.start(s, () => {
      refreshStatus();
      const blob = s.saveBlob();
      if (blob) slots.write(AUTO_SLOT, blob, { town: s.snapshot().townId });
    });
    refreshStatus();
  }

  function newGame(archetypeId: string, seed: number): void {
    const s = createPlaySession({ mode: 'play', seed, archetypeId }) as PlaySession;
    s.start({ seed, archetypeId });
    begin(s);
  }

  /** After who you are: which world. The new world's number is rolled once per visit and shown before you commit. */
  function pickWorld(archetypeId: string): void {
    open(
      openWorldMenu({
        newSeed: rollWorldSeed(Math.random()),
        onPick: (seed) => (menu?.close(), newGame(archetypeId, seed)),
        onBack: () => (menu?.close(), pickInhabitant()),
      }),
    );
  }

  function pickInhabitant(): void {
    const list = playableArchetypes(loadData());
    open(
      openInhabitantMenu(list, {
        onPick: (id) => (menu?.close(), pickWorld(id)),
        onRoll: () => (menu?.close(), pickWorld(rollArchetype(list, Math.random()).id)),
        onBack: () => (menu?.close(), title()),
      }),
    );
  }

  function loadInto(blob: Parameters<PlaySession['loadBlob']>[0]): void {
    // The saved inhabitant comes back as itself; the archetype here only shapes the throwaway boot.
    const archetypeId = (blob.sim as { player?: { archetypeId?: string } } | undefined)?.player?.archetypeId ?? 'marrow';
    const s = createPlaySession({ mode: 'play', seed: blob.seed, archetypeId }) as PlaySession;
    s.start({ seed: blob.seed, archetypeId });
    s.loadBlob(blob);
    begin(s);
  }

  function title(): void {
    host.stop();
    session = null;
    unwatch?.();
    unwatch = undefined;
    hud.setMenuButton(false);
    refreshStatus();
    const latest = () => slots.list()[0];
    open(
      openTitleMenu(slots, {
        onNew: () => (menu?.close(), pickInhabitant()),
        onContinue: () => {
          const m = latest();
          const r = m ? slots.read(m.slot) : null;
          if (r?.ok) (menu?.close(), loadInto(r.blob));
          else menu?.setNote(r && !r.ok ? r.error : 'No saved fires yet.');
        },
        onLoad: () => (menu?.close(), loadMenu(title)),
      }),
    );
  }

  function loadMenu(back: () => void): void {
    open(openSaveMenu('load', slots, { current: () => null, onLoad: loadInto, onBack: back }));
  }

  /** The pause menu and the menus under it carry the stack's pause flag; the game pauses while any is open. */
  function pause(): void {
    if (!session || overlays.count('menu', 'modal') > 0) return;
    open(
      openPauseMenu({
        onResume: () => undefined,
        onSave: () =>
          open(
            openSaveMenu('save', slots, {
              current: () => {
                const blob = session?.saveBlob();
                return blob ? { blob, town: session!.snapshot().townId } : null;
              },
              onLoad: loadInto,
              onBack: pause,
            }),
          ),
        onLoad: () => loadMenu(pause),
        onWorldFile: () =>
          open(
            openWorldFileMenu(session!, {
              onImported: () => begin(session!),
              onBack: pause,
            }),
          ),
        onTitle: title,
        world: session.getSeed(),
      }),
    );
  }

  // Esc with nothing open (and nothing in the scene claiming it: ring, room, map) opens the pause menu.
  // Open menus and sheets take Esc first, in the overlay stack's capture listener.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && session && !overlays.top() && !overlays.escapeClaimed()) pause();
  });
  // Touch: a small menu button in the HUD layer (phones have no Esc key); it hides while a menu is open.
  hud.setMenuButton(false, () => {
    if (session && overlays.count('menu', 'modal') === 0) pause();
  });
  // The stack's pause flag drives the scenes: paused while any open entry asks for it.
  let paused = false;
  overlays.subscribe(() => {
    const p = overlays.pausing();
    if (p === paused) return;
    paused = p;
    host.setPaused(p);
  });
  title();
}

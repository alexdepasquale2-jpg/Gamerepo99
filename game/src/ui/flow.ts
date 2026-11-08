/**
 * The title flow and the pause menu (repurposed from the old game-flow):
 *   title (Continue, New game, Load) → who still lives here (4 archetypes + roll) → which world
 *   (known 42, a new one, or a number) → app.start(session, autosave).
 * In play: pause (resume, save to 3 slots, load, world file export/import, sound, leave to title).
 * Dawn autosave goes to its own slot. The overlay stack's pause flag drives app.setPaused.
 */
import type { AppHooks } from '../app/contracts';
import { createPlaySession } from '../sim/play-session/play-session';
import type { PlaySession } from '../sim/play-session/play-session-types';
import type { SaveBlob } from '../sim/save';
import { playableArchetypes, rollArchetype } from '../sim/inhabitant';
import { loadData } from '../sim/load-data';
import { AUTO_SLOT, createSaveSlots } from './save-slots';
import { openPauseMenu } from './menus/pause-menu';
import { openSaveMenu } from './menus/save-menu';
import { openTitleMenu } from './menus/title-menu';
import { openInhabitantMenu } from './menus/inhabitant-menu';
import { openWorldMenu, rollWorldSeed } from './menus/world-menu';
import { openWorldFileMenu } from './menus/world-file-menu';
import type { MenuHandle } from './kit/menu';
import { installOverlayKeys, overlays } from './kit/overlay-stack';
import { ensureKitStyle } from './kit/style';
import { currentCtx, endRun, setFlow } from './run';
import { isMuted, setMuted } from './sound';

/** The inhabitant's display name for a save slot ("Marrow", "The Brood", or an heir's name). */
function inhabitantName(s: PlaySession): string | undefined {
  const st = s.getState();
  if (!st) return undefined;
  const heir = st.legacy?.playerName;
  if (heir) return heir;
  return playableArchetypes(loadData()).find((a) => a.id === st.player.archetypeId)?.name;
}

export function runTitleFlow(app: AppHooks): void {
  ensureKitStyle();
  installOverlayKeys();
  const slots = createSaveSlots();
  let session: PlaySession | null = null;
  let menu: MenuHandle | null = null;
  const open = (m: MenuHandle): MenuHandle => (menu = m);

  function autosaveFor(s: PlaySession): () => void {
    return () => {
      if (session !== s) return;
      const blob = s.saveBlob();
      if (blob) slots.write(AUTO_SLOT, blob, { town: s.snapshot().townId, name: `Dawn: ${inhabitantName(s) ?? 'autosave'}` });
    };
  }

  function begin(s: PlaySession): void {
    endRun();
    overlays.clear();
    session = s;
    app.start(s, autosaveFor(s));
  }

  /** The legends an imported world carried, spoken by the townsfolk once the new run's people are up. */
  function speakOnArrival(s: PlaySession, legends: string[]): void {
    if (!legends.length) return;
    let tries = 0;
    const timer = setInterval(() => {
      const ctx = currentCtx();
      if (session !== s || ++tries > 50) return clearInterval(timer);
      if (!ctx || ctx.session !== s) return;
      clearInterval(timer);
      setTimeout(() => { if (currentCtx() === ctx) void ctx.voice.dawn(legends); }, 1500);
    }, 200);
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

  function loadInto(blob: SaveBlob): void {
    // The saved inhabitant comes back as itself; the archetype here only shapes the throwaway boot.
    const archetypeId = (blob.sim as { player?: { archetypeId?: string } } | undefined)?.player?.archetypeId ?? 'marrow';
    const s = createPlaySession({ mode: 'play', seed: blob.seed, archetypeId }) as PlaySession;
    s.start({ seed: blob.seed, archetypeId });
    s.loadBlob(blob);
    begin(s);
  }

  function title(): void {
    endRun();
    overlays.clear();
    app.stop();
    session = null;
    open(
      openTitleMenu(slots, {
        onNew: () => (menu?.close(), pickInhabitant()),
        onContinue: () => {
          const m = slots.list()[0];
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
    const s = session;
    if (!s || overlays.count('menu', 'modal') > 0) return;
    currentCtx()?.interact?.close();
    open(
      openPauseMenu({
        world: s.getSeed(),
        muted: isMuted(),
        onResume: () => undefined,
        onSave: () =>
          open(
            openSaveMenu('save', slots, {
              current: () => {
                const blob = s.saveBlob();
                return blob ? { blob, town: s.snapshot().townId } : null;
              },
              onLoad: loadInto,
              onBack: pause,
            }),
          ),
        onLoad: () => loadMenu(pause),
        onWorldFile: () => open(openWorldFileMenu(s, { onImported: (legends) => (begin(s), speakOnArrival(s, legends)), onBack: pause })),
        onSound: () => {
          const next = !isMuted();
          setMuted(next, currentCtx());
          return next;
        },
        onTitle: title,
      }),
    );
  }

  setFlow({ pause, title });
  let paused = false;
  overlays.subscribe(() => {
    const p = overlays.pausing();
    if (p === paused) return;
    paused = p;
    app.setPaused(p);
  });
  title();
}

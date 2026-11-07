/** Menu flow: title -> game <-> pause/save/load/world file. Owns the Phaser lifecycle; sim state is only touched via session load paths. */
import { createPlaySession, type PlaySession } from '../sim';
import { AUTO_SLOT, createSaveSlots } from './save-slots';
import { openPauseMenu } from './menus/pause-menu';
import { openSaveMenu } from './menus/save-menu';
import { openTitleMenu } from './menus/title-menu';
import { openWorldFileMenu } from './menus/world-file-menu';
import type { MenuHandle } from './menus/dom';

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
  const status = document.createElement('div');
  status.id = 'hf-status';
  status.style.cssText = 'position:fixed;top:6px;left:8px;z-index:5;font:13px Georgia,serif;color:#f4e6c8;text-shadow:0 1px 2px #000;pointer-events:none';
  document.body.appendChild(status);

  function refreshStatus(): void {
    const snap = session?.snapshot();
    status.textContent = snap ? `Day ${snap.day}` : '';
    status.dataset.day = String(snap?.day ?? '');
    status.dataset.fingerprint = snap?.fingerprint ?? '';
    status.dataset.spark = String(snap?.spark ?? '');
  }

  function begin(s: PlaySession): void {
    session = s;
    host.start(s, () => {
      refreshStatus();
      const blob = s.saveBlob();
      if (blob) slots.write(AUTO_SLOT, blob, { town: s.snapshot().townId });
    });
    refreshStatus();
  }

  function newGame(): void {
    const s = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' }) as PlaySession;
    s.start({ seed: 42, archetypeId: 'marrow' });
    begin(s);
  }

  function loadInto(blob: Parameters<PlaySession['loadBlob']>[0]): void {
    const s = createPlaySession({ mode: 'play', seed: blob.seed, archetypeId: 'marrow' }) as PlaySession;
    s.start({ seed: blob.seed, archetypeId: 'marrow' });
    s.loadBlob(blob);
    begin(s);
  }

  function title(): void {
    host.stop();
    session = null;
    refreshStatus();
    const latest = () => slots.list()[0];
    open(
      openTitleMenu(slots, {
        onNew: () => (menu?.close(), newGame()),
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

  function pause(): void {
    if (!session || menu?.el.isConnected) return;
    host.setPaused(true);
    const resume = () => host.setPaused(false);
    open(
      openPauseMenu({
        onResume: resume,
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
      }),
    );
  }

  window.addEventListener('keydown', (e) => {
    if (document.body.dataset.hfLocalOverlay === 'true') return;
    if (e.key === 'Escape' && session && !document.querySelector('.hf-menu')) pause();
  });
  // Touch: a small always-on menu button (phones have no Esc key).
  const menuBtn = document.createElement('button');
  menuBtn.textContent = '☰';
  menuBtn.setAttribute('aria-label', 'Menu');
  menuBtn.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:20;font:18px monospace;padding:8px 12px;color:#f2e9e4;background:#2a2420;border:1px solid #5a4a3a;border-radius:6px';
  menuBtn.addEventListener('click', () => {
    if (session && !document.querySelector('.hf-menu')) pause();
  });
  document.body.appendChild(menuBtn);
  setInterval(() => (menuBtn.style.display = session && !document.querySelector('.hf-menu') ? '' : 'none'), 300);
  title();
}

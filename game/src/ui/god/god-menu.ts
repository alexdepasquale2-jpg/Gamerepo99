/**
 * God menu (dev and playtest builds): a full-screen control centre for the simulation. Shift+` opens it,
 * as does the button in the dev menu. While it is open the game is paused (the overlay stack pauses the
 * scenes) unless "Live" is on. Tabs: overview, people, towns, powers, roads, you, feed, state, console.
 * Every edit goes straight into SimState, then `commit` tells the game to redraw.
 */
import type { GameContext } from '../../app/contracts';
import { DEV_TOOLS } from '../../dev/dev-flags';
import { overlays, type OverlayHandle } from '../kit/overlay-stack';
import { recordHistory, threshold } from './history';
import { installGodStyle } from './style';
import { consoleTab } from './tab-console';
import { feedTab } from './tab-feed';
import { overviewTab } from './tab-overview';
import { peopleTab } from './tab-people';
import { playerTab } from './tab-player';
import { powersTab } from './tab-powers';
import { roadsTab } from './tab-roads';
import { stateTab } from './tab-state';
import { townsTab } from './tab-towns';
import type { God, JuiceLine, Sample, Tab } from './types';
import { btn, el } from './ui';

const TABS: Tab[] = [overviewTab, peopleTab, townsTab, powersTab, roadsTab, playerTab, feedTab, stateTab, consoleTab];

export type GodMenu = { toggle: () => void; open: () => void; destroy: () => void };

export function createGodMenu(ctx: GameContext): GodMenu | null {
  if (!DEV_TOOLS) return null;
  installGodStyle();
  const history: Sample[] = [];
  const juice: JuiceLine[] = [];
  const stopRecording = recordHistory(ctx, history, juice);
  let active = 'overview';
  let live = false;
  let root: HTMLDivElement | null = null;
  let handle: OverlayHandle | null = null;
  let timer = 0;
  let toastTimer = 0;

  const g: God = {
    ctx,
    state: () => ctx.session.getState(),
    history,
    juice,
    memo: {},
    threshold: () => threshold(ctx.session.getState()),
    rerender: () => render(),
    toast(msg) {
      const t = root?.querySelector('.g-toast');
      if (!t) return;
      t.textContent = msg;
      t.classList.add('on');
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => t.classList.remove('on'), 1600);
    },
    commit(msg) {
      ctx.events.emit('inventory', {});
      try { ctx.world.refresh('all'); } catch { /* world not ready */ }
      render();
      if (msg) g.toast(msg);
    },
  };

  function strip(): HTMLElement {
    const st = ctx.session.getState();
    const s = el('div', 'g-strip');
    if (!st) return s;
    const fps = Math.round(ctx.scene.game.loop.actualFps);
    const item = (k: string, v: string | number): HTMLSpanElement => { const x = el('span'); x.append(`${k} `, el('b', '', v)); return x; };
    s.append(item('DAY', st.day), item('PHASE', ctx.world.phase().toFixed(2)), item('SPARK', `${Math.round(st.player.spark)}/${st.player.sparkMax ?? 100}`),
      item('TOWN', st.player.townId ?? '-'), item('PEOPLE', Object.keys(st.people).length), item('SEED', ctx.seed), item('FPS', fps));
    return s;
  }

  function render(): void {
    if (!root) return;
    const scroll = root.querySelector('.g-body')?.scrollTop ?? 0;
    root.replaceChildren();
    const top = el('div', 'g-top');
    const title = el('div', 'g-title', 'God menu');
    title.append(el('small', '', 'simulation control centre'));
    top.append(title, strip(),
      btn(live ? '● Live' : '❚❚ Paused', () => { live = !live; reopen(); }, live ? 'hot' : ''),
      btn('Close ✕', close));
    const tabs = el('div', 'g-tabs');
    tabs.setAttribute('role', 'tablist');
    for (const t of TABS) {
      const b = el('button', 'g-tab', t.label);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(t.id === active));
      b.addEventListener('click', () => { active = t.id; render(); });
      tabs.append(b);
    }
    const body = el('div', 'g-body');
    try { (TABS.find((t) => t.id === active) ?? TABS[0]!).render(g, body); } catch (err) {
      body.append(el('pre', 'red', `This tab failed to draw: ${err instanceof Error ? err.message : String(err)}`));
    }
    root.append(top, tabs, body, el('div', 'g-toast'));
    body.scrollTop = scroll;
  }

  /** Refresh the header strip every half second; the tab itself redraws on edits (and each second when live). */
  function tick(): void {
    if (!root) return;
    const old = root.querySelector('.g-strip');
    old?.replaceWith(strip());
    const typing = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (live && !typing && Date.now() % 1000 < 500 && active !== 'console') render();
  }

  function mount(): void {
    handle = overlays.open({ id: 'hf-god', kind: 'menu', el: root, pause: !live, trapFocus: false, onEscape: close, onClose: () => { handle = null; } });
  }
  function reopen(): void {
    handle?.close();
    mount();
    render();
  }
  function open(): void {
    if (root) return;
    root = el('div');
    root.id = 'hf-god';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'God menu');
    // Keys typed here never reach the game (fields already stop their own).
    root.addEventListener('keydown', (e) => { if (e.key !== 'Escape' && e.code !== 'Backquote') e.stopPropagation(); });
    document.body.appendChild(root);
    mount();
    render();
    timer = window.setInterval(tick, 500);
  }
  function close(): void {
    if (!root) return;
    clearInterval(timer);
    const h = handle;
    handle = null;
    root.remove();
    root = null;
    h?.close();
    ctx.events.emit('inventory', {});
  }

  return {
    open,
    toggle: () => (root ? close() : open()),
    destroy() { close(); stopRecording(); },
  };
}

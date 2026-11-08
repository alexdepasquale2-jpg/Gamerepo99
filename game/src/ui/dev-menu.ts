/**
 * Dev menu (backtick, dev and playtest builds only): live info, walk speed, go to a town, time of
 * day, next dawn, spark and coin, give items. A kit side sheet; info refreshes on open and after each
 * button (no timer).
 */
import type { GameContext } from '../app/contracts';
import { DEV_TOOLS, getWalkMul, setWalkMul } from '../dev/dev-flags';
import { addItem } from '../sim/goods/inventory';
import { createSheet, kitButton, kitEl, type Sheet } from './kit/sheet';

const HOURS: [string, number][] = [['Dawn', 0.02], ['Morning', 0.2], ['Noon', 0.5], ['Dusk', 0.72], ['Night', 0.88]];
const GIVE: [string, number][] = [['bread', 5], ['timber', 10], ['wool', 5], ['ore', 5], ['letter', 3]];

export type DevMenu = { toggle: () => void; destroy: () => void };

export function createDevMenu(ctx: GameContext): DevMenu | null {
  if (!DEV_TOOLS) return null;
  const sheet: Sheet = createSheet({ id: 'hf-dev', title: 'Dev' });
  const panel = sheet.body;
  const msg = (t: string): void => {
    const m = panel.querySelector('.msg');
    if (m) m.textContent = t;
  };
  const changed = (): void => ctx.events.emit('inventory', {});

  const section = (title: string, items: [string, () => void, boolean?][]): void => {
    const row = kitEl('div', 'hf-row');
    row.style.cssText = 'justify-content:flex-start;gap:4px';
    for (const [label, fn, on] of items) row.appendChild(kitButton(label, () => { fn(); render(); }, on === undefined ? {} : { on }));
    panel.append(kitEl('div', 'hf-label', title), row);
  };

  function info(): string {
    const st = ctx.session.getState();
    const snap = ctx.session.snapshot();
    const t = ctx.world.tileOf(ctx.actors.player.pos());
    const room = ctx.world.room();
    const fps = Math.round(ctx.scene.game.loop.actualFps);
    return [
      `tile ${t.q},${t.r}  town ${ctx.world.townAt(ctx.actors.player.pos()) ?? '-'}${room ? `  room ${room.buildingId}` : ''}`,
      `day ${snap.day}  phase ${ctx.world.phase().toFixed(2)}  fps ${fps}`,
      `spark ${snap.spark}/${st?.player.sparkMax ?? 100}  coin ${st?.player.coin ?? 0}  ${st?.player.archetypeId ?? ''}`,
      `seed ${ctx.seed}  walk ${getWalkMul()}x  focus ${ctx.interact?.focus()?.key ?? '-'}`,
    ].join('\n');
  }

  function render(): void {
    panel.replaceChildren(kitEl('pre', 'hf-pre hf-muted hf-small', info()));
    const sp = getWalkMul();
    section('Walk speed', [1, 5, 20, 50].map((n) => [`${n}x`, () => setWalkMul(n), sp === n] as [string, () => void, boolean]));
    section('Go to town', ctx.layout.settlements.map((t) => [t.id.replace(/_/g, ' '), () => ctx.arriveAt(t.id)] as [string, () => void]));
    section('Time', [
      ['Next dawn', () => { sheet.close(); void ctx.rest(); }],
      ...HOURS.map(([l, p]) => [l, () => ctx.world.setPhase(p)] as [string, () => void]),
    ]);
    const st = ctx.session.getState();
    section('Spark and coin', [
      ['+20 spark', () => { if (st) st.player.spark = Math.min(st.player.sparkMax ?? 100, st.player.spark + 20); changed(); }],
      ['-20 spark', () => { if (st) st.player.spark = Math.max(0, st.player.spark - 20); changed(); }],
      ['Burn out', () => { if (st) st.player.spark = 0; sheet.close(); void ctx.rest(); }],
      ['+50 coin', () => { if (st) st.player.coin = (st.player.coin ?? 0) + 50; changed(); }],
    ]);
    section('Give', GIVE.map(([id, n]) => [`+${n} ${id}`, () => {
      if (!st) return;
      try { addItem(st, id, n); msg(`gave ${n} ${id}`); changed(); } catch { msg(`no item ${id}`); }
    }] as [string, () => void]));
    panel.appendChild(kitEl('div', 'hf-note msg'));
  }

  return {
    toggle() {
      if (sheet.isOpen()) sheet.close();
      else {
        sheet.open();
        render();
      }
    },
    destroy: () => sheet.destroy(),
  };
}

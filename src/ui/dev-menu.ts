/** Dev menu (` key or the DEV chip): live info, speed, teleport, time, give items. A kit side sheet. Dev/playtest builds only. */
import { DEV_TOOLS } from '../dev/dev-flags';
import { createSheet, kitButton, kitEl } from './kit/sheet';
import { uiLayer } from './kit/layer';
import { rgba, Z } from './kit/tokens';

type Pt = { q: number; r: number };
type Dev = {
  where(): { q: number; r: number; biome: string; objects: number; fps: number; day: number };
  teleport(q: number, r: number): void;
  towns(): (Pt & { id: string })[];
  nearest(what: string): Pt | null;
  speed: { get(): number; set(n: number): void };
  dawn(): void;
  give(itemId: string, n: number): void;
};
type Hearth = { dev?: Dev; interior?: { setHour(p01: number): void } };
const hearth = () => (window as unknown as { __hearth?: Hearth }).__hearth;

const FIND = ['farm', 'outcrop', 'stream', 'camp', 'ruin', 'shrine', 'pond', 'thicket', 'clearing', 'deer', 'cart', 'cairn'];
const HOURS: [string, number][] = [['Dawn', 0.25], ['Noon', 0.5], ['Dusk', 0.75], ['Night', 0.95]];
const GIVE: [string, number][] = [['bread', 5], ['timber', 10], ['wool', 5], ['ore', 5], ['coin', 50], ['letter', 3]];

export function createDevMenu(): void {
  if (!DEV_TOOLS) return;
  // The chip sits at the canvas's bottom-right, clear of the day chip, minimap and hotbar.
  const btn = document.createElement('button');
  btn.id = 'hf-dev-btn';
  btn.type = 'button';
  btn.className = 'hf-chip';
  btn.textContent = 'DEV';
  btn.style.cssText = `right:calc(var(--hf-u) * 6px);bottom:calc(var(--hf-u) * 6px);min-height:30px;border:1px solid ${rgba('line', 0.5)};cursor:pointer;z-index:${Z.dev}`;
  uiLayer().el.appendChild(btn);
  const sheet = createSheet({ id: 'hf-dev', title: 'Dev' });
  const panel = sheet.body;

  const msg = (t: string) => { const m = panel.querySelector('.msg'); if (m) m.textContent = t; };
  const section = (title: string, items: [string, () => void, boolean?][]) => {
    const h = kitEl('div', 'hf-label', title);
    const row = kitEl('div', 'hf-row');
    row.style.cssText = 'justify-content:flex-start;gap:4px';
    for (const [label, fn, on] of items) row.appendChild(kitButton(label, () => { fn(); render(); }, on === undefined ? {} : { on }));
    panel.append(h, row);
  };

  function render(): void {
    const dev = hearth()?.dev;
    panel.replaceChildren();
    const info = kitEl('pre', 'hf-pre hf-muted hf-small info');
    panel.appendChild(info);
    if (!dev) { info.textContent = 'Start a game first.'; return; }
    const sp = dev.speed.get();
    section('Walk speed', [1, 5, 20, 50].map((n) => [`${n}x`, () => dev.speed.set(n), sp === n] as [string, () => void, boolean]));
    section('Go to town', dev.towns().map((t) => [t.id.replace(/_/g, ' '), () => dev.teleport(t.q, t.r)] as [string, () => void]));
    section('Go to nearest', FIND.map((k) => [k, () => { const p = dev.nearest(k); if (p) { dev.teleport(p.q, p.r); msg(`${k} at ${p.q},${p.r}`); } else msg(`no ${k} within 400 tiles`); }] as [string, () => void]));
    section('Jump', [
      ['Random wild', () => { const w = dev.where(); dev.teleport(w.q + Math.round((Math.random() - 0.5) * 600), w.r + Math.round((Math.random() - 0.5) * 600)); }],
      ['+100 N', () => { const w = dev.where(); dev.teleport(w.q, w.r - 100); }],
      ['+100 E', () => { const w = dev.where(); dev.teleport(w.q + 100, w.r); }],
    ]);
    section('Time', [
      ['Next dawn', () => dev.dawn()],
      ...HOURS.map(([l, p]) => [l, () => hearth()?.interior?.setHour(p)] as [string, () => void]),
    ]);
    section('Give', GIVE.map(([id, n]) => [`+${n} ${id}`, () => { dev.give(id, n); msg(`gave ${n} ${id}`); }] as [string, () => void]));
    panel.appendChild(kitEl('div', 'hf-note msg'));
    tickInfo();
  }

  /** Info refreshes when the sheet opens and after each button (no timer). */
  function tickInfo(): void {
    const dev = hearth()?.dev, info = panel.querySelector('.info');
    if (!dev || !info) return;
    const w = dev.where();
    info.textContent = `tile ${w.q},${w.r}  ${w.biome}\nday ${w.day}  fps ${w.fps}  objects ${w.objects}  speed ${dev.speed.get()}x`;
  }

  const toggle = () => { if (sheet.isOpen()) sheet.close(); else { sheet.open(); render(); } };
  btn.addEventListener('click', toggle);
  window.addEventListener('keydown', (e) => { if (e.code === 'Backquote') { e.preventDefault(); toggle(); } });
}

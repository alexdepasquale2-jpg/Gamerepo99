/** Dev menu (` key or the DEV button): live info, speed, teleport, time, give items. Dev/playtest builds only. */
import { DEV_TOOLS } from '../dev/dev-flags';

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
  const css = document.createElement('style');
  css.textContent = `
  #hf-dev-btn{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:60;font:600 12px Georgia,serif;color:#f4e6c8;background:#2a2018cc;border:1px solid #6a5a40;border-radius:6px;padding:6px 10px;min-height:32px}
  #hf-dev{position:fixed;top:48px;left:50%;transform:translateX(-50%);z-index:60;width:min(420px,calc(100vw - 32px));max-height:calc(100vh - 120px);overflow:auto;background:#15110ded;color:#f4e6c8;border:1px solid #6a5a40;border-radius:8px;padding:10px 12px;font:13px Georgia,serif}
  #hf-dev[hidden]{display:none}
  #hf-dev h4{margin:10px 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#f2b84b}
  #hf-dev .row{display:flex;flex-wrap:wrap;gap:6px}
  #hf-dev button{font:12px Georgia,serif;color:#f4e6c8;background:#2a2018;border:1px solid #6a5a40;border-radius:5px;padding:6px 8px;min-height:32px}
  #hf-dev button.on{border-color:#f2b84b;color:#f2b84b}
  #hf-dev .info{font:12px ui-monospace,monospace;white-space:pre-wrap;color:#d9c9a6}
  #hf-dev .msg{min-height:16px;color:#9fd18b;font-size:12px;margin-top:6px}`;
  document.head.appendChild(css);

  const btn = document.createElement('button');
  btn.id = 'hf-dev-btn';
  btn.textContent = 'DEV';
  const panel = document.createElement('div');
  panel.id = 'hf-dev';
  panel.hidden = true;
  document.body.append(btn, panel);

  const msg = (t: string) => { const m = panel.querySelector('.msg'); if (m) m.textContent = t; };
  const section = (title: string, items: [string, () => void, boolean?][]) => {
    const h = document.createElement('h4');
    h.textContent = title;
    const row = document.createElement('div');
    row.className = 'row';
    for (const [label, fn, on] of items) {
      const b = document.createElement('button');
      b.textContent = label;
      if (on) b.className = 'on';
      b.addEventListener('click', () => { fn(); render(); });
      row.appendChild(b);
    }
    panel.append(h, row);
  };

  function render(): void {
    const dev = hearth()?.dev;
    panel.replaceChildren();
    const info = document.createElement('div');
    info.className = 'info';
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
    const m = document.createElement('div');
    m.className = 'msg';
    panel.appendChild(m);
    tickInfo();
  }

  function tickInfo(): void {
    const dev = hearth()?.dev, info = panel.querySelector('.info');
    if (!dev || !info) return;
    const w = dev.where();
    info.textContent = `tile ${w.q},${w.r}  ${w.biome}\nday ${w.day}  fps ${w.fps}  objects ${w.objects}  speed ${dev.speed.get()}x`;
  }
  setInterval(() => { if (!panel.hidden) tickInfo(); }, 300);

  const toggle = () => { panel.hidden = !panel.hidden; if (!panel.hidden) render(); };
  btn.addEventListener('click', toggle);
  window.addEventListener('keydown', (e) => { if (e.code === 'Backquote') { e.preventDefault(); toggle(); } });
}

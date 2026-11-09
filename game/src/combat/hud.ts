/**
 * The action HUD over the canvas: your health (red, under the spark bar) with your level and a thin
 * experience bar (tap it for the hero sheet, C), and the skill bar at the bottom right: Attack, the three
 * slotted skills (Q, R, F) and Dodge (Shift), each with its cooldown. On a touch screen the bar is the
 * way to fight (hold Attack). It shows out in the wilds and in any fight; in towns only health is shown.
 */
import type { GameContext } from '../app/contracts';
import { skillRow, xpToNext } from '../sim/hero/data';
import { heroOf, statsOf } from '../sim/hero/hero';
import type { Moves } from './actions';

const CSS = `
.hf-ar{position:fixed;pointer-events:none;z-index:21;font:600 11px/1.2 var(--hf-font-ui,system-ui,sans-serif);color:#e8dcc8}
.hf-ar-life{position:absolute;left:8px;top:58px;display:flex;flex-direction:column;gap:2px;pointer-events:auto;cursor:pointer;width:150px}
.hf-ar-hp{position:relative;height:10px;border-radius:6px;background:rgba(11,10,15,.7);border:1px solid rgba(200,74,58,.8);overflow:hidden}
.hf-ar-hp i{position:absolute;inset:0;transform-origin:left;background:linear-gradient(180deg,#e86a5a,#a82a2a);transition:transform .15s}
.hf-ar-hp span{position:absolute;inset:0;text-align:center;font-size:9px;line-height:10px;text-shadow:0 1px 2px #000}
.hf-ar-xp{height:3px;border-radius:2px;background:rgba(11,10,15,.6);overflow:hidden}
.hf-ar-xp i{display:block;height:100%;background:#b878e8}
.hf-ar-lv{font-size:10px;color:#f2b84b;text-shadow:0 1px 2px #000}
.hf-ar-lv b{color:#7ae070}
.hf-ar-bar{position:absolute;right:8px;bottom:calc(64px + var(--hf-pad-reserve-bottom,0px));display:flex;gap:4px;pointer-events:auto;touch-action:none}
.hf-ar-btn{position:relative;width:46px;height:46px;border-radius:10px;border:1px solid rgba(184,152,96,.6);background:rgba(28,22,18,.82);color:#e8dcc8;font:600 10px/1.1 var(--hf-font-ui,system-ui,sans-serif);display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none}
.hf-ar-btn.is-main{width:56px;height:56px;border-color:#f2b84b}
.hf-ar-btn.is-empty{opacity:.45}
.hf-ar-btn .k{position:absolute;left:3px;top:2px;font:9px monospace;color:#8a7a68}
.hf-ar-btn .cd{position:absolute;left:0;right:0;bottom:0;background:rgba(11,10,15,.7)}
.hf-ar-btn .c{font-size:8px;color:#f2b84b}
.hf-ar-down .hf-ar-btn{border-color:#c84a3a}
@media (pointer:coarse){.hf-ar-btn .k{display:none}.hf-ar-btn{width:52px;height:52px}.hf-ar-btn.is-main{width:64px;height:64px}}
`;

export type CombatHud = { sync(inWilds: boolean, fighting: boolean): void; destroy(): void };

export function createCombatHud(ctx: GameContext, moves: Moves, io: { attackHeld(h: boolean): void; openHero(): void }): CombatHud {
  if (!document.getElementById('hf-ar-style')) {
    const s = document.createElement('style');
    s.id = 'hf-ar-style';
    s.textContent = CSS;
    document.head.append(s);
  }
  const root = document.createElement('div');
  root.className = 'hf-ar';
  const life = document.createElement('div');
  life.className = 'hf-ar-life';
  life.title = 'Your hero · C';
  life.innerHTML = '<div class="hf-ar-lv"></div><div class="hf-ar-hp"><i></i><span></span></div><div class="hf-ar-xp"><i></i></div>';
  life.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
  life.addEventListener('click', (e) => { e.stopPropagation(); io.openHero(); });
  const bar = document.createElement('div');
  bar.className = 'hf-ar-bar';
  const mk = (label: string, key: string, main = false): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `hf-ar-btn${main ? ' is-main' : ''}`;
    b.innerHTML = `<span class="k">${key}</span><span class="n">${label}</span><span class="c"></span><span class="cd"></span>`;
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
    return b;
  };
  const atk = mk('Attack', '␣', true);
  const slots = [mk('', 'Q'), mk('', 'R'), mk('', 'F')];
  const dodge = mk('Dodge', '⇧');
  atk.addEventListener('pointerdown', () => io.attackHeld(true));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) atk.addEventListener(ev, () => io.attackHeld(false));
  slots.forEach((b, i) => b.addEventListener('pointerdown', () => moves.skill(i)));
  dodge.addEventListener('pointerdown', () => moves.dodge());
  bar.append(...slots, dodge, atk);
  root.append(life, bar);
  document.body.append(root);

  const hpFill = life.querySelector<HTMLElement>('.hf-ar-hp i')!, hpText = life.querySelector<HTMLElement>('.hf-ar-hp span')!;
  const xpFill = life.querySelector<HTMLElement>('.hf-ar-xp i')!, lv = life.querySelector<HTMLElement>('.hf-ar-lv')!;
  const setCd = (b: HTMLElement, left: number, total: number): void => { (b.querySelector('.cd') as HTMLElement).style.height = `${Math.min(100, (left / Math.max(0.01, total)) * 100)}%`; };

  return {
    sync(inWilds, fighting) {
      const st = ctx.session.getState();
      const canvas = ctx.scene.game.canvas.getBoundingClientRect();
      Object.assign(root.style, { left: `${canvas.left}px`, top: `${canvas.top}px`, width: `${canvas.width}px`, height: `${canvas.height}px` });
      // On a touch screen the pad's face buttons hold the bottom right: sit just above the highest of them.
      const pad = document.getElementById('hf-pad');
      const faces = pad && !pad.hidden ? [...pad.querySelectorAll<HTMLElement>('[data-btn=a],[data-btn=b],[data-btn=x],[data-btn=y]')].map((b) => b.getBoundingClientRect()).filter((r) => r.width && r.left > canvas.left + canvas.width / 2) : [];
      // ...and above the hotbar (which runs across the screen just over them) and the purse on it.
      const hot = document.querySelector<HTMLElement>('.hf-hotbar__slots')?.getBoundingClientRect();
      const purse = document.getElementById('hf-purse')?.getBoundingClientRect();
      const tops = [...faces.map((r) => r.top), ...(hot && hot.width ? [hot.top] : []), ...(purse && purse.width ? [purse.top] : [])];
      if (faces.length) Object.assign(bar.style, { position: 'fixed', right: `${Math.max(8, window.innerWidth - Math.max(...faces.map((r) => r.right)))}px`, bottom: `${window.innerHeight - Math.min(...tops) + 10}px` });
      else Object.assign(bar.style, { position: '', right: '', bottom: '' });
      const covered = !!ctx.ui?.blocking() || !!ctx.panels?.anyOpen();
      root.hidden = !st || covered;
      if (!st || covered) return;
      const h = heroOf(st), s = statsOf(st);
      hpFill.style.transform = `scaleX(${Math.max(0, h.hp / s.maxHp)})`;
      hpText.textContent = `${Math.ceil(h.hp)} / ${s.maxHp}`;
      xpFill.style.width = `${Math.min(100, (h.xp / xpToNext(h.level)) * 100)}%`;
      const pts = h.points.skill + h.points.attr;
      lv.innerHTML = `Lv ${h.level}${pts ? ` <b>+${pts}</b>` : ''}`;
      root.classList.toggle('hf-ar-down', h.hp < s.maxHp * 0.3);
      bar.hidden = !inWilds && !fighting;
      const cd = moves.cooldowns();
      setCd(atk, cd.attack, 1 / s.rate);
      setCd(dodge, cd.dodge, 0.8);
      cd.slots.forEach((c, i) => {
        const b = slots[i]!;
        const row = c.id ? skillRow(c.id) : undefined;
        (b.querySelector('.n') as HTMLElement).textContent = row ? row.name : '—';
        (b.querySelector('.c') as HTMLElement).textContent = row ? `${row.spark}✦` : '';
        b.classList.toggle('is-empty', !row || st.player.spark < (row?.spark ?? 0));
        b.title = row ? `${row.name} (${'QRF'[i]}): ${row.desc}` : 'Learn a skill in the hero sheet (C)';
        setCd(b, c.left, c.total);
      });
    },
    destroy() { root.remove(); },
  };
}

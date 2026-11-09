/**
 * The hero sheet (C, or tap the health bar): your level, experience and attributes to raise; your gear and
 * bag (equip, break down, see each piece's numbers in its rarity's colour); and the skill tree (learn ranks
 * with skill points, put three on Q, R and F). The kill tally and what the fighting did close the Hero tab.
 */
import type { GameContext, SheetDef } from '../app/contracts';
import { BRANCHES, FAMILIES, SKILLS, atRank, baseRow, rarityRow, xpToNext } from '../sim/hero/data';
import { describe, equip, salvage, slotOf } from '../sim/hero/gear';
import { heroOf, spendAttr, statsOf } from '../sim/hero/hero';
import { assign, learn, skillsView } from '../sim/hero/skills';
import type { Attr, GearItem } from '../sim/hero/types';
import { button, el } from './dom';
import { bar, btn, row, section } from './works/kit';
import { ensureWorksStyles } from './works/style';

export const HERO_ID = 'hero';
type Tab = 'hero' | 'gear' | 'skills';
let at: Tab = 'hero';

export function heroSheet(ctx: GameContext, tab?: Tab): SheetDef {
  ensureWorksStyles();
  if (tab) at = tab;
  let message = '';
  const def: SheetDef = {
    id: HERO_ID,
    title: 'Your hero',
    render(body) {
      const scroll = body.scrollTop;
      body.replaceChildren();
      const st = ctx.session.getState();
      if (!st) return;
      const run = (fn: () => { ok: boolean; line: string } | boolean, line = ''): void => {
        const r = fn();
        message = typeof r === 'boolean' ? line : r.line;
        ctx.voice?.sfx?.((typeof r === 'boolean' ? r : r.ok) ? 'act' : 'refuse');
        ctx.events.emit('inventory', {});
        def.render(body);
      };
      const h = heroOf(st), s = statsOf(st);
      const head = el('div', 'hf-works-head');
      head.append(el('strong', '', `Level ${h.level}`), el('span', 'hf-small hf-muted', `${Math.ceil(h.hp)}/${s.maxHp} health · ${h.points.attr} attribute and ${h.points.skill} skill points`));
      body.append(head);
      const tabs = el('div', 'hf-tabs hf-works-tabs', undefined, { role: 'tablist' });
      for (const [id, label] of [['hero', 'Hero'], ['gear', 'Gear'], ['skills', 'Skills']] as [Tab, string][]) {
        tabs.append(button(label, () => { at = id; def.render(body); }, { cls: id === at ? 'is-on' : '', id: `hero-tab-${id}`, pressed: id === at }));
      }
      body.append(tabs);
      const page = el('div', 'hf-works-page');
      if (at === 'hero') {
        const xp = section('Experience', `${h.xp} / ${xpToNext(h.level)} to level ${h.level + 1}. Each level: a skill point, two attribute points, full health.`);
        xp.append(bar(h.xp, xpToNext(h.level)));
        page.append(xp);
        const attrs = section('Attributes', h.points.attr ? `${h.points.attr} to spend.` : 'Earn more by levelling.');
        const ATTR: [Attr, string][] = [['might', 'Might: +5% damage each'], ['grit', 'Grit: +7 health and some armour each'], ['wits', 'Wits: +1% critical and spark regained in a fight each']];
        for (const [a, what] of ATTR) attrs.append(row(`${a[0]!.toUpperCase()}${a.slice(1)} ${s[a]}`, what, [btn('+1', () => run(() => spendAttr(st, a), `${a} raised.`), { disabled: !h.points.attr, id: `hero-attr-${a}` })]));
        page.append(attrs);
        const stats = section('In a fight');
        stats.append(el('p', 'hf-small', `Damage ${s.dmg[0]}–${s.dmg[1]} · ${s.rate.toFixed(2)} attacks a second · ${Math.round(s.crit * 100)}% critical · armour ${s.armor} · move ${Math.round(s.move * 100)}% · spark ${s.sparkRegen.toFixed(2)}/s in a fight${s.leech ? ` · ${s.leech} health on hit` : ''}`));
        page.append(stats);
        const tally = section('Slain', Object.entries(h.kills).map(([f, n]) => `${FAMILIES[f as keyof typeof FAMILIES]?.name ?? f} ${n}`).join(' · ') || 'Nothing yet. The wilds between towns are not safe.');
        for (const n of h.news.slice(-4).reverse()) tally.append(el('p', 'hf-small', `Day ${n.day}: ${n.text}`));
        if (h.deaths) tally.append(el('p', 'hf-small hf-muted', `Fallen ${h.deaths} time${h.deaths === 1 ? '' : 's'}.`));
        page.append(tally);
      } else if (at === 'gear') {
        const worn = section('Worn');
        for (const slot of ['weapon', 'armor', 'charm'] as const) {
          const g = h.gear[slot];
          worn.append(g ? gearRow(g, []) : row(slot[0]!.toUpperCase() + slot.slice(1), 'Nothing.', []));
        }
        page.append(worn);
        const bag = section(`Bag (${h.bag.length})`, 'Foes drop gear; bosses and lair chests drop rare or better. Break down what you do not need for coin and ember shards.');
        if (!h.bag.length) bag.append(el('p', 'hf-muted hf-small', 'Empty.'));
        for (const g of h.bag) {
          const cur = h.gear[slotOf(g)];
          bag.append(gearRow(g, [
            btn('Equip', () => run(() => equip(st, g.id)), { hot: true, id: `hero-equip-${g.id}`, title: cur ? `Instead of ${cur.name}` : '' }),
            btn('Break down', () => run(() => salvage(st, g.id))),
          ]));
        }
        page.append(bag);
      } else {
        const sv = new Map(skillsView(st).map((v) => [v.id, v]));
        const slots = section('On your keys', h.slots.map((id, i) => `${'QRF'[i]}: ${id ? SKILLS.find((x) => x.id === id)?.name : 'empty'}`).join(' · ') + ' · Shift: dodge');
        page.append(slots);
        for (const [b, name] of Object.entries(BRANCHES)) {
          const sec = section(name);
          for (const k of SKILLS.filter((x) => x.branch === b)) {
            const v = sv.get(k.id)!;
            const nums = [k.mult ? `${Math.round(atRank(k.mult, Math.max(1, v.rank)) * 100)}% damage` : '', k.heal ? `heals ${Math.round(atRank(k.heal, Math.max(1, v.rank)) * 100)}%` : '', `${k.spark} spark`, `${k.cd}s`].filter(Boolean).join(' · ');
            const buttons = [btn(v.rank ? 'Rank up' : 'Learn', () => run(() => learn(st, k.id)), { disabled: !v.canLearn, hot: v.canLearn, id: `hero-learn-${k.id}`, title: v.why })];
            if (v.rank) for (let i = 0; i < 3; i++) buttons.push(btn('QRF'[i]!, () => run(() => assign(st, i, k.id)), { disabled: h.slots[i] === k.id }));
            sec.append(row(`${k.name} ${v.rank ? `(rank ${v.rank}/${k.max})` : ''}`, `${k.desc} ${nums}. ${v.rank ? '' : `Needs level ${k.level}.`}`, buttons, v.rank ? 'is-done' : h.level < k.level ? 'is-locked' : ''));
          }
          page.append(sec);
        }
      }
      body.append(page, el('p', 'hf-note hf-small hf-works-msg', message));
      body.scrollTop = scroll;
    },
  };
  return def;
}

function gearRow(g: GearItem, buttons: HTMLButtonElement[]): HTMLElement {
  const r = row(g.name, `${rarityRow(g.rarity).name} ${baseRow(g.base)?.name.toLowerCase() ?? ''} · item level ${g.level} · ${describe(g).join(' · ')}`, buttons);
  (r.querySelector('strong') as HTMLElement).style.color = rarityRow(g.rarity).color;
  return r;
}

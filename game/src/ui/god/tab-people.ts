/** People: a searchable census of everyone in the world, and an inspector that edits any of them. */
import { companyOf, householdOf, purseOf } from '../../sim/economy';
import { jobOf } from '../../sim/goods/jobs';
import type { PersonState } from '../../sim/types/runtime';
import type { God, Tab } from './types';
import { bar, btn, card, el, num, pill, row, table } from './ui';

type Memo = { q: string; town: string; sel?: string; sort: string; desc: boolean };

const teleportTo = (id: string): boolean => {
  const dev = (window as unknown as { __hearth?: { dev?: { teleportTo?: (id: string) => boolean } } }).__hearth?.dev;
  return !!dev?.teleportTo?.(id);
};

export const peopleTab: Tab = {
  id: 'people',
  label: 'People',
  render(g, body) {
    const st = g.state();
    if (!st) return;
    const m = (g.memo.people ??= { q: '', town: '', sort: 'flame', desc: false }) as Memo;
    const t = g.threshold();
    const all = Object.values(st.people);
    const towns = [...new Set(all.map((p) => p.townId ?? '-'))].sort();

    const search = el('input');
    search.placeholder = 'Search name, id, wound, tag…';
    search.id = 'god-people-q';
    search.value = m.q;
    search.addEventListener('keydown', (e) => e.stopPropagation());
    search.addEventListener('input', () => { m.q = search.value; g.rerender(); requestAnimationFrame(() => { const s = document.getElementById('god-people-q') as HTMLInputElement | null; s?.focus(); s?.setSelectionRange(s.value.length, s.value.length); }); });
    const town = el('select');
    town.append(new Option('All towns', ''), ...towns.map((x) => new Option(x, x)));
    town.value = m.town;
    town.addEventListener('change', () => { m.town = town.value; g.rerender(); });

    const q = m.q.toLowerCase();
    const rows = all.filter((p) => (!m.town || (p.townId ?? '-') === m.town) && (!q || [p.id, p.name, p.woundId, ...(p.tags ?? [])].some((s) => s?.toLowerCase().includes(q))));
    body.append(row(search, town, el('span', 'dim', `${rows.length} of ${all.length}`),
      btn(`Kindle these ${rows.length}`, () => { for (const p of rows) p.flame = Math.max(p.flame, t + 10); g.commit(`Kindled ${rows.length}`); }),
      btn('Snuff these', () => { for (const p of rows) p.flame = 0; g.commit(`Snuffed ${rows.length}`); }, 'danger')));

    const split = el('div', 'g-split');
    split.append(table<PersonState>(rows, [
      { key: 'name', label: 'Name', get: (p) => p.name ?? p.id },
      { key: 'town', label: 'Town', get: (p) => p.townId ?? '-' },
      { key: 'flame', label: 'Flame', get: (p) => { const d = el('span'); d.append(`${Math.round(p.flame)} `, p.flame >= t ? pill('lit', 'ok') : ''); return d; }, sort: (p) => p.flame },
      { key: 'bar', label: '', get: (p) => bar(p.flame / 100, p.flame >= t ? '#7fb069' : '#F2B84B'), sort: (p) => p.flame },
      { key: 'wound', label: 'Wound', get: (p) => p.woundId ?? '' },
      { key: 'job', label: 'Job', get: (p) => jobOf(st, p.id).name },
      { key: 'age', label: 'Age', get: (p) => p.age ?? '' , sort: (p) => p.age ?? 0 },
      { key: 'marks', label: 'Marks', get: (p) => (p.marks ?? []).map((k) => k.markId).join(', '), sort: (p) => p.marks?.length ?? 0 },
    ], {
      onRow: (p) => { m.sel = p.id; g.rerender(); },
      selected: (p) => p.id === m.sel,
      sortKey: m.sort, desc: m.desc,
      onSort: (k, d) => { m.sort = k; m.desc = d; g.rerender(); },
    }));
    split.append(inspector(g, m.sel ? st.people[m.sel] : undefined));
    body.append(split);
  },
};

function inspector(g: God, p: PersonState | undefined): HTMLElement {
  if (!p) return card('Inspector', el('p', 'dim', 'Pick someone from the census.'));
  const st = g.state()!;
  const t = g.threshold();
  const co = companyOf(st, p.id);
  const hh = householdOf(st, p.id);
  const marks = el('div', 'g-row');
  for (const mk of p.marks ?? []) {
    marks.append(pill(`${mk.markId} ×${mk.stacks}`, 'gold'), btn('✕', () => { p.marks = (p.marks ?? []).filter((x) => x !== mk); g.commit(`Removed ${mk.markId}`); }, 'danger'));
  }
  const addMark = el('input');
  addMark.placeholder = 'mark id (e.g. resentment)';
  addMark.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key !== 'Enter' || !addMark.value.trim()) return;
    const id = addMark.value.trim();
    const have = (p.marks ??= []).find((x) => x.markId === id);
    if (have) have.stacks += 1; else p.marks.push({ markId: id, stacks: 1 });
    g.commit(`Marked ${p.name ?? p.id}: ${id}`);
  });
  const tags = el('input');
  tags.value = (p.tags ?? []).join(', ');
  tags.addEventListener('keydown', (e) => e.stopPropagation());
  tags.addEventListener('change', () => { p.tags = tags.value.split(',').map((s) => s.trim()).filter(Boolean); g.commit('Tags saved'); });
  const purse = purseOf(st, p.id);

  return card(p.name ?? p.id,
    el('div', 'dim', `${p.id} · ${p.townId ?? 'no town'}${p.siteId ? ` · ${p.siteId}` : ''}`),
    row(el('span', 'dim', 'Flame'), num(p.flame, (n) => { p.flame = Math.max(0, n); g.commit(`Flame ${n}`); }, { min: 0, max: 200 }),
      btn('Reignite', () => { p.flame = Math.max(p.flame, t + 10); g.commit(`${p.name} reignited`); }, 'hot'),
      btn('Snuff', () => { p.flame = 0; g.commit(`${p.name} snuffed`); }, 'danger')),
    row(el('span', 'dim', 'Trust'), num(p.trust ?? 0, (n) => { p.trust = Math.max(0, Math.min(1, n)); g.commit('Trust set'); }, { step: 0.1, min: 0, max: 1 }),
      el('span', 'dim', 'Age'), num(p.age ?? 30, (n) => { p.age = Math.max(0, Math.round(n)); g.commit('Age set'); })),
    row(el('span', 'dim', 'Wound'), el('b', '', p.woundId ?? '—'), el('span', 'dim', 'Job'), el('b', '', jobOf(st, p.id).name)),
    row(el('span', 'dim', 'Purse'), num(purse, (n) => { const c = st.companies ??= { list: [], next: 1, purse: {} }; c.purse[p.id] = Math.max(0, n); g.commit('Purse set'); })),
    el('div', 'dim', co ? `Company: ${co.name} (${co.ownerId === p.id ? 'owner' : 'hand'}, till ${Math.round(co.coin)})` : 'No company'),
    el('div', 'dim', hh ? `Household ${hh.id}: the ${hh.surname} line, ${hh.kids.length} child${hh.kids.length === 1 ? '' : 'ren'}` : 'No household'),
    el('div', 'dim', 'Marks'), marks, addMark,
    el('div', 'dim', 'Tags'), tags,
    row(btn('Go to them', () => { const ok = teleportTo(p.id); g.commit(ok ? `Standing by ${p.name}` : 'They are not drawn right now'); }),
      btn('Copy JSON', () => { void navigator.clipboard?.writeText(JSON.stringify(p, null, 2)).then(() => g.toast('Copied'), () => g.toast('Clipboard refused')); })),
  );
}

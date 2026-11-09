/** Skills: learning ranks with skill points (gated by hero level), and slotting three on Q / R / F. Pure. */
import type { SimState } from '../types/runtime';
import { SKILLS, skillRow } from './data';
import { heroOf } from './hero';

export type SkillView = { id: string; rank: number; canLearn: boolean; why: string };

export function skillsView(state: SimState): SkillView[] {
  const h = heroOf(state);
  return SKILLS.map((s) => {
    const rank = h.skills[s.id] ?? 0;
    const why = rank >= s.max ? 'Mastered.' : h.level < s.level ? `Level ${s.level}.` : h.points.skill <= 0 ? 'No skill points.' : '';
    return { id: s.id, rank, canLearn: !why, why };
  });
}

export function learn(state: SimState, id: string): { ok: boolean; line: string } {
  const h = heroOf(state);
  const s = skillRow(id);
  const v = skillsView(state).find((x) => x.id === id);
  if (!s || !v) return { ok: false, line: 'No such skill.' };
  if (!v.canLearn) return { ok: false, line: v.why };
  h.points.skill--;
  h.skills[id] = (h.skills[id] ?? 0) + 1;
  // A newly learned skill goes into the first empty slot.
  if (h.skills[id] === 1 && !h.slots.includes(id)) { const i = h.slots.indexOf(null); if (i >= 0) h.slots[i] = id; }
  return { ok: true, line: `${s.name} ${h.skills[id] === 1 ? 'learned' : `to rank ${h.skills[id]}`}.` };
}

export function assign(state: SimState, slot: number, id: string | null): { ok: boolean; line: string } {
  const h = heroOf(state);
  if (slot < 0 || slot > 2) return { ok: false, line: 'No such slot.' };
  if (id && !(h.skills[id] ?? 0)) return { ok: false, line: 'You have not learned that.' };
  if (id) h.slots = h.slots.map((x) => (x === id ? null : x));
  h.slots[slot] = id;
  return { ok: true, line: id ? `${skillRow(id)?.name} on ${'QRF'[slot]}.` : `${'QRF'[slot]} cleared.` };
}

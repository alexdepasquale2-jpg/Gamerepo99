import { describe, expect, it } from 'vitest';
import { createPlaySession, type PlaySession } from '../../src/sim';
import { LEGACY_KEY, createSaveSlots, type StorageLike } from '../../src/ui/save-slots';
import { parseAndValidateSave, serializeSave, type SaveBlob } from '../../src/sim/save';

function mem(): StorageLike & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}
const v1: SaveBlob = { version: 1, seed: 7, tick: 4, npcs: [] };

describe('save slots', () => {
  it('round-trips a full v2 blob (hoard, unspoken) through a slot', () => {
    const s = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' }) as PlaySession;
    s.start({ seed: 42, archetypeId: 'marrow' });
    s.tick();
    s.tick();
    const blob = s.saveBlob()!;
    const slots = createSaveSlots(mem());
    expect(slots.write(1, blob, { town: 'x' }).ok).toBe(true);
    const r = slots.read(1);
    expect(r.ok && r.blob).toEqual(JSON.parse(serializeSave(blob)));
    const s2 = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' }) as PlaySession;
    s2.start({ seed: 42, archetypeId: 'marrow' });
    s2.loadBlob((r as { blob: SaveBlob }).blob);
    expect(s2.snapshot().fingerprint).toBe(s.snapshot().fingerprint);
    expect(s2.snapshot().day).toBe(s.snapshot().day);
  });

  it('migrates the legacy key into slot 0 and deletes it only after success', () => {
    const st = mem();
    st.setItem(LEGACY_KEY, JSON.stringify(v1));
    const slots = createSaveSlots(st);
    expect(slots.list().map((m) => m.slot)).toEqual([0]);
    expect(st.getItem(LEGACY_KEY)).toBeNull();
    const failing: StorageLike = { ...st, getItem: (k) => (k === LEGACY_KEY ? JSON.stringify(v1) : null), setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('should not delete'); } };
    expect(() => createSaveSlots(failing).list()).not.toThrow();
  });

  it('survives missing or full storage with a friendly message', () => {
    const none = createSaveSlots(null);
    expect(none.list()).toEqual([]);
    const w = none.write(1, v1);
    expect(!w.ok && w.error).toMatch(/unavailable/);
    const full = createSaveSlots({ getItem: () => null, removeItem: () => undefined, setItem: () => { throw new Error('QuotaExceeded'); } });
    const r = full.write(1, v1);
    expect(!r.ok && r.error).toMatch(/no room/);
  });

  it('autosave never overwrites a manual slot', () => {
    const slots = createSaveSlots(mem());
    slots.write(1, v1);
    slots.write('auto', { ...v1, tick: 9 });
    const a = slots.read(1);
    expect(a.ok && a.blob.tick).toBe(4);
  });
});

describe('validateSave', () => {
  it('rejects non-objects and future versions; v1 minimal loads', () => {
    expect(parseAndValidateSave('[]').ok).toBe(false);
    expect(parseAndValidateSave('nope').ok).toBe(false);
    const f = parseAndValidateSave(JSON.stringify({ version: 99, seed: 1, tick: 1 }));
    expect(!f.ok && f.error).toMatch(/newer/);
    expect(parseAndValidateSave(JSON.stringify({ version: 1, seed: 1, tick: 2 })).ok).toBe(true);
  });
});

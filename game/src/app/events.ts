import type { EventMap, GameEvents } from './contracts';

/** A tiny typed event hub for one run. */
export function createEvents(): GameEvents {
  const subs = new Map<keyof EventMap, Set<(e: unknown) => void>>();
  return {
    on(name, fn) {
      let set = subs.get(name);
      if (!set) subs.set(name, (set = new Set()));
      set.add(fn as (e: unknown) => void);
      return () => set!.delete(fn as (e: unknown) => void);
    },
    emit(name, e) {
      for (const fn of [...(subs.get(name) ?? [])]) {
        try { fn(e); } catch (err) { console.error(`event ${String(name)} handler failed`, err); }
      }
    },
  };
}

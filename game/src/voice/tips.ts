/**
 * First-encounter tips: each key shows once per world. The seen set lives in localStorage under
 * `hf.voice.tips.<seed>`; storage that is blocked or full just means the set lives for this run only.
 */
const PREFIX = 'hf.voice.tips.';
const MAX_KEYS = 400;

export function createTips(seed: number) {
  const storeKey = `${PREFIX}${seed}`;
  let seen = new Set<string>();
  try {
    const raw = localStorage.getItem(storeKey);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) seen = new Set(arr.filter((k): k is string => typeof k === 'string'));
  } catch { /* blocked or corrupt: start empty */ }

  const save = (): void => {
    try { localStorage.setItem(storeKey, JSON.stringify([...seen].slice(-MAX_KEYS))); } catch { /* blocked or full */ }
  };

  return {
    /** True the first time a key is asked about in this world (and remembers it). */
    first(key: string): boolean {
      if (seen.has(key)) return false;
      seen.add(key);
      save();
      return true;
    },
    seen: (key: string): boolean => seen.has(key),
  };
}

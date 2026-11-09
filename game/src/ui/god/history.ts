/** Records the world's vitals at every dawn (and on demand) for the god menu's charts and the event feed. */
import type { GameContext } from '../../app/contracts';
import type { SimState } from '../../sim/types/runtime';
import type { JuiceLine, Sample } from './types';

const MAX_SAMPLES = 400;
const MAX_JUICE = 600;

export function threshold(st: SimState | undefined): number {
  return ((st?.data as { reigniteThreshold?: number } | undefined)?.reigniteThreshold) ?? 35;
}

export function sample(st: SimState): Sample {
  const people = Object.values(st.people ?? {});
  const t = threshold(st);
  const towns = Object.values(st.towns ?? {});
  let goods = 0;
  for (const l of Object.values(st.villageEconomy?.towns ?? {})) for (const q of Object.values(l.goods)) goods += q;
  return {
    day: st.day,
    spark: st.player.spark,
    coin: st.inventory?.coin ?? st.player.coin ?? 0,
    people: people.length,
    avgFlame: people.length ? people.reduce((n, p) => n + p.flame, 0) / people.length : 0,
    lit: people.filter((p) => p.flame >= t).length,
    goods: Math.round(goods),
    carts: st.logistics?.carts.length ?? 0,
    wars: (st.polity?.wars ?? []).filter((w) => w.status === 'active').length,
    despair: towns.length ? towns.reduce((n, x) => n + (x.despair ?? 0), 0) / towns.length : 0,
    households: st.kin?.households.length ?? 0,
    plans: (st.build?.plans ?? []).filter((p) => p.stage === 'gathering' || p.stage === 'building').length,
  };
}

/** Add a sample, replacing one already taken for the same day; keeps the newest MAX_SAMPLES. */
export function pushSample(history: Sample[], s: Sample): void {
  const last = history[history.length - 1];
  if (last && last.day === s.day) history[history.length - 1] = s;
  else history.push(s);
  if (history.length > MAX_SAMPLES) history.splice(0, history.length - MAX_SAMPLES);
}

export function recordHistory(ctx: GameContext, history: Sample[], juice: JuiceLine[]): () => void {
  let n = 0;
  const take = (): void => {
    const st = ctx.session.getState();
    if (!st) return;
    pushSample(history, sample(st));
  };
  const offs = [
    ctx.events.on('dawn', take),
    // A load or new world: keep only samples up to the day we are on now (a fast-forward keeps them all).
    ctx.events.on('state-replaced', () => {
      const day = ctx.session.getState()?.day ?? 0;
      const keep = history.filter((s) => s.day <= day);
      history.splice(0, history.length, ...keep);
      take();
    }),
    ctx.session.onJuice((id, payload) => {
      juice.push({ n: ++n, day: ctx.session.getState()?.day ?? 0, id, payload });
      if (juice.length > MAX_JUICE) juice.splice(0, juice.length - MAX_JUICE);
    }),
  ];
  take();
  return () => offs.forEach((f) => f());
}

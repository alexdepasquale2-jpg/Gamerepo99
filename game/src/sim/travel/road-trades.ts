/**
 * Travellers for hire at a road's end (economy/travel-trades.json; formulas: road-content-design §3.2).
 * Offers are seeded per seed/day/town/route. A crooked traveller looks like the honest one it poses as:
 * the same role, the same quoted price and days. Only its tells differ. Pure: no Phaser/DOM/Math.random.
 */
import tradesJson from '../../data/economy/travel-trades.json';
import namesJson from '../../data/people/names.json';
import { deriveRng, type Rng } from '../rng';
import type { TravelRoute, TravelSimState } from './travel-types';

export type TradeLean = 'good' | 'mixed' | 'bad';

export type TravelTrade = {
  id: string;
  role: string;
  lean: TradeLean;
  baseSpark: number;
  baseCoin: number;
  speedMul: number;
  trustBias: number;
  routeIds: string[];
  tells: string[];
  poseAs?: string;
  hostile?: boolean;
  ambushAfterHire?: boolean;
  lieDays?: boolean;
  conditionHit?: number;
  revealAtTrustBelow?: number;
  exposureAdd?: number;
  encounterRerollBad?: boolean;
  packetDaysMul?: number;
  highwaymanWeightMul?: number;
  requiresPersonBurning?: string;
};

export type RoadVoice = {
  roles: Record<string, string>;
  tells: Record<string, string>;
  outcome: Record<string, string>;
  highwayman: { id: string; weight: number; blurb: string; heard: string; tags: string[] };
};

/** One traveller offering to take you down one road today. Never carries the lean. */
export type RoadOffer = {
  tradeId: string;
  name: string;
  /** What they say they are (the posed role for a crooked one, unless you've been cheated by them before). */
  roleLabel: string;
  tells: string[];
  tellLines: string[];
  spark: number;
  coin: number;
  days: number;
  /** True once this traveller has cheated you: you see them for what they are. */
  known: boolean;
};

/** Saveable road memory (optional on SimState; old saves have none). */
export type RoadMemory = {
  /** Trade ids that have cheated the player; their offers show their true role and every tell. */
  cheatedBy?: string[];
  journeys?: number;
};

const doc = tradesJson as unknown as { trades: TravelTrade[]; voice: RoadVoice };
const GIVEN = (namesJson as { given?: string[] }).given ?? ['Tam'];

export const loadTravelTrades = (): TravelTrade[] => doc.trades;
export const roadVoice = (): RoadVoice => doc.voice;

export const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** "{name} set you down at {to}" -> filled. */
export function fill(template: string | undefined, vars: Record<string, string | number>): string {
  return (template ?? '').replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

export function roadMemory(state: TravelSimState): RoadMemory {
  return ((state as { road?: RoadMemory }).road ??= {});
}

function routeCondition(state: TravelSimState, routeId: string): number {
  const r = state.economyRoutes?.find((x) => x.id === routeId);
  return r ? clamp01(r.condition) : 1;
}

/** A trade belongs on a road if it names it, or if it names no road in this world (authored for another map). */
export function tradeServesRoute(trade: TravelTrade, route: TravelRoute, liveRouteIds: ReadonlySet<string>): boolean {
  if (trade.routeIds.includes(route.id)) return true;
  return !trade.routeIds.some((id) => liveRouteIds.has(id));
}

/** §3.2 trust: despair, legitimacy, road condition and notoriety (bad leans read notoriety at half). */
export function tradeTrust(state: TravelSimState, trade: TravelTrade, route: TravelRoute): number {
  const town = state.towns?.[state.player.townId ?? ''];
  const despair = clamp01(town?.despair ?? 0);
  const legit = 0.4;
  const cond = routeCondition(state, route.id);
  const noto = clamp01((state as { hoard?: { notoriety?: number } }).hoard?.notoriety ?? 0);
  return clamp01(0.25 + trade.trustBias + 0.35 * (1 - despair) + 0.2 * legit + 0.15 * cond - 0.2 * noto * (trade.lean === 'bad' ? 0.5 : 1));
}

/** §3.2 reliability: how often this traveller's day goes wrong ((1 - reliability) * failChanceMul). */
export function tradeReliability(state: TravelSimState, trade: TravelTrade, route: TravelRoute): number {
  return clamp01(tradeTrust(state, trade, route) * routeCondition(state, route.id) * (trade.lean === 'good' ? 1 : 0.75));
}

export function tradePrice(trade: TravelTrade, trust: number, sizeMul: number): { spark: number; coin: number } {
  return {
    spark: Math.ceil(trade.baseSpark * (1.45 - 0.7 * trust) * sizeMul),
    coin: Math.ceil(trade.baseCoin * (1.55 - 0.8 * trust)),
  };
}

/** Days on the road with this speed; at least one. */
export const hiredDays = (walkDays: number, speedMul: number): number => Math.max(1, Math.round(walkDays * speedMul));

/** The honest trade a crooked one poses as (its price and pace are what the crooked one quotes). */
export function posedAs(trade: TravelTrade): TravelTrade | undefined {
  if (!trade.poseAs) return undefined;
  return doc.trades.find((t) => t.lean === 'good' && t.role === trade.poseAs);
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Anyone who would take you along this road at all (an open highwayman is a danger, not a hire). */
export function hireableTrades(state: TravelSimState, route: TravelRoute): TravelTrade[] {
  const live = new Set((state.routes ?? []).map((r) => r.id));
  return doc.trades.filter((t) => {
    if (t.hostile && !t.poseAs) return false;
    if (t.requiresPersonBurning && !((state.people[t.requiresPersonBurning]?.flame ?? 0) > 0)) return false;
    return tradeServesRoute(t, route, live);
  });
}

export type OfferCtx = { walkDays: number; sizeMul: number };

/** 1–3 travellers on this road today, seeded by seed/day/town/route. */
export function roadOffers(state: TravelSimState, route: TravelRoute, ctx: OfferCtx): RoadOffer[] {
  const pool = hireableTrades(state, route);
  if (!pool.length) return [];
  const rng = deriveRng(state.seed, 'road-offers', state.day, state.player.townId ?? '', route.id);
  const n = Math.min(pool.length, 1 + Math.floor(rng.next() * 3));
  const cheated = new Set(roadMemory(state).cheatedBy ?? []);
  const voice = doc.voice;
  const usedNames = new Set<string>();
  return shuffle(pool, rng)
    .slice(0, n)
    .map((trade) => {
      const front = posedAs(trade) ?? trade;
      const known = cheated.has(trade.id);
      const trust = tradeTrust(state, trade, route);
      // Everyone lets two tells show; a low-trust crook can't hide the worst one.
      let tells = shuffle(trade.tells, rng).slice(0, 2);
      if (trade.revealAtTrustBelow !== undefined && trust < trade.revealAtTrustBelow && !tells.includes(trade.tells[0]!)) {
        tells = [...tells.slice(0, 1), trade.tells[0]!];
      }
      if (known) tells = [...trade.tells];
      let name = GIVEN[Math.floor(rng.next() * GIVEN.length)]!;
      while (usedNames.has(name)) name = GIVEN[(GIVEN.indexOf(name) + 1) % GIVEN.length]!;
      usedNames.add(name);
      // Quote: a crook quotes the honest price and pace of what it poses as (the lie is the point).
      const quote = tradePrice(front, tradeTrust(state, front, route), ctx.sizeMul);
      const days = hiredDays(ctx.walkDays, Math.min(trade.speedMul, front.speedMul));
      return {
        tradeId: trade.id,
        name,
        roleLabel: voice.roles[known ? trade.role : front.role] ?? front.role,
        tells,
        tellLines: tells.map((t) => voice.tells[t] ?? t.replace(/_/g, ' ')),
        spark: quote.spark,
        coin: quote.coin,
        days,
        known,
      };
    });
}

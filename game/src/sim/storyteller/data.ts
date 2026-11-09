/** The storyteller's table (data/systems/storytellers.json) and its types. */
import table from '../../data/systems/storytellers.json';
import type { HappeningWhen } from '../happening-world';

export type IncidentKind = 'threat' | 'boon' | 'twist' | 'omen';
export type DrawKind = IncidentKind | 'everyday' | 'arc';
export type Family = 'despair' | 'bandit' | 'beast' | 'rival';
export type Op =
  | { op: 'despair'; add: number }
  | { op: 'food'; days: number }
  | { op: 'stock'; mul: number }
  | { op: 'restore' }
  | { op: 'flame'; add: number; share: number; pick: 'lit' | 'unlit' | 'any' }
  | { op: 'spark'; add: number }
  | { op: 'coin'; add: number }
  | { op: 'item'; id: string; qty: number }
  | { op: 'route'; break?: boolean; mend?: boolean }
  | { op: 'settle'; n: number; flame?: number }
  | { op: 'feud'; add: number }
  | { op: 'happening'; id: string }
  | { op: 'pressure'; family: Family; need: number };
/** What must hold in the town at an incident's deadline for it to end well. */
export type ResolveWhen = { foodCoverAtLeast?: number; litAtLeast?: number; despairBelow?: number };
export type Resolve = { by: 'rout' | 'when'; when?: ResolveWhen; win: Op[]; winLines: string[]; lose: Op[]; loseLines: string[] };
export type Incident = {
  id: string; name: string; kind: IncidentKind; weight: number; cost: number; tension: number;
  minDay?: number; cooldown?: number; days?: number; arcOnly?: boolean; where?: 'here';
  when?: HappeningWhen; ops: Op[]; say: string[]; news: string[]; board?: string; resolve?: Resolve;
};
export type ArcStep = { after: number; incident?: string; won?: string; lost?: string };
export type Arc = { id: string; name: string; weight: number; cost: number; minDay?: number; cooldown?: number; blurb: string; steps: ArcStep[] };
export type Phase = { next: string; days: [number, number]; chance: number; kinds: Partial<Record<DrawKind, number>> };
export type Teller = {
  id: string; name: string; title: string; blurb: string;
  minGap: number; threatMul: number; tensionCap: number; tensionDecay: number; income: number; mercy: boolean;
  phases: Record<string, Phase>;
};
export type StoryTuning = {
  pointsStart: number; pointsCap: number; wealthCoin: number; wealthMax: number; dayRamp: number; intensity: [number, number];
  novelty: [number, number]; noveltySpan: [number, number]; mercySpark: number; mercyDespair: number; logKeep: number;
  pressureChance: number; pressureForce: number;
};
type Table = { tuning: StoryTuning; tellers: Teller[]; phaseLines: Record<string, string>; incidents: Incident[]; arcs: Arc[] };

export const STORY = table as unknown as Table;
export const TELLERS = STORY.tellers;
export const DEFAULT_TELLER = TELLERS[0]!.id;
export const tellerById = (id: string | undefined): Teller => TELLERS.find((t) => t.id === id) ?? TELLERS[0]!;
export const incidentById = (id: string | undefined): Incident | undefined => STORY.incidents.find((i) => i.id === id);
export const arcById = (id: string | undefined): Arc | undefined => STORY.arcs.find((a) => a.id === id);

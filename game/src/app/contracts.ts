/**
 * The contract every front-end area builds to. One GameContext is created per run; the shell calls each
 * area's attach function in this order and stores its API on the context:
 *
 *   world → actors → voice → ui → panels → interact
 *
 * An area may call any other area's API at runtime through `ctx` (never at import time), so attach order
 * only matters for what exists during attach itself. Areas never import each other's files: only this file,
 * `app/*`, `sim/*` and `data/*`. Extending an API: add to the interface here and say so in the PR.
 */
import type Phaser from 'phaser';
import type { PlaySession } from '../sim/play-session/play-session-types';
import type { Target, TargetKind } from '../sim/play-session/targets';
import type { ActOutcome } from '../sim/play-session/action-providers';
import type { WorldLayout } from '../sim/map/world-layout';
import type { Navigator } from '../sim/map/nav';

export type Pt = { x: number; y: number };
export type Tile = { q: number; r: number };

/**
 * Something in the world the player can focus, tap and act on. `key` is `${kind}:${id}` (people: `person:<id>`).
 * `target` is what goes to session.listVerbs / session.act. x, y is the thing's foot in world px.
 */
export interface Thing {
  key: string;
  kind: TargetKind;
  id: string;
  x: number;
  y: number;
  /** Short name shown in the world prompt ("Marta", "Noticeboard", "Oak"). */
  label: string;
  target: Target;
  /** How close (world px) the player must be to act on it; default 48. */
  reach?: number;
}

/** Front-end events between areas. The sim's own juice stream is session.onJuice. */
export type EventMap = {
  /** An act resolved (after session.act). */
  act: { actionId: string; target: Target; outcome?: ActOutcome };
  /** A rest began (fade out) / finished with the new day's dawn lines. */
  'rest-start': Record<string, never>;
  dawn: { day: number; lines: string[] };
  'room-enter': { buildingId: string };
  'room-leave': { buildingId: string };
  focus: { thing: Thing | null };
  /** The held item changed (satchel / hotbar / tap). */
  'held-item': { itemId: string | null };
  /** Inventory, coin or stash changed: panels and HUD redraw. */
  inventory: Record<string, never>;
  /** Something blocking opened or closed (sheet, menu, modal, ring). */
  overlay: { open: boolean };
  /** After a load or a new world: areas rebuild from session state. */
  'state-replaced': Record<string, never>;
  /** The player arrived in a town (walking or by road). */
  arrive: { townId: string };
};
export interface GameEvents {
  on<K extends keyof EventMap>(name: K, fn: (e: EventMap[K]) => void): () => void;
  emit<K extends keyof EventMap>(name: K, e: EventMap[K]): void;
}

export interface WorldApi {
  /** Navigation over walkable tiles (paths, snapping). */
  nav: Navigator;
  /** World px of a tile's foot; the tile under a point. */
  foot(t: Tile): Pt;
  tileOf(p: Pt): Tile;
  passable(p: Pt): boolean;
  /** Where to stand on arriving in a town. */
  spawnPoint(townId: string): Pt;
  townAt(p: Pt): string | null;
  /** Interactable world things near a point: nodes, boards, signposts, facilities, doors, hearths, chests, ground items, plots, graves, the tile in front of the player. */
  things(near: Pt, radius: number, facing?: { dx: number; dy: number }): Thing[];
  /** Redraw world things after the sim changed them (gathered node, new edit, chest, ground item, plot). */
  refresh(what?: 'nodes' | 'chests' | 'ground' | 'plots' | 'edits' | 'all'): void;
  /** Day clock 0..1 (0 dawn, 0.5 noon, 0.75 dusk). */
  phase(): number;
  setPhase(p01: number): void;
  /** Interiors: the room the player is in, or null outdoors. */
  room(): { buildingId: string; townId: string; kind: string } | null;
  enterRoom(buildingId: string): boolean;
  leaveRoom(): void;
  update(dt: number, player: Pt): void;
}

export interface PlayerHandle {
  pos(): Pt;
  setPos(p: Pt): void;
  facing(): { dx: number; dy: number };
  /** Walk to a point along the nav (tap-to-walk); resolves on arrival or interruption. */
  walkTo(p: Pt): Promise<boolean>;
  stop(): void;
  /** Freeze input-driven movement (rest, travel, modal). */
  setFrozen(frozen: boolean): void;
}

export interface ActorsApi {
  player: PlayerHandle;
  /** Head position (world px) of a person, or of the player with 'player'. */
  headOf(id: string): Pt | undefined;
  /** People, animals, wagons near a point, as Things. */
  things(near: Pt, radius: number): Thing[];
  /** Rebuild people from session state (dawn newcomers, deaths, load). */
  sync(): void;
  update(dt: number): void;
}

export type SayOpts = { tone?: 'warm' | 'plain' | 'hard'; ms?: number };
export interface VoiceApi {
  /** A line spoken by a person (bubble over their head); 'player' speaks as the inhabitant. */
  say(personId: string, line: string, opts?: SayOpts): void;
  /** A short tell over a head or point (feedback, refusal, "can't reach"). */
  tell(text: string, at?: string | Pt): void;
  /** A first-encounter tip at a thing, once per save per key. */
  tip(key: string, text: string, at: string | Pt): void;
  /** Speak the dawn's lines through the people who carry them, one at a time; resolves when done. */
  dawn(lines: string[]): Promise<void>;
  sfx(cue: 'reignite' | 'letter' | 'dawn' | 'despair' | 'act' | 'refuse' | 'pickup' | 'open' | 'close'): void;
  mood(m: 'day' | 'dusk' | 'night' | 'despair' | 'reignite'): void;
  /** The last line or tell shown (dev/QA). */
  last(): string;
}

export interface SheetDef {
  id: string;
  title: string;
  /** Fill the sheet body; called on open and on refresh(). */
  render(body: HTMLElement): void;
  onClose?(): void;
}
export interface SheetHandle {
  close(): void;
  refresh(): void;
  isOpen(): boolean;
}
export interface UiApi {
  hud: {
    spark(v01: number): void;
    day(day: number, phase01: number): void;
    letters(unread: number): void;
    purse(coin: number): void;
  };
  /** One side sheet at a time (≤ 40% width on desktop; docked under the canvas on a tall phone). */
  sheet(def: SheetDef): SheetHandle;
  /** A centred menu (pauses the game). */
  menu(opts: { id: string; title: string; items: { id: string; label: string; hint?: string; disabled?: boolean }[]; onPick(id: string): void; onBack?(): void }): void;
  /** True while a sheet, menu or modal blocks world input. */
  blocking(): boolean;
  /** Touch bar: the Act button's label follows the focused thing (null hides it). */
  setActLabel(label: string | null): void;
}

export interface PanelsApi {
  satchel: { toggle(): void; held(): string | null; hold(itemId: string | null): void };
  board: { open(townId: string, page?: string | number): void };
  trade: { open(caravanId: string): void };
  letters: { open(): void };
  map: { toggle(): void };
  roads: { open(townId: string): void };
  closeAll(): void;
  anyOpen(): boolean;
}

export interface InteractApi {
  focus(): Thing | null;
  /** Open the ring on a thing (the focused one by default). */
  open(thing?: Thing): void;
  close(): void;
  isOpen(): boolean;
  /** Act a verb on a thing through session.act, then present the outcome. */
  act(thing: Thing, verbId: string): ActOutcome | undefined;
}

export interface GameContext {
  scene: Phaser.Scene;
  session: PlaySession;
  events: GameEvents;
  layout: WorldLayout;
  seed: number;
  /** Save the run now (dawn autosave and manual saves). */
  autosave(): void;
  /** Rest until dawn (the hearth's Rest verb): fade, dusk + dawn in the sim, people speak the dawn. App-owned. */
  rest(): Promise<void>;
  /** Put the player in a town (after a road journey, or a load). App-owned. */
  arriveAt(townId: string): void;
  world: WorldApi;
  actors: ActorsApi;
  voice: VoiceApi;
  ui: UiApi;
  panels: PanelsApi;
  interact: InteractApi;
}

/** What the title flow (ui/flow.ts) needs from the app to start, stop and pause a run. */
export interface AppHooks {
  start(session: PlaySession, autosave: () => void): void;
  stop(): void;
  setPaused(paused: boolean): void;
}

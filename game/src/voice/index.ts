/**
 * VOICE area: everything the sim says reaches the player through people and the world. Speech bubbles over
 * named people, tells over heads, first-encounter tips, the dawn spoken by its carriers, the juice stream
 * through people, spark VFX, procedural sound and music. There is no screen-space text log.
 */
import type { GameContext, Pt, SayOpts, VoiceApi } from '../app/contracts';
import { registerDevHook } from '../app/dev-hooks';
import { armUnlock, isMuted, playCue, setMuted, toggleMuted, type Cue } from './audio';
import { createStage, type Anchor, type ShownItem } from './bubbles';
import { speakDawn } from './dawn';
import { createFx } from './fx';
import { attachJuice, type Beat, type JuiceHandle } from './juice';
import { createVoiceLayer } from './layer';
import { createMusic, type Mood } from './music';
import { createPeople } from './people';
import { createTips } from './tips';

/** Night lines held for the morning, at most. */
const MAX_NIGHT = 12;
/** How long an explicit mood() or a swing holds before the clock's mood takes over again (ms). */
const HOLD_MS: Record<Mood, number> = { day: 20000, dusk: 20000, night: 20000, despair: 12000, reignite: 9000 };
const DESPAIR_AT = 0.6;

type Internals = { shown(): ShownItem[]; juice: JuiceHandle; dropped(): number; mood(): Mood };
let current: Internals | null = null;

function clockMood(phase: number): Mood {
  if (phase < 0.68) return 'day';
  if (phase < 0.85) return 'dusk';
  return 'night';
}

export function attachVoice(ctx: GameContext): VoiceApi {
  const scene = ctx.scene;
  const layer = createVoiceLayer(scene);
  const stage = createStage(layer, (id) => headOf(id));
  const people = createPeople(ctx);
  people.setBusy((id) => stage.busy(id));
  const fx = createFx(scene);
  const tips = createTips(ctx.seed);
  const music = createMusic('day');
  const offUnlock = armUnlock();

  let last = '';
  let resting = false;
  let generation = 0;
  let dropped = 0;
  let night: Beat[] = [];
  let pendingBurnout = false;
  let forced: { mood: Mood; until: number } | null = null;
  let wasDespair = false;

  function headOf(id: string): Pt | undefined {
    const h = ctx.actors?.headOf(id);
    if (h || id !== 'player') return h;
    const p = ctx.actors?.player.pos();
    return p ? { x: p.x, y: p.y - 28 } : undefined;
  }
  const anchorOf = (at: string | Pt | undefined): Anchor => {
    if (at === undefined) return 'player';
    if (typeof at !== 'string') return at;
    return headOf(at) ? at : 'player';
  };

  /** A beat over its person; out of sight, someone nearby passes it on; nobody near, it is let go. */
  const speak = (b: Beat, ms?: number): Promise<void> => {
    if (!b.line) return Promise.resolve();
    if (b.personId === 'player') {
      last = b.line;
      return stage.bubble('player', b.line, { tone: b.tone, ms, ember: b.ember });
    }
    const given = people.givenOf(b.personId);
    if (headOf(b.personId)) {
      last = b.line;
      return stage.bubble(b.personId, b.line, { tone: b.tone, ms, ember: b.ember, name: given });
    }
    const via = people.carrier(b.townId ?? people.townOf(b.personId), b.personId);
    if (!via || via === b.personId) {
      dropped++;
      return Promise.resolve();
    }
    const line = given ? `${given} says, "${b.line}"` : b.line;
    last = line;
    return stage.bubble(via, line, { tone: b.tone, ms, name: people.givenOf(via) });
  };

  const sfx = (c: Cue): void => playCue(c);
  const setMood = (m: Mood): void => {
    forced = { mood: m, until: performance.now() + HOLD_MS[m] };
    music.set(m);
  };
  const playBurnout = (): void => {
    if (resting) {
      pendingBurnout = true;
      return;
    }
    pendingBurnout = false;
    fx.burnout(() => {
      const h = headOf('player');
      return h ? { x: h.x, y: h.y + 12 } : ctx.actors.player.pos();
    });
  };

  const juice = attachJuice({
    ctx,
    people,
    fx,
    speak: (b) => speak(b),
    cue: sfx,
    swing: setMood,
    resting: () => resting,
    hold: (b) => {
      night.push(b);
      if (night.length > MAX_NIGHT) night.shift();
    },
    burnout: playBurnout,
  });

  // The clock's mood (day, dusk, night), despair when the player's town has lost heart; swings on top.
  let sincePoll = 0;
  const pollMood = (): void => {
    let despair = 0;
    try {
      const town = people.playerTown();
      despair = town ? ctx.session.townDespair()[town] ?? 0 : 0;
    } catch { /* between states */ }
    const isDespair = despair >= DESPAIR_AT;
    if (isDespair && !wasDespair) sfx('despair');
    wasDespair = isDespair;
    if (forced && performance.now() < forced.until) return;
    forced = null;
    music.set(isDespair ? 'despair' : clockMood(ctx.world?.phase() ?? 0.3));
  };

  const onFrame = (_t: number, delta: number): void => {
    if (resting) return;
    stage.update(Math.min(delta, 100));
    sincePoll += delta;
    if (sincePoll > 1000) {
      sincePoll = 0;
      pollMood();
    }
  };
  scene.events.on('postupdate', onFrame);

  const onKey = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.key !== 'n' && e.key !== 'N')) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    last = toggleMuted() ? 'Sound off.' : 'Sound on.';
    stage.tell(last, 'player');
  };
  window.addEventListener('keydown', onKey);

  const offs = [
    ctx.events.on('rest-start', () => {
      resting = true;
      layer.el.style.visibility = 'hidden';
    }),
    ctx.events.on('dawn', () => {
      resting = false;
      layer.el.style.visibility = 'visible';
      people.refresh();
      if (pendingBurnout) playBurnout();
    }),
    ctx.events.on('arrive', () => people.refresh()),
    ctx.events.on('state-replaced', () => {
      generation++;
      night = [];
      resting = false;
      layer.el.style.visibility = 'visible';
      stage.clear();
      people.refresh();
    }),
  ];

  let gone = false;
  const teardown = (): void => {
    if (gone) return;
    gone = true;
    juice.off();
    for (const off of offs) off();
    scene.events.off('postupdate', onFrame);
    window.removeEventListener('keydown', onKey);
    offUnlock();
    music.stop();
    stage.clear();
    layer.destroy();
    if (current === internals) current = null;
  };
  scene.events.once('shutdown', teardown);
  scene.events.once('destroy', teardown);

  const internals: Internals = { shown: () => stage.shown(), juice, dropped: () => dropped, mood: () => music.current() };
  current = internals;

  return {
    say(personId, line, opts?: SayOpts) {
      void speak({ personId, line, tone: opts?.tone }, opts?.ms);
    },
    tell(text, at) {
      if (!text) return;
      last = text;
      stage.tell(text, anchorOf(at));
    },
    tip(key, text, at) {
      if (!text || !tips.first(key)) return;
      stage.tip(text, anchorOf(at));
    },
    async dawn(lines) {
      resting = false;
      layer.el.style.visibility = 'visible';
      sfx('dawn');
      music.set('day');
      const held = night;
      night = [];
      await speakDawn({ people, speak: (b) => speak(b), generation: () => generation }, lines, held);
    },
    sfx,
    mood: setMood,
    last: () => last,
    muted: () => isMuted(),
    setMuted: (m: boolean) => setMuted(m),
  };
}

registerDevHook('lastSay', (ctx) => () => ctx.voice.last());
registerDevHook('say', (ctx) => (personId: string, line: string) => ctx.voice.say(personId, line));
registerDevHook('voice', () => ({
  /** Bubbles, tells and tips up right now. */
  shown: () => current?.shown() ?? [],
  /** Feed a juice id as if the sim emitted it. */
  feed: (id: string, payload: unknown) => current?.juice.feed(id, payload),
  /** How each recent juice id was presented. */
  log: () => current?.juice.log() ?? [],
  dropped: () => current?.dropped() ?? 0,
  mood: () => current?.mood(),
}));

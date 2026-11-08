/**
 * Proof that every row of the people / voice / hooks / systems data takes effect in play, not just loads.
 * Boots headless play sessions over several seeds and every archetype, drives what a player does (every
 * deed on every person who will take it, work at tasks, carry, travel, rest, body acts, succession) and
 * routes the juice stream through the same presenter the game uses (voice/reaction-lines). Every id the
 * code noted at the moment it took effect (sim/data-use-people noteUse) is compared with the rows of the
 * data files; anything never exercised is listed and the script exits 1.
 *
 * Run: npx vite-node --config game/vite.config.ts game/scripts/coverage-people.mts [--verbose]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectDawnLines } from '../src/sim/dawn-lines';
import { usedIds } from '../src/sim/data-use-people';
import { loadLineFragmentsTable } from '../src/sim/load-fragments';
import { createPlaySession } from '../src/sim/play-session/play-session';
import type { PlaySession } from '../src/sim/play-session/play-session-types';
import type { Target } from '../src/sim/play-session/targets';
import { presentJuice, voiceAbout } from '../src/voice/reaction-lines';
import { drive, type Driver } from './coverage-people-drive';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '../src/data');
const read = (rel: string): Record<string, unknown> => JSON.parse(readFileSync(join(DATA, `${rel}.json`), 'utf8')) as Record<string, unknown>;
const ids = (rows: unknown): string[] => ((rows ?? []) as { id?: string }[]).map((r) => r.id!).filter(Boolean);
const keysOf = (o: unknown, prefix = ''): string[] => Object.keys((o ?? {}) as object).map((k) => prefix + k);
const sectionKeys = (file: string, sections: string[]): string[] => sections.flatMap((s) => keysOf(read(file)[s], `${s}.`));

/** Every row the people / voice / hooks / systems data holds, by the file name noteUse records it under. */
function manifest(): Record<string, string[]> {
  const fb = read('dialogue/surface-fallbacks');
  const hooks = ['civic', 'legacy', 'personal-cost', 'refusal', 'spark-recovery'].flatMap((f) => ids(read(`hooks/${f}`).hooks));
  const traits = read('people/traits');
  const names = read('people/names') as { given: string[]; family: string[] };
  const interior = read('dialogue/interior-lines');
  const scen = (read('systems/scenarios/index') as { files: string[] }).files
    .map((f) => read(`systems/scenarios/${f.replace(/\.json$/, '')}`) as { id: string; specialBar?: string; beat?: unknown })
    .filter((s) => s.specialBar && s.beat).map((s) => s.id);
  return {
    'dialogue/surface-fallbacks': [...keysOf(fb.talk, 'talk.'), ...keysOf(fb.rules, 'rules.')],
    'dialogue/fragments': loadLineFragmentsTable().fragments.map((f) => f.id),
    hooks,
    'systems/interactions/catalog': ids(read('systems/interactions/catalog').interactions),
    'systems/interactions/deeds': ids(read('systems/interactions/deeds').deeds),
    'systems/events': ids(read('systems/events').events),
    'systems/doctrines': [...ids(read('systems/doctrines').doctrines).map((i) => `doctrines.${i}`), ...ids(read('systems/doctrines').acts).map((i) => `acts.${i}`)],
    'systems/marks': ids(read('systems/marks').marks),
    'systems/methods': ids(read('systems/methods').methods),
    'systems/ripples': ['help', 'harm', 'cling', 'crossTown'],
    'systems/wounds': ids(read('systems/wounds').wounds),
    'systems/tasks': sectionKeys('systems/tasks', ['kinds', 'goals']),
    'systems/scenarios': scen,
    'people/traits': ['embodiment', 'perception', 'methodModifiers', 'sparkProfiles', 'statusTraits'].flatMap((k) => ids(traits[k]).map((i) => `${k}.${i}`)),
    'people/archetypes': ids(read('people/archetypes').archetypes),
    'people/body-acts': ids(read('people/body-acts').acts),
    'people/people': ids(read('people/people').people),
    'people/proofs': ids(read('people/proofs').proofs),
    'people/names': [...names.given.map((g) => `given.${g}`), ...names.family.map((f) => `family.${f}`)],
    'people/kinship': ids(read('people/kinship').edges),
    'people/unspoken/classes': ids(read('people/unspoken/classes').classes),
    'people/unspoken/outcomes': [...ids(read('people/unspoken/outcomes-blessings').outcomes), ...ids(read('people/unspoken/outcomes-burdens').outcomes)],
    'dialogue/letters': ids(read('dialogue/letters').templates),
    'dialogue/rumours': sectionKeys('dialogue/rumours', ['outcomes']),
    'dialogue/visitors': sectionKeys('dialogue/visitors', ['reason', 'bound', 'news', 'answers', 'townNews', 'legitimacy']),
    'dialogue/voice-anchors': ids(read('dialogue/voice-anchors').anchors),
    'dialogue/voice-constraints': ids(read('dialogue/voice-constraints').constraints),
    'dialogue/reaction-curves': ids(read('dialogue/reaction-curves').curves),
    'dialogue/generic-voices': sectionKeys('dialogue/generic-voices', ['byWound', 'byJob']),
    'dialogue/history-voice': sectionKeys('dialogue/history-voice', ['openers', 'codas', 'gists', 'kindGists']),
    'dialogue/interior-lines': ['house', 'shop', 'inn', 'office'].flatMap((k) => keysOf(interior[k], `${k}.`)),
    'dialogue/chronicle': sectionKeys('dialogue/chronicle', ['kinds', 'codas', 'events', 'keepByKind']),
    'dialogue/district-letters': sectionKeys('dialogue/district-letters', ['letters', 'gist', 'dawn', 'held', 'fallen', 'broker', 'relation']),
    'dialogue/letter-replies': sectionKeys('dialogue/letter-replies', ['writeDays', 'tones', 'town', 'web', 'postscript']),
  };
}

/** Route one session's juice through the game's presenter, the way voice/juice.ts does. */
function voiced(session: PlaySession): () => void {
  return session.onJuice((id, payload) => {
    const state = session.getState();
    const folk = (townId?: string, exclude?: string): string | undefined =>
      Object.values(state?.people ?? {}).filter((p) => p.townId === (townId ?? state?.player.townId) && p.id !== exclude).map((p) => p.id).sort()[0];
    presentJuice(id, payload, { nearbyPersonId: folk, about: (pid, townId) => voiceAbout(state, pid, townId, (t) => t) });
  });
}

const SEEDS = [42, 7, 3, 11, 19, 23, 5, 31];
/** Sessions that then live on quietly for this many more dawns (rare dawn talk: old stories, far news). */
const LONG_TAIL: Record<string, number> = { '42:marrow': 70, '7:ivy_quill': 70 };

/**
 * Juice whose payload always brings its own line from the sim; the presenter's fallback key speaks only
 * when that line comes back empty. Fed once each with no line, through the same presenter, after play.
 */
const FALLBACK_GUARDS: Record<string, (personId: string, townId: string) => Record<string, unknown>> = {
  'person.reaction': (personId) => ({ personId }),
  'letter.deliver': (personId) => ({ toPersonId: personId }),
  'rumor.spread': (personId) => ({ toPersonId: personId }),
  'kin.birth': (personId) => ({ personId }),
  'kin.grown': (personId) => ({ personId }),
  'patron.offer': (personId) => ({ personId }),
  'happening.start': (personId, townId) => ({ personId, townId }),
  'legend.heard': (personId) => ({ personId }),
  'grave.found': (_p, townId) => ({ townId }),
  'encounter.spawn': (personId, townId) => ({ personId, townId, encounterId: 'cov' }),
};

/**
 * Rows that guard against content that does not exist yet (voice constraints forbid fragment tags no
 * authored line carries): they can only take effect on a bad line, so play never trips them. Their rule
 * is proven against fixture lines in game/tests/assertions.test.ts instead.
 */
const GUARD_ROWS: Record<string, string[]> = {
  'dialogue/voice-constraints': ['vc_no_warm_bite_spike', 'vc_no_cheerful_grief', 'vc_child_after_shame'],
};
const errors: string[] = [];
const ARCHES = ['marrow', 'ivy_quill', 'basilisk_brood', 'ash_widow_bren'];
const verbose = process.argv.includes('--verbose');

for (const seed of SEEDS) {
  for (const archetypeId of ARCHES) {
    const session = createPlaySession({ mode: 'play', seed, archetypeId }) as PlaySession;
    session.start({ seed, archetypeId });
    const off = voiced(session);
    const driver: Driver = {
      session,
      dawn: () => void collectDawnLines(session.getState()!),
      act: (id: string, t?: Target) => {
        try { return session.act(id, t); } catch (err) { errors.push(`${seed}/${archetypeId} ${id}: ${(err as Error).message}`); return undefined; }
      },
    };
    drive(driver, { seed, archetypeId });
    for (let i = 0; i < (LONG_TAIL[`${seed}:${archetypeId}`] ?? 0); i++) { session.wait(1); driver.dawn(); }
    if (seed === SEEDS[0] && archetypeId === ARCHES[0]) {
      const st = session.getState()!;
      const who = Object.values(st.people).find((p) => p.townId === st.player.townId)!;
      const about = (pid: string, townId?: string) => voiceAbout(st, pid, townId, (t) => t);
      for (const [id, payload] of Object.entries(FALLBACK_GUARDS)) presentJuice(id, payload(who.id, who.townId!), { nearbyPersonId: () => who.id, about });
    }
    off();
  }
}

// Many more worlds, briefly: each world draws its own history beats, so walk up to every soul in each
// and ask about the old days (the chip names the story, the bubble tells it) until nobody has one left.
for (let seed = 100; seed < 140; seed++) {
  const session = createPlaySession({ mode: 'play', seed, archetypeId: 'marrow' }) as PlaySession;
  session.start({ seed, archetypeId: 'marrow' });
  for (const p of session.listPeople()) {
    for (let k = 0; k < 4; k++) {
      const ask = session.listVerbs({ kind: 'person', id: p.id }).find((v) => v.id.startsWith('ask_past@'));
      if (!ask) break;
      session.act(ask.id, { kind: 'person', id: p.id });
    }
  }
}

const used = usedIds();
let missing = 0;
const lines: string[] = [];
for (const [file, all] of Object.entries(manifest())) {
  const got = used.get(file) ?? new Set<string>();
  const left = all.filter((id) => !got.has(id) && !GUARD_ROWS[file]?.includes(id));
  if (GUARD_ROWS[file]) lines.push(`guard ${file}: ${GUARD_ROWS[file]!.join(', ')} (rule proven in game/tests/assertions.test.ts)`);
  missing += left.length;
  lines.push(`${left.length ? 'MISS' : ' ok '} ${file}: ${all.length - left.length}/${all.length}${left.length ? `  uncovered: ${(verbose ? left : left.slice(0, 40)).join(', ')}${!verbose && left.length > 40 ? ` (+${left.length - 40})` : ''}` : ''}`);
}
console.log(lines.join('\n'));
for (const e of errors) console.error(`act threw: ${e}`);
missing += errors.length;
console.log(missing ? `coverage-people: ${missing} row(s) never took effect` : 'coverage-people: ok, every row took effect in play');
process.exit(missing ? 1 : 0);

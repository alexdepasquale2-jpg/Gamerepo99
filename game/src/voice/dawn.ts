/**
 * The morning, spoken by the people who carry it. A line that names someone in the player's town (and in
 * sight) is theirs to say; otherwise the nearest villagers take turns. One line at a time, each held long
 * enough to read; the night's held lines (Blessings and Burdens, reactions) follow the news.
 */
import type { People } from './people';
import type { Beat } from './juice';

const SPEECH = /^\s*(?:says|said|swears|reckons|thinks|heard|hears|told us|tells us)(?:,)?\s+(?:that\s+)?/i;
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cap = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** Tidy a raw dawn line: drop bullets and blank lines. */
export function cleanDawnLine(line: string): string {
  return line.replace(/^\s*[•\-*]\s*/, '').trim();
}

/**
 * Who says this line, and how. A line that opens with someone in the player's town ("Marta says the mill
 * stopped") is theirs, said in their own voice ("The mill stopped"). A line that only mentions someone is
 * about them, so a neighbour who isn't named carries it; the nearest few take turns.
 */
export function carryDawnLine(line: string, people: People, turn: number): Beat {
  const town = people.playerTown();
  const named = new Set<string>();
  let opener: { id: string; len: number } | undefined;
  for (const p of people.all()) {
    if (!p.given) continue;
    for (const name of [p.name, p.given]) {
      if (!name) continue;
      const m = new RegExp(`\\b${escape(name)}\\b`).exec(line);
      if (!m) continue;
      named.add(p.id);
      const here = (!town || p.townId === town) && people.hasHead(p.id);
      if (here && m.index === 0 && (!opener || name.length > opener.len)) opener = { id: p.id, len: name.length };
    }
  }
  if (opener) {
    const rest = line.slice(opener.len);
    const said = SPEECH.exec(rest);
    return { personId: opener.id, line: said ? cap(rest.slice(said[0].length)) : line, tone: 'plain' };
  }
  const all = people.visible();
  const folk = all.filter((id) => !named.has(id));
  const pool = folk.length ? folk : all;
  if (pool.length) return { personId: pool[turn % Math.min(3, pool.length)]!, line, tone: 'plain' };
  return { personId: 'player', line, tone: 'plain' };
}

export type DawnDeps = {
  people: People;
  speak(b: Beat): Promise<void>;
  /** Changes when the run's state is replaced: an older dawn stops. */
  generation(): number;
};

const GAP_MS = 250;
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Speak the dawn's lines, then the night's held beats, one at a time. */
export async function speakDawn(d: DawnDeps, lines: string[], night: Beat[]): Promise<void> {
  const gen = d.generation();
  d.people.refresh();
  const beats: Beat[] = [];
  let turn = 0;
  for (const raw of lines) {
    const line = cleanDawnLine(raw);
    if (line) beats.push(carryDawnLine(line, d.people, turn++));
  }
  // The night's lines, once each (a wagon that came three times is still one piece of news).
  const said = new Set(beats.map((b) => b.line));
  for (const b of night) {
    if (said.has(b.line)) continue;
    said.add(b.line);
    beats.push(b);
  }
  for (const b of beats) {
    if (d.generation() !== gen) return;
    await d.speak(b);
    await wait(GAP_MS);
  }
}

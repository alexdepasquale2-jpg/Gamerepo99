import { describe, expect, it } from 'vitest';
import { createPlaySession } from '../../src/sim';
import type { PlaySession } from '../../src/sim/play-session/play-session';
import { boardPages } from '../../src/sim/board-pages';
import { collectDawnLinesBySource } from '../../src/sim/dawn-lines';
import {
  compactLines, deliveryHearsay, landLines, legitimacyPhrase, powerNews, powerPage, townLabel, type PowerHeard,
} from '../../src/sim/contrib/power-page';
import { loadData } from '../../src/sim/load-data';
import type { SimState } from '../../src/sim/types/runtime';

const data = loadData();

function state(): SimState {
  return {
    seed: 7, day: 20, data,
    player: { townId: 'ashford' },
    people: {
      ruth_calder: { id: 'ruth_calder', name: 'Ruth Calder', townId: 'ashford', flame: 50, tags: ['leader'] },
      ada: { id: 'ada', name: 'Ada Thorn', townId: 'ashford', flame: 40 },
      tobin: { id: 'tobin', name: 'Tobin Hale', townId: 'ashford', flame: 40 },
      kid: { id: 'kid', name: 'Pip', townId: 'ashford', flame: 40, tags: ['child'] },
      leon: { id: 'leon', name: 'Leon March', townId: 'lowmere', flame: 40 },
    },
    towns: { ashford: { id: 'ashford' }, lowmere: { id: 'lowmere' } },
    doctrines: {
      doctrine_mill_bread: { id: 'doctrine_mill_bread', townId: 'ashford', realDelivery: 0.2, perceivedDelivery: 0.7, propaganda: 0.6, control: 0.1, exposure: 0.25, legitimacy: 0.6 },
      doctrine_strand_crossings: { id: 'doctrine_strand_crossings', townId: 'lowmere', realDelivery: 0.4, perceivedDelivery: 0.4, propaganda: 0.1, control: 0.1, exposure: 0, legitimacy: 0.35 },
    },
    build: { plans: [], claims: [{ id: 'c1', planId: 'p1', ownerId: 'ada', townId: 'ashford', dx: 1, dy: 1, w: 2, h: 2, kind: 'mill', status: 'claimed' }], next: 2 },
    borders: { pairs: {}, disputes: [], next: 1 },
    polity: {
      relations: { 'ashford|lowmere': { a: 'ashford', b: 'lowmere', trust: 30, feud: 0, treaty: 'trade', since: 15, lastWar: -999 } },
      wars: [], knowledge: {}, tech: { ashford: ['water_wheel'] }, faiths: { ashford: { creed: 'hearth', founded: 3, shrine: 's' } }, next: 1,
    },
  } as unknown as SimState;
}

describe('power page: phrases', () => {
  it('says what people believe against what the ledger says, never a number', () => {
    const h = { holds: 'the bread still comes', ledger: 'the mill ledger' };
    expect(deliveryHearsay(0.7, 0.2, h)).toBe('People say the bread still comes. The mill ledger says otherwise.');
    expect(deliveryHearsay(0.2, 0.6, h)).toBe('Nobody believes the bread still comes. The mill ledger says they should.');
    expect(deliveryHearsay(0.7, 0.7, h)).toContain('bears them out');
    expect(deliveryHearsay(0.1, 0.1, h)).toContain('Nobody says the bread still comes any more');
    expect(deliveryHearsay(0.7, 0.2)).toContain('The tally-book says otherwise');
    expect(legitimacyPhrase(0.9)).toBe('Most would stand up for it.');
    expect(legitimacyPhrase(0.2)).toContain('could fall');
    expect(legitimacyPhrase(0.9, true)).toContain('fallen');
  });
  it('names towns as people say them', () => {
    expect(townLabel(state(), 'city_reach')).toBe('The Reach');
    expect(townLabel(state(), 'ashford')).toBe('Ashford Crossing');
    expect(townLabel(state(), 'no_such_place')).toBe('No Such Place');
  });
});

describe('power page: the board', () => {
  it('names the leader and compact, its promises, hearsay vs ledger, and how it sits', () => {
    const text = compactLines(state(), 'ashford').join('\n');
    expect(text).toContain('Ruth Calder speaks for the Mill & Bread Compact.');
    expect(text).toContain('It promises "Every willing hand gets a shift" and "Bread for those who queue".');
    expect(text).toContain('People say the bread still comes. The mill ledger says otherwise.');
    expect(text).toContain('Most go along with it. Its criers are at every corner. Some have started asking questions.');
    expect(text).toContain('Word from the road');
    expect(text).toContain('Lowmere');
    expect(text).not.toMatch(/\d\.\d|%/);
  });
  it('a town with no compact says so; a fallen one is remembered', () => {
    const s = state();
    s.doctrines!.doctrine_mill_bread!.collapsed = true;
    const text = compactLines(s, 'ashford').join('\n');
    expect(text).toContain('No compact holds Ashford Crossing.');
    expect(text).toContain('Ruth Calder is listened to');
    expect(text).toContain('The Mill & Bread Compact fell here.');
  });
  it('posts land disputes and how they were settled, neighbours, creed and crafts', () => {
    const s = state();
    s.borders!.disputes.push(
      { id: 'dsp1', townId: 'ashford', claimId: 'c1', challengerId: 'tobin', holderId: 'ada', opened: 15, status: 'open' },
      { id: 'dsp2', townId: 'ashford', claimId: 'gone', challengerId: 'ada', holderId: 'tobin', opened: 5, status: 'upheld' },
      { id: 'dsp3', townId: 'ashford', claimId: 'c1', challengerId: 'leon', holderId: 'ada', opened: 2, status: 'dismissed' },
    );
    const text = landLines(s, 'ashford').join('\n');
    expect(text).toContain("Tobin contests Ada's idle mill plot. The neighbours judge in 3 days.");
    expect(text).toContain("Ada took Tobin's stalled building plot; the neighbours judged Ada the surer hand.");
    expect(text).toContain("Ada kept the mill plot; Leon's claim was turned away.");
    expect(text).toContain('Lowmere Strand: a trade pact these 5 days.');
    expect(text).toContain('Faith: The Hearth Way; folk say cradles fill under it.');
    expect(text).toContain('Crafts: Water wheel.');
    s.polity!.wars.push({ id: 'war1', aggressor: 'lowmere', defender: 'ashford', started: 18, duration: 20, raids: 2, status: 'active' });
    expect(landLines(s, 'ashford').join('\n')).toContain('Lowmere Strand: at war; they marched on us. 2 raids so far.');
    expect(landLines({ ...s, borders: undefined, polity: undefined } as SimState, 'ashford').join('\n')).toContain('No one is quarrelling over land.');
  });
});

describe('power page: dawn news', () => {
  it('first listen passes on only yesterday\'s news; later dawns tell each change once, through a named townsperson', () => {
    const s = state();
    s.borders!.disputes.push({ id: 'old', townId: 'ashford', claimId: 'c1', challengerId: 'tobin', holderId: 'ada', opened: 1, status: 'dismissed' });
    let r = powerNews(s, undefined);
    expect(r.lines).toEqual([]);
    const first: PowerHeard = r.heard;
    let heard = first;

    s.day = 21;
    s.borders!.disputes.push({ id: 'dsp9', townId: 'ashford', claimId: 'c1', challengerId: 'tobin', holderId: 'ada', opened: 13, status: 'upheld' });
    s.doctrines!.doctrine_strand_crossings!.collapsed = true;
    s.polity!.relations['ashford|lowmere']!.treaty = 'alliance';
    r = powerNews(s, heard);
    heard = r.heard;
    expect(r.lines).toHaveLength(3);
    const text = r.lines.join('\n');
    expect(text).toMatch(/^(Ruth Calder|Ada Thorn|Tobin Hale) says the neighbours handed Ada Thorn's stalled mill plot in Ashford Crossing to Tobin Hale\./m);
    expect(text).toContain('says the Strand Crossings Pact has fallen in Lowmere Strand. Nobody believes "The ferry runs when called" now.');
    expect(text).toContain('says Ashford Crossing and Lowmere Strand have sworn an alliance.');
    expect(text).not.toContain('Pip');
    expect(powerNews(s, heard).lines).toEqual([]);
    // Deterministic: the same world and memory always give the same speakers and words.
    expect(powerNews(s, first).lines).toEqual(r.lines);
    // Nobody tells their own news.
    for (const l of r.lines) expect(l.startsWith('Tobin Hale says the neighbours handed') || l.startsWith('Ada Thorn says the neighbours handed')).toBe(false);
  });
  it('a compact taking another town and a war breaking out are news', () => {
    const s = state();
    const heard = powerNews(s, undefined).heard;
    s.doctrines!.doctrine_mill_bread!.townId = 'lowmere';
    s.doctrines!.doctrine_strand_crossings!.townId = 'ashford';
    s.polity!.wars.push({ id: 'war1', aggressor: 'lowmere', defender: 'ashford', started: 20, duration: 20, raids: 0, status: 'active' });
    const text = powerNews(s, heard).lines.join('\n');
    expect(text).toContain('Lowmere Strand has marched on Ashford Crossing.');
    expect(text).toContain('Ashford Crossing has turned to the Strand Crossings Pact.');
  });
});

describe('power page: live play', () => {
  function session(): PlaySession {
    const s = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' }) as PlaySession;
    s.start({ seed: 42, archetypeId: 'marrow' });
    return s;
  }
  /** Rough rows a 10px monospace column of ~44 chars shows. */
  const rows = (lines: string[]): number => lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 44)), 0);

  it('is a registered board page that fits the board in every town as the world runs', () => {
    const page = boardPages().find((p) => p.id === 'power')!;
    expect(page.title).toBe('Power');
    const s = session();
    const st = s.getState()!;
    const heardLines: string[] = [];
    const powerLines: string[] = [];
    for (let i = 0; i < 60; i++) {
      s.tick();
      const bySource = collectDawnLinesBySource(st);
      powerLines.push(...(bySource['power-news'] ?? []));
      heardLines.push(...Object.values(bySource).flat().filter((l) => !l.includes(', waiting in ')));
      for (const t of Object.keys(st.towns ?? {})) {
        const c = page.render(st, t, (id) => id).columns!;
        expect(rows(c[0])).toBeLessThanOrEqual(21);
        expect(rows(c[1])).toBeLessThanOrEqual(21);
      }
    }
    // The Reach's creed out-shone the Chalk Quiet and took Chalk Warren once (no ping-pong); the board says who holds each.
    expect(powerPage(st, 'chalk_warren').columns[0].join('\n')).toContain('Reach Progress Creed');
    expect(powerPage(st, 'city_reach').columns[0].join('\n')).toContain('The Chalk Quiet holds The Reach; no one stands at its head.');
    expect(heardLines.filter((l) => l.endsWith('Chalk Warren has turned to the Reach Progress Creed.'))).toHaveLength(1);
    expect(powerPage(st, st.player.townId!).columns[0].join('\n')).toContain('Word from the road');
    // The claim-jump in the Reach (seed 42) is settled and told at dawn through a named person.
    expect(heardLines.some((l) => /^[A-Z][a-z]+ [A-Z][a-z]+ says the neighbours handed .* plot in The Reach to /.test(l))).toBe(true);
    // Power news is told once (other systems, such as retold stories or a recurring happening, may repeat).
    expect(new Set(powerLines).size).toBe(powerLines.length);
  });
});

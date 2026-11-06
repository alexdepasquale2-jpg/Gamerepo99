/**
 * Social graph spec 05 (Niblet slice): prebaked seeded small-world web,
 * centrality table, path-distance falloff walk.
 * Spec: docs/superpowers/specs/2026-11-06-social-graph/{01,02,03,05}.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadData } from '../../../src/sim/load-data';
import {
  addEdge,
  createSocialGraph,
  introduce,
  mapLegacyKind,
  meanHopDistance,
  pickRumorNext,
  preferInfluential,
  shortestPath,
  walkCascade,
  type SocialEdge,
} from '../../../src/sim/social';
import { weaveSocialWeb } from '../../../src/sim/social/worldgen-weave';
import { bakeSocialWeb } from '../../../src/sim/social/bake/social-bake';

const data = loadData();
const PROP = data.socialPropagation;

function bakedGraph() {
  return createSocialGraph(data.socialWeb.edges);
}

function edge(id: string, a: string, b: string, kind: SocialEdge['kind'], weight: number): SocialEdge {
  return { id, a, b, kind, weight };
}

describe('social-graph 05 — tables', () => {
  it('propagation defaults match spec 02', () => {
    expect(PROP.falloff).toBe(0.55);
    expect(PROP.maxHops).toBe(6);
    expect(PROP.epsilon).toBe(0.02);
  });

  it('maps legacy kinship kinds at load', () => {
    expect(mapLegacyKind('cousin')).toEqual({ kind: 'kin' });
    expect(mapLegacyKind('coworker')).toEqual({ kind: 'friendship', tag: 'coworker' });
    expect(mapLegacyKind('pen_pal')).toEqual({ kind: 'friendship', tag: 'pen_pal' });
    expect(mapLegacyKind('teacher_student')).toEqual({ kind: 'friendship', tag: 'teacher_student' });
    expect(mapLegacyKind('owes_favor')).toEqual({ kind: 'debt', tag: 'owes_favor' });
    expect(mapLegacyKind('ferry_debt')).toEqual({ kind: 'debt', tag: 'ferry_debt' });
    expect(mapLegacyKind('friend')).toEqual({ kind: 'friendship' });
    expect(mapLegacyKind('rival')).toEqual({ kind: 'rival' });
  });

  it('authored kinship edges survive into the baked web with mapped kinds', () => {
    const byId = new Map(data.socialWeb.edges.map((e) => [e.id, e]));
    const ferry = byId.get('edge_nora_tom');
    expect(ferry?.kind).toBe('debt');
    expect(ferry?.tags).toContain('ferry_debt');
    expect(byId.get('edge_marta_priya')?.kind).toBe('kin');
  });
});

describe('social-graph 05 — test 1: hop band', () => {
  it('mean hop distance on the baked fixture web is in [4, 6]', () => {
    const mean = meanHopDistance(bakedGraph());
    expect(mean).toBeGreaterThanOrEqual(4);
    expect(mean).toBeLessThanOrEqual(6);
  });

  it('baked web is connected and every edge kind is in the 01 enum', () => {
    const g = bakedGraph();
    const ids = g.nodes();
    expect(ids.length).toBeGreaterThanOrEqual(60);
    for (const id of ids) expect(shortestPath(g, ids[0]!, id)).not.toBeNull();
    const kinds = new Set(data.socialWeb.edges.map((e) => e.kind));
    for (const k of kinds) expect(['kin', 'trade', 'debt', 'friendship', 'rival']).toContain(k);
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });

  it('weave is deterministic per seed and lands in band across seeds', () => {
    const ids = Array.from({ length: 60 }, (_, i) => `p${i}`);
    for (const seed of [1, 7, 42, 99, 2026]) {
      const a = weaveSocialWeb({ seed, personIds: ids });
      const b = weaveSocialWeb({ seed, personIds: ids });
      expect(a.edges).toEqual(b.edges);
      expect(a.meanHops).toBeGreaterThanOrEqual(4);
      expect(a.meanHops).toBeLessThanOrEqual(6);
      expect(meanHopDistance(createSocialGraph(a.edges))).toBeCloseTo(a.meanHops, 9);
    }
    const s1 = weaveSocialWeb({ seed: 1, personIds: ids }).edges;
    const s2 = weaveSocialWeb({ seed: 2, personIds: ids }).edges;
    expect(s1).not.toEqual(s2);
  });

  it('prebaked data is fresh (re-bake for default seed reproduces files)', () => {
    const baked = bakeSocialWeb(data.socialWeb.seed);
    expect(baked.web.edges).toEqual(data.socialWeb.edges);
    expect(baked.centrality.rows).toEqual(data.socialCentrality.rows);
  });
});

describe('social-graph 05 — test 2: falloff walk', () => {
  // A —0.8— M —0.6— B ; A —0.5— X
  const g = createSocialGraph([
    edge('am', 'A', 'M', 'friendship', 0.8),
    edge('mb', 'M', 'B', 'friendship', 0.6),
    edge('ax', 'A', 'X', 'trade', 0.5),
  ]);

  it('favor at A reaches friend-of-friend B with falloff^2 * weights', () => {
    const hits = walkCascade(g, 'A', { baseStrength: 1, polarity: 'good' }, PROP);
    const m = hits.find((h) => h.personId === 'M')!;
    const b = hits.find((h) => h.personId === 'B')!;
    expect(m.hop).toBe(1);
    expect(b.hop).toBe(2);
    expect(m.strength).toBeCloseTo(0.55 * 0.8, 9);
    expect(b.strength).toBeCloseTo(0.55 ** 2 * 0.8 * 0.6, 9);
    expect(b.strength).toBeLessThan(m.strength);
    expect(hits.some((h) => h.personId === 'A')).toBe(false);
  });

  it('stops at epsilon and maxHops; bad polarity shares the walker with negative sign', () => {
    const chain = createSocialGraph(
      Array.from({ length: 10 }, (_, i) => edge(`c${i}`, `n${i}`, `n${i + 1}`, 'kin', 1)),
    );
    const good = walkCascade(chain, 'n0', { baseStrength: 1, polarity: 'good' }, PROP);
    expect(Math.max(...good.map((h) => h.hop))).toBeLessThanOrEqual(PROP.maxHops);
    for (const h of good) expect(h.strength).toBeGreaterThanOrEqual(PROP.epsilon);
    expect(good.some((h) => h.personId === 'n7')).toBe(false);
    const bad = walkCascade(chain, 'n0', { baseStrength: 1, polarity: 'bad' }, PROP);
    expect(bad.map((h) => h.personId)).toEqual(good.map((h) => h.personId));
    for (let i = 0; i < bad.length; i++) expect(bad[i]!.strength).toBeCloseTo(-good[i]!.strength, 12);
  });

  it('on baked web: FoF strengths are strictly weaker than hop-1 maxima, deterministic order', () => {
    const web = bakedGraph();
    const src = data.socialWeb.edges[0]!.a;
    const run1 = walkCascade(web, src, { baseStrength: 1, polarity: 'good' }, PROP);
    const run2 = walkCascade(web, src, { baseStrength: 1, polarity: 'good' }, PROP);
    expect(run1).toEqual(run2);
    const hop1 = run1.filter((h) => h.hop === 1).map((h) => h.strength);
    const hop2 = run1.filter((h) => h.hop === 2).map((h) => h.strength);
    expect(hop1.length).toBeGreaterThan(0);
    expect(hop2.length).toBeGreaterThan(0);
    expect(Math.max(...hop2)).toBeLessThan(Math.max(...hop1));
  });
});

describe('social-graph 05 — test 3: introduce', () => {
  it('introduce creates A↔B friendship edge; path becomes 1; idempotent', () => {
    const g = bakedGraph();
    const ids = g.nodes();
    const a = ids[0]!;
    const b = ids.find((id) => (shortestPath(g, a, id)?.length ?? 0) - 1 >= 3)!;
    expect(b).toBeDefined();
    const before = g.edges().length;
    const e = introduce(g, a, b);
    expect(e.kind).toBe('friendship');
    expect(e.weight).toBeLessThanOrEqual(0.4);
    expect(e.tags).toContain('introduced');
    expect(shortestPath(g, a, b)).toEqual([a, b]);
    expect(g.edges().length).toBe(before + 1);
    expect(introduce(g, b, a).id).toBe(e.id);
    expect(g.edges().length).toBe(before + 1);
    // baked source table untouched
    expect(createSocialGraph(data.socialWeb.edges).edges().length).toBe(before);
  });
});

describe('social-graph 05 — test 4 (graph level): rival + bad cascade', () => {
  it('bad cascade along rival+kin hits kin and skips unrelated component', () => {
    const g = createSocialGraph([
      edge('k1', 'breaker', 'kinA', 'kin', 0.9),
      edge('t1', 'breaker', 'tradeB', 'trade', 0.9),
      edge('u1', 'u1', 'u2', 'kin', 1),
    ]);
    addEdge(g, edge('r1', 'breaker', 'victim', 'rival', 0.8));
    const hits = walkCascade(
      g,
      'victim',
      { baseStrength: 1, polarity: 'bad', kinds: ['rival', 'kin'] },
      PROP,
    );
    const ids = hits.map((h) => h.personId);
    expect(ids).toContain('breaker');
    expect(ids).toContain('kinA');
    expect(ids).not.toContain('tradeB');
    expect(ids).not.toContain('u1');
    for (const h of hits) expect(h.strength).toBeLessThan(0);
  });
});

describe('social-graph 05 — test 5: centrality', () => {
  const table = data.socialCentrality;

  it('centrality file marks ≥1 influential and refers only to web people', () => {
    const inf = table.rows.filter((r) => r.influential);
    expect(inf.length).toBeGreaterThanOrEqual(1);
    expect(inf.length).toBeLessThan(table.rows.length);
    const nodes = new Set(bakedGraph().nodes());
    for (const r of table.rows) expect(nodes.has(r.personId)).toBe(true);
  });

  it('preferInfluential picks influential candidates with deterministic tie-break', () => {
    const inf = table.rows.filter((r) => r.influential).map((r) => r.personId);
    const plain = table.rows.filter((r) => !r.influential).map((r) => r.personId);
    const cands = [plain[0]!, plain[1]!, inf[0]!, 'unknown_person'];
    expect(preferInfluential(table, cands)).toBe(inf[0]);
    expect(preferInfluential(table, [...cands].reverse())).toBe(inf[0]);
    // tie among unknowns: lexicographic id
    expect(preferInfluential(table, ['zed', 'amy', 'bo'])).toBe('amy');
    expect(preferInfluential(table, [])).toBeUndefined();
  });

  it('rumor picker prefers influential sink among unused neighbors', () => {
    const t = {
      threshold: 0.5,
      rows: [
        { personId: 'hub', betweenness: 0.9, eigenvector: 0.8, influential: true },
        { personId: 'leaf', betweenness: 0.1, eigenvector: 0.1, influential: false },
        { personId: 'leaf2', betweenness: 0.1, eigenvector: 0.1, influential: false },
      ],
    };
    const g = createSocialGraph([
      edge('e1', 'src', 'leaf', 'friendship', 0.9),
      edge('e2', 'src', 'hub', 'friendship', 0.4),
      edge('e3', 'src', 'leaf2', 'friendship', 0.9),
    ]);
    expect(pickRumorNext(g, t, 'src', new Set())).toBe('hub');
    expect(pickRumorNext(g, t, 'src', new Set(['hub']))).toBe('leaf');
    expect(pickRumorNext(g, t, 'src', new Set(['hub', 'leaf', 'leaf2']))).toBeUndefined();
  });
});

describe('social-graph 05 — test 6: tables only, no ML runtime', () => {
  it('src/sim/social never imports ML/LLM runtimes; runtime files never import bake/', () => {
    const root = join(process.cwd(), 'src/sim/social');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(0);
    const ml = /from\s+['"](onnxruntime[^'"]*|@tensorflow[^'"]*|@xenova[^'"]*|@huggingface[^'"]*|openai|@anthropic-ai[^'"]*|ml-[^'"]*|brain\.js|synaptic)['"]/;
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(ml);
      if (!f.includes(`${join('social', 'bake')}`)) expect(src, f).not.toMatch(/from\s+['"][^'"]*bake[^'"]*['"]/);
    }
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const d of deps) expect(d).not.toMatch(/onnx|tensorflow|xenova|huggingface|openai|anthropic/);
  });
});

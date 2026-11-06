import { describe, expect, it } from 'vitest';
import {
  createPlaySession,
  dumpWorld,
} from '../../../src/sim/fabric/world-dump';
import { generateWorld } from '../../../src/sim/gen/world';
import {
  createPlaySession as createPlaySessionFromIndex,
  dumpWorld as dumpWorldFromIndex,
} from '../../../src/sim/index';
import {
  createPlaySession as createPlaySessionFromFabric,
  dumpWorld as dumpWorldFromFabric,
} from '../../../src/sim/fabric';

describe('dumpWorld', () => {
  it('includes seed and site ids from Task E gapSites', () => {
    const world = generateWorld({ seed: 42, peopleCount: 4 });
    const { text, hash } = dumpWorld(world);
    expect(text).toContain('seed:42');
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
    // Truthful dump of gen output — village/town/city ids from settlementSizes
    expect(text).toMatch(/site:(village|town|city)_/);
    for (const site of world.gapSites ?? []) {
      expect(text).toContain(`site:${site.id}`);
    }
  });

  it('same world yields identical dump hash', () => {
    const a = generateWorld({ seed: 7, peopleCount: 5 });
    const b = generateWorld({ seed: 7, peopleCount: 5 });
    expect(dumpWorld(a).hash).toBe(dumpWorld(b).hash);
    expect(dumpWorld(a).text).toBe(dumpWorld(b).text);
  });

  it('different seeds yield different dump hashes', () => {
    const a = dumpWorld(generateWorld({ seed: 7 }));
    const b = dumpWorld(generateWorld({ seed: 99 }));
    expect(a.hash).not.toBe(b.hash);
  });

  it('lists routes and doctrines alongside settlements', () => {
    const world = generateWorld({ seed: 42, peopleCount: 4 });
    const { text } = dumpWorld(world);
    expect((world.routes ?? []).length).toBeGreaterThan(0);
    expect((world.doctrines ?? []).length).toBeGreaterThan(0);
    for (const r of world.routes ?? []) {
      expect(text).toContain(`route:${r.id}`);
    }
    for (const d of world.doctrines ?? []) {
      expect(text).toContain(`doctrine:${d.id}`);
    }
  });

  it('lists history, kin, and people ids', () => {
    const world = generateWorld({ seed: 11, peopleCount: 4 });
    const { text } = dumpWorld(world);
    expect(world.history?.length ?? 0).toBeGreaterThan(0);
    for (const h of world.history ?? []) {
      expect(text).toContain(`history:${h.id}`);
    }
    for (const p of world.people) {
      expect(text).toContain(`person:${p.id}`);
    }
    expect(text).toMatch(/kin:/);
  });
});

describe('createPlaySession inspect mode', () => {
  it('inspect session dump contains seed and town/site ids', () => {
    const s = createPlaySession({ mode: 'inspect', seed: 42 });
    expect(s).not.toBeNull();
    const text = s!.dump();
    expect(text).toContain('seed:42');
    expect(text).toMatch(/site:(village|town|city)_|town_/);
  });

  it('snapshot includes seed, townCount, site ids, and fingerprint', () => {
    const s = createPlaySession({ mode: 'inspect', seed: 42, peopleCount: 4 });
    expect(s).not.toBeNull();
    const snap = s!.snapshot();
    expect(snap.seed).toBe(42);
    expect(snap.townCount).toBeGreaterThanOrEqual(3);
    expect(snap.siteIds.length).toBe(snap.townCount);
    expect(snap.siteIds.every((id) => /^(village|town|city)_/.test(id))).toBe(
      true,
    );
    expect(typeof snap.fingerprint).toBe('string');
    expect(snap.fingerprint.length).toBeGreaterThan(0);
    expect(typeof snap.hash).toBe('string');
    expect(snap.peopleCount).toBeGreaterThanOrEqual(3);
  });

  it('is deterministic for the same seed', () => {
    const a = createPlaySession({ mode: 'inspect', seed: 42 });
    const b = createPlaySession({ mode: 'inspect', seed: 42 });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.dump()).toBe(b!.dump());
    expect(a!.snapshot().hash).toBe(b!.snapshot().hash);
  });

  it('runs headless (no Phaser import side effects in dump path)', () => {
    const s = createPlaySession({ mode: 'inspect', seed: 3 });
    expect(s).not.toBeNull();
    expect(s!.dump().length).toBeGreaterThan(0);
    expect(s!.snapshot().seed).toBe(3);
  });
});

describe('createPlaySession feature-detect safety', () => {
  it('returns null without inspect opts (does not throw)', () => {
    expect(createPlaySession()).toBeNull();
  });
});

describe('public exports', () => {
  it('re-exports dumpWorld and createPlaySession from fabric and index', () => {
    expect(typeof dumpWorldFromFabric).toBe('function');
    expect(typeof createPlaySessionFromFabric).toBe('function');
    expect(typeof dumpWorldFromIndex).toBe('function');
    expect(typeof createPlaySessionFromIndex).toBe('function');
    const sess = createPlaySessionFromIndex({ mode: 'inspect', seed: 5 });
    expect(sess).not.toBeNull();
    const text = sess!.dump();
    expect(text).toContain('seed:5');
  });
});

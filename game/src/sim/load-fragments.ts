/** Assemble dialogue/fragments/** into LineFragmentsTable (index order). Pure. */

import type { LineFragmentsTable } from './load-data';

import fragmentsIndex from '../data/dialogue/fragments/index.json';

const fragmentModules = import.meta.glob('../data/dialogue/fragments/**/*.json', {
  eager: true,
}) as Record<string, { default?: unknown } | Record<string, unknown>>;

function moduleData(mod: { default?: unknown } | Record<string, unknown>): Record<string, unknown> {
  if (mod && typeof mod === 'object' && 'default' in mod && mod.default && typeof mod.default === 'object') {
    return mod.default as Record<string, unknown>;
  }
  return mod as Record<string, unknown>;
}

function resolvePart(relFromFragments: string): Record<string, unknown> {
  const needle = `/dialogue/fragments/${relFromFragments.replace(/^\.\//, '')}`;
  for (const [path, mod] of Object.entries(fragmentModules)) {
    const norm = path.replace(/\\/g, '/');
    if (norm.endsWith(needle) || norm.endsWith(`/fragments/${relFromFragments}`)) {
      return moduleData(mod);
    }
  }
  throw new Error(`missing dialogue/fragments part: ${relFromFragments}`);
}

type Frag = LineFragmentsTable['fragments'][number];

/** Merge fragments folder using index.files + orderFiles (or fragmentIds). */
export function loadLineFragmentsTable(): LineFragmentsTable {
  const index = fragmentsIndex as {
    version?: number;
    canonical?: boolean;
    replaces?: string;
    files?: string[];
    orderFiles?: string[];
    fragmentIds?: string[];
    axes?: string[];
    notes?: string;
    spec?: string;
  };

  const byId = new Map<string, Frag>();
  for (const name of index.files ?? []) {
    const part = resolvePart(name);
    const list = (part.fragments as Frag[] | undefined) ?? [];
    for (const frag of list) {
      if (byId.has(frag.id)) {
        throw new Error(`duplicate fragment id: ${frag.id}`);
      }
      byId.set(frag.id, frag);
    }
  }

  const ids: string[] = [];
  if (index.orderFiles?.length) {
    for (const name of index.orderFiles) {
      const part = resolvePart(name);
      ids.push(...((part.fragmentIds as string[] | undefined) ?? []));
    }
  } else if (index.fragmentIds?.length) {
    ids.push(...index.fragmentIds);
  } else {
    ids.push(...byId.keys());
  }

  const fragments: Frag[] = [];
  for (const id of ids) {
    const frag = byId.get(id);
    if (!frag) {
      throw new Error(`missing fragment id listed in order: ${id}`);
    }
    fragments.push(frag);
  }

  return {
    fragments,
    canonical: index.canonical === true,
    replaces: index.replaces,
  };
}

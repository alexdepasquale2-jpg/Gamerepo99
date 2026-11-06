/** Assemble world/history/** into typed tables (index order). Pure; no dyn/. */

import historyIndex from '../../data/world/history/index.json';

const historyModules = import.meta.glob('../../data/world/history/**/*.json', {
  eager: true,
}) as Record<string, { default?: unknown } | Record<string, unknown>>;

export type HistoryBeatEffect = {
  op: string;
  target: string;
  value: string | number;
};

export type HistoryBeat = {
  id: string;
  kind: string;
  summary: string;
  preconditions?: Array<{ tag: string }>;
  effects?: HistoryBeatEffect[];
  chainsFrom?: string[];
  authoredSeed?: boolean;
  townId?: string | null;
  arc?: string;
};

export type SettlementSize = {
  id: string;
  gapAxisMax: number;
};

export type RoleWeight = {
  id: string;
  weight: number;
};

export type WoundWeight = {
  woundId: string;
  weight: number;
};

export type HistoryTables = {
  version?: number;
  chainRule?: string;
  historyBeats: HistoryBeat[];
  settlementSizes: SettlementSize[];
  roles: RoleWeight[];
  woundWeights: WoundWeight[];
};

function moduleData(mod: { default?: unknown } | Record<string, unknown>): Record<string, unknown> {
  if (mod && typeof mod === 'object' && 'default' in mod && mod.default && typeof mod.default === 'object') {
    return mod.default as Record<string, unknown>;
  }
  return mod as Record<string, unknown>;
}

function resolvePart(name: string): Record<string, unknown> {
  const needle = `/world/history/${name.replace(/^\.\//, '')}`;
  for (const [path, mod] of Object.entries(historyModules)) {
    const norm = path.replace(/\\/g, '/');
    if (norm.endsWith(needle) || norm.endsWith(`/history/${name}`)) {
      return moduleData(mod);
    }
  }
  throw new Error(`missing world/history part: ${name}`);
}

/** Merge history folder using index.files + historyBeatsFiles. */
export function loadHistoryTables(): HistoryTables {
  const index = historyIndex as {
    version?: number;
    chainRule?: string;
    files?: string[];
    historyBeatsFiles?: string[];
    spec?: string;
  };

  const out: Record<string, unknown> = {
    version: index.version,
    chainRule: index.chainRule,
  };

  for (const name of index.files ?? []) {
    const part = resolvePart(name);
    for (const [k, v] of Object.entries(part)) {
      if (k === 'historyBeats') continue;
      out[k] = v;
    }
  }

  const beatFiles =
    index.historyBeatsFiles ??
    (index.files ?? []).filter((n) => n.startsWith('historyBeats'));
  const historyBeats: HistoryBeat[] = [];
  for (const name of beatFiles) {
    const part = resolvePart(name);
    historyBeats.push(...((part.historyBeats as HistoryBeat[] | undefined) ?? []));
  }

  return {
    version: out.version as number | undefined,
    chainRule: out.chainRule as string | undefined,
    historyBeats,
    settlementSizes: (out.settlementSizes as SettlementSize[] | undefined) ?? [],
    roles: (out.roles as RoleWeight[] | undefined) ?? [],
    woundWeights: (out.woundWeights as WoundWeight[] | undefined) ?? [],
  };
}

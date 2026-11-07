/** Resolve scenario targets on a generated play session (anchors preferred). */

export type ScenarioPersonQuery = {
  preferAnchorId?: string;
  woundId?: string;
  tagsAny?: string[];
  siteKind?: string;
};

export type ScenarioPersonView = {
  id: string;
  woundId?: string;
  tags?: string[];
  siteId?: string;
  siteKind?: string;
  anchor?: boolean;
  townId?: string;
  marks?: { markId: string; stacks: number }[];
};

export type ScenarioPeopleSource = {
  listPeople(): ScenarioPersonView[];
};

export function siteKindFromSiteId(siteId?: string): string | undefined {
  if (!siteId) return undefined;
  if (siteId.startsWith('site_')) return siteId.slice('site_'.length);
  return siteId;
}

function matchesQuery(p: ScenarioPersonView, q: ScenarioPersonQuery): boolean {
  if (q.woundId && p.woundId !== q.woundId) return false;
  if (q.siteKind) {
    const kind = p.siteKind ?? siteKindFromSiteId(p.siteId);
    if (kind !== q.siteKind) return false;
  }
  if (q.tagsAny && q.tagsAny.length > 0) {
    const tags = p.tags ?? [];
    if (!q.tagsAny.some((t) => tags.includes(t))) return false;
  }
  return true;
}

/**
 * Prefer authored anchor when present in the generated world; else first person
 * matching wound / tags / siteKind filters.
 */
export function resolveScenarioPerson(
  session: ScenarioPeopleSource,
  query: ScenarioPersonQuery,
): string | undefined {
  const people = session.listPeople();
  if (query.preferAnchorId) {
    const anchor = people.find((p) => p.id === query.preferAnchorId);
    if (anchor) return anchor.id;
  }
  const hit = people.find((p) => matchesQuery(p, query));
  return hit?.id;
}

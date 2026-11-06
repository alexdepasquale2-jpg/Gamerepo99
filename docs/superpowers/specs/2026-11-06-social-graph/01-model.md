# 01 — Graph model

## Nodes

- **Person** (`people.json` / generated `gen_p_*`): primary nodes.  
- **Place** (town, site, facility): secondary; people hang on places; place↔place already in `links.json` / `routes.json`.  
- **Doctrine** (optional hub): membership edges, not a person.

Runtime ids stable across seed; gen people get edges from `kin-patterns` + gap rules.

## Edge types (authored + generated)

| kind | Meaning | Directed? | Typical weight |
|------|---------|-----------|----------------|
| `kin` | Blood / household / cousin | undirected | 0.6–1.0 |
| `trade` | Ongoing exchange, guild, carter bond | undirected or weak-directed | 0.3–0.7 |
| `debt` | Owes favor / coin / ferry_debt | **directed** creditor←debtor | 0.4–0.9 |
| `friendship` | Old friendship, pen_pal, coworker trust | undirected | 0.4–0.8 |
| `rival` | Grudge, rival house, exposed liar | undirected or mutual | 0.5–1.0 |

Extend today's `kinship.edges` `kind` set; keep `owes_favor` / `ferry_debt` as `debt` subtypes via `tags`.

```ts
type SocialEdge = {
  id: string;
  a: string; // personId
  b: string;
  kind: 'kin' | 'trade' | 'debt' | 'friendship' | 'rival';
  weight: number;       // 0..1
  tags?: string[];
  townBias?: string;    // optional home-town gravity
};
```

## Hop budget

- **Target:** mean shortest-path distance across living people ≈ **4–6**.  
- Validator: BFS on undirected projection (debt as undirected for reach); fail if mean &lt; 3 (too cliquey) or mean &gt; 7 (too sparse) on Ashford+gap seed.  
- Soft cap path walks at hop 6 for favor/slight ripple (see 02).

## Centrality (precomputed)

Offline job (CI or Loom script, not game tick):

- **Betweenness** and/or **eigenvector** on the undirected projection.  
- Write `src/data/people/social-centrality.json`: `{ personId, betweenness, eigenvector, influential: bool }`.  
- `influential` = top quantile (data threshold, e.g. betweenness ≥ p90).  
- Runtime: read only; flag letter/doctrine/rumor seeds toward influential nodes.

No runtime power iteration.

## Existing seeds

Reuse / migrate:

- `people/kinship.json` edges + `generateRules`  
- `world/kin-patterns.json` (fabric Task H)  
- Town `links.json` for place scaffolding (not person hops)

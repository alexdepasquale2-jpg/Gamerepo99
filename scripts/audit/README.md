# Audit scripts (Loom)

## fabric-variety

Multi-seed world dump comparison for Probe “clone-shaped” checks.

```bash
npx vitest run scripts/audit/fabric-variety.test.ts
```

Writes `/tmp/fabric-variety-audit/dump-seed-*.txt` and `metrics.json` (settlement/doctrine/history Jaccard, gap variance, kin degree, route diameter).

Thresholds for Forge Task H live in `docs/superpowers/specs/2026-11-05-fabric-variety-fix.md` and `docs/superpowers/plans/m2/task-h-variety.md`.

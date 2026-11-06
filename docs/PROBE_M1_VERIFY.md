# Probe — M1 verify

```bash
cd /workspace/hearthfall
git rev-parse --short HEAD   # expect 1417e2b for this GO
npm run verify:m1
```

Artifacts: `tests/e2e/artifacts/m1-wander-t0.png`, `m1-wander-t1.png`, `m1-console.json`

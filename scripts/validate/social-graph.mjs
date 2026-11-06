/** Social graph 05: edge kind enum, weights, centrality refs, hop-mean band (01 §Hop budget). */

const KINDS = new Set(['kin', 'trade', 'debt', 'friendship', 'rival']);
const LEGACY = new Set(['cousin', 'friend', 'coworker', 'pen_pal', 'teacher_student', 'owes_favor', 'ferry_debt']);
const HOP_BAND = [4, 6];

function meanHops(edges) {
  const adj = new Map();
  const link = (x, y) => {
    if (!adj.has(x)) adj.set(x, new Set());
    adj.get(x).add(y);
  };
  for (const e of edges) {
    link(e.a, e.b);
    link(e.b, e.a); // debt undirected for reach
  }
  let sum = 0;
  let pairs = 0;
  for (const s of adj.keys()) {
    const dist = new Map([[s, 0]]);
    const q = [s];
    for (let i = 0; i < q.length; i++) {
      for (const w of adj.get(q[i])) {
        if (dist.has(w)) continue;
        dist.set(w, dist.get(q[i]) + 1);
        q.push(w);
      }
    }
    for (const [k, d] of dist) if (k !== s) { sum += d; pairs++; }
  }
  return { mean: pairs ? sum / pairs : 0, nodes: new Set(adj.keys()) };
}

export function validateSocialGraph(data, ctx) {
  const { req, people } = ctx;
  const web = data['social-web.json'];
  const cent = data['social-centrality.json'];
  const prop = data['social-propagation.json'];
  req(!!web && !!cent && !!prop, 'social-web/centrality/propagation json required');
  if (!web || !cent || !prop) return;

  req(prop.falloff > 0 && prop.falloff < 1, 'social-propagation.falloff in (0,1)');
  req(Number.isInteger(prop.maxHops) && prop.maxHops >= 1 && prop.maxHops <= 6, 'social-propagation.maxHops 1..6');
  req(prop.epsilon > 0 && prop.epsilon < 0.5, 'social-propagation.epsilon');

  const edges = web.edges || [];
  const ids = new Set();
  for (const e of edges) {
    req(!ids.has(e.id), `social-web dup edge id ${e.id}`);
    ids.add(e.id);
    req(KINDS.has(e.kind) || LEGACY.has(e.kind), `social-web ${e.id}: bad kind ${e.kind}`);
    req(typeof e.weight === 'number' && e.weight > 0 && e.weight <= 1, `social-web ${e.id}: weight`);
    req(typeof e.a === 'string' && typeof e.b === 'string' && e.a !== e.b, `social-web ${e.id}: endpoints`);
    for (const pid of [e.a, e.b]) {
      req(people.has(pid) || pid.startsWith('gen_p_'), `social-web ${e.id}: unknown person ${pid}`);
    }
  }

  const { mean, nodes } = meanHops(edges);
  req(mean >= HOP_BAND[0] && mean <= HOP_BAND[1], `social-web mean hops ${mean.toFixed(3)} outside [${HOP_BAND}]`);

  const rows = cent.rows || [];
  req(rows.some((r) => r.influential === true), 'social-centrality needs >=1 influential');
  for (const r of rows) req(nodes.has(r.personId), `social-centrality: ${r.personId} not in social-web`);
}

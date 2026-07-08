// Hreinn UBO-reikningur: eignarhaldsnet -> endanlegir eigendur + óþekktur afgangur.
// Gengur UPP frá rót um "hver á mig"-leggi, margfaldar brot, safnar á lauf (einstaklingar
// eða félög sem ekki verður rakið lengra). Engin net-köll -> prófanlegt.
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeUbo(nodes, edges, rootId, { threshold = 10, minShown = 3 } = {}) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ownersOf = new Map();                       // til -> [{fra, frac}]
  for (const e of edges) {
    if (!ownersOf.has(e.til)) ownersOf.set(e.til, []);
    ownersOf.get(e.til).push({ fra: e.fra, frac: (Number(e.hlutur) || 0) / 100 });
  }
  const isTerminal = (id) => {
    const n = byId.get(id);
    if (!n) return true;
    if (n.tegund === 'einst') return true;
    const os = ownersOf.get(id);
    return !(os && os.length);                       // félag án þekktra eigenda = lauf (óþekkt lengra)
  };
  const identity = (n) => (n.kt ? 'kt:' + n.kt : 'nm:' + String(n.nafn || '').toLowerCase().trim() + '|' + (n.faeding || ''));
  const agg = new Map();                             // identity -> {node, hlutur, gegnum:[]}

  function record(owner, nf, chain) {
    const key = identity(owner);
    const cur = agg.get(key) || { node: owner, hlutur: 0, gegnum: [] };
    cur.hlutur += nf;
    // millifélög á leiðinni, raðað eiganda-megin fyrst (chain er rót..parent, öfug röð)
    for (const cid of [...chain].slice(1).reverse()) {
      const cn = byId.get(cid);
      if (cn && cn.tegund === 'felag' && !cur.gegnum.includes(cn.nafn)) cur.gegnum.push(cn.nafn);
    }
    agg.set(key, cur);
  }

  // Skilar true ef eitthvað lauf var skráð í þessu undirtré. Ef ekkert (t.d. allir eigendur á-leið
  // vegna hrings) -> kallarinn skráir hnútinn sjálfan sem endanlegan (óþekkt lengra).
  function walk(id, frac, chain) {
    let recorded = false;
    for (const { fra, frac: f } of ownersOf.get(id) || []) {
      if (chain.includes(fra)) continue;             // hringvörn
      const owner = byId.get(fra);
      if (!owner) continue;
      const nf = frac * f;
      if (isTerminal(fra)) {
        record(owner, nf, chain);
        recorded = true;
      } else if (walk(fra, nf, [...chain, fra])) {
        recorded = true;
      } else {
        record(owner, nf, chain);                     // blindgata (hringur/órekjanlegt) -> eigandinn er lauf
        recorded = true;
      }
    }
    return recorded;
  }
  walk(rootId, 1, [rootId]);

  const endanlegir = [...agg.values()]
    .map((v) => ({
      nafn: v.node.nafn, kt: v.node.kt || null, faeding: v.node.faeding || null,
      tegund: v.node.tegund, hlutur: round2(v.hlutur * 100), gegnum: v.gegnum,
    }))
    .sort((a, b) => b.hlutur - a.hlutur);
  const sum = endanlegir.reduce((s, e) => s + e.hlutur, 0);
  const othekkt = round2(Math.max(0, 100 - sum));
  return { endanlegir, othekkt };
}

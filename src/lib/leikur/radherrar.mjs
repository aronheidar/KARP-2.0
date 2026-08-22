// RÁÐHERRASKIPTING INNAN LIÐS (hugmynd #10): hver liðsmaður á SITT ráðuneyti (= einn lever-hópur baseline), forsætisráðherra
// sér allt, breytir öllu og er sá EINI sem læsir. Leysir „einn með lyklaborðið"-vandann: POST /decisions MERGE-ar per sleða
// í stað þess að INSERT OR REPLACE skipti öllu decisions-JSON-inu út (ráðherrar klobba þá ekki hver annan).
// HREINT — engin env/crypto/D1; baseline + config koma sem viðföng. Hóp-lestur er ENDURNÝTTUR úr studio.mjs (studioCatalog)
// svo vörpun sleði→ráðuneyti fylgir gögnunum (gogn/roads/baseline.json levers[id].group) — ENGIR harðkóðaðir sleðalistar.
//
// ÞJÓNS-SAMNINGUR (integration í server.mjs, POST /<code>/decisions):
//   prev     = { ...JSON.parse(row.decisions), locked: !!row.locked }   (geymd drög liðsins í lotunni; null ef engin röð)
//   incoming = { ...b.decisions, locked: !!b.locked }                    (það sem POST sendi)
//   merged   = mergeDecisions(prev, incoming, { handle: b.handle, baseline: BASELINE, config: cfg })
//   const { decisions, locked, hafnad } = tilGeymslu(merged)  → decisions-JSON í dálk, locked í dálk, hafnad í svarið.
//   Með config.radherrar AF skilar mergeDecisions incoming ÓBREYTTU (sama tilvísun) = nákvæmlega gamla hegðunin.
//   Sætið (hver er að POSTa) er leitt af prev.radherrar-mapinu + handle — EKKI af body-inu — svo enginn getur spoofað ráðuneyti.
import { studioCatalog } from './studio.mjs';

export const PM = 'forsaetis';

// Föst röð = röð í picker-UI. group = TAB_META-lykill (game-config.mjs) / baseline-hópheiti; null = forsætisráðherra (á alla hópa).
export const RADUNEYTI = Object.freeze([
  { key: 'forsaetis', group: null, heiti: 'Forsætisráðherra', icon: '🏛️',
    lysing: 'Sér allt, breytir öllu og er sá EINI sem læsir ákvarðanir liðsins. Á stóru ákvarðanirnar: klemmu-val, þjóðarsátt og stefnurofa.' },
  { key: 'sedlabanki', group: 'Peningastefna & varúð', heiti: 'Seðlabankastjóri', icon: '🏦',
    lysing: 'Sjálfstæð stofnun, ekki ráðherra — flott sæti. Stýrivextir, veðhlutfall, greiðslubyrðarþök, bindiskylda og verðtrygging: verðbólga og lánsfé.' },
  { key: 'fjarmal', group: 'Ríkisfjármál & skattar', heiti: 'Fjármálaráðherra', icon: '💰',
    lysing: 'Skattar, ríkisútgjöld, tilfærslur, innviðir og ívilnanir — örvun eða aðhald, afkoma ríkissjóðs og lífskjör.' },
  { key: 'husnaedi', group: 'Húsnæði', heiti: 'Húsnæðisráðherra', icon: '🏘️',
    lysing: 'Framboð íbúða, leiguhúsnæði og lóðir — hemja húsnæðisverð og verja heimilin án þess að kæfa byggingamarkaðinn.' },
  { key: 'vinnumarkadur', group: 'Vinnumarkaður & mannauður', heiti: 'Félags- og vinnumarkaðsráðherra', icon: '👥',
    lysing: 'Laun, atvinnuþátttaka, innflytjendastefna og lífeyrisaldur — framboð og gæði vinnuafls móta vöxt og verðbólgu.' },
  { key: 'audlindir', group: 'Auðlindir, orka & loftslag', heiti: 'Umhverfis-, orku- og auðlindaráðherra', icon: '🌱',
    lysing: 'Kvóti, fiskeldi, friðun, orka, orkuskipti, kolefnisgjald, skógrækt og votlendi — verðmæti úr auðlindum vs sjálfbærni.' },
  { key: 'byggd', group: 'Byggð & ferðaþjónusta', heiti: 'Byggða- og ferðamálaráðherra', icon: '🧭',
    lysing: 'Byggðastefna og ferðamannagjald — dreifa velsæld um landið allt og breikka grunn hagkerfisins.' },
]);

const BY_KEY = new Map(RADUNEYTI.map((r) => [r.key, r]));
const BY_GROUP = new Map(RADUNEYTI.filter((r) => r.group).map((r) => [r.group, r.key]));

// handle = 4–8 stafa [a-z0-9] (vafra-gerður dulnefnis-lykill liðsmanns; EKKERT PII — engin nöfn/netföng).
export const HANDLE_RE = /^[a-z0-9]{4,8}$/;
export function validHandle(h) { return typeof h === 'string' && HANDLE_RE.test(h); }
export function validKey(k) { return typeof k === 'string' && BY_KEY.has(k); }
export function radherrarOn(config) { const v = config && config.radherrar; return v === true || v === 1 || v === 'true'; }

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
// Hópar úr baseline um studioCatalog (ein uppspretta). Þolir baseline án outcomes (studioCatalog les outcomes líka).
function hopar(baseline) {
  return studioCatalog({ levers: (baseline && isObj(baseline.levers)) ? baseline.levers : {}, outcomes: (baseline && isObj(baseline.outcomes)) ? baseline.outcomes : {} }).tabs;
}

// ── Vörpun sleði ↔ ráðuneyti ───────────────────────────────────────────────────────────────────────────────────────────
// Eigandi sleða = ráðuneytið sem á hóp sleðans; null ef sleði óþekktur eða hópurinn á ekkert ráðuneyti (→ aðeins forsaetis).
export function leverOwner(leverId, baseline) {
  const lv = baseline && isObj(baseline.levers) ? baseline.levers[leverId] : null;
  if (!lv) return null;
  return BY_GROUP.get(lv.group) || null;
}
// Sleðar ráðuneytis sem Set af lever-id; forsaetis → ALLIR sleðar baseline; óþekkt sæti → tómt Set.
export function raduneytiLevers(key, baseline) {
  const tabs = hopar(baseline);
  if (key === PM) return new Set(tabs.flatMap((t) => t.levers.map((l) => l.key)));
  const r = BY_KEY.get(key);
  if (!r || !r.group) return new Set();
  const tab = tabs.find((t) => t.group === r.group);
  return new Set(tab ? tab.levers.map((l) => l.key) : []);
}

// ── Sæta-map { raduneyti-key: handle } — claim/sleppa ──────────────────────────────────────────────────────────────────
// Normalíserar: aðeins gild sæti með gildum handle; sama handle aðeins á EINU sæti (fyrsta í RADUNEYTI-röð heldur). Nýr hlutur.
export function normMap(map) {
  const out = {}; const seen = new Set();
  for (const r of RADUNEYTI) { const h = isObj(map) ? map[r.key] : undefined; if (validHandle(h) && !seen.has(h)) { out[r.key] = h; seen.add(h); } }
  return out;
}
// First-wins per ráðuneyti. Sama handle má aðeins eiga EITT sæti → nýtt claim sleppir fyrra (fyrra = lykill þess eða null).
// Endur-claim á eigin sæti = ok:true, reason 'sama' (idempotent). Breytir ALDREI prevMap (skilar nýju map-i).
export function claimRaduneyti(prevMap, key, handle) {
  const map = normMap(prevMap);
  if (!validKey(key)) return { map, ok: false, reason: 'ogilt_raduneyti' };
  if (!validHandle(handle)) return { map, ok: false, reason: 'ogilt_handle' };
  if (map[key] === handle) return { map, ok: true, reason: 'sama', fyrra: null };
  if (map[key]) return { map, ok: false, reason: 'upptekid' };
  let fyrra = null;
  for (const k of Object.keys(map)) if (map[k] === handle) { fyrra = k; delete map[k]; }
  map[key] = handle;
  return { map, ok: true, reason: 'ok', fyrra };
}
// Aðeins eigandi (handle) má sleppa sæti sínu.
export function releaseRaduneyti(prevMap, key, handle) {
  const map = normMap(prevMap);
  if (!validKey(key)) return { map, ok: false, reason: 'ogilt_raduneyti' };
  if (!validHandle(handle)) return { map, ok: false, reason: 'ogilt_handle' };
  if (!map[key]) return { map, ok: false, reason: 'laust' };
  if (map[key] !== handle) return { map, ok: false, reason: 'ekki_eigandi' };
  delete map[key];
  return { map, ok: true, reason: 'ok' };
}
// Sæti handle-s (eitt eða ekkert) — þjónninn leiðir af þessu HVER er að POSTa (treystir ekki body-inu).
export function raduneytiOf(map, handle) {
  if (!validHandle(handle)) return null;
  const m = normMap(map);
  for (const k of Object.keys(m)) if (m[k] === handle) return k;
  return null;
}
// Picker-UI: RADUNEYTI í fastri röð með {taken, handle|null}.
export function raduneytiStaða(map) {
  const m = normMap(map);
  return RADUNEYTI.map((r) => ({ ...r, taken: !!m[r.key], handle: m[r.key] || null }));
}
export const raduneytiStada = raduneytiStaða;   // ASCII-samheiti

// ── MERGE per sleða ────────────────────────────────────────────────────────────────────────────────────────────────────
// „Tómt" = null/undefined/''/{} /[] — drög clientsins senda alltaf policies:{} og dilemma:null, það má ekki telja sem höfnun.
const tomt = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0) || (isObj(v) && Object.keys(v).length === 0);
const sama = (a, b) => (tomt(a) && tomt(b)) || JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
const samaTala = (a, b) => (Number.isFinite(+a) && Number.isFinite(+b) && a !== '' && b !== '') ? +a === +b : a === b;

// mergeDecisions(prev, incoming, { raduneyti?, handle?, baseline, config }) → NÝR decisions-hlutur (prev/incoming ósnert).
// REGLUR (config.radherrar á):
//   radherrar  prev-map varðveitt; incoming.radherrar = claim-BEIÐNIR {key:handle} um claimRaduneyti (first-wins) — POST getur
//              hvorki stolið sæti né sleppt (sleppa = releaseRaduneyti í sér aðgerð); hafnað claim → hafnad 'radherrar:<key>'.
//   hver ertu  opts.raduneyti (treyst, innri/próf) EÐA leitt af map+opts.handle EFTIR claim-beiðnir (nýr ráðherra má strax
//              stilla sína sleða). Ekkert sæti → engin réttindi á sleða/svið (aðeins læsing um fallback hér að neðan).
//   levers     prev.levers + AÐEINS sleðar eigin ráðuneytis úr incoming; forsaetis = engin sía (allt eins og áður).
//              Sleði utan ráðuneytis er HUNSAÐUR og skráður í hafnad — þó aðeins ef gildið hefði BREYTT stöðunni
//              (drög senda alla 32 sleðana; óbreytt gildi = hljóðlátt).
//   policies/dilemma/satt + öll ÖNNUR svið (t.d. classic-hams lyklar): aðeins forsaetis; annars hunsað + hafnad (ef breyting).
//   locked     aðeins forsaetis má breyta (true EÐA false). FALLBACK: ef ENGINN forsaetis er claim-aður í map-inu má HVER SEM ER
//              læsa/aflæsa — svo leikur festist aldrei þótt liðið velji engan forsætisráðherra. Vantar locked → prev.locked helst.
//   annað      öll önnur svið prev varðveitt. Skilahlutur fær hafnad:[...] (EKKI til geymslu — sjá tilGeymslu).
export function mergeDecisions(prev, incoming, opts = {}) {
  const { baseline, config } = opts;
  if (!radherrarOn(config)) return incoming;   // AFTURFÖR-VÖRN: nákvæmlega gamla hegðunin (sama tilvísun, engin snerting)
  const p = isObj(prev) ? prev : {};
  const inc = isObj(incoming) ? incoming : {};
  const hafnad = [];
  // 1) sæta-map: prev + claim-beiðnir (first-wins)
  let map = normMap(p.radherrar);
  if (isObj(inc.radherrar)) for (const [k, h] of Object.entries(inc.radherrar)) { const c = claimRaduneyti(map, k, h); map = c.map; if (!c.ok) hafnad.push('radherrar:' + k); }
  // 2) hver er að POSTa
  const me = (opts.raduneyti != null) ? (validKey(opts.raduneyti) ? opts.raduneyti : null) : raduneytiOf(map, opts.handle);
  const pm = me === PM;
  const out = { ...p, radherrar: map, locked: !!p.locked };
  // 3) sleðar
  if (isObj(inc.levers)) {
    const mine = pm ? null : raduneytiLevers(me, baseline);
    const prevL = isObj(p.levers) ? p.levers : {};
    const levers = { ...prevL };
    for (const [k, v] of Object.entries(inc.levers)) {
      if (pm || mine.has(k)) { levers[k] = v; continue; }
      const eff = (k in prevL) ? prevL[k] : (baseline && isObj(baseline.levers) && baseline.levers[k] ? baseline.levers[k].base : undefined);
      if (!samaTala(v, eff)) hafnad.push(k);
    }
    out.levers = levers;
  }
  // 4) PM-svið: policies/dilemma/satt og hvaðeina annað sem POST sendir
  for (const f of Object.keys(inc)) {
    if (f === 'levers' || f === 'radherrar' || f === 'locked' || f === 'hafnad') continue;
    if (pm) out[f] = inc[f]; else if (!sama(inc[f], p[f])) hafnad.push(f);
  }
  // 5) læsing
  if (inc.locked !== undefined) {
    const want = !!inc.locked, have = !!p.locked;
    if (pm || !map[PM]) out.locked = want; else if (want !== have) hafnad.push('locked');
  }
  out.hafnad = hafnad;
  return out;
}

// Skiptir merge-niðurstöðu (EÐA incoming óbreyttu þegar config af) í það sem fer í D1: decisions-JSON (án locked/hafnad),
// locked 0|1 (dálkur) og hafnad-listann í svarið.
export function tilGeymslu(merged) {
  const m = isObj(merged) ? merged : {};
  const { hafnad, locked, ...decisions } = m;
  return { decisions, locked: locked ? 1 : 0, hafnad: Array.isArray(hafnad) ? hafnad : [] };
}

// hladvorp_lib.mjs — hrein föll hlaðvarpsvaktarinnar (próf í hladvorp_lib.test.mjs).
// Notað af build_hladvorp.mjs: þátta-val undir kostnaðar-þökum, lengdar-þáttun, SQL-strengir fyrir D1.
// ⚠ Repoið er PUBLIC → umritanir fara ALDREI í gogn/ heldur aðeins í D1 (einka). Lýsigögn (titill/lýsing/
// hlekkur) eru opinber hvort eð er og mega í web/public/gogn/hladvorp.json.

// "HH:MM:SS" | "MM:SS" | "1234" (sek) → mínútur (heiltala, námundað). null ef óþekkt.
export function minOf(dur) {
  const s = String(dur == null ? '' : dur).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Math.round(+s / 60);
  const p = s.split(':').map((x) => +x);
  if (p.some((x) => isNaN(x))) return null;
  const sek = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : null;
  return sek == null ? null : Math.round(sek / 60);
}

// SQL-strengur fyrir D1-batch: einfaldar gæsalappir tvöfaldaðar; NUL/stýristafir burt.
export const sqlStr = (v) => "'" + String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/'/g, "''") + "'";

// Velja þætti til talgreiningar undir kostnaðar-þökum.
//   epis: [{ url, audio, show, feedId, p, d (YYYY-MM-DD), min }] — allir nýlegir þættir með hljóðskrá
//   done: Set af url sem þegar eru umritaðir (úr D1)
//   opts: { maxMinRun=450 (heildar-mínútur per keyrslu), maxEpRun=30, perFeed={feedId:cap} (default 4), maxMin per þátt kemur úr feed-config gegnum epis[].maxMin }
// Röðun: forgangur (p) fyrst, svo nýjast fyrst. Skilar { valdir, sleppt: {buinn, ofLangur, thak} }.
export function veljaThaetti(epis, done, opts) {
  const o = Object.assign({ maxMinRun: 450, maxEpRun: 30 }, opts || {});
  const perFeed = o.perFeed || {};
  const sleppt = { buinn: 0, ofLangur: 0, thak: 0 };
  const cand = (Array.isArray(epis) ? epis : []).filter((e) => {
    if (!e || !e.url || !e.audio) return false;
    if (done && done.has(e.url)) { sleppt.buinn++; return false; }
    const cap = e.maxMin || 90;
    if (e.min != null && e.min > cap) { sleppt.ofLangur++; return false; }
    return true;
  }).sort((a, b) => ((a.p || 9) - (b.p || 9)) || String(b.d || '').localeCompare(String(a.d || '')));
  const valdir = [];
  let minSum = 0;
  const perFeedN = {};
  for (const e of cand) {
    const fcap = perFeed[e.feedId] != null ? perFeed[e.feedId] : 4;
    const em = e.min != null ? e.min : 45;   // óþekkt lengd → gera ráð fyrir 45 mín í þakinu
    if (valdir.length >= o.maxEpRun || minSum + em > o.maxMinRun || (perFeedN[e.feedId] || 0) >= fcap) { sleppt.thak++; continue; }
    valdir.push(e);
    minSum += em;
    perFeedN[e.feedId] = (perFeedN[e.feedId] || 0) + 1;
  }
  return { valdir, minSum, sleppt };
}

// D1-batch fyrir eina keyrslu: CREATE TABLE IF NOT EXISTS + INSERT OR REPLACE per umritaðan þátt + trim.
// texti er KLIPPTUR í 60.000 stafi (D1-statement þak er 100KB; 90 mín ≈ 80KB texti) — samsvörun nær samt
// nánast öllu (klippt aftast). ts = unix-sekúndur útgáfudags.
export function d1Batch(rows, nowSek) {
  const out = ["CREATE TABLE IF NOT EXISTS hladvorp (url TEXT PRIMARY KEY, show TEXT, title TEXT, ts INTEGER, dur INTEGER, texti TEXT);"];
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!r || !r.url || !r.texti) continue;
    out.push(`INSERT OR REPLACE INTO hladvorp (url, show, title, ts, dur, texti) VALUES (${sqlStr(r.url)}, ${sqlStr(r.show)}, ${sqlStr(r.title)}, ${Math.floor(+r.ts || 0)}, ${Math.floor(+r.dur || 0)}, ${sqlStr(String(r.texti).slice(0, 60000))});`);
  }
  out.push(`DELETE FROM hladvorp WHERE ts < ${Math.floor((+nowSek || 0) - 90 * 86400)};`);
  return out.join('\n');
}

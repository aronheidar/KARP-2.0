// sentiment-ai.mjs — HREIN rökvísi fyrir AI-tónmat frétta (build_sentiment_ai.mjs notar hana).
// Aðskilið frá I/O svo þáttun á svari líkansins sé prófanleg — það er þar sem svona skriptur bila.

/** Efni sem sent er líkaninu: fyrirsögn + stutt lýsing (meira samhengi en fyrirsögn ein). */
export function promptLine(row, i) {
  const t = String((row && row.title) || '').replace(/\s+/g, ' ').trim();
  const body = String((row && row.body) || '').replace(/\s+/g, ' ').trim();
  // body byrjar oftast á fyrirsögninni (worker: body = title + ' ' + desc) → sleppum tvítekningu
  let extra = body.startsWith(t) ? body.slice(t.length).trim() : body;
  extra = extra.slice(0, 160);
  return `${i + 1}. ${t}${extra ? ' — ' + extra : ''}`;
}

/**
 * Þáttar svar líkansins í tölur. Líkanið á að skila JSON-fylki af -1|0|1 í sömu röð.
 * VERÐUR að vera hart: rangt lengdarsvar má ALDREI valda því að rangur tónn lendi á rangri frétt.
 * @returns {number[]|null} null ef svarið er ónothæft (þá er lotan endurreynd/sleppt)
 */
export function parseScores(text, expected) {
  if (typeof text !== 'string' || !(expected > 0)) return null;
  // Leyfum ```json ... ``` og texta í kring — tökum fyrsta fylkið.
  const m = text.match(/\[[\s\S]*?\]/);
  if (!m) return null;
  let arr;
  try { arr = JSON.parse(m[0]); } catch (e) { return null; }
  if (!Array.isArray(arr) || arr.length !== expected) return null;   // lengd VERÐUR að stemma
  const out = [];
  for (const v of arr) {
    const n = typeof v === 'number' ? v : (typeof v === 'string' ? parseFloat(v) : NaN);
    if (!Number.isFinite(n)) return null;
    out.push(n > 0 ? 1 : n < 0 ? -1 : 0);   // klemmt í -1|0|1
  }
  return out;
}

/** SQL til að skrifa lotu til baka — ein setning, bundnar breytur (ekkert innskeytt). */
export function updateStmt(rows, scores) {
  if (!Array.isArray(rows) || !Array.isArray(scores) || rows.length !== scores.length || !rows.length) return null;
  // CASE-uppfærsla: ein ferð per lotu í stað N ferða.
  const cases = rows.map(() => 'WHEN ? THEN ?').join(' ');
  const binds = [];
  rows.forEach((r, i) => { binds.push(r.url, scores[i]); });
  const urls = rows.map(() => '?').join(',');
  rows.forEach((r) => binds.push(r.url));
  return { sql: `UPDATE news SET sent_ai = CASE url ${cases} END WHERE url IN (${urls})`, binds };
}

// kyc.mjs — hrein diff-vél Áreiðanleikavaktarinnar (engin I/O; einingaprófuð). Sjá spec 2026-07-26.
import { advSeverity } from './adverse-media.mjs';

export const SEVERITY_RANK = { critical: 3, high: 2, info: 1 };

export function canon(v) {
  if (Array.isArray(v)) { const a = v.map(canon); a.sort(); return '[' + a.join(',') + ']'; }
  if (v && typeof v === 'object') { return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'; }
  return JSON.stringify(v === undefined ? null : v);
}
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
const _key = (list, kf) => new Map((list || []).map((it) => [kf(it), it]));
const _added = (prev, cur, kf) => { const p = _key(prev, kf); return (cur || []).filter((it) => !p.has(kf(it))); };
const _removed = (prev, cur, kf) => { const c = _key(cur, kf); return (prev || []).filter((it) => !c.has(kf(it))); };

// prev===null => grunnlína, engin breyting.
export function signalEvents(signal, prev, cur) {
  if (prev == null) return [];
  cur = cur || {};
  const ev = [];
  if (signal === 'sanctions') {
    for (const h of _added(prev.hits, cur.hits, (x) => x.name)) ev.push({ kind: 'sanctions_hit', severity: 'critical', detail: h });
    // Samsvörun sem hvílir EINGÖNGU á fyrsta+síðasta tókeni er lækkuð úr sterka laginu
    // (refsilistar.mjs, spec 2026-08-01). Hún má ekki hverfa þögult — 'info' ratar í
    // kyc_event og audit-slóðina, en _kycAfterEvents (veitur.mjs:339) sendir aðeins póst
    // fyrir 'critical'. Eins-orðs lagið ('einsords') er ÓBREYTT og gefur enga atburði.
    // Eldra snapshot án veikar-lykils = grunnlína fyrir þetta undirmerki, eins og
    // 'beneficial' hér að neðan — annars yrði hver fyrirliggjandi samsvörun að nýjum atburði.
    if (prev.veikar !== undefined) {
      for (const w of _added(prev.veikar, cur.veikar, (x) => x.name)) {
        if (w && w.tegund === 'jadar') ev.push({ kind: 'sanctions_weak', severity: 'info', detail: w });
      }
    }
  } else if (signal === 'legal') {
    for (const n of _added(prev.notices, cur.notices, (x) => x.ref)) ev.push({ kind: (n.type || 'legal'), severity: 'critical', detail: n });
  } else if (signal === 'pep') {
    for (const m of _added(prev.matches, cur.matches, (x) => x.name)) ev.push({ kind: 'pep_change', severity: 'high', detail: m });
  } else if (signal === 'ubo') {
    // Beinir eigendur (raunverulegir/hluthafar) — óbreytt hegðun.
    for (const o of _added(prev.owners, cur.owners, (x) => x.key)) ev.push({ kind: 'new_ubo', severity: 'high', detail: o });
    for (const o of _removed(prev.owners, cur.owners, (x) => x.key)) ev.push({ kind: 'removed_ubo', severity: 'high', detail: o });
    // Endanlegir raunverulegir eigendur (≥25%, óbeint rakðir). Eldri snapshot ÁN 'beneficial'-lykils
    // = grunnlína fyrir þetta undirmerki → engir falskir atburðir við fyrstu skimun eftir uppfærslu.
    if (prev.beneficial !== undefined) {
      for (const o of _added(prev.beneficial, cur.beneficial, (x) => x.key)) ev.push({ kind: 'new_beneficial', severity: 'high', detail: o });
      for (const o of _removed(prev.beneficial, cur.beneficial, (x) => x.key)) ev.push({ kind: 'removed_beneficial', severity: 'high', detail: o });
    }
  } else if (signal === 'board') {
    for (const b of _added(prev.members, cur.members, (x) => x.key + '|' + x.hlutverk)) ev.push({ kind: 'board_change', severity: 'info', detail: { ...b, breyting: 'baett_vid' } });
    for (const b of _removed(prev.members, cur.members, (x) => x.key + '|' + x.hlutverk)) ev.push({ kind: 'board_change', severity: 'info', detail: { ...b, breyting: 'horfid' } });
  } else if (signal === 'status') {
    if (cur.gjaldthrot && !prev.gjaldthrot) ev.push({ kind: 'bankruptcy', severity: 'critical', detail: { stada: cur.stada } });
    if (cur.afskrad && !prev.afskrad) ev.push({ kind: 'status_change', severity: 'high', detail: { afskrad: 1, stada: cur.stada } });
    else if (cur.stada !== prev.stada) ev.push({ kind: 'status_change', severity: 'high', detail: { stada: cur.stada, adur: prev.stada } });
  } else if (signal === 'skil') {
    // ársreikningaskil (RSK "félög í vanskilum") — opið, óleyfisskylt: ný vanskilaár = high, komin í skil aftur = info.
    for (const y of _added(prev.years, cur.years, (x) => x.ar)) ev.push({ kind: 'filing_default', severity: 'high', detail: y });
    for (const y of _removed(prev.years, cur.years, (x) => x.ar)) ev.push({ kind: 'filing_resolved', severity: 'info', detail: y });
  } else if (signal === 'tax') {
    for (const c of _added(prev.claims, cur.claims, (x) => x.ref)) ev.push({ kind: 'tax_claim', severity: 'high', detail: c });
  } else if (signal === 'media') {
    for (const t of _added(prev.titles, cur.titles, (x) => x.h)) ev.push({ kind: 'adverse_media', severity: 'info', detail: t });
  } else if (signal === 'fatf') {
    // FATF-flokkað adverse media (10. merkið, spec 2026-08-01): frosnar flokkanir úr kyc_adverse.
    // Alvarleiki ræðst af flokknum (þvætti/þvinganir → critical → strax-póstur um _kycAfterEvents).
    // Færslur hverfa aldrei úr frosnu töflunni → aðeins _added, engin „horfið"-atburðamyndun.
    for (const m of _added(prev.hits, cur.hits, (x) => x.h)) ev.push({ kind: 'adverse_fatf', severity: advSeverity(m.flokkur), detail: m });
  }
  return ev;
}
// Merkin sem áhættustigið er dregið af. Vanti eitthvert þeirra er ekki hægt að fullyrða neitt undir „Há".
export const RISK_SIGNALS = ['sanctions', 'pep', 'legal', 'status', 'skil', 'tax', 'media', 'fatf'];

// `na` = { merki: true } fyrir heimildir sem SVÖRUÐU EKKI (ólíkt heimild sem svaraði engu).
// Skilar null þegar ekki er hægt að álykta — kallandi má þá EKKI skrifa yfir fyrra stig.
//
// ⚠ Ósamhverfan er viljandi: „Há" er fullyrðing um gögn sem FUNDUST og stendur því þótt aðrar
// heimildir vanti. „Venjuleg" og „Lág" eru fullyrðingar um FJARVERU og krefjast þess að allar
// heimildir hafi svarað — annars var refsilista-bilun einfaldlega lesin sem „engar samsvaranir".
export function deriveRisk(s, na) {
  s = s || {};
  const L = (sig) => s[sig] || {};
  if ((L('sanctions').hits || []).length || L('status').gjaldthrot ||
      (L('legal').notices || []).some((n) => n.type === 'bankruptcy')) return 'Há';
  if (RISK_SIGNALS.some((sig) => (na && na[sig]) || !s[sig])) return null;
  // ⚠ AI-flokkað adverse media (fatf) hækkar tillögu-stigið aldrei upp fyrir „Venjuleg" eitt og
  //   sér — „Há" er frátekið fyrir deterministic staðreyndir (refsilistar, gjaldþrot). Röng
  //   AI-flokkun má aldrei ein og sér stimpla félag „Há"; critical-ATBURÐURINN sér um hraðboðin.
  if ((L('pep').matches || []).length || (L('tax').claims || []).length || (L('skil').years || []).length || L('status').afskrad ||
      (L('legal').notices || []).length || (L('media').titles || []).length || (L('fatf').hits || []).length) return 'Venjuleg';
  return 'Lág';
}

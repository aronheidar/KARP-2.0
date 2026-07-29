// vaktir-signals.mjs — hrein rökvél fyrir eftirlits-/byggingar-vöktun (engin I/O; prófuð).
// Deilt af worker.js digest (eftirlit→firmavakt eftir kt, bygging→fastvakt eftir póstnr/götu).

// Nýleiki eftir ISO-dagsetningu vs viku-mörk (yyyy-mm-dd streng, sama og digest wkDate). true ef iso >= wkDate.
export function eftNylegt(iso, wkDate) {
  const d = String(iso == null ? '' : iso).slice(0, 10);
  return !!d && !!wkDate && d >= String(wkDate);
}

// Byggingar-pörun við fastvakt-leitarorð q: 3ja-stafa q → póstnúmer (item.pn===q); annars gatna-forskeyti
// (item.a lágstafað byrjar á q). Tómt q → false. Sleppir sv (byggingar bera hverfi, ekki kaupskrá-svæði).
export function byggMatch(item, q) {
  const s = String(q == null ? '' : q).toLowerCase().trim();
  if (!s || !item) return false;
  if (/^\d{3}$/.test(s)) return String(item.pn || '') === s;
  return String(item.a || '').toLowerCase().startsWith(s);
}

// Merkingarbær röð-hreyfing (áfangar + stór stökk) fyrir greina-vöktun. prev/cur = {rank} (eða null).
// Áfangar: fer inn/út úr topp-1/3/5/10. Stökk: |Δ|>=3. Smá-rek (±1-2) → null.
// Skilar { dir:'up'|'down', kind:'milestone'|'jump', badge, fromRank, toRank } eða null.
const _RANK_TIERS = [1, 3, 5, 10];
function _rankTier(r) { for (const t of _RANK_TIERS) if (r <= t) return t; return Infinity; }
export function rankMovement(prev, cur) {
  const p = (prev && Number.isFinite(prev.rank)) ? prev.rank : null;
  const c = (cur && Number.isFinite(cur.rank)) ? cur.rank : null;
  if (p == null || c == null || p === c) return null;
  const dir = c < p ? 'up' : 'down';
  const tp = _rankTier(p), tc = _rankTier(c);
  const delta = Math.abs(c - p);
  const milestone = tp !== tc;
  if (!milestone && delta < 3) return null;
  let badge;
  if (c === 1 && p > 1) badge = '🥇 nýtt #1 í greininni';
  else if (milestone && dir === 'up') badge = '↑ í topp ' + tc;
  else if (milestone && dir === 'down') badge = '↓ úr topp ' + tp;
  else badge = (dir === 'up' ? '↑ ' : '↓ ') + delta + ' sæti';
  return { dir, kind: milestone ? 'milestone' : 'jump', badge, fromRank: p, toRank: c };
}

// Áttavís einkunna-breyting (heilbrigðiseftirlit 0-5). prev/cur = tölur eða null.
// Skilar { dir:'up'|'down', from, to, badge } eða null (óbreytt / engin saga / ógilt).
export function ratingMovement(prev, cur) {
  const p = Number.isFinite(prev) ? prev : null;
  const c = Number.isFinite(cur) ? cur : null;
  if (p == null || c == null || p === c) return null;
  const dir = c > p ? 'up' : 'down';
  const badge = dir === 'down' ? ('↓ féll úr ' + p + ' í ' + c) : ('↑ hækkaði úr ' + p + ' í ' + c);
  return { dir, from: p, to: c, badge };
}

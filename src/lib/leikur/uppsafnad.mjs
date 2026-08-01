// F1-V4: Uppsafnaðar KPI-seríur yfir allan leikinn — hrein eining (engin háð).
// Inntak: rounds = [{round, kpis}] í röð fyrir EITT lið (kpis = per-lotu gildi úr leikur_results).
// Vísitölur (verdlag/vlf/kaupmattur) byrja í 100 árið 2000 og vaxa ×(1+X/100)^4 per lotu (4 ár per kjörtímabil).
// skuldir = beint stöðu-gildi per lotu (engin umbreyting); losun = hlaupandi summa losun×4 („vísitölu-ár").
// Vantar KPI í lotu → 0% breyting / síðasta level endurtekið (aldrei NaN); tómt inntak → tómar seríur.

const r1 = (v) => Math.round(v * 10) / 10;
const fin = (v) => typeof v === 'number' && isFinite(v);

export function uppsafnadSeries(rounds = []) {
  const out = { verdlag: [], vlf: [], kaupmattur: [], skuldir: [], losun: [] };
  let verdlag = 100, vlf = 100, kaup = 100, skuldir = 0, losun = 0;
  const grow = (cur, pct) => fin(pct) ? cur * Math.pow(1 + pct / 100, 4) : cur;
  for (const r of (rounds || [])) {
    const k = (r && r.kpis) || {};
    verdlag = grow(verdlag, k.verdbolga);
    vlf = grow(vlf, k.hagvoxtur);
    kaup = grow(kaup, k.kaupmattur);
    if (fin(k.skuldir)) skuldir = k.skuldir;
    if (fin(k.losun)) losun += k.losun * 4;
    const rd = (r && r.round != null) ? r.round : out.verdlag.length + 1;
    out.verdlag.push({ round: rd, value: r1(verdlag) });
    out.vlf.push({ round: rd, value: r1(vlf) });
    out.kaupmattur.push({ round: rd, value: r1(kaup) });
    out.skuldir.push({ round: rd, value: skuldir });
    out.losun.push({ round: rd, value: r1(losun) });
  }
  return out;
}

// Lokagildi hverrar seríu (síðasta punkts-gildi) — eða null ef serían er tóm/vantar.
export function uppsafnadLoka(series) {
  const s = series || {};
  const last = (a) => (Array.isArray(a) && a.length) ? a[a.length - 1].value : null;
  return { verdlag: last(s.verdlag), vlf: last(s.vlf), kaupmattur: last(s.kaupmattur), skuldir: last(s.skuldir), losun: last(s.losun) };
}

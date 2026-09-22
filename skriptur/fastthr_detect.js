// fastthr_detect.js — hreinn fréttavél-skynjari: íbúðamarkaðurinn skiptir um takt (fasteignir.json). CommonJS; engin fs/net.
// pickFastthr(fa, grunnur, {todayISO}) → { cand: [{manudur, verdict, ordalag, fyrri, fyrriManudur, chg3, chg12, n}],
//                                          grunnur: {dags, manudur, verdict} }
//
// AF HVERJU (22.9.2026): dómurinn var reiknaður á SÍÐASTA mánuðinum í months — og sá mánuður er enn að fyllast.
// Þinglýsingar skila sér í kaupskrá HMS vikum saman eftir á, svo chg3 sveiflast meðan mánuðurinn fyllist og
// skynjarinn birti hverja sveiflu sem frétt. Úr git-sögu gogn/fasteignir.json, júlí 2026 (n = hbsv+land):
//   15.7 n=331 flat · 16.–22.7 n=375→502 cooling · 23.7 n=516 FLAT · 25.7 n=588 DOWN · 29.7 n=660 COOLING
//   30.–31.7 n=699→741 cooling · 1.–13.8 n=758→784 cooling ×14 — óbreytt eftir að mánuðinum lauk.
// Þrjár mótsagnakenndar fréttir um sama mánuðinn (23.7 „stóð í stað", 25.7 „lækkar um 2,5%", 29.7 „lækkaði um 2,2%").
// Sama mynstur sést í öllum mánuðum sögunnar: dómurinn er stöðugur frá FYRSTA degi eftir mánaðamót (júlí cooling ×14
// frá 1.8, ágúst up ×4 frá 1.9, júní cooling ×2 frá 1.7) en aldrei stöðugur á meðan mánuðurinn líður.
//
// Reglurnar:
//  1. AÐEINS LIÐINN MÁNUÐUR. months[síðasti] verður að vera á undan almanaksmánuði keyrsludagsins. Það eitt hefði
//     komið í veg fyrir allar fjórar júlí-keyrslurnar sem birtu frétt.
//  2. LÁGMARKSFJÖLDI KAUPA. Liðinn mánuður getur samt verið hálfur ef HMS er seint á ferð (19.8 var ágúst með 301 kaup
//     — 41% af venjulegum mánuði — og sá dómur var birtur). Krafan er MIN_HLUTFALL af miðgildi VIDMID_MANUDIR næstu
//     mánaða á undan. Kvarðað á raungildum: júlí 1.8 var 758/728 = 104%, ágúst 1.9 var 531/728 = 73%, svo 60% hleypir
//     réttum mánuðum í gegn en stöðvar hálfan mánuð.
//  3. DAGSETTUR GRUNNUR. Grunnurinn geymir {dags, manudur, verdict}. Borið er saman þegar bilið milli mánaðanna er
//     1–MAX_BIL_MAN mánuðir: chg3 er þriggja mánaða breyting, svo grunnur eldri en það á sér EKKERT sameiginlegt
//     tímabil með nýja dómnum og „breytingin" spannaði þá óséð bil. Grunnur á undan keyrsludeginum er ekki borinn saman.
//  4. GAMLA SNIÐIÐ ENDURSTILLIST Í ÞÖGN. state.fastVerdict var ber strengur ("cooling"); hann er ekki borinn saman.
//  5. BILUÐ SKRÁ ÞURRKAR ALDREI GRUNNINN. Vanti skrána, direction, chg3 eða sé dómurinn utan orðaforðans skilar
//     skynjarinn grunninum ÓBREYTTUM — annars týndist samanburðurinn og næsta raunbreyting fyndist ekki.
//  6. AÐEINS EINN VIÐBURÐUR. Einn mánuður, einn dómur, einn frambjóðandi — aldrei flóð.
//
// ⚠ ORÐALAG er orðaforði build_fasteignir.js (flat/up/down/cooling) og ekkert umfram hann. Fyrra kortið kunni
//   cooling/heating/stable, svo flat/up/down runnu í gegn sem hrá ensk orð í fyrirsögn. Prófið les build_fasteignir.js
//   og fellur ef orðaforðinn skilur á milli.
'use strict';

const ORDALAG = { up: 'hitnar', down: 'lækkar', cooling: 'kólnar', flat: 'stendur í stað' };
const MIN_HLUTFALL = 0.6;
const VIDMID_MANUDIR = 12;
const MIN_VIDMID = 6;
const MAX_BIL_MAN = 3;

const ISO = /^\d{4}-\d{2}-\d{2}/;
const MAN = /^\d{4}-\d{2}$/;
const iso = (s) => (typeof s === 'string' && ISO.test(s) ? s.slice(0, 10) : null);
const man = (s) => (typeof s === 'string' && MAN.test(s) ? s : null);
const manTala = (m) => { const [a, b] = m.split('-').map(Number); return a * 12 + (b - 1); };
const kaup = (m) => (m && m.hbsv ? m.hbsv.n || 0 : 0) + (m && m.land ? m.land.n || 0 : 0);
const midgildi = (a) => { const s = a.slice().sort((x, y) => x - y), i = s.length >> 1; return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };

function pickFastthr(fa, grunnur, opts) {
  const oBreytt = { cand: [], grunnur };
  const dags = iso(opts && opts.todayISO);
  const dir = fa && fa.direction;
  const months = fa && Array.isArray(fa.months) ? fa.months : null;
  if (!dags || !dir || !months || !months.length) return oBreytt;

  const manudur = man(dir.updated);
  const verdict = typeof dir.verdict === 'string' ? dir.verdict : null;
  if (!manudur || !verdict || !ORDALAG[verdict] || typeof dir.chg3 !== 'number') return oBreytt;
  // direction á við SÍÐASTA mánuðinn í months; sé það ekki svo er skráin ósamræm og ekki marktæk.
  if (man(months[months.length - 1] && months[months.length - 1].m) !== manudur) return oBreytt;

  // 1. Mánuðurinn verður að vera liðinn.
  if (manTala(manudur) >= manTala(dags.slice(0, 7))) return oBreytt;

  // 2. Nógu mörg kaup miðað við næstu mánuði á undan.
  const vidmid = months.slice(Math.max(0, months.length - 1 - VIDMID_MANUDIR), months.length - 1).map(kaup);
  if (vidmid.length < MIN_VIDMID) return oBreytt;
  const n = kaup(months[months.length - 1]);
  if (n < MIN_HLUTFALL * midgildi(vidmid)) return oBreytt;

  // Hér er dómurinn settur: grunnurinn færist fram hvort sem frétt verður til eða ekki.
  const nyr = { dags, manudur, verdict };

  // 3.–4. Samanburður aðeins við gildan, dagsettan grunn í hæfilegri fjarlægð.
  const g = grunnur && typeof grunnur === 'object' && man(grunnur.manudur) && iso(grunnur.dags) && typeof grunnur.verdict === 'string' ? grunnur : null;
  if (!g || iso(g.dags) > dags) return { cand: [], grunnur: nyr };
  const bil = manTala(manudur) - manTala(g.manudur);
  if (bil < 1 || bil > MAX_BIL_MAN || g.verdict === verdict) return { cand: [], grunnur: nyr };

  // 6. Nákvæmlega einn frambjóðandi.
  return {
    cand: [{ manudur, verdict, ordalag: ORDALAG[verdict], fyrri: g.verdict, fyrriManudur: g.manudur,
      chg3: dir.chg3, chg12: typeof dir.chg12 === 'number' ? dir.chg12 : null, n }],
    grunnur: nyr,
  };
}

module.exports = { pickFastthr, ORDALAG };

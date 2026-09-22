// sent_detect.js — hreinn fréttavél-skynjari: tónsveifla í fjölmiðlaumfjöllun félags. CommonJS; engin fs/net.
// pickSent(se, grunnur, {max=3}) → { cand: [{nafn, fra, i, n, w}], grunnur: {dags, idx: {nafn: idx}, birt: {nafn: dags}} }
//
// AF HVERJU (22.9.2026): sentiment.json stóð óbreytt frá 28.6 til 22.9 og state.sent geymdi júnígildin. Næsta keyrsla
// hefði borið þriggja mánaða gamalt gildi saman við daginn í dag og birt „IKEA fór úr -100 í 29" sem frétt. Samanburður
// er því aðeins gerður við grunn sem er í mesta lagi GRUNNUR_DAGAR eldri en skráin, og grunnurinn geymir aðeins félög
// með a.m.k. LAGMARK_FRETTA fréttum (júnígildið -100 hvíldi á örfáum fréttum). Grunnur á gamla sniðinu ({nafn: idx},
// án dagsetningar) er ekki borinn saman: fyrsta keyrsla endurstillir í þögn.
// (Staðfest í sögunni: þegar skráin lifnaði 22.9 höfðu SEX félög sveiflast um ≥ 40 stig frá 28.6 — Arion −83→−25,
//  Íslandsbanki 40→−24, Kvika −75→−27, Hagar −44→41, Eimskip 20→−44, Costco 17→−33. Dagsetningarvörnin stöðvar þau öll.)
//
// VIÐBÓT (22.9.2026) — tvær eyður eftir:
//  1. HÁLF SKRÁ ÞURRKAÐI GRUNNINN. build_sentiment_samantekt.mjs (sem bakar skrána daglega úr D1 news.sent_ai)
//     stöðvar TÓMA niðurstöðu við upptökin — en ekki hálfa: skili D1 aðeins fáum félögum með tón er skráin skrifuð
//     með gildri `updated`. Grunnurinn varð þá dagsett vörpun sem geymdi nær ekkert — lítur gild út, og næsta
//     raunsveifla hinna félaganna fyndist ekki. Beri skráin færri en HLUTFALL af þeim félögum sem grunnurinn geymir
//     er hún ekki marktæk: grunnurinn stendur ÓBREYTTUR. Tóma tilvikið er varið hér líka, sem dýpt í vörninni.
//  2. FLÖKT BIRTI SÖMU SVEIFLU AFTUR. idx = round(meðaltal skora × 100) yfir allar fréttir félagsins. Hjá litlu félagi
//     geta TVÆR nýjar fréttir fært vísitöluna um 40+ stig — og til baka daginn eftir. Í skránni eru níu af 28 félögum
//     með n ≤ 12, og hjá CCP Games (n=6), JBT Marel (n=7) og Indó (n=7) duga tvær fréttir til að rjúfa þröskuldinn.
//     Hver sveifla varð ný frétt, og `sent-${TODAY}-…` gaf henni nýtt id svo seen-dedup stöðvaði hana ekki.
//     `birt` geymir því síðasta birtingardag hvers félags og sama félag fær ekki aðra tónfrétt fyrr en eftir KAELING
//     daga. Sama hugsun og „einn atburður per svæði per ársfjórðung" í svaedi_detect, en nákvæm í dögum.
'use strict';

const LAGMARK_FRETTA = 5;
const THROSKULDUR = 40;
const GRUNNUR_DAGAR = 3;
const HLUTFALL = 0.5;
const KAELING = 30;

const ISO = /^\d{4}-\d{2}-\d{2}/;
const iso = (s) => (typeof s === 'string' && ISO.test(s) ? s.slice(0, 10) : null);
const dagur = (s) => Date.parse(String(s).slice(0, 10) + 'T00:00:00Z') / 86400000;

function pickSent(se, grunnur, opts) {
  const max = (opts && opts.max) || 3;
  const dags = iso(se && se.updated);
  const companies = (se && se.companies) || {};
  // Skrá án gildrar dagsetningar segir ekkert: grunnurinn stendur.
  if (!dags) return { cand: [], grunnur };

  const nyIdx = {};
  for (const [nafn, d] of Object.entries(companies)) {
    if (d && typeof d.idx === 'number' && (d.n || 0) >= LAGMARK_FRETTA) nyIdx[nafn] = d.idx;
  }
  const g = grunnur && typeof grunnur === 'object' && grunnur.idx && typeof grunnur.idx === 'object' ? grunnur : null;
  const fyrriFjoldi = g ? Object.keys(g.idx).length : 0;
  // 1. Tóm eða hálf skrá er ekki marktæk (á aðeins við þegar grunnurinn geymir eitthvað til að vernda).
  if (fyrriFjoldi && Object.keys(nyIdx).length < HLUTFALL * fyrriFjoldi) return { cand: [], grunnur };

  // Kælingarskráin: aðeins færslur sem eru enn í gildi (hún vex því ekki endalaust).
  const birt = {};
  if (g && g.birt && typeof g.birt === 'object') {
    for (const [nafn, d] of Object.entries(g.birt)) {
      if (iso(d) && dagur(dags) - dagur(d) < KAELING) birt[nafn] = iso(d);
    }
  }

  const dagsett = g && iso(g.dags) ? g : null;
  const bil = dagsett ? dagur(dags) - dagur(dagsett.dags) : NaN;
  const cand = [];
  if (bil >= 0 && bil <= GRUNNUR_DAGAR) {
    for (const [nafn, i] of Object.entries(nyIdx)) {
      const fra = dagsett.idx[nafn];
      if (typeof fra !== 'number' || Math.abs(i - fra) < THROSKULDUR) continue;
      if (birt[nafn]) continue;   // 2. félagið er enn í kælingu eftir fyrri tónfrétt
      cand.push({ nafn, fra, i, n: companies[nafn].n, w: Math.abs(i - fra) });
    }
  }
  cand.sort((a, b) => b.w - a.w);
  const valin = cand.slice(0, max);
  for (const c of valin) birt[c.nafn] = dags;
  return { cand: valin, grunnur: { dags, idx: nyIdx, birt } };
}

module.exports = { pickSent };

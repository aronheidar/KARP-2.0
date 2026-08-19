// svaedi_detect.js — hreinn fréttavél-skynjari: FASTEIGNAVERÐ PER MATSSVÆÐI HMS. CommonJS; engin import (deps injectuð).
// Gögn: gogn/matssvaedi_solur.json byZone (build_fasteignaskra.js, nætur-CI): { heiti, n12, nFjol, nSer, medFjol, medSer,
// prevFjol, prevSer, nPrev, man:{fra, med[24], n[24]} } — þ.kr/m² miðgildi sl. 12 mán og 12 mán þar á undan.
// Regla: ráðandi hluti (fjölbýli ef ≥30 kaup í glugganum, annars sérbýli) víkur ≥ thr (6%) milli ára, ≥40 kaup sl. 12 mán
// og ≥30 þar á undan. Einn atburður per svæði per ÁRSFJÓRÐUNG (id), mest `max` (4) per keyrslu raðað eftir |breyting|·log(n)
// — dagleg 3/tegund-þak fréttavélarinnar dreifir restinni á næstu daga. URL = /fasteignaverd/<slug>/ (sama slugify og síðurnar).
// pickSvaedi(byZone, {todayISO, slugify, hms?, minN=40, minPrev=30, minTeg=30, thr=0.06, max=4}) → [ev]
'use strict';

const pcS = (v) => String(Math.round(Math.abs(v) * 1000) / 10).replace('.', ',');
const kr = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
// brúa null (mánuðir með <3 kaup) fram á við og aftur á bak svo sparkline sé samfelld tala-röð
function fill(arr) {
  const a = (arr || []).slice(); let last = null;
  for (let i = 0; i < a.length; i++) { if (a[i] == null) a[i] = last; else last = a[i]; }
  last = null;
  for (let i = a.length - 1; i >= 0; i--) { if (a[i] == null) a[i] = last; else last = a[i]; }
  return a.filter((x) => typeof x === 'number');
}

function pickSvaedi(byZone, opts) {
  const o = Object.assign({ minN: 40, minPrev: 30, minTeg: 30, thr: 0.06, max: 4 }, opts || {});
  if (!o.todayISO || typeof o.slugify !== 'function') return [];
  const d = new Date(o.todayISO + 'T00:00:00Z');
  const qid = d.getUTCFullYear() + 'Q' + (Math.floor(d.getUTCMonth() / 3) + 1);
  const cands = [];
  for (const [nr, z] of Object.entries(byZone || {})) {
    if (!z || !z.heiti || !(z.n12 >= o.minN) || !(z.nPrev >= o.minPrev)) continue;
    const segs = [];
    if (z.nFjol >= o.minTeg && z.medFjol > 0 && z.prevFjol > 0) segs.push({ teg: 'fjölbýli', med: z.medFjol, prev: z.prevFjol, n: z.nFjol, lyk: 'fjol' });
    if (z.nSer >= o.minTeg && z.medSer > 0 && z.prevSer > 0) segs.push({ teg: 'sérbýli', med: z.medSer, prev: z.prevSer, n: z.nSer, lyk: 'ser' });
    if (!segs.length) continue;
    const main = segs.slice().sort((a, b) => b.n - a.n)[0];
    const chg = main.med / main.prev - 1;
    if (!(Math.abs(chg) >= o.thr)) continue;
    cands.push({ nr, z, main, segs, chg, score: Math.abs(chg) * Math.log(z.n12) });
  }
  cands.sort((a, b) => b.score - a.score || String(a.nr).localeCompare(String(b.nr)));
  return cands.slice(0, o.max).map(({ nr, z, main, segs, chg }) => {
    const up = chg >= 0;
    const other = segs.find((s) => s !== main);
    const hms = o.hms && o.hms[String(nr)];
    const br = hms ? (main.lyk === 'fjol' ? hms.br_fjol : hms.br_ser) : null;
    // Svæðisheiti eru í NEFNIFALLI (Akranes, Kópavogur: Lindir…) — titill án forsetningar svo ekkert beygist rangt.
    const title = `${z.heiti}: fasteignaverð ${up ? 'hækkaði' : 'lækkaði'} um ${pcS(chg)}% milli ára`;
    const text = `Miðgildi verðs á fermetra í ${main.teg} í matssvæðinu ${z.heiti} var ${kr(main.med)} þúsund krónur síðustu tólf mánuði (${main.n} þinglýst kaup) — ${pcS(chg)}% ${up ? 'hærra' : 'lægra'} en tólf mánuðina þar á undan (${kr(main.prev)} þús.kr á fermetra).`
      + (other ? ` Í ${other.teg} var miðgildið ${kr(other.med)} þús.kr (${other.med >= other.prev ? '+' : '−'}${pcS(other.med / other.prev - 1)}%, ${other.n} kaup).` : '')
      + ` Alls voru ${z.n12} þinglýst kaup íbúðarhúsnæðis í svæðinu á tímabilinu samkvæmt kaupskrá HMS.`
      + (typeof br === 'number' ? ` Til samanburðar breytist fasteignamat 2027 í svæðinu um ${br >= 0 ? '+' : '−'}${pcS(br)}% (${main.teg}) samkvæmt HMS.` : '')
      + (Math.abs(chg) >= 0.12 ? ' Svo mikil breyting á miðgildi getur að hluta stafað af breyttri samsetningu sala, til dæmis nýbyggingum eða fáum stórum eignum, fremur en almennri verðhækkun sömu eigna.' : '');
    const spark = z.man && Array.isArray(z.man.med) ? fill(z.man.med) : [];
    return {
      id: `svaedi-${nr}-${qid}`, type: 'svaedi', title, text,
      url: `/fasteignaverd/${o.slugify(z.heiti)}/`,
      spark: spark.length >= 4 ? spark : undefined,
      facts: { svaedi: z.heiti, matssvaedi_nr: +nr, tegund: main.teg, midgildi_thus_m2: main.med, fyrra_ar_thus_m2: main.prev, breyting12: Math.round(chg * 1000) / 1000, kaup_tegund_12man: main.n, kaup_alls_12man: z.n12, kaup_fyrra_12man: z.nPrev, hms_breyting_2027: typeof br === 'number' ? br : undefined, heimild: 'Kaupskrá HMS (þinglýst kaup) vörpuð á matssvæði HMS' },
    };
  });
}

module.exports = { pickSvaedi, fill };

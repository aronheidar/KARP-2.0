// build_sveitarfelog_fin.js — fjárhagur sveitarfélaga úr ársreikninga-pivot Sambandsins.
//
// AF HVERJU ÞESSI SKRIPTA VARÐ TIL (14.9.2026): `gogn/sveitarfelog_fin.json` hafði ENGA
// byggingarskriftu og ENGIN metagögn — hvorki ártal né heimild. Hún hafði ekki breyst frá
// Cloudflare-flutningnum 29.6, og enginn gat sagt hvaða ár hún sýndi. Þess vegna var henni haldið
// UTAN Spyrðu Karp: ódagsettar skuldatölur á íbúa eru nákvæmlega sú villa sem lotan 13.–14.9 gekk
// út á að laga (harðkóðaðir stýrivextir, ódagsett atvinnuleysi, stöðnuð leiga).
//
// HEIMILD: Samband íslenskra sveitarfélaga birtir ársreikninga sveitarfélaga sem opinn Excel-pivot
// (samband.is/arsreikningar). Hagstofan hefur EKKI per-sveitarfélags fjárhag — PxWeb-töflurnar
// undir Efnahagur/fjaropinber/fjarmal_sveitarf eru LANDSSAMTÖLUR (kannað 14.9). Metill.is birtir
// sömu gögn en það er afleitt verk annarra; við sækjum frumheimildina.
//
// ⚠⚠ GRUNNURINN ER A-HLUTI, EKKI SAMSTÆÐA. Pivot-skráin er fryst á `Hluti = A_hluti`. Síðan
//   /sveitarfelog/ sagði áður „samstæðu (A+B hluti)" í skýringu — það var RANGT: samanburður við
//   fyrri skrá (Reykjavík: tekjur 106%, gjöld 113%, eignir 106%, skuldir 109% af fyrra ári) sýnir
//   að gömlu tölurnar voru líka A-hluti, bara eldra ár. Skriptan LES grunninn úr skránni og skrifar
//   hann í `hluti`-reitinn svo hann verði aldrei ágiskun aftur. Sama regla og gildir um ríkisfjármál:
//   afkoma verður AÐEINS reiknuð innan sama grunns (sjá utgjold.json `afkoma`).
//
// ⚠ REITIR SEM ÞESSI HEIMILD BER EKKI: `utsvar` (útsvarsprósenta — birt sérstaklega) og
//   `fasteign_ibui`. Þeim er HALDIÐ óbreyttum úr fyrri skrá og þeir merktir í `arfur`-reitnum svo
//   enginn haldi að þeir séu frá sama ári og hitt. Blönduð árgerð sem er ÓMERKT er verri en engin.
//
// KEYRSLA: node skriptur/build_sveitarfelog_fin.js

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { writeJsonUnlessEmpty } = require('./_seigla.js');   // tóm veita yfirskrifar aldrei heila skrá

const DIR = path.join(__dirname, '..', 'gogn') + path.sep;
const OUT = DIR + 'sveitarfelog_fin.json';
const PIVOT = 'https://samband-islenskra-sveitarfelaga.cdn.prismic.io/samband-islenskra-sveitarfelaga/'
  + '8Z7TVIcrq9Kw-4gI_Net_%C3%81rsreikningar_Pivot.xlsx';

// Nafnabrú: pivot-hausinn ber sveitarfélaganúmer og stundum lengra form („0000 Reykjavíkurborg",
// „1400 Hafnarfjarðarkaupstaður"). 59 af 63 samsvara beint, 1 um endingar-normaliseringu; þessi
// tvö þarf að telja upp. „Grand Total" er pivot-samtala og á ALDREI að verða sveitarfélag.
const ALIAS = { 'Hafnarfjarðarkaupstaður': 'Hafnarfjörður' };
const SLEPPA = new Set(['Grand Total', 'Samtals', '(blank)']);

const norm = (s) => String(s).toLowerCase()
  .replace(/(kaupstaður|bær|borg|hreppur|byggð)$/, '').replace(/[^a-záðéíóúýþæö]/g, '');

const lesJson = (f) => { try { return JSON.parse(fs.readFileSync(DIR + f, 'utf8')); } catch (e) { return {}; } };

// Efnahagsreikningurinn gefur engar „eignir alls"/„skuldir alls" raðir — þær eru summur þessara.
const EIGNIR = ['Varanlegir rekstrarfjármunir', 'Áhættufjármunir og langtímakröfur', 'Veltufjármunir'];
const SKULDIR = ['Skuldbindingar', 'Langtímaskuldir', 'Skammtímaskuldir'];

(async () => {
  const r = await fetch(PIVOT, { headers: { 'User-Agent': 'karp.is (aronheidars@gmail.com)' } });
  if (!r.ok) throw new Error('Samband HTTP ' + r.status);   // villa er VILLA, ekki tóm gögn
  const buf = Buffer.from(await r.arrayBuffer());
  const wb = XLSX.read(buf, { type: 'buffer' });
  const R = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });

  // Ár og hluti standa í pivot-hausnum (A1/B1, A2/B2) — lesin, ekki ágiskuð.
  const reitur = (merki) => { const rad = R.find((x) => x && String(x[0]).trim() === merki); return rad ? rad[1] : null; };
  const ar = Number(String(reitur('Ar') || '').trim()) || null;
  const hluti = String(reitur('Hluti') || 'A_hluti').trim();
  if (!ar) throw new Error('fann ekki Ar í pivot-haus — snið Sambandsins hefur breyst');

  // Hausraðin er sú fyrsta sem ber „Sveitarfelag"-dálka; merkin eru í dálkum 0–2.
  const hi = R.findIndex((x) => x && x.some((c) => typeof c === 'string' && /^\d{4}\s/.test(c)));
  if (hi < 0) throw new Error('fann ekki hausröð með sveitarfélögum');
  const haus = R[hi];

  const radGildi = (merki) => {
    const i = R.findIndex((x) => x && [0, 1, 2].some((k) => typeof x[k] === 'string' && x[k].trim() === merki));
    return i < 0 ? null : R[i];
  };
  const summa = (merki) => merki.map(radGildi);

  const tekjurR = radGildi('Tekjur'), gjoldR = radGildi('Gjöld'), nidurR = radGildi('Rekstrarniðurstaða');
  const eignirR = summa(EIGNIR), skuldirR = summa(SKULDIR);
  if (!tekjurR || !gjoldR || !nidurR) throw new Error('fann ekki Tekjur/Gjöld/Rekstrarniðurstaðu');

  const fyrra = lesJson('sveitarfelog_fin.json');
  const pop = lesJson('sveitarfelog_pop.json');
  const fyrraNorm = new Map(Object.keys(fyrra).map((k) => [norm(k), k]));

  const out = {};
  let n = 0, nyr = 0; const oþekkt = [];
  for (let c = 0; c < haus.length; c++) {
    const h = haus[c];
    if (typeof h !== 'string' || !h.trim()) continue;
    const hreint = h.replace(/^\d+\s+/, '').trim();
    if (SLEPPA.has(hreint)) continue;
    if (!/^\d{4}\s/.test(h)) continue;   // aðeins dálkar með sveitarfélaganúmeri

    const nafn = ALIAS[hreint] || fyrraNorm.get(norm(hreint)) || hreint;
    if (!fyrra[nafn]) { nyr++; oþekkt.push(hreint); }

    const g = (rad) => (rad && typeof rad[c] === 'number' ? rad[c] : null);
    const sum = (rader) => { const v = rader.map(g).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
    const tekjur = g(tekjurR), gjold = g(gjoldR), nidur = g(nidurR);
    const eignir = sum(eignirR), skuldir = sum(skuldirR);
    if (tekjur == null && gjold == null) continue;

    const ibuar = pop[nafn] || null;
    const adur = fyrra[nafn] || {};
    out[nafn] = {
      // Úr Sambandinu (ár = `ar`). Þúsundir króna, eins og pivot-skráin skilar.
      utsvar: adur.utsvar ?? null,          // ⚠ ARFUR — ekki í þessari heimild
      tekjur, gjold, nidur, eignir, skuldir,
      // Reiknað: þúsundir króna á íbúa (sama eining og síðan birtir, „þ.kr.").
      skuldir_ibui: (skuldir != null && ibuar) ? Math.round(skuldir / ibuar) : null,
      afkoma_ibui: (nidur != null && ibuar) ? Math.round(nidur / ibuar) : null,
      fasteign_ibui: adur.fasteign_ibui ?? null,   // ⚠ ARFUR — ekki í þessari heimild
    };
    n++;
  }

  // ⚠⚠ LÖGUNIN HELST BER — {nafn: {...}} — og metagögnin fara í `_meta`.
  //   Freistingin var að pakka öllu í {ar, hluti, svf:{…}}, sem er hreinna snið. En SEX neytendur
  //   lesa `SVFIN[nafn]` beint (sveitarfelog, [slug], kort, mitt-svaedi, topplistar, reiknivelar +
  //   build_frettavel) og sú breyting hefði brotið þá alla í einu. Hinn kosturinn — sérstök
  //   meta-skrá — er nákvæmlega tvískiptingin sem rekur í sundur (sbr. numbeo/verðskrá-lærdóminn).
  //   `_meta` er öruggt AF ÞVÍ AÐ ÞAÐ VAR KANNAÐ, ekki af því það lítur sakleysislega út:
  //     · SVFIN[nafn]-uppflettingar          → snerta það aldrei
  //     · reiknivelar.astro:16               → síar `utsvar != null` → dettur út
  //     · src/lib/muniIndex.mjs:19           → síar mannfjölda ≥ 1000 → dettur út
  //   Bætist NÝR neytandi við sem iterar hrátt verður hann að sleppa lyklum sem byrja á „_".
  const data = Object.assign({
    _meta: {
      updated: new Date().toISOString().slice(0, 10),
      ar, hluti,
      heimild: 'Samband íslenskra sveitarfélaga — ársreikningar sveitarfélaga (Net_Ársreikningar_Pivot.xlsx, samband.is/arsreikningar)',
      eining: 'þúsundir króna; *_ibui eru þúsundir króna á íbúa',
      arfur: ['utsvar', 'fasteign_ibui'],   // reitir sem heimildin ber EKKI — haldið úr fyrri skrá
      n,
    },
  }, out);

  writeJsonUnlessEmpty(OUT, data, {
    isEmpty: (d) => !d || Object.keys(d).filter((k) => !k.startsWith('_')).length < 10,
    label: 'sveitarfelog_fin.json',
  });
  const PUB = path.join(__dirname, '..', 'web', 'public', 'gogn');
  fs.mkdirSync(PUB, { recursive: true });
  fs.writeFileSync(path.join(PUB, 'sveitarfelog_fin.json'), JSON.stringify(data));

  console.log('sveitarfelog_fin.json | ár:', ar, '| hluti:', hluti, '| sveitarfélög:', n,
    '| án mannfjölda:', Object.values(out).filter((x) => x.skuldir_ibui == null).length);
  if (oþekkt.length) console.log('  ⚠ ekki í fyrri skrá (ný eða nafnabreyting):', oþekkt.join(', '));
})().catch((e) => { console.error('VILLA', e.message); process.exit(1); });

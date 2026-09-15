// bjarki.mjs — HREIN eining: svar /api/admin/markadsefni → hólfin fimm á spjaldi Bjarka (markaðsfulltrúi).
// Engin fetch, engin env, ekkert Date.now() — allt kemur með svarinu sjálfu og með `now` frá kallanda.
import { bidurFyrir } from './bidur_thin.mjs';

function dagsTexti(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts) * 1000);
  return d.getUTCDate() + '.' + (d.getUTCMonth() + 1) + '. kl. ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}

function samiManudur(ts, now) {
  if (!ts) return false;
  const a = new Date(Number(ts) * 1000), b = new Date(Number(now) * 1000);
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

/** Næstu færslur dagatalsins sem við í raun höfum dagsetningu og rásir fyrir — „næst" og „síðast
 *  birt" úr dagatalinu sjálfu, svo verk úr safninu til að fylla upp í fimm. */
function vinnslaRadir(dagatal, safn) {
  const ut = [];
  if (dagatal.naesta && dagatal.naesta.ts) {
    const rasir = Array.isArray(dagatal.naesta.rasir) && dagatal.naesta.rasir.length ? ' · ' + dagatal.naesta.rasir.join(', ') : '';
    ut.push({ texti: (dagatal.naesta.texti || 'næsta færsla') + rasir, hvenaer: dagsTexti(dagatal.naesta.ts) });
  }
  if (dagatal.birtSidast && dagatal.birtSidast.ts) {
    ut.push({ texti: 'birt: ' + (dagatal.birtSidast.texti || ''), hvenaer: dagsTexti(dagatal.birtSidast.ts) });
  }
  for (const s of safn) {
    if (ut.length >= 5) break;
    if (!s || typeof s !== 'object') continue;
    ut.push({ texti: s.titill || ('#' + s.id), hvenaer: dagsTexti(s.birt) });
  }
  return ut.slice(0, 5);
}

export function bjarkiGogn(svar = {}, bidurListi = [], now = 0) {
  const dagatal = (svar.dagatal && typeof svar.dagatal === 'object') ? svar.dagatal : {};
  const safn = Array.isArray(svar.safn) ? svar.safn : [];
  const iRod = Number(dagatal.iRod) || 0;
  const dagarFram = Number(dagatal.dagarFram) || 0;

  // ⚠ Villuboðin eru HREIÐRUÐ inni í svar.postiz — endapunkturinn skilar {ok:true, postiz:{ok,error,villa}, …}.
  //    Fyrri útgáfa las svar.error/svar.villa á toppstigi og hefði því ALDREI sagt frá óstilltri tengingu.
  const postiz = (svar && svar.postiz && typeof svar.postiz === 'object') ? svar.postiz : {};
  const ekkertSvar = !svar || svar.ok === false;                    // síðan náði ekki í endapunktinn
  const ostillt = postiz.error === 'unconfigured';
  const gamalt = postiz.villa === 'postiz';

  // ⚠ Sami lærdómur og af spjaldi Hrafns: „main grænt" þegar EKKERT svar barst kenndi manni að
  //   hætta að treysta grænum lit í blindni. Hér: Postiz-tengingin óstillt eða þögul segir það
  //   BERUM ORÐUM — aldrei „N í röðinni" þegar við í raun ekki vitum töluna.
  const stada = ekkertSvar
    ? 'Stjórnborðið náði ekki sambandi við vélina'
    : ostillt
    ? 'Postiz-tenging óstillt'
    : gamalt
    ? 'Postiz svarar ekki — dagatalið er frá síðustu heppnuðu sókn'
    : iRod + ' í röðinni · dagatalið nær ' + dagarFram + ' daga fram';

  // ⚠ Raðirnar (dagatal að tæmast, óflokkað verk, tillögur) eru smíðaðar í bidurThin núna — annars sæi
  //   forstofan þær aldrei og talan á andlitinu yrði núll þótt eitthvað biði. Hér er AÐEINS síað, nákvæmlega
  //   eins og sigrun.mjs og hrafn.mjs gera.
  const bidur = bidurFyrir(bidurListi, 'bjarki');

  return {
    stada,
    sidast: dagsTexti(dagatal.birtSidast && dagatal.birtSidast.ts),
    bidur,
    vinnsla: vinnslaRadir(dagatal, safn),
    tolur: [
      { n: String(iRod), l: 'í röðinni', s: dagatal.naesta && dagatal.naesta.texti ? 'næst: ' + dagatal.naesta.texti : '' },
      { n: String(dagarFram), l: 'dagar fram', s: '' },
      { n: String(safn.filter((x) => x && samiManudur(x.birt, now)).length), l: 'birt í mánuðinum', s: '' },
      { n: String(safn.length), l: 'verk í safninu', s: '' },
    ],
    heimildir: [
      'semur efni og myndbönd',
      'setur í röðina sem drög',
      'aldrei birta sjálfur — þú ýtir á hnappinn',
      'hlýðir rofanum — þú kveikir og slekkur á sjálfvirkninni',
    ],
    rofi: { lykill: 'rofi_bjarki', off: !!svar.rofi },
  };
}

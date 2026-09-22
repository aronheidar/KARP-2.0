// hrafn.mjs — HREIN eining: yfirlit + bilanalisti → hólfin fimm á spjaldi Hrafns (forritari).
//
// ⚠ Niðurstaða keyrslu er metin EFTIR VERKINU, ekki exit-kóða: báðar CTO-keyrslur 13.9 eru merktar
//   „failure" í GitHub þótt önnur hafi skilað PR #10 (PR-stofnun féll, lagfæringin stóð). Þess vegna
//   er talið eftir `cto_pr` á beiðninni.
import { bidurFyrir } from './bidur_thin.mjs';

// Röð alvarleika á spjaldinu. Óþekkt stig fara aftast.
const ALVARLEIKI = { hatt: 0, midlungs: 1, lagt: 2 };

function dagsTexti(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts) * 1000);
  return d.getUTCDate() + '.' + (d.getUTCMonth() + 1) + '. kl. ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}

export function hrafnGogn(overview = {}, bilanirSvar = {}, bidurListi = [], now = 0) {
  const tx = overview.tickets || {};
  const listi = Array.isArray(tx.list) ? tx.list : [];
  const bilanir = Array.isArray(bilanirSvar.bilanir) ? bilanirSvar.bilanir : [];
  const rautt = bilanir.some((b) => b.uppspretta === 'CI');
  // ⚠ Við vitum EKKI lit main nema ferskt CI-svar hafi borist. Ógilt svar (token vantar, netvilla,
  //    admin-gátt féll) og gamall listi telja BÁÐIR sem óvissa — „grænt" af því ekkert barst er
  //    nákvæmlega þögnin sem lét tvær fallnar keyrslur liggja óséðar 14.9.
  const svarOgilt = bilanirSvar.ok === false || !Array.isArray(bilanirSvar.bilanir);
  const ciVantar = svarOgilt || bilanirSvar.villa === 'github'
    || (Array.isArray(bilanirSvar.vantar) && bilanirSvar.vantar.includes('CI'));
  const lagfaeringar = listi.filter((t) => t.cto_pr).length;
  const iVinnslu = listi.filter((t) => t.stada === 'cto').length;
  const sidast = listi.filter((t) => t.cto_pr).reduce((m, t) => Math.max(m, Number(t.updated) || 0), 0);

  // ⚠ Tvö ólík „ekki treysta þessu blint" ástand frá /api/admin/bilanir, og þau þýða ekki það sama:
  //   'github' = ENGIN uppspretta svaraði — listinn er alfarið sá gamli, geymdur. 'hluti' = SUMAR svöruðu
  //   ekki en aðrar gerðu — listinn er ferskur en ófullnægjandi, og vantar-fylkið segir nákvæmlega hvaðan.
  const stada = svarOgilt
    ? 'bilanalistinn náðist ekki (' + (bilanirSvar.error || 'villa') + ')'
    : bilanirSvar.villa === 'github'
    ? 'GitHub svarar ekki — listinn er frá ' + (dagsTexti(bilanirSvar.sott) || 'fyrri keyrslu')
    : bilanirSvar.villa === 'hluti'
    ? 'listinn er ófullnægjandi — vantar svör frá: ' + (Array.isArray(bilanirSvar.vantar) ? bilanirSvar.vantar.join(', ') : '?')
    : (rautt ? 'main rautt' : 'main grænt') + (iVinnslu ? ' · ' + iVinnslu + ' í vinnslu' : ' · ekkert í vinnslu');

  return {
    stada,
    sidast: dagsTexti(sidast),
    bidur: bidurFyrir(bidurListi, 'hrafn'),
    // Allar bilanir sjást hér — líka þær sem eru of vægar til að trufla forstofuna.
    // ⚠ Raðað eftir alvarleika áður en fimm efstu eru valdar (22.9). Í upprunaröð (CI, bygging, CTO, vaktir,
    //   straumar, PR) gat miðlungs viðvörun um þagnaðan fréttastraum horfið aftan við fimm aðrar færslur.
    //   sort er stöðug, svo upprunaröð heldur sér innan hvers stigs.
    vinnsla: [...bilanir].sort((a, b) => (ALVARLEIKI[a.alvarleiki] ?? 3) - (ALVARLEIKI[b.alvarleiki] ?? 3))
      .map((b) => ({ texti: b.lysing, hvenaer: dagsTexti(b.sidan) }))
      .concat(listi.filter((t) => t.cto_pr).slice(0, 3).map((t) => ({ texti: '#' + t.id + ' ' + (t.efni || '') + ' — PR tilbúinn', hvenaer: dagsTexti(t.updated) })))
      .slice(0, 5),
    tolur: [
      { n: ciVantar ? 'óvíst' : (rautt ? 'rautt' : 'grænt'), l: 'main', s: ciVantar ? 'CI svaraði ekki' : bilanir.length + ' bilanir' },
      { n: String(lagfaeringar), l: 'skiluðu lagfæringu', s: 'talið eftir PR' },
      { n: String(iVinnslu), l: 'í vinnslu', s: '' },
      { n: String(bilanir.filter((b) => b.alvarleiki === 'hatt').length), l: 'háar bilanir', s: '' },
    ],
    heimildir: [
      'breytir aðeins web/ og skriptur/',
      'prófin verða að vera græn — annars skilar hann engu',
      'aldrei migrations, wrangler, .github, leyndarmál eða greiðslukóði',
      'merge aðeins eftir þitt samþykki',
    ],
    // Rofa-staðan kemur með yfirlitinu (tickets.rofar) — sjá Step 5, sem bætir henni við ticketsOverview.
    rofi: { lykill: 'rofi_hrafn', off: !!(tx.rofar && tx.rofar.rofi_hrafn) },
  };
}

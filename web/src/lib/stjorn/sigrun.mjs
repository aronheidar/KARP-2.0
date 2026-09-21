// sigrun.mjs — HREIN eining: yfirlit → hólfin fimm á spjaldi Sigrúnar (þjónustufulltrúi).
// Engin fetch, engin D1 — allt kemur úr /api/admin/overview svo spjaldið kosti ekkert aukalega.
import { bidurFyrir } from './bidur_thin.mjs';
import { eintala } from './vikutexti.mjs';

const KLST = 3600;
function midgildi(tolur) {
  if (!tolur.length) return null;
  const r = tolur.slice().sort((a, b) => a - b), m = Math.floor(r.length / 2);
  return r.length % 2 ? r[m] : Math.round((r[m - 1] + r[m]) / 2);
}
function timiTexti(sek) {
  if (sek == null) return '—';
  if (sek < KLST) return Math.max(1, Math.round(sek / 60)) + ' mín';
  if (sek < 86400) return Math.round(sek / KLST) + ' klst';
  const d = Math.round(sek / 86400);
  return d + ' ' + (eintala(d) ? 'dagur' : 'dagar');   // „1 dagar" stóð á spjaldinu (sást í vafra 22.9)
}
function dagsTexti(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts) * 1000);
  return d.getUTCDate() + '.' + (d.getUTCMonth() + 1) + '. kl. ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}

export function sigrunGogn(overview = {}, bidurListi = [], now = 0) {
  const tx = overview.tickets || {};
  const listi = Array.isArray(tx.list) ? tx.list : [];
  const nu = Number(now) || Number(overview.now) || 0;
  const svarad = listi.filter((t) => t.svar_sent && t.created).map((t) => Number(t.svar_sent) - Number(t.created));
  const ny7 = listi.filter((t) => Number(t.created) > nu - 7 * 86400).length;
  const sidastVirk = listi.reduce((m, t) => Math.max(m, Number(t.updated) || 0), 0);
  const opnar = Number(tx.open) || 0;
  // „Ég þarf þig á þessum" fer EFST á spjaldið, og þær raðir eru þá ekki endurteknar í „Bíður þín".
  // Samtals er þetta sama tala og á andlitinu: sömu raðir úr sömu uppsprettu, aðeins skipt í tvennt.
  const allt = bidurFyrir(bidurListi, 'sigrun');

  return {
    stada: opnar ? opnar + (opnar === 1 ? ' opin beiðni' : ' opnar beiðnir') : 'engin opin beiðni',
    sidast: dagsTexti(sidastVirk),
    hjalp: allt.filter((r) => r.tegund === 'hjalp'),
    bidur: allt.filter((r) => r.tegund !== 'hjalp'),
    // Þráður hverrar beiðni er á sínum stað í listanum neðar á spjaldinu; hér er aðeins nýjasta hreyfingin.
    vinnsla: listi.slice(0, 5).map((t) => ({ texti: '#' + t.id + ' ' + (t.efni || ''), hvenaer: dagsTexti(t.updated) })),
    tolur: [
      { n: String(opnar), l: 'opnar beiðnir', s: (tx.by && tx.by.nytt ? tx.by.nytt + ' nýjar' : '') },
      { n: timiTexti(midgildi(svarad)), l: 'miðgildi svartíma', s: svarad.length + ' svöruð' },
      { n: String(Number(tx.sjalfvirk) || 0), l: 'leyst án þín', s: 'agent svaraði sjálfur' },
      { n: String(ny7), l: 'nýjar 7 daga', s: '' },
    ],
    heimildir: [
      'sendir staðfestingu sjálf (fast sniðmát)',
      'sendir KB-svar ORÐRÉTT þegar vissa er ≥ 0,9',
      'les hjalp@karp.is og býr til beiðnir',
      'aldrei texta sem AI samdi — hann bíður þín',
    ],
    rofi: { lykill: 'hjalp_agent_off', off: !!tx.off },
  };
}

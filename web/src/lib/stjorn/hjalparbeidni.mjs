// Hvenær Sigrún biður um hjálp, og hvenær hún man eftir fólki. HREIN rökfræði: engin D1, enginn
// fetch. ticketsOverview (worker/hjalp_agent.mjs) kallar þetta með lýsingunni, sem fer aldrei í
// svarið, og spjaldið fær aðeins niðurstöðuna.
//
// Reglan er viljandi víð í eina átt: rangt já setur beiðni efst hjá Aroni, sem kostar eina sekúndu.
// Rangt nei lætur beiðni um endurgreiðslu eða lögfræði bíða í röðinni eins og hver önnur.

const DAGUR = 86400;
// Orðaskil skrifuð út: JS-\b er ASCII-bundið og sér ð, þ og æ sem skil. Stofnar standa því á eftir
// upphafi eða staf sem er ekki bókstafur, og beygingarendingin má fylgja.
const stofnar = (a) => new RegExp('(^|[^\\p{L}])(' + a.join('|') + ')', 'iu');

// ⚠ „kæra", „kæri" og „kæru" vantar VILJANDI. Það er líka ávarpið: „Kæra Sigrún".
const LOG = stofnar([
  'lögfræð', 'lögm[aeö]', 'persónuvernd', 'persónuupplýsing', 'gdpr', 'neytendast', 'neytendasamt',
  'kærunefnd', 'úrskurðarnefnd', 'dómstól', 'dómsmál', 'málsókn', 'skaðabót', 'meiðyrð', 'lögregl',
  'eyð\\p{L}*\\s+(öllum\\s+|mínum\\s+)?(gögn|upplýsing|aðgang|reikning)',
  'fjarlæg\\p{L}*\\s+(öll\\p{L}*\\s+)?(upplýsing|gögn|nafn)',
  'lawyer', 'attorney', 'legal', 'lawsuit', 'data protection', 'delete my (data|account)',
]);
const TVIRUKKUN = stofnar([
  'tvírukk', 'tvígrei', 'tvöföld\\p{L}*\\s+(rukkun|greiðsl|færsl)',
  '(rukk|greidd|greiddi|greitt|borga)\\p{L}*\\s+tvisvar', 'tvisvar\\s+(rukk|greidd|greitt|borga)', 'charged twice',
]);
// ⚠ Ekki 'endurgrei' eitt og sér: það grípur líka „endurgreina" (greina aftur).
const ENDURGREIDSLA = stofnar(['endurgreið', 'endurgreit', 'endurgreidd', 'bakfær', 'kreditreikning', 'peninga\\p{L}*\\s+(mína\\s+)?til\\s+baka', 'refund', 'chargeback', 'money back']);

// „í þriðja sinn": hvorugkyn, þolfall. Hærri tölur fá punkt: „í 11. sinn".
const RADTOLUR = { 2: 'annað', 3: 'þriðja', 4: 'fjórða', 5: 'fimmta', 6: 'sjötta', 7: 'sjöunda', 8: 'áttunda', 9: 'níunda', 10: 'tíunda' };
export const radtala = (n) => RADTOLUR[n] || (n + '.');
const TEGUND_UM = { villa: 'villur', spurning: 'spurningar', adgangur: 'aðgang', reikningur: 'reikninga', osk: 'óskir' };

/** Beiðnir sem bíða EFTIR OKKUR. Svarað, hjá Hrafni eða lokað er ekki hennar að biðja um. */
export const BIDA_OKKAR = ['nytt', 'stadfest'];

/**
 * Hefur sami notandi haft samband a.m.k. þrisvar á `dagar` dögum, til og með þessari beiðni?
 * Aðeins beiðnir sem komu Á UNDAN teljast. Það sem Aron samdi á /stjorn/ er ekki samband frá notanda.
 * @returns {{fjoldi:number, fyrri:Array, samaTegund:number}|null}
 */
export function mannEftir(t, listi, { dagar = 30 } = {}) {
  const netfang = String((t && t.netfang) || '').trim().toLowerCase();
  if (!netfang || t.uppruni === 'stjorn') return null;
  const til = Number(t.created) || 0, fra = til - dagar * DAGUR;
  const fyrri = (Array.isArray(listi) ? listi : []).filter((x) => x && Number(x.id) !== Number(t.id) && x.uppruni !== 'stjorn'
    && String(x.netfang || '').trim().toLowerCase() === netfang && Number(x.created) >= fra && Number(x.created) <= til)
    .sort((a, b) => Number(a.created) - Number(b.created) || Number(a.id) - Number(b.id));
  if (fyrri.length < 2) return null;
  const samaTegund = t.tegund && TEGUND_UM[t.tegund] ? fyrri.filter((x) => x.tegund === t.tegund).length : 0;
  return { fjoldi: fyrri.length + 1, samaTegund,
    fyrri: fyrri.map((x) => ({ id: Number(x.id), efni: String(x.efni || ''), created: Number(x.created) || 0, tegund: x.tegund || null })) };
}

const stytt = (s, n) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : x; };
const saman = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' og ' + a[a.length - 1]);

/** Línan á miðanum. Staðreyndir einar: fjöldinn og fyrri erindin, svo Aron meti hvort málið sé það sama. */
export function mannEftirTexti(m, t) {
  if (!m) return '';
  const fyrri = m.fyrri.slice(-4).map((x) => '#' + x.id + (x.efni ? ' „' + stytt(x.efni, 50) + '“' : ''));
  const oll = m.samaTegund === m.fyrri.length && t && TEGUND_UM[t.tegund];
  return 'Þetta er í ' + radtala(m.fjoldi) + ' sinn á 30 dögum sem þessi notandi hefur samband. Áður '
    + (fyrri.length === 1 ? 'kom ' : 'komu ') + saman(fyrri) + '.' + (oll ? ' Í öll skiptin um ' + TEGUND_UM[t.tegund] + '.' : '');
}

/** Heiti forsamins svars í mæltu máli: fyrsti liður `um`, „verðskrá / hvað kostar" → „verðskrá". */
const kbHeiti = (kb, id) => {
  const k = (Array.isArray(kb) ? kb : []).find((x) => x && x.id === id);
  return k ? String(k.um || '').split('/')[0].trim() : '';
};

/**
 * Þarf hún Aron á þessari beiðni? Sterkasta ástæðan ræður: lögfræði, peningar, endurtekið samband, óvissa.
 * @param t miði með efni, lysing, sidastaInn (nýjustu skilaboð notanda), stada, netfang, created, tegund,
 *          g_model, g_kb, g_vissa (úr ai_greining)
 * @returns {{astaeda:string, texti:string}|null}
 */
export function thurfHjalp(t, { listi = [], kb = [] } = {}) {
  if (!t || !BIDA_OKKAR.includes(t.stada)) return null;
  const texti = [t.efni, t.lysing, t.sidastaInn].map((x) => String(x || '')).join('\n');
  if (LOG.test(texti)) return { astaeda: 'log', texti: 'nefnir lögfræði eða persónuvernd' };
  if (TVIRUKKUN.test(texti)) return { astaeda: 'peningar', texti: 'nefnir tvírukkun' };
  if (ENDURGREIDSLA.test(texti)) return { astaeda: 'peningar', texti: 'nefnir endurgreiðslu' };
  const m = mannEftir(t, listi);
  if (m && m.samaTegund >= 2) return { astaeda: 'endurtekid', texti: 'í ' + radtala(m.fjoldi) + ' sinn á 30 dögum' };
  const model = String(t.g_model || '');
  if (model.startsWith('fallback')) return { astaeda: 'ovisst', texti: 'ég náði ekki að greina hana' };
  const vissa = Number(t.g_vissa);
  if (t.g_kb && Number.isFinite(vissa) && vissa >= 0.5 && vissa < 0.9) {
    const h = kbHeiti(kb, t.g_kb);
    return { astaeda: 'ovisst', texti: (h ? 'svarið um ' + h : 'forsamið svar') + ' gæti átt við en ég er ekki viss' };
  }
  return null;
}

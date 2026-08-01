// kyc-greinargerd.mjs — eftirlitshæf áhættumats-greinargerð (audit-ready CDD narrative).
// Hrein rökvísi fyrir build_kyc_greinargerd.mjs og möppu-birtinguna.
//
// ÞRJÁR HARÐAR SKORÐUR (rýni 2026-08-01):
//  1. FAST SNIÐMÁT: allar staðreynda-setningar og lagatilvísanir eru fastir textar sem lögfræðingur
//     rýnir EINU SINNI — LLM skrifar AÐEINS eina túlkunar-málsgrein úr afmörkuðu JSON-samhengi.
//  2. TALNA-GÁT: túlkun sem nefnir tölu sem er EKKI í samhenginu er hafnað í heild (hallucination-vörn).
//  3. FORMLEG DRÖG: greinargerðin er ákvörðunarstuðningur — endanleg áhættuflokkun er mannleg
//     ákvörðun tilkynningarskylda aðilans (22. gr. GDPR-lína DPIA-viðbótar 1).

import { FATF_FLOKKAR, MALS_STODUR } from './adverse-media.mjs';
import { hash } from './kyc.mjs';

/**
 * Lögaðila-vörður (DPIA leið A): íslensk kennitala lögaðila hefur fyrsta tölustaf 4–7
 * (fæðingardagur+40). Greinargerð og adverse media-flokkun keyra ALDREI á einstaklingi.
 */
export const erLogadili = (kt) => /^[4-7]\d{9}$/.test(String(kt || '').replace(/\D/g, ''));

/** Fastir kaflar — röð og fyrirsagnir eru hluti sniðmátsins, ekki á valdi LLM. */
export const KAFLAR = ['audkenni', 'eigendur', 'skimanir', 'fjolmidlar', 'samantekt'];

export const GREINARGERD_FYRIRVARI = 'Greinargerð þessi er sjálfvirkt unnin DRÖG úr gögnum Karp til '
  + 'stuðnings áreiðanleikakönnun skv. lögum nr. 140/2018. Hún felur ekki í sér áhættuflokkun — '
  + 'endanlegt mat, flokkun og viðbrögð eru ávallt á ábyrgð tilkynningarskylda aðilans, sem skal '
  + 'yfirfara og staðfesta efni hennar. Staðfestu einstakar færslur í frumheimildum.';

/**
 * Afmarkaða samhengið sem BÆÐI deterministic kaflarnir og LLM-túlkunin byggja á.
 * Allt sem greinargerðin má fullyrða er hér — með dagsetningum þar sem þær eru til.
 */
export function greinargerdSamhengi(watch, states, adverse, tonn, events) {
  const s = states || {};
  const L = (sig) => s[sig] || null;
  const adv = (adverse || []).map((a) => ({
    flokkur: a.flokkur, heiti: FATF_FLOKKAR[a.flokkur] || a.flokkur,
    stada: MALS_STODUR[a.stada] || a.stada || '', dags: a.dags || '', titill: String(a.title || '').slice(0, 120), source: a.source || '',
  }));
  // ⚠ Sviðsheitin verða að vera ÓTVÍRÆÐ fyrir líkanið: fyrsta raun-greinargerðin las `tonn`
  //   sem „tonnaskráningar" (magn afla!) — heitið `medaltonn_fjolmidla` + skýring í system-
  //   prompti loka þeirri mislesningu. Talna-gátin ver tölurnar, ekki merkinguna.
  const ton = (tonn || []).slice(-12).map((t) => ({ man: t.man, frettir: t.n, medaltonn_fjolmidla: t.tonn }));
  return {
    nafn: watch?.nafn || '', kt: watch?.kt || '',
    stada: L('status') ? { stada: L('status').stada || '', gjaldthrot: !!L('status').gjaldthrot, afskrad: !!L('status').afskrad } : null,
    eigendur: L('ubo') ? {
      beinir: (L('ubo').owners || []).map((o) => ({ nafn: o.nafn, hlutur: o.hlutur })),
      endanlegir: (L('ubo').beneficial || []).map((b) => ({ nafn: b.nafn || b.key, effPct: b.effPct })),
      okklarad: !!L('ubo').incompleteChain,
    } : null,
    skimanir: {
      refsilistar: L('sanctions') ? (L('sanctions').hits || []).length : null,   // null = heimild svaraði ekki
      pep: L('pep') ? (L('pep').matches || []).length : null,
      logbirtingar: L('legal') ? (L('legal').notices || []).map((n) => ({ tegund: n.type, dags: n.dags })) : null,
      skil_vanskil: L('skil') ? (L('skil').years || []).map((y) => y.ar) : null,
    },
    adverse: adv,
    tonn: ton,
    atburdir90d: (events || []).length,
  };
}

/** Sam-hash yfir allt samhengið — endurmyndun AÐEINS þegar eitthvað breyttist (kostnaðar-gát). */
export const greinargerdHash = (samhengi) => hash(JSON.stringify(samhengi));

export const GREINARGERD_SYSTEM = 'Þú aðstoðar tilkynningarskyldan aðila við áreiðanleikakönnun. '
  + 'Þér er gefið JSON-samhengi um eitt íslenskt FÉLAG (lögaðila). Skrifaðu EINA samantektar-málsgrein '
  + 'á íslensku (3-6 setningar) sem dregur saman það sem skiptir máli fyrir áhættumat — staðreyndir úr '
  + 'samhenginu eingöngu, engin ályktun um einstaklinga, engin áhættuflokkun (það er ákvörðun lesandans), '
  + 'engar tölur sem ekki standa í samhenginu. Ef gögn vantar (null) skaltu nefna það sem fyrirvara, '
  + 'ekki lesa það sem hreina niðurstöðu. ATH: í `tonn`-fylkinu er `medaltonn_fjolmidla` meðal-TÓNN '
  + 'fjölmiðlaumfjöllunar á bilinu -1 (neikvæð) til +1 (jákvæð) og `frettir` fjöldi frétta í mánuðinum '
  + '— þetta er EKKI magn, afli eða tonnatala. Svaraðu AÐEINS með málsgreininni sjálfri, engu öðru.';

/**
 * Talna-gátin: hafnar túlkun sem nefnir tölu sem hvergi stendur í samhenginu.
 * Ártöl og prósentur teljast líka — hallucination á fjárhæð/fjölda í compliance-skjali er
 * verri en engin túlkun. Skilar hreinsuðum texta eða null (kallandi sleppir þá túlkuninni).
 */
export function parseTulkun(text, samhengi) {
  const t = String(text || '').trim();
  if (t.length < 40 || t.length > 1400) return null;
  if (/[<>{}[\]`]/.test(t)) return null;   // ekkert markup/JSON-brot inn í skjalið
  const heimild = JSON.stringify(samhengi);
  for (const tala of (t.match(/\d[\d.,]*/g) || [])) {
    const hrein = tala.replace(/[.,]+$/, '');
    if (!hrein) continue;
    // talan verður að koma fyrir í samhenginu — annaðhvort beint eða án þúsundapunkta
    if (!heimild.includes(hrein) && !heimild.includes(hrein.replace(/[.,]/g, ''))) return null;
  }
  return t;
}

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Deterministic HTML-greinargerðin. `tulkun` (LLM, þegar til) fer í EINN afmarkaðan kafla;
 * allt annað er fast sniðmát úr samhenginu. Fjarvera gagna er orðuð sem fyrirvari — aldrei
 * lesin sem hrein niðurstaða (sami lærdómur og na-merkin í kycScreenKt).
 */
export function greinargerdHtml(samhengi, tulkun, generatedAt) {
  const c = samhengi;
  const dags = generatedAt ? new Date(generatedAt * 1000).toISOString().slice(0, 10) : '';
  const p = [];
  p.push('<h3>Áhættumats-greinargerð (drög)</h3>');
  p.push('<p class="kg-meta">' + esc(c.nafn) + ' · kt. ' + esc(c.kt) + (dags ? ' · unnin ' + dags : '') + '</p>');
  // 1. Auðkenni og staða
  p.push('<h4>1. Staða félags</h4>');
  p.push(c.stada
    ? '<p>Skráð staða: <b>' + esc(c.stada.stada || 'óþekkt') + '</b>.' + (c.stada.gjaldthrot ? ' <b>Bú félagsins hefur verið tekið til gjaldþrotaskipta.</b>' : '') + (c.stada.afskrad ? ' Félagið er afskráð.' : '') + '</p>'
    : '<p><i>Fyrirvari: staðu-heimild svaraði ekki við síðustu skimun — staða er óstaðfest, ekki hrein.</i></p>');
  // 2. Eigendur
  p.push('<h4>2. Eigendur og raunverulegir eigendur</h4>');
  if (c.eigendur) {
    const ben = c.eigendur.endanlegir || [];
    p.push('<p>Beinir eigendur á skrá: ' + (c.eigendur.beinir || []).length + '. Endanlegir raunverulegir eigendur (≥25%): '
      + (ben.length ? ben.map((b) => esc(b.nafn) + ' (' + (b.effPct != null ? String(b.effPct).slice(0, 5) + '%' : 'hlutfall órakið') + ')').join(', ') : 'engir raktir yfir 25%')
      + '.' + (c.eigendur.okklarad ? ' <i>Fyrirvari: eignakeðja að hluta órakin — hlutföll eru lágmarksmat.</i>' : '') + '</p>');
  } else p.push('<p><i>Fyrirvari: eigenda-heimild svaraði ekki við síðustu skimun.</i></p>');
  // 3. Skimanir
  p.push('<h4>3. Skimanir</h4><ul>');
  const sk = c.skimanir || {};
  p.push('<li>Refsilistar (OFAC/UN/EU): ' + (sk.refsilistar == null ? '<i>heimild svaraði ekki</i>' : sk.refsilistar + ' samsvaranir') + '</li>');
  p.push('<li>Innlend PEP-skimun: ' + (sk.pep == null ? '<i>heimild svaraði ekki</i>' : sk.pep + ' samsvaranir') + '</li>');
  p.push('<li>Lögbirtingar: ' + (sk.logbirtingar == null ? '<i>heimild svaraði ekki</i>' : (sk.logbirtingar.length ? sk.logbirtingar.map((n) => esc(n.tegund) + (n.dags ? ' (' + esc(n.dags) + ')' : '')).join(', ') : 'engar á skrá')) + '</li>');
  p.push('<li>Ársreikningaskil: ' + (sk.skil_vanskil == null ? '<i>heimild svaraði ekki</i>' : (sk.skil_vanskil.length ? 'vanskil: ' + sk.skil_vanskil.join(', ') : 'í skilum')) + '</li>');
  p.push('</ul>');
  // 4. Fjölmiðlar + adverse
  p.push('<h4>4. Fjölmiðlaumfjöllun og adverse media (FATF)</h4>');
  p.push((c.adverse || []).length
    ? '<ul>' + c.adverse.map((a) => '<li><b>' + esc(a.heiti) + '</b> (' + esc(a.stada) + (a.dags ? ', ' + esc(a.dags) : '') + '): „' + esc(a.titill) + '" — ' + esc(a.source) + '</li>').join('') + '</ul>'
    : '<p>Engin FATF-flokkuð adverse media-umfjöllun á skrá.</p>');
  if ((c.tonn || []).length) p.push('<p class="kg-tonn">Umfjöllunar-mánuðir á skrá (fjöldi frétta): ' + c.tonn.map((t) => esc(t.man) + ' (' + t.frettir + ')').join(', ') + '.</p>');
  // 5. Samantekt (LLM, gátuð) — EINI kaflinn sem líkanið skrifar
  p.push('<h4>5. Samantekt</h4>');
  p.push(tulkun ? '<p>' + esc(tulkun) + '</p>' : '<p><i>Sjálfvirk samantekt ekki tiltæk — kaflar 1–4 standa sjálfstætt.</i></p>');
  p.push('<p class="kg-fyrirvari">' + esc(GREINARGERD_FYRIRVARI) + '</p>');
  return p.join('\n');
}

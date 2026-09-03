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
// Umsvifin búa í eigin einingu svo fyrirtækjasíðan geti flutt þau inn ein og sér.
// Endurútflutt hér því greinargerðin er hinn neytandinn og prófin lesa báðar leiðir.
import { umsvifUrArsreikningi, UMSVIF_FYRIRVARI } from './kyc-umsvif.mjs';
export { umsvifUrArsreikningi, UMSVIF_FYRIRVARI };

/**
 * Lögaðila-vörður (DPIA leið A): íslensk kennitala lögaðila hefur fyrsta tölustaf 4–7
 * (fæðingardagur+40). Greinargerð og adverse media-flokkun keyra ALDREI á einstaklingi.
 */
export const erLogadili = (kt) => /^[4-7]\d{9}$/.test(String(kt || '').replace(/\D/g, ''));

/** Fastir kaflar — röð og fyrirsagnir eru hluti sniðmátsins, ekki á valdi LLM. */
export const KAFLAR = ['audkenni', 'eigendur', 'stjorn', 'skimanir', 'umsvif', 'fjolmidlar', 'samantekt'];

export const GREINARGERD_FYRIRVARI = 'Greinargerð þessi er sjálfvirkt unnin DRÖG úr gögnum Karp til '
  + 'stuðnings áreiðanleikakönnun skv. lögum nr. 140/2018. Hún felur ekki í sér áhættuflokkun — '
  + 'endanlegt mat, flokkun og viðbrögð eru ávallt á ábyrgð tilkynningarskylda aðilans, sem skal '
  + 'yfirfara og staðfesta efni hennar. Staðfestu einstakar færslur í frumheimildum.';

/**
 * Afmarkaða samhengið sem BÆÐI deterministic kaflarnir og LLM-túlkunin byggja á.
 * Allt sem greinargerðin má fullyrða er hér — með dagsetningum þar sem þær eru til.
 */
export function greinargerdSamhengi(watch, states, adverse, tonn, events, aukast) {
  const s = states || {};
  const L = (sig) => s[sig] || null;
  const auk = aukast || {};
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
    stada: L('status') ? {
      stada: L('status').stada || '', gjaldthrot: !!L('status').gjaldthrot, afskrad: !!L('status').afskrad, gjaldthol: !!L('status').gjaldthol,
      form: L('status').form || '', skraning: L('status').skraning || '', isat: L('status').isat || '',
      hlutafe: L('status').hlutafe ?? null, mynt: L('status').mynt || '',
    } : null,
    eigendur: L('ubo') ? {
      beinir: (L('ubo').owners || []).map((o) => ({ nafn: o.nafn, hlutur: o.hlutur })),
      endanlegir: (L('ubo').beneficial || []).map((b) => ({ nafn: b.nafn || b.key, effPct: b.effPct })),
      okklarad: !!L('ubo').incompleteChain,
    } : null,
    // ⚠ `board` var SKIMAÐ og geymt í kyc_snapshot frá upphafi en datt hvergi inn í greinargerðina
    //   (rýni 3.9.2026). Hver stýrir félaginu er kjarna-spurning áreiðanleikakönnunar — þetta var
    //   ekki gagnaskortur heldur gleymdur reitur. Sama gilti um `media` hér að neðan.
    stjorn: L('board') ? { medlimir: (L('board').members || []).map((b) => ({ nafn: b.nafn, hlutverk: b.hlutverk || '' })) } : null,
    skimanir: {
      refsilistar: L('sanctions') ? (L('sanctions').hits || []).length : null,   // null = heimild svaraði ekki
      // ⚠ veikar samsvaranir eru TALDAR en ALDREI lagðar að jöfnu við hits — eins-orðs nafnasamsvörun
      //   á íslenskum félagsnöfnum mældist 17 af 17 fölsk (31.7.2026). Þær eru fyrirvari, ekki niðurstaða.
      refsilistar_veikar: L('sanctions') ? (L('sanctions').veikar || []).length : null,
      pep: L('pep') ? (L('pep').matches || []).length : null,
      logbirtingar: L('legal') ? (L('legal').notices || []).map((n) => ({ tegund: n.type, dags: n.dags })) : null,
      // ⚠ hér stóð `.map((y) => y.ar)` — sviðið hét `skil_vanskil` en bar aðeins ártölin og henti
      //   vanskila-flagginu sjálfu. Líkanið las tómt fylki sem „engin vanskil" þótt gögnin segðu ekkert.
      skil_vanskil: L('skil') ? (L('skil').years || []).map((y) => ({ ar: y.ar, vanskil: !!y.vanskil })) : null,
    },
    umsvif: auk.umsvif || null,
    fjolmidlar_neikvaedir: L('media') ? (L('media').titles || []).map((t) => String(t.title || '').slice(0, 160)) : null,
    adverse: adv,
    tonn: ton,
    atburdir90d: (events || []).length,
  };
}

/** Sam-hash yfir allt samhengið — endurmyndun AÐEINS þegar eitthvað breyttist (kostnaðar-gát). */
export const greinargerdHash = (samhengi) => hash(JSON.stringify(samhengi));

export const GREINARGERD_SYSTEM = 'Þú aðstoðar tilkynningarskyldan aðila við áreiðanleikakönnun. '
  + 'Þér er gefið JSON-samhengi um eitt íslenskt FÉLAG (lögaðila). Skrifaðu EINA samantektar-málsgrein '
  + 'á íslensku (4-8 setningar) sem dregur saman það sem skiptir máli fyrir áhættumat — staðreyndir úr '
  + 'samhenginu eingöngu, engin ályktun um einstaklinga, engin áhættuflokkun (það er ákvörðun lesandans), '
  + 'engar tölur sem ekki standa í samhenginu. Ef gögn vantar (null) skaltu nefna það sem fyrirvara, '
  + 'ekki lesa það sem hreina niðurstöðu. ATH: í `tonn`-fylkinu er `medaltonn_fjolmidla` meðal-TÓNN '
  + 'fjölmiðlaumfjöllunar á bilinu -1 (neikvæð) til +1 (jákvæð) og `frettir` fjöldi frétta í mánuðinum '
  + '— þetta er EKKI magn, afli eða tonnatala. '
  // Umsvifin eru fyrir EÐLI OG UMFANG viðskiptasambandsins (8. gr. laga nr. 140/2018) — ekki greiðslumat.
  // Tölurnar á að lyfta orðrétt úr `umsvif.lysing`; hver umreiknuð tala fellur á talna-gátinni og drepur
  // þá alla túlkunina, svo þetta er ekki stílráð heldur skilyrði fyrir því að málsgreinin lifi af.
  + 'Ef `umsvif` er til staðar skaltu nefna umfang rekstrarins og afrita tölurnar ORÐRÉTT eins og þær '
  + 'standa í `umsvif.lysing` — hvorki umreikna, námunda né breyta einingum. Dragðu ENGA ályktun um '
  + 'greiðsluhæfi, lánstraust eða fjárhagslegan styrk af þeim; þær lýsa aðeins hvort raunverulegur '
  + 'rekstur standi að baki félaginu. '
  // stjorn nefnir einstaklinga: nafn+hlutverk er staðreynd, allt umfram það væri persónu-ályktun.
  + 'Ef `stjorn` er til staðar máttu nefna fjölda stjórnarmanna og hlutverk, en aldrei draga ályktun '
  + 'um einstaklingana sjálfa. Svaraðu AÐEINS með málsgreininni sjálfri, engu öðru.';

/**
 * Talna-gátin: hafnar túlkun sem nefnir tölu sem hvergi stendur í samhenginu.
 * Ártöl og prósentur teljast líka — hallucination á fjárhæð/fjölda í compliance-skjali er
 * verri en engin túlkun. Skilar hreinsuðum texta eða null (kallandi sleppir þá túlkuninni).
 */
export function parseTulkun(text, samhengi) {
  const t = String(text || '').trim();
  // Þakið fór 1400 → 2200 þegar umsvif/stjórn bættust í samhengið: 4-8 setningar sem bera
  // fjárhæðir komast ekki fyrir í 1400 stöfum, og of lágt þak birtist sem ÞÖGULT tap á túlkun.
  if (t.length < 40 || t.length > 2200) return null;
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
  p.push('<h4>1. Auðkenni og staða</h4>');
  if (c.stada) {
    const a = [];
    if (c.stada.form) a.push('<li>Rekstrarform: ' + esc(c.stada.form) + '</li>');
    if (c.stada.skraning) a.push('<li>Skráð: ' + esc(c.stada.skraning) + '</li>');
    if (c.stada.isat) a.push('<li>Atvinnugrein (ÍSAT): ' + esc(c.stada.isat) + '</li>');
    if (c.stada.hlutafe != null) a.push('<li>Skráð hlutafé: ' + esc(Math.round(c.stada.hlutafe).toLocaleString('de-DE')) + (c.stada.mynt ? ' ' + esc(c.stada.mynt) : '') + '</li>');
    if (a.length) p.push('<ul>' + a.join('') + '</ul>');
  }
  p.push(c.stada
    ? '<p>Skráð staða: <b>' + esc(c.stada.stada || 'óþekkt') + '</b>.' + (c.stada.gjaldthrot ? ' <b>Bú félagsins hefur verið tekið til gjaldþrotaskipta.</b>' : '') + (c.stada.afskrad ? ' Félagið er afskráð.' : '') + (c.stada.gjaldthol ? ' Félagið er skráð í gjaldþrotaskipti eða slit.' : '') + '</p>'
    : '<p><i>Fyrirvari: staðu-heimild svaraði ekki við síðustu skimun — staða er óstaðfest, ekki hrein.</i></p>');
  // 2. Eigendur
  p.push('<h4>2. Eigendur og raunverulegir eigendur</h4>');
  if (c.eigendur) {
    const ben = c.eigendur.endanlegir || [];
    p.push('<p>Beinir eigendur á skrá: ' + (c.eigendur.beinir || []).length + '. Endanlegir raunverulegir eigendur (≥25%): '
      + (ben.length ? ben.map((b) => esc(b.nafn) + ' (' + (b.effPct != null ? String(b.effPct).slice(0, 5) + '%' : 'hlutfall órakið') + ')').join(', ') : 'engir raktir yfir 25%')
      + '.' + (c.eigendur.okklarad ? ' <i>Fyrirvari: eignakeðja að hluta órakin — hlutföll eru lágmarksmat.</i>' : '') + '</p>');
  } else p.push('<p><i>Fyrirvari: eigenda-heimild svaraði ekki við síðustu skimun.</i></p>');
  // 3. Stjórn — hverjir fara með yfirráð. Nafn og hlutverk eru staðreyndir úr hlutafélagaskrá;
  //    greinargerðin fullyrðir ekkert umfram þau um einstaklingana sjálfa (DPIA leið A).
  p.push('<h4>3. Stjórn og fyrirsvar</h4>');
  if (c.stjorn) {
    const md = c.stjorn.medlimir || [];
    p.push(md.length
      ? '<ul>' + md.map((m) => '<li>' + esc(m.nafn) + (m.hlutverk ? ' — ' + esc(m.hlutverk) : '') + '</li>').join('') + '</ul>'
      : '<p>Engin virk stjórnarseta á skrá hjá hlutafélagaskrá.</p>');
  } else p.push('<p><i>Fyrirvari: stjórnar-heimild svaraði ekki við síðustu skimun.</i></p>');
  // 4. Skimanir
  p.push('<h4>4. Skimanir</h4><ul>');
  const sk = c.skimanir || {};
  p.push('<li>Refsilistar (OFAC/UN/EU): ' + (sk.refsilistar == null ? '<i>heimild svaraði ekki</i>' : sk.refsilistar + ' samsvaranir')
    + (sk.refsilistar_veikar ? ' <i>(auk ' + sk.refsilistar_veikar + ' veikra eins-orðs samsvarana sem eru ÓSTAÐFESTAR og teljast ekki niðurstaða)</i>' : '') + '</li>');
  p.push('<li>Innlend PEP-skimun: ' + (sk.pep == null ? '<i>heimild svaraði ekki</i>' : sk.pep + ' samsvaranir') + '</li>');
  p.push('<li>Lögbirtingar: ' + (sk.logbirtingar == null ? '<i>heimild svaraði ekki</i>' : (sk.logbirtingar.length ? sk.logbirtingar.map((n) => esc(n.tegund) + (n.dags ? ' (' + esc(n.dags) + ')' : '')).join(', ') : 'engar á skrá')) + '</li>');
  // sk.skil_vanskil ber nú {ar,vanskil} — ártal eitt og sér segir ekkert um hvort skilin voru í lagi.
  const vsk = (sk.skil_vanskil || []).filter((y) => y && y.vanskil);
  p.push('<li>Ársreikningaskil: ' + (sk.skil_vanskil == null ? '<i>heimild svaraði ekki</i>'
    : (!sk.skil_vanskil.length ? 'engin ár á skrá' : (vsk.length ? 'vanskil skráð ' + vsk.map((y) => esc(y.ar)).join(', ') : 'í skilum ' + sk.skil_vanskil.map((y) => esc(y.ar)).join(', ')))) + '</li>');
  p.push('</ul>');
  // 5. Umsvif — sjá UMSVIF_FYRIRVARI: endurbirting úr opinberum ársreikningi, engin afleidd einkunn.
  p.push('<h4>5. Umfang rekstrar</h4>');
  if (c.umsvif) {
    const u = c.umsvif;
    p.push('<p>' + esc(u.lysing) + '</p>');
    if ((u.ar_a_skra || []).length > 1) p.push('<p class="kg-meta">Ársreikningar á skrá: ' + u.ar_a_skra.map((y) => esc(y)).join(', ') + '.</p>');
    p.push('<p class="kg-fyrirvari">' + esc(UMSVIF_FYRIRVARI) + '</p>');
  } else p.push('<p><i>Enginn ársreikningur félagsins liggur fyrir í gagnasafninu. Fjarvera ársreiknings er ekki vísbending um rekstrarleysi — sæktu hann í ársreikningaskrá Skattsins og staðfestu umfangið þar.</i></p>');
  // 6. Fjölmiðlar + adverse
  p.push('<h4>6. Fjölmiðlaumfjöllun og adverse media (FATF)</h4>');
  p.push((c.adverse || []).length
    ? '<ul>' + c.adverse.map((a) => '<li><b>' + esc(a.heiti) + '</b> (' + esc(a.stada) + (a.dags ? ', ' + esc(a.dags) : '') + '): „' + esc(a.titill) + '" — ' + esc(a.source) + '</li>').join('') + '</ul>'
    : '<p>Engin FATF-flokkuð adverse media-umfjöllun á skrá.</p>');
  // Hrá neikvæð umfjöllun úr `media`-merkinu — var skimuð og geymd en birtist hvergi fyrr en 3.9.2026.
  // Aðgreind frá FATF-flokkuðu adverse media: hér er ENGIN flokkun, aðeins neikvæður tónn á nafni.
  if ((c.fjolmidlar_neikvaedir || []).length) {
    p.push('<p>Óflokkuð neikvæð umfjöllun þar sem nafn félagsins kemur fyrir (' + c.fjolmidlar_neikvaedir.length + '):</p>');
    p.push('<ul>' + c.fjolmidlar_neikvaedir.slice(0, 15).map((t) => '<li>„' + esc(t) + '"</li>').join('') + '</ul>');
  }
  if ((c.tonn || []).length) p.push('<p class="kg-tonn">Umfjöllunar-mánuðir á skrá (fjöldi frétta): ' + c.tonn.map((t) => esc(t.man) + ' (' + t.frettir + ')').join(', ') + '.</p>');
  // 7. Samantekt (LLM, gátuð) — EINI kaflinn sem líkanið skrifar
  p.push('<h4>7. Samantekt</h4>');
  p.push(tulkun ? '<p>' + esc(tulkun) + '</p>' : '<p><i>Sjálfvirk samantekt ekki tiltæk — kaflar 1–6 standa sjálfstætt.</i></p>');
  p.push('<p class="kg-fyrirvari">' + esc(GREINARGERD_FYRIRVARI) + '</p>');
  return p.join('\n');
}

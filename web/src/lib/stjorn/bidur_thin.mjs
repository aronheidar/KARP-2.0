// bidur_thin.mjs — HREIN eining: yfirlit + bilanir → EINN listi yfir það sem bíður Arons.
//
// Forstofan sýnir listann sameinaðan, „Bíður þín"-hólf hvers spjalds sýnir hann síaðan á eiganda.
// EIN uppspretta er kjarninn: tvær talningar á sama hlut enda alltaf á því að stangast á, og þá
// hættir maður að treysta báðum.

export const ADKALLANDI_SEK = 48 * 3600;   // beiðni sem hefur beðið svo lengi fær áherslu, ekki eigin línu
const CTO_FAST_SEK = 3600;                 // CTO-keyrsla og samþykkt→merge taka bæði mínútur; klukkustund þýðir að eitthvað féll
export const VIKA_SEK = 7 * 86400;         // „bíður þín": það sem þolir ekki að bíða fram í næstu viku
export const MANUDUR_SEK = 30 * 86400;     // spjaldið: „hvað endurnýjast í þessum mánuði"

/** Áskrift sem rennur út innan `gluggi` sekúndna. BÆÐI mörk, og `until` verður að vera endanleg tala.
 *  ⚠ Efra markið eitt og sér hleypti í gegn hverju sem EKKI er langt í framtíðinni úr stöðnaðri mynd —
 *    þar á meðal áskrift útrunninni fyrir tíu dögum, og `until: undefined` slapp sömu leið (`NaN > x`
 *    er líka ósatt).
 *  ⚠⚠ EIN uppspretta: „endurnýjast"-flísin í ./elin.mjs telur með SAMA falli. Afriti hún regluna reka
 *     talan á flísinni og fjöldi „bíður þín"-raðanna í sundur við fyrstu breytingu — og þá segir
 *     spjaldið „3 innan viku" meðan hólfið fyrir ofan sýnir tvær raðir, á sama skjá. */
export const rennurUtInnan = (r, nu, gluggi) => {
  const until = Number(r && r.until);
  return Number.isFinite(until) && until > nu && until <= nu + gluggi;
};

function rod(starfsmadur, tegund, titill, vidbot, sidan, slod) {
  return { starfsmadur, tegund, titill, vidbot: vidbot || '', sidan: Number(sidan) || 0, slod };
}

/** @returns {Array} raðað elst fyrst — það sem hefur beðið lengst er efst. */
export function bidurThin({ tickets = {}, bilanir = [], now = 0, markads = null, fjarmal = null } = {}) {
  const ut = [];
  const nu = Number(now) || 0;   // ⚠ reiknuð HÉR (ekki neðst) svo markaðsefna-blokkin fyrir neðan geti notað hana
  const listi = Array.isArray(tickets && tickets.list) ? tickets.list : [];
  const osent = new Set((tickets && tickets.moot_osent) || []);
  const mootBida = new Set((tickets && tickets.moot_bida) || []);
  for (const t of listi) {
    if (!t || !t.id) continue;
    const sidan = Number(t.updated || t.created || 0);
    const slod = '#ticket-' + t.id;
    // Sértækasta ástandið ræður svo hver beiðni birtist AÐEINS einu sinni.
    // ⚠ Skörun er raunhæf: beiðni getur lent bæði í moot_osent og moot_bida (nýr Moot-fundur eftir að
    // Aron kaus en áður en svarið fór út). moot_osent vinnur: samþykkt-en-ósent er áþreifanleg aðgerð,
    // ný atkvæðagreiðsla getur beðið.
    if (osent.has(t.id)) ut.push(rod('sigrun', 'moot_osent', '#' + t.id + ' — samþykkt svar ósent', t.efni, sidan, slod));
    else if (mootBida.has(t.id)) ut.push(rod('sigrun', 'moot', '#' + t.id + ' — Moot bíður atkvæðis', t.efni, sidan, slod));
    // 🙋 „Ég þarf þig á þessari": ástæðan kemur úr ticketsOverview (stjorn/hjalparbeidni.mjs), sem sér
    //    lýsinguna. Sama beiðni, sama röð, aðeins ástæðan í titlinum — hún er EKKI tvítalin.
    else if ((t.stada === 'nytt' || t.stada === 'stadfest') && t.hjalp && t.hjalp.texti) ut.push(rod('sigrun', 'hjalp', '#' + t.id + ' — ' + t.hjalp.texti, t.efni, sidan, slod));
    else if (t.stada === 'nytt' || t.stada === 'stadfest') ut.push(rod('sigrun', 'svar', '#' + t.id + ' — bíður svars', t.efni, sidan, slod));
    else if (t.stada === 'tillaga') ut.push(rod('hrafn', 'tillaga', '#' + t.id + ' — CTO-tillaga tilbúin', t.efni, sidan, slod));
    // `cto` og `samthykkt` eiga bæði að ganga yfir á mínútum (keyrsla annars vegar, merge+deploy hins
    // vegar). Sitji beiðni lengur er ræsingin fallin — og þá bíður hún Arons þótt staðan segi „í vinnslu".
    else if ((t.stada === 'cto' || t.stada === 'samthykkt') && Number(now) - sidan > CTO_FAST_SEK) {
      const cto = t.stada === 'cto';
      ut.push(rod('hrafn', cto ? 'cto_fast' : 'merge_fast',
        '#' + t.id + (cto ? ' — keyrsla hefur staðið í meira en klukkustund' : ' — samþykkt en merge hefur ekki skilað sér'),
        t.efni, sidan, slod));
    }
  }
  for (const b of (Array.isArray(bilanir) ? bilanir : [])) {
    if (!b || b.alvarleiki !== 'hatt') continue;   // miðlungs/lágt sést á spjaldi Hrafns, truflar ekki forstofuna
    ut.push(rod('hrafn', 'bilun', b.lysing, b.uppspretta, b.sidan, b.slod || '#hrafn'));
  }
  // 📣 Markaðsefni: dagatalið að tæmast, óflokkuð verk og tilbúnar tillögur. Þetta á heima HÉR en ekki
  //    inni í spjaldinu — annars sæi forstofan þær ekki og talan á andlitinu yrði núll þótt eitthvað bíði.
  const mk = (markads && typeof markads === 'object') ? markads : null;
  if (mk) {
    const dag = mk.dagatal || {};
    if (Number(dag.dagarFram) > 0 && Number(dag.dagarFram) < 7) {
      ut.push(rod('bjarki', 'dagatal', 'Dagatalið tæmist eftir ' + Math.round(dag.dagarFram) + ' daga', 'næsta lota þarf að fara af stað', nu, '#bjarki'));
    }
    const oflokkud = (Array.isArray(mk.safn) ? mk.safn : []).filter((v) => v && !v.efnistok).length;
    if (oflokkud) ut.push(rod('bjarki', 'oflokkad', oflokkud + ' verk eru óflokkuð', 'án efnistaka veit hann ekki hvað við höfum sagt áður', nu, '#bjarki'));
    for (const t of (Array.isArray(mk.tillogur) ? mk.tillogur : [])) {
      if (t && t.malefni) ut.push(rod('bjarki', 'tillaga', 'Tillaga: ' + t.malefni, t.rok || '', nu, '#bjarki'));
    }
  }
  // 💰 Fjármál: misræmi milli Áskels og réttinda, tvírukkun, og áskriftir sem renna út innan viku. Þetta á heima
  //    HÉR en ekki inni í spjaldinu — annars sæi forstofan þær ekki og talan á andlitinu yrði núll.
  // ⚠ Full kennitala fer ALDREI í titil — fyrri hlutinn dugar til að þekkja manneskjuna.
  const fj = (fjarmal && typeof fjarmal === 'object' && fjarmal.fjarmal && typeof fjarmal.fjarmal === 'object') ? fjarmal.fjarmal : null;
  if (fj) {
    const grima = (kt) => String(kt || '').slice(0, 6) + '-••••';
    const krT = (n) => Math.round(Number(n) || 0).toLocaleString('is-IS').replace(/,/g, '.');
    const TXT = {
      borgar_fyrir_ekkert: ['Borgar fyrir ekkert', 'rukkað í Áskeli en engin réttindi'],
      gefins: ['Fær gefins', 'réttindi án virks samnings'],
    };
    // ⚠⚠ Heildaryfirferð: MISRÆMI ERU EKKI SMÍÐUÐ ÞEGAR SAMANBURÐURINN VAR EKKI HEILL.
    //    Tvær leiðir gera hann hálfan, sitt á hvorum endanum, og báðar framleiða raðir sem eiga sér
    //    enga stoð — raðir sem BENDA Á NAFNGREINDAN VIÐSKIPTAVIN og segja hvað hann skuldi:
    //    · `villa === 'd1_hluti'`: D1-lesturinn brást meðan Áskell svaraði → `heimildir` tómt →
    //      HVER EINASTI virki samningur verður „borgar fyrir ekkert". Ein röð á hvern borgandi
    //      viðskiptavin, beint inn á forstofuna. `elin.mjs` féll rétt á þessu; hér var villan ólesin.
    //    · `verdUppsprettur.oaudkennt > 0`: virkt Áskels-stak var ekki auðkennanlegt (samningur án
    //      `customer_reference`, liður án `product_reference` — sjá ../fjarmal.mjs) → D1-heimildin
    //      stendur ein eftir og verður að „fær gefins" um mann sem er að borga.
    //    ⚠ `verdskra_hluti` fellir EKKERT: báðir listarnir náðust, svo pörunin sjálf er heil — aðeins
    //      verðin vantar. Að slökkva á öllum villukóðum í einu væri jafn ómarkvisst og engum.
    //    ⚠ `rennurUt` stendur áfram: hálfur heimildalisti gefur FÆRRI raðir, ekki uppspunnar.
    const uppsp = (fj.verdUppsprettur && typeof fj.verdUppsprettur === 'object') ? fj.verdUppsprettur : {};
    const samanburdurHeill = fj.villa !== 'd1_hluti' && !(Number(uppsp.oaudkennt) > 0);
    for (const m of (samanburdurHeill && Array.isArray(fj.misraemi) ? fj.misraemi : [])) {
      const t = m && TXT[m.tegund];
      if (!t) continue;
      // ⚠ Verk 4-yfirferð: `nu`, ALDREI `m.sidan` — sidan er sóknartími workersins. Í stöðnaðri mynd
      //   (varabraut eða rofi_elin=1) væri það gamalt og gerði misræmi ranglega „aðkallandi" eftir 48
      //   klst. Misræmi kostar peninga, ekki tíma — sbr. „sidan: nu" í lib/fjarmal.mjs.
      ut.push(rod('elin', m.tegund, t[0] + ': ' + grima(m.kt) + ' · ' + (m.vara || ''), t[1] + ' · ' + krT(m.verd) + ' kr/mán', nu, '#elin'));
    }
    // 💸 Tvírukkun: sami viðskiptavinur borgar TVISVAR fyrir sömu vöru. Þetta er annars eðlis en
    //    misræmi — misræmi er „við og Áskell erum ósammála", tvírukkun er „VIÐ ERUM AÐ RUKKA OF MIKIÐ",
    //    peningar sem viðskiptavinurinn á inni hjá okkur. Orðalagið verður að segja það, annars leitar
    //    lesandinn að röngum galla.
    // ⚠⚠ Heildaryfirferð: reiturinn var reiknaður í ../fjarmal.mjs, geymdur og borinn út alla leið —
    //    og LESINN HVERGI. Mælt gaf tvírukkaður viðskiptavinur „Áskell og réttindin stemma", núll
    //    misræmi og núll raðir, með uppblásna MRR-tölu sem rétta.
    // ⚠ Sían `samanburdurHeill` á EKKI við hér: tvírukkun er talin innan Áskels-listans EINS (tveir
    //   samningar á sama kt+vöru, sjá `greidandi` í ../fjarmal.mjs) og snertir heimildalistann hvergi.
    //   Bæði `d1_hluti` og `oaudkennt` gefa því FÆRRI tvírukkanir, aldrei uppspunnar — sömu rök og
    //   halda `rennur_ut` inni hér að neðan.
    for (const x of (Array.isArray(fj.tvirukkun) ? fj.tvirukkun : [])) {
      if (!x) continue;
      const fjoldi = Math.max(2, Number(x.fjoldi) || 2);
      ut.push(rod('elin', 'tvirukkun', 'Tvírukkun: ' + grima(x.kt) + ' · ' + (x.vara || ''),
        'við rukkum ' + fjoldi + ' sinnum fyrir sömu vöru · ' + krT(x.verd) + ' kr/mán alls', nu, '#elin'));
    }
    for (const r of (Array.isArray(fj.rennurUt) ? fj.rennurUt : [])) {
      // ⚠ Verk 4-yfirferð: BÆÐI mörk og endanleg tala — reglan sjálf býr í `rennurUtInnan` hér að ofan
      //   svo spjaldið geti talið eftir NÁKVÆMLEGA sömu reglu. Mánuðurinn sést á spjaldinu, vikan bíður þín.
      if (!rennurUtInnan(r, nu, VIKA_SEK)) continue;
      ut.push(rod('elin', 'rennur_ut', 'Rennur út: ' + grima(r.kt) + ' · ' + (r.vara || ''), 'innan viku', nu, '#elin'));
    }
  }
  return ut
    .map((r) => Object.assign(r, { bid: Math.max(0, nu - r.sidan), adkallandi: nu - r.sidan > ADKALLANDI_SEK }))
    .sort((a, b) => a.sidan - b.sidan);
}

export function bidurFyrir(listi, starfsmadur) {
  return (Array.isArray(listi) ? listi : []).filter((r) => r && r.starfsmadur === starfsmadur);
}

// bidur_thin.mjs — HREIN eining: yfirlit + bilanir → EINN listi yfir það sem bíður Arons.
//
// Forstofan sýnir listann sameinaðan, „Bíður þín"-hólf hvers spjalds sýnir hann síaðan á eiganda.
// EIN uppspretta er kjarninn: tvær talningar á sama hlut enda alltaf á því að stangast á, og þá
// hættir maður að treysta báðum.

export const ADKALLANDI_SEK = 48 * 3600;   // beiðni sem hefur beðið svo lengi fær áherslu, ekki eigin línu
const CTO_FAST_SEK = 3600;                 // CTO-keyrsla og samþykkt→merge taka bæði mínútur; klukkustund þýðir að eitthvað féll

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
  // 💰 Fjármál: misræmi milli Áskels og réttinda, og áskriftir sem renna út innan viku. Þetta á heima
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
    for (const m of (Array.isArray(fj.misraemi) ? fj.misraemi : [])) {
      const t = m && TXT[m.tegund];
      if (!t) continue;
      ut.push(rod('elin', m.tegund, t[0] + ': ' + grima(m.kt) + ' · ' + (m.vara || ''), t[1] + ' · ' + krT(m.verd) + ' kr/mán', m.sidan || nu, '#elin'));
    }
    for (const r of (Array.isArray(fj.rennurUt) ? fj.rennurUt : [])) {
      if (!r || Number(r.until) > nu + 7 * 86400) continue;   // mánuðurinn sést á spjaldinu, vikan bíður þín
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

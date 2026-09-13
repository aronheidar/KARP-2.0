// firma-nafn.mjs — nafn/kt dregið úr frjálsri spurningu fyrir fyrirtækja-uppflettingu.
//
// Klofið út úr worker.js (var inline í Spyrðu-Karp-laginu og ÓPRÓFAÐ). Ástæðan er áþreifanleg:
// „Eru þvingunaraðgerðir í gildi gagnvart Alvotech?" gaf leitarstrenginn
// „þvingunaraðgerðir gildi gagnvart alvotech" → 0 tréff hjá RSK, þótt bert „alvotech" gefi 2.
// firmaLookup hætti þá áður en nokkuð var flett upp, svo ALLAR undirveiturnar (eigendur, vanskil,
// kvóti, vörumerki, MAST, lögbirting, styrkir, refsilistar) þögnuðu í einu — ekki bara sú sem
// spurt var um. Gallinn var ósýnilegur af því enginn prófaði þáttunina sjálfa.
//
// KJARNAVANDINN: stopporðalisti nær ALDREI yfir allar íslenskar beygingar. Hann er samt réttur
// fyrsti kostur — hann gefur hreinasta strenginn þegar hann hittir. Lausnin er því ekki að elta
// listann heldur að hafa VARAKOST þegar hann klikkar.
//
// VARAKOSTURINN er sérnafna-vísbendingin: í íslenskri spurningu er fyrirtækjanafn nær alltaf
// HÁSTAFAÐ inni í setningunni („…gagnvart Alvotech?"), meðan almenn orð eru lágstöfuð. Fyrsta orð
// setningar er hástafað af stafsetningarástæðum og segir ekkert — það er því aðeins notað þegar
// ekkert annað hástafað orð finnst.
//
// ⚠ \b OG \w VIRKA EKKI á íslenska stafi í JS-regex (þess vegna eru stafamengin talin upp berum
//   orðum hér). Sama gildra og skjalfest er við FIRMA_STOP í worker.js.

const LÁG = 'a-záðéíóúýþæö';
const HÁ = 'A-ZÁÐÉÍÓÚÝÞÆÖ';

// Orð sem eru ALDREI hluti af fyrirtækjanafni í svona spurningu. Bætt við eftir þörfum — en
// ⚠ ALDREI orð sem gæti verið fyrirtækjanafn: „gildi" er t.d. BANNAÐ hér (Gildi lífeyrissjóður),
//   og það er einmitt dæmið sem sýnir af hverju stopporðalistinn einn dugar ekki sem lausn.
export const FIRMA_STOP = new Set(['hver', 'hverjir', 'hvað', 'hvaða', 'hvar', 'hvernig', 'hvers', 'hverju', 'hvaðan', 'ég', 'þú', 'við', 'finn', 'finna', 'sjá', 'séð', 'get', 'getur', 'upplýsingar', 'á', 'eiga', 'er', 'eru', 'sé', 'séu', 'eigandi', 'eigendur', 'raunverulegir', 'raunverulegur', 'raunveruleg', 'í', 'vanskilum', 'vanskil', 'vanskilaskrá', 'með', 'fyrirtækið', 'fyrirtækinu', 'félagið', 'félaginu', 'fyrirtæki', 'fyrirtækja', 'fyrirtækjum', 'félag', 'félaga', 'félögum', 'félög', 'kennitala', 'kennitölu', 'kt', 'hjá', 'um', 'the', 'og', 'eða', 'skuldar', 'skuld', 'skuldir', 'stjórn', 'forráðamaður', 'forráðamenn', 'skráðir', 'það', 'þetta', 'hlutafé', 'hluthafar', 'ársreikning', 'ársreikninga', 'ársreikningi', 'ársreikningum', 'ársreikninginn', 'ársreikningana', 'ársreikningaskil', 'skil', 'skilað', 'hvort', 'núna', 'nú', 'borgar', 'greiðir', 'atvinnugrein', 'heimilisfang', 'stofnað', 'stofnaður', 'hvenær', 'aflamark', 'aflamarki', 'kvóti', 'kvóta', 'kvótann', 'aflaheimild', 'aflaheimildir', 'veiðiheimild', 'gjaldþrota', 'gjaldþrot', 'þrot', 'þroti', 'vörumerki', 'vörumerkið', 'vörumerkjum', 'einkaleyfi', 'starfsleyfi', 'leyfi', 'eftirlit', 'eftirliti', 'loftför', 'loftfar', 'flugvél', 'flugvélar', 'þyrla', 'skip', 'skipa', 'bát', 'bátur', 'refsilista', 'refsilistum', 'þvingunar', 'mikið', 'mikinn', 'mikla', 'mörg', 'margar', 'marga', 'skráð', 'skráða', 'hefur', 'hafa', 'fær', 'fékk', 'hversu', 'hve', 'til']);

/** Kennitala úr spurningu (með eða án bandstriks), annars null. */
export function firmaKt(q) {
  const m = String(q).match(/(?:^|[^\d])(\d{6}-?\d{4})(?:[^\d]|$)/);
  return m ? m[1].replace('-', '') : null;
}

/** Kostur 1 — öll orð sem eru ekki stopporð, í upprunalegri röð, lágstafað. Óbreytt hegðun. */
export function firmaNafn(q) {
  const kt = firmaKt(q);
  if (kt) return kt;
  return String(q).toLowerCase().replace(/[?.!,]/g, ' ').split(/\s+/)
    .filter((w) => w && !FIRMA_STOP.has(w)).join(' ').trim();
}

/**
 * Kostur 2 — samfelld runa hástafaðra orða (sérnafn), ásamt félagsformi sem á eftir fylgir.
 * Félagsformin eru lágstöfuð („Alvotech hf") og myndu annars detta af nafninu.
 * `slepptaFyrsta`: fyrsta orð setningar er hástafað af stafsetningarástæðum, ekki af því að það sé
 * sérnafn — það er aðeins tekið með í seinni tilraun (sjá firmaKandidatar).
 */
export function sernafn(q, { slepptaFyrsta = true } = {}) {
  const ord = String(q).replace(/[?.!,]/g, ' ').split(/\s+/).filter(Boolean);
  const form = /^(ehf|hf|ohf|slhf|sf|slf|bs)\.?$/i;
  const hastafad = (w) => new RegExp('^[' + HÁ + ']').test(w);
  const runur = [];
  let cur = [];
  for (let i = 0; i < ord.length; i++) {
    const w = ord[i];
    if (hastafad(w) && !(slepptaFyrsta && i === 0)) { cur.push(w); continue; }
    if (cur.length && form.test(w)) { cur.push(w.replace(/\.$/, '')); continue; }  // „Alvotech hf"
    if (cur.length) { runur.push(cur); cur = []; }
  }
  if (cur.length) runur.push(cur);
  if (!runur.length) return '';
  // Lengsta runan (flest orð, svo flestir stafir) — „Íslandsbanki hf" fram yfir stakt „Reykjavík".
  runur.sort((a, b) => (b.length - a.length) || (b.join('').length - a.join('').length));
  return runur[0].join(' ');
}

/**
 * Kandidatar í forgangsröð fyrir RSK-uppflettingu. Kostur 1 er ALLTAF fyrstur, svo núverandi
 * hegðun helst óbreytt — þetta bætir aðeins við varaleið þegar hún skilar engu. Að hámarki tveir
 * strengir (hver þeirra kostar eina uppflettingu), og kennitala stuttsníðir allt.
 */
export function firmaKandidatar(q) {
  const kt = firmaKt(q);
  if (kt) return [kt];
  const ut = [];
  const c1 = firmaNafn(q);
  if (c1.length >= 2) ut.push(c1);
  // Sérnafn án fyrsta orðs; finnist ekkert, leyfa fyrsta orðinu („Alvotech er í vanskilum?").
  // ⚠ EN ALDREI ef fyrsta orðið er sjálft stopporð. Annars hleypir varaleiðin spurnarorðinu inn
  //   bakdyramegin: „Hvar finn ég upplýsingar um eigendur fyrirtækja?" strípaðist réttilega í
  //   tóman streng í kosti 1, en „Hvar" er hástafað fyrsta orð → kostur 2 leitaði að því og fann
  //   raunverulega félagið Hvar ehf., sem spjallið bar fram sem dæmi. Sé fyrsta orðið stopporð er
  //   það þar af því það er spurnarorð, ekki af því það sé nafn — og þá á ekkert að fletta upp.
  const fyrsta = String(q).replace(/[?.!,]/g, ' ').trim().split(/\s+/)[0] || '';
  const c2 = sernafn(q) || (FIRMA_STOP.has(fyrsta.toLowerCase()) ? '' : sernafn(q, { slepptaFyrsta: false }));
  const c2l = c2.toLowerCase();
  if (c2l.length >= 2 && c2l !== c1) ut.push(c2);
  return ut;
}

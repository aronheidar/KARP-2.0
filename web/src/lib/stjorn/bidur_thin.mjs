// bidur_thin.mjs — HREIN eining: yfirlit + bilanir → EINN listi yfir það sem bíður Arons.
//
// Forstofan sýnir listann sameinaðan, „Bíður þín"-hólf hvers spjalds sýnir hann síaðan á eiganda.
// EIN uppspretta er kjarninn: tvær talningar á sama hlut enda alltaf á því að stangast á, og þá
// hættir maður að treysta báðum.

export const ADKALLANDI_SEK = 48 * 3600;   // beiðni sem hefur beðið svo lengi fær áherslu, ekki eigin línu
const CTO_FAST_SEK = 3600;                 // CTO-keyrsla tekur mínútur; klukkustund þýðir að eitthvað féll

function rod(starfsmadur, tegund, titill, vidbot, sidan, slod) {
  return { starfsmadur, tegund, titill, vidbot: vidbot || '', sidan: Number(sidan) || 0, slod };
}

/** @returns {Array} raðað elst fyrst — það sem hefur beðið lengst er efst. */
export function bidurThin({ tickets = {}, bilanir = [], now = 0 } = {}) {
  const ut = [];
  const listi = Array.isArray(tickets && tickets.list) ? tickets.list : [];
  const osent = new Set((tickets && tickets.moot_osent) || []);
  const mootBida = new Set((tickets && tickets.moot_bida) || []);
  for (const t of listi) {
    if (!t || !t.id) continue;
    const sidan = Number(t.updated || t.created || 0);
    const slod = '#ticket-' + t.id;
    // Sértækasta ástandið ræður svo hver beiðni birtist AÐEINS einu sinni.
    if (osent.has(t.id)) ut.push(rod('sigrun', 'moot_osent', '#' + t.id + ' — samþykkt svar ósent', t.efni, sidan, slod));
    else if (mootBida.has(t.id)) ut.push(rod('sigrun', 'moot', '#' + t.id + ' — Moot bíður atkvæðis', t.efni, sidan, slod));
    else if (t.stada === 'nytt' || t.stada === 'stadfest') ut.push(rod('sigrun', 'svar', '#' + t.id + ' — bíður svars', t.efni, sidan, slod));
    else if (t.stada === 'tillaga') ut.push(rod('hrafn', 'tillaga', '#' + t.id + ' — CTO-tillaga tilbúin', t.efni, sidan, slod));
    else if (t.stada === 'cto' && Number(now) - sidan > CTO_FAST_SEK) ut.push(rod('hrafn', 'cto_fast', '#' + t.id + ' — keyrsla hefur staðið í meira en klukkustund', t.efni, sidan, slod));
  }
  for (const b of (Array.isArray(bilanir) ? bilanir : [])) {
    if (!b || b.alvarleiki !== 'hatt') continue;   // miðlungs/lágt sést á spjaldi Hrafns, truflar ekki forstofuna
    ut.push(rod('hrafn', 'bilun', b.lysing, b.uppspretta, b.sidan, b.slod || '#hrafn'));
  }
  const nu = Number(now) || 0;
  return ut
    .map((r) => Object.assign(r, { bid: Math.max(0, nu - r.sidan), adkallandi: nu - r.sidan > ADKALLANDI_SEK }))
    .sort((a, b) => a.sidan - b.sidan);
}

export function bidurFyrir(listi, starfsmadur) {
  return (Array.isArray(listi) ? listi : []).filter((r) => r && r.starfsmadur === starfsmadur);
}

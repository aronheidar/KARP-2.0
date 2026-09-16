// fjarmal.mjs — HREIN eining: Áskels-samningar × D1-heimildir → misræmi, fríprófanir og tvær MRR-tölur.
//
// ⚠⚠ MRR á stjórnborðinu er reiknað úr D1 með FÖSTU verðtöflunni — það mælir hvað við höfum VEITT,
//    ekki hvað er RUKKAÐ. Þetta tvennt fer í sundur nákvæmlega þegar peningar hætta að berast: kort
//    hafnar endurnýjun, réttindin standa til `until`, og talan sýnir tekjur sem koma aldrei.
//    `greidslur.mjs` veit þetta — þar stendur „Áskell = sannleikur".
// ⚠ Engin fetch, ekkert env, ekkert Date.now(). `now` kemur frá kallanda svo prófin séu föst í tíma.

/** ⚠ ORÐRÉTT sama regla og `virk` í ../worker/greidslur.mjs. Tvær talningar á sama hlut með ólíkri
 *  skilgreiningu enda alltaf á því að stangast á — og þá hættir maður að treysta báðum. */
export const VIRK = (st) => /active|trial|current/i.test(String(st || '')) && !/cancel|fail|expire|inactive/i.test(String(st || ''));

/** Fríprófun BER samning (sub2-leiðin stofnar hann í `trial`-stöðu) — hún er því ekki „gefins".
 *  En Áskell rukkar 0 meðan hún stendur, svo hún er ekki tekjur heldur. Þriðji flokkur. */
export const erFriprofun = (st) => /trial/i.test(String(st || ''));

export const ktHreint = (s) => String(s == null ? '' : s).replace(/\D/g, '');

// ⚠ Orðrétt úr ../worker/stjornbord.mjs:56-57 — þetta ER talan sem stjórnborðið sýnir í dag.
export const PRICE_TIER = { grunnur: 2900, fyrirtaeki: 6900, fyrirtaeki_plus: 12900 };
export const PRICE_SVC = { kvoti: 9900, utbod: 1900, frettir: 3900, fasteign: 3900, thingskyrslur: 3900 };

const fastVerd = (h) => (h && h.tegund === 'svc' ? (PRICE_SVC[h.vara] || 0) : (PRICE_TIER[h.vara] || 0));

/** Vísvitandi gjafaaðgangur — ALDREI misræmi. Rati hann í listann verður hann hávaði sem enginn les. */
const erGjof = (h) => !!(h && (h.free_access || h.is_admin || h.nemandi));

export function samstemma({ samningar = [], heimildir = [], verdskra = {}, now = 0 } = {}) {
  const nu = Number(now) || 0;
  const sList = (Array.isArray(samningar) ? samningar : []).filter((c) => c && VIRK(c.state));
  const hList = (Array.isArray(heimildir) ? heimildir : []).filter((h) => h && Number(h.until) > nu);

  // Lykill = kt + vara. Samningur getur borið fleiri en eitt `item`; hvert þeirra er sín vara.
  const sMap = new Map();
  for (const c of sList) {
    const kt = ktHreint(c.customer_reference);
    for (const it of (Array.isArray(c.items) ? c.items : [])) {
      const vara = String((it && it.product_reference) || '');
      if (!kt || !vara) continue;
      sMap.set(kt + '|' + vara, { kt, vara, state: c.state, verd: Number(it.price) || Number(verdskra[vara]) || 0 });
    }
  }
  const hMap = new Map();
  for (const h of hList) {
    const kt = ktHreint(h.kt);
    if (!kt || !h.vara) continue;
    hMap.set(kt + '|' + String(h.vara), h);
  }

  const misraemi = [], fripofanir = [];
  let mrrAskell = 0, mrrD1 = 0;

  for (const [lykill, s] of sMap) {
    const h = hMap.get(lykill);
    if (erFriprofun(s.state)) { fripofanir.push({ kt: s.kt, vara: s.vara, verd: s.verd }); continue; }
    mrrAskell += s.verd;
    if (!h) misraemi.push({ tegund: 'borgar_fyrir_ekkert', kt: s.kt, vara: s.vara, verd: s.verd, sidan: nu });
  }
  for (const [lykill, h] of hMap) {
    mrrD1 += fastVerd(h);
    if (sMap.has(lykill) || erGjof(h)) continue;
    misraemi.push({ tegund: 'gefins', kt: ktHreint(h.kt), vara: String(h.vara), verd: fastVerd(h), sidan: Number(h.until) || nu });
  }

  // Verðrek: aðeins fyrir vörur sem eiga fast verð í kóðanum. Vara utan beggja taflna hefur ekkert að
  // reka sig frá. ⚠ BÁÐAR töflurnar eru skoðaðar — þjónustuverð eru jafn harðkóðuð og þrepaverð og
  // reka sig eins.
  const verdrek = [];
  for (const [vara, askell] of Object.entries(verdskra || {})) {
    const fast = PRICE_TIER[vara] != null ? PRICE_TIER[vara] : PRICE_SVC[vara];
    if (fast != null && Number(askell) !== fast) verdrek.push({ vara, askell: Number(askell), fast });
  }

  return { misraemi, fripofanir, mrrAskell, mrrD1, verdrek };
}

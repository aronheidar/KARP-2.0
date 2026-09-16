// markadsefni.mjs — HREIN eining: Postiz-færslur → dagatal og verk-listi markaðsfulltrúans.
//
// ⚠ TVENNT sem gerir tölurnar rangar ef það gleymist:
//   1. Postiz-reikningurinn ber FLEIRI rásir en Karp (EWB Iceland, Engineers Without Borders Iceland,
//      Steinsson|Greykdal). Ósíaður listi lítur út fyrir að vera réttur en er það ekki.
//   2. Ein færsla á tveimur rásum kemur sem TVÆR færslur. Án hópunar tvítelst hvert einasta myndband.
//      ⚠ Þær deila EKKI `group` — Postiz gefur hverri færslu sitt eigið. Hópað er á tíma + texta;
//      sjá rökstuðninginn við `hopaFaerslur`.
export const KARP_RASIR = [
  'cmt92pcw000r9p20yv7b53018',   // Karp — LinkedIn
  'cmt92q6mr00pbmp0ykfa92r3v',   // Karp — Facebook
];
export function erKarpRas(id) {
  return typeof id === 'string' && KARP_RASIR.includes(id);
}

/** Fyrsta setning færslunnar, á einni línu — það sem sést í dagatalinu. */
export function efnislina(f) {
  const t = String((f && f.content) || '').replace(/\s+/g, ' ').trim();
  if (!t) return '(enginn texti)';
  const setning = (t.match(/^[^.!?]*[.!?]/) || [t])[0].trim();
  return setning.slice(0, 120);
}

/** Postiz-færslur → eitt verk per birtingu (sama myndband á tveimur rásum = EITT verk), aðeins
 *  Karp-rásir. Raðað eftir birtingartíma (elst fyrst).
 *
 *  ⚠⚠ Hópað er á BIRTINGARTÍMA + TEXTA, ekki á `group`. Postiz gefur hverri einustu færslu sitt eigið
 *     `group`: mælt á reikningnum 16.9 var `group === id` í öllum 41 færslum, og 18 pör deildu texta og
 *     tíma en báru sitt hvort `group`. Hópun á `group` var því núll-aðgerð sem tvítaldi hvert myndband —
 *     dagatalið sagði 20 verk í röð þegar þau voru ellefu. `group` fylgir áfram með til upplýsinga en
 *     parar EKKERT. Sama mæling sýndi líka að `posts:create` skilar engu `group`, svo framleiðslu-
 *     keyrslan getur ekki heldur vísað í það.
 *  ⚠ Lyklað er á FULLAN texta, ekki `efnislina`: tvö ólík verk mega deila fyrstu setningu.
 *  ⚠ `ids` ber öll undirliggjandi færslu-auðkenni verksins, og `lykill` er það fyrsta í stafrófsröð.
 *     Það er eina auðkennið sem bæði lestrarhliðin og `posts:create` þekkja, svo samstillingin parar
 *     á því — ekki á `group`.
 *  ⚠ `state` verður ERROR ef EIN rás brást, líka þegar hin fór út: villan er staðan sem kallar á
 *     aðgerð. `birt` er áfram satt um leið og ein rás hefur birst og er mælikvarðinn sem samstillingin
 *     notar. Áður réð sú færsla sem sást fyrst, sem var tilviljun.
 */
export function hopaFaerslur(posts) {
  const eftirHop = new Map();
  for (const f of (Array.isArray(posts) ? posts : [])) {
    if (!f || !erKarpRas(f.integration && f.integration.id)) continue;
    const ts = Math.floor(new Date(f.publishDate || 0).getTime() / 1000) || 0;
    const leit = ts + '|' + String(f.content || '').replace(/\s+/g, ' ').trim();
    let v = eftirHop.get(leit);
    if (!v) {
      v = { lykill: leit, group: f.group || null, ts, texti: efnislina(f), state: '', birt: false, rasir: [], ids: [], _stodur: [] };
      eftirHop.set(leit, v);
    }
    if (!v.rasir.includes(f.integration.providerIdentifier)) v.rasir.push(f.integration.providerIdentifier);
    if (f.id && !v.ids.includes(f.id)) v.ids.push(f.id);
    v._stodur.push(f.state || '');
    if (f.state === 'PUBLISHED') v.birt = true;
  }
  return [...eftirHop.values()].map((v) => {
    v.ids.sort();
    if (v.ids.length) v.lykill = v.ids[0];
    v.state = v._stodur.includes('ERROR') ? 'ERROR' : (v._stodur.find((s) => s !== 'PUBLISHED') || 'PUBLISHED');
    delete v._stodur;
    return v;
  }).sort((a, b) => a.ts - b.ts);
}

/** Staða dagatalsins. `dagarFram` er talan sem segir hvort maður sé á eftir — ekki fjöldinn í röðinni. */
export function dagatal(verk, nu) {
  const listi = Array.isArray(verk) ? verk : [];
  const nuS = Number(nu) || 0;
  const framundan = listi.filter((v) => v.ts > nuS);
  const bakvid = listi.filter((v) => v.ts <= nuS);
  const sidasti = framundan.length ? framundan[framundan.length - 1].ts : 0;
  return {
    iRod: framundan.length,
    naesta: framundan[0] || null,
    birtSidast: bakvid.length ? bakvid[bakvid.length - 1] : null,
    naerTil: sidasti || 0,
    dagarFram: sidasti ? Math.round((sidasti - nuS) / 86400) : 0,
  };
}

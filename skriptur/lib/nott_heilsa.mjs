// nott_heilsa.mjs — greinir ÞÖGLA nótt frá RÓLEGRI nótt. Engin I/O.
//
// ⚠⚠ AF HVERJU ÞETTA ER TIL. 17.9.2026 keyrði næturkráðið á tengslagrunninum, skrifaði NÚLL og var
// GRÆNT. Það slökkti á sér sjálft (báðir varnarrofar sprungu), prentaði sundurliðun villnanna og
// hætti með útgangskóða 0. Orsökin var að RSK-áskriftin fór að skila 403 og proxy-leiðin datt út
// með henni — og proxy-leiðin er EINA virka leiðin úr GitHub Actions, því RSK ber fram tóma síðu
// fyrir gagnaversvistföng. Grunnurinn hefði getað staðið í stað vikum saman án þess að nokkur sæi.
//
// Skriptan VISSI af biluninni. Hún sagði bara engum. Það er sama villan og felldi stjórnendahólfið
// í eigendaskýrslunni sama dag, og sama villan og minnið skráir úr /stjorn/ („grænt" þegar ekkert
// svar barst). Þögn er ekki hlutleysi, hún er fullyrðing um að allt sé í lagi.
//
// ⚠ ERFIÐI HLUTINN ER GREINARMUNURINN, EKKI VIÐVÖRUNIN. Nótt sem skrifar núll af því ekkert var á
// dagskrá er eðlileg og má ALDREI falla. Félli hún líka myndi maður venjast rauðu og hætta að lesa,
// og þá værum við verr sett en með þögninni. Munurinn liggur eingöngu í því hvort merki um
// KERFISBUNDNA bilun fylgja núllinu.

/**
 * @param {object} t  { ok, errs, discovered, sweepFound, villur, proxyDautt, scrapeStop }
 * @returns {{thogul:boolean, astaeda:(string|null), skilabod:string}}
 */
export function metaNott(t) {
  const T = t && typeof t === 'object' ? t : null;
  // ⚠ Ófullnægjandi inntak fellur ALDREI. Falskt rautt eyðileggur merkið sem við erum að reyna að búa til.
  if (!T) return { thogul: false, astaeda: null, skilabod: '' };

  const n = (v) => (Number.isFinite(+v) ? +v : 0);
  const villur = (T.villur && typeof T.villur === 'object') ? T.villur : {};
  const villuLyklar = Object.keys(villur);

  // Skilaði nóttin EINHVERJU? Ein einasta afurð nægir til að teljast ekki þögul — þá vann seiglan
  // sína vinnu og rofi sem sprakk á leiðinni er einmitt merki um að hún hafi gert það.
  const afurd = n(T.ok) + n(T.discovered) + n(T.sweepFound);
  if (afurd > 0) return { thogul: false, astaeda: null, skilabod: '' };

  // Núll í hús. Fylgja því merki um kerfisbundna bilun? Rofarnir eru raðaðir fremst því þeir eru
  // nær orsökinni en talningarnar — rofi springur ekki að ástæðulausu.
  const astaeda = T.proxyDautt ? 'proxy_dautt'
    : T.scrapeStop ? 'skrap_stoppad'
      : n(T.errs) > 0 ? 'thattunarvillur'
        : villuLyklar.length ? 'skrapvillur'
          : null;

  if (!astaeda) return { thogul: false, astaeda: null, skilabod: '' };   // róleg nótt, ekkert á dagskrá

  const TEXTI = {
    proxy_dautt: 'RSK-proxy datt út (varnarrofi sprakk) og ekkert kom í hús',
    skrap_stoppad: 'skrapið var stöðvað (varnarrofi sprakk) og ekkert kom í hús',
    thattunarvillur: 'allar þáttanir féllu',
    skrapvillur: 'öll skrap-köll féllu',
  };
  const skilabod = 'ÞÖGUL NÓTT: ' + TEXTI[astaeda] + '. '
    + 'Þáttað ' + n(T.ok) + ' ok · ' + n(T.errs) + ' villur · ' + n(T.discovered) + ' uppgötvuð · ' + n(T.sweepFound) + ' úr sweep. '
    + (villuLyklar.length ? 'Sundurliðun: ' + JSON.stringify(villur) + '. ' : '')
    + 'Grunnurinn stækkaði ekki í nótt. Athugaðu fyrst hvort RSK svari: karp.is/api/rsk?kt=<kt> (403 = áskriftin).';
  return { thogul: true, astaeda, skilabod };
}

// ⚠⚠ 22.9.2026: RÉTTA ORSÖKIN VAR ÖNNUR. Grunnurinn hætti að stækka 25.7, ekki 17.9: snjóboltinn
// lokaðist (1500 → 193 → 23 → 5 → 1 → 0 félög á nótt), og eftir það er nafnaleitar-sweepið EINA
// uppspretta nýrra félaga. Gagnaver ná ekki www.skatturinn.is (hvorki GitHub né Cloudflare-proxy, sjá
// 20.7), svo sweepið keyrir á vél Arons (scrape_local.mjs, Windows-verkið KARP-tengsl-scrape). Vinnumappa
// þess var worktree sem var eytt 13.9, og síðan hefur það ekki ræst. Nætur GitHub voru „rólegar" (tóm
// biðröð) í tvo mánuði, og rauðu næturnar frá 18.9 kenndu proxy-rofanum um, sem var aukaatriði.
// Þessi athugun spyr því EKKI hvað nóttin skilaði, heldur hvort staðbundna sweepið lifi. Hún á líka við
// afkastamiklar nætur (endurnýjun eftir 90 daga), annars hyrfi þögnin aftur um leið og þær byrja.

/**
 * @param {object} t  { eftir: forskeyti sem sweepið á eftir, sidast: 'YYYY-MM-DD…' síðasta skil þess, idag: 'YYYY-MM-DD', dagar? }
 * @returns {{thagnad:boolean, skilabod:string}}
 */
export function metaStadbundid(t) {
  const T = t && typeof t === 'object' ? t : null;
  if (!T) return { thagnad: false, skilabod: '' };   // ófullnægjandi inntak fellur ALDREI, eins og metaNott
  const eftir = Number.isFinite(+T.eftir) ? +T.eftir : 0;
  if (eftir <= 0) return { thagnad: false, skilabod: '' };   // sweepinu lokið: ekkert meira að uppgötva
  const dagur = (s) => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(s || '')); return m ? Date.parse(m[1] + 'T00:00:00Z') : NaN; };
  const idag = dagur(T.idag);
  if (!Number.isFinite(idag)) return { thagnad: false, skilabod: '' };
  const dagar = Number.isFinite(+T.dagar) && +T.dagar > 0 ? +T.dagar : 3;
  const sidast = dagur(T.sidast);
  const lidnir = Number.isFinite(sidast) ? Math.round((idag - sidast) / 86400000) : null;
  if (lidnir !== null && lidnir <= dagar) return { thagnad: false, skilabod: '' };
  const hvenaer = lidnir === null ? 'hefur aldrei skilað' : 'hefur ekki skilað síðan ' + String(T.sidast).slice(0, 10) + ' (' + lidnir + ' dagar)';
  return {
    thagnad: true,
    skilabod: 'Staðbundna sweepið ' + hvenaer + ', og ' + eftir + ' forskeyti eru eftir. '
      + 'Það er eina uppspretta nýrra félaga síðan snjóboltinn lokaðist, svo grunnurinn stækkar ekki fyrr en það keyrir. '
      + 'Athugaðu Windows-verkið KARP-tengsl-scrape á vél Arons: að vinnumappan sé til, að D1-lykill sé í web/.dev.vars, '
      + 'og í logginum (%TEMP%\\karp-scrape.log) hvort www.skatturinn.is throttli, því þá merkir sweepið ekkert þótt það keyri.',
  };
}

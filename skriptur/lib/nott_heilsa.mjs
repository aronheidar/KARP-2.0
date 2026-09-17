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

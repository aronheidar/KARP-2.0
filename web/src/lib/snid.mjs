// Sniðföll sem fleiri en ein síða/eining deilir — hrein föll, engin DOM-snerting.
// Áður afrituð orðrétt í ubo-report.js, eigendur.astro og fyrirtaeki.astro; hér
// er ein útgáfa, prófuð í web/src/lib/snid.test.mjs.

// HTML-flótti fyrir texta sem fer inn í innerHTML/template-strengi.
// ⚠ Flýr EKKI úrfellingarmerki (') → nothæft í attr="…" en ALDREI í attr='…'.
export const escF = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Kennitölusnið 000000-0000. Aðeins 10 stafa STRENGUR fær bandstrik; annað fellur
// óbreytt í gegn (þegar sniðin kennitala helst óbreytt), null/undefined → ''.
export const ktFmt = (kt) => (kt && kt.length === 10 ? kt.slice(0, 6) + '-' + kt.slice(6) : kt || '');

// Krónur → heilar milljónir með íslenskum þúsundapunkti (1234000000 → '1.234').
export const mkrF = (v) => String(Math.round(v / 1e6)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

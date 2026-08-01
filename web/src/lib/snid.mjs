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

// Heil tala með íslenskum þúsundapunkti (1900 → '1.900').
// ⚠ NOTIÐ ÞETTA Í VAFRA-KÓÐA, EKKI toLocaleString('is-IS'): margir vafrar hafa enga íslenska
// staðfærslu og falla þá ÞEGJANDI í enskt snið. Mælt á karp.is 1.8.2026 —
// Intl.NumberFormat.supportedLocalesOf(['is-IS']) skilaði [] og greiðslugáttin birti
// „1,900 kr./mán." á Útboðsvaktinni. Node við byggingu ræður við is-IS (Astro-sniðmát eru
// því í lagi), svo villan sést AÐEINS í client-kóða.
export const krFmt = (v) => String(Math.round(Number(v) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// karp-merki.mjs — Karp-fiskurinn sem SVG-STRENGUR fyrir staði þar sem Astro-hlutur kemst ekki að:
// skýrsluhausar sem eru byggðir með innerHTML/sniðmátsstrengjum (fyrirtaeki, fasteignavakt, frettir).
//
// ⚠ Af hverju (13.9.2026): vörumerkið var 🐟-emojí í prentaða skýrsluhausnum og í spjallhausnum —
//   kerfisletur sem lítur ólíkt út á Windows/Mac/Android og eins og barnaefni á sumum, í skjali sem
//   fer í compliance-möppu hjá lögmannsstofu. Handteiknaði karpinn er til (KarpFish.astro) en var
//   aðeins notaður í fljótandi hnappnum. Þetta er SAMA rúmfræði, kyrrstæð, án bóla og hreyfiklasa.
//
// ⚠ MEISTARINN ER components/KarpFish.astro — breytist teikningin þar á að endurspegla hana hér.
//   Í Astro-sniðmátum á ALLTAF að nota <KarpFish size={n} /> beint; þessi eining er aðeins fyrir strengi.
//   Fiskurinn horfir til VINSTRI (ákvörðun Arons 4.7.2026) — engin speglun.

/** Kyrrstæður karpi sem inline-SVG-strengur; `size` í px. Situr í textalínu (vertical-align) með bili á eftir. */
export function karpMerki(size = 18) {
  const s = Number(size) > 0 ? Number(size) : 18;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" '
    + 'style="display:inline-block;vertical-align:-.18em;margin-right:.3em">'
    + '<path d="M78 50 L96 34 Q91 50 96 66 Z" fill="#c98a26"/>'
    + '<path d="M38 32 Q52 14 68 30 L60 38 Q48 30 42 36 Z" fill="#c98a26"/>'
    + '<path d="M46 68 Q52 82 62 78 L56 66 Z" fill="#c98a26"/>'
    + '<ellipse cx="48" cy="50" rx="34" ry="21" fill="#f6b13b"/>'
    + '<g fill="none" stroke="#c98a26" stroke-width="1.6" opacity=".45">'
    + '<path d="M36 40 q5 5 0 10 M48 38 q5 6 0 12 M60 40 q5 5 0 10"/>'
    + '<path d="M42 52 q5 5 0 10 M54 52 q5 5 0 10 M66 50 q4 5 0 10"/></g>'
    + '<path d="M30 33 Q20 50 30 67" fill="none" stroke="#c98a26" stroke-width="2" opacity=".6"/>'
    + '<circle cx="24" cy="45" r="5.2" fill="#0b1220"/><circle cx="22.4" cy="43.4" r="1.7" fill="#eaf1fb"/>'
    + '<path d="M14.5 52 q3 2.4 6 1.6" fill="none" stroke="#0b1220" stroke-width="1.8" stroke-linecap="round"/>'
    + '<path d="M15 56 q-3 5 -7 5.5 M19 58 q-1 5 -4.5 7" fill="none" stroke="#c98a26" stroke-width="1.7" stroke-linecap="round"/>'
    + '</svg>';
}

/** Sjálfgefna stærðin fyrir skýrsluhausa (15px feitletur → 18px merki). */
export const KARP_MERKI = karpMerki(18);

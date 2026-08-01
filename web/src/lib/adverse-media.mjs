// adverse-media.mjs — FATF-samhæfð adverse media-flokkun fyrir Áreiðanleikavaktina (10. merkið).
// Hrein rökvísi (ekkert I/O): flokka-taxonomía, ströng nafna-samsvörun, prompt-smíði og
// ÞÁTTUN MEÐ HÖFNUN — svar með rangri lengd/ógildu gildi er hafnað í heild svo flokkun
// lendi aldrei á rangri frétt (sami lærdómur og sentiment-ai.mjs).
//
// ⚠ PERSÓNUVERND (DPIA leið A): flokkunin er EINGÖNGU lykluð á kennitölu LÖGAÐILA og birt
// AÐEINS í gáttaðri KYC-möppu undir DPA. Aldrei flokkun á einstaklingum, aldrei opinber birting.

// FATF-flokkarnir sem EDD-adverse-media á að ná yfir (lög 140/2018 samhengi).
export const FATF_FLOKKAR = {
  fjarsvik: 'Fjársvik og auðgunarbrot',
  peningathvaetti: 'Peningaþvætti',
  skattalagabrot: 'Skattalagabrot',
  mutur_spilling: 'Mútur og spilling',
  thvinganir: 'Brot á þvingunaraðgerðum',
  refsivert: 'Önnur refsiverð háttsemi í rekstri',
};

// Máls-staða: hvar í ferlinu umfjöllunin stendur — ásökun er ekki dómur og mappan á að sýna muninn.
export const MALS_STODUR = { umfjollun: 'Umfjöllun', asokun: 'Ásökun', akaera: 'Ákæra/rannsókn', domur: 'Dómur' };

// critical → strax-póstur um kycCriticalCron-leiðina; high → dagleg skimun + mappa.
// Þvætti og þvinganir eru flokkarnir sem tilkynningarskyldur aðili má síst frétta seint.
export const ADV_SEVERITY = {
  peningathvaetti: 'critical',
  thvinganir: 'critical',
  fjarsvik: 'high',
  skattalagabrot: 'high',
  mutur_spilling: 'high',
  refsivert: 'high',
};

export const advSeverity = (flokkur) => ADV_SEVERITY[flokkur] || 'high';

const _ws = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const STAF = 'a-záðéíóúýþæö';
// Lögform aftan af nafni ("Brim hf." → "Brim"). Aðeins þekkt viðskeyti — aldrei almenn stytting.
const _anSuffix = (s) => _ws(s).replace(/[,.]?\s+(ehf|hf|ohf|slhf|slf|sf|svf|bs|ses)\.?$/i, '');

/**
 * Ströng nafna-samsvörun félags í fréttatexta. Rangur aðili í adverse media-möppu er
 * verri en engin samsvörun — reglurnar eru því íhaldssamar (refsilista-lærdómurinn):
 *  1) Fullt skráð nafn sem hlutstrengur (ónæmt fyrir hástöfum) → já.
 *  2) Nafn án lögforms með ≥2 tókenum ("Norðurhaf Sjávarfang") → hlutstrengur, ónæmt f. hástöfum.
 *  3) EITT tóken án lögforms ("Brim") → aðeins orð-afmörkuð samsvörun MEÐ upprunalegum
 *     hástaf og ≥4 stafir — "brim" (lágstafa) er líka almennt orð og "Ás" er mannsnafn.
 *
 * Samsvörunin er MIÐ-lagið af þremur: SQL-LIKE fann kandídatinn, þetta fall fellir augljósar
 * falssamsvaranir, og flokkarinn sjálfur svarar svo hvort FÉLAGIÐ sé gerandinn (þolandi = 0).
 */
export function adverseMatch(nafn, texti) {
  const n = _ws(nafn); const t = _ws(texti);
  if (n.length < 4 || !t) return false;
  if (t.toLowerCase().includes(n.toLowerCase())) return true;
  const stofn = _anSuffix(n);
  if (stofn === n || stofn.length < 4) return false;
  if (stofn.includes(' ')) return t.toLowerCase().includes(stofn.toLowerCase());
  if (stofn[0] !== stofn[0].toUpperCase()) return false;
  const esc = stofn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^' + STAF + STAF.toUpperCase() + '0-9])' + esc + '([^' + STAF + STAF.toUpperCase() + '0-9]|$)').test(t);
}

export const ADV_SYSTEM = 'Þú ert adverse media-flokkari fyrir áreiðanleikakannanir (KYC/EDD skv. lögum 140/2018). '
  + 'Þér eru gefnar íslenskar fréttir sem nefna tiltekið FÉLAG. Metu HVERJA frétt: fjallar hún um að FÉLAGIÐ SJÁLFT '
  + 'tengist einhverju af eftirfarandi — fjarsvik (fjársvik/auðgunarbrot), peningathvaetti, skattalagabrot, '
  + 'mutur_spilling, thvinganir (brot á þvingunaraðgerðum), refsivert (önnur refsiverð háttsemi í rekstri)? '
  + 'Máls-staða: umfjollun, asokun, akaera (ákæra eða opinber rannsókn), domur. '
  + 'Svaraðu NÁKVÆMLEGA einni línu per frétt, sniðið "N: flokkur|stada" eða "N: 0" ef ekkert á við. '
  + 'MIKILVÆGT: "0" er rétt svar við venjulegum viðskiptafréttum, taprekstri, uppsögnum, gagnrýni og deilum '
  + 'sem eru ekki refsiverðar — aðeins flokka þegar textinn ber það skýrt. Ef félagið er þolandi brots '
  + '(t.d. svikið FÉ AF félaginu) er svarið 0. Engar aðrar línur, engar skýringar.';

/** Notendaskeyti flokkarans: númeruð fyrirsögn+úrdráttur per frétt fyrir félagið `nafn`. */
export function advPrompt(nafn, items) {
  const lines = items.map((it, i) => (i + 1) + '. ' + _ws(it.title).slice(0, 180)
    + (it.body ? ' — ' + _ws(it.body).slice(0, 260) : ''));
  return 'FÉLAG: ' + _ws(nafn) + '\n\nFRÉTTIR:\n' + lines.join('\n');
}

/**
 * Þáttar svar flokkarans. Skilar nákvæmlega `n` færslum ({flokkur,stada}|null per frétt)
 * — EÐA null ef svarið stenst ekki (röng lengd, ógildur flokkur, tvítekið númer).
 * Höfnun í heild er viljandi: brenglað svar má aldrei dreifa flokkum á rangar fréttir.
 */
export function parseAdv(text, n) {
  const out = new Array(n).fill(undefined);
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\d+)\s*[:.]\s*(.+)$/);
    if (!m) return null;
    const idx = +m[1] - 1;
    if (idx < 0 || idx >= n || out[idx] !== undefined) return null;
    const v = m[2].trim();
    if (v === '0') { out[idx] = null; continue; }
    const p = v.split('|').map((s) => s.trim().toLowerCase());
    if (!FATF_FLOKKAR[p[0]]) return null;
    const stada = p[1] && MALS_STODUR[p[1]] ? p[1] : 'umfjollun';
    out[idx] = { flokkur: p[0], stada };
  }
  if (out.some((x) => x === undefined)) return null;
  return out;
}

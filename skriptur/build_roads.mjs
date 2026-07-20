// Byggir ROADS-módelið (baseline + links + scenarios) úr Karp-gögnunum.
// Grunn-ferlar: línulegur glide frá núverandi gildi að IMF-spá yfir 12 ársfj. (einfaldað BAU).
// Tengsl: curated, hvert með HEIMILD (source) + óvissu-bandi (ci). Stílfærð sambönd, ekki spá.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const g = (f) => JSON.parse(readFileSync(join(ROOT, 'gogn', f + '.json'), 'utf8'));
const Q = 12; // 12 ársfj. = 3 ár

const SB = g('sedlabanki').headline;
const rateNow = SB.meginvextir.value;      // 7.75
const inflNow = SB.verdbolga.value;        // 5.2
const gdpF = g('hagvoxtur').forecast.values; // IMF, síðustu = 2.4
const inflF = g('verdlag').forecast.values;  // IMF, → 2.5
const unemNow = g('atvinnuleysi').latest;    // 4.24
const houseNow = g('fasteignir').direction.chg12; // 1.6
const lq = g('leiga').quarters;
const rentNow = lq.length >= 5 ? +(100 * (lq[lq.length - 1].medM2 / lq[lq.length - 5].medM2 - 1)).toFixed(1) : 5; // ~6.6% (2024F1, gögn stöðnuð)

// línulegur glide núverandi → target yfir Q ársfj.
const glide = (from, to, q = Q) => Array.from({ length: q }, (_, i) => +(from + (to - from) * (i / (q - 1))).toFixed(3));

const baseline = {
  updated: new Date().toISOString().slice(0, 10),
  quarters: Q,
  disclaimer: 'Stílfærð sambönd byggð á opinberum gögnum — ekki opinber spá.',
  levers: {
    vextir: { base: rateNow, min: 0, max: 12, step: 0.25, unit: '%', label: 'Stýrivextir (Seðlabanki)' },
    laun: { base: 6, min: 0, max: 14, step: 0.5, unit: '%/ári', label: 'Launahækkun (kjarasamningar)' },
    vedhlutfall: { base: 80, min: 50, max: 90, step: 5, unit: '%', label: 'Hámarks veðsetningarhlutfall' },
    frambod: { base: 0, min: -20, max: 40, step: 5, unit: '%', label: 'Nýbygginga-framboð (frávik)' },
  },
  shocks: {
    olia: { base: 0, min: -50, max: 100, step: 5, unit: '%', label: 'Olíuverð (frávik)' },
    gengi: { base: 0, min: -25, max: 25, step: 1, unit: '%', label: 'Gengi krónu (styrking +)' },
    ferdamenn: { base: 0, min: -40, max: 40, step: 5, unit: '%', label: 'Ferðamenn (frávik)' },
    adflutningur: { base: 0, min: -60, max: 60, step: 10, unit: '%', label: 'Aðflutningur (frávik)' },
  },
  outcomes: {
    verdbolga: { label: 'Verðbólga', unit: '%', path: glide(inflNow, 2.6) },
    hagvoxtur: { label: 'Hagvöxtur (VLF)', unit: '%', path: glide(gdpF[10] ?? 1.9, gdpF[gdpF.length - 1] ?? 2.4) },
    atvinnuleysi: { label: 'Atvinnuleysi', unit: '%', path: glide(unemNow, 4.0) },
    kaupmattur: { label: 'Kaupmáttur launa', unit: '%', path: glide(0.8, 1.5) },
    husnaedi: { label: 'Húsnæðisverð (12-mán)', unit: '%', path: glide(houseNow, 3.0) },
    leiga: { label: 'Leiga (12-mán)', unit: '%', path: glide(rentNow, 4.0) },
    greidslubyrdi: { label: 'Greiðslubyrði (vísit.)', unit: '', path: glide(100, 100) },
  },
  clamp: { verdbolga: [-2, 25], hagvoxtur: [-8, 9], atvinnuleysi: [0, 16], kaupmattur: [-10, 12], husnaedi: [-20, 30], leiga: [-15, 25], greidslubyrdi: [50, 200] },
};

// ── Tengsl (curated, með heimild + óvissu). pp = prósentustig, % = prósent-breyting. ──
// Heimildir: SÍ Peningamál/QMM-yfirfærslustuðlar, Hagstofa, OECD; röð-metið þar sem tekið fram.
const links = [
  { id: 'r_infl', from: 'vextir', to: 'verdbolga', coef: -0.15, lag: 4, unit: 'pp/pp', ci_lo: -0.28, ci_hi: -0.06, source: 'SÍ QMM peningastefnu-yfirfærsla (~1 árs töf)', note: 'Aðhald lækkar verðbólgu tafið' },
  { id: 'r_gdp', from: 'vextir', to: 'hagvoxtur', coef: -0.20, lag: 2, unit: 'pp/pp', ci_lo: -0.35, ci_hi: -0.08, source: 'SÍ QMM / OECD teygni' },
  { id: 'r_unem', from: 'vextir', to: 'atvinnuleysi', coef: 0.10, lag: 4, unit: 'pp/pp', ci_lo: 0.03, ci_hi: 0.18, source: 'Okun-tengt, SÍ' },
  { id: 'r_house', from: 'vextir', to: 'husnaedi', coef: -0.80, lag: 2, unit: '%/pp', ci_lo: -1.30, ci_hi: -0.40, source: 'Röð-metið: sedlabanki × fasteignir (2010–2026)' },
  { id: 'w_infl', from: 'laun', to: 'verdbolga', coef: 0.30, lag: 2, unit: 'pp/pp', ci_lo: 0.15, ci_hi: 0.45, source: 'Launa-verð spírall, Hagstofa/SÍ' },
  { id: 'w_house', from: 'laun', to: 'husnaedi', coef: 0.40, lag: 3, unit: '%/pp', ci_lo: 0.15, ci_hi: 0.70, source: 'Kaupgeta → húsnæðiseftirspurn' },
  { id: 'ltv_house', from: 'vedhlutfall', to: 'husnaedi', coef: 0.15, lag: 2, unit: '%/pp', ci_lo: 0.05, ci_hi: 0.30, source: 'Þjóðhagsvarúð, HMS/FME' },
  { id: 'oil_infl', from: 'olia', to: 'verdbolga', coef: 0.02, lag: 1, unit: 'pp/%', ci_lo: 0.01, ci_hi: 0.035, source: 'Olíuverðs-yfirfærsla, Hagstofa VNV-vægi' },
  { id: 'fx_infl', from: 'gengi', to: 'verdbolga', coef: -0.06, lag: 1, unit: 'pp/%', ci_lo: -0.12, ci_hi: -0.02, source: 'Gengisyfirfærsla (styrking lækkar innflutt verð)' },
  { id: 'fx_gdp', from: 'gengi', to: 'hagvoxtur', coef: -0.03, lag: 2, unit: 'pp/%', ci_lo: -0.07, ci_hi: 0.0, source: 'Sterk króna → lakari útflutningsvegur' },
  { id: 'tour_gdp', from: 'ferdamenn', to: 'hagvoxtur', coef: 0.03, lag: 1, unit: 'pp/%', ci_lo: 0.015, ci_hi: 0.05, source: 'Ferðaþjónusta ~8% VLF, ferdathjonusta × hagvoxtur' },
  { id: 'tour_unem', from: 'ferdamenn', to: 'atvinnuleysi', coef: -0.02, lag: 1, unit: 'pp/%', ci_lo: -0.04, ci_hi: -0.005, source: 'Ferðaþjónusta vinnuaflsfrek' },
  // Feedback-lykkjur (lag ≥ 1):
  { id: 'infl_wage', from: 'verdbolga', to: 'kaupmattur', coef: -1.0, lag: 0, unit: 'pp/pp', ci_lo: -1.0, ci_hi: -1.0, source: 'Skilgreining: kaupmáttur = nafnlaun − verðbólga' },
  { id: 'wage_kaup', from: 'laun', to: 'kaupmattur', coef: 1.0, lag: 0, unit: 'pp/pp', ci_lo: 1.0, ci_hi: 1.0, source: 'Skilgreining: nafnlauna-hluti kaupmáttar' },
  { id: 'gdp_unem', from: 'hagvoxtur', to: 'atvinnuleysi', coef: -0.30, lag: 1, unit: 'pp/pp', ci_lo: -0.5, ci_hi: -0.15, source: "Okun's law, íslensk aðlögun" },
  { id: 'house_infl', from: 'husnaedi', to: 'verdbolga', coef: 0.05, lag: 1, unit: 'pp/%', ci_lo: 0.02, ci_hi: 0.09, source: 'Reiknuð húsaleiga í VNV' },
  { id: 'infl_wageloop', from: 'verdbolga', to: 'laun', coef: 0.35, lag: 4, unit: 'pp/pp', ci_lo: 0.15, ci_hi: 0.55, source: 'Verðbólga → næstu kjarasamningar (vísitölu-tenging)' },
  // ── Húsnæðis-eining (module 2) ──
  { id: 'fr_house', from: 'frambod', to: 'husnaedi', coef: -0.30, lag: 4, unit: '%/%', ci_lo: -0.50, ci_hi: -0.12, source: 'Framboðs-teygni húsnæðis (OECD/HMS)' },
  { id: 'mig_house', from: 'adflutningur', to: 'husnaedi', coef: 0.06, lag: 2, unit: '%/%', ci_lo: 0.02, ci_hi: 0.10, source: 'Aðflutningur → húsnæðiseftirspurn (HMS/SÍ)' },
  { id: 'mig_rent', from: 'adflutningur', to: 'leiga', coef: 0.08, lag: 1, unit: '%/%', ci_lo: 0.03, ci_hi: 0.14, source: 'Aðflutningur → leigueftirspurn' },
  { id: 'house_rent', from: 'husnaedi', to: 'leiga', coef: 0.35, lag: 2, unit: '%/%', ci_lo: 0.15, ci_hi: 0.55, source: 'Verð↔leiga samhreyfing (HMS)' },
  { id: 'fr_rent', from: 'frambod', to: 'leiga', coef: -0.15, lag: 4, unit: '%/%', ci_lo: -0.30, ci_hi: -0.03, source: 'Framboð → lægri leiga' },
  { id: 'r_burden', from: 'vextir', to: 'greidslubyrdi', coef: 2.5, lag: 1, unit: 'vísit/pp', ci_lo: 1.5, ci_hi: 3.5, source: 'Greiðslubyrði-næmni f. vöxtum' },
  { id: 'house_burden', from: 'husnaedi', to: 'greidslubyrdi', coef: 0.40, lag: 1, unit: 'vísit/%', ci_lo: 0.20, ci_hi: 0.60, source: 'Hærra verð → stærra lán' },
  { id: 'kaup_burden', from: 'kaupmattur', to: 'greidslubyrdi', coef: -0.60, lag: 1, unit: 'vísit/pp', ci_lo: -1.0, ci_hi: -0.30, source: 'Hærri ráðstöfunartekjur → lægri byrði' },
  { id: 'ltv_burden', from: 'vedhlutfall', to: 'greidslubyrdi', coef: 0.30, lag: 2, unit: 'vísit/pp', ci_lo: 0.10, ci_hi: 0.50, source: 'Hærra veðhlutfall → stærra lán' },
];
// fjarlægja placeholder-tengsl með coef 0 (halda gögnum hreinum)
const cleanLinks = links.filter((l) => l.coef !== 0 || l.ci_lo !== 0 || l.ci_hi !== 0);

const scenarios = [
  { id: 'vaxtahaekkun', label: 'Vaxtahækkun 0,25pp', tldr: 'Seðlabankinn hækkar stýrivexti', levers: { vextir: rateNow + 0.25 }, shocks: {}, sentence: 'Vaxtahækkun um 0,25 prósentustig gæti — að öllu óbreyttu — hægt á verðbólgu og húsnæðisverði á 1–2 árum, en dregið lítillega úr hagvexti.' },
  { id: 'vaxtalaekkun', label: 'Vaxtalækkun 0,5pp', tldr: 'Seðlabankinn lækkar stýrivexti', levers: { vextir: rateNow - 0.5 }, shocks: {}, sentence: 'Vaxtalækkun um 0,5 prósentustig gæti örvað hagvöxt og húsnæðisverð, á kostnað hærri verðbólgu tafið.' },
  { id: 'kjarasamningar', label: 'Kjarasamningar +8%', tldr: 'Launahækkun umfram forsendur', levers: { laun: 8 }, shocks: {}, sentence: 'Launahækkun upp á 8% eykur kaupmátt til skamms tíma en ýtir undir verðbólgu og húsnæðisverð, sem getur kallað á hærri vexti.' },
  { id: 'lodnubrestur', label: 'Aflabrestur (útflutn. −10%)', tldr: 'Loðnubrestur veikir gjaldeyri', levers: {}, shocks: { gengi: -6 }, sentence: 'Aflabrestur sem veikir krónuna um ~6% hækkar innflutt verð og verðbólgu, og bætir tímabundið útflutningsveg.' },
  { id: 'ferdamannafall', label: 'Ferðamönnum fækkar 20%', tldr: 'Samdráttur í ferðaþjónustu', levers: {}, shocks: { ferdamenn: -20 }, sentence: 'Fækkun ferðamanna um 20% dregur úr hagvexti og eykur atvinnuleysi, einkum á Suðurnesjum og í þjónustu.' },
  { id: 'oliuskellur', label: 'Olíuverð +40%', tldr: 'Alþjóðlegur olíuskellur', levers: {}, shocks: { olia: 40 }, sentence: 'Olíuverðshækkun um 40% ýtir undir verðbólgu gegnum eldsneyti og flutning, með takmörkuðum beinum áhrifum á hagvöxt.' },
  { id: 'adflutningur_upp', label: 'Aðflutningur +50%', tldr: 'Mikil fólksfjölgun', levers: {}, shocks: { adflutningur: 50 }, sentence: 'Aukinn aðflutningur (+50% umfram forsendur) eykur eftirspurn eftir húsnæði og leigu — hækkar verð og leigu og þyngir greiðslubyrði nýrra kaupenda.' },
  { id: 'byggingarhrina', label: 'Byggingarhrina (+30% framboð)', tldr: 'Aukið nýbygginga-framboð', levers: { frambod: 30 }, shocks: {}, sentence: 'Aukið framboð nýbygginga (+30%) hægir á húsnæðisverði og leigu með nokkurra ára töf — helsta tækið gegn húsnæðisverðbólgu.' },
  { id: 'adflutningsstopp', label: 'Aðflutningsstopp (−40%)', tldr: 'Samdráttur í aðflutningi', levers: {}, shocks: { adflutningur: -40 }, sentence: 'Snörp fækkun aðflutnings (−40%) dregur úr húsnæðis- og leigueftirspurn — kælir verð og leigu.' },
];

mkdirSync(join(ROOT, 'gogn', 'roads'), { recursive: true });
const w = (f, o) => writeFileSync(join(ROOT, 'gogn', 'roads', f), JSON.stringify(o, null, 1));
w('baseline.json', baseline);
w('links.json', cleanLinks);
w('scenarios.json', scenarios);
console.log(`ROADS módel byggt: ${Object.keys(baseline.outcomes).length} útkomur, ${cleanLinks.length} tengsl, ${scenarios.length} sviðsmyndir. Vextir=${rateNow} Verðbólga=${inflNow}`);

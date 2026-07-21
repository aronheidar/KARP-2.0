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
const popNow = g('mannfjoldi').POP.yoy; // 1.3 (%/ári)
const LT = g('langtima'); const ltI = LT.ar.indexOf(2026);
const balNow = LT.afkoma[ltI] ?? -0.65, debtNow = LT.skuldir[ltI] ?? 38.8;
// Ríkisskuldabréfa-markaður (markadir.json) — EINA markaðs-gagnið sem tengist herminum með viti: ávöxtunarkrafa
// RIKB sýnir hvað markaðurinn rukkar fyrir að fjármagna ríkisskuldirnar + væntingar um vexti (ferill-halli). Til samhengis, ekki drifkraftur.
const MK = (() => { try { return g('markadir'); } catch (e) { return null; } })();
const rikb = ((MK && MK.bonds && MK.bonds.nominal) || []).slice().sort((a, b) => a.yr - b.yr);
const bondCurve = rikb.length >= 2 ? { short: rikb[0], long: rikb[rikb.length - 1], updated: MK.updated } : null;

// línulegur glide núverandi → target yfir Q ársfj.
const glide = (from, to, q = Q) => Array.from({ length: q }, (_, i) => +(from + (to - from) * (i / (q - 1))).toFixed(3));
const MAXQ = 40; // langtíma-hamur: 10 ár (40 ársfj.). BAU = glide á 3-ára jafnvægi, síðan haldið.
const bau = (from, to) => { const gg = glide(from, to, Q); return gg.concat(Array(MAXQ - Q).fill(gg[Q - 1])); };
const glideFull = (from, to) => glide(from, to, MAXQ); // hæg drift yfir allan sjóndeildarhring (t.d. öldrun)
// Ársfjórðungslegur ferill úr ÁRLEGRI röð (t.d. fjármálaáætlun ríkisins) — línuleg brúun milli ára frá startYear.
// Notað fyrir 10-ára BAU skulda/afkomu svo grunnferillinn fylgi RAUNVERULEGRI langtímastefnu, ekki flötu haldi.
const fromAnnual = (vals, years, startYear, q = MAXQ) => Array.from({ length: q }, (_, t) => {
  const yr = startYear + t / 4;
  let i = years.findIndex((y) => y >= yr); if (i < 0) i = years.length - 1; if (i === 0) i = 1;
  const y0 = years[i - 1], y1 = years[i], v0 = vals[i - 1] ?? vals[vals.length - 1], v1 = vals[i] ?? vals[vals.length - 1];
  return +(v0 + (v1 - v0) * (y1 === y0 ? 0 : (yr - y0) / (y1 - y0))).toFixed(3);
});
// Fjármála-ferlar úr áætlun (deildir svo SFC-kennisetning haldist: einkajöfnuður = viðskiptajöfnuður − ríkisjöfnuður)
const afkomaPath = fromAnnual(LT.afkoma, LT.ar, 2026);
const skuldirPath = fromAnnual(LT.skuldir, LT.ar, 2026);
const caPath = bau(2, 2);                                             // viðskiptajöfnuður BAU
const einkaPath = caPath.map((ca, t) => +(ca - afkomaPath[t]).toFixed(3)); // CA − ríki (nákvæmt tie-out)

const baseline = {
  updated: new Date().toISOString().slice(0, 10),
  quarters: Q,
  maxQuarters: MAXQ,
  disclaimer: 'Stílfærð sambönd byggð á opinberum gögnum — ekki opinber spá.',
  // Fjármálaáætlun ríkisins (langtima.json) — grunnferill afkomu/skulda fylgir henni; sýnt sem samhengi í Módel-flipa.
  fiscalPlan: { heimild: LT.heimild, markmid: LT.markmid, skilabod: LT.skilabod, heilbr: { ar: LT.heilbr_ar, vlf: LT.heilbr_vlf }, bonds: bondCurve },
  levers: {
    // Peningastefna & þjóðhagsvarúð
    vextir: { base: rateNow, min: 0, max: 12, step: 0.25, unit: '%', label: 'Stýrivextir (Seðlabanki)', group: 'Peningastefna & varúð' },
    vedhlutfall: { base: 80, min: 50, max: 90, step: 5, unit: '%', label: 'Hámarks veðsetningarhlutfall', group: 'Peningastefna & varúð' },
    dsti: { base: 35, min: 25, max: 45, step: 5, unit: '%', label: 'Greiðslubyrðisþak (DSTI)', group: 'Peningastefna & varúð' },
    bindiskylda: { base: 0, min: -5, max: 15, step: 1, unit: '%', label: 'Bindiskylda banka (frávik)', group: 'Peningastefna & varúð' },
    verdtrygging: { base: 40, min: 0, max: 80, step: 10, unit: '%', label: 'Verðtrygging húsnæðislána (hlutfall nýrra lána)', group: 'Peningastefna & varúð' },
    // Ríkisfjármál & skattar
    skattar: { base: 0, min: -15, max: 15, step: 1, unit: '%', label: 'Tekjuskattur (frávik)', group: 'Ríkisfjármál & skattar' },
    fjarmagnstekjuskattur: { base: 0, min: -10, max: 15, step: 1, unit: '%', label: 'Fjármagnstekjuskattur (frávik)', group: 'Ríkisfjármál & skattar' },
    tryggingagjald: { base: 0, min: -5, max: 8, step: 1, unit: '%', label: 'Tryggingagjald (launatengt, frávik)', group: 'Ríkisfjármál & skattar' },
    vsk: { base: 0, min: -4, max: 6, step: 1, unit: '%', label: 'Virðisaukaskattur (frávik)', group: 'Ríkisfjármál & skattar' },
    utgjold: { base: 0, min: -15, max: 15, step: 1, unit: '%', label: 'Útgjöld ríkis (frávik)', group: 'Ríkisfjármál & skattar' },
    tilfaerslur: { base: 0, min: -10, max: 20, step: 5, unit: '%', label: 'Tilfærslur (barna-/vaxtabætur)', group: 'Ríkisfjármál & skattar' },
    innvidir: { base: 0, min: -10, max: 30, step: 5, unit: '%', label: 'Innviðafjárfesting', group: 'Ríkisfjármál & skattar' },
    veidigjald: { base: 0, min: -50, max: 100, step: 10, unit: '%', label: 'Veiðigjald (frávik)', group: 'Ríkisfjármál & skattar' },
    ivilnanir: { base: 0, min: -10, max: 40, step: 5, unit: '%', label: 'Styrkir & ívilnanir (nýsköpun)', group: 'Ríkisfjármál & skattar' },
    menntun: { base: 0, min: -10, max: 30, step: 5, unit: '%', label: 'Menntun & rannsóknir (fjárfesting)', group: 'Ríkisfjármál & skattar' },
    // Húsnæði
    frambod: { base: 0, min: -20, max: 40, step: 5, unit: '%', label: 'Nýbygginga-framboð (frávik)', group: 'Húsnæði' },
    leiguhusnaedi: { base: 0, min: 0, max: 40, step: 5, unit: '%', label: 'Félagslegt/leiguhúsnæði', group: 'Húsnæði' },
    lodaframbod: { base: 0, min: -10, max: 40, step: 5, unit: '%', label: 'Lóðaframboð & skipulag', group: 'Húsnæði' },
    // Vinnumarkaður & mannauður
    laun: { base: 6, min: 0, max: 14, step: 0.5, unit: '%/ári', label: 'Launahækkun (kjarasamningar)', group: 'Vinnumarkaður & mannauður' },
    atvinnuthatttaka: { base: 0, min: -5, max: 15, step: 1, unit: '%', label: 'Atvinnuþátttökuhvatar', group: 'Vinnumarkaður & mannauður' },
    innflytjendastefna: { base: 0, min: -20, max: 40, step: 5, unit: '%', label: 'Innflytjendastefna (atvinnuleyfi)', group: 'Vinnumarkaður & mannauður' },
    lifeyrisaldur: { base: 67, min: 65, max: 72, step: 1, unit: ' ár', label: 'Lífeyrisaldur', group: 'Vinnumarkaður & mannauður' },
    // Auðlindir, orka & loftslag
    kvoti: { base: 0, min: -30, max: 20, step: 5, unit: '%', label: 'Aflamark (frávik)', group: 'Auðlindir, orka & loftslag' },
    fridun: { base: 0, min: 0, max: 30, step: 5, unit: '%', label: 'Friðun/verndarsvæði sjávar', group: 'Auðlindir, orka & loftslag' },
    orka: { base: 0, min: -15, max: 30, step: 5, unit: '%', label: 'Orka til stóriðju (frávik)', group: 'Auðlindir, orka & loftslag' },
    orkuskipti: { base: 0, min: -10, max: 40, step: 5, unit: '%', label: 'Orkuskipta-hvati (rafvæðing)', group: 'Auðlindir, orka & loftslag' },
    kolefnisgjald: { base: 0, min: -50, max: 100, step: 10, unit: '%', label: 'Kolefnisgjald (frávik)', group: 'Auðlindir, orka & loftslag' },
    skograekt: { base: 0, min: 0, max: 40, step: 5, unit: '%', label: 'Skógrækt & kolefnisbinding', group: 'Auðlindir, orka & loftslag' },
    // Byggð & ferðaþjónusta
    byggdastefna: { base: 0, min: -10, max: 40, step: 5, unit: '%', label: 'Byggðaáhersla (til landsbyggðar)', group: 'Byggð & ferðaþjónusta' },
    ferdamannagjald: { base: 0, min: 0, max: 40, step: 5, unit: '%', label: 'Ferðamannagjald', group: 'Byggð & ferðaþjónusta' },
  },
  shocks: {
    olia: { base: 0, min: -50, max: 100, step: 5, unit: '%', label: 'Olíuverð (frávik)' },
    gengi: { base: 0, min: -25, max: 25, step: 1, unit: '%', label: 'Gengi krónu (styrking +)' },
    ferdamenn: { base: 0, min: -40, max: 40, step: 5, unit: '%', label: 'Ferðamenn (frávik)' },
    adflutningur: { base: 0, min: -60, max: 60, step: 10, unit: '%', label: 'Aðflutningur (frávik)' },
    frjosemi: { base: 0, min: -40, max: 40, step: 5, unit: '%', label: 'Frjósemi (frávik)' },
    heimshagvoxtur: { base: 0, min: -6, max: 6, step: 1, unit: '%', label: 'Heimshagvöxtur (frávik)' },
    hravaruverd: { base: 0, min: -40, max: 60, step: 5, unit: '%', label: 'Hrávöruverð (ál/fiskur, frávik)' },
  },
  outcomes: {
    verdbolga: { label: 'Verðbólga', unit: '%', path: bau(inflNow, 2.6) },
    hagvoxtur: { label: 'Hagvöxtur (VLF)', unit: '%', path: bau(gdpF[10] ?? 1.9, gdpF[gdpF.length - 1] ?? 2.4) },
    atvinnuleysi: { label: 'Atvinnuleysi', unit: '%', path: bau(unemNow, 4.0) },
    kaupmattur: { label: 'Kaupmáttur launa', unit: '%', path: bau(0.8, 1.5) },
    husnaedi: { label: 'Húsnæðisverð (12-mán)', unit: '%', path: bau(houseNow, 3.0) },
    leiga: { label: 'Leiga (12-mán)', unit: '%', path: bau(rentNow, 4.0) },
    greidslubyrdi: { label: 'Greiðslubyrði (vísit.)', unit: '', path: bau(100, 100) },
    mannfjoldi: { label: 'Fólksfjölgun', unit: '%', path: bau(popNow, 1.0) },
    vinnuafl: { label: 'Vinnuaflsvöxtur', unit: '%', path: bau(1.5, 1.2) },
    // 10-ára BAU beint úr fjármálaáætlun ríkisins (langtima.json): afkoma nær jöfnuði 2028 → +0,3% afgangur; skuldir 38,8%→30% að markmiði.
    afkoma: { label: 'Afkoma ríkissjóðs', unit: '% VLF', path: afkomaPath },
    skuldir: { label: 'Skuldir ríkis', unit: '% VLF', path: skuldirPath },
    utflutningur: { label: 'Útflutningsvöxtur', unit: '%', path: bau(2, 2.5) },
    losun: { label: 'CO₂-losun (vísit.)', unit: '', path: bau(100, 100) },
    vanskil: { label: 'Vanskil (vísit.)', unit: '', path: bau(100, 100) },
    folksfjoldi: { label: 'Fólksfjöldi (vísit., frávik)', unit: '', path: bau(100, 100) },
    framfaersla: { label: 'Framfærsluhlutfall (vísit.)', unit: '', path: glideFull(100, 106) },
    byggdajofnudur: { label: 'Byggðajöfnuður (vísit.)', unit: '', path: glideFull(100, 96) },
    nyskopun: { label: 'Nýsköpun & hugvit (vísit.)', unit: '', path: bau(100, 100) },
    fiskistofn: { label: 'Fiskistofn (vísit.)', unit: '', path: bau(100, 100) },
    husnaedi_hbs: { label: 'Húsnæði — höfuðborg (12-mán)', unit: '%', path: bau(houseNow, 3.5) },
    husnaedi_land: { label: 'Húsnæði — landsbyggð (12-mán)', unit: '%', path: bau(houseNow, 2.0) },
    gengi_endo: { label: 'Gengi krónu — endógen (styrking +)', unit: '%', path: bau(0, 0) },
    // ── Fjármálahlið (module 13) ──
    peningamagn: { label: 'Peningamagn M3 (árs-breyting)', unit: '%', path: bau(7, 5) },
    utlanavoxtur: { label: 'Útlánavöxtur (árs-breyting)', unit: '%', path: bau(6, 5) },
    lifeyriseignir: { label: 'Lífeyrissjóða-eignir (% VLF)', unit: '% VLF', path: bau(175, 182) },
    hlutabref: { label: 'Hlutabréf (vísit.)', unit: '', path: bau(100, 100) },
    vaxtaalag: { label: 'Vaxtaálag ríkis (pp)', unit: 'pp', path: bau(0.8, 0.7) },
    // ── Ytri staða (module 13) ──
    vidskiptajofnudur: { label: 'Viðskiptajöfnuður (% VLF)', unit: '% VLF', path: caPath },
    niip: { label: 'Erlend staða þjóðarbús (% VLF)', unit: '% VLF', path: bau(30, 35) },
    // ── Dreifing & heimili (module 13) ──
    jofnudur: { label: 'Tekjujöfnuður (vísit., hærra=jafnara)', unit: '', path: bau(100, 100) },
    heimilaskuldir: { label: 'Skuldir heimila (vísit.)', unit: '', path: bau(100, 100) },
    // ── SFC: geira-jöfnuðir tie-out (Godley). Einkageiri = viðskiptajöfnuður − ríkisjöfnuður (kennisetning). ──
    // Baseline = CA_base − afkoma_base = bau(2,2) − bau(balNow,−0.5) = bau(2−balNow, 2,5) (bau línulegt → mismunur =bau mismuna).
    einkajofnudur: { label: 'Einkageira-jöfnuður (% VLF, sparn.−fjárf.)', unit: '% VLF', path: einkaPath },
    // ── Geira-virðisauki (diagnostík, vísit. base 100 — TERMINAL: engin endurgjöf í heildar-VLF → engin tvítöldun; grundað í raun-greina-hlutum úr D1 /api/roads/atvinnuvegir) ──
    vlf_sjavar: { label: 'Sjávarútvegur — virðisauki (vísit.)', unit: '', path: bau(100, 100) },
    vlf_ferda: { label: 'Ferðaþjónusta — virðisauki (vísit.)', unit: '', path: bau(100, 100) },
    vlf_idnadur: { label: 'Iðnaður & orka — virðisauki (vísit.)', unit: '', path: bau(100, 100) },
  },
  // clamp-mörk víkkuð til að ná yfir SÖGULEG bil 2010–2026 (sjá backtest_history.mjs): húsnæði ±33%, atvinnuleysi 17,8% (COVID)
  clamp: { verdbolga: [-2, 25], hagvoxtur: [-8, 9], atvinnuleysi: [0, 20], kaupmattur: [-10, 12], husnaedi: [-25, 38], leiga: [-15, 30], greidslubyrdi: [50, 200], mannfjoldi: [-1, 4], vinnuafl: [-2, 5], afkoma: [-8, 6], skuldir: [10, 120], utflutningur: [-15, 20], losun: [40, 200], vanskil: [60, 260], folksfjoldi: [90, 120], framfaersla: [88, 135], byggdajofnudur: [78, 122], nyskopun: [70, 165], fiskistofn: [55, 140], husnaedi_hbs: [-25, 38], husnaedi_land: [-28, 42], gengi_endo: [-35, 35], peningamagn: [-8, 22], utlanavoxtur: [-15, 28], lifeyriseignir: [140, 240], hlutabref: [45, 190], vaxtaalag: [0, 7], vidskiptajofnudur: [-16, 14], niip: [-90, 90], jofnudur: [78, 122], heimilaskuldir: [55, 185], einkajofnudur: [-24, 24], vlf_sjavar: [40, 180], vlf_ferda: [40, 180], vlf_idnadur: [40, 180] },
};

// ── Tengsl (curated, með heimild + óvissu). pp = prósentustig, % = prósent-breyting. ──
// Heimildir: SÍ Peningamál/QMM-yfirfærslustuðlar, Hagstofa, OECD; röð-metið þar sem tekið fram.
const links = [
  { id: 'r_infl', from: 'vextir', to: 'verdbolga', coef: -0.15, lag: 4, unit: 'pp/pp', ci_lo: -0.28, ci_hi: -0.06, nl: { type: 'sat', k: 1.0 }, source: 'SÍ QMM peningastefnu-yfirfærsla (~1 árs töf)', note: 'ÓLÍNULEGT: minnkandi jaðar-hjöðnun af mjög stórum vaxtahækkunum (mettun)' },
  { id: 'r_gdp', from: 'vextir', to: 'hagvoxtur', coef: -0.20, lag: 2, unit: 'pp/pp', ci_lo: -0.35, ci_hi: -0.08, source: 'SÍ QMM / OECD teygni' },
  // Framsýnar væntingar (lead): BOÐUÐ vaxtahækkun (framsýn stefnu-leið) lækkar verðbólguvæntingar STRAX. 0 ef stefna föst → bítur aðeins á tímaháða/boðaða leið (t.d. dýnamíska KARP). Módel-samræmt fyrir exogenu leiðina (ekki fastpunkts-lausn endógenra vænta).
  { id: 'exp_rate', from: 'vextir', to: 'verdbolga', coef: -0.08, lag: 0, lead: 4, unit: 'pp/pp', ci_lo: -0.16, ci_hi: -0.02, source: 'Framsýnar verðbólguvæntingar af boðaðri peningastefnu (trúverðug framsýn leiðsögn)' },
  { id: 'r_unem', from: 'vextir', to: 'atvinnuleysi', coef: 0.10, lag: 4, unit: 'pp/pp', ci_lo: 0.03, ci_hi: 0.18, source: 'Okun-tengt, SÍ' },
  { id: 'r_house', from: 'vextir', to: 'husnaedi', coef: -0.80, lag: 2, unit: '%/pp', ci_lo: -1.30, ci_hi: -0.40, source: 'Röð-metið: sedlabanki × fasteignir (2010–2026)' },
  { id: 'w_infl', from: 'laun', to: 'verdbolga', coef: 0.30, lag: 2, unit: 'pp/pp', ci_lo: 0.15, ci_hi: 0.45, nl: { type: 'accel', at: 1.0, by: 0.15, cap: 2 }, source: 'Launa-verð spírall, Hagstofa/SÍ', note: 'ÓLÍNULEGT: stórar launahækkanir hraða launa-verð spíral (hröðun yfir þröskuld)' },
  { id: 'w_house', from: 'laun', to: 'husnaedi', coef: 0.40, lag: 3, unit: '%/pp', ci_lo: 0.15, ci_hi: 0.70, source: 'Kaupgeta → húsnæðiseftirspurn' },
  { id: 'ltv_house', from: 'vedhlutfall', to: 'husnaedi', coef: 0.15, lag: 2, unit: '%/pp', ci_lo: 0.05, ci_hi: 0.30, source: 'Þjóðhagsvarúð, HMS/FME' },
  { id: 'oil_infl', from: 'olia', to: 'verdbolga', coef: 0.02, lag: 1, unit: 'pp/%', ci_lo: 0.01, ci_hi: 0.035, source: 'Olíuverðs-yfirfærsla, Hagstofa VNV-vægi' },
  { id: 'fx_infl', from: 'gengi', to: 'verdbolga', coef: -0.06, lag: 1, unit: 'pp/%', ci_lo: -0.12, ci_hi: -0.02, source: 'Gengisyfirfærsla (styrking lækkar innflutt verð)' },
  { id: 'fx_gdp', from: 'gengi', to: 'hagvoxtur', coef: -0.012, lag: 2, unit: 'pp/%', ci_lo: -0.03, ci_hi: 0.0, source: 'Sterk króna → lakari samkeppnisstaða (annað en útflutningur; sjá fx_exp)' },
  { id: 'tour_gdp', from: 'ferdamenn', to: 'hagvoxtur', coef: 0.018, lag: 1, unit: 'pp/%', ci_lo: 0.008, ci_hi: 0.03, source: 'Ferðaþjónusta bein VLF-áhrif (afgangur um útflutning; sjá tour_exp)' },
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
  // ── Lýðfræði-eining (module 3) ──
  { id: 'adf_pop', from: 'adflutningur', to: 'mannfjoldi', coef: 0.010, lag: 1, unit: '%/%', ci_lo: 0.006, ci_hi: 0.016, source: 'Aðflutningur = meginþáttur mannfjölgunar (Hagstofa)' },
  { id: 'fer_pop', from: 'frjosemi', to: 'mannfjoldi', coef: 0.004, lag: 1, unit: '%/%', ci_lo: 0.001, ci_hi: 0.008, source: 'Fæðingar → höfðatala; ⚠langtíma-áhrif, 3-ára hverfandi — sjá /mannfjoldi/ (spá til 2074)' },
  { id: 'adf_labor', from: 'adflutningur', to: 'vinnuafl', coef: 0.015, lag: 1, unit: '%/%', ci_lo: 0.008, ci_hi: 0.024, source: 'Vinnualdurs-innflytjendur → vinnuafl (Hagstofa/VMST)' },
  { id: 'labor_gdp', from: 'vinnuafl', to: 'hagvoxtur', coef: 0.30, lag: 1, unit: 'pp/pp', ci_lo: 0.15, ci_hi: 0.50, source: 'Vinnuafl sem framleiðsluþáttur' },
  { id: 'labor_unem', from: 'vinnuafl', to: 'atvinnuleysi', coef: 0.10, lag: 2, unit: 'pp/pp', ci_lo: 0.02, ci_hi: 0.20, source: 'Aukið framboð vinnuafls (skammtíma frásog)' },
  // ── Ríkisfjármála-eining (module 4) ──
  { id: 'tax_bal', from: 'skattar', to: 'afkoma', coef: 0.08, lag: 1, unit: '%VLF/%', ci_lo: 0.04, ci_hi: 0.12, nl: { type: 'sat', k: 0.55 }, source: 'Skattbreyting → tekjur ríkissjóðs', note: 'LAFFER: Ísland er nú þegar háskatta-land → tekjuauki af frekari hækkun fer minnkandi (grunnrýrnun: vinnuframboð/flótti/undanskot). Tvöföldun hækkunar skilar litlu meira.' },
  { id: 'exp_bal', from: 'utgjold', to: 'afkoma', coef: -0.08, lag: 1, unit: '%VLF/%', ci_lo: -0.12, ci_hi: -0.04, source: 'Útgjöld → gjöld ríkissjóðs' },
  { id: 'gdp_bal', from: 'hagvoxtur', to: 'afkoma', coef: 0.30, lag: 1, unit: '%VLF/pp', ci_lo: 0.15, ci_hi: 0.45, source: 'Sjálfvirkir jöfnarar (hærri VLF → meiri tekjur)' },
  { id: 'unem_bal', from: 'atvinnuleysi', to: 'afkoma', coef: -0.20, lag: 1, unit: '%VLF/pp', ci_lo: -0.35, ci_hi: -0.08, source: 'Atvinnuleysi → bætur + minni tekjur' },
  { id: 'debt_carry', from: 'skuldir', to: 'skuldir', coef: 1.0, lag: 1, unit: '', ci_lo: 1.0, ci_hi: 1.0, source: 'Skulda-uppsöfnun — fyrri staða flyst áfram (STOFN gegnum sjálf-lykkju)' },
  { id: 'bal_debt', from: 'afkoma', to: 'skuldir', coef: -0.25, lag: 1, unit: '%VLF/%VLF', ci_lo: -0.35, ci_hi: -0.15, source: 'Halli eykur skuldir (~afkoma/4 per ársfj.)' },
  { id: 'tax_gdp', from: 'skattar', to: 'hagvoxtur', coef: -0.05, lag: 2, unit: 'pp/%', ci_lo: -0.10, ci_hi: -0.01, source: 'Skatta-drag á eftirspurn' },
  { id: 'exp_gdp', from: 'utgjold', to: 'hagvoxtur', coef: 0.05, lag: 1, unit: 'pp/%', ci_lo: 0.01, ci_hi: 0.10, source: 'Fjármála-margfaldari' },
  // ── Auðlinda-eining (module 5) ──
  { id: 'kvoti_exp', from: 'kvoti', to: 'utflutningur', coef: 0.20, lag: 2, unit: '%/%', ci_lo: 0.10, ci_hi: 0.32, source: 'Sjávarafurðir ~stór hluti útflutnings (Hagstofa)' },
  { id: 'orka_exp', from: 'orka', to: 'utflutningur', coef: 0.25, lag: 2, unit: '%/%', ci_lo: 0.12, ci_hi: 0.40, source: 'Ál/stóriðja útflutningur (79,9% orku)' },
  { id: 'exp_gdp2', from: 'utflutningur', to: 'hagvoxtur', coef: 0.10, lag: 1, unit: 'pp/%', ci_lo: 0.04, ci_hi: 0.18, source: 'Útflutningur drífur VLF' },
  { id: 'orka_emis', from: 'orka', to: 'losun', coef: 0.30, lag: 1, unit: 'vísit/%', ci_lo: 0.15, ci_hi: 0.50, source: 'Stóriðju-orkunotkun → losun' },
  { id: 'carb_emis', from: 'kolefnisgjald', to: 'losun', coef: -0.15, lag: 2, unit: 'vísit/%', ci_lo: -0.30, ci_hi: -0.05, source: 'Kolefnisgjald → minni losun' },
  { id: 'carb_gdp', from: 'kolefnisgjald', to: 'hagvoxtur', coef: -0.02, lag: 1, unit: 'pp/%', ci_lo: -0.05, ci_hi: -0.005, source: 'Kostnaðar-drag grænna skatta' },
  // ── Dýpkun (lota 1): tengsla-göt sem stefna á útkomur ──
  { id: 'kaup_gdp', from: 'kaupmattur', to: 'hagvoxtur', coef: 0.15, lag: 1, unit: 'pp/pp', ci_lo: 0.08, ci_hi: 0.25, source: 'Einkaneysla (~50% VLF) — hærri kaupmáttur → meiri neysla' },
  { id: 'tour_rent', from: 'ferdamenn', to: 'leiga', coef: 0.04, lag: 1, unit: '%/%', ci_lo: 0.01, ci_hi: 0.08, source: 'Skammtímaleiga (Airbnb) → leigueftirspurn' },
  { id: 'rate_bal', from: 'vextir', to: 'afkoma', coef: -0.15, lag: 2, unit: '%VLF/pp', ci_lo: -0.30, ci_hi: -0.05, source: 'Vaxtabyrði ríkisskulda (hærri vextir → dýrari skuldir)' },
  // ── Fjármálastöðugleika-eining (module 6): vanskil heimila & fyrirtækja (vísitala, drifin af greiðslugetu) ──
  { id: 'rate_arrears', from: 'vextir', to: 'vanskil', coef: 2.5, lag: 2, unit: 'vísit/pp', ci_lo: 1.2, ci_hi: 4.0, source: 'Hærri vextir → þyngri greiðslubyrði → vanskil (SÍ Fjármálastöðugleiki)' },
  { id: 'unem_arrears', from: 'atvinnuleysi', to: 'vanskil', coef: 4.0, lag: 2, unit: 'vísit/pp', ci_lo: 2.0, ci_hi: 6.5, source: 'Atvinnumissir → tekjufall → vanskil (helsti drifkraftur, sögulega)' },
  { id: 'burden_arrears', from: 'greidslubyrdi', to: 'vanskil', coef: 0.5, lag: 1, unit: 'vísit/vísit', ci_lo: 0.2, ci_hi: 0.9, source: 'Greiðslubyrði húsnæðislána → vanskilalíkur' },
  { id: 'kaup_arrears', from: 'kaupmattur', to: 'vanskil', coef: -1.5, lag: 2, unit: 'vísit/pp', ci_lo: -3.0, ci_hi: -0.5, source: 'Bætt ráðstöfunartekjur → færri vanskil' },
  { id: 'arrears_gdp', from: 'vanskil', to: 'hagvoxtur', coef: -0.02, lag: 2, unit: 'pp/vísit', ci_lo: -0.04, ci_hi: -0.005, nl: { type: 'accel', at: 0.3, by: 0.4, cap: 2.5 }, source: 'Fjármála-hraðall: vanskil → útlánasamdráttur → minni fjárfesting/neysla', note: 'ÓLÍNULEGT: fjármála-hraðall magnast í kreppu (hröðun)' },
  { id: 'arrears_bal', from: 'vanskil', to: 'afkoma', coef: -0.015, lag: 2, unit: '%VLF/vísit', ci_lo: -0.03, ci_hi: -0.003, source: 'Fjárhagsvandi → stuðningsaðgerðir + minni skatttekjur' },
  // ── Stofn-lýðfræði + öldrun (module 7): fólksfjöldi sem UPPSAFNAÐUR STOFN + framfærsluhlutfall ──
  { id: 'pop_carry', from: 'folksfjoldi', to: 'folksfjoldi', coef: 1.0, lag: 1, unit: '', ci_lo: 1.0, ci_hi: 1.0, source: 'Fólksfjöldi er STOFN — fyrri staða flyst áfram (sjálf-lykkja)' },
  { id: 'growth_pop', from: 'mannfjoldi', to: 'folksfjoldi', coef: 0.25, lag: 1, unit: 'vísit/%', ci_lo: 0.22, ci_hi: 0.28, source: 'Ársfjórðungsleg uppsöfnun fólksfjölgunar í stofninn (≈vöxtur/4)' },
  // framfærsluhlutfall = grunnferill (þekkt öldrun, hækkar) + VARANLEG stig-hliðrun af stefnu (EKKI stofn — annars magnast línulega).
  { id: 'mig_dep', from: 'adflutningur', to: 'framfaersla', coef: -0.05, lag: 2, unit: 'vísit/%', ci_lo: -0.09, ci_hi: -0.02, source: 'Aðflutningur (á vinnualdri) lækkar framfærsluhlutfall varanlega (Hagstofa aldursdreifing)' },
  { id: 'pension_dep', from: 'lifeyrisaldur', to: 'framfaersla', coef: -2.5, lag: 1, unit: 'vísit/ár', ci_lo: -4.0, ci_hi: -1.5, source: 'Hærri lífeyrisaldur → færri lífeyrisþegar á hvern vinnandi (OECD Pensions at a Glance)' },
  { id: 'dep_bal', from: 'framfaersla', to: 'afkoma', coef: -0.05, lag: 2, unit: '%VLF/vísit', ci_lo: -0.09, ci_hi: -0.02, source: 'Hærra framfærsluhlutfall → meiri lífeyris-/heilbrigðisútgjöld' },
  { id: 'dep_gdp', from: 'framfaersla', to: 'hagvoxtur', coef: -0.01, lag: 2, unit: 'pp/vísit', ci_lo: -0.02, ci_hi: -0.003, source: 'Öldrun → lægra atvinnuþátttökuhlutfall → minni framleiðslugeta' },
  // ── Svæðis-vídd (module 8): byggðajöfnuður (höfuðborg vs landsbyggð). Grunnferill lækkar (þéttbýlis-þungi) ──
  { id: 'byggd_bal', from: 'byggdastefna', to: 'byggdajofnudur', coef: 0.30, lag: 2, unit: 'vísit/%', ci_lo: 0.12, ci_hi: 0.50, source: 'Byggðaáhersla (innviðir/ívilnanir) styrkir landsbyggð (Byggðastofnun)' },
  { id: 'mig_byggd', from: 'adflutningur', to: 'byggdajofnudur', coef: -0.03, lag: 2, unit: 'vísit/%', ci_lo: -0.06, ci_hi: -0.01, source: 'Aðflutningur sest einkum á höfuðborgarsvæðið → aukinn ójöfnuður' },
  { id: 'orka_byggd', from: 'orka', to: 'byggdajofnudur', coef: 0.08, lag: 3, unit: 'vísit/%', ci_lo: 0.03, ci_hi: 0.15, source: 'Stóriðja/virkjanir eru á landsbyggð → störf úti á landi' },
  { id: 'kvoti_byggd', from: 'kvoti', to: 'byggdajofnudur', coef: 0.06, lag: 2, unit: 'vísit/%', ci_lo: 0.02, ci_hi: 0.12, source: 'Sjávarútvegur er burðarás landsbyggðar' },
  { id: 'byggd_gdp', from: 'byggdajofnudur', to: 'hagvoxtur', coef: 0.008, lag: 2, unit: 'pp/vísit', ci_lo: 0.002, ci_hi: 0.016, source: 'Betri nýting mannafla/auðlinda um allt land' },
  // ── Nýsköpun/hugvit + sjálfbærni + tekjuáhrif (module 9) ──
  // Tekjuáhrif skatta (VAR GAT: skattar snertu EKKI kaupmátt):
  { id: 'tax_kaup', from: 'skattar', to: 'kaupmattur', coef: -0.04, lag: 1, unit: 'pp/%', ci_lo: -0.07, ci_hi: -0.02, source: 'Hærri skattar → lægri ráðstöfunartekjur → minni kaupmáttur' },
  // Nýsköpun & hugvit (langtíma framleiðni-drifkraftur):
  { id: 'tax_innov', from: 'skattar', to: 'nyskopun', coef: -0.15, lag: 2, unit: 'vísit/%', ci_lo: -0.30, ci_hi: -0.05, source: 'Hærri skattar draga úr fjárfestingu í nýsköpun/hugviti (öfugt: lægri skattar örva)' },
  { id: 'ivil_innov', from: 'ivilnanir', to: 'nyskopun', coef: 0.25, lag: 2, unit: 'vísit/%', ci_lo: 0.12, ci_hi: 0.42, source: 'Styrkir & ívilnanir → aukin nýsköpun (Rannís/Kría, endurgreiðslur R&Þ)' },
  { id: 'mennt_innov', from: 'menntun', to: 'nyskopun', coef: 0.20, lag: 4, unit: 'vísit/%', ci_lo: 0.08, ci_hi: 0.35, source: 'Menntun & rannsóknir → mannauður → nýsköpun (löng töf)' },
  { id: 'innov_gdp', from: 'nyskopun', to: 'hagvoxtur', coef: 0.03, lag: 3, unit: 'pp/vísit', ci_lo: 0.01, ci_hi: 0.05, source: 'Nýsköpun → framleiðniaukning (TFP), löng töf' },
  { id: 'innov_exp', from: 'nyskopun', to: 'utflutningur', coef: 0.05, lag: 3, unit: '%/vísit', ci_lo: 0.02, ci_hi: 0.09, source: 'Hugvit → verðmætur útflutningur (hátækni/hugbúnaður/lyf)' },
  { id: 'ivil_bal', from: 'ivilnanir', to: 'afkoma', coef: -0.03, lag: 1, unit: '%VLF/%', ci_lo: -0.05, ci_hi: -0.01, source: 'Ívilnanir/styrkir kosta ríkissjóð' },
  { id: 'ivil_gdp', from: 'ivilnanir', to: 'hagvoxtur', coef: 0.02, lag: 2, unit: 'pp/%', ci_lo: 0.005, ci_hi: 0.04, source: 'Bein fjárfestingar-örvun (skammtíma)' },
  { id: 'mennt_bal', from: 'menntun', to: 'afkoma', coef: -0.03, lag: 1, unit: '%VLF/%', ci_lo: -0.05, ci_hi: -0.01, source: 'Menntunar-/rannsóknafjárfesting kostar ríkissjóð' },
  // Sjálfbærni sjávar (VANTAÐI: aflamark hafði engin áhrif á stofninn):
  { id: 'kvoti_fisk', from: 'kvoti', to: 'fiskistofn', coef: -0.09, lag: 1, unit: 'vísit/%', ci_lo: -0.15, ci_hi: -0.04, source: 'Hærra aflamark gengur á fiskistofninn; lægra byggir hann upp (Hafró ráðgjöf)' },
  { id: 'fisk_regen', from: 'fiskistofn', to: 'fiskistofn', coef: 0.9, lag: 1, unit: '', ci_lo: 0.88, ci_hi: 0.92, source: 'Stofninn endurnýjar sig hægt — STOFN með endurheimt að jafnvægi (sjálf-lykkja <1)' },
  { id: 'fisk_exp', from: 'fiskistofn', to: 'utflutningur', coef: 0.15, lag: 2, unit: '%/vísit', ci_lo: 0.07, ci_hi: 0.25, source: 'Heilbrigður stofn styður sjálfbæran útflutning; ofveiði dregur úr honum tafið (sjálfbærni-togstreita)' },
  // Þóruferð yfir fleiri vantandi tengsl:
  { id: 'carb_infl', from: 'kolefnisgjald', to: 'verdbolga', coef: 0.01, lag: 1, unit: 'pp/%', ci_lo: 0.003, ci_hi: 0.02, source: 'Kolefnisgjald hækkar eldsneytis-/orkuverð → verðbólga (skammtíma)' },
  { id: 'oil_gdp', from: 'olia', to: 'hagvoxtur', coef: -0.008, lag: 2, unit: 'pp/%', ci_lo: -0.015, ci_hi: -0.002, source: 'Olíuverðshækkun = kostnaðarskellur → minni eftirspurn/hagvöxtur' },
  { id: 'fr_gdp', from: 'frambod', to: 'hagvoxtur', coef: 0.015, lag: 1, unit: 'pp/%', ci_lo: 0.005, ci_hi: 0.03, source: 'Byggingarumsvif nýbygginga → hagvöxtur' },
  { id: 'debt_bal', from: 'skuldir', to: 'afkoma', coef: -0.006, lag: 2, unit: '%VLF/%VLF', ci_lo: -0.012, ci_hi: -0.002, source: 'Vaxtakostnaður skulda þyngir afkomu (aðhalds-þörf við háar skuldir)' },
  { id: 'labor_infl', from: 'vinnuafl', to: 'verdbolga', coef: -0.05, lag: 2, unit: 'pp/pp', ci_lo: -0.10, ci_hi: -0.02, source: 'Aukið vinnuaflsframboð slakar á launa-verð þrýstingi' },
  // ── Stór útvíkkun (module 10): ný orsakasambönd milli fyrirliggjandi breyta ──
  { id: 'infl_persist', from: 'verdbolga', to: 'verdbolga', coef: 0.25, lag: 1, unit: '', ci_lo: 0.15, ci_hi: 0.35, source: 'Verðbólguvæntingar/tregða — verðbólga viðheldur sér (sjálf-lykkja <1)' },
  { id: 'gap_infl', from: 'hagvoxtur', to: 'verdbolga', coef: 0.08, lag: 1, unit: 'pp/pp', ci_lo: 0.03, ci_hi: 0.15, source: 'Framleiðsluspenna — eftirspurnar-þensla ýtir undir verðbólgu' },
  { id: 'wealth_gdp', from: 'husnaedi', to: 'hagvoxtur', coef: 0.02, lag: 2, unit: 'pp/%', ci_lo: 0.005, ci_hi: 0.04, source: 'Auðsáhrif eignaverðs á einkaneyslu' },
  { id: 'burden_kaup', from: 'greidslubyrdi', to: 'kaupmattur', coef: -0.01, lag: 1, unit: 'pp/vísit', ci_lo: -0.02, ci_hi: -0.003, source: 'Húsnæðiskostnaður étur ráðstöfunartekjur' },
  { id: 'world_exp', from: 'heimshagvoxtur', to: 'utflutningur', coef: 0.8, lag: 1, unit: '%/%', ci_lo: 0.4, ci_hi: 1.3, source: 'Ytri eftirspurn drífur útflutning (opið hagkerfi)' },
  { id: 'world_gdp', from: 'heimshagvoxtur', to: 'hagvoxtur', coef: 0.08, lag: 1, unit: 'pp/%', ci_lo: 0.03, ci_hi: 0.15, source: 'Bein ytri eftirspurn/traust (afgangur um útflutning)' },
  { id: 'fx_exp', from: 'gengi', to: 'utflutningur', coef: -0.10, lag: 2, unit: '%/%', ci_lo: -0.18, ci_hi: -0.04, source: 'Sterk króna → dýrari/ósamkeppnishæfari útflutningur' },
  { id: 'tour_exp', from: 'ferdamenn', to: 'utflutningur', coef: 0.04, lag: 1, unit: '%/%', ci_lo: 0.02, ci_hi: 0.07, source: 'Ferðaþjónusta = þjónustuútflutningur' },
  { id: 'gdp_emis', from: 'hagvoxtur', to: 'losun', coef: 0.3, lag: 1, unit: 'vísit/pp', ci_lo: 0.1, ci_hi: 0.5, source: 'Umsvif drífa losun (virknis-áhrif)' },
  { id: 'tour_emis', from: 'ferdamenn', to: 'losun', coef: 0.05, lag: 1, unit: 'vísit/%', ci_lo: 0.02, ci_hi: 0.10, source: 'Flug/ferðaþjónusta → losun' },
  { id: 'clim_fisk', from: 'losun', to: 'fiskistofn', coef: -0.02, lag: 4, unit: 'vísit/vísit', ci_lo: -0.04, ci_hi: -0.005, source: 'Hafhlýnun/súrnun (uppsöfnuð losun) → verri skilyrði stofns (langtíma)' },
  { id: 'tour_bal', from: 'ferdamenn', to: 'afkoma', coef: 0.015, lag: 1, unit: '%VLF/%', ci_lo: 0.005, ci_hi: 0.03, source: 'Skatttekjur af ferðaþjónustu' },
  { id: 'rate_innov', from: 'vextir', to: 'nyskopun', coef: -0.10, lag: 2, unit: 'vísit/pp', ci_lo: -0.20, ci_hi: -0.03, source: 'Hár fjármagnskostnaður → minni fjárfesting í nýsköpun/áhættufé' },
  { id: 'byggd_pop', from: 'byggdajofnudur', to: 'mannfjoldi', coef: 0.003, lag: 2, unit: '%/vísit', ci_lo: 0.001, ci_hi: 0.006, source: 'Byggðajöfnuður heldur í fólk á landsbyggð' },
  // ── Nýjar ákvarðanir (module 10): tengsl 14 nýrra sleða ──
  { id: 'dsti_house', from: 'dsti', to: 'husnaedi', coef: 0.15, lag: 2, unit: '%/pp', ci_lo: 0.05, ci_hi: 0.28, source: 'Rýmra greiðslubyrðisþak → meiri lántaka → hærra húsnæðisverð' },
  { id: 'dsti_burden', from: 'dsti', to: 'greidslubyrdi', coef: 0.4, lag: 1, unit: 'vísit/pp', ci_lo: 0.15, ci_hi: 0.7, source: 'Rýmra þak leyfir hærri greiðslubyrði' },
  { id: 'bind_house', from: 'bindiskylda', to: 'husnaedi', coef: -0.4, lag: 2, unit: '%/%', ci_lo: -0.7, ci_hi: -0.15, source: 'Hærri bindiskylda → minni útlánageta → lægra húsnæðisverð' },
  { id: 'bind_infl', from: 'bindiskylda', to: 'verdbolga', coef: -0.03, lag: 3, unit: 'pp/%', ci_lo: -0.06, ci_hi: -0.01, source: 'Aðhald í lausafé → minni verðbólga (tafið)' },
  { id: 'vsk_infl', from: 'vsk', to: 'verdbolga', coef: 0.15, lag: 1, unit: 'pp/%', ci_lo: 0.08, ci_hi: 0.25, source: 'Virðisaukaskattur hækkar neysluverð beint' },
  { id: 'vsk_bal', from: 'vsk', to: 'afkoma', coef: 0.10, lag: 1, unit: '%VLF/%', ci_lo: 0.05, ci_hi: 0.16, source: 'VSK = stór tekjustofn ríkissjóðs' },
  { id: 'vsk_kaup', from: 'vsk', to: 'kaupmattur', coef: -0.05, lag: 1, unit: 'pp/%', ci_lo: -0.09, ci_hi: -0.02, source: 'Hærra neysluverð → minni kaupmáttur' },
  { id: 'transf_kaup', from: 'tilfaerslur', to: 'kaupmattur', coef: 0.05, lag: 1, unit: 'pp/%', ci_lo: 0.02, ci_hi: 0.09, source: 'Tilfærslur auka ráðstöfunartekjur (einkum lágtekju)' },
  { id: 'transf_bal', from: 'tilfaerslur', to: 'afkoma', coef: -0.04, lag: 1, unit: '%VLF/%', ci_lo: -0.07, ci_hi: -0.02, source: 'Tilfærslur kosta ríkissjóð' },
  { id: 'transf_gdp', from: 'tilfaerslur', to: 'hagvoxtur', coef: 0.02, lag: 1, unit: 'pp/%', ci_lo: 0.005, ci_hi: 0.04, source: 'Há neysluhneigð lágtekjuhópa → eftirspurn' },
  { id: 'innv_gdp', from: 'innvidir', to: 'hagvoxtur', coef: 0.04, lag: 2, unit: 'pp/%', ci_lo: 0.02, ci_hi: 0.07, source: 'Innviðafjárfesting → framleiðni og eftirspurn' },
  { id: 'innv_byggd', from: 'innvidir', to: 'byggdajofnudur', coef: 0.10, lag: 3, unit: 'vísit/%', ci_lo: 0.04, ci_hi: 0.18, source: 'Innviðir (vegir/ljósleiðari) styrkja landsbyggð' },
  { id: 'innv_bal', from: 'innvidir', to: 'afkoma', coef: -0.04, lag: 1, unit: '%VLF/%', ci_lo: -0.07, ci_hi: -0.02, source: 'Innviðafjárfesting kostar (skammtíma)' },
  { id: 'innv_innov', from: 'innvidir', to: 'nyskopun', coef: 0.08, lag: 3, unit: 'vísit/%', ci_lo: 0.03, ci_hi: 0.15, source: 'Rannsókna-/stafrænir innviðir styðja nýsköpun' },
  { id: 'veidi_bal', from: 'veidigjald', to: 'afkoma', coef: 0.03, lag: 1, unit: '%VLF/%', ci_lo: 0.01, ci_hi: 0.05, source: 'Veiðigjald = auðlindarenta til ríkissjóðs' },
  { id: 'veidi_fisk', from: 'veidigjald', to: 'fiskistofn', coef: 0.02, lag: 2, unit: 'vísit/%', ci_lo: 0.005, ci_hi: 0.04, source: 'Hærra gjald → minni sóknarhvati → heilbrigðari stofn' },
  { id: 'veidi_byggd', from: 'veidigjald', to: 'byggdajofnudur', coef: -0.03, lag: 2, unit: 'vísit/%', ci_lo: -0.06, ci_hi: -0.01, source: 'Íþyngir sjávarbyggðum' },
  { id: 'leigu_rent', from: 'leiguhusnaedi', to: 'leiga', coef: -0.20, lag: 3, unit: '%/%', ci_lo: -0.35, ci_hi: -0.08, source: 'Aukið félagslegt/leiguframboð → lægri leiga' },
  { id: 'leigu_bal', from: 'leiguhusnaedi', to: 'afkoma', coef: -0.02, lag: 1, unit: '%VLF/%', ci_lo: -0.04, ci_hi: -0.005, source: 'Uppbygging leiguíbúða kostar' },
  { id: 'loda_house', from: 'lodaframbod', to: 'husnaedi', coef: -0.15, lag: 6, unit: '%/%', ci_lo: -0.30, ci_hi: -0.05, source: 'Lóðaframboð/skipulag → meira byggingarland → lægra verð (löng töf)' },
  { id: 'part_labor', from: 'atvinnuthatttaka', to: 'vinnuafl', coef: 0.08, lag: 2, unit: 'pp/%', ci_lo: 0.03, ci_hi: 0.15, source: 'Þátttökuhvatar → aukið vinnuaflsframboð' },
  { id: 'part_dep', from: 'atvinnuthatttaka', to: 'framfaersla', coef: -0.05, lag: 2, unit: 'vísit/%', ci_lo: -0.10, ci_hi: -0.02, source: 'Fleiri á vinnumarkaði → lægra framfærsluhlutfall' },
  { id: 'immig_labor', from: 'innflytjendastefna', to: 'vinnuafl', coef: 0.02, lag: 2, unit: 'pp/%', ci_lo: 0.01, ci_hi: 0.035, source: 'Atvinnuleyfi/atgervis-innflutningur → vinnuafl' },
  { id: 'immig_dep', from: 'innflytjendastefna', to: 'framfaersla', coef: -0.02, lag: 2, unit: 'vísit/%', ci_lo: -0.04, ci_hi: -0.008, source: 'Vinnualdurs-innflytjendur → lægra framfærsluhlutfall' },
  { id: 'immig_house', from: 'innflytjendastefna', to: 'husnaedi', coef: 0.03, lag: 2, unit: '%/%', ci_lo: 0.01, ci_hi: 0.06, source: 'Fleiri íbúar → húsnæðiseftirspurn' },
  { id: 'fridun_fisk', from: 'fridun', to: 'fiskistofn', coef: 0.10, lag: 3, unit: 'vísit/%', ci_lo: 0.04, ci_hi: 0.18, source: 'Friðun/verndarsvæði → uppbygging stofns' },
  { id: 'fridun_exp', from: 'fridun', to: 'utflutningur', coef: -0.03, lag: 1, unit: '%/%', ci_lo: -0.06, ci_hi: -0.01, source: 'Minni veiðisvæði → minni afli til skamms tíma' },
  { id: 'skipti_emis', from: 'orkuskipti', to: 'losun', coef: -0.15, lag: 2, unit: 'vísit/%', ci_lo: -0.28, ci_hi: -0.06, source: 'Rafvæðing samgangna → minni losun' },
  { id: 'skipti_bal', from: 'orkuskipti', to: 'afkoma', coef: -0.02, lag: 1, unit: '%VLF/%', ci_lo: -0.04, ci_hi: -0.005, source: 'Ívilnanir/innviðir orkuskipta kosta' },
  { id: 'skog_emis', from: 'skograekt', to: 'losun', coef: -0.10, lag: 4, unit: 'vísit/%', ci_lo: -0.20, ci_hi: -0.03, source: 'Kolefnisbinding skóga (löng töf)' },
  { id: 'skog_bal', from: 'skograekt', to: 'afkoma', coef: -0.015, lag: 1, unit: '%VLF/%', ci_lo: -0.03, ci_hi: -0.004, source: 'Kostnaður við skógrækt' },
  { id: 'tourfee_bal', from: 'ferdamannagjald', to: 'afkoma', coef: 0.02, lag: 1, unit: '%VLF/%', ci_lo: 0.008, ci_hi: 0.04, source: 'Komugjald/gistináttagjald → tekjur ríkissjóðs' },
  { id: 'tourfee_gdp', from: 'ferdamannagjald', to: 'hagvoxtur', coef: -0.008, lag: 1, unit: 'pp/%', ci_lo: -0.02, ci_hi: -0.002, source: 'Hærra gjald dregur lítillega úr ferðaþjónustu' },
  // ── Framhald (module 11): mannauðs-framleiðni, loftslags-tjón, svæðaskipt húsnæði ──
  { id: 'mennt_gdp', from: 'menntun', to: 'hagvoxtur', coef: 0.02, lag: 5, unit: 'pp/%', ci_lo: 0.005, ci_hi: 0.04, source: 'Menntun → vinnuaflsgæði → framleiðni (mjög löng töf, óháð nýsköpun)' },
  { id: 'clim_gdp', from: 'losun', to: 'hagvoxtur', coef: -0.004, lag: 4, unit: 'pp/vísit', ci_lo: -0.009, ci_hi: -0.001, source: 'Loftslagshlýnun → tjón á ferðaþjónustu/landbúnaði/innviðum (langtíma; grænir sleðar fá vaxtar-ávinning)' },
  // Höfuðborg — eftirspurnar-drifið (vextir/laun/aðflutningur ráða)
  { id: 'r_hbs', from: 'vextir', to: 'husnaedi_hbs', coef: -0.9, lag: 2, unit: '%/pp', ci_lo: -1.5, ci_hi: -0.4, source: 'Höfuðborgar-húsnæði vaxta-næmt (bakprófað: fylgni −0,36 við vexti töf 2ár, 2010–2026)' },
  { id: 'w_hbs', from: 'laun', to: 'husnaedi_hbs', coef: 0.5, lag: 3, unit: '%/pp', ci_lo: 0.2, ci_hi: 0.85, source: 'Kaupgeta → eftirspurn á höfuðborgarsvæði' },
  { id: 'ltv_hbs', from: 'vedhlutfall', to: 'husnaedi_hbs', coef: 0.20, lag: 2, unit: '%/pp', ci_lo: 0.08, ci_hi: 0.35, source: 'Veðhlutfall → lánsgeta → eftirspurn' },
  { id: 'dsti_hbs', from: 'dsti', to: 'husnaedi_hbs', coef: 0.20, lag: 2, unit: '%/pp', ci_lo: 0.08, ci_hi: 0.35, source: 'Rýmra greiðslubyrðisþak → hærra höfuðborgarverð' },
  { id: 'mig_hbs', from: 'adflutningur', to: 'husnaedi_hbs', coef: 0.10, lag: 2, unit: '%/%', ci_lo: 0.04, ci_hi: 0.16, source: 'Aðflutningur sest einkum á höfuðborgarsvæðið' },
  { id: 'immig_hbs', from: 'innflytjendastefna', to: 'husnaedi_hbs', coef: 0.05, lag: 2, unit: '%/%', ci_lo: 0.02, ci_hi: 0.09, source: 'Stýrður innflutningur → höfuðborgar-eftirspurn' },
  // Landsbyggð — framboðs-/byggða-drifið (framboð/byggðastefna/innviðir ráða)
  { id: 'r_land', from: 'vextir', to: 'husnaedi_land', coef: -0.7, lag: 2, unit: '%/pp', ci_lo: -1.2, ci_hi: -0.3, source: 'Landsbyggð einnig vaxta-næm (bakprófað: fylgni −0,43 við vexti töf 2ár — nálægt höfuðborg, 2010–2026)' },
  { id: 'fr_land', from: 'frambod', to: 'husnaedi_land', coef: -0.35, lag: 4, unit: '%/%', ci_lo: -0.55, ci_hi: -0.15, source: 'Framboð ræður meiru um verð úti á landi' },
  { id: 'loda_land', from: 'lodaframbod', to: 'husnaedi_land', coef: -0.20, lag: 6, unit: '%/%', ci_lo: -0.35, ci_hi: -0.08, source: 'Lóðaframboð → lægra verð (löng töf)' },
  { id: 'byggd_land', from: 'byggdastefna', to: 'husnaedi_land', coef: 0.10, lag: 3, unit: '%/%', ci_lo: 0.03, ci_hi: 0.18, source: 'Byggðaefling → hærra fasteignaverð á landsbyggð (vitnisburður um vöxt)' },
  { id: 'innv_land', from: 'innvidir', to: 'husnaedi_land', coef: 0.08, lag: 3, unit: '%/%', ci_lo: 0.03, ci_hi: 0.15, source: 'Innviðir → aðgengi → hærra verð úti á landi' },
  { id: 'orka_land', from: 'orka', to: 'husnaedi_land', coef: 0.06, lag: 3, unit: '%/%', ci_lo: 0.02, ci_hi: 0.12, source: 'Stóriðju-verkefni → húsnæðiseftirspurn í nágrenni' },
  { id: 'mig_land', from: 'adflutningur', to: 'husnaedi_land', coef: 0.03, lag: 3, unit: '%/%', ci_lo: 0.01, ci_hi: 0.06, source: 'Hluti aðflutnings → landsbyggð' },
  // ── Yfirferð (module 12): ENDÓGENT GENGI + vantandi lykkjur ──
  // Gengið bregst við undirstöðum (til viðbótar við ytra gengis-sjokkið sem notandi stillir):
  { id: 'rate_fx', from: 'vextir', to: 'gengi_endo', coef: 1.5, lag: 1, unit: '%/pp', ci_lo: 0.6, ci_hi: 2.5, source: 'Vaxtamunur → fjármagns-innflæði → sterkari króna (óvarið vaxtajafnvægi)' },
  { id: 'infl_fx', from: 'verdbolga', to: 'gengi_endo', coef: -1.0, lag: 2, unit: '%/pp', ci_lo: -1.8, ci_hi: -0.4, source: 'Hærri verðbólga → veikari króna (kaupmáttarjafnvægi/PPP)' },
  { id: 'exp_fx', from: 'utflutningur', to: 'gengi_endo', coef: 0.25, lag: 2, unit: '%/%', ci_lo: 0.10, ci_hi: 0.45, source: 'Meiri útflutningur → betri viðskiptajöfnuður → sterkari króna' },
  // …og flytur til baka (speglar gengis-sjokkið, leggst við það):
  { id: 'fxendo_infl', from: 'gengi_endo', to: 'verdbolga', coef: -0.06, lag: 1, unit: 'pp/%', ci_lo: -0.12, ci_hi: -0.02, source: 'Sterk króna → lægra innflutt verð (endógen gengisyfirfærsla) — auka-rás peningastefnu' },
  { id: 'fxendo_exp', from: 'gengi_endo', to: 'utflutningur', coef: -0.10, lag: 2, unit: '%/%', ci_lo: -0.18, ci_hi: -0.04, source: 'Sterk króna → ósamkeppnishæfari útflutningur' },
  { id: 'fxendo_gdp', from: 'gengi_endo', to: 'hagvoxtur', coef: -0.012, lag: 2, unit: 'pp/%', ci_lo: -0.03, ci_hi: 0.0, source: 'Sterk króna → lakari samkeppnisstaða útflutningsgreina' },
  // Vantandi lykkjur:
  { id: 'infl_debt', from: 'verdbolga', to: 'skuldir', coef: -0.06, lag: 2, unit: '%VLF/pp', ci_lo: -0.12, ci_hi: -0.02, source: 'Verðbólga étur raunvirði skulda (hærra nafn-VLF í nefnara skuldahlutfalls)' },
  { id: 'wage_unem', from: 'laun', to: 'atvinnuleysi', coef: 0.03, lag: 3, unit: 'pp/pp', ci_lo: 0.01, ci_hi: 0.06, source: 'Hærri launakostnaður → færri ráðningar (tafið; vegur á móti neyslu-örvun launa)' },
  { id: 'arrears_debt', from: 'vanskil', to: 'skuldir', coef: 0.02, lag: 3, unit: '%VLF/vísit', ci_lo: 0.005, ci_hi: 0.045, source: 'Fjármálaáföll → björgunar-/stuðnings-skuldbindingar ríkissjóðs' },
  { id: 'tour_hbs', from: 'ferdamenn', to: 'husnaedi_hbs', coef: 0.03, lag: 2, unit: '%/%', ci_lo: 0.01, ci_hi: 0.06, source: 'Skammtímaleiga (Airbnb) → höfuðborgar-húsnæðisverð' },
  // ── Fjármálahlið (module 13): peningamagn, útlán, lífeyriseignir, hlutabréf, vaxtaálag ──
  { id: 'r_m3', from: 'vextir', to: 'peningamagn', coef: -0.9, lag: 1, unit: '%/pp', ci_lo: -1.6, ci_hi: -0.3, source: 'Aðhald → hægari peningamyndun (M3)' },
  { id: 'r_credit', from: 'vextir', to: 'utlanavoxtur', coef: -1.1, lag: 1, unit: '%/pp', ci_lo: -1.8, ci_hi: -0.4, source: 'Hærri vextir → minni útlánaeftirspurn' },
  { id: 'bind_credit', from: 'bindiskylda', to: 'utlanavoxtur', coef: -0.4, lag: 2, unit: '%/%', ci_lo: -0.7, ci_hi: -0.15, source: 'Bindiskylda → minni útlánageta banka' },
  { id: 'm3_infl', from: 'peningamagn', to: 'verdbolga', coef: 0.04, lag: 3, unit: 'pp/%', ci_lo: 0.01, ci_hi: 0.08, source: 'Peningamagn → verðbólga tafið (peningamagns-kenning, veik)' },
  { id: 'credit_house', from: 'utlanavoxtur', to: 'husnaedi', coef: 0.15, lag: 2, unit: '%/%', ci_lo: 0.06, ci_hi: 0.28, source: 'Útlánaþensla drífur húsnæðisverð' },
  { id: 'credit_hdebt', from: 'utlanavoxtur', to: 'heimilaskuldir', coef: 0.3, lag: 1, unit: 'vísit/%', ci_lo: 0.12, ci_hi: 0.5, source: 'Útlánavöxtur → uppsöfnun heimilaskulda' },
  { id: 'r_equity', from: 'vextir', to: 'hlutabref', coef: -1.5, lag: 1, unit: 'vísit/pp', ci_lo: -3.0, ci_hi: -0.5, source: 'Hærri ávöxtunarkrafa → lægra verðmat hlutabréfa' },
  { id: 'gdp_equity', from: 'hagvoxtur', to: 'hlutabref', coef: 1.2, lag: 1, unit: 'vísit/pp', ci_lo: 0.5, ci_hi: 2.2, source: 'Hagvöxtur → hagnaðarvæntingar → hlutabréf' },
  { id: 'equity_gdp', from: 'hlutabref', to: 'hagvoxtur', coef: 0.01, lag: 2, unit: 'pp/vísit', ci_lo: 0.003, ci_hi: 0.02, source: 'Auðsáhrif hlutabréfa á neyslu/fjárfestingu' },
  { id: 'equity_pension', from: 'hlutabref', to: 'lifeyriseignir', coef: 0.25, lag: 1, unit: '%VLF/vísit', ci_lo: 0.1, ci_hi: 0.45, source: 'Lífeyrissjóðir eiga hlutabréf → eignir sveiflast með markaði' },
  { id: 'debt_spread', from: 'skuldir', to: 'vaxtaalag', coef: 0.02, lag: 2, unit: 'pp/%VLF', ci_lo: 0.005, ci_hi: 0.045, nl: { type: 'accel', at: 0.2, by: 0.5, cap: 3 }, source: 'Hærri ríkisskuldir → hærra áhættuálag', note: 'ÓLÍNULEGT: áhættuálag hraðar við háa skuldsetningu (skuldakreppu-kúfur)' },
  { id: 'arrears_spread', from: 'vanskil', to: 'vaxtaalag', coef: 0.01, lag: 2, unit: 'pp/vísit', ci_lo: 0.003, ci_hi: 0.025, source: 'Fjármálaóstöðugleiki → hærra áhættuálag' },
  { id: 'spread_gdp', from: 'vaxtaalag', to: 'hagvoxtur', coef: -0.15, lag: 2, unit: 'pp/pp', ci_lo: -0.30, ci_hi: -0.05, source: 'Hærra álag → dýrari fjármögnun → minni fjárfesting' },
  { id: 'spread_bal', from: 'vaxtaalag', to: 'afkoma', coef: -0.10, lag: 1, unit: '%VLF/pp', ci_lo: -0.2, ci_hi: -0.03, source: 'Hærra álag → dýrari ríkisfjármögnun' },
  { id: 'pension_gdp', from: 'lifeyriseignir', to: 'hagvoxtur', coef: 0.006, lag: 2, unit: 'pp/%VLF', ci_lo: 0.001, ci_hi: 0.013, source: 'Lífeyris-eignir → innlend fjárfesting/auðsáhrif' },
  { id: 'house_hdebt', from: 'husnaedi', to: 'heimilaskuldir', coef: 0.25, lag: 2, unit: 'vísit/%', ci_lo: 0.1, ci_hi: 0.45, source: 'Hærra húsnæðisverð → stærri húsnæðislán' },
  { id: 'hdebt_arrears', from: 'heimilaskuldir', to: 'vanskil', coef: 0.15, lag: 2, unit: 'vísit/vísit', ci_lo: 0.06, ci_hi: 0.28, source: 'Skuldsettari heimili → meiri vanskilahætta' },
  { id: 'hdebt_gdp', from: 'heimilaskuldir', to: 'hagvoxtur', coef: -0.01, lag: 3, unit: 'pp/vísit', ci_lo: -0.022, ci_hi: -0.003, source: 'Skuldsett heimili → skuldaafborgun fram yfir neyslu (deleveraging)' },
  // ── Ytri staða (module 13): viðskiptajöfnuður, erlend staða ──
  { id: 'exp_ca', from: 'utflutningur', to: 'vidskiptajofnudur', coef: 0.15, lag: 1, unit: '%VLF/%', ci_lo: 0.07, ci_hi: 0.26, source: 'Útflutningsvöxtur → betri viðskiptajöfnuður' },
  { id: 'tour_ca', from: 'ferdamenn', to: 'vidskiptajofnudur', coef: 0.03, lag: 1, unit: '%VLF/%', ci_lo: 0.01, ci_hi: 0.06, source: 'Ferðaþjónusta = gjaldeyristekjur' },
  { id: 'fx_ca', from: 'gengi_endo', to: 'vidskiptajofnudur', coef: -0.06, lag: 2, unit: '%VLF/%', ci_lo: -0.12, ci_hi: -0.02, source: 'Sterk króna → meiri innflutningur → lakari jöfnuður' },
  { id: 'comm_exp', from: 'hravaruverd', to: 'utflutningur', coef: 0.10, lag: 1, unit: '%/%', ci_lo: 0.04, ci_hi: 0.18, source: 'Ál-/fiskverð → verðmæti útflutnings (viðskiptakjör)' },
  { id: 'comm_ca', from: 'hravaruverd', to: 'vidskiptajofnudur', coef: 0.05, lag: 1, unit: '%VLF/%', ci_lo: 0.02, ci_hi: 0.09, source: 'Betri viðskiptakjör → betri jöfnuður' },
  { id: 'niip_carry', from: 'niip', to: 'niip', coef: 1.0, lag: 1, unit: '', ci_lo: 1.0, ci_hi: 1.0, source: 'Erlend staða er STOFN — fyrri staða flyst áfram (sjálf-lykkja)' },
  { id: 'ca_niip', from: 'vidskiptajofnudur', to: 'niip', coef: 0.9, lag: 1, unit: '%VLF/%VLF', ci_lo: 0.7, ci_hi: 1.0, source: 'Viðskiptaafgangur safnast í erlenda stöðu' },
  // SFC geira-jöfnuðir (Godley): einkageiri = viðskiptajöfnuður − ríkisjöfnuður. Kennisetning (lag 0, ci=coef → ekkert óvissu-band).
  { id: 'ca_priv', from: 'vidskiptajofnudur', to: 'einkajofnudur', coef: 1.0, lag: 0, unit: '%VLF/%VLF', ci_lo: 1.0, ci_hi: 1.0, source: 'SFC-kennisetning: geira-jöfnuðir summast í núll (net lending: einkageiri + ríki + útlönd = 0)' },
  { id: 'gov_priv', from: 'afkoma', to: 'einkajofnudur', coef: -1.0, lag: 0, unit: '%VLF/%VLF', ci_lo: -1.0, ci_hi: -1.0, source: 'SFC-kennisetning: ríkishalli fjármagnast af einkageira eða útlöndum (afgangur ríkis dregur úr einkageira-afgangi)' },
  // ── Geira-virðisauki (diagnostík): sértækir drifkraftar → geira-VLF. TERMINAL (engin útgangs-tengsl → engin tvítöldun í hagvöxt). ──
  { id: 'fisk_vlfsj', from: 'fiskistofn', to: 'vlf_sjavar', coef: 0.15, lag: 1, unit: 'vísit/vísit', ci_lo: 0.06, ci_hi: 0.28, source: 'Heilbrigður fiskistofn → sjálfbær sjávarafurða-framleiðsla' },
  { id: 'kvoti_vlfsj', from: 'kvoti', to: 'vlf_sjavar', coef: 0.10, lag: 1, unit: 'vísit/%', ci_lo: 0.04, ci_hi: 0.18, source: 'Hærra aflamark → meiri afli skammtíma' },
  { id: 'veidi_vlfsj', from: 'veidigjald', to: 'vlf_sjavar', coef: -0.02, lag: 1, unit: 'vísit/pp', ci_lo: -0.05, ci_hi: 0.0, source: 'Hærra veiðigjald → minni framlegð greinarinnar' },
  { id: 'tour_vlff', from: 'ferdamenn', to: 'vlf_ferda', coef: 0.30, lag: 1, unit: 'vísit/%', ci_lo: 0.18, ci_hi: 0.45, source: 'Ferðamannafjöldi drífur ferðaþjónustu-virðisauka' },
  { id: 'fx_vlff', from: 'gengi_endo', to: 'vlf_ferda', coef: -0.12, lag: 1, unit: 'vísit/%', ci_lo: -0.22, ci_hi: -0.04, source: 'Sterk króna → dýrari áfangastaður → minni ferðaþjónusta' },
  { id: 'ferdagj_vlff', from: 'ferdamannagjald', to: 'vlf_ferda', coef: -0.03, lag: 1, unit: 'vísit/pp', ci_lo: -0.07, ci_hi: 0.0, source: 'Hærra ferðamannagjald → eftirspurnar-dempun' },
  { id: 'orka_vlfi', from: 'orka', to: 'vlf_idnadur', coef: 0.20, lag: 1, unit: 'vísit/%', ci_lo: 0.1, ci_hi: 0.35, source: 'Orka til stóriðju → iðnaðar-virðisauki' },
  { id: 'comm_vlfi', from: 'hravaruverd', to: 'vlf_idnadur', coef: 0.05, lag: 1, unit: 'vísit/%', ci_lo: 0.02, ci_hi: 0.09, source: 'Hærra hrávöruverð (t.d. ál) → betri afkoma útflutnings-iðnaðar' },
  { id: 'skipti_vlfi', from: 'orkuskipti', to: 'vlf_idnadur', coef: 0.04, lag: 2, unit: 'vísit/pp', ci_lo: 0.01, ci_hi: 0.08, source: 'Orkuskipti → ný græn iðnaðar-tækifæri' },
  // ── Yfirferð orsakasambanda (viðbót — göt sem fundust í úttekt: dauðir kraftar sleða + vantandi lykil-rásir) ──
  { id: 'carbon_innov', from: 'kolefnisgjald', to: 'nyskopun', coef: 0.04, lag: 4, unit: 'vísit/%', ci_lo: 0.01, ci_hi: 0.08, source: 'Porter-tilgáta: kolefnisverð hvetur græna/hreintækni-nýsköpun (áður snerti kolefnisgjald ekki nýsköpun)' },
  { id: 'retire_labor', from: 'lifeyrisaldur', to: 'vinnuafl', coef: 0.15, lag: 2, unit: 'pp/ár', ci_lo: 0.06, ci_hi: 0.28, source: 'Hærri lífeyrisaldur → eldri kynslóðir vinna lengur → meira vinnuafl (áður snerti lífeyrisaldur aðeins framfærsluhlutfall)' },
  { id: 'edu_unem', from: 'menntun', to: 'atvinnuleysi', coef: -0.015, lag: 6, unit: 'pp/%', ci_lo: -0.03, ci_hi: -0.004, source: 'Menntun/þjálfun → betri samsvörun starfa → minna skipulags-atvinnuleysi (hæg áhrif)' },
  { id: 'spread_fx', from: 'vaxtaalag', to: 'gengi_endo', coef: -0.5, lag: 1, unit: '%/pp', ci_lo: -1.0, ci_hi: -0.15, source: 'Hærra áhættuálag ríkis → fjármagns-útflæði → veikari króna (risk-off; fullkomnar áhættuálags-lykkjuna)' },
  // ── Nýjar íslenskar ákvarðanir: verðtrygging + fjármagnstekjuskattur + tryggingagjald ──
  { id: 'vt_burden', from: 'verdtrygging', to: 'greidslubyrdi', coef: -0.12, lag: 1, unit: 'vísit/%', ci_lo: -0.22, ci_hi: -0.04, source: 'Verðtryggð lán hafa lægri NAFN-greiðslubyrði (verðbætur leggjast á höfuðstól) → lægri greiðslubyrði skammtíma' },
  { id: 'vt_hdebt', from: 'verdtrygging', to: 'heimilaskuldir', coef: 0.08, lag: 3, unit: 'vísit/%', ci_lo: 0.03, ci_hi: 0.16, source: 'Verðtrygging → höfuðstóll vex með verðbólgu → hærri heimilaskuldir yfir tíma' },
  { id: 'capg_bal', from: 'fjarmagnstekjuskattur', to: 'afkoma', coef: 0.03, lag: 1, unit: '%VLF/%', ci_lo: 0.01, ci_hi: 0.06, source: 'Fjármagnstekjuskattur → tekjur ríkissjóðs (þrengri stofn en tekjuskattur)' },
  { id: 'capg_eq', from: 'fjarmagnstekjuskattur', to: 'jofnudur', coef: 0.12, lag: 1, unit: 'vísit/%', ci_lo: 0.04, ci_hi: 0.22, source: 'Fjármagnstekjur samþjappaðar efst → hærri skattur eykur tekjujöfnuð' },
  { id: 'capg_stock', from: 'fjarmagnstekjuskattur', to: 'hlutabref', coef: -0.30, lag: 1, unit: 'vísit/%', ci_lo: -0.55, ci_hi: -0.1, source: 'Hærri skattur á söluhagnað → lægri eftir-skatts ávöxtun → lægra hlutabréfaverð/fjárfesting' },
  { id: 'capg_innov', from: 'fjarmagnstekjuskattur', to: 'nyskopun', coef: -0.05, lag: 2, unit: 'vísit/%', ci_lo: -0.12, ci_hi: -0.01, source: 'Hærri fjármagnstekjuskattur → minna áhættufjármagn í nýsköpun' },
  { id: 'payroll_bal', from: 'tryggingagjald', to: 'afkoma', coef: 0.06, lag: 1, unit: '%VLF/%', ci_lo: 0.03, ci_hi: 0.1, source: 'Tryggingagjald (breiður launastofn) → tekjur ríkissjóðs' },
  { id: 'payroll_unem', from: 'tryggingagjald', to: 'atvinnuleysi', coef: 0.08, lag: 2, unit: 'pp/%', ci_lo: 0.03, ci_hi: 0.15, source: 'Hærra launatengt gjald → hærri launakostnaður → minni ráðning' },
  { id: 'payroll_gdp', from: 'tryggingagjald', to: 'hagvoxtur', coef: -0.03, lag: 2, unit: 'pp/%', ci_lo: -0.07, ci_hi: -0.01, source: 'Launakostnaðar-drag á atvinnulíf' },
  { id: 'niip_fx', from: 'niip', to: 'gengi_endo', coef: 0.02, lag: 2, unit: '%/%VLF', ci_lo: 0.005, ci_hi: 0.04, source: 'Sterk erlend staða → stöðugri/sterkari króna' },
  { id: 'ca_fx', from: 'vidskiptajofnudur', to: 'gengi_endo', coef: 0.3, lag: 1, unit: '%/%VLF', ci_lo: 0.1, ci_hi: 0.55, source: 'Viðskiptaafgangur → gjaldeyris-innflæði → sterkari króna' },
  // ── Dreifing & heimili (module 13): tekjujöfnuður ──
  { id: 'transf_eq', from: 'tilfaerslur', to: 'jofnudur', coef: 0.2, lag: 1, unit: 'vísit/%', ci_lo: 0.08, ci_hi: 0.35, source: 'Tilfærslur (barna-/vaxtabætur) → meiri jöfnuður' },
  { id: 'tax_eq', from: 'skattar', to: 'jofnudur', coef: 0.1, lag: 1, unit: 'vísit/%', ci_lo: 0.03, ci_hi: 0.2, source: 'Hærri (stighækkandi) skattar → meiri jöfnuður' },
  { id: 'house_eq', from: 'husnaedi', to: 'jofnudur', coef: -0.1, lag: 2, unit: 'vísit/%', ci_lo: -0.2, ci_hi: -0.03, source: 'Húsnæðisverðshækkun → eignaójöfnuður (eigendur vs leigjendur)' },
  { id: 'unem_eq', from: 'atvinnuleysi', to: 'jofnudur', coef: -0.5, lag: 1, unit: 'vísit/pp', ci_lo: -1.0, ci_hi: -0.2, source: 'Atvinnuleysi bitnar mest á lágtekjuhópum → ójöfnuður' },
  { id: 'kaup_eq', from: 'kaupmattur', to: 'jofnudur', coef: 0.2, lag: 1, unit: 'vísit/pp', ci_lo: 0.05, ci_hi: 0.4, source: 'Almenn kaupmáttaraukning → dreifður ávinningur' },
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
  { id: 'folksfjolgun', label: 'Fólksfjölgun (+aðflutn. +frjós.)', tldr: 'Ör fólksfjölgun', levers: {}, shocks: { adflutningur: 40, frjosemi: 20 }, sentence: 'Ör fólksfjölgun (aðflutningur +40%, frjósemi +20%) eykur mannfjölda og vinnuafl — ýtir undir hagvöxt en einnig húsnæðis- og leigueftirspurn.' },
  { id: 'oldrun', label: 'Öldrun (frjósemi −30%)', tldr: 'Lækkandi frjósemi', levers: {}, shocks: { frjosemi: -30 }, sentence: 'Lækkandi frjósemi (−30%) hefur hverfandi áhrif á 3 árum — raunveruleg áhrif á vinnuafl og framfærslubyrði koma áratugum síðar. Sjá mannfjöldaspá til 2074 á /mannfjoldi/.' },
  { id: 'skattalaekkun', label: 'Skattalækkun (−10%)', tldr: 'Lægri skattar', levers: { skattar: -10 }, shocks: {}, sentence: 'Skattalækkun (−10%) örvar hagvöxt lítillega en versnar afkomu ríkissjóðs og eykur skuldir smám saman.' },
  { id: 'adhald', label: 'Aðhald (útgjöld −10%)', tldr: 'Ríkisaðhald', levers: { utgjold: -10 }, shocks: {}, sentence: 'Aðhald í útgjöldum (−10%) bætir afkomu ríkissjóðs og lækkar skuldir, en dregur lítillega úr hagvexti til skamms tíma.' },
  { id: 'innspyting', label: 'Innspýting (útgjöld +10%)', tldr: 'Aukin ríkisútgjöld', levers: { utgjold: 10 }, shocks: {}, sentence: 'Aukin ríkisútgjöld (+10%) örva hagvöxt en versna afkomu og auka skuldir ríkissjóðs.' },
  { id: 'kvotaskerding', label: 'Kvótaskerðing (−20%)', tldr: 'Minna aflamark', levers: { kvoti: -20 }, shocks: {}, sentence: 'Skerðing aflamarks (−20%) dregur úr sjávarafurða-útflutningi og þar með lítillega úr hagvexti.' },
  { id: 'ny_storidja', label: 'Ný stóriðja (orka +15%)', tldr: 'Aukin stóriðja', levers: { orka: 15 }, shocks: {}, sentence: 'Aukin orka til stóriðju (+15%) eykur útflutning og hagvöxt en hækkar CO₂-losun.' },
  { id: 'graenir_skattar', label: 'Grænir skattar (kolefnisgjald +50%)', tldr: 'Hærra kolefnisgjald', levers: { kolefnisgjald: 50 }, shocks: {}, sentence: 'Hærra kolefnisgjald (+50%) lækkar CO₂-losun með nokkurri töf, með litlu hagvaxtar-dragi.' },
  { id: 'greidsluerfidleikar', label: 'Greiðsluerfiðleikar (vextir +2,5 + samdráttur)', tldr: 'Háir vextir + minnkandi umsvif', levers: { vextir: rateNow + 2.5 }, shocks: { ferdamenn: -25 }, sentence: 'Háir vextir samhliða samdrætti (ferðamönnum fækkar 25%) þyngja greiðslubyrði og auka atvinnuleysi — vanskil heimila og fyrirtækja aukast tafið, sem dregur enn frekar úr hagvexti (fjármála-hraðall).' },
  { id: 'lifeyrisaldur_upp', label: 'Hækka lífeyrisaldur í 70', tldr: 'Viðbragð við öldrun', levers: { lifeyrisaldur: 70 }, shocks: {}, sentence: 'Hækkun lífeyrisaldurs í 70 ár lækkar framfærsluhlutfallið (færri lífeyrisþegar á hvern vinnandi) og bætir afkomu ríkissjóðs tafið — sýnilegast í 10 ára sýn þar sem öldrun safnast upp.' },
  { id: 'byggdaatak', label: 'Byggðaátak (áhersla +30%)', tldr: 'Efling landsbyggðar', levers: { byggdastefna: 30 }, shocks: {}, sentence: 'Aukin byggðaáhersla (+30% í innviði og ívilnanir á landsbyggð) bætir byggðajöfnuð með nokkurra ára töf og nýtir mannafla og auðlindir betur um allt land — vinnur gegn þéttbýlis-þunga grunnþróunar.' },
  { id: 'nyskopunarhvati', label: 'Nýsköpunarhvati (ívilnanir +30, menntun +20)', tldr: 'Fjárfest í hugviti', levers: { ivilnanir: 30, menntun: 20 }, shocks: {}, sentence: 'Öflugur nýsköpunarhvati (styrkir/ívilnanir +30%, menntun & rannsóknir +20%) eykur nýsköpun og hugvit — skilar framleiðniaukningu og verðmætum útflutningi með töf (skýrast í 10 ára sýn), en kostar ríkissjóð til skamms tíma.' },
  { id: 'skattalaekkun_nyskopun', label: 'Skattalækkun → nýsköpun (−10%)', tldr: 'Lægri skattar örva hugvit', levers: { skattar: -10 }, shocks: {}, sentence: 'Skattalækkun (−10%) eykur ráðstöfunartekjur og kaupmátt, og örvar fjárfestingu í nýsköpun og hugviti — á kostnað lakari afkomu ríkissjóðs.' },
  { id: 'ofveidi', label: 'Ofveiði (aflamark +20%)', tldr: 'Skammtíma-gróði, langtíma-tap', levers: { kvoti: 20 }, shocks: {}, sentence: 'Aukið aflamark (+20%) eykur útflutning strax en gengur á fiskistofninn — sem dregur úr sjálfbærum útflutningi þegar frá líður. Klassísk sjálfbærni-togstreita, skýrust í 10 ára sýn.' },
  { id: 'innvidaatak', label: 'Innviðaátak (+30%)', tldr: 'Fjárfest í innviðum', levers: { innvidir: 30 }, shocks: {}, sentence: 'Stórt innviðaátak (+30%) örvar hagvöxt, styrkir byggðajöfnuð og styður nýsköpun með töf — en versnar afkomu ríkissjóðs til skamms tíma.' },
  { id: 'graent_atak', label: 'Grænt átak (orkuskipti+skógrækt+kolefnisgjald)', tldr: 'Loftslagsaðgerðir', levers: { orkuskipti: 30, skograekt: 30, kolefnisgjald: 50 }, shocks: {}, sentence: 'Samhæft grænt átak (orkuskipti +30%, skógrækt +30%, kolefnisgjald +50%) lækkar CO₂-losun verulega með tíma — skýrast í 10 ára sýn — með hóflegu hagvaxtar-dragi og kostnaði.' },
  { id: 'husnaedispakki', label: 'Húsnæðispakki (framboð+leiga+lóðir)', tldr: 'Sókn í húsnæðismálum', levers: { frambod: 30, leiguhusnaedi: 30, lodaframbod: 30 }, shocks: {}, sentence: 'Heildstæður húsnæðispakki (nýbyggingar +30%, félagslegt/leiguhúsnæði +30%, lóðaframboð +30%) hægir á húsnæðisverði og leigu með nokkurra ára töf — helsta tækið gegn húsnæðis-verðbólgu.' },
  { id: 'heimskreppa', label: 'Heimskreppa (heimshagvöxtur −4%)', tldr: 'Samdráttur ytra', levers: {}, shocks: { heimshagvoxtur: -4 }, sentence: 'Samdráttur í heimshagkerfinu (−4%) dregur úr útflutningi og hagvexti á Íslandi — opið hagkerfi er berskjaldað fyrir ytri eftirspurn.' },
];

mkdirSync(join(ROOT, 'gogn', 'roads'), { recursive: true });
const w = (f, o) => writeFileSync(join(ROOT, 'gogn', 'roads', f), JSON.stringify(o, null, 1));
w('baseline.json', baseline);
w('links.json', cleanLinks);
w('scenarios.json', scenarios);
console.log(`ROADS módel byggt: ${Object.keys(baseline.outcomes).length} útkomur, ${cleanLinks.length} tengsl, ${scenarios.length} sviðsmyndir. Vextir=${rateNow} Verðbólga=${inflNow}`);

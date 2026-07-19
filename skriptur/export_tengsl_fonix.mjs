// export_tengsl_fonix.mjs — CI-útflutningur á „sama fyrirsvar"-mynstri úr tengslagrunni (D1) fyrir Fréttavélina.
// ---------------------------------------------------------------------------------------------------------
// Finnur EINSTAKLINGA sem voru í fyrirsvari fyrir félag sem er í gjaldþrotameðferð OG eru nú í fyrirsvari
// fyrir annað (starfandi) félag. Sjálf-tenging INNAN D1 á person_key (kt-leidd) → ÁREIÐANLEG (enginn
// nafna-samanburður, sami raunverulegi einstaklingur). Byggir eingöngu á opinberum skráningum
// (fyrirtækjaskrá RSK + gjaldþrotamerki). Vikulegt/CI.
//
// ⚠ PERSÓNUVERND: skrifar AÐEINS nöfn + félaganöfn + dagsetningar (þau sem birtast). ENGIN persónu-kt fer
//    í úttakið. Úttaks-skráin (gogn/tengsl_fonix.json) er í .gitignore → nöfn eru ALDREI committuð í repo;
//    þau ná aðeins á vefinn þegar Fréttavélin birtir (og hún er GÁTTUÐ á KARP_FONIX_PUBLISH=1).
// ⚠ Þarf CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (eins og tengslagrunnur.yml). Vantar → sleppir hljóðlega.
//
// Keyrt í refresh-data.yml Á UNDAN build_frettavel.js. Aldrei banvænt (|| true í workflow + innri try/catch).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'gogn', 'tengsl_fonix.json');
const MONTHS_BACK = 24;                    // aðeins gjaldþrot síðustu N mánaða (fókus + fersk mál)
const MAX_CASES = 25;                      // þak á birt tilvik
const cutoff = new Date(Date.now() - MONTHS_BACK * 30 * 86400000).toISOString().slice(0, 10);

if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  console.log('• export_tengsl_fonix: engir Cloudflare-leyndarlyklar — sleppi (D1-útflutningur óvirkur).');
  process.exit(0);
}

function d1Query(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'tengsl', '--remote', '--json', '--command', sql],
    { cwd: 'web', encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, env: process.env });
  const j = JSON.parse(out);
  return (j[0] && j[0].results) || j.results || [];
}

// Sjálf-tenging: hlutverk í gjaldþrota-félagi (bf) × núverandi hlutverk sama person_key í öðru starfandi félagi (nf).
// seen_last IS NULL = núverandi hlutverk. gjaldþrot=1 = í gjaldþrotameðferð skv. skrá.
const SQL =
  "SELECT fk.nafn AS person, bf.nafn AS throta_felag, bf.gjaldthrot_dags AS throta_dags, " +
  "nf.nafn AS nytt_felag, hn.hlutverk AS nytt_hlutverk " +
  "FROM hlutverk hb " +
  "JOIN felog bf ON bf.kt = hb.felag_kt AND bf.gjaldthrot = 1 AND bf.gjaldthrot_dags >= '" + cutoff + "' " +
  "JOIN hlutverk hn ON hn.person_key = hb.person_key AND hn.felag_kt <> hb.felag_kt AND hn.seen_last IS NULL " +
  "JOIN felog nf ON nf.kt = hn.felag_kt AND (nf.gjaldthrot IS NULL OR nf.gjaldthrot = 0) " +
  "JOIN folk fk ON fk.person_key = hb.person_key " +
  "WHERE fk.nafn IS NOT NULL " +
  "ORDER BY bf.gjaldthrot_dags DESC LIMIT 6000";

try {
  const rows = d1Query(SQL);
  // Hópa á einstakling (nafn). Sameina þrota-félög + ný félög (dedup á nafni). ENGIN kt geymd.
  const byPerson = new Map();
  for (const r of rows) {
    if (!r.person) continue;
    const key = String(r.person).trim().toLowerCase();
    const c = byPerson.get(key) || { person: String(r.person).trim(), throta: new Map(), ny: new Map() };
    if (r.throta_felag) c.throta.set(r.throta_felag, { felag: r.throta_felag, dags: r.throta_dags || null });
    if (r.nytt_felag) c.ny.set(r.nytt_felag, { felag: r.nytt_felag, hlutverk: r.nytt_hlutverk || null });
    byPerson.set(key, c);
  }
  const cases = [...byPerson.values()]
    .map((c) => ({ person: c.person, throta: [...c.throta.values()], ny: [...c.ny.values()] }))
    .filter((c) => c.throta.length && c.ny.length)
    // röðun: nýjasta gjaldþrot fyrst
    .sort((a, b) => (b.throta[0].dags || '').localeCompare(a.throta[0].dags || ''))
    .slice(0, MAX_CASES);

  const out = { updated: new Date().toISOString(), cutoff, n: cases.length, cases };
  fs.writeFileSync(OUT, JSON.stringify(out));
  // ⚠ REPO ER PUBLIC → GitHub Actions-logg eru opinber. Prentum EINGÖNGU tölur, ALDREI nöfn, í stdout.
  //   Nöfnin lifa aðeins í gogn/tengsl_fonix.json (gitignored, eyðist með runner). Yfirferð fer fram STAÐBUNDIÐ
  //   (keyra þetta skript á eigin vél með CF-token → opna JSON) eða í einka-umhverfi. Sjá athugasemd efst.
  const withMany = cases.filter((c) => c.ny.length > 1).length;
  console.log(`• export_tengsl_fonix: ${cases.length} tilvik (gjaldþrot ≥ ${cutoff}); ${withMany} með fleiri en eitt núverandi félag. [Nöfn EKKI prentuð — sjá gitignored JSON staðbundið.]`);
} catch (e) {
  console.log('• export_tengsl_fonix: D1-fyrirspurn brást (' + String(e.message || e).slice(0, 120) + ') — engin skrá skrifuð.');
  process.exit(0);
}

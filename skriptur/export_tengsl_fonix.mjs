// export_tengsl_fonix.mjs — CI-útflutningur á AGGREGATE „sama fyrirsvar"-tölum úr tengslagrunni (D1).
// ---------------------------------------------------------------------------------------------------
// Telur (án nafna) hversu margir EINSTAKLINGAR voru í fyrirsvari fyrir félag í gjaldþrotameðferð OG eru
// jafnframt skráðir í fyrirsvari fyrir annað starfandi félag. Sjálf-tenging INNAN D1 á person_key.
// ⚠ ENGIN PERSÓNUGÖGN í úttaki — AÐEINS heildartölur. Því er úttakið hættulaust (má committa) og ENGIN
//   nafnbirting á sér stað. (Aron valdi „opinbert en nafnlaust" 2026-07-19 eftir að yfirferð sýndi að
//   ~85% ein-gjaldþrota tilvika væru saklaus → engin einstaklings-birting.)
// ⚠ Þarf CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (eins og tengslagrunnur.yml). Vantar → sleppir hljóðlega.
// Keyrt í refresh-data.yml Á UNDAN build_frettavel.js. Aldrei banvænt.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'gogn', 'tengsl_fonix.json');
const MONTHS_BACK = 24;
const cutoff = new Date(Date.now() - MONTHS_BACK * 30 * 86400000).toISOString().slice(0, 10);

if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  console.log('• export_tengsl_fonix: engir Cloudflare-leyndarlyklar — sleppi (D1-útflutningur óvirkur).');
  process.exit(0);
}

// Aggregate: heildarfjöldi einstaklinga + hversu margir með 2+ gjaldþrot (raðmynstur). ENGIN nöfn.
const SQL =
  "SELECT COUNT(*) AS total, SUM(CASE WHEN n_throt >= 2 THEN 1 ELSE 0 END) AS radmynstur FROM (" +
  "SELECT hb.person_key AS pk, COUNT(DISTINCT bf.kt) AS n_throt " +
  "FROM hlutverk hb " +
  "JOIN felog bf ON bf.kt = hb.felag_kt AND bf.gjaldthrot = 1 AND bf.gjaldthrot_dags >= '" + cutoff + "' " +
  "JOIN hlutverk hn ON hn.person_key = hb.person_key AND hn.felag_kt <> hb.felag_kt AND hn.seen_last IS NULL " +
  "JOIN felog nf ON nf.kt = hn.felag_kt AND (nf.gjaldthrot IS NULL OR nf.gjaldthrot = 0) " +
  "GROUP BY hb.person_key)";

try {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'tengsl', '--remote', '--json', '--command', SQL],
    { cwd: 'web', encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: process.env });
  const j = JSON.parse(out);
  const r = ((j[0] && j[0].results) || j.results || [])[0] || {};
  const total = +r.total || 0, radmynstur = +r.radmynstur || 0;
  fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), cutoff, total, radmynstur }));
  console.log(`• export_tengsl_fonix: ${total} einstaklingar (þar af ${radmynstur} með 2+ gjaldþrot), gjaldþrot ≥ ${cutoff}. Aggregate — engin nöfn.`);
} catch (e) {
  console.log('• export_tengsl_fonix: D1-fyrirspurn brást (' + String(e.message || e).slice(0, 120) + ') — engin skrá skrifuð.');
  process.exit(0);
}

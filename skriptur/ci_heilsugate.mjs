// ci_heilsugate.mjs — Heilsu-hlið gagnapípunnar (úttekt 30.7.2026, C1).
// Vandinn: 80× `|| true` + „commit aðeins ef breyting" ⇒ hrunin skripta og óbreytt veita líta EINS út
// (þannig lifði OneDrive-frostið vikum saman og lobbyvakt-cache-eitrunin í 3 daga).
// Lausnin: þetta hlið keyrir SÍÐAST, EFTIR commit/push — gögn keyrslunnar skila sér ALLTAF —
// og fellur (exit 1 → RAUÐ keyrsla + tafla í run-summary) ef lykil-veita er yfir þolmörkum.
// Les web/public/gogn/heilsa.json sem build_heilsa.mjs byggði FYRR Í SÖMU KEYRSLU:
// veita sem hrundi í þessari keyrslu er þá enn með gamla tímastimpilinn → mælist stöðnuð → rautt.
import { readFileSync, appendFileSync } from 'node:fs';

let h;
try { h = JSON.parse(readFileSync('web/public/gogn/heilsa.json', 'utf8')); }
catch (e) { console.error('❌ heilsa.json vantar/ólesanleg — build_heilsa.mjs brást:', e.message); process.exit(1); }

const now = Date.now();
const rows = [];
let failures = 0;
for (const f of (h.freshness || [])) {
  const t = f.iso ? Date.parse(f.iso) : NaN;
  const ok = Number.isFinite(t) && (now - t) <= f.maxAge;   // framtíðar-stimpill telst OK (klukkuskekkja fellir ekki)
  if (!ok) failures++;
  const ageTxt = Number.isFinite(t) ? ((now - t) / 3600000).toFixed(1) + ' klst' : 'óþekkt';
  rows.push(`| ${ok ? '✅' : '❌'} | ${f.label} | \`${f.file}\` | ${ageTxt} | ${(f.maxAge / 3600000).toFixed(0)} klst |`);
}
const md = [
  '## 🩺 Heilsu-hlið gagnapípunnar', '',
  '| | Veita | Skrá | Aldur | Þolmörk |',
  '|---|---|---|---|---|',
  ...rows, '',
  failures
    ? `**❌ ${failures} lykil-veita/ur yfir þolmörkum — skripta hrundi líklega hljóðlaust (\`|| true\`). Leitaðu að villum í skrefunum að ofan.**`
    : '**✅ Allar lykil-veitur innan þolmarka.**',
].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) { try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n'); } catch (e) {} }
console.log(md);
process.exit(failures ? 1 : 0);

// ─────────────────────────────────────────────────────────────
// build_ees_gerdir.js — nýjustu EES-merktu gerðir ESB (LOTA 18, #11c)
// CELLAR SPARQL-gátt Útgáfuskrifstofu ESB (opin, ekkert API-lykil):
// reglugerðir + tilskipanir síðustu ~90 daga með „EEA relevance" í titli.
// ATH: svarið byrjar stundum á bili → trim() áður en JSON er lesið.
// Úttak: gogn/ees_gerdir.json → birt á /ees/.
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

async function main() {
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const sparql = `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT DISTINCT ?act ?date ?title WHERE {
  ?act cdm:work_date_document ?date . FILTER(?date >= "${since}"^^<http://www.w3.org/2001/XMLSchema#date>)
  ?act cdm:work_has_resource-type ?rt . FILTER(?rt IN (<http://publications.europa.eu/resource/authority/resource-type/REG>, <http://publications.europa.eu/resource/authority/resource-type/DIR>, <http://publications.europa.eu/resource/authority/resource-type/REG_IMPL>, <http://publications.europa.eu/resource/authority/resource-type/REG_DEL>))
  ?exp cdm:expression_belongs_to_work ?act ; cdm:expression_title ?title .
  FILTER(LANG(?title) = "en" || LANG(?title) = "")
  FILTER(CONTAINS(?title, "EEA relevance"))
} ORDER BY DESC(?date) LIMIT 40`;
  const r = await fetch('https://publications.europa.eu/webapi/rdf/sparql?query=' + encodeURIComponent(sparql), {
    headers: { 'User-Agent': 'KARP build (karp.is)', Accept: 'application/sparql-results+json' },
  });
  const raw = (await r.text()).trim();
  if (r.status !== 200 || raw[0] !== '{') throw new Error('CELLAR ' + r.status + ': ' + raw.slice(0, 120));
  const rows = (JSON.parse(raw).results.bindings || []).map((b) => {
    const uri = (b.act || {}).value || '';
    const celex = uri.includes('/celex/') ? uri.split('/celex/')[1] : '';
    let title = ((b.title || {}).value || '').replace(/\s*\(Text with EEA relevance\)\s*/gi, '').trim();
    // Gerðartegund úr CELEX (32026R… = reglugerð, 32026L… = tilskipun)
    const teg = /^\d{5}R/.test(celex) ? 'Reglugerð' : /^\d{5}L/.test(celex) ? 'Tilskipun' : 'Gerð';
    return { d: (b.date || {}).value, t: title.slice(0, 240), celex, teg };
  }).filter((x) => x.celex);
  // Tvítök burt (sama CELEX getur komið oftar en einu sinni gegnum expression-ið)
  const seen = new Set();
  const uniq = rows.filter((x) => (seen.has(x.celex) ? false : (seen.add(x.celex), true)));
  const out = { updated: new Date().toISOString().slice(0, 10), since, gerdir: uniq.slice(0, 25) };
  fs.writeFileSync(path.join(__dirname, '..', 'gogn', 'ees_gerdir.json'), JSON.stringify(out));
  console.log('Skrifað: gogn/ees_gerdir.json ·', out.gerdir.length, 'gerðir ·', out.gerdir[0] ? out.gerdir[0].d + ' ' + out.gerdir[0].t.slice(0, 60) : '-');
}
main().catch((e) => { console.error(e); process.exit(1); });

// build_sjavarutvegur.js (LOTA 85) — Sjávarútvegs-síðan úr Gagnavef Fiskistofu (opinn GraphQL, Azure).
// Sækir landsdekkandi kvóta-/afla-gögn og bakar í gogn/sjavarutvegur.json fyrir /sjavarutvegur/ (SSG).
//   • FrontPageData        → áberandi kvótastaða (3 tegundir, tonn)
//   • Aflastodulisti(fteg) → per skip: aflamark/afli/staða → LANDSSAMTALA + KVÓTAÞJÖPPUN per tegund
//   • Fisktegundir         → tegundaskrá (fteg → nafn)
// ⚠ Bakendinn IP-hraðatakmarkar (~5-6 hröð köll → 405 um stund) → RAÐKEYRT með 1,8s töf + 405-backoff.
//   Þess vegna BYGGINGARTÍMA (1×/dag í CI), aldrei lifandi. Sjá memory/iceland-fiskistofa-api.md.
// KEYRSLA: node skriptur/build_sjavarutvegur.js  (~1-2 mín)

const fs = require('fs');
const path = require('path');
const API = 'https://gagnavefur-api-btg7credbqbbbaav.northeurope-01.azurewebsites.net/graphql';
const OUT = [path.join(__dirname, '..', 'gogn'), path.join(__dirname, '..', 'web', 'public', 'gogn')];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function gql(query, variables, tries = 0) {
  const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables: variables || {} }) });
  if (r.status === 405) { if (tries >= 4) throw new Error('405 x5'); const back = 6000 * (tries + 1); console.log('  … 405 hraðatakmörkun, bíð ' + back / 1000 + 's'); await wait(back); return gql(query, variables, tries + 1); }
  const j = await r.json().catch(() => null);
  if (!j || j.errors) throw new Error('gql: ' + (j && j.errors ? j.errors[0].message : r.status));
  return j.data;
}
function fiskveidiTimabil() { const d = new Date(), y = d.getUTCFullYear(), m = d.getUTCMonth(); const s = m >= 8 ? y : y - 1; return String(s % 100).padStart(2, '0') + String((s + 1) % 100).padStart(2, '0'); }
const sum = (a, k) => a.reduce((s, x) => s + (+x[k] || 0), 0);

// Efnahagslega mikilvægustu tegundir (nafn-samsvörun við Fisktegundir-listann)
const MAJOR = ['þorskur', 'ýsa', 'ufsi', 'karfi', 'gullkarfi', 'djúpkarfi', 'síld', 'íslensk sumargotssíld', 'makríll', 'loðna', 'grálúða', 'steinbítur', 'langa', 'blálanga', 'keila', 'skötuselur', 'humar', 'rækja', 'skarkoli', 'sandkoli', 'úthafsrækja', 'gulllax', 'kolmunni'];

(async () => {
  const timabil = fiskveidiTimabil();
  console.log('fiskveiðiár:', timabil);
  // 1) tegundaskrá
  const teg = (await gql('{ fisktegundir { value label } }')).fisktegundir || [];
  console.log('tegundir alls:', teg.length);
  await wait(1800);
  // 2) áberandi kvótastaða
  let featured = [];
  try { const fp = await gql('{ frontPageData { quotaCards { species currentTons quotaTons percent severity } } }'); featured = (fp.frontPageData && fp.frontPageData.quotaCards || []).map((c) => ({ species: c.species, afli: c.currentTons, kvoti: c.quotaTons, pct: c.percent, severity: c.severity })); } catch (e) { console.log('  FrontPageData brást:', e.message); }
  await wait(1800);
  // 3) per tegund: Aflastodulisti → landssamtala + þjöppun (merki eru "1 Þorskur" → strípa númer)
  const clean = (l) => String(l || '').replace(/^\d+\s+/, '');
  const norm = (s) => clean(s).toLowerCase().normalize('NFC');
  const valdar = teg.filter((t) => MAJOR.some((m) => norm(t.label) === m || norm(t.label).startsWith(m)))
    .filter((t, i, a) => a.findIndex((x) => x.value === t.value) === i).slice(0, 22);
  console.log('valdar tegundir:', valdar.map((t) => t.label).join(', '));
  const species = [];
  for (const t of valdar) {
    try {
      const d = await gql('query($fteg: Int!, $timabil: String!){ aflastodulisti(fteg:$fteg, timabil:$timabil){ skipnr vesselName operatorClass aflamark afli stada umframafli } }', { fteg: +t.value, timabil });
      const rows = (d.aflastodulisti || []).filter((x) => (+x.aflamark || 0) > 0 || (+x.afli || 0) > 0);
      if (!rows.length) { console.log('  ' + t.label + ': engin gögn'); await wait(1800); continue; }
      const aflamark = sum(rows, 'aflamark'), afli = sum(rows, 'afli');
      const byShip = rows.slice().sort((a, b) => (+b.aflamark || 0) - (+a.aflamark || 0));
      const top = byShip.slice(0, 15).map((x) => ({ skip: x.vesselName, fl: x.operatorClass, aflamark: +x.aflamark || 0, afli: +x.afli || 0, pct: aflamark ? Math.round((+x.aflamark / aflamark) * 1000) / 10 : 0 }));
      const top10 = aflamark ? Math.round((sum(byShip.slice(0, 10), 'aflamark') / aflamark) * 1000) / 10 : 0;
      species.push({ fteg: +t.value, nafn: clean(t.label), aflamark, afli, stada: sum(rows, 'stada'), nyting: aflamark ? Math.round((afli / aflamark) * 1000) / 10 : 0, nSkip: rows.length, top10pct: top10, top });
      console.log('  ' + t.label.padEnd(22) + ' aflamark ' + Math.round(aflamark / 1e6) + ' þús.t · ' + rows.length + ' skip · topp10=' + top10 + '%');
    } catch (e) { console.log('  ' + t.label + ': ' + e.message); }
    await wait(1800);
  }
  species.sort((a, b) => b.aflamark - a.aflamark);
  const out = { updated: new Date().toISOString(), timabil, timabilLabel: timabil.replace(/(\d\d)(\d\d)/, '20$1/20$2'), source: 'Gagnavefur Fiskistofu', featured, species };
  const s = JSON.stringify(out);
  OUT.forEach((dir) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'sjavarutvegur.json'), s); });
  console.log('\nsjavarutvegur.json:', species.length, 'tegundir |', (s.length / 1024).toFixed(0), 'KB');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });

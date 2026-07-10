#!/usr/bin/env node
// build_stjornartidindi.mjs — Stjórnartíðindi (Official Journal) → web/public/gogn/stjornartidindi.json
// Uppspretta: island.is/api/graphql officialJournalOfIcelandAdverts (OPIÐ, óauðkennt, engin operationName).
// Nýjustu ~200 auglýsingar/reglugerðir/lög, flokkuð eftir deild (A/B/C), tegund og útgefanda (ráðuneyti/stofnun).
// Sjá memory/iceland-islandis-graphql-audit.md. Neytandi: /stjornartidindi/ opna yfirlitssíðan.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'web', 'public', 'gogn', 'stjornartidindi.json');
const GQL = 'https://island.is/api/graphql';
const H = { 'content-type': 'application/json', 'User-Agent': 'Mozilla/5.0 (KARP dashboard build; karp.is)' };
// ⚠ ENGIN operationName (nafnlaus fyrirspurn → 400). Return-týpan er OfficialJournalOfIcelandAdvertLean.
const Q = 'query($input: OfficialJournalOfIcelandAdvertsInput!){ officialJournalOfIcelandAdverts(input:$input){ adverts { id title publicationDate department { title } type { title } involvedParty { title } } paging { page totalPages totalItems } } }';

const iso = (d) => d.toISOString().slice(0, 10);
const KEEP = 200;

async function page(dateFrom, dateTo, p, pageSize) {
  const r = await fetch(GQL, { method: 'POST', headers: H, body: JSON.stringify({ query: Q, variables: { input: { dateFrom, dateTo, page: p, pageSize } } }) });
  const j = await r.json().catch(() => null);
  if (!j || j.errors) throw new Error('GraphQL: ' + JSON.stringify((j && j.errors) || 'ekkert svar').slice(0, 200));
  return j.data && j.data.officialJournalOfIcelandAdverts;
}

(async () => {
  const now = new Date();
  const dateTo = iso(new Date(now.getTime() + 86400000));          // +1 dagur (tímabelti-öryggi)
  const dateFrom = iso(new Date(now.getTime() - 120 * 86400000));  // 120 dagar aftur → yfirleitt >200 færslur
  const pageSize = 100;

  const first = await page(dateFrom, dateTo, 1, pageSize);
  if (!first) throw new Error('Ekkert svar frá officialJournalOfIcelandAdverts');
  const totalItems = (first.paging && first.paging.totalItems) || 0;
  const totalPages = (first.paging && first.paging.totalPages) || 1;
  let all = first.adverts || [];
  for (let p = 2; p <= totalPages && all.length < KEEP + 60 && p <= 10; p++) {
    const nx = await page(dateFrom, dateTo, p, pageSize);
    if (!nx || !(nx.adverts || []).length) break;
    all = all.concat(nx.adverts);
    await new Promise((r) => setTimeout(r, 120)); // hógvær töf milli kalla
  }

  const rows = all.map((a) => ({
    id: a.id || null,
    titill: (a.title || '').trim().replace(/\s+/g, ' '),
    dags: a.publicationDate || null,
    deild: (a.department && a.department.title) || '—',
    tegund: (a.type && a.type.title) || '—',
    utgefandi: (a.involvedParty && a.involvedParty.title) || null,
  }))
    .filter((x) => x.titill && x.dags)
    .sort((a, b) => (b.dags < a.dags ? -1 : b.dags > a.dags ? 1 : 0)) // nýjast fyrst
    .slice(0, KEEP);

  if (rows.length < 20) throw new Error('Grunsamlega fáar færslur (' + rows.length + ') — hætti');

  const byDept = {}, byType = {};
  for (const r of rows) {
    byDept[r.deild] = (byDept[r.deild] || 0) + 1;
    byType[r.tegund] = (byType[r.tegund] || 0) + 1;
  }

  const data = {
    updated: iso(now),
    source: 'Stjórnartíðindi um island.is (officialJournalOfIcelandAdverts)',
    range: { from: dateFrom, to: dateTo },
    totalItems, n: rows.length, byDept, byType, adverts: rows,
  };
  fs.writeFileSync(OUT, JSON.stringify(data));
  console.log('stjornartidindi.json | færslur:', rows.length, '| totalItems(120d):', totalItems, '| deildir:', JSON.stringify(byDept), '| tegundir:', Object.keys(byType).length, '| bytes:', fs.statSync(OUT).size);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });

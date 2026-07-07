#!/usr/bin/env node
// =============================================================================
//  build_pep.js  —  slim PEP-vísi (stjórnmálalega tengdir aðilar) fyrir client-hlið
//  PEP-skimun á /fyrirtaeki/.  Sameinar þingmenn (althingi.json) + ráðherra
//  (cabinet.json) + sveitarstjóra (sveitarstjorar.json) → web/public/gogn/pep.json.
//    { updated, fjoldi, folk:[{ nafn, hlutverk, n }] }   (n = normaliserað nafn)
//  ⚠ `n`-normaliseringin VERÐUR að vera EINS og pepNorm() í fyrirtaeki.astro.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const G = path.resolve(__dirname, '..', 'web', 'public', 'gogn');
const rd = (f) => { try { return JSON.parse(fs.readFileSync(path.join(G, f), 'utf8')); } catch { return null; } };
// SÖMU normalisering og client (pepNorm): lágstafir, broddar burt (NFD), aðeins ísl. bókstafir.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zðþæ\s]/g, ' ').replace(/\s+/g, ' ').trim();

const out = [];
const push = (nafn, hlutverk) => { const n = norm(nafn); if (nafn && n.split(' ').length >= 2) out.push({ nafn: String(nafn).trim(), hlutverk, n }); };

for (const m of (rd('althingi.json') || [])) if (m && m.nafn) push(m.nafn, (m.adalmadur === false ? 'Varaþingmaður' : 'Alþingismaður') + (m.flokkur ? ' · ' + m.flokkur : ''));
for (const r of (rd('cabinet.json') || [])) if (r && r.nafn) push(r.nafn, 'Ráðherra' + (Array.isArray(r.emb) && r.emb.length ? ' · ' + r.emb.join('/') : ''));
const sv = rd('sveitarstjorar.json'); const bn = (sv && sv.byName) || {};
for (const k of Object.keys(bn)) { const s = bn[k]; if (s && s.stjori) push(s.stjori, (s.stjoriTitill || 'Sveitarstjóri') + (s.nafn ? ' · ' + s.nafn : '')); }

// dedup á normaliseruðu nafni (sami einstaklingur getur verið bæði þingmaður OG ráðherra)
const byN = {};
for (const p of out) { if (byN[p.n]) { if (!byN[p.n].hlutverk.includes(p.hlutverk.split(' · ')[0])) byN[p.n].hlutverk += '; ' + p.hlutverk; } else byN[p.n] = p; }
const folk = Object.values(byN).sort((a, b) => a.nafn.localeCompare(b.nafn, 'is'));

fs.mkdirSync(G, { recursive: true });
fs.writeFileSync(path.join(G, 'pep.json'), JSON.stringify({ updated: new Date().toISOString().slice(0, 10), fjoldi: folk.length, folk }));
console.log('pep.json:', folk.length, 'stjórnmálalega tengdir (þingmenn + ráðherrar + sveitarstjórar)');

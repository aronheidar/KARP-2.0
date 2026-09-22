#!/usr/bin/env node
// build_sentiment_samantekt.mjs — bakar gogn/sentiment.json úr tónmati fréttasafnsins (D1 news.sent_ai).
//
// ⚠ 22.9.2026: sentiment.json stóð frá 28.6. build_sentiment.js (eigið Haiku-mat á RSS, skyndiminni á
//   vél Arons) var aldrei í daglegu keyrslunni, og /api/firma reiknaði tón annars staðar. Tvö kerfi
//   sýndu ólíkar tölur á sömu síðu. Nú eru síun (_firmaSia) og samantekt (aggregateFirma) SÖMU föll og
//   /api/firma notar, og félagalistinn sá sami og fréttasíðan (web/src/data/fyrirtaeki.json).
// ⚠ D1 ókeypis-þrepið leyfir 5 milljónir lesinna raða á dag, og þegar það springur birtist það sem
//   „rangt lykilorð" við innskráningu (minni: karp-d1-lestrarthak). 35 köll á /api/firma myndu skanna
//   180 daga 35 sinnum. Hér eru 180 dagar lesnir EINU SINNI (vísir idx_news_ts, 5 daga bútar) og
//   öll félög pöruð í minni.
// ⚠ Engin skilríki eða bilun → skrifar EKKI og gamla skráin heldur sér.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeD1 } from './lib/d1_rest.mjs';
import { faersla } from './lib/sentiment_samantekt.mjs';
import { _firmaSia } from '../web/src/worker/cron.mjs';

const ROT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAGAR = 180;
const BUTUR = 5;
const SKRA = path.join(ROT, 'gogn', 'sentiment.json');
const FELOG = JSON.parse(fs.readFileSync(path.join(ROT, 'web', 'src', 'data', 'fyrirtaeki.json'), 'utf8'));

let db;
try { db = makeD1(path.join(ROT, 'web')); } catch (e) {
  console.warn('sentiment:', e.message, '— sleppi (gamla skráin heldur)');
  process.exit(0);
}

const nu = Math.floor(Date.now() / 1000);
const upphaf = nu - DAGAR * 86400;
const radir = [];
for (let til = nu + 1; til > upphaf; til -= BUTUR * 86400) {
  const fra = Math.max(til - BUTUR * 86400, upphaf);
  const r = await db.query('SELECT title, url, source, ts, body, sent, sent_ai FROM news WHERE ts>=? AND ts<? ORDER BY ts DESC', [fra, til]);
  for (const x of r) radir.push({ ...x, body: x.body || x.title, date: new Date(x.ts * 1000).toISOString().slice(0, 10) });
}
if (!radir.length) { console.error('sentiment: engar fréttir í safninu — skrifa EKKI'); process.exit(1); }

const companies = {};
for (const c of FELOG) {
  const f = faersla(_firmaSia(radir, c.a && c.a.length ? c.a : [c.n]), DAGAR);
  if (f) companies[c.n] = f;
}
if (!Object.keys(companies).length) { console.error('sentiment: ekkert félag með tón — skrifa EKKI'); process.exit(1); }
fs.writeFileSync(SKRA, JSON.stringify({
  updated: new Date().toISOString().slice(0, 10),
  heimild: 'Tónmat Karp á fréttasafninu (AI-mat Claude Haiku, annars lexíkon), síðustu 180 dagar. Sama vinnsla og /api/firma.',
  scope: 'frettasafn-180d',
  companies,
}));
console.log(`sentiment.json | ${radir.length} fréttir lesnar | ${Object.keys(companies).length} af ${FELOG.length} félögum með tón`);

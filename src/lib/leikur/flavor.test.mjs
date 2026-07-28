import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { leverEffects, newsHeadlines, popularity, endTitle, govtStability, advisors } from './flavor.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const rj = (f) => JSON.parse(readFileSync(join(__dirname, '../../../gogn/roads/' + f), 'utf8'));
const baseline = rj('baseline.json'), links = rj('links.json');
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

// leverEffects
const ve = leverEffects('vextir', baseline, links);
ok('vextir hefur áhrif (≥3)', ve.length >= 3);
ok('vextir → greiðslubyrði meðal sterkustu áhrifa', ve.some((e) => e.key === 'greidslubyrdi'));
ok('leverEffect hefur label + dir', ve[0].label && (ve[0].dir === 1 || ve[0].dir === -1));
ok('topp 5 að hámarki', ve.length <= 5);
ok('óþekktur lever → tómt', leverEffects('ekki_til', baseline, links).length === 0);

// newsHeadlines
ok('há verðbólga → tveggja stafa fyrirsögn', newsHeadlines({ verdbolga: 12, hagvoxtur: 2, atvinnuleysi: 4, skuldir: 40 }).some((s) => s.includes('tveggja stafa')));
ok('samdráttur → fyrirsögn', newsHeadlines({ verdbolga: 2, hagvoxtur: -3, atvinnuleysi: 5, skuldir: 40 }).some((s) => s.includes('Samdráttur')));
ok('rólegt → default fyrirsögn', newsHeadlines({ verdbolga: 2.5, hagvoxtur: 2.5, atvinnuleysi: 4, skuldir: 45 }).some((s) => s.includes('Rólegt')));
ok('≤3 fyrirsagnir', newsHeadlines({ verdbolga: 12, hagvoxtur: -3, atvinnuleysi: 9, skuldir: 90 }).length <= 3);

// popularity
ok('gott ástand → hátt fylgi', popularity({ verdbolga: 2.5, hagvoxtur: 4, atvinnuleysi: 3 }) > 55);
ok('slæmt ástand → lágt fylgi', popularity({ verdbolga: 12, hagvoxtur: -4, atvinnuleysi: 10 }) < 40);
ok('fylgi klippt 0–100', popularity({ verdbolga: 30, hagvoxtur: -10, atvinnuleysi: 20 }) >= 0 && popularity({ verdbolga: 2.5, hagvoxtur: 10, atvinnuleysi: 2 }) <= 100);

// govtStability (Fasi B) — lágt fylgi → uppreisn með factor
const good = govtStability({ verdbolga: 2.5, hagvoxtur: 3, atvinnuleysi: 3.5 });
ok('gott ástand → stable, factor 1', good.level === 'stable' && good.factor === 1);
const crash = govtStability({ verdbolga: 12, hagvoxtur: -7, atvinnuleysi: 8 }); // 2008-líkt
ok('hrun → revolt (búsáhaldabyltingin)', crash.level === 'revolt' && crash.factor < 0.9);
ok('revolt hefur icon+title', crash.icon === '🍳' && /Búsáhalda/.test(crash.title));
const mid = govtStability({ verdbolga: 6, hagvoxtur: -1, atvinnuleysi: 6.5 }); // ~36% → unrest
ok('miðlungs ólga → unrest, 0.9<factor<1', mid.level === 'unrest' && mid.factor > 0.9 && mid.factor < 1);
ok('approval alltaf 0–100', good.approval >= 0 && good.approval <= 100 && crash.approval >= 0);

// advisors — andstæð ráð eftir stöðu
const adv = advisors({ verdbolga: 6, hagvoxtur: 0.5, atvinnuleysi: 6 }, 1);
ok('3+ ráðgjafar', adv.length >= 3);
ok('Seðlabanki vill aðhald í hárri verðbólgu', /her[ðr]|vext/i.test(adv.find((x) => x.who === 'Seðlabankinn').advice));
ok('verkalýður vill verja störf í atvinnuleysi', /störf|atvinnu/i.test(adv.find((x) => x.who === 'Verkalýðshreyfingin').advice));
ok('KT6+ fær umhverfis-ráðgjafa', advisors({ losun: 120 }, 6).some((x) => x.who === 'Umhverfissinnar'));
ok('lág verðbólga → Seðlabanki vill slaka', /slak|hjöðnun/i.test(advisors({ verdbolga: 1 }, 1).find((x) => x.who === 'Seðlabankinn').advice));

// endTitle
ok('hátt avg → Efnahags-undrið', endTitle(90).title.includes('Efnahags-undrið'));
ok('lágt avg → Hrun-stjórnin', endTitle(20).title.includes('Hrun-stjórnin'));
ok('meðal avg → titill + blurb', endTitle(60).title && endTitle(60).blurb.length > 0);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TAB_META } from './game-config.mjs';
import { RADUNEYTI, PM, leverOwner, raduneytiLevers, mergeDecisions, claimRaduneyti, releaseRaduneyti, raduneytiOf, raduneytiStaða, raduneytiStada, validHandle, normMap, radherrarOn, tilGeymslu } from './radherrar.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(join(__dirname, '../../../gogn/roads/baseline.json'), 'utf8'));
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const ON = { radherrar: true };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── (1) RADUNEYTI: 7 sæti, föst röð, vörpun við TAB_META + baseline-hópa ──
ok('7 sæti, forsaetis fyrst með group null', RADUNEYTI.length === 7 && RADUNEYTI[0].key === PM && RADUNEYTI[0].group === null);
ok('lyklar einkvæmir', new Set(RADUNEYTI.map((r) => r.key)).size === 7);
ok('heiti/icon/lysing íslensk og ekki tóm', RADUNEYTI.every((r) => r.heiti && r.icon && r.lysing && r.lysing.length > 20));
ok('hvert group ≠ null er TAB_META-lykill', RADUNEYTI.filter((r) => r.group).every((r) => TAB_META[r.group] && TAB_META[r.group].icon));
const baseGroups = new Set(Object.values(baseline.levers).map((l) => l.group));
ok('6 ráðuneyti ↔ 6 baseline-hópar (einn-á-einn)', same([...baseGroups].sort(), RADUNEYTI.filter((r) => r.group).map((r) => r.group).sort()));
ok('sedlabanki = Peningastefna & varúð (sjálfstæð stofnun í lýsingu)', RADUNEYTI.find((r) => r.key === 'sedlabanki').group === 'Peningastefna & varúð' && /sjálfstæð/i.test(RADUNEYTI.find((r) => r.key === 'sedlabanki').lysing));
ok('RADUNEYTI frosið', Object.isFrozen(RADUNEYTI));

// ── (2) leverOwner ──
ok('vextir → sedlabanki', leverOwner('vextir', baseline) === 'sedlabanki');
ok('skattar → fjarmal', leverOwner('skattar', baseline) === 'fjarmal');
ok('frambod → husnaedi', leverOwner('frambod', baseline) === 'husnaedi');
ok('laun → vinnumarkadur', leverOwner('laun', baseline) === 'vinnumarkadur');
ok('kvoti → audlindir', leverOwner('kvoti', baseline) === 'audlindir');
ok('ferdamannagjald → byggd', leverOwner('ferdamannagjald', baseline) === 'byggd');
ok('óþekktur sleði → null', leverOwner('bull', baseline) === null && leverOwner('vextir', null) === null);
ok('hópur án ráðuneytis → null', leverOwner('x', { levers: { x: { group: 'Annað' } } }) === null);

// ── (3) raduneytiLevers: læsir vörpunina við gögnin (5/10/3/4/8/2, forsaetis=32) ──
const sz = (k) => raduneytiLevers(k, baseline).size;
ok('sedlabanki 5 sleðar', sz('sedlabanki') === 5);
ok('fjarmal 10 sleðar', sz('fjarmal') === 10);
ok('husnaedi 3 sleðar', sz('husnaedi') === 3);
ok('vinnumarkadur 4 sleðar', sz('vinnumarkadur') === 4);
ok('audlindir 8 sleðar', sz('audlindir') === 8);
ok('byggd 2 sleðar', sz('byggd') === 2);
ok('forsaetis = ALLIR 32', sz(PM) === 32 && sz(PM) === Object.keys(baseline.levers).length);
ok('óþekkt/null sæti → tómt Set', sz('bull') === 0 && sz(null) === 0 && raduneytiLevers('fjarmal', null).size === 0);
const six = RADUNEYTI.filter((r) => r.group).map((r) => [...raduneytiLevers(r.key, baseline)]);
ok('6 ráðuneyti þekja alla 32 sleða án skörunar', six.reduce((a, s) => a + s.length, 0) === 32 && new Set(six.flat()).size === 32);
ok('raduneytiLevers ⇔ leverOwner samræmt', six.every((s, i) => s.every((id) => leverOwner(id, baseline) === RADUNEYTI.filter((r) => r.group)[i].key)));

// ── (4) mergeDecisions ──
const V = baseline.levers.vextir.base, S = baseline.levers.skattar.base;
const MAP = { forsaetis: 'pm0001', sedlabanki: 'sb0001', fjarmal: 'fj0001', husnaedi: 'hu0001' };
const prev0 = { levers: { vextir: V, skattar: S }, policies: { hoft: true }, dilemma: 'a', locked: false, radherrar: MAP, note: 'x' };
const frozenPrev = JSON.stringify(prev0);

// config AF → identity (sama tilvísun), líka án config / með radherrar:false
const inc0 = { levers: { vextir: V + 1 }, locked: true };
ok('config af → incoming óbreytt (sama tilvísun)', mergeDecisions(prev0, inc0, { raduneyti: 'fjarmal', baseline, config: {} }) === inc0);
ok('config undefined → identity', mergeDecisions(prev0, inc0, { raduneyti: 'fjarmal', baseline }) === inc0);
ok('radherrar:false → identity', mergeDecisions(prev0, inc0, { raduneyti: 'fjarmal', baseline, config: { radherrar: false } }) === inc0);
ok('radherrarOn þekkir true/1/"true"', radherrarOn({ radherrar: true }) && radherrarOn({ radherrar: 1 }) && radherrarOn({ radherrar: 'true' }) && !radherrarOn({ radherrar: 'false' }) && !radherrarOn(null));

// fjarmal sendir vextir → hafnað, vextir óbreyttur; skattar (eigin) tekinn
const incFj = { levers: { skattar: S + 4, vextir: V + 1 } };
const m1 = mergeDecisions(prev0, incFj, { raduneyti: 'fjarmal', baseline, config: ON });
ok('fjarmal: skattar yfirskrifaður', m1.levers.skattar === S + 4);
ok('fjarmal: vextir ÓBREYTTUR (prev)', m1.levers.vextir === V);
ok('fjarmal: vextir í hafnad', same(m1.hafnad, ['vextir']));
ok('prev ósnert (engin mutation)', JSON.stringify(prev0) === frozenPrev && same(incFj, { levers: { skattar: S + 4, vextir: V + 1 } }));
ok('nýr hlutur skilað', m1 !== prev0 && m1 !== incFj && m1.levers !== prev0.levers);
ok('önnur svið prev varðveitt (policies/dilemma/note/radherrar)', same(m1.policies, { hoft: true }) && m1.dilemma === 'a' && m1.note === 'x' && same(m1.radherrar, MAP));
ok('locked vantar → prev.locked helst (false)', m1.locked === false);

// tveir POST-ar frá ólíkum ráðuneytum í röð → báðir lifa
const m2 = mergeDecisions(m1, { levers: { vextir: V + 2 } }, { raduneyti: 'sedlabanki', baseline, config: ON });
ok('röð: sedlabanki stillir vextir', m2.levers.vextir === V + 2);
ok('röð: skattar fjarmals lifir', m2.levers.skattar === S + 4);
ok('röð: ekkert hafnað', m2.hafnad.length === 0);
const m2b = mergeDecisions(m2, { levers: { frambod: 10 } }, { raduneyti: 'husnaedi', baseline, config: ON });
ok('röð: þriðja ráðuneytið bætist við, hin tvö lifa', m2b.levers.frambod === 10 && m2b.levers.vextir === V + 2 && m2b.levers.skattar === S + 4);

// forsaetis yfirskrifar allt
const incPm = { levers: { vextir: V + 3, skattar: S - 4, frambod: 7, bull: 1 }, policies: { hoft: false, esb: true }, dilemma: 'b', satt: 'satt', locked: true, peningastefna: 'herda' };
const m3 = mergeDecisions(prev0, incPm, { raduneyti: PM, baseline, config: ON });
ok('forsaetis: allir sleðar (líka óþekktir — engin sía)', m3.levers.vextir === V + 3 && m3.levers.skattar === S - 4 && m3.levers.frambod === 7 && m3.levers.bull === 1);
ok('forsaetis: policies/dilemma/satt yfirskrifað', same(m3.policies, { hoft: false, esb: true }) && m3.dilemma === 'b' && m3.satt === 'satt');
ok('forsaetis: önnur svið (classic-lyklar) tekin', m3.peningastefna === 'herda');
ok('forsaetis: locked:true tekið', m3.locked === true);
ok('forsaetis: hafnad tómt', m3.hafnad.length === 0);

// non-PM locked:true → hunsað (locked helst prev) þegar PM er claim-aður
const m4 = mergeDecisions(prev0, { levers: { skattar: S + 1 }, locked: true }, { raduneyti: 'fjarmal', baseline, config: ON });
ok('fjarmal locked:true → hunsað, locked helst false', m4.locked === false && m4.hafnad.includes('locked'));
const m4b = mergeDecisions({ ...prev0, locked: true }, { locked: false }, { raduneyti: 'fjarmal', baseline, config: ON });
ok('fjarmal locked:false á læst lið → hunsað, helst true', m4b.locked === true && same(m4b.hafnad, ['locked']));
ok('locked-no-op (sama gildi) skráist ekki í hafnad', mergeDecisions(prev0, { locked: false }, { raduneyti: 'fjarmal', baseline, config: ON }).hafnad.length === 0);
// fallback-læsing án PM: enginn forsaetis í map → hver sem er má læsa
const prevNoPm = { ...prev0, radherrar: { fjarmal: 'fj0001', sedlabanki: 'sb0001' } };
const m5 = mergeDecisions(prevNoPm, { locked: true }, { raduneyti: 'fjarmal', baseline, config: ON });
ok('fallback: enginn PM → fjarmal má læsa', m5.locked === true && m5.hafnad.length === 0);
ok('fallback: enginn PM → má líka aflæsa', mergeDecisions({ ...prevNoPm, locked: true }, { locked: false }, { raduneyti: 'sedlabanki', baseline, config: ON }).locked === false);
ok('fallback: sætislaus má læsa þegar enginn PM', mergeDecisions(prevNoPm, { locked: true }, { raduneyti: null, baseline, config: ON }).locked === true);
ok('um leið og PM er claim-aður lokast fallback', mergeDecisions(prev0, { locked: true }, { raduneyti: null, baseline, config: ON }).locked === false);

// policies/dilemma/satt frá sedlabanki → hafnað
const m6 = mergeDecisions(prev0, { levers: { vextir: V + 1 }, policies: { hoft: false }, dilemma: 'b', satt: 'saekja' }, { raduneyti: 'sedlabanki', baseline, config: ON });
ok('sedlabanki: policies hafnað (prev helst)', same(m6.policies, { hoft: true }) && m6.hafnad.includes('policies'));
ok('sedlabanki: dilemma hafnað', m6.dilemma === 'a' && m6.hafnad.includes('dilemma'));
ok('sedlabanki: satt hafnað (ekki sett)', m6.satt === undefined && m6.hafnad.includes('satt'));
ok('sedlabanki: eigin sleði samt tekinn', m6.levers.vextir === V + 1);
ok('classic-lykill frá ráðherra → hafnað', mergeDecisions(prev0, { peningastefna: 'herda' }, { raduneyti: 'fjarmal', baseline, config: ON }).hafnad.includes('peningastefna'));

// hljóðlátt: drög senda policies:{} + dilemma:null + alla 32 sleðana óbreytta → ekkert í hafnad
const dd = Object.fromEntries(Object.entries(baseline.levers).map(([k, v]) => [k, v.base]));
const m7 = mergeDecisions({ levers: {}, radherrar: MAP }, { levers: dd, policies: {}, dilemma: null }, { raduneyti: 'husnaedi', baseline, config: ON });
ok('drög m. öllum 32 grunngildum + tómum sviðum → ekkert hafnað', m7.hafnad.length === 0);
ok('hljóðlátt: eigin 3 sleðar skráðir, aðrir ekki (prev tómt)', Object.keys(m7.levers).length === 3 && 'frambod' in m7.levers && !('vextir' in m7.levers));
ok('hljóðlátt: sami sleði sem strengur "8" = 8 telst óbreyttur', mergeDecisions(prev0, { levers: { vextir: String(V) } }, { raduneyti: 'fjarmal', baseline, config: ON }).hafnad.length === 0);
ok('breytt gildi utan ráðuneytis skráist (þótt prev vanti → m.v. base)', same(mergeDecisions({ radherrar: MAP }, { levers: { vextir: V + 1 } }, { raduneyti: 'fjarmal', baseline, config: ON }).hafnad, ['vextir']));

// ekkert sæti → engin réttindi; sæti leitt af handle
ok('null-sæti: sleðar hafnað', same(mergeDecisions(prev0, { levers: { vextir: V + 1, skattar: S + 1 } }, { raduneyti: null, baseline, config: ON }).hafnad, ['vextir', 'skattar']));
ok('ógilt raduneyti-gildi → engin réttindi', mergeDecisions(prev0, { levers: { skattar: S + 1 } }, { raduneyti: 'bull', baseline, config: ON }).hafnad.includes('skattar'));
const m8 = mergeDecisions(prev0, { levers: { skattar: S + 1, vextir: V + 1 } }, { handle: 'fj0001', baseline, config: ON });
ok('handle fj0001 → virkar sem fjarmal', m8.levers.skattar === S + 1 && m8.levers.vextir === V && same(m8.hafnad, ['vextir']));
ok('handle pm0001 → forsaetis', mergeDecisions(prev0, { levers: { vextir: V + 1 }, locked: true }, { handle: 'pm0001', baseline, config: ON }).locked === true);
ok('óþekkt handle → engin réttindi', mergeDecisions(prev0, { levers: { skattar: S + 1 } }, { handle: 'zz9999', baseline, config: ON }).hafnad.includes('skattar'));
ok('opts.raduneyti vinnur yfir handle', mergeDecisions(prev0, { levers: { vextir: V + 1 } }, { raduneyti: PM, handle: 'fj0001', baseline, config: ON }).levers.vextir === V + 1);

// claim-beiðnir í POST (incoming.radherrar): first-wins, aldrei stolið/sleppt; nýr ráðherra má strax stilla
const m9 = mergeDecisions({ radherrar: MAP }, { radherrar: { audlindir: 'au0001' }, levers: { kvoti: 5 } }, { handle: 'au0001', baseline, config: ON });
ok('claim í POST: laust sæti tekið + sleði tekinn strax', m9.radherrar.audlindir === 'au0001' && m9.levers.kvoti === 5 && m9.hafnad.length === 0);
const m10 = mergeDecisions({ radherrar: MAP }, { radherrar: { forsaetis: 'ev1l00', fjarmal: 'fj0001' } }, { handle: 'ev1l00', baseline, config: ON });
ok('claim í POST: upptekið sæti EKKI stolið → hafnad radherrar:forsaetis', m10.radherrar.forsaetis === 'pm0001' && m10.hafnad.includes('radherrar:forsaetis'));
ok('claim í POST: eigin sæti endur-sent = hljóðlátt', !m10.hafnad.includes('radherrar:fjarmal'));
const m11 = mergeDecisions({ radherrar: MAP }, { radherrar: { fjarmal: null, husnaedi: '' } }, { handle: 'fj0001', baseline, config: ON });
ok('POST getur ekki sleppt sæti (null/"" = ógilt claim)', m11.radherrar.fjarmal === 'fj0001' && m11.radherrar.husnaedi === 'hu0001' && m11.hafnad.includes('radherrar:fjarmal'));
ok('incoming.radherrar sem ekki-hlutur hunsað', same(mergeDecisions({ radherrar: MAP }, { radherrar: 'x' }, { raduneyti: PM, baseline, config: ON }).radherrar, MAP));
ok('prev null/{} þolað → nýtt map + locked false', (() => { const m = mergeDecisions(null, { levers: { vextir: 1 } }, { raduneyti: PM, baseline, config: ON }); return m.levers.vextir === 1 && same(m.radherrar, {}) && m.locked === false; })());
ok('incoming null þolað', (() => { const m = mergeDecisions(prev0, null, { raduneyti: 'fjarmal', baseline, config: ON }); return m.levers.vextir === V && m.hafnad.length === 0; })());
ok('prev.hafnad (geymt fyrir slysni) fer ekki áfram', mergeDecisions({ hafnad: ['x'], radherrar: MAP }, { levers: {} }, { raduneyti: PM, baseline, config: ON }).hafnad.length === 0);

// tilGeymslu: decisions-JSON án locked/hafnad, locked 0|1
const g = tilGeymslu(m3);
ok('tilGeymslu: locked/hafnad ekki í decisions', !('locked' in g.decisions) && !('hafnad' in g.decisions) && g.decisions.levers.vextir === V + 3);
ok('tilGeymslu: locked → 1/0, hafnad listi', g.locked === 1 && Array.isArray(g.hafnad) && tilGeymslu(m1).locked === 0 && same(tilGeymslu(m1).hafnad, ['vextir']));
ok('tilGeymslu á incoming (config af) = gamla skiptingin', (() => { const r = tilGeymslu(inc0); return same(r.decisions, { levers: { vextir: V + 1 } }) && r.locked === 1 && r.hafnad.length === 0; })());

// ── (5) claimRaduneyti / releaseRaduneyti / raduneytiOf / raduneytiStaða ──
const c1 = claimRaduneyti({}, 'fjarmal', 'abcd12');
ok('claim: laust sæti → ok', c1.ok && c1.reason === 'ok' && c1.map.fjarmal === 'abcd12' && c1.fyrra === null);
const c2 = claimRaduneyti(c1.map, 'fjarmal', 'efgh34');
ok('claim: first-wins → upptekid, map óbreytt', !c2.ok && c2.reason === 'upptekid' && c2.map.fjarmal === 'abcd12');
ok('claim: endur-claim eigin sætis = ok/sama', (() => { const c = claimRaduneyti(c1.map, 'fjarmal', 'abcd12'); return c.ok && c.reason === 'sama' && c.map.fjarmal === 'abcd12'; })());
const c3 = claimRaduneyti(c1.map, 'husnaedi', 'abcd12');
ok('claim: sama handle → nýtt sæti sleppir fyrra', c3.ok && c3.fyrra === 'fjarmal' && c3.map.husnaedi === 'abcd12' && !('fjarmal' in c3.map) && Object.keys(c3.map).length === 1);
ok('claim: prevMap ósnert', c1.map.fjarmal === 'abcd12' && !('husnaedi' in c1.map));
ok('claim: ógilt key → ok:false', !claimRaduneyti({}, 'bull', 'abcd12').ok && claimRaduneyti({}, 'bull', 'abcd12').reason === 'ogilt_raduneyti');
ok('claim: ógilt handle → ok:false', !claimRaduneyti({}, 'fjarmal', 'Jón').ok && claimRaduneyti({}, 'fjarmal', 'ab').reason === 'ogilt_handle');
ok('claim: forsaetis claim-anlegt eins og önnur', claimRaduneyti({}, PM, 'pm0001').map.forsaetis === 'pm0001');
const r1 = releaseRaduneyti(c1.map, 'fjarmal', 'efgh34');
ok('release: ekki eigandi → hafnað', !r1.ok && r1.reason === 'ekki_eigandi' && r1.map.fjarmal === 'abcd12');
const r2 = releaseRaduneyti(c1.map, 'fjarmal', 'abcd12');
ok('release: eigandi → sleppt', r2.ok && !('fjarmal' in r2.map) && c1.map.fjarmal === 'abcd12');
ok('release: laust sæti → laust', !releaseRaduneyti({}, 'fjarmal', 'abcd12').ok && releaseRaduneyti({}, 'fjarmal', 'abcd12').reason === 'laust');
ok('release: ógilt key', !releaseRaduneyti(c1.map, 'bull', 'abcd12').ok);
ok('raduneytiOf', raduneytiOf(MAP, 'fj0001') === 'fjarmal' && raduneytiOf(MAP, 'pm0001') === PM && raduneytiOf(MAP, 'zz9999') === null && raduneytiOf(MAP, null) === null);
ok('normMap hreinsar rusl + tvítekið handle (fyrsta sæti heldur)', same(normMap({ fjarmal: 'abcd12', bull: 'abcd12', husnaedi: 'abcd12', sedlabanki: 'Jón', audlindir: 12 }), { fjarmal: 'abcd12' }));
const st = raduneytiStaða(MAP);
ok('raduneytiStaða: 7 í fastri röð', st.length === 7 && st.map((s) => s.key).join() === RADUNEYTI.map((r) => r.key).join());
ok('raduneytiStaða: taken+handle rétt', st.find((s) => s.key === 'fjarmal').taken === true && st.find((s) => s.key === 'fjarmal').handle === 'fj0001' && st.find((s) => s.key === 'byggd').taken === false && st.find((s) => s.key === 'byggd').handle === null);
ok('raduneytiStaða: ber heiti/icon/lysing/group', st.every((s) => s.heiti && s.icon && s.lysing && 'group' in s));
ok('raduneytiStaða þolir null', raduneytiStaða(null).every((s) => !s.taken) && raduneytiStada === raduneytiStaða);

// ── (6) handle-validering (4–8 stafir [a-z0-9], ekkert PII) ──
ok('gild handle', validHandle('abcd') && validHandle('a1b2c3d4') && validHandle('0000'));
ok('of stutt/of langt', !validHandle('abc') && !validHandle('abcdefghi'));
ok('hástafir/bil/bandstrik/íslenskir stafir hafnað', !validHandle('ABCD') && !validHandle('ab cd') && !validHandle('ab-cd') && !validHandle('jónjó'));
ok('ekki-strengur/tómt hafnað', !validHandle('') && !validHandle(null) && !validHandle(undefined) && !validHandle(123456));

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);

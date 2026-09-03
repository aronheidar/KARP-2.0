import test from 'node:test';
import assert from 'node:assert/strict';
import { erLogadili, greinargerdSamhengi, greinargerdHash, parseTulkun, greinargerdHtml, umsvifUrArsreikningi, KAFLAR, GREINARGERD_FYRIRVARI } from './kyc-greinargerd.mjs';

// ── lögaðila-vörðurinn (DPIA leið A: aldrei einstaklingar) ───────────────────
test('erLogadili: félags-kt (fyrsta tala 4-7) já, einstaklings-kt nei', () => {
  assert.ok(erLogadili('5411850389'));       // Brim hf.
  assert.ok(erLogadili('4501862129'));
  assert.ok(!erLogadili('0101803019'));      // einstaklingur (fæddur 1. dag)
  assert.ok(!erLogadili('3112953319'));      // einstaklingur (31. dag)
  assert.ok(!erLogadili(''));
  assert.ok(!erLogadili('541185'));          // of stutt
});

const W = { kt: '5411850389', nafn: 'Brim hf.' };
const STATES = {
  status: { stada: 'Virkt', gjaldthrot: 0, afskrad: 0 },
  ubo: { owners: [{ nafn: 'A', hlutur: 50 }], beneficial: [{ nafn: 'Jón', effPct: 30.5 }], incompleteChain: false },
  sanctions: { hits: [] }, pep: { matches: [] }, legal: { notices: [] }, skil: { years: [] },
};
const ADV = [{ flokkur: 'refsivert', stada: 'umfjollun', dags: '2026-02-05', title: 'Afturkalla leyfi', source: 'Vísir' }];
const TONN = [{ man: '2026-02', n: 1, tonn: -1 }];

test('samhengið ber dagsetningar og aðgreinir null (heimild svaraði ekki) frá tómu', () => {
  const c = greinargerdSamhengi(W, { status: STATES.status }, [], [], []);
  assert.equal(c.skimanir.refsilistar, null);          // sanctions-snapshot vantar → null, EKKI 0
  const c2 = greinargerdSamhengi(W, STATES, ADV, TONN, []);
  assert.equal(c2.skimanir.refsilistar, 0);            // svaraði með engu → 0
  assert.equal(c2.adverse[0].dags, '2026-02-05');
  assert.equal(c2.adverse[0].heiti, 'Önnur refsiverð háttsemi í rekstri');
});

test('hash breytist við hverja efnisbreytingu — endurmyndunar-gátin', () => {
  const a = greinargerdHash(greinargerdSamhengi(W, STATES, ADV, TONN, []));
  const b = greinargerdHash(greinargerdSamhengi(W, STATES, [], TONN, []));
  assert.notEqual(a, b);
  assert.equal(a, greinargerdHash(greinargerdSamhengi(W, STATES, ADV, TONN, [])));
});

// ── talna-gátin: hallucination á tölu fellir túlkunina í heild ───────────────
test('túlkun með tölum úr samhenginu stenst', () => {
  const c = greinargerdSamhengi(W, STATES, ADV, TONN, []);
  const t = 'Félagið er virkt og einn endanlegur eigandi (30.5%) er rakinn. Ein adverse media-færsla frá 2026 er á skrá.';
  assert.equal(parseTulkun(t, c), t);
});

test('túlkun með TILBÚNA tölu er hafnað í heild', () => {
  const c = greinargerdSamhengi(W, STATES, ADV, TONN, []);
  assert.equal(parseTulkun('Félagið tapaði 450 milljónum króna.', c), null);
  assert.equal(parseTulkun('Sektin nam 99% af veltu.', c), null);
});

test('of stutt, of löng og markup-menguð túlkun er hafnað', () => {
  const c = greinargerdSamhengi(W, STATES, [], [], []);
  assert.equal(parseTulkun('Stutt.', c), null);
  // Þakið fór 1400 → 2200 með umsvifa-kaflanum (3.9.2026): 1500 stafir eiga NÚ að standast,
  // annars félli lögmæt 4-8 setninga samantekt sem ber fjárhæðir.
  assert.equal(parseTulkun('x'.repeat(1500), c).length, 1500);
  assert.equal(parseTulkun('x'.repeat(2500), c), null);
  assert.equal(parseTulkun('Áhættan er <b>mikil</b> — sjá nánar hér að neðan í þessari löngu málsgrein.', c), null);
});

// ── HTML-sniðmátið ───────────────────────────────────────────────────────────
test('greinargerðin orðar fjarveru heimildar sem FYRIRVARA, ekki hreina niðurstöðu', () => {
  const h = greinargerdHtml(greinargerdSamhengi(W, { status: STATES.status }, [], [], []), null, 1754000000);
  assert.match(h, /heimild svaraði ekki/);
  assert.doesNotMatch(h, /0 samsvaranir/);
});

test('greinargerðin ber alltaf drög-fyrirvarann og virkar ÁN túlkunar', () => {
  const h = greinargerdHtml(greinargerdSamhengi(W, STATES, ADV, TONN, []), null, 1754000000);
  assert.ok(h.includes(GREINARGERD_FYRIRVARI.slice(0, 40)));
  assert.match(h, /ekki tiltæk — kaflar 1–6 standa sjálfstætt/);
  assert.match(h, /Önnur refsiverð háttsemi/);
  assert.match(h, /Afturkalla leyfi/);
});

test('túlkunin er HTML-escapeuð — LLM-texti getur aldrei sprautað markup', () => {
  const c = greinargerdSamhengi(W, STATES, [], [], []);
  const h = greinargerdHtml(c, 'Túlkun & mat: allt "eðlilegt" að sjá.', 1754000000);
  assert.match(h, /Túlkun &amp; mat/);
});

test('tón-sviðin heita ÓTVÍRÆTT — fyrsta raun-greinargerðin las `tonn` sem tonnatölu afla', () => {
  const c = greinargerdSamhengi(W, STATES, [], [{ man: '2026-02', n: 3, tonn: -0.5 }], []);
  assert.deepEqual(c.tonn[0], { man: '2026-02', frettir: 3, medaltonn_fjolmidla: -0.5 });
  const h = greinargerdHtml(c, null, 1754000000);
  assert.match(h, /fjöldi frétta.*2026-02 \(3\)/);
});

// ══════════════════════════════════════════════════════════════════════════
// AUÐGUN 3.9.2026 — greinargerðin var jafn þunn og ÓKEYPIS upplettingin.
//
// Mælt á einu raun-greinargerðinni sem til var (Brim): 778 stafir úr 587 stafa samhengi.
// Orsökin var ekki gagnaskortur heldur að samhengið sótti aðeins hluta þess sem þegar var
// skimað: `board` og `media` voru geymd í kyc_snapshot en lesin hvergi, `skil_vanskil` bar
// ártölin ein og henti vanskila-flagginu, og ~1100 forbyggðir ársreikningar (velta, eigið
// fé, starfsmenn) snertu skjalið aldrei. Prófin hér festa hverja þeirra leiðréttinga.
// ══════════════════════════════════════════════════════════════════════════

// Raun-uppbygging úr web/public/gogn/arsreikningar/5411850389.json (Brim, EUR-samstæða).
const ARS_BRIM = {
  kt: '5411850389', nafn: 'Brim hf.',
  ar: {
    2024: { mynt: 'EUR', kvardi: 1000, rekstur: { sala: 380000 }, efnahagur: { eignir: 900000 } },
    2025: {
      teg: 'Samstæðureikningur', mynt: 'EUR', kvardi: 1000, starfsmenn: 661,
      kpi: { eiginfjarhlutfall: 0.5225, veltufjarhlutfall: 0.8779 },
      rekstur: { sala: 409668, hagnadur: 60001, ebitda: 90609 },
      efnahagur: { eignir: 997670, eigid_fe: 521316, skuldir: 476354 },
    },
  },
};

test('umsvif: nýjasta ár er valið og myntin fylgir — ERLEND mynt má ekki falla út', () => {
  const u = umsvifUrArsreikningi(ARS_BRIM);
  assert.equal(u.ar, '2025');
  assert.equal(u.mynt, 'EUR');            // ⚠ arsreikningurSummary sleppir ekki-ISK; hér má það ALDREI
  assert.equal(u.starfsmenn, 661);
  assert.equal(u.sala, 409668);
  assert.deepEqual(u.ar_a_skra, ['2025', '2024']);
});

test('umsvif: lysing ber allar tölurnar formaðar, með mynt og kvarða', () => {
  const u = umsvifUrArsreikningi(ARS_BRIM);
  assert.match(u.lysing, /Velta 409\.668 þús\. EUR/);
  assert.match(u.lysing, /hagnaður 60\.001 þús\. EUR/);
  assert.match(u.lysing, /eiginfjárhlutfall 52,25%/);
  assert.match(u.lysing, /661 starfsmenn/);
  assert.match(u.lysing, /\(2025, samstæðureikningur\)\.$/);
});

test('umsvif: tap er orðað sem tap, ekki neikvæður hagnaður', () => {
  const u = umsvifUrArsreikningi({ ar: { 2025: { mynt: 'ISK', kvardi: 1, rekstur: { sala: 1000, hagnadur: -250 }, efnahagur: {} } } });
  assert.match(u.lysing, /tap 250 ISK/);
  assert.ok(!/-250/.test(u.lysing), 'mínusmerkið á ekki að standa eftir í textanum');
});

test('umsvif: engin gögn → null (og greinargerðin orðar það sem fyrirvara, ekki niðurstöðu)', () => {
  assert.equal(umsvifUrArsreikningi(null), null);
  assert.equal(umsvifUrArsreikningi({ ar: {} }), null);
  assert.equal(umsvifUrArsreikningi({ ar: { 2025: { rekstur: {}, efnahagur: {} } } }), null);
  const h = greinargerdHtml(greinargerdSamhengi(W, STATES, [], [], [], { umsvif: null }), null, 1754000000);
  assert.match(h, /Fjarvera ársreiknings er ekki vísbending um rekstrarleysi/);
});

test('talna-gátin hleypir formuðu tölunum úr lysing í gegn', () => {
  // Þetta er hvers vegna `lysing` er til: gátin ber túlkunina saman við JSON-samhengið ORÐRÉTT,
  // svo „409.668" verður að standa þar. Án lysing félli hver einasta túlkun sem nefnir fjárhæð.
  const c = greinargerdSamhengi(W, STATES, [], [], [], { umsvif: umsvifUrArsreikningi(ARS_BRIM) });
  const gott = 'Félagið er í virkri skráningu. Velta 409.668 þús. EUR og 661 starfsmenn benda til raunverulegs rekstrar.';
  assert.equal(parseTulkun(gott, c), gott);
  // …og umreiknuð tala er enn felld, þótt hún sé „rétt" — 409,7 stendur hvergi í samhenginu.
  assert.equal(parseTulkun('Félagið veltir um 409,7 milljónum evra á ári samkvæmt ársreikningi.', c), null);
});

test('stjórn ratar úr board-merkinu inn í samhengið og skjalið', () => {
  const st = { ...STATES, board: { members: [{ key: 'p1', nafn: 'Guðmundur Kristjánsson', hlutverk: 'Stjórnarformaður' }] } };
  const c = greinargerdSamhengi(W, st, [], [], []);
  assert.equal(c.stjorn.medlimir.length, 1);
  assert.match(greinargerdHtml(c, null, 1754000000), /Guðmundur Kristjánsson — Stjórnarformaður/);
  // board-snapshot vantar = heimild svaraði ekki → fyrirvari, ALDREI „engin stjórn".
  assert.equal(greinargerdSamhengi(W, STATES, [], [], []).stjorn, null);
  assert.match(greinargerdHtml(greinargerdSamhengi(W, STATES, [], [], []), null, 1754000000), /stjórnar-heimild svaraði ekki/);
});

test('skil_vanskil heldur vanskila-flagginu — ártal eitt og sér segir ekkert', () => {
  const iSkilum = greinargerdSamhengi(W, { ...STATES, skil: { years: [{ ar: '2024', vanskil: 0 }] } }, [], [], []);
  assert.deepEqual(iSkilum.skimanir.skil_vanskil, [{ ar: '2024', vanskil: false }]);
  assert.match(greinargerdHtml(iSkilum, null, 1754000000), /í skilum 2024/);
  const vanskil = greinargerdSamhengi(W, { ...STATES, skil: { years: [{ ar: '2024', vanskil: 1 }] } }, [], [], []);
  assert.match(greinargerdHtml(vanskil, null, 1754000000), /vanskil skráð 2024/);
});

test('veikar refsilista-samsvaranir eru taldar en ALDREI lagðar að jöfnu við hits', () => {
  const c = greinargerdSamhengi(W, { ...STATES, sanctions: { hits: [], veikar: [{ name: 'Brim' }, { name: 'Brim' }] } }, [], [], []);
  assert.equal(c.skimanir.refsilistar, 0);          // niðurstaðan er enn núll samsvaranir
  assert.equal(c.skimanir.refsilistar_veikar, 2);
  const h = greinargerdHtml(c, null, 1754000000);
  assert.match(h, /0 samsvaranir/);
  assert.match(h, /ÓSTAÐFESTAR og teljast ekki niðurstaða/);
});

test('auðkennis-reitirnir úr felog birtast í kafla 1', () => {
  const st = { ...STATES, status: { ...STATES.status, form: 'Hlutafélag', skraning: '1985-11-05', isat: '03.11.0 Sjávarútvegur', hlutafe: 20083000, mynt: 'ISK' } };
  const h = greinargerdHtml(greinargerdSamhengi(W, st, [], [], []), null, 1754000000);
  assert.match(h, /Rekstrarform: Hlutafélag/);
  assert.match(h, /Skráð: 1985-11-05/);
  assert.match(h, /Sjávarútvegur/);
  assert.match(h, /20\.083\.000 ISK/);
});

test('LEYFISSKYLDU-LÍNAN: umsvifa-kaflinn ber fyrirvarann og enga afleidda einkunn', () => {
  const h = greinargerdHtml(greinargerdSamhengi(W, STATES, [], [], [], { umsvif: umsvifUrArsreikningi(ARS_BRIM) }), null, 1754000000);
  assert.match(h, /endurbirtar orðrétt úr ársreikningi/);
  assert.match(h, /hvorki í sér lánshæfiseinkunn, greiðslumat né vanskilaupplýsingar/);
  assert.match(h, /8\. gr\. laga nr\. 140\/2018/);
  // Enginn bókstafur, stig eða röðun má laumast inn í kaflann.
  const kafli = h.split('5. Umfang rekstrar')[1].split('<h4>')[0];
  assert.ok(!/lánshæfiseinkunn:|einkunn [A-E]\b|stig \d|áhættuflokkur/i.test(kafli), 'afleidd einkunn í umsvifa-kafla');
});

test('óflokkuð neikvæð umfjöllun (media) birtist aðgreind frá FATF-flokkaðri', () => {
  const c = greinargerdSamhengi(W, { ...STATES, media: { titles: [{ h: 'x', title: 'Harðort bréf til félagsins' }] } }, ADV, [], []);
  const h = greinargerdHtml(c, null, 1754000000);
  assert.match(h, /Óflokkuð neikvæð umfjöllun/);
  assert.match(h, /Harðort bréf til félagsins/);
  assert.match(h, /Önnur refsiverð háttsemi/);      // FATF-lagið stendur áfram sér
});

test('skjalið ber alla sjö kaflana í réttri röð', () => {
  const c = greinargerdSamhengi(W, { ...STATES, board: { members: [] }, media: { titles: [] } }, ADV, TONN, [], { umsvif: umsvifUrArsreikningi(ARS_BRIM) });
  const h = greinargerdHtml(c, 'Samantekt sem nefnir engar tölur og stenst gátina fínt.', 1754000000);
  const nr = [...h.matchAll(/<h4>(\d)\./g)].map((m) => m[1]);
  assert.deepEqual(nr, ['1', '2', '3', '4', '5', '6', '7']);
  assert.equal(KAFLAR.length, 7);
  assert.match(h, /kg-fyrirvari/);
  assert.ok(h.includes(GREINARGERD_FYRIRVARI));
});

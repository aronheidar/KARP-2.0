import test from 'node:test';
import assert from 'node:assert/strict';
import { erLogadili, greinargerdSamhengi, greinargerdHash, parseTulkun, greinargerdHtml, GREINARGERD_FYRIRVARI } from './kyc-greinargerd.mjs';

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
  assert.equal(parseTulkun('x'.repeat(1500), c), null);
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
  assert.match(h, /ekki tiltæk — kaflar 1–4 standa sjálfstætt/);
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

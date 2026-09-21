import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _saekjaStrauma, _straumaHeilsa, newsIngest } from './cron.mjs';

// ══════════════════════════════════════════════════════════════════════════
// RAUNTILFELLI 21.9.2026
//
// VB-straumurinn skilaði ENGU frá 4.9 og enginn tók eftir því í 18 daga. Fiskifréttir, sem bætt
// var við 13.9, skiluðu aldrei einni röð. Straumarnir svöruðu þó eðlilega bæði af vél Arons og
// af jaðri Cloudflare í prófi, og þáttarinn las 150 fréttir úr þeim. Sóknin gleypti allar villur
// (`r.ok ? … : []`, `catch → []`), svo bilaður straumur leit nákvæmlega eins út og straumur sem
// hafði ekkert nýtt að segja. Þessi próf verja að bilun SJÁIST og að hún sé rétt flokkuð.
// ══════════════════════════════════════════════════════════════════════════

const IDAG = new Date().toUTCString();
const GAMALT = new Date(Date.now() - 30 * 86400e3).toUTCString();
const rss = (items) => '<?xml version="1.0"?><rss version="2.0"><channel><title>Miðill</title>'
  + items.map(([t, u, d]) => `<item><title>${t}</title><link>${u}</link><pubDate>${d || IDAG}</pubDate></item>`).join('')
  + '</channel></rss>';

/** Stubbar fetch eftir slóð. Gildi: Response, fall (fær opt) eða Error sem kastast. */
function stubFetch(t, svor) {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opt) => {
    const s = svor[String(url)];
    if (s === undefined) throw new Error('óvænt fetch: ' + url);
    if (s instanceof Error) throw s;
    return typeof s === 'function' ? s(opt) : s.clone();
  };
  t.after(() => { globalThis.fetch = orig; });
}

const A = 'https://a.is/rss', B = 'https://b.is/rss';

test('403 er skráð sem http-villa með stöðu og gagnaveri, og fellir ekki hina straumana', async (t) => {
  stubFetch(t, {
    [A]: new Response('<html>Forbidden</html>', { status: 403, headers: { 'cf-ray': 'abc123-SIN', 'cf-mitigated': 'challenge' } }),
    [B]: new Response(rss([['Frétt B', 'https://b.is/1']])),
  });
  const { items, heilsa } = await _saekjaStrauma([[A, 'A'], [B, 'B']]);
  const a = heilsa.find((h) => h.url === A);
  assert.equal(a.status, 403);
  assert.equal(a.villa, 'http');
  assert.equal(a.ray, 'abc123-SIN', 'gagnaverið sem svaraði verður að sjást — cron keyrir víða um heim');
  assert.equal(a.hindrun, 'challenge', 'Cloudflare-lokun hjá miðlinum verður að greinast frá venjulegu 403');
  assert.equal(a.syni, '<html>Forbidden</html>', 'hvað kom til baka er sönnunargagnið — WAF-lokun án cf-mitigated lítur annars út eins og hvert 403');
  assert.match(a.ct, /text\/plain|text\/html/);
  assert.ok(Number.isFinite(a.ms));
  assert.deepEqual(items.map((x) => x.title), ['Frétt B']);
  assert.equal(heilsa.find((h) => h.url === B).villa, '');
  assert.equal(heilsa.find((h) => h.url === B).syni, undefined, 'heilbrigður straumur ber ekki sýnishorn');
});

test('tengingarvilla er net, ekki þögn, og villuboðin fylgja', async (t) => {
  // 'net' getur verið of mörg undirköll, rofin tenging, tilvísanalykkja eða TLS. Aðeins boðin greina á milli.
  stubFetch(t, { [A]: new TypeError('Too many subrequests.') });
  const { heilsa } = await _saekjaStrauma([[A, 'A']]);
  assert.equal(heilsa[0].villa, 'net');
  assert.equal(heilsa[0].status, 0);
  assert.equal(heilsa[0].melding, 'Too many subrequests.');
});

// { timeout } svo afturför (tímamörkin fjarlægð) FELLI prófið í stað þess að láta CI hanga.
test('hangandi straumur fellur á tímamörkum í stað þess að halda allri keðjunni', { timeout: 5000 }, async (t) => {
  stubFetch(t, {
    [A]: (opt) => new Promise((_, hafna) => opt.signal.addEventListener('abort', () => hafna(opt.signal.reason))),
    [B]: new Response(rss([['Frétt B', 'https://b.is/1']])),
  });
  const { items, heilsa } = await _saekjaStrauma([[A, 'A'], [B, 'B']], { timamork: 30 });
  assert.equal(heilsa[0].villa, 'timamork');
  assert.equal(items.length, 1, 'hinn straumurinn skilar sínu þrátt fyrir hangandi nágranna');
});

test('200 sem er ekki RSS (t.d. áskorunarsíða) er sniðvilla, ekki „ekkert nýtt"', async (t) => {
  stubFetch(t, { [A]: new Response('<!DOCTYPE html><title>Just a moment...</title>') });
  const { heilsa } = await _saekjaStrauma([[A, 'A']]);
  assert.equal(heilsa[0].status, 200);
  assert.equal(heilsa[0].n, 0);
  assert.equal(heilsa[0].villa, 'snid');
  assert.match(heilsa[0].syni, /Just a moment/, 'sniðvilla verður að segja HVAÐ kom í staðinn');
});

test('straumur með aðeins gömlum fréttum er úreltur (frosinn straumur, eins og Mannlíf)', async (t) => {
  stubFetch(t, { [A]: new Response(rss([['Gömul', 'https://a.is/1', GAMALT]])) });
  const { items, heilsa } = await _saekjaStrauma([[A, 'A']]);
  assert.equal(heilsa[0].n, 1);
  assert.equal(heilsa[0].ferskt, 0);
  assert.equal(heilsa[0].villa, 'urelt');
  assert.equal(items.length, 0);
});

test('Fiskifréttir í aðalstraumi VB fá Fiskifréttir-merkið, óháð röð strauma', async (t) => {
  // Aðalstraumur VB bar 24 greinar Fiskifrétta af 150 þann 21.9. Afritunarvörnin heldur fyrsta
  // eintaki, og VB-straumurinn ber alltaf nýjustu greinarnar, svo án hýsilmerkingar hefðu nær allar
  // nýjar Fiskifréttir lent á VB.
  const VB = 'https://vb.is/rss/', FI = 'https://vb.is/rss/fiskifrettir/';
  const grein = ['Hvalveiðivertíðinni er lokið', 'https://fiskifrettir.vb.is/hvalveidivertidinni-er-lokid/'];
  stubFetch(t, {
    [VB]: new Response(rss([grein, ['Yfirlýsing Icelandair', 'https://www.vb.is/frettir/yfirlysing-icelandair/']])),
    [FI]: new Response(rss([grein])),
  });
  for (const rod of [[[VB, 'Viðskiptablaðið'], [FI, 'Fiskifréttir']], [[FI, 'Fiskifréttir'], [VB, 'Viðskiptablaðið']]]) {
    const { items } = await _saekjaStrauma(rod);
    const eftirTitli = Object.fromEntries(items.map((x) => [x.title, x.source]));
    assert.equal(items.length, 2, 'sama grein úr báðum straumum telst einu sinni');
    assert.equal(eftirTitli['Hvalveiðivertíðinni er lokið'], 'Fiskifréttir');
    assert.equal(eftirTitli['Yfirlýsing Icelandair'], 'Viðskiptablaðið');
  }
});


test('fréttir án hlekks eru ekki nothæfar — straumurinn er sniðvilla, ekki heilbrigður', async (t) => {
  // newsIngest sleppir frétt án slóðar, svo straumur þar sem ENGIN ber hlekk skilar núll röðum í grunninn.
  stubFetch(t, { [A]: new Response(`<rss><channel><item><title>Án hlekks</title><pubDate>${IDAG}</pubDate></item><item><title>Líka án</title></item></channel></rss>`) });
  const { heilsa } = await _saekjaStrauma([[A, 'A']]);
  assert.equal(heilsa[0].n, 2);
  assert.equal(heilsa[0].anHlekks, 2);
  assert.equal(heilsa[0].villa, 'snid');
});

test('fréttir án dagsetningar teljast ferskar (þær fara inn með innlestrartíma)', async (t) => {
  // Fest svo breyting á þessu verði meðvituð. Afleiðingin: frosinn straumur án dagsetninga sést aldrei sem 'urelt'.
  stubFetch(t, { [A]: new Response('<rss><channel><item><title>Ódagsett</title><link>https://a.is/1</link></item></channel></rss>') });
  const { heilsa } = await _saekjaStrauma([[A, 'A']]);
  assert.equal(heilsa[0].ferskt, 1);
  assert.equal(heilsa[0].villa, '');
});

test('heilsuskrá: hrina heldur upphafi sínu, bati núllstillir, saga með gagnaveri, fjarlægður straumur hverfur', () => {
  const villa = { url: A, src: 'A', status: 403, n: 0, ferskt: 0, villa: 'http', ray: 'x-SIN', syni: 'Forbidden', ms: 80 };
  const ok = { url: A, src: 'A', status: 200, n: 5, ferskt: 5, villa: '', ray: 'x-DUB', ms: 40 };

  const s1 = _straumaHeilsa(null, [villa], 1000);
  assert.equal(s1[A].bilunFra, 1000);
  assert.equal(s1[A].sidastOk, 0, 'aldrei virkað síðan mæling hófst');
  assert.equal(s1[A].syni, 'Forbidden', 'ÖLL heilsusvið fara í skrána — sviðalisti hefði þagað um ný svið');
  assert.equal(s1[A].url, undefined, 'slóðin er lykillinn, ekki svið');
  assert.deepEqual(s1[A].saga, [[1000, 'SIN', 'http']]);

  const s2 = _straumaHeilsa(s1, [villa], 4000);
  assert.equal(s2[A].bilunFra, 1000, 'hrinan byrjaði í fyrstu keyrslunni, ekki þeirri nýjustu');

  const s3 = _straumaHeilsa(s2, [ok], 7000);
  assert.equal(s3[A].bilunFra, 0);
  assert.equal(s3[A].sidastOk, 7000);
  assert.equal(s3[A].syni, undefined, 'sýnishorn úr bilun loðir ekki við eftir bata');
  assert.deepEqual(s3[A].saga, [[1000, 'SIN', 'http'], [4000, 'SIN', 'http'], [7000, 'DUB', '']],
    'bili straumur aðeins í sumum gagnaverum sést það í sögunni, ekki í einni mynd');

  const s4 = _straumaHeilsa(s3, [villa], 9000);
  assert.equal(s4[A].bilunFra, 9000, 'ný hrina eftir bata byrjar upp á nýtt');
  assert.equal(s4[A].sidastOk, 7000);

  let s = s4;
  for (let i = 0; i < 10; i++) s = _straumaHeilsa(s, [ok], 10000 + i);
  assert.equal(s[A].saga.length, 8, 'sagan er takmörkuð svo skráin vaxi ekki');
  assert.deepEqual(s[A].saga.at(-1), [10009, 'DUB', '']);

  assert.deepEqual(Object.keys(_straumaHeilsa(s4, [], 9500)), [], 'straumur af listanum vekur ekki viðvörun að eilífu');
});

/** D1-hermir fyrir newsIngest: INSERT OR IGNORE á url, batch, og stjorn_sync með stikuðum lykli.
 *  `st.batchFellur` og `st.lesturBregst` má breyta á milli keyrslna. */
function fakeD1({ sync = {} } = {}) {
  const news = new Set();
  const st = { news, sync, vistanir: 0, batchFellur: false, lesturBregst: false };
  const prep = (sql) => {
    const mk = (args) => ({
      sql, args,
      bind: (...a) => mk(a),
      async first() {
        if (/^SELECT v FROM stjorn_sync WHERE k=\?$/.test(sql)) {
          if (st.lesturBregst) throw new Error('D1_ERROR: lestur');
          return sync[args[0]] != null ? { v: sync[args[0]] } : null;
        }
        throw new Error('fakeD1 first: ' + sql);
      },
      async run() {
        if (/^DELETE FROM news/.test(sql)) return { meta: { changes: 0 } };
        if (/^INSERT INTO stjorn_sync \(k, v, updated\) VALUES \(\?, \?, \?\)/.test(sql)) { sync[args[0]] = args[1]; st.vistanir++; return { meta: {} }; }
        throw new Error('fakeD1 run: ' + sql);
      },
    });
    return mk([]);
  };
  return {
    st,
    db: {
      prepare: prep,
      async batch(stmts) {
        if (st.batchFellur) throw new Error('D1_ERROR: SQLITE_CONSTRAINT');
        return stmts.map((s) => { const u = s.args[0]; if (news.has(u)) return { meta: { changes: 0 } }; news.add(u); return { meta: { changes: 1 } }; });
      },
    },
  };
}

/** Svarar ÖLLUM raunstraumum NEWS_FEEDS (fasti): tilgreindir fá sitt, hinir tómt RSS. */
function stubStrauma(t, svor) {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => { const s = svor[String(url)]; return s ? s.clone() : new Response(rss([])); };
  t.after(() => { globalThis.fetch = orig; });
}

/** Stýranleg klukka. Aðeins Date.now færist, svo dagsetningar fréttanna (new Date()) haldast ferskar. */
function klukka(t) {
  const orig = Date.now;
  let nu = orig();
  Date.now = () => nu;
  t.after(() => { Date.now = orig; });
  return { fram: (sek) => { nu += sek * 1000; }, sek: () => Math.floor(nu / 1000) };
}

test('newsIngest skráir heilsu og nýjar raðir per miðil, og hrinan lifir á milli keyrslna', async (t) => {
  const k = klukka(t);
  const { st, db } = fakeD1();
  stubStrauma(t, {
    'https://vb.is/rss/': new Response('<html>Forbidden</html>', { status: 403, headers: { 'cf-ray': 'r1-SIN' } }),
    'https://heimildin.is/rss/': new Response(rss([['H1', 'https://heimildin.is/1'], ['H2', 'https://heimildin.is/2']])),
  });
  const svar = await newsIngest({ TENGSL: db });
  assert.equal(svar.innsett.Heimildin, 2);
  assert.equal(svar.batchVillur, 0);
  assert.equal(svar.straumar.find((h) => h.url === 'https://vb.is/rss/').status, 403);

  const vb1 = JSON.parse(st.sync.frettastraumar).straumar['https://vb.is/rss/'];
  assert.equal(vb1.villa, 'http');
  assert.equal(vb1.bilunFra, k.sek());
  assert.equal(vb1.syni, '<html>Forbidden</html>', 'sönnunargagnið kemst alla leið í D1');
  assert.deepEqual(vb1.saga, [[k.sek(), 'SIN', 'http']]);
  const skra1 = JSON.parse(st.sync.frettastraumar);
  assert.equal(skra1.straumar['https://heimildin.is/rss/'].bilunFra, 0);
  assert.equal(skra1.straumar['https://www.dv.is/feed/'].villa, 'snid', 'tómur straumur er EKKI talinn heilbrigður');

  // Önnur keyrsla ÞREMUR KLST SÍÐAR. ⚠ Keyrðu báðar á sömu sekúndu stæðist prófið þótt fyrri staða væri
  //   aldrei lesin (bilunFra = nú = sama tala), og þá færi viðvörunin aldrei af stað í framleiðslu.
  const fyrsta = k.sek();
  k.fram(3 * 3600);
  const svar2 = await newsIngest({ TENGSL: db });
  assert.equal(svar2.innsett.Heimildin, 0, 'sömu fréttir eru þegar til');
  const vb2 = JSON.parse(st.sync.frettastraumar).straumar['https://vb.is/rss/'];
  assert.equal(vb2.bilunFra, fyrsta, 'hrinan byrjaði í fyrri keyrslunni');
  assert.notEqual(vb2.bilunFra, k.sek());
  assert.equal(vb2.saga.length, 2);
});

test('nýjar raðir eru eignaðar réttum miðli yfir 40-staka mörk batch-anna', async (t) => {
  // Heimildin kemur á undan DV í NEWS_FEEDS: batch 1 = 40 Heimildin, batch 2 = 5 Heimildin + 5 DV.
  const { db } = fakeD1();
  const H = Array.from({ length: 45 }, (_, i) => ['Heimildin ' + i, 'https://heimildin.is/' + i]);
  const D = Array.from({ length: 5 }, (_, i) => ['DV ' + i, 'https://www.dv.is/' + i]);
  stubStrauma(t, { 'https://heimildin.is/rss/': new Response(rss(H)), 'https://www.dv.is/feed/': new Response(rss(D)) });
  const svar = await newsIngest({ TENGSL: db });
  assert.equal(svar.innsett.Heimildin, 45);
  assert.equal(svar.innsett.DV, 5);
});

test('lestur sem bregst vistar EKKI ofan á skrána — sex daga hrina lifir af', async (t) => {
  const k = klukka(t);
  const fyrir = JSON.stringify({ ts: k.sek() - 3 * 3600, straumar: { 'https://vb.is/rss/': { src: 'Viðskiptablaðið', villa: 'http', status: 403, bilunFra: k.sek() - 6 * 86400, sidastOk: 0, saga: [] } } });
  const { st, db } = fakeD1({ sync: { frettastraumar: fyrir } });
  st.lesturBregst = true;
  stubStrauma(t, { 'https://vb.is/rss/': new Response('x', { status: 403 }) });
  const svar = await newsIngest({ TENGSL: db });
  assert.ok(Array.isArray(svar.straumar), 'greiningin skilar sér samt í svarinu');
  assert.equal(st.vistanir, 0);
  assert.equal(st.sync.frettastraumar, fyrir, 'síðasta góða mynd stendur óbreytt');
});

test('handvirk keyrsla skrifar í eigin lykil og snertir ekki skrá cron-sins', async (t) => {
  const k = klukka(t);
  const cronSkra = JSON.stringify({ ts: k.sek(), straumar: { 'https://vb.is/rss/': { src: 'Viðskiptablaðið', villa: 'http', status: 403, bilunFra: k.sek() - 2 * 86400, saga: [] } } });
  const { st, db } = fakeD1({ sync: { frettastraumar: cronSkra } });
  // VB svarar í gagnaveri Arons. Skrifaði sú keyrsla í skrá cron-sins núllaðist hrinan.
  stubStrauma(t, { 'https://vb.is/rss/': new Response(rss([['V1', 'https://www.vb.is/frettir/v1/']])) });
  await newsIngest({ TENGSL: db }, { handvirkt: true });
  assert.equal(st.sync.frettastraumar, cronSkra, 'hrinan úr cron stendur');
  assert.equal(JSON.parse(st.sync.frettastraumar_handvirkt).straumar['https://vb.is/rss/'].villa, '');
});

test('föllnar innsetningar: talning, villuboð, og hrina sem lifir á milli keyrslna og núllast við bata', async (t) => {
  const k = klukka(t);
  const { st, db } = fakeD1();
  st.batchFellur = true;
  stubStrauma(t, { 'https://heimildin.is/rss/': new Response(rss([['H1', 'https://heimildin.is/1']])) });
  const svar = await newsIngest({ TENGSL: db });
  assert.equal(svar.batchVillur, 1, 'straumurinn skilaði en ekkert komst í grunninn — það verður að sjást');
  assert.equal(svar.innsett.Heimildin || 0, 0);
  assert.match(svar.batchMelding, /SQLITE_CONSTRAINT/);
  const fyrsta = k.sek();
  assert.equal(JSON.parse(st.sync.frettastraumar).innsetningBilunFra, fyrsta);

  k.fram(3 * 3600);
  await newsIngest({ TENGSL: db });
  assert.equal(JSON.parse(st.sync.frettastraumar).innsetningBilunFra, fyrsta, 'hrinan heldur upphafi sínu');

  st.batchFellur = false;
  k.fram(3 * 3600);
  await newsIngest({ TENGSL: db });
  const skra = JSON.parse(st.sync.frettastraumar);
  assert.equal(skra.innsetningBilunFra, 0);
  assert.equal(skra.batchMelding, undefined);
});

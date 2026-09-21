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
  assert.deepEqual(items.map((x) => x.title), ['Frétt B']);
  assert.equal(heilsa.find((h) => h.url === B).villa, '');
});

test('tengingarvilla er net, ekki þögn', async (t) => {
  stubFetch(t, { [A]: new TypeError('fetch failed') });
  const { heilsa } = await _saekjaStrauma([[A, 'A']]);
  assert.equal(heilsa[0].villa, 'net');
  assert.equal(heilsa[0].status, 0);
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

test('heilsuskrá: bilanahrina heldur upphafi sínu, bati núllstillir, fjarlægður straumur hverfur', () => {
  const villa = { url: A, src: 'A', status: 403, n: 0, ferskt: 0, villa: 'http', ray: 'x-SIN' };
  const ok = { url: A, src: 'A', status: 200, n: 5, ferskt: 5, villa: '', ray: 'x-DUB' };

  const s1 = _straumaHeilsa(null, [villa], 1000);
  assert.equal(s1[A].bilunFra, 1000);
  assert.equal(s1[A].sidastOk, 0, 'aldrei virkað síðan mæling hófst');

  const s2 = _straumaHeilsa(s1, [villa], 4000);
  assert.equal(s2[A].bilunFra, 1000, 'hrinan byrjaði í fyrstu keyrslunni, ekki þeirri nýjustu');

  const s3 = _straumaHeilsa(s2, [ok], 7000);
  assert.equal(s3[A].bilunFra, 0);
  assert.equal(s3[A].sidastOk, 7000);

  const s4 = _straumaHeilsa(s3, [villa], 9000);
  assert.equal(s4[A].bilunFra, 9000, 'ný hrina eftir bata byrjar upp á nýtt');
  assert.equal(s4[A].sidastOk, 7000);

  assert.deepEqual(Object.keys(_straumaHeilsa(s4, [], 9500)), [], 'straumur af listanum vekur ekki viðvörun að eilífu');
});

/** D1-hermir fyrir newsIngest: INSERT OR IGNORE á url, batch, og stjorn_sync. */
function fakeD1({ fyrir = [], batchFellur = false, sync = {} } = {}) {
  const news = new Map(fyrir.map((u) => [u, true]));
  const st = { news, sync, batchKoll: 0 };
  const prep = (sql) => {
    const mk = (args) => ({
      sql, args,
      bind: (...a) => mk(a),
      async first() {
        if (/SELECT v FROM stjorn_sync WHERE k='frettastraumar'/.test(sql)) return sync.frettastraumar ? { v: sync.frettastraumar } : null;
        throw new Error('fakeD1 first: ' + sql);
      },
      async run() {
        if (/^DELETE FROM news/.test(sql)) return { meta: { changes: 0 } };
        if (/^INSERT INTO stjorn_sync .*'frettastraumar'/.test(sql)) { sync.frettastraumar = args[0]; return { meta: {} }; }
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
        st.batchKoll++;
        if (batchFellur) throw new Error('D1_ERROR');
        return stmts.map((s) => { const u = s.args[0]; if (news.has(u)) return { meta: { changes: 0 } }; news.set(u, true); return { meta: { changes: 1 } }; });
      },
    },
  };
}

test('newsIngest skráir heilsu hvers straums og nýjar raðir per miðil', async (t) => {
  // NEWS_FEEDS er fasti, svo hér er öllum raunstraumunum svarað: VB bilar, allir hinir tómir.
  const { st, db } = fakeD1({ fyrir: ['https://www.vb.is/frettir/gomul/'] });
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u === 'https://vb.is/rss/') return new Response('<html>Forbidden</html>', { status: 403, headers: { 'cf-ray': 'r-SIN' } });
    if (u === 'https://heimildin.is/rss/') return new Response(rss([['H1', 'https://heimildin.is/1'], ['H2', 'https://heimildin.is/2']]));
    return new Response(rss([]));
  };
  t.after(() => { globalThis.fetch = orig; });

  const svar = await newsIngest({ TENGSL: db });
  assert.equal(svar.innsett.Heimildin, 2);
  assert.equal(svar.batchVillur, 0);
  const vb = svar.straumar.find((h) => h.url === 'https://vb.is/rss/');
  assert.equal(vb.status, 403);

  const skra = JSON.parse(st.sync.frettastraumar);
  assert.equal(skra.straumar['https://vb.is/rss/'].villa, 'http');
  assert.ok(skra.straumar['https://vb.is/rss/'].bilunFra > 0);
  assert.equal(skra.straumar['https://heimildin.is/rss/'].bilunFra, 0);
  assert.equal(skra.straumar['https://www.dv.is/feed/'].villa, 'snid', 'tómur straumur er EKKI talinn heilbrigður');

  // Önnur keyrsla: sömu fréttir eru þegar til, svo 0 nýjar, og VB-hrinan heldur upphafi sínu.
  const fyrstaBilun = skra.straumar['https://vb.is/rss/'].bilunFra;
  const svar2 = await newsIngest({ TENGSL: db });
  assert.equal(svar2.innsett.Heimildin, 0);
  assert.equal(JSON.parse(st.sync.frettastraumar).straumar['https://vb.is/rss/'].bilunFra, fyrstaBilun);
});

test('newsIngest telur föllnar innsetningar í stað þess að gleypa þær', async (t) => {
  const { db } = fakeD1({ batchFellur: true });
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => String(url) === 'https://heimildin.is/rss/'
    ? new Response(rss([['H1', 'https://heimildin.is/1']])) : new Response(rss([]));
  t.after(() => { globalThis.fetch = orig; });
  const svar = await newsIngest({ TENGSL: db });
  assert.equal(svar.batchVillur, 1, 'straumurinn skilaði en ekkert komst í grunninn — það verður að sjást');
  assert.equal(svar.innsett.Heimildin || 0, 0);
});

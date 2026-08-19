// greidslur.mjs — klofið úr worker.js 30.7.2026 (úttekt C10). Föllin eru ÓBREYTT;
// aðeins flutt milli skráa + import/export bætt við. Sjá docs/uttekt/2026-07-30-worker-klofningur-aaetlun.md

import { _acctOfUid, grantReportD1, grantSubD1, readSession, trialUsedD1 } from './auth.mjs';
import { sjson } from './felag.mjs';
import { karpUserId } from './auth.mjs';

async function teyaHmacHex(secret, msg) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(msg));
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function teyaOrderId() {
  // ≤12 alstafa, engir extended stafir (krafa SecurePay)
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 1679616).toString(36).padStart(4, '0');
  return (t + r).slice(-12).toUpperCase().replace(/[^0-9A-Z]/g, '0');
}

function teyaConfigured(env) { return !!(env.TEYA_MERCHANT_ID && env.TEYA_GATEWAY_ID && env.TEYA_SECRET_KEY); }
// Auðkennir kaupanda: framsendir innskráningar-kökuna á WP /me → WP userid (0 ef óinnskráð/villa).
// Kakan lifir á .karp.is (COOKIE_DOMAIN) svo hún berst til worker-sins með credentials:'include'.
// F4: notanda-auðkenni úr WORKER-lotu (karp_session, D1) — leysir WP /me af hólmi.

async function trialUsedFor(env, uid, kind, slug) {   // F4: prufuvörn úr D1 (ekki WP)
  return await trialUsedD1(env, uid, kind, slug);
}

const notrialChannel = (env, slug) => env['ASKELL_CHANNEL_' + String(slug).toUpperCase() + '_NOTRIAL'] || null;

export async function payCheckoutHandler(request, env, ctx) {
  if (request.method !== 'POST') return sjson({ error: 'post' });
  // óuppsett (engin secrets) EÐA öryggisrofi óvirkur → framendi notar ókeypis prentleiðina
  if (!teyaConfigured(env) || env.TEYA_LIVE !== '1') return sjson({ error: 'unconfigured' });
  const uid = await karpUserId(request, env);   // þarf innskráningu svo kaupið vistist á Mitt svæði
  if (!uid) return sjson({ error: 'login' });
  let b = {}; try { b = (await request.json()) || {}; } catch (e) {}
  const kind = ['fyrirtaeki', 'eigendur', 'fasteign', 'thingmadur'].includes(b.kind) ? b.kind : 'fasteign';
  const ref = String(b.ref || '').slice(0, 80);
  const key = String(b.key || (kind + ':' + ref)).slice(0, 80);
  const price = Math.round(+(kind === 'fyrirtaeki' ? env.PRICE_FYRIRTAEKI : kind === 'eigendur' ? env.PRICE_EIGENDUR : kind === 'thingmadur' ? env.PRICE_THINGMADUR : env.PRICE_FASTEIGN) || 990);
  if (!(price > 0)) return sjson({ error: 'free' });
  const amount = String(price);   // ISK heiltala
  const currency = 'ISK';
  const orderid = teyaOrderId();
  const origin = 'https://karp.is';
  // amount+currency fest í skila-slóðina (hluti af checkhash → traust, ekki hægt að falsa) svo callback
  // geti sannreynt orderhash=HMAC(orderid|amount|currency) — SecurePay skilar EKKI amount/currency í POST.
  const q = '?o=' + encodeURIComponent(orderid) + '&k=' + encodeURIComponent(key) + '&t=' + kind + '&u=' + uid + '&a=' + encodeURIComponent(amount) + '&cur=' + currency;
  const returnurlsuccess = origin + '/api/pay/return' + q;
  const returnurlsuccessserver = origin + '/api/pay/callback' + q;
  const returnurlcancel = origin + '/api/pay/return' + q + '&x=1';
  const merchantid = env.TEYA_MERCHANT_ID;
  // checkhash — bætin verða að stemma NÁKVÆMLEGA við reitina sem sendir eru (sömu strengir)
  const msg = [merchantid, returnurlsuccess, returnurlsuccessserver, orderid, amount, currency].join('|');
  const checkhash = await teyaHmacHex(env.TEYA_SECRET_KEY, msg);
  const action = (env.TEYA_ENV === 'dev' ? 'https://test.borgun.is' : 'https://securepay.borgun.is') + '/SecurePay/default.aspx';
  const desc = kind === 'fyrirtaeki' ? 'Karp fyrirtaekjaskyrsla' : kind === 'eigendur' ? 'Karp eigendaskyrsla' : kind === 'thingmadur' ? 'Karp thingmannaskyrsla' : 'Karp verdmatsskyrsla';
  // Reitir speglaðir eftir virkri WooCommerce-Teya viðbót: SecurePay krefst lína-liða + pagetype/skipreceiptpage.
  // checkhash nær AÐEINS yfir merchantid|url|url|orderid|amount|currency → lína-liðir/pagetype breyta honum ekki.
  return sjson({
    ok: true, action,
    fields: {
      merchantid, paymentgatewayid: env.TEYA_GATEWAY_ID, orderid, amount, currency, language: 'IS',
      checkhash, returnurlsuccess, returnurlsuccessserver, returnurlcancel, returnurlerror: returnurlcancel,
      reference: orderid, pagetype: '0', skipreceiptpage: '0',
      itemdescription_0: desc, itemcount_0: '1', itemunitamount_0: amount, itemamount_0: amount,
    },
  });
}

export async function payReturnHandler(request, env, ctx) {
  const u = new URL(request.url);
  const o = u.searchParams.get('o') || '', k = u.searchParams.get('k') || '', t = u.searchParams.get('t') || '';
  // Árangur vs afbókun ræðst af SLÓÐINNI (x=1 = cancel/error), EKKI af POST-status: „Til baka í verslun"
  // (Confirmation-skref) sendir ekki alltaf status='Ok' → lenti ranglega á cancel-síðunni.
  const ok = u.searchParams.get('x') !== '1';
  const dest = '/kaup/?s=' + (ok ? 'ok' : 'cancel') + '&o=' + encodeURIComponent(o) + '&k=' + encodeURIComponent(k) + '&t=' + encodeURIComponent(t);
  return new Response(null, { status: 302, headers: { location: dest } });
}

export async function payCallbackHandler(request, env, ctx) {
  if (!teyaConfigured(env)) return new Response('unconfigured', { status: 200 });
  const u = new URL(request.url);
  const orderid = u.searchParams.get('o') || '';
  const amount = u.searchParams.get('a') || '';        // úr skila-slóð — SecurePay skilar EKKI amount/currency í POST
  const currency = u.searchParams.get('cur') || 'ISK';
  let orderhash = '';
  try { const fd = await request.formData(); orderhash = String(fd.get('orderhash') || ''); } catch (e) {}
  // Gilt orderhash = staðfest greiðsla (Teya kallar successserver AÐEINS við árangur) → treystum því,
  // ekki status-reit (casing/step ótraust; gæti hafa blokkað grant áður). orderhash = svindl-vörnin.
  const expect = await teyaHmacHex(env.TEYA_SECRET_KEY, [orderid, amount, currency].join('|'));
  if (!orderhash || orderhash.toLowerCase() !== expect) return new Response('badhash', { status: 400 });
  // Replay-vörn (#7): orderhash þekur aðeins orderid|amount|currency — EKKI u/k. Bindum því hverja orderid
  // við EINA veitingu (atómískt INSERT OR IGNORE); endurspilun sömu orderid (t.d. með öðru k) → idempotent skil.
  if (orderid && env.TENGSL) {
    const ins = await env.TENGSL.prepare('INSERT OR IGNORE INTO granted_refs (ref, created) VALUES (?,?)').bind('teya:' + orderid, Math.floor(Date.now() / 1000)).run().catch(() => null);
    if (!ins || !ins.meta || ins.meta.changes === 0) return new Response('ok', { status: 200 });   // orderid þegar unnin → engin ný grant
  }
  // ✓ Greiðsla staðfest → skrá entitlement í WP (server-til-server m/ sameiginlegu leyndarmáli).
  const uid = u.searchParams.get('u') || '';
  const key = u.searchParams.get('k') || '';
  if (uid && key && env.TENGSL) {   // F7: grant→D1 á kaupanda-uid (leysir WP af hólmi) — account-resolved (Task 5: kaup gagnast allri stofunni)
    ctx.waitUntil((async () => {
      const auid = await _acctOfUid(env, uid);
      await env.TENGSL.prepare('INSERT OR IGNORE INTO reports_granted (user_id, report_key, granted) VALUES (?,?,?)').bind(auid, key, Math.floor(Date.now() / 1000)).run().catch(() => {});
    })());
  }
  // (WP-varaleiðin fjarlægð 30.7.2026 — wp.karp.is er farið; D1-grantið að ofan er eina skráningin.)
  return new Response('ok', { status: 200 });
}

export async function askellWebhookHandler(request, env, ctx) {
  if (!env.ASKELL_WEBHOOK_SECRET) return new Response('unconfigured', { status: 200 });
  const raw = await request.text();
  const sig = request.headers.get('Hook-HMAC') || '';
  const event = request.headers.get('Hook-Event') || '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.ASKELL_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const macBuf = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  let bin = ''; for (let i = 0; i < macBuf.length; i++) bin += String.fromCharCode(macBuf[i]);
  const expect = btoa(bin);
  let diff = sig.length === expect.length ? 0 : 1;
  for (let i = 0; i < sig.length && i < expect.length; i++) diff |= sig.charCodeAt(i) ^ expect.charCodeAt(i);
  const sigOk = diff === 0 && sig.length === expect.length;   // fastatíma-samanburður (svindl-vörn)
  if (!sigOk) return new Response('badsig', { status: 401 });
  let body = {}; try { body = JSON.parse(raw); } catch (e) {}
  const ev = String(body.event || event || '');
  const d = body.data || body;   // Áskell pakkar í {event,sender,data:{...}}
  // Áskrift: subscription.* (v1) OG subscription_contract.* (v2). customer_reference = kt (VIÐ settum),
  //   þrep úr metadata.tier (áreiðanlegt — við setjum í session) EÐA vöru-nafni; aðgangur TIL period-loka.
  // ⚠ Nákvæm v2-svið staðfestast með raun test-greiðslu; les því mörg möguleg heiti varlega.
  if (ev.indexOf('subscription') >= 0 || ev.indexOf('contract') >= 0) {   // F4: grant→D1 (KARP_GRANT_SECRET óþarft)
    const sub = d.subscription || d.contract || d.subscription_contract || {};
    const cust = d.customer || sub.customer || {};
    const kt = String(d.customer_reference || d.customerReference || sub.customer_reference || cust.reference || cust.customer_reference || '').replace(/\D/g, '');
    let meta = d.metadata || d.meta || sub.metadata || sub.meta || {};
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch (e) { meta = {}; } }   // v1 sýnir "meta":"{}" (strengur)
    const nameBlob = (JSON.stringify(d.plan || d.items || d.product || d.bundle || sub.plan || sub.product || '') + ' ' + String(d.reference || sub.reference || '')).toLowerCase();
    // Sér þjónustu-áskrift (Útboðsvaktin o.fl.): metadata.service áreiðanlegt (VIÐ setjum í session);
    // vöru-nafn til vara. Slík áskrift veitir karp_sub_<svc>_until í WP — EKKI þrep.
    const ms = String(meta.service || '');
    // 'leikur' (leikstjóra-leyfi RÁS-leiksins, sjá leikstjoriOf í auth.mjs): á hvítlistanum svo Áskell-vara merkt
    // metadata.service='leikur' EÐA nefnd „Leikstjóra-leyfi" falli ALDREI niður í þreps-grant (grunnur) — rýni 19.8.
    const service = ['utbod', 'frettir', 'fasteign', 'thingskyrslur', 'kvoti', 'leikur'].indexOf(ms) >= 0 ? ms
      : (nameBlob.indexOf('útboð') >= 0 || nameBlob.indexOf('utbod') >= 0 ? 'utbod'
        : (nameBlob.indexOf('thingskyrsl') >= 0 || nameBlob.indexOf('þingmannaskýrsl') >= 0 ? 'thingskyrslur'
          : (nameBlob.indexOf('kvótavakt') >= 0 || nameBlob.indexOf('kvotavakt') >= 0 ? 'kvoti'
            : (nameBlob.indexOf('leikstjór') >= 0 || nameBlob.indexOf('leikstjor') >= 0 ? 'leikur' : ''))));
    const mt = String(meta.tier || '');
    const tier = ['grunnur', 'fyrirtaeki', 'fyrirtaeki_plus'].indexOf(mt) >= 0 ? mt
      : (nameBlob.indexOf('plus') >= 0 ? 'fyrirtaeki_plus' : (nameBlob.indexOf('fyrirt') >= 0 ? 'fyrirtaeki' : 'grunnur'));   // metadata.tier áreiðanlegt; nafn til vara
    const now = Math.floor(Date.now() / 1000);
    const endStr = d.active_until || d.current_period_end || d.next_billing_at || d.period_end || (d.current_period && d.current_period.end) || sub.active_until || sub.current_period_end || (sub.current_period && sub.current_period.end) || '';
    let until = endStr ? Math.floor(new Date(endStr).getTime() / 1000) : 0;
    if (!until || until < now) until = now + 32 * 86400;   // ⚠ vara: ef period-lok finnst ekki í v2-payloadi → mánuður frá núna (grant klárast; fínstillt þegar raun-payload sést)
    if (kt.length === 10) {   // F4: grant → D1 (ekki WP)
      const _aid = String(sub.id || d.id || '');
      const _ref = String(d.id || d.token || d.uuid || sub.id || sub.uuid || '') + '_' + until;
      ctx.waitUntil(grantSubD1(env, service ? { kt, service, until, askellId: _aid, ref: _ref } : { kt, tier, until, askellId: _aid, ref: _ref }));
    }
  }
  // ── Stakar skýrslur um Áskell (einskiptisvara): session-metadata {service:'stak', key:'fyrirtaeki:kt'…} ──
  // Hlustum vítt (payment/billing_run/contract) — nákvæmt event-heiti er óskjalfest og staðfestist í sandbox.
  // Grant er idempotent á lykli (WP dedupe) svo tvöföld event eru skaðlaus. userid leyst af kt (karp_kt).
  if (ev.indexOf('payment') >= 0 || ev.indexOf('billing_run') >= 0 || ev.indexOf('contract') >= 0) {   // F4: stök skýrsla→D1
    try {
      const sub2 = d.subscription || d.contract || d.subscription_contract || {};
      let meta2 = d.metadata || d.meta || sub2.metadata || sub2.meta || {};
      if (typeof meta2 === 'string') { try { meta2 = JSON.parse(meta2); } catch (e) { meta2 = {}; } }
      // V2-leið: session-metadata {service:'stak', key} · V1-leið (stakgreiðsla um /api/payments/):
      // engin metadata en reference-svið greiðslunnar BER stak-lykilinn sjálfan
      // reference = '<lykill>|<token-forskeyti>' (tvírukkunar-vörn) → klippa '|…' af fyrir grant-lykilinn
      const ref0 = String(d.reference || '').split('|')[0];
      const refKey = /^(fyrirtaeki|eigendur|areidanleiki|fasteign|thingmadur):.+/.test(ref0) ? ref0 : '';
      const viaMeta = String(meta2.service || '') === 'stak';
      const stakKey = viaMeta ? String(meta2.key || '') : refKey;
      const st2 = String(d.state || d.status || '');
      // V1-stakgreiðsla: veita AÐEINS við settled (pending/retrying bíða); V2: útiloka villustöður
      const okState = viaMeta ? !/fail|error|cancel/i.test(st2) : /settled/i.test(st2);
      // ⚠ V1-greiðslu-objekt ber EKKERT customer_reference (sannað 11.7) — kaupanda-kt býr aftan við '|' í reference
      const ktUrRef = (String(d.reference || '').split('|')[1] || '').replace(/\D/g, '');
      const kt2 = (String(d.customer_reference || (d.customer && d.customer.reference) || sub2.customer_reference || '').replace(/\D/g, '')) || ktUrRef;
      if (stakKey && okState && /^[a-z]+:[\w .,ÁÉÍÓÚÝÞÆÖáéíóúýþæö-]+$/.test(stakKey) && kt2.length === 10) {
        ctx.waitUntil(grantReportD1(env, kt2, stakKey));   // F4: skýrslu-grant → D1
      }
    } catch (e) {}
  }
  return new Response('ok', { status: 200 });
}

export async function subCancelHandler(request, env, ctx) {
  if (!env.ASKELL_PRIVATE_KEY) return sjson({ error: 'unconfigured' });
  const uid = await karpUserId(request, env);
  if (!uid) return sjson({ error: 'login' });
  let body = {}; try { body = await request.json(); } catch (e) {}
  const svc = ['utbod', 'frettir', 'fasteign', 'thingskyrslur', 'kvoti', 'leikur'].indexOf(String(body.service || '')) >= 0 ? String(body.service) : '';   // 'leikur' = leikstjóra-leyfi (uppsögn um sama samningsfarveg)
  const H = { 'Authorization': 'Api-Key ' + env.ASKELL_PRIVATE_KEY, 'Content-Type': 'application/json' };
  // Segir upp EINUM Áskell-samningi: v2 cancel_at_period_end (aðgangur helst út greitt tímabil), legacy til vara.
  const cancelById = async (id) => {
    let r = await fetch('https://askell.is/api/v2/subscription-contracts/' + encodeURIComponent(id) + '/cancel/', { method: 'POST', headers: H, body: JSON.stringify({ cancel_at_period_end: true }) });
    if (!r.ok) r = await fetch('https://askell.is/api/subscriptions/' + encodeURIComponent(id) + '/cancel/', { method: 'POST', headers: H });
    return r.ok;
  };
  try {
    // F4: askell_id + kt + vara úr D1 (ekki WP /sub/cancelinfo).
    const urow = env.TENGSL ? await env.TENGSL.prepare('SELECT kt, tier, tier_askell FROM users WHERE id=?').bind(uid).first().catch(() => null) : null;
    const kt = String((urow && urow.kt) || '').replace(/\D/g, '');
    let aid = '', slug = '';
    if (svc) {
      const srow = env.TENGSL ? await env.TENGSL.prepare('SELECT askell_id FROM sub_service WHERE user_id=? AND service=?').bind(uid, svc).first().catch(() => null) : null;
      aid = (srow && srow.askell_id) || '';
      slug = svc;
    } else {
      aid = (urow && urow.tier_askell) || '';
      slug = String((urow && urow.tier) || '').toLowerCase();
    }
    // 1) Fljótleið: vistað contract-id → reyna beint (frettir/fasteign/þrep um sub2 lenda hér).
    if (aid && await cancelById(aid)) return sjson({ ok: true, cancelled: true });
    // 2) askellId vantar EÐA er úrelt → fletta upp VIRKUM samningi kaupanda í Áskell (kt + vara) og segja upp.
    //    Rót: WP-vistaða id-ið er aðeins flýtileið sem getur rekið sig frá Áskell — t.d. útboð veitt um
    //    /sub/trial (aldrei _askell) eða id sem bendir á hreinsaðan/afskráðan samning. Áskell = sannleikur.
    if (kt.length === 10 && slug) {
      const resp = await fetch('https://askell.is/api/v2/subscription-contracts/?page_size=100', { headers: H }).catch(() => null);
      if (resp && resp.ok) {
        const lst = await resp.json().catch(() => null);
        const contracts = Array.isArray(lst) ? lst : ((lst && lst.results) || []);
        const match = contracts.filter((c) => String(c.customer_reference || '').replace(/\D/g, '') === kt
          && !/cancel/i.test(String(c.state || '')) && (c.items || []).some((i) => String(i.product_reference || '') === slug));
        let any = false;
        for (const c of match) { if (c && c.id && await cancelById(c.id)) any = true; }
        if (any) return sjson({ ok: true, cancelled: true });
        // Enginn virkur rukkandi samningur til → fríprófun/ó-rukkandi áskrift: ekkert að stöðva í Áskell.
        // Aðgangur rennur samt út á `until` (WP) og ENGIN frekari gjöld verða innheimt → uppsögn telst tókst.
        if (match.length === 0) return sjson({ ok: true, cancelled: false, note: 'no-billing' });
        return sjson({ error: 'askell' });   // fann samning en cancel mistókst → láta notanda reyna aftur
      }
      // Áskell-listun mistókst (staða óstaðfest) → EKKI fullyrða uppsögn; leyfa endurtilraun.
    }
    if (!aid) return sjson({ error: 'noid' });   // hvorki id, kt né vara → getum ekkert gert
    return sjson({ error: 'askell' });
  } catch (e) { return sjson({ error: 'upstream' }); }
}

async function askellPriceId(env, ctx, prodRef, recurring) {
  const cache = caches.default;
  const ck = new Request('https://cache.karp.internal/askell-price?ref=' + encodeURIComponent(prodRef) + (recurring ? '&rec=1' : ''));
  const hit = await cache.match(ck);
  if (hit) { try { const j = await hit.json(); if (j.id) return j.id; } catch (e) {} }
  const H = { 'Authorization': 'Api-Key ' + env.ASKELL_PRIVATE_KEY, 'Accept': 'application/json' };
  const lesa = (d) => (Array.isArray(d) ? d : (d && (d.results || d.options || d.items || d.data)) || []);
  try {
    const [prodsR, pricesR] = await Promise.all([
      fetch('https://askell.is/api/v2/catalog/products/?active=all', { headers: H }).then((r) => r.json()).catch(() => null),
      fetch('https://askell.is/api/v2/catalog/prices/?active=all', { headers: H }).then((r) => r.json()).catch(() => null),
    ]);
    const prods = lesa(prodsR), prices = lesa(pricesR);
    const refOf = (p) => String(p.reference || p.ref || p.sku || '');
    const idOf = (p) => (p.id != null ? p.id : (p.pk != null ? p.pk : (p.uuid || p.token || null)));
    // product-tengill verðs getur verið heiltala, "12", DRF-hyperlink ".../products/12/", hlutur — eða
    // tilvísunin sjálf; verðið getur líka borið eigin reference. Prófa allt (snið óskjalfest).
    const linkId = (v) => {
      if (v == null) return null;
      if (typeof v === 'object') return idOf(v);
      const s = String(v), m = s.match(/\/(\d+)\/?$/);
      return m ? m[1] : s;
    };
    const prodIds = new Set(prods.filter((p) => refOf(p) === prodRef).map(idOf).filter((x) => x != null).map(String));
    let best = null;
    for (const pr of prices) {
      if (pr.active === false) continue;
      // RAUN-SNIÐ Áskell V2 (staðfest 11.7): verð ber product_reference + product_id beint
      const pid = pr.product_id != null ? pr.product_id : linkId(pr.product);
      const pref = String(pr.product_reference || ((pr.product && typeof pr.product === 'object') ? refOf(pr.product) : ''));
      const match = pref === prodRef || (pid != null && prodIds.has(String(pid))) ||
        String(pr.product || '') === prodRef || refOf(pr) === prodRef;
      if (!match) continue;
      const vil = recurring ? 'recurring' : 'one_time';
      if (!best || String(pr.billing_type || '') === vil) best = pr;   // óskað snið í forgangi
    }
    const id = best ? idOf(best) : null;
    if (id != null) ctx.waitUntil(cache.put(ck, new Response(JSON.stringify({ id }), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' } })));
    return id;
  } catch (e) { return null; }
}

export async function askellSessionHandler(request, env, ctx) {
  if (!env.ASKELL_PRIVATE_KEY) return sjson({ error: 'unconfigured' });
  const u = new URL(request.url);
  const TIERS = { grunnur: 'ASKELL_CHANNEL_GRUNNUR', fyrirtaeki: 'ASKELL_CHANNEL_FYRIRTAEKI', fyrirtaeki_plus: 'ASKELL_CHANNEL_FYRIRTAEKI_PLUS' };
  const SVCS = { utbod: 'ASKELL_CHANNEL_UTBOD', frettir: 'ASKELL_CHANNEL_FRETTIR', fasteign: 'ASKELL_CHANNEL_FASTEIGN', thingskyrslur: 'ASKELL_CHANNEL_THINGSKYRSLUR', kvoti: 'ASKELL_CHANNEL_KVOTI' };   // sérlausnir: Útboð 1.900, Umfjöllun/frettir 3.900, Fasteignir 3.900, Þingmannaskýrslur 3.900, Kvótavaktin 9.900 (premium)
  const svc = SVCS[u.searchParams.get('service')] ? u.searchParams.get('service') : '';
  const tier = TIERS[u.searchParams.get('tier')] ? u.searchParams.get('tier') : 'grunnur';
  const kt = String(u.searchParams.get('kt') || '').replace(/\D/g, '');
  // Stök skýrsla (einskiptisvara um Áskell): ?stak=fyrirtaeki:kt|eigendur:kt|areidanleiki:kt|fasteign:addr
  // → sölurás per tegund (sjálfgildi = vöru-tilvísanir Arons í Áskell 11.7.2026), metadata {service:'stak', key}
  // → vefkrókur veitir um /reports/grant. Env-secret yfirskrifar sjálfgildið ef rásar-slug er annað.
  const STAKS = {
    fyrirtaeki: ['ASKELL_CHANNEL_STAK_FYRIRTAEKI', 'fyrirtaeki_skyrsla'],
    eigendur: ['ASKELL_CHANNEL_STAK_EIGENDUR', 'eigendur_skyrsla'],
    areidanleiki: ['ASKELL_CHANNEL_STAK_AREIDANLEIKI', 'areidanleiki'],
    fasteign: ['ASKELL_CHANNEL_STAK_FASTEIGN', 'fasteigna_skyrsla'],
    thingmadur: ['ASKELL_CHANNEL_STAK_THINGMADUR', 'thingmanna_skyrsla'],
  };
  const stak = String(u.searchParams.get('stak') || '').slice(0, 90);
  const stakKind = (stak.match(/^(fyrirtaeki|eigendur|areidanleiki|fasteign|thingmadur):.+/) || [])[1] || '';
  if (stak && !stakKind) return sjson({ error: 'stak' });
  const channel = stakKind ? (env[STAKS[stakKind][0]] || env.ASKELL_CHANNEL_STAK || STAKS[stakKind][1])
    : (svc ? (env[SVCS[svc]] || svc) : (env[TIERS[tier]] || tier));   // sjálfgefið = slug → aðeins ASKELL_PRIVATE_KEY skylt
  const stakOk = !!stakKind;
  // Einskiptisvara VERÐUR að fylgja session-inum sem initial_items (rásin ein býður ekkert tilboð —
  // „Ekkert tilboð er tiltækt í þessu kaupferli"). Verð-ID flett upp í V2-katalógnum eftir vöru-tilvísun.
  let stakPrice = null;
  if (stakOk) {
    stakPrice = await askellPriceId(env, ctx, STAKS[stakKind][1]);
    if (!stakPrice) return sjson({ error: 'noprice', ref: STAKS[stakKind][1] });
  }
  // PRUFUVÖRN: áskrift (svc/þrep) — stök skýrsla (stakOk) hefur ekkert frípróf, sleppt. Endurtekið
  // frípróf → án-frípróf rás ef stillt, annars blokka. Auðkennt per user-id (kt-skipti duga ekki).
  let useChannel = channel;
  if (!stakOk) {
    const uid = await karpUserId(request, env);
    const kind = svc ? 'svc' : 'tier';
    const slug = svc || tier;
    if (uid && await trialUsedFor(env, uid, kind, slug)) {
      const nt = notrialChannel(env, slug);
      if (!nt) return sjson({ error: 'trial_used' });
      useChannel = nt;
    }
  }
  const body = { sales_channel: useChannel, expires_in_seconds: 1800, metadata: stakOk ? { service: 'stak', key: stak } : (svc ? { service: svc } : { tier }) };   // metadata → vefkrókur veit hvað var keypt
  if (stakPrice) body.initial_items = [{ price: stakPrice, quantity: 1 }];   // einskiptisvaran sjálf → tilboð birtist í kaupferlinu
  if (kt.length === 10) body.customer_reference = kt;   // bindur áskriftina við kt → vefkrókur skilar því → grant
  try {
    const r = await fetch('https://askell.is/api/v2/checkout-sessions/', {
      method: 'POST',
      headers: { 'Authorization': 'Api-Key ' + env.ASKELL_PRIVATE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d || !d.token) return sjson({ error: 'askell', status: r.status });
    return sjson({ token: d.token, expires_at: d.expires_at || null, tier: svc || tier });
  } catch (e) { return sjson({ error: 'upstream' }); }
}

const STAK_VERD = { fyrirtaeki: ['Fyrirtækjaskýrsla', 990], eigendur: ['Eigendaskýrsla', 990], areidanleiki: ['Áreiðanleikamat', 990], fasteign: ['Fasteignaskýrsla (verðmat)', 990], thingmadur: ['Þingmannaskýrsla', 990] };

async function askellProcessorId(env, ctx) {
  const cache = caches.default;
  const ck = new Request('https://cache.karp.internal/askell-procid');
  const hit = await cache.match(ck);
  if (hit) { try { const j = await hit.json(); if (j.id != null) return j.id; } catch (e) {} }
  try {
    const r = await fetch('https://askell.is/api/checkouts/paymentprocessors/', { headers: { 'Authorization': 'Api-Key ' + env.ASKELL_PRIVATE_KEY } });
    const d = await r.json().catch(() => null);
    const list = (d && (d.payment_processors || d.results)) || (Array.isArray(d) ? d : []);
    const p = list.find((x) => x.supports_checkout && (x.allowed_currencies || []).indexOf('ISK') >= 0) || list.find((x) => x.supports_checkout);
    if (p && p.id != null) {
      ctx.waitUntil(cache.put(ck, new Response(JSON.stringify({ id: p.id }), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' } })));
      return p.id;
    }
  } catch (e) {}
  return null;
}

export async function stakCheckoutHandler(request, env, ctx) {
  // ⚠ ASKELL_PUBLIC_KEY er SKYLDA: eina örugga „kort komið"-merkið er GET /api/checkouts/{token}/
  // (status=tokencreated) sem krefst public-lykilsins — án hans myndum við rukka blint (sannað 11.7:
  // paymentmethod-attach TEKST á fersku checkout-i áður en kort er slegið inn). Án lykils → Teya.
  if (!env.ASKELL_PRIVATE_KEY || !env.ASKELL_PUBLIC_KEY) return sjson({ error: 'unconfigured' });
  const H = { 'Authorization': 'Api-Key ' + env.ASKELL_PRIVATE_KEY, 'Content-Type': 'application/json' };
  if (request.method !== 'POST') {   // létt könnun framendans áður en kt-form birtist
    const pid = await askellProcessorId(env, ctx);
    return sjson(pid != null ? { ok: 1 } : { error: 'noprocessor' });
  }
  const uid = await karpUserId(request, env);   // peninga-endapunktur: innskráning skylda (rýni-atriði #3)
  if (!uid) return sjson({ error: 'login' });
  const b = await request.json().catch(() => null);
  const key = String((b && b.key) || '').slice(0, 90);
  const kind = (key.match(/^(fyrirtaeki|eigendur|areidanleiki|fasteign|thingmadur):.+/) || [])[1] || '';
  const kt = String((b && b.kt) || '').replace(/\D/g, '');
  if (!kind || kt.length !== 10) return sjson({ error: 'input' });
  const pid = await askellProcessorId(env, ctx);
  if (pid == null) return sjson({ error: 'noprocessor' });
  const nafn = String((b && b.nafn) || '').trim().slice(0, 80) || 'Karp notandi';
  const bil = nafn.lastIndexOf(' ');
  const email = String((b && b.email) || '').trim().slice(0, 120);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return sjson({ error: 'email' });   // Áskell krefst netfangs (kvittun)
  try {
    // viðskiptavinur verður að vera til áður en kort er tengt — stofna; 400 er aðeins í lagi ef hann
    // ER til (annars endar kaupandinn í eilífu 'waiting' eftir kortainnslátt — rýni-atriði #6)
    const cr = await fetch('https://askell.is/api/customers/', {
      method: 'POST', headers: H,
      body: JSON.stringify({ first_name: bil > 0 ? nafn.slice(0, bil) : nafn, last_name: bil > 0 ? nafn.slice(bil + 1) : '-', email, customer_reference: kt }),
    });
    if (!cr.ok) {
      const til = await fetch('https://askell.is/api/customers/' + encodeURIComponent(kt) + '/', { headers: H });
      if (!til.ok) return sjson({ error: 'customer' });
    }
    const r = await fetch('https://askell.is/api/checkouts/', {
      method: 'POST', headers: H,
      body: JSON.stringify({ payment_processor: pid, currency: 'ISK', capture_only: true, allowed_origin: 'https://karp.is' }),
    });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d || !d.checkout_url || !d.token) return sjson({ error: 'askell', status: r.status });
    return sjson({ token: d.token, checkout_url: d.checkout_url });
  } catch (e) { return sjson({ error: 'upstream' }); }
}

export async function stakConfirmHandler(request, env, ctx) {
  if (!env.ASKELL_PRIVATE_KEY || !env.ASKELL_PUBLIC_KEY || request.method !== 'POST') return sjson({ error: 'unconfigured' });
  const uid = await karpUserId(request, env);   // peninga-endapunktur: innskráning skylda (rýni-atriði #3)
  if (!uid) return sjson({ error: 'login' });
  const H = { 'Authorization': 'Api-Key ' + env.ASKELL_PRIVATE_KEY, 'Content-Type': 'application/json' };
  const b = await request.json().catch(() => null);
  const key = String((b && b.key) || '').slice(0, 90);
  const kind = (key.match(/^(fyrirtaeki|eigendur|areidanleiki|fasteign|thingmadur):.+/) || [])[1] || '';
  const kt = String((b && b.kt) || '').replace(/\D/g, '');
  const tok = String((b && b.token) || '').replace(/[^a-f0-9]/gi, '').slice(0, 64);
  if (!kind || kt.length !== 10 || tok.length < 20) return sjson({ error: 'input' });
  const cache = caches.default;
  const ck = new Request('https://cache.karp.internal/askell-stakpay?tok=' + tok);
  // reference = lykill + KAUPANDA-kt → einkvæmt per (skýrsla, kaupandi) og STÖÐUGT þvert á
  // endurtilraunir/ný checkout → tvírukkunar-vörn þótt edge-cache gleymist (rýni-atriði #2).
  // Vefkrókur klippir '|…' af fyrir grant-lykilinn.
  const refStr = key + '|' + kt;
  const granted = async (uuid) => {   // F7: grant→D1 (leysir WP af hólmi) á INNSKRÁÐA kaupandann (uid) — account-resolved (Task 5), idempotent á user+key.
    if (env.TENGSL && uid) { const auid = await _acctOfUid(env, uid); await env.TENGSL.prepare('INSERT OR IGNORE INTO reports_granted (user_id, report_key, granted) VALUES (?,?,?)').bind(auid, key, Math.floor(Date.now() / 1000)).run().catch(() => {}); }
  };
  // BLOCKER-vörn (rýni-atriði #1): grant-lykillinn er lesinn úr GREIÐSLUNNI sjálfri (reference) og
  // verður að passa við key/kt beiðninnar — annars gæti ein greidd skýrsla „opnað" allar hinar.
  const stada = async (uuid) => {
    const r = await fetch('https://askell.is/api/payments/' + uuid + '/', { headers: H });
    const d = await r.json().catch(() => null);
    const st = String((d && d.state) || 'pending');
    if (st === 'settled') {
      const greiddurLykill = String((d && d.reference) || '').split('|')[0];
      const greiddKt = String((d && d.customer_reference) || '').replace(/\D/g, '');
      if (greiddurLykill !== key || (greiddKt && greiddKt !== kt)) return sjson({ error: 'mismatch' });
      await granted(uuid);
      return sjson({ state: 'settled' });
    }
    return sjson({ state: st === 'failed' ? 'failed' : 'pending' });
  };
  try {
    const hit = await cache.match(ck);
    if (hit) {   // greiðsla þegar stofnuð → aðeins staða + grant þegar settled
      const j = await hit.json().catch(() => null);
      if (j && j.uuid) return stada(String(j.uuid));
    }
    // ⚠ EINA örugga „kort komið"-merkið: staða checkout-sins sjálfs (krefst PUBLIC-lykils).
    // paymentmethod-attach tekst nefnilega STRAX á fersku checkout-i (sannað 11.7) → blind rukkun bönnuð.
    const cs = await fetch('https://askell.is/api/checkouts/' + tok + '/', { headers: { 'Authorization': 'Api-Key ' + env.ASKELL_PUBLIC_KEY } });
    const cd = await cs.json().catch(() => null);
    const cst = String((cd && cd.status) || '');
    if (cst !== 'tokencreated') {
      if (/error|fail|cancel|expire/i.test(cst)) return sjson({ state: 'failed' });
      return sjson({ state: 'waiting' });
    }
    // kort komið → en FYRST: er lifandi greiðsla þegar til fyrir (skýrslu, kaupanda)? — misheppnaðar
    // greiðslur (hafnað kort) mega EKKI stífla nýja tilraun → aðeins non-failed telja
    const pl = await fetch('https://askell.is/api/payments/?page_size=100', { headers: H }).then((r) => r.json()).catch(() => null);
    const fyrri = ((Array.isArray(pl) ? pl : (pl && pl.results) || []).find((x) => String(x.reference || '') === refStr && !/fail/i.test(String(x.state || ''))));
    if (fyrri && (fyrri.uuid || fyrri.id)) {
      const u0 = String(fyrri.uuid || fyrri.id);
      ctx.waitUntil(cache.put(ck, new Response(JSON.stringify({ uuid: u0 }), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=7200' } })));
      return stada(u0);
    }
    const at = await fetch('https://askell.is/api/customers/paymentmethod/', { method: 'POST', headers: H, body: JSON.stringify({ customer_reference: kt, token: tok }) });
    if (!at.ok) return sjson({ state: 'waiting' });
    const [heiti, verd] = STAK_VERD[kind];
    const pr = await fetch('https://askell.is/api/payments/', {
      method: 'POST', headers: H,
      body: JSON.stringify({ customer_reference: kt, amount: String(verd), currency: 'ISK', description: heiti + ' — karp.is', reference: refStr }),
    });
    const pd = await pr.json().catch(() => null);
    const uuid = pd && (pd.uuid || pd.id);
    if (!pr.ok || !uuid) return sjson({ error: 'payment', status: pr.status });
    await cache.put(ck, new Response(JSON.stringify({ uuid: String(uuid) }), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=7200' } }));
    const st = String((pd && pd.state) || 'pending');
    if (st === 'settled') { await granted(String(uuid)); return sjson({ state: 'settled' }); }
    return sjson({ state: 'pending' });
  } catch (e) { return sjson({ error: 'upstream' }); }
}

const SUB2_SLUGS = { grunnur: 'tier', fyrirtaeki: 'tier', fyrirtaeki_plus: 'tier', utbod: 'svc', frettir: 'svc', fasteign: 'svc', thingskyrslur: 'svc', kvoti: 'svc' };

export async function sub2CheckoutHandler(request, env, ctx) {
  if (!env.ASKELL_PRIVATE_KEY || !env.ASKELL_PUBLIC_KEY) return sjson({ error: 'unconfigured' });
  const H = { 'Authorization': 'Api-Key ' + env.ASKELL_PRIVATE_KEY, 'Content-Type': 'application/json' };
  if (request.method !== 'POST') { const pid = await askellProcessorId(env, ctx); return sjson(pid != null ? { ok: 1 } : { error: 'noprocessor' }); }
  const uid = await karpUserId(request, env);
  if (!uid) return sjson({ error: 'login' });
  const b = await request.json().catch(() => null);
  const slug = String((b && b.slug) || '').toLowerCase();
  if (!SUB2_SLUGS[slug]) return sjson({ error: 'input' });
  const kt = String((b && b.kt) || '').replace(/\D/g, '');
  if (kt.length !== 10) return sjson({ error: 'input' });
  // PRUFUVÖRN: endurtekið frípróf blokkað (server-hlið, per user-id). sub2 notar endurtekið VERÐ
  // (frípróf á Áskell-áætluninni) → engin sjálfvirk án-frípróf leið hér, svo blokka. Endurkomu-payer:
  // hafðu samband (eða Aron útbýr án-frípróf verð síðar). uid er auðkennt að ofan.
  if (await trialUsedFor(env, uid, SUB2_SLUGS[slug], slug)) return sjson({ error: 'trial_used' });
  const email = String((b && b.email) || '').trim().slice(0, 120);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return sjson({ error: 'email' });
  const nafn = String((b && b.nafn) || '').trim().slice(0, 80) || 'Karp notandi';
  const bil = nafn.lastIndexOf(' ');
  const pid = await askellProcessorId(env, ctx);
  if (pid == null) return sjson({ error: 'noprocessor' });
  const price = await askellPriceId(env, ctx, slug, true);   // endurtekna verðið — verður að finnast ÁÐUR en kort birtist
  if (!price) return sjson({ error: 'noprice', ref: slug });
  try {
    const cr = await fetch('https://askell.is/api/customers/', {
      method: 'POST', headers: H,
      body: JSON.stringify({ first_name: bil > 0 ? nafn.slice(0, bil) : nafn, last_name: bil > 0 ? nafn.slice(bil + 1) : '-', email, customer_reference: kt }),
    });
    if (!cr.ok) { const til = await fetch('https://askell.is/api/customers/' + encodeURIComponent(kt) + '/', { headers: H }); if (!til.ok) return sjson({ error: 'customer' }); }
    const r = await fetch('https://askell.is/api/checkouts/', {
      method: 'POST', headers: H,
      body: JSON.stringify({ payment_processor: pid, currency: 'ISK', capture_only: true, allowed_origin: 'https://karp.is' }),
    });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d || !d.checkout_url || !d.token) return sjson({ error: 'askell', status: r.status });
    return sjson({ token: d.token, checkout_url: d.checkout_url });
  } catch (e) { return sjson({ error: 'upstream' }); }
}

export async function sub2ConfirmHandler(request, env, ctx) {
  if (!env.ASKELL_PRIVATE_KEY || !env.ASKELL_PUBLIC_KEY || request.method !== 'POST') return sjson({ error: 'unconfigured' });
  const uid = await karpUserId(request, env);
  if (!uid) return sjson({ error: 'login' });
  const H = { 'Authorization': 'Api-Key ' + env.ASKELL_PRIVATE_KEY, 'Content-Type': 'application/json' };
  const b = await request.json().catch(() => null);
  const slug = String((b && b.slug) || '').toLowerCase();
  if (!SUB2_SLUGS[slug]) return sjson({ error: 'input' });
  const kt = String((b && b.kt) || '').replace(/\D/g, '');
  const tok = String((b && b.token) || '').replace(/[^a-f0-9]/gi, '').slice(0, 64);
  if (kt.length !== 10 || tok.length < 20) return sjson({ error: 'input' });
  const isTier = SUB2_SLUGS[slug] === 'tier';
  const cache = caches.default;
  const ck = new Request('https://cache.karp.internal/askell-sub2?tok=' + tok);
  const untilOf = (c) => {
    const s = c && (c.trial_end_at || c.billing_anchor_at || c.next_billing_at || c.current_period_end_at);
    const now = Math.floor(Date.now() / 1000);
    let u = s ? Math.floor(new Date(s).getTime() / 1000) : 0;
    if (!u || u < now) u = now + 32 * 86400;   // ef period-lok finnst ekki → mánuður frá núna (grant klárast)
    return u;
  };
  const virk = (st) => /active|trial|current/i.test(String(st || '')) && !/cancel|fail|expire|inactive/i.test(String(st || ''));
  const granted = async (cid, until) => {   // F7: grant STRAX á D1 (leysir WP af hólmi) á kaupanda-uid — idempotent. Buyer-scoped (fix): tier/sub_service = RAUN-kaupandinn, EKKI account-deilt.
    if (env.TENGSL && uid) {
      const now = Math.floor(Date.now() / 1000);
      if (isTier) await env.TENGSL.prepare('UPDATE users SET tier=?, tier_until=?, tier_askell=?, tier_trial_used=1, updated=? WHERE id=?').bind(slug, until, String(cid), now, +uid).run().catch(() => {});
      else await env.TENGSL.prepare('INSERT INTO sub_service (user_id, service, until, askell_id, trial_used) VALUES (?,?,?,?,1) ON CONFLICT(user_id, service) DO UPDATE SET until=excluded.until, askell_id=excluded.askell_id, trial_used=1').bind(+uid, slug, until, String(cid)).run().catch(() => {});
    }
  };
  const contractGet = async (cid) => { const g = await fetch('https://askell.is/api/v2/subscription-contracts/' + cid + '/', { headers: H }); return g.json().catch(() => null); };
  try {
    const hit = await cache.match(ck);
    if (hit) {   // samningur þegar stofnaður → aðeins staða + grant þegar virkur
      const j = await hit.json().catch(() => null);
      if (j && j.cid) { const c = await contractGet(j.cid); if (virk(c && c.state)) { await granted(j.cid, untilOf(c)); return sjson({ state: 'active' }); } return sjson({ state: 'pending' }); }
    }
    // kort komið? (checkout status = tokencreated, krefst public-lykils — annars blind virkjun)
    const cs = await fetch('https://askell.is/api/checkouts/' + tok + '/', { headers: { 'Authorization': 'Api-Key ' + env.ASKELL_PUBLIC_KEY } });
    const cd = await cs.json().catch(() => null);
    const cst = String((cd && cd.status) || '');
    if (cst !== 'tokencreated') { if (/error|fail|cancel|expire/i.test(cst)) return sjson({ state: 'failed' }); return sjson({ state: 'waiting' }); }
    const price = await askellPriceId(env, ctx, slug, true);
    if (!price) return sjson({ error: 'noprice' });
    // dedup: ó-afskráður samningur fyrir þennan kaupanda+vöru þegar til? → endurnýta (engin tvöföldun v/endurtilrauna)
    const lst = await fetch('https://askell.is/api/v2/subscription-contracts/?page_size=50', { headers: H }).then((r) => r.json()).catch(() => null);
    const contracts = Array.isArray(lst) ? lst : ((lst && lst.results) || []);
    let contract = contracts.find((c) => String(c.customer_reference || '').replace(/\D/g, '') === kt && !/cancel/i.test(String(c.state || '')) && (c.items || []).some((i) => String(i.product_reference || '') === slug)) || null;
    // tengja kort við viðskiptavin (nauðsynlegt fyrir rukkun þegar trial rennur út)
    const at = await fetch('https://askell.is/api/customers/paymentmethod/', { method: 'POST', headers: H, body: JSON.stringify({ customer_reference: kt, token: tok }) });
    if (!at.ok && !contract) return sjson({ state: 'waiting' });
    if (!contract) {   // stofna+virkja samning server-megin (widget kemur hvergi við)
      const body = { customer_reference: kt, items: [{ price }], state: 'active', metadata: { karp: (isTier ? 'tier:' : 'svc:') + slug, uid: String(uid) } };
      const cr = await fetch('https://askell.is/api/v2/subscription-contracts/', { method: 'POST', headers: H, body: JSON.stringify(body) });
      contract = await cr.json().catch(() => null);
      if (!cr.ok || !contract || !contract.id) return sjson({ error: 'contract', status: cr.status });
    }
    const cid = contract.id;
    await cache.put(ck, new Response(JSON.stringify({ cid }), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=7200' } }));
    if (!virk(contract.state)) {   // ekki virkur enn → reyna PATCH state active, lesa aftur
      const pc = await fetch('https://askell.is/api/v2/subscription-contracts/' + cid + '/', { method: 'PATCH', headers: H, body: JSON.stringify({ state: 'active' }) });
      const c2 = await pc.json().catch(() => null);
      if (c2 && c2.state) contract = c2; else { const c3 = await contractGet(cid); if (c3) contract = c3; }
    }
    if (virk(contract.state)) { await granted(cid, untilOf(contract)); return sjson({ state: 'active' }); }
    return sjson({ state: 'pending', contract_state: contract.state || null });   // sést í prófi ef virkjun tókst ekki
  } catch (e) { return sjson({ error: 'upstream' }); }
}

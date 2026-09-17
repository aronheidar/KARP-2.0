import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adminOverviewHandler } from './stjornbord.mjs';
import { PRICE_TIER, PRICE_SVC } from '../lib/fjarmal.mjs';

// ── Heildaryfirferð, atriði 5: verðtöflurnar eru á EINUM stað ────────────────────────────────────
// ⚠⚠ Töflurnar lágu í tveimur eintökum: fall-staðbundnar og óútfluttar í stjornbord.mjs og aftur í
//    ../lib/fjarmal.mjs. Gildin stemmdu, en prófið í fjarmal.test.mjs neglir Elínar-hliðina við
//    BÓKSTAFLEGAR tölur — ekki við stjórnborðið. Hækki einhver Fyrirtæki+ stjórnborðs-megin stendur
//    það próf grænt, Elín mælir gamla verðið, og misræmið sem hún á að finna verður að henni sjálfri.
//    `VIRK` fékk raunverulega hegðunarvörn (orðrétt sama regla og greidslur.mjs); þetta er hennar.
//
// ⚠ Prófið keyrir HANDLERINN sjálfan og les MRR-töluna sem stjórnborðið sýnir — það mælir því
//   útreikninginn, ekki innflutningslínuna. Væri taflan endurtekin staðbundið með öðru verði félli
//   það; væri hún flutt inn en aldrei notuð félli það líka.

/** D1-stubbur: svarar notenda- og áskriftarfyrirspurnunum, annað er tómt. Allir kallstaðir í
 *  adminOverviewHandler bera `.catch(...)`, svo tómt svar fellir ekki yfirlitið. */
function fakeDb(state) {
  const exec = (sql) => {
    if (/FROM users ORDER BY created DESC/.test(sql)) return { results: state.users };
    if (/FROM sub_service WHERE until>\?/.test(sql)) return { results: state.subs };
    return { results: [] };
  };
  return { prepare(sql) { const st = { bind() { return st; }, async first() { return null; }, async all() { return exec(sql); }, async run() { return {}; } }; return st; } };
}

const yfirlit = async (state) => {
  const env = { TENGSL: fakeDb(state), ADMIN_API_KEY: 'adm-key' };
  const r = await adminOverviewHandler(new Request('https://karp.is/api/admin/overview', { headers: { 'X-Admin-Key': 'adm-key' } }), env);
  return (await r.json());
};
const notandi = (id, tier, now) => ({
  id, email: 'n' + id + '@x.is', username: 'n' + id, name: '', is_admin: 0, email_verified: 1,
  kt: String(1000000000 + id), tier, tier_until: tier ? now + 30 * 86400 : null, created: now - 86400,
  free_access: 0, nemandi: 0,
});

test('MRR stjórnborðsins er reiknað úr SÖMU töflu og Elín mælir við — engin önnur tala til', async () => {
  const now = Math.floor(Date.now() / 1000);
  const j = await yfirlit({
    users: [notandi(1, 'fyrirtaeki_plus', now), notandi(2, 'grunnur', now)],
    subs: [{ user_id: 1, service: 'kvoti', until: now + 30 * 86400, askell_id: null }],
  });
  assert.equal(j.ok, true);
  assert.equal(
    j.stats.mrr,
    PRICE_TIER.fyrirtaeki_plus + PRICE_TIER.grunnur + PRICE_SVC.kvoti,
    'talan á stjórnborðinu VERÐUR að koma úr ../lib/fjarmal.mjs — tvö eintök reka sig alltaf í sundur',
  );
});

test('hvert einasta þrep og hver einasta þjónusta er verðlögð úr sameiginlegu töflunni', async () => {
  // ⚠ Ein vara ein og sér sannar ekkert um hinar: staðbundin tafla með EINU röngu verði slyppi þá í
  //   gegn. Hér er hvert gildi beggja taflna mælt sérstaklega gegn handlernum sjálfum.
  const now = Math.floor(Date.now() / 1000);
  for (const [tier, verd] of Object.entries(PRICE_TIER)) {
    const j = await yfirlit({ users: [notandi(1, tier, now)], subs: [] });
    assert.equal(j.stats.mrr, verd, 'þrep ' + tier);
  }
  for (const [svc, verd] of Object.entries(PRICE_SVC)) {
    const j = await yfirlit({ users: [], subs: [{ user_id: 1, service: svc, until: now + 86400, askell_id: null }] });
    assert.equal(j.stats.mrr, verd, 'þjónusta ' + svc);
  }
});

test('stjornbord.mjs lýsir ENGRI eigin verðtöflu yfir — uppsprettan er ein, ekki samstillt', () => {
  // ⚠ Hegðunarprófin að ofan falla um leið og staðbundin tafla ber ANNAÐ verð, en þau standa græn ef
  //   einhver afritar töfluna aftur inn með RÉTTU verði. Þá er drift-gildran komin aftur, þögul, og
  //   bíður næstu verðbreytingar. Þessi lína lokar henni: taflan má aðeins koma að láni.
  const t = readFileSync(new URL('./stjornbord.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(t, /^\s*(?:export\s+)?(?:const|let|var)\s+PRICE_(?:SVC|TIER)\s*=/m,
    'PRICE_SVC/PRICE_TIER eiga að vera FLUTT INN úr ../lib/fjarmal.mjs, ekki lýst yfir hér');
  assert.match(t, /import\s*\{[^}]*PRICE_(?:SVC|TIER)[^}]*\}\s*from\s*'\.\.\/lib\/fjarmal\.mjs'/,
    'og innflutningurinn á að koma úr einingunni sem Elín mælir við');
});

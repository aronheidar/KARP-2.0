// rsk-kvoti.test.mjs — EINA reglan sem greinir tvö ólík 403 frá Azure APIM.
//
// Af hverju skiptir hún máli: staðan ein er SÖM í báðum tilvikum. Sá sem ályktar af
// stöðunni einni ruglar saman „þetta félag er lokað" (eðlilegt, sleppa því) og
// „kvótinn er uppurinn" (ekkert var mælt, hver ályktun af svarinu er ósannindi).
// Prófin hér festa að bolurinn — og AÐEINS bolurinn — skeri úr.
import { test } from 'node:test';
import assert from 'node:assert';
import { erKvotaSvar } from './rsk-kvoti.mjs';

// Raunmælt svar 17.9.2026 (orðrétt úr api.skattur.cloud).
const KVOTABOLUR = '{"statusCode":403,"message":"Out of call volume quota. Quota will be replenished in 14.07:13:56."}';
// Raunlegt 403 fyrir lokað lögform (Z3 og skyld form eru ekki aðgengileg um opna APIð).
const LOKAD_LOGFORM = '{"statusCode":403,"message":"Legal form Z3 is not accessible via the Public Api."}';

test('kvóta-403 þekkist af svarbolnum', () => {
  assert.equal(erKvotaSvar(403, KVOTABOLUR), true);
});

test('lokað lögform með 403 er EKKI kvóti', () => {
  assert.equal(erKvotaSvar(403, LOKAD_LOGFORM), false,
    'lokað lögform má ALDREI lesast sem kvóti — þá stöðvast nóttin á eðlilegu svari');
});

test('403 með tómum eða ólesanlegum bol er EKKI kvóti', () => {
  assert.equal(erKvotaSvar(403, ''), false);
  assert.equal(erKvotaSvar(403, null), false);
  assert.equal(erKvotaSvar(403, undefined), false);
  assert.equal(erKvotaSvar(403, '<html>forbidden</html>'), false);
});

test('staðan ein dugar ekki — kvótatexti á annarri stöðu er ekki kvóta-403', () => {
  // 429 er hraðatakmörkun og á að meðhöndlast sem „reyna aftur", ekki sem uppurinn kvóti.
  assert.equal(erKvotaSvar(429, KVOTABOLUR), false);
  assert.equal(erKvotaSvar(200, KVOTABOLUR), false);
  assert.equal(erKvotaSvar(404, KVOTABOLUR), false);
});

test('þolir strengstöðu og hástafabreytileika í bolnum', () => {
  assert.equal(erKvotaSvar('403', KVOTABOLUR), true);
  assert.equal(erKvotaSvar(403, 'OUT OF CALL VOLUME QUOTA'), true);
});
